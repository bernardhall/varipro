const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { query } = require('../db/database');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${req.user.account_id}_logo_${Date.now()}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// GET /account/settings
router.get('/settings', async (req, res) => {
  try {
    const result = await query('SELECT default_hourly_rate, tax_rate, logo_uri, tax_reg_number, address, email, phone, web_page FROM accounts WHERE account_id = $1', [req.user.account_id]);
    const account = result.rows[0];
    if (!account) return res.status(404).json({ error: 'Account not found' });
    res.json(account);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /account/settings
router.put('/settings', adminMiddleware, async (req, res) => {
  const { default_hourly_rate, tax_rate, tax_reg_number, address, email, phone, web_page } = req.body;
  try {
    const result = await query(`
      UPDATE accounts 
      SET default_hourly_rate = COALESCE($1, default_hourly_rate), 
          tax_rate = COALESCE($2, tax_rate),
          tax_reg_number = COALESCE($3, tax_reg_number),
          address = COALESCE($4, address),
          email = COALESCE($5, email),
          phone = COALESCE($6, phone),
          web_page = COALESCE($7, web_page)
      WHERE account_id = $8`,
      [default_hourly_rate, tax_rate, tax_reg_number, address, email, phone, web_page, req.user.account_id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Account not found' });
    res.json({ message: 'Settings updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// POST /account/settings/logo
router.post('/settings/logo', adminMiddleware, upload.single('logo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
  
  try {
    const uri = `/uploads/${req.file.filename}`;
    await query('UPDATE accounts SET logo_uri = $1 WHERE account_id = $2', [uri, req.user.account_id]);
    res.status(201).json({ uri });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error while saving logo uri' });
  }
});

module.exports = router;
