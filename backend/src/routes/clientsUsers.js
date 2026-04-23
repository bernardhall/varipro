const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { query } = require('../db/database');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const bcrypt = require('bcrypt');

router.use(authMiddleware);

// ─── CLIENTS ───────────────────────────────────────────────────────────────

// GET /clients
router.get('/clients', async (req, res) => {
  try {
    const { search } = req.query;
    let sql = 'SELECT * FROM clients WHERE account_id = $1';
    const params = [req.user.account_id];
    let pIdx = 2;

    if (search) { 
      sql += ` AND (full_name ILIKE $${pIdx} OR email ILIKE $${pIdx} OR phone ILIKE $${pIdx})`; 
      params.push(`%${search}%`); 
    }
    sql += ' ORDER BY full_name';

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /clients/:id
router.get('/clients/:id', async (req, res) => {
  try {
    const result = await query('SELECT * FROM clients WHERE id = $1 AND account_id = $2', [req.params.id, req.user.account_id]);
    const client = result.rows[0];
    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json(client);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /clients
router.post('/clients', async (req, res) => {
  try {
    const { full_name, email, phone, site_address } = req.body;
    if (!full_name || !site_address) return res.status(400).json({ error: 'full_name and site_address required' });
    const id = uuidv4();
    await query('INSERT INTO clients (id, account_id, full_name, email, phone, site_address) VALUES ($1, $2, $3, $4, $5, $6)', 
      [id, req.user.account_id, full_name, email || null, phone || null, site_address]);
    res.status(201).json({ id, full_name, email, phone, site_address });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /clients/:id
router.put('/clients/:id', async (req, res) => {
  try {
    const { full_name, email, phone, site_address } = req.body;
    const result = await query("UPDATE clients SET full_name = COALESCE($1, full_name), email = COALESCE($2, email), phone = COALESCE($3, phone), site_address = COALESCE($4, site_address) WHERE id = $5 AND account_id = $6",
      [full_name || null, email || null, phone || null, site_address || null, req.params.id, req.user.account_id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Client not found' });
    res.json({ message: 'Client updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /clients/:id
router.delete('/clients/:id', async (req, res) => {
  try {
    const result = await query('DELETE FROM clients WHERE id = $1 AND account_id = $2', [req.params.id, req.user.account_id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Client not found' });
    res.json({ message: 'Client deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── USERS ─────────────────────────────────────────────────────────────────

// GET /users (admin only)
router.get('/users', adminMiddleware, async (req, res) => {
  try {
    const result = await query('SELECT user_id, first_name, last_name, login_name, email, is_admin, last_login, created_at FROM users WHERE account_id = $1', [req.user.account_id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /users (admin only - add user to account)
router.post('/users', adminMiddleware, async (req, res) => {
  try {
    const { first_name, last_name, login_name, email, password, pin, is_admin = false } = req.body;
    if (!first_name || !last_name || !login_name || !email || !password) {
      return res.status(400).json({ error: 'All fields required' });
    }
    if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      return res.status(400).json({ error: 'Password must be 8+ chars with at least 1 letter and 1 number' });
    }
    const existing = await query('SELECT 1 FROM users WHERE login_name = $1', [login_name]);
    if (existing.rowCount > 0) return res.status(409).json({ error: 'Login name already taken' });

    const user_id = uuidv4();
    const password_hash = await bcrypt.hash(password, 10);
    const pin_hash = pin ? await bcrypt.hash(pin, 10) : null;

    await query('INSERT INTO users (user_id, account_id, first_name, last_name, login_name, email, password_hash, pin_hash, is_admin) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [user_id, req.user.account_id, first_name, last_name, login_name, email, password_hash, pin_hash, is_admin ? 1 : 0]);

    res.status(201).json({ user_id, login_name, first_name, last_name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /users/:id (admin only)
router.delete('/users/:id', adminMiddleware, async (req, res) => {
  try {
    if (req.params.id === req.user.user_id) return res.status(400).json({ error: 'Cannot delete yourself' });
    const result = await query('DELETE FROM users WHERE user_id = $1 AND account_id = $2', [req.params.id, req.user.account_id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
