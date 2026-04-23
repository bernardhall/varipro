const express = require('express');
const router = express.Router();
const { query } = require('../db/database');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// GET /account/settings
router.get('/settings', async (req, res) => {
  try {
    const result = await query('SELECT default_hourly_rate, tax_rate FROM accounts WHERE account_id = $1', [req.user.account_id]);
    const account = result.rows[0];
    if (!account) return res.status(404).json({ error: 'Account not found' });
    res.json(account);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /account/settings
router.put('/settings', adminMiddleware, async (req, res) => {
  const { default_hourly_rate, tax_rate } = req.body;
  try {
    const result = await query('UPDATE accounts SET default_hourly_rate = COALESCE($1, default_hourly_rate), tax_rate = COALESCE($2, tax_rate) WHERE account_id = $3',
      [default_hourly_rate, tax_rate, req.user.account_id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Account not found' });
    res.json({ message: 'Settings updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

module.exports = router;
