const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { query, pool } = require('../db/database');
const { authMiddleware } = require('../middleware/auth');

const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authMiddleware);

// GET /quotes
router.get('/', async (req, res) => {
  try {
    const { status, search } = req.query;
    let sql = `
      SELECT q.*, c.full_name as client_name, c.site_address
      FROM quotes q
      LEFT JOIN clients c ON q.client_id = c.id
      WHERE q.account_id = $1
    `;
    const params = [req.user.account_id];
    let pIdx = 2;
    
    if (status && status !== 'all') { 
      sql += ` AND q.status = $${pIdx++}`; 
      params.push(status); 
    }
    if (search) { 
      sql += ` AND (q.job_name ILIKE $${pIdx} OR c.full_name ILIKE $${pIdx})`; 
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
    const quoteRes = await query('SELECT q.*, c.full_name as client_name FROM quotes q LEFT JOIN clients c ON q.client_id = c.id WHERE q.id = $1 AND q.account_id = $2', [req.params.id, req.user.account_id]);
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
    await client.query(`INSERT INTO quotes (id, account_id, client_id, job_name, status, summary_explanation, total_labor_hours, total_material_cost, total_equipment_cost, total_sundry_cost, total_higher_cost, tax_amount, grand_total)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`, 
      [id, req.user.account_id, client_id || null, job_name, status, summary_explanation || null, total_labor_hours, total_material_cost, total_equipment_cost, total_sundry_cost, total_higher_cost, tax_amount, grand_total]);

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

    await client.query(`UPDATE quotes SET job_name = $1, status = $2, summary_explanation = $3, client_id = $4, total_labor_hours = $5, total_material_cost = $6, total_equipment_cost = $7, total_sundry_cost = $8, total_higher_cost = $9, tax_amount = $10, grand_total = $11, updated_at = CURRENT_TIMESTAMP WHERE id = $12`,
      [updated.job_name, updated.status, updated.summary_explanation, updated.client_id, total_labor_hours, total_material_cost, total_equipment_cost, total_sundry_cost, total_higher_cost, tax_amount, grand_total, req.params.id]);

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
    const quoteRes = await query('SELECT id FROM quotes WHERE id = $1 AND account_id = $2', [req.params.id, req.user.account_id]);
    if (quoteRes.rowCount === 0) return res.status(404).json({ error: 'Quote not found' });

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

module.exports = router;
