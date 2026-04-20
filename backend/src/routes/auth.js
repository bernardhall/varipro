const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { JWT_SECRET } = require('../middleware/auth');

const SALT_ROUNDS = 10;
const LOCKOUT_ATTEMPTS = 3;
const LOCKOUT_DURATION_MS = 60 * 1000;

// Track failed login attempts in memory (use Redis in production)
const failedAttempts = {};

function generateAccountNumber() {
  const prefixes = ['ELEC', 'PLMB', 'CARP', 'GENL', 'TRDE'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix}-${code}`;
}

function generateUniqueAccountNumber(db) {
  let number;
  let attempts = 0;
  do {
    number = generateAccountNumber();
    attempts++;
    if (attempts > 100) throw new Error('Could not generate unique account number');
  } while (db.prepare('SELECT 1 FROM accounts WHERE account_number = ?').get(number));
  return number;
}

// POST /auth/register
router.post('/register', async (req, res) => {
  const { account_name, user } = req.body;
  if (!account_name || !user) return res.status(400).json({ error: 'account_name and user required' });

  const { first_name, last_name, login_name, email, password, pin } = user;
  if (!first_name || !last_name || !login_name || !email || !password) {
    return res.status(400).json({ error: 'All user fields required' });
  }
  if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return res.status(400).json({ error: 'Password must be 8+ chars with at least 1 letter and 1 number' });
  }

  const db = getDb();

  const existingUser = db.prepare('SELECT 1 FROM users WHERE login_name = ?').get(login_name);
  if (existingUser) return res.status(409).json({ error: 'Login name already taken' });

  try {
    const account_id = uuidv4();
    const user_id = uuidv4();
    const account_number = generateUniqueAccountNumber(db);
    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    const pin_hash = pin ? await bcrypt.hash(pin, SALT_ROUNDS) : null;

    const insertAccount = db.prepare(
      'INSERT INTO accounts (account_id, account_number, account_name) VALUES (?, ?, ?)'
    );
    const insertUser = db.prepare(`
      INSERT INTO users (user_id, account_id, first_name, last_name, login_name, email, password_hash, pin_hash, is_admin)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);

    db.transaction(() => {
      insertAccount.run(account_id, account_number, account_name);
      insertUser.run(user_id, account_id, first_name, last_name, login_name, email, password_hash, pin_hash);
    })();

    const token = jwt.sign(
      { user_id, account_id, account_number, login_name, is_admin: true },
      JWT_SECRET,
      { expiresIn: '15m' }
    );
    const refresh_token = uuidv4();
    const expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare('INSERT INTO user_sessions (session_id, user_id, refresh_token, expires_at) VALUES (?, ?, ?, ?)')
      .run(uuidv4(), user_id, refresh_token, expires_at);

    res.status(201).json({ account_number, account_name, user_id, token, refresh_token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /auth/login
router.post('/login', async (req, res) => {
  const { account_number, login_name, password, pin } = req.body;
  console.log(`[AUTH] Login attempt: Account=${account_number}, User=${login_name}, Method=${password ? 'password' : 'pin'}`);
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

  const db = getDb();
  const account = db.prepare('SELECT * FROM accounts WHERE account_number = ?').get(account_number);
  if (!account) {
    console.log(`[AUTH] Failed: Account ${account_number} not found`);
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const user = db.prepare('SELECT * FROM users WHERE login_name = ? AND account_id = ?').get(login_name, account.account_id);
  if (!user) {
    console.log(`[AUTH] Failed: User ${login_name} not found in account ${account_number}`);
    trackFailedAttempt(lockKey);
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  let authenticated = false;
  if (password) {
    authenticated = await bcrypt.compare(password, user.password_hash);
  } else if (pin && user.pin_hash) {
    authenticated = await bcrypt.compare(pin, user.pin_hash);
  }

  if (!authenticated) {
    console.log(`[AUTH] Failed: Password/PIN mismatch for ${login_name}`);
    trackFailedAttempt(lockKey);
    const attempts = (failedAttempts[lockKey] || {}).count || 1;
    return res.status(401).json({
      error: 'Invalid credentials',
      attempts_remaining: LOCKOUT_ATTEMPTS - attempts
    });
  }

  console.log(`[AUTH] Success: ${login_name} logged in`);

  delete failedAttempts[lockKey];
  db.prepare("UPDATE users SET last_login = datetime('now') WHERE user_id = ?").run(user.user_id);

  const token = jwt.sign(
    { user_id: user.user_id, account_id: user.account_id, account_number, login_name, is_admin: !!user.is_admin },
    JWT_SECRET,
    { expiresIn: '15m' }
  );
  const refresh_token = uuidv4();
  const expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO user_sessions (session_id, user_id, refresh_token, expires_at) VALUES (?, ?, ?, ?)')
    .run(uuidv4(), user.user_id, refresh_token, expires_at);

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
});

// POST /auth/refresh
router.post('/refresh', (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) return res.status(400).json({ error: 'refresh_token required' });

  const db = getDb();
  const session = db.prepare('SELECT * FROM user_sessions WHERE refresh_token = ?').get(refresh_token);
  if (!session || new Date(session.expires_at) < new Date()) {
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }

  const user = db.prepare('SELECT u.*, a.account_number FROM users u JOIN accounts a ON u.account_id = a.account_id WHERE u.user_id = ?').get(session.user_id);
  const token = jwt.sign(
    { user_id: user.user_id, account_id: user.account_id, account_number: user.account_number, login_name: user.login_name, is_admin: !!user.is_admin },
    JWT_SECRET,
    { expiresIn: '15m' }
  );
  res.json({ token });
});

// POST /auth/password-reset
router.post('/password-reset', (req, res) => {
  const { email } = req.body;
  // In production: send reset email. For now, acknowledge.
  res.json({ message: 'If that email exists, a reset link has been sent.' });
});

function trackFailedAttempt(key) {
  if (!failedAttempts[key]) failedAttempts[key] = { count: 0, lastAttempt: 0 };
  failedAttempts[key].count++;
  failedAttempts[key].lastAttempt = Date.now();
}

module.exports = router;
