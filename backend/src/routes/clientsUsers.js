const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const bcrypt = require('bcrypt');

router.use(authMiddleware);

// ─── CLIENTS ───────────────────────────────────────────────────────────────

// GET /clients
router.get('/clients', (req, res) => {
  const db = getDb();
  const { search } = req.query;
  let query = 'SELECT * FROM clients WHERE account_id = ?';
  const params = [req.user.account_id];
  if (search) { query += ' AND (full_name LIKE ? OR email LIKE ? OR phone LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  query += ' ORDER BY full_name';
  res.json(db.prepare(query).all(...params));
});

// GET /clients/:id
router.get('/clients/:id', (req, res) => {
  const db = getDb();
  const client = db.prepare('SELECT * FROM clients WHERE id = ? AND account_id = ?').get(req.params.id, req.user.account_id);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  res.json(client);
});

// POST /clients
router.post('/clients', (req, res) => {
  const db = getDb();
  const { full_name, email, phone, site_address } = req.body;
  if (!full_name || !site_address) return res.status(400).json({ error: 'full_name and site_address required' });
  const id = uuidv4();
  db.prepare('INSERT INTO clients (id, account_id, full_name, email, phone, site_address) VALUES (?, ?, ?, ?, ?, ?)').run(id, req.user.account_id, full_name, email || null, phone || null, site_address);
  res.status(201).json({ id, full_name, email, phone, site_address });
});

// PUT /clients/:id
router.put('/clients/:id', (req, res) => {
  const db = getDb();
  const { full_name, email, phone, site_address } = req.body;
  const result = db.prepare("UPDATE clients SET full_name = COALESCE(?, full_name), email = COALESCE(?, email), phone = COALESCE(?, phone), site_address = COALESCE(?, site_address) WHERE id = ? AND account_id = ?")
    .run(full_name || null, email || null, phone || null, site_address || null, req.params.id, req.user.account_id);
  if (result.changes === 0) return res.status(404).json({ error: 'Client not found' });
  res.json({ message: 'Client updated' });
});

// DELETE /clients/:id
router.delete('/clients/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM clients WHERE id = ? AND account_id = ?').run(req.params.id, req.user.account_id);
  if (result.changes === 0) return res.status(404).json({ error: 'Client not found' });
  res.json({ message: 'Client deleted' });
});

// ─── USERS ─────────────────────────────────────────────────────────────────

// GET /users (admin only)
router.get('/users', adminMiddleware, (req, res) => {
  const db = getDb();
  const users = db.prepare('SELECT user_id, first_name, last_name, login_name, email, is_admin, last_login, created_at FROM users WHERE account_id = ?').all(req.user.account_id);
  res.json(users);
});

// POST /users (admin only - add user to account)
router.post('/users', adminMiddleware, async (req, res) => {
  const db = getDb();
  const { first_name, last_name, login_name, email, password, pin, is_admin = false } = req.body;
  if (!first_name || !last_name || !login_name || !email || !password) {
    return res.status(400).json({ error: 'All fields required' });
  }
  if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return res.status(400).json({ error: 'Password must be 8+ chars with at least 1 letter and 1 number' });
  }
  const existing = db.prepare('SELECT 1 FROM users WHERE login_name = ?').get(login_name);
  if (existing) return res.status(409).json({ error: 'Login name already taken' });

  const user_id = uuidv4();
  const password_hash = await bcrypt.hash(password, 10);
  const pin_hash = pin ? await bcrypt.hash(pin, 10) : null;

  db.prepare('INSERT INTO users (user_id, account_id, first_name, last_name, login_name, email, password_hash, pin_hash, is_admin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(user_id, req.user.account_id, first_name, last_name, login_name, email, password_hash, pin_hash, is_admin ? 1 : 0);

  res.status(201).json({ user_id, login_name, first_name, last_name });
});

// DELETE /users/:id (admin only)
router.delete('/users/:id', adminMiddleware, (req, res) => {
  if (req.params.id === req.user.user_id) return res.status(400).json({ error: 'Cannot delete yourself' });
  const db = getDb();
  const result = db.prepare('DELETE FROM users WHERE user_id = ? AND account_id = ?').run(req.params.id, req.user.account_id);
  if (result.changes === 0) return res.status(404).json({ error: 'User not found' });
  res.json({ message: 'User deleted' });
});

module.exports = router;
