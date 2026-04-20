const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// GET /account/settings
router.get('/settings', (req, res) => {
  const db = getDb();
  const account = db.prepare('SELECT default_hourly_rate, tax_rate FROM accounts WHERE account_id = ?').get(req.user.account_id);
  if (!account) return res.status(404).json({ error: 'Account not found' });
  res.json(account);
});

// PUT /account/settings
router.put('/settings', adminMiddleware, (req, res) => {
  const db = getDb();
  const { default_hourly_rate, tax_rate } = req.body;

  try {
    db.prepare('UPDATE accounts SET default_hourly_rate = COALESCE(?, default_hourly_rate), tax_rate = COALESCE(?, tax_rate) WHERE account_id = ?')
      .run(default_hourly_rate, tax_rate, req.user.account_id);
    res.json({ message: 'Settings updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

module.exports = router;
