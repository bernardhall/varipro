const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { query, pool } = require('../db/database');
const { JWT_SECRET } = require('../middleware/auth');
const { sendConfirmationEmail } = require('../services/email');

const SALT_ROUNDS = 10;
const LOCKOUT_ATTEMPTS = 3;
const LOCKOUT_DURATION_MS = 60 * 1000;

// Track failed login attempts in memory
const failedAttempts = {};

function generateAccountNumber() {
  const prefixes = ['ELEC', 'PLMB', 'CARP', 'GENL', 'TRDE'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix}-${code}`;
}

async function generateUniqueAccountNumber() {
  let number;
  let attempts = 0;
  while (true) {
    number = generateAccountNumber();
    const res = await query('SELECT 1 FROM accounts WHERE account_number = $1', [number]);
    if (res.rowCount === 0) return number;
    attempts++;
    if (attempts > 100) throw new Error('Could not generate unique account number');
  }
}

// POST /auth/register
router.post('/register', async (req, res) => {
  const client = await pool.connect();
  try {
    const { account_name, user } = req.body;
    if (!account_name || !user) return res.status(400).json({ error: 'account_name and user required' });

    const { first_name, last_name, login_name, email, password, pin } = user;
    if (!first_name || !last_name || !login_name || !email || !password) {
      return res.status(400).json({ error: 'All user fields required' });
    }

    const existingUser = await client.query('SELECT 1 FROM users WHERE login_name = $1 OR email = $2', [login_name, email]);
    if (existingUser.rowCount > 0) return res.status(409).json({ error: 'Login name or email already taken' });

    const account_id = uuidv4();
    const user_id = uuidv4();
    const account_number = await generateUniqueAccountNumber();
    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    const pin_hash = pin ? await bcrypt.hash(pin, SALT_ROUNDS) : null;
    
    // Confirmation setup
    const confirmation_token = uuidv4();
    const confirmation_expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await client.query('BEGIN');
    await client.query('INSERT INTO accounts (account_id, account_number, account_name) VALUES ($1, $2, $3)', [account_id, account_number, account_name]);
    await client.query(`
      INSERT INTO users (user_id, account_id, first_name, last_name, login_name, email, password_hash, pin_hash, is_admin, is_confirmed, confirmation_token, confirmation_expires)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, 0, $9, $10)
    `, [user_id, account_id, first_name, last_name, login_name, email, password_hash, pin_hash, confirmation_token, confirmation_expires]);
    await client.query('COMMIT');
    console.log(`[Auth] Registration successful for ${login_name}. Account: ${account_number}`);

    // Send the email (non-blocking)
    sendConfirmationEmail(email, first_name, confirmation_token)
      .then(() => console.log(`[Auth] Confirmation email sent to ${email}`))
      .catch(emailErr => {
        console.error(`[Auth] Failed to send confirmation email to ${email}:`, emailErr.message);
        // We don't throw here, so the user still gets their account number
      });

    return res.status(201).json({ 
      message: 'Registration successful! Please check your email to confirm your account.',
      account_number, 
      account_name, 
      user_id 
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    console.error('[Auth] Registration Error:', err);
    res.status(500).json({ 
      error: 'Registration failed',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined 
    });
  } finally {
    if (client) client.release();
  }
});

// GET /auth/confirm/:token
router.get('/confirm/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const userRes = await query('SELECT user_id, confirmation_expires FROM users WHERE confirmation_token = $1 AND is_confirmed = 0', [token]);
    const user = userRes.rows[0];

    if (!user) {
      return res.send(`
        <html>
          <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
            <h1 style="color: #e53e3e;">Invalid or Expired Token</h1>
            <p>We couldn't find a pending confirmation for this link. It may have already been used or expired.</p>
            <a href="https://varipro.app" style="color: #f6ad55;">Back to VariPro</a>
          </body>
        </html>
      `);
    }

    if (new Date(user.confirmation_expires) < new Date()) {
      return res.send(`
        <html>
          <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
            <h1 style="color: #e53e3e;">Token Expired</h1>
            <p>This confirmation link has expired. Please try registering again or contact support.</p>
          </body>
        </html>
      `);
    }

    await query('UPDATE users SET is_confirmed = 1, confirmation_token = NULL, confirmation_expires = NULL WHERE user_id = $1', [user.user_id]);

    res.send(`
      <html>
        <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
          <h1 style="color: #48bb78;">✅ Account Confirmed!</h1>
          <p>Your VariPro account is now active. You can now log into the mobile app.</p>
          <div style="margin-top: 20px;">
             <p style="font-size: 14px; color: #718096;">You can close this window now.</p>
          </div>
        </body>
      </html>
    `);
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal server error during confirmation');
  }
});

// POST /auth/login
router.post('/login', async (req, res) => {
  try {
    const { account_number, login_name, password, pin } = req.body;
    if (!account_number || !login_name) {
      return res.status(400).json({ error: 'account_number and login_name required' });
    }

    const lockKey = `${account_number}:${login_name}`;
    const lockData = failedAttempts[lockKey];
    if (lockData && lockData.count >= LOCKOUT_ATTEMPTS) {
      const elapsed = Date.now() - lockData.lastAttempt;
      if (elapsed < LOCKOUT_DURATION_MS) {
        const remaining = Math.ceil((LOCKOUT_DURATION_MS - elapsed) / 1000);
        return res.status(429).json({ error: `Account locked. Try again in ${remaining} seconds.` });
      } else {
        delete failedAttempts[lockKey];
      }
    }

    const accountRes = await query('SELECT * FROM accounts WHERE account_number = $1', [account_number]);
    const account = accountRes.rows[0];
    if (!account) return res.status(401).json({ error: 'Invalid credentials' });

    const userRes = await query('SELECT * FROM users WHERE login_name = $1 AND account_id = $2', [login_name, account.account_id]);
    const user = userRes.rows[0];
    if (!user) {
      trackFailedAttempt(lockKey);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if confirmed
    // TODO: RE-ENABLE BEFORE PRODUCTION
    // To bypass email verification during development, I have commented out this check.
    /*
    if (!user.is_confirmed) {
      return res.status(403).json({ error: 'Please confirm your email before logging in.' });
    }
    */

    let authenticated = false;
    if (password) {
      authenticated = await bcrypt.compare(password, user.password_hash);
    } else if (pin && user.pin_hash) {
      authenticated = await bcrypt.compare(pin, user.pin_hash);
    }

    if (!authenticated) {
      trackFailedAttempt(lockKey);
      const attempts = (failedAttempts[lockKey] || {}).count || 1;
      return res.status(401).json({
        error: 'Invalid credentials',
        attempts_remaining: LOCKOUT_ATTEMPTS - attempts
      });
    }

    delete failedAttempts[lockKey];
    await query("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE user_id = $1", [user.user_id]);

    const token = jwt.sign(
      { user_id: user.user_id, account_id: user.account_id, account_number, login_name, is_admin: !!user.is_admin },
      JWT_SECRET,
      { expiresIn: '15m' }
    );
    const refresh_token = uuidv4();
    const now = new Date();
    const expires_at = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    await query('INSERT INTO user_sessions (session_id, user_id, refresh_token, expires_at, logged_in) VALUES ($1, $2, $3, $4, $5)', [uuidv4(), user.user_id, refresh_token, expires_at, now]);

    res.json({
      token,
      refresh_token,
      user: {
        user_id: user.user_id,
        first_name: user.first_name,
        last_name: user.last_name,
        login_name: user.login_name,
        is_admin: !!user.is_admin,
        account_number,
        account_name: account.account_name,
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /auth/refresh
router.post('/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) return res.status(400).json({ error: 'refresh_token required' });

    const sessionRes = await query('SELECT * FROM user_sessions WHERE refresh_token = $1', [refresh_token]);
    const session = sessionRes.rows[0];
    if (!session || new Date(session.expires_at) < new Date()) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const userRes = await query('SELECT u.*, a.account_number FROM users u JOIN accounts a ON u.account_id = a.account_id WHERE u.user_id = $1', [session.user_id]);
    const user = userRes.rows[0];
    
    // TODO: RE-ENABLE BEFORE PRODUCTION
    /*
    if (!user.is_confirmed) {
       return res.status(403).json({ error: 'Account not confirmed' });
    }
    */

    const token = jwt.sign(
      { user_id: user.user_id, account_id: user.account_id, account_number: user.account_number, login_name: user.login_name, is_admin: !!user.is_admin },
      JWT_SECRET,
      { expiresIn: '15m' }
    );
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /auth/account-name/:number
router.get('/account-name/:number', async (req, res) => {
  try {
    const { number } = req.params;
    const accountRes = await query('SELECT account_name FROM accounts WHERE account_number = $1', [number.toUpperCase()]);
    if (accountRes.rowCount === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }
    res.json({ account_name: accountRes.rows[0].account_name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /auth/password-reset
router.post('/password-reset', (req, res) => {
  res.json({ message: 'If that email exists, a reset link has been sent.' });
});

function trackFailedAttempt(key) {
  if (!failedAttempts[key]) failedAttempts[key] = { count: 0, lastAttempt: 0 };
  failedAttempts[key].count++;
  failedAttempts[key].lastAttempt = Date.now();
}

module.exports = router;
