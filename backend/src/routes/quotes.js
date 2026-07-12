const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { query, pool } = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const { sendQuoteNotificationEmail, sendContractorCopyEmail } = require('../services/email');

const uploadsDir = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ─── PUBLIC PORTAL ENDPOINTS ───
// These do not require authentication so clients can view and accept quotes.

router.get('/public/:id', async (req, res) => {
  try {
    const quoteRes = await query(`
      SELECT q.*, c.full_name as client_name, c.site_address, c.email as client_email, c.phone as client_phone,
             a.business_name, a.logo_uri, a.tax_reg_number, a.address as business_address, a.email as business_email, 
             a.phone as business_phone, a.web_page, a.quote_footer, a.tax_rate
      FROM quotes q
      LEFT JOIN clients c ON q.client_id = c.id
      LEFT JOIN accounts a ON q.account_id = a.account_id
      WHERE q.id = $1
    `, [req.params.id]);
    
    const quote = quoteRes.rows[0];
    if (!quote) return res.status(404).json({ error: 'Quote not found' });
    
    if (quote.status === 'draft' || quote.status === 'verified') {
      return res.status(403).json({ error: 'Quote is not yet available for review.' });
    }

    quote.tasks = (await query('SELECT * FROM quote_tasks WHERE quote_id = $1', [req.params.id])).rows;
    quote.materials = (await query('SELECT * FROM quote_materials WHERE quote_id = $1', [req.params.id])).rows;
    quote.equipment = (await query('SELECT * FROM quote_equipment WHERE quote_id = $1', [req.params.id])).rows;
    quote.sundry = (await query('SELECT * FROM quote_sundry WHERE quote_id = $1', [req.params.id])).rows;
    quote.higher_costs = (await query('SELECT * FROM quote_higher_costs WHERE quote_id = $1', [req.params.id])).rows;
    quote.photos = (await query('SELECT * FROM quote_photos WHERE quote_id = $1 ORDER BY sort_order', [req.params.id])).rows;

    res.json(quote);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/public/:id/status', async (req, res) => {
  try {
    const { status, clientName, comments } = req.body;
    if (status !== 'accepted' && status !== 'declined') {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const checkRes = await query(`
      SELECT q.status, q.job_name, q.grand_total, u.email as creator_email, u.first_name as creator_name
      FROM quotes q
      LEFT JOIN users u ON q.created_by = u.user_id
      WHERE q.id = $1
    `, [req.params.id]);
    
    const quote = checkRes.rows[0];
    if (!quote) return res.status(404).json({ error: 'Quote not found' });
    
    if (quote.status === 'draft' || quote.status === 'verified') {
      return res.status(403).json({ error: 'Quote is not active yet.' });
    }

    // Update status in database
    await query('UPDATE quotes SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [status, req.params.id]);

    // Send email notification to creator/contractor in background
    if (quote.creator_email) {
      sendQuoteNotificationEmail(
        quote.creator_email,
        quote.creator_name || 'there',
        quote,
        status,
        clientName,
        comments
      ).catch(emailErr => console.error('Failed to send notification email:', emailErr));
    } else {
      console.warn(`[Notification] No creator email found for quote ${req.params.id}. Skipping email.`);
    }

    res.json({ message: `Quote successfully ${status}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.use(authMiddleware);

// GET /quotes
router.get('/', async (req, res) => {
  try {
    const { status, search } = req.query;
    let sql = `
      SELECT q.*, c.full_name as client_name, c.site_address, u.first_name || ' ' || u.last_name as creator_name, v.first_name || ' ' || v.last_name as verified_by_name
      FROM quotes q
      LEFT JOIN clients c ON q.client_id = c.id
      LEFT JOIN users u ON q.created_by = u.user_id
      LEFT JOIN users v ON q.verified_by = v.user_id
      WHERE q.account_id = $1
    `;
    const params = [req.user.account_id];
    let pIdx = 2;

    // Non-admin users see only their own quotes
    if (!req.user.is_admin) {
      sql += ` AND q.created_by = $${pIdx++}`;
      params.push(req.user.user_id);
    }
    
    if (status && status !== 'all') { 
      sql += ` AND q.status = $${pIdx++}`; 
      params.push(status); 
    }
    if (search) { 
      sql += ` AND (q.job_name ILIKE $${pIdx} OR c.full_name ILIKE $${pIdx} OR CONCAT(u.first_name, ' ', u.last_name) ILIKE $${pIdx})`; 
      params.push(`%${search}%`); 
    }
    sql += ' ORDER BY q.updated_at DESC';

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /quotes/:id
router.get('/:id', async (req, res) => {
  try {
    let sql = `
      SELECT q.*, c.full_name as client_name, u.first_name || ' ' || u.last_name as creator_name, v.first_name || ' ' || v.last_name as verified_by_name 
      FROM quotes q 
      LEFT JOIN clients c ON q.client_id = c.id 
      LEFT JOIN users u ON q.created_by = u.user_id 
      LEFT JOIN users v ON q.verified_by = v.user_id
      WHERE q.id = $1 AND q.account_id = $2
    `;
    const params = [req.params.id, req.user.account_id];
    
    if (!req.user.is_admin) {
      sql += ' AND q.created_by = $3';
      params.push(req.user.user_id);
    }

    const quoteRes = await query(sql, params);
    const quote = quoteRes.rows[0];
    if (!quote) return res.status(404).json({ error: 'Quote not found' });

    quote.tasks = (await query('SELECT * FROM quote_tasks WHERE quote_id = $1', [req.params.id])).rows;
    quote.materials = (await query('SELECT * FROM quote_materials WHERE quote_id = $1', [req.params.id])).rows;
    quote.equipment = (await query('SELECT * FROM quote_equipment WHERE quote_id = $1', [req.params.id])).rows;
    quote.sundry = (await query('SELECT * FROM quote_sundry WHERE quote_id = $1', [req.params.id])).rows;
    quote.higher_costs = (await query('SELECT * FROM quote_higher_costs WHERE quote_id = $1', [req.params.id])).rows;
    quote.photos = (await query('SELECT * FROM quote_photos WHERE quote_id = $1 ORDER BY sort_order', [req.params.id])).rows;

    res.json(quote);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /quotes
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    const { client_id, job_name, status = 'draft', summary_explanation, tasks = [], materials = [], equipment = [], sundry = [], higher_costs = [] } = req.body;
    if (!job_name) return res.status(400).json({ error: 'job_name required' });

    const id = uuidv4();
    
    // Fetch account settings
    const accountSettingsRes = await client.query('SELECT default_hourly_rate, tax_rate FROM accounts WHERE account_id = $1', [req.user.account_id]);
    const accountSettings = accountSettingsRes.rows[0];
    const default_hourly_rate = accountSettings?.default_hourly_rate || 75;
    const tax_rate = accountSettings?.tax_rate || 0;

    // Calculate totals
    let labor_cost = 0;
    let total_labor_hours = 0;
    for (const t of tasks) {
      if (t.task_type === 'set') {
        labor_cost += parseFloat(t.price) || 0;
      } else if (t.task_type === 'charge') {
        // Open-ended
      } else {
        const hrs = parseFloat(t.estimated_hours) || 0;
        total_labor_hours += hrs;
        labor_cost += hrs * (t.hourly_rate || default_hourly_rate);
      }
    }

    const total_material_cost = materials.reduce((s, m) => s + (parseFloat(m.quantity) || 0) * (parseFloat(m.unit_cost) || 0), 0);
    const total_equipment_cost = equipment.reduce((s, e) => s + (parseFloat(e.duration_days) || 0) * (parseFloat(e.daily_rate) || 0), 0);
    const total_sundry_cost = sundry.reduce((s, su) => s + (parseFloat(su.flat_amount) || 0), 0);
    const total_higher_cost = higher_costs.reduce((s, h) => s + (parseFloat(h.amount) || 0), 0);
    
    const subtotal = labor_cost + total_material_cost + total_equipment_cost + total_sundry_cost + total_higher_cost;
    const tax_amount = subtotal * (tax_rate / 100);
    const grand_total = subtotal + tax_amount;

    await client.query('BEGIN');
    
    // Auto-verify if created by admin
    const is_admin = !!req.user.is_admin;
    const verified_by = is_admin ? req.user.user_id : null;
    let initial_status = status;
    if (is_admin && status === 'draft') {
       initial_status = 'verified';
    }

    await client.query(`INSERT INTO quotes (id, account_id, client_id, job_name, status, summary_explanation, total_labor_hours, total_material_cost, total_equipment_cost, total_sundry_cost, total_higher_cost, tax_amount, grand_total, created_by, verified_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`, 
      [id, req.user.account_id, client_id || null, job_name, initial_status, summary_explanation || null, total_labor_hours, total_material_cost, total_equipment_cost, total_sundry_cost, total_higher_cost, tax_amount, grand_total, req.user.user_id, verified_by]);

    for (const t of tasks) {
      await client.query('INSERT INTO quote_tasks (id, quote_id, task_name, task_type, estimated_hours, hourly_rate, price) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [uuidv4(), id, t.task_name, t.task_type || 'hourly', parseFloat(t.estimated_hours) || 0, parseFloat(t.hourly_rate) || default_hourly_rate, parseFloat(t.price) || 0]);
    }
    for (const m of materials) {
      await client.query('INSERT INTO quote_materials (id, quote_id, item_name, quantity, unit_cost, total) VALUES ($1, $2, $3, $4, $5, $6)',
        [uuidv4(), id, m.item_name, m.quantity || 1, m.unit_cost || 0, (m.quantity || 1) * (m.unit_cost || 0)]);
    }
    for (const e of equipment) {
      await client.query('INSERT INTO quote_equipment (id, quote_id, item_name, duration_days, daily_rate, total) VALUES ($1, $2, $3, $4, $5, $6)',
        [uuidv4(), id, e.item_name, e.duration_days || 1, e.daily_rate || 0, (e.duration_days || 1) * (e.daily_rate || 0)]);
    }
    for (const s of sundry) {
      await client.query('INSERT INTO quote_sundry (id, quote_id, description, flat_amount) VALUES ($1, $2, $3, $4)',
        [uuidv4(), id, s.description, s.flat_amount || 0]);
    }
    for (const h of higher_costs) {
      await client.query('INSERT INTO quote_higher_costs (id, quote_id, description, amount) VALUES ($1, $2, $3, $4)',
        [uuidv4(), id, h.description, h.amount || 0]);
    }
    await client.query('COMMIT');

    res.status(201).json({ id, grand_total, status });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PUT /quotes/:id
router.put('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const existingRes = await client.query('SELECT * FROM quotes WHERE id = $1 AND account_id = $2', [req.params.id, req.user.account_id]);
    const existing = existingRes.rows[0];
    if (!existing) return res.status(404).json({ error: 'Quote not found' });

    const { job_name, status, summary_explanation, client_id, tasks, materials, equipment, sundry, higher_costs } = req.body;

    let finalStatus = status || existing.status;
    let verified_by = existing.verified_by;
    const is_admin = !!req.user.is_admin;

    if (!is_admin && existing.verified_by) {
      return res.status(403).json({ error: 'Verified quotes cannot be updated by non-administrators' });
    }

    // Enforce verification logic when status changes
    if (status && status !== existing.status) {
      if (status === 'verified') {
        if (!is_admin) return res.status(403).json({ error: 'Only administrators can verify quotes' });
        verified_by = req.user.user_id;
      }
      if (status === 'sent') {
        if (!verified_by && !is_admin) {
          return res.status(403).json({ error: 'Quote must be verified by an administrator before sending' });
        }
        if (is_admin && !verified_by) {
          verified_by = req.user.user_id;
        }
      }
    }

    await client.query('BEGIN');

    const updated = {
      job_name: job_name || existing.job_name,
      status: status || existing.status,
      summary_explanation: summary_explanation !== undefined ? summary_explanation : existing.summary_explanation,
      client_id: client_id !== undefined ? client_id : existing.client_id,
      tasks: tasks || (await client.query('SELECT * FROM quote_tasks WHERE quote_id = $1', [req.params.id])).rows,
      materials: materials || (await client.query('SELECT * FROM quote_materials WHERE quote_id = $1', [req.params.id])).rows,
      equipment: equipment || (await client.query('SELECT * FROM quote_equipment WHERE quote_id = $1', [req.params.id])).rows,
      sundry: sundry || (await client.query('SELECT * FROM quote_sundry WHERE quote_id = $1', [req.params.id])).rows,
      higher_costs: higher_costs || (await client.query('SELECT * FROM quote_higher_costs WHERE quote_id = $1', [req.params.id])).rows
    };

    const accountSettingsRes = await client.query('SELECT default_hourly_rate, tax_rate FROM accounts WHERE account_id = $1', [req.user.account_id]);
    const accountSettings = accountSettingsRes.rows[0];
    const default_hourly_rate = accountSettings?.default_hourly_rate || 75;
    const tax_rate = accountSettings?.tax_rate || 0;

    // Recalculate
    let labor_cost = 0;
    let total_labor_hours = 0;
    for (const t of updated.tasks) {
      if (t.task_type === 'set') {
        labor_cost += parseFloat(t.price) || 0;
      } else if (t.task_type === 'charge') {
        // Open
      } else {
        const hrs = parseFloat(t.estimated_hours) || 0;
        total_labor_hours += hrs;
        labor_cost += hrs * (t.hourly_rate || default_hourly_rate);
      }
    }

    const total_material_cost = updated.materials.reduce((s, m) => s + (parseFloat(m.quantity) || 0) * (parseFloat(m.unit_cost) || 0), 0);
    const total_equipment_cost = updated.equipment.reduce((s, e) => s + (parseFloat(e.duration_days) || 0) * (parseFloat(e.daily_rate) || 0), 0);
    const total_sundry_cost = updated.sundry.reduce((s, su) => s + (parseFloat(su.flat_amount) || 0), 0);
    const total_higher_cost = updated.higher_costs.reduce((s, h) => s + (parseFloat(h.amount) || 0), 0);

    const subtotal = labor_cost + total_material_cost + total_equipment_cost + total_sundry_cost + total_higher_cost;
    const tax_amount = subtotal * (tax_rate / 100);
    const grand_total = subtotal + tax_amount;

    await client.query(`UPDATE quotes SET job_name = $1, status = $2, summary_explanation = $3, client_id = $4, total_labor_hours = $5, total_material_cost = $6, total_equipment_cost = $7, total_sundry_cost = $8, total_higher_cost = $9, tax_amount = $10, grand_total = $11, verified_by = $12, updated_at = CURRENT_TIMESTAMP WHERE id = $13`,
      [updated.job_name, finalStatus, updated.summary_explanation, updated.client_id, total_labor_hours, total_material_cost, total_equipment_cost, total_sundry_cost, total_higher_cost, tax_amount, grand_total, verified_by, req.params.id]);

    if (tasks) {
      await client.query('DELETE FROM quote_tasks WHERE quote_id = $1', [req.params.id]);
      for (const t of tasks) {
        await client.query('INSERT INTO quote_tasks (id, quote_id, task_name, task_type, estimated_hours, hourly_rate, price) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [uuidv4(), req.params.id, t.task_name, t.task_type || 'hourly', parseFloat(t.estimated_hours) || 0, parseFloat(t.hourly_rate) || default_hourly_rate, parseFloat(t.price) || 0]);
      }
    }
    if (materials) {
      await client.query('DELETE FROM quote_materials WHERE quote_id = $1', [req.params.id]);
      for (const m of materials) await client.query('INSERT INTO quote_materials (id, quote_id, item_name, quantity, unit_cost, total) VALUES ($1, $2, $3, $4, $5, $6)', [uuidv4(), req.params.id, m.item_name, m.quantity || 1, m.unit_cost || 0, (m.quantity || 1) * (m.unit_cost || 0)]);
    }
    if (equipment) {
      await client.query('DELETE FROM quote_equipment WHERE quote_id = $1', [req.params.id]);
      for (const e of equipment) await client.query('INSERT INTO quote_equipment (id, quote_id, item_name, duration_days, daily_rate, total) VALUES ($1, $2, $3, $4, $5, $6)', [uuidv4(), req.params.id, e.item_name, e.duration_days || 1, e.daily_rate || 0, (e.duration_days || 1) * (e.daily_rate || 0)]);
    }
    if (sundry) {
      await client.query('DELETE FROM quote_sundry WHERE quote_id = $1', [req.params.id]);
      for (const s of sundry) await client.query('INSERT INTO quote_sundry (id, quote_id, description, flat_amount) VALUES ($1, $2, $3, $4)', [uuidv4(), req.params.id, s.description, s.flat_amount || 0]);
    }
    if (higher_costs) {
      await client.query('DELETE FROM quote_higher_costs WHERE quote_id = $1', [req.params.id]);
      for (const h of higher_costs) await client.query('INSERT INTO quote_higher_costs (id, quote_id, description, amount) VALUES ($1, $2, $3, $4)', [uuidv4(), req.params.id, h.description, h.amount || 0]);
    }
    await client.query('COMMIT');

    res.json({ message: 'Quote updated' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// DELETE /quotes/:id
router.delete('/:id', async (req, res) => {
  try {
    const quoteRes = await query('SELECT verified_by FROM quotes WHERE id = $1 AND account_id = $2', [req.params.id, req.user.account_id]);
    if (quoteRes.rowCount === 0) return res.status(404).json({ error: 'Quote not found' });
    const existing = quoteRes.rows[0];

    const is_admin = !!req.user.is_admin;
    if (!is_admin && existing.verified_by) {
      return res.status(403).json({ error: 'Verified quotes cannot be deleted by non-administrators' });
    }

    const result = await query('DELETE FROM quotes WHERE id = $1 AND account_id = $2', [req.params.id, req.user.account_id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Quote not found' });
    res.json({ message: 'Quote deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /quotes/:id/photos
router.post('/:id/photos', upload.array('photos', 20), async (req, res) => {
  try {
    const quoteRes = await query('SELECT id, verified_by FROM quotes WHERE id = $1 AND account_id = $2', [req.params.id, req.user.account_id]);
    if (quoteRes.rowCount === 0) return res.status(404).json({ error: 'Quote not found' });
    const existing = quoteRes.rows[0];

    const is_admin = !!req.user.is_admin;
    if (!is_admin && existing.verified_by) {
      return res.status(403).json({ error: 'Cannot add photos to a verified quote if not an administrator' });
    }

    const inserted = [];
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const photo_id = uuidv4();
      const uri = `/uploads/${file.filename}`;
      await query('INSERT INTO quote_photos (id, quote_id, image_uri, sort_order, sync_status) VALUES ($1, $2, $3, $4, $5)', [photo_id, req.params.id, uri, i, 'synced']);
      inserted.push({ id: photo_id, image_uri: uri });
    }
    res.status(201).json(inserted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /quotes/:id/record-send
router.post('/:id/record-send', express.json({ limit: '10mb' }), async (req, res) => {
  try {
    const { method, recipient, messageBody, pdfBase64 } = req.body;
    
    // Get quote details to pass to email
    const quoteRes = await query('SELECT * FROM quotes WHERE id = $1 AND account_id = $2', [req.params.id, req.user.account_id]);
    if (quoteRes.rowCount === 0) return res.status(404).json({ error: 'Quote not found' });
    const quote = quoteRes.rows[0];

    // Contractor email must be fetched from DB because it's not in the JWT token
    const userRes = await query('SELECT email FROM users WHERE user_id = $1', [req.user.user_id]);
    const contractorEmail = userRes.rowCount > 0 ? userRes.rows[0].email : null;

    if (contractorEmail && pdfBase64) {
      await sendContractorCopyEmail(contractorEmail, quote, method, recipient, messageBody, pdfBase64);
    }
    
    res.json({ message: 'Record sent successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
