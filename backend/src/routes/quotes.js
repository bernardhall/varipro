const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../db/database');
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
router.get('/', (req, res) => {
  const db = getDb();
  const { status, search } = req.query;
  let query = `
    SELECT q.*, c.full_name as client_name, c.site_address
    FROM quotes q
    LEFT JOIN clients c ON q.client_id = c.id
    WHERE q.account_id = ?
  `;
  const params = [req.user.account_id];
  if (status && status !== 'all') { query += ' AND q.status = ?'; params.push(status); }
  if (search) { query += ' AND (q.job_name LIKE ? OR c.full_name LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  query += ' ORDER BY q.updated_at DESC';

  const quotes = db.prepare(query).all(...params);
  res.json(quotes);
});

// GET /quotes/:id
router.get('/:id', (req, res) => {
  const db = getDb();
  const quote = db.prepare('SELECT q.*, c.full_name as client_name FROM quotes q LEFT JOIN clients c ON q.client_id = c.id WHERE q.id = ? AND q.account_id = ?').get(req.params.id, req.user.account_id);
  if (!quote) return res.status(404).json({ error: 'Quote not found' });

  quote.tasks = db.prepare('SELECT * FROM quote_tasks WHERE quote_id = ?').all(req.params.id);
  quote.materials = db.prepare('SELECT * FROM quote_materials WHERE quote_id = ?').all(req.params.id);
  quote.equipment = db.prepare('SELECT * FROM quote_equipment WHERE quote_id = ?').all(req.params.id);
  quote.sundry = db.prepare('SELECT * FROM quote_sundry WHERE quote_id = ?').all(req.params.id);
  quote.higher_costs = db.prepare('SELECT * FROM quote_higher_costs WHERE quote_id = ?').all(req.params.id);
  quote.photos = db.prepare('SELECT * FROM quote_photos WHERE quote_id = ? ORDER BY sort_order').all(req.params.id);

  res.json(quote);
});

// POST /quotes
router.post('/', (req, res) => {
  const db = getDb();
  const { client_id, job_name, status = 'draft', summary_explanation, tasks = [], materials = [], equipment = [], sundry = [], higher_costs = [] } = req.body;
  if (!job_name) return res.status(400).json({ error: 'job_name required' });

  const id = uuidv4();
  
  // Fetch account settings for rates
  const accountSettings = db.prepare('SELECT default_hourly_rate, tax_rate FROM accounts WHERE account_id = ?').get(req.user.account_id);
  const default_hourly_rate = accountSettings?.default_hourly_rate || 75;
  const tax_rate = accountSettings?.tax_rate || 0;

  // Calculate totals
  let labor_cost = 0;
  let total_labor_hours = 0;
  for (const t of tasks) {
    if (t.task_type === 'set') {
      labor_cost += parseFloat(t.price) || 0;
    } else if (t.task_type === 'charge') {
      // Open-ended task: only has a rate, no fixed total hours/cost
      // We don't add to labor_cost here
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

  db.transaction(() => {
    db.prepare(`INSERT INTO quotes (id, account_id, client_id, job_name, status, summary_explanation, total_labor_hours, total_material_cost, total_equipment_cost, total_sundry_cost, total_higher_cost, tax_amount, grand_total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, req.user.account_id, client_id || null, job_name, status, summary_explanation || null, total_labor_hours, total_material_cost, total_equipment_cost, total_sundry_cost, total_higher_cost, tax_amount, grand_total);

    for (const t of tasks) {
      db.prepare('INSERT INTO quote_tasks (id, quote_id, task_name, task_type, estimated_hours, hourly_rate, price) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(uuidv4(), id, t.task_name, t.task_type || 'hourly', parseFloat(t.estimated_hours) || 0, parseFloat(t.hourly_rate) || default_hourly_rate, parseFloat(t.price) || 0);
    }
    for (const m of materials) db.prepare('INSERT INTO quote_materials (id, quote_id, item_name, quantity, unit_cost, total) VALUES (?, ?, ?, ?, ?, ?)').run(uuidv4(), id, m.item_name, m.quantity || 1, m.unit_cost || 0, (m.quantity || 1) * (m.unit_cost || 0));
    for (const e of equipment) db.prepare('INSERT INTO quote_equipment (id, quote_id, item_name, duration_days, daily_rate, total) VALUES (?, ?, ?, ?, ?, ?)').run(uuidv4(), id, e.item_name, e.duration_days || 1, e.daily_rate || 0, (e.duration_days || 1) * (e.daily_rate || 0));
    for (const s of sundry) db.prepare('INSERT INTO quote_sundry (id, quote_id, description, flat_amount) VALUES (?, ?, ?, ?)').run(uuidv4(), id, s.description, s.flat_amount || 0);
    for (const h of higher_costs) db.prepare('INSERT INTO quote_higher_costs (id, quote_id, description, amount) VALUES (?, ?, ?, ?)').run(uuidv4(), id, h.description, h.amount || 0);
  })();

  res.status(201).json({ id, grand_total, status });
});

// PUT /quotes/:id
router.put('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM quotes WHERE id = ? AND account_id = ?').get(req.params.id, req.user.account_id);
  if (!existing) return res.status(404).json({ error: 'Quote not found' });

  const { job_name, status, summary_explanation, client_id, tasks, materials, equipment, sundry, higher_costs } = req.body;

  db.transaction(() => {
    // Collect updated data (prioritize req.body over existing)
    const updated = {
      job_name: job_name || existing.job_name,
      status: status || existing.status,
      summary_explanation: summary_explanation !== undefined ? summary_explanation : existing.summary_explanation,
      client_id: client_id !== undefined ? client_id : existing.client_id,
      tasks: tasks || db.prepare('SELECT * FROM quote_tasks WHERE quote_id = ?').all(req.params.id),
      materials: materials || db.prepare('SELECT * FROM quote_materials WHERE quote_id = ?').all(req.params.id),
      equipment: equipment || db.prepare('SELECT * FROM quote_equipment WHERE quote_id = ?').all(req.params.id),
      sundry: sundry || db.prepare('SELECT * FROM quote_sundry WHERE quote_id = ?').all(req.params.id),
      higher_costs: higher_costs || db.prepare('SELECT * FROM quote_higher_costs WHERE quote_id = ?').all(req.params.id)
    };

    const accountSettings = db.prepare('SELECT default_hourly_rate, tax_rate FROM accounts WHERE account_id = ?').get(req.user.account_id);
    const default_hourly_rate = accountSettings?.default_hourly_rate || 75;
    const tax_rate = accountSettings?.tax_rate || 0;

    // Recalculate
    let labor_cost = 0;
    let total_labor_hours = 0;
    for (const t of updated.tasks) {
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

    const total_material_cost = updated.materials.reduce((s, m) => s + (parseFloat(m.quantity) || 0) * (parseFloat(m.unit_cost) || 0), 0);
    const total_equipment_cost = updated.equipment.reduce((s, e) => s + (parseFloat(e.duration_days) || 0) * (parseFloat(e.daily_rate) || 0), 0);
    const total_sundry_cost = updated.sundry.reduce((s, su) => s + (parseFloat(su.flat_amount) || 0), 0);
    const total_higher_cost = updated.higher_costs.reduce((s, h) => s + (parseFloat(h.amount) || 0), 0);

    const subtotal = labor_cost + total_material_cost + total_equipment_cost + total_sundry_cost + total_higher_cost;
    const tax_amount = subtotal * (tax_rate / 100);
    const grand_total = subtotal + tax_amount;

    db.prepare(`UPDATE quotes SET job_name = ?, status = ?, summary_explanation = ?, client_id = ?, total_labor_hours = ?, total_material_cost = ?, total_equipment_cost = ?, total_sundry_cost = ?, total_higher_cost = ?, tax_amount = ?, grand_total = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(updated.job_name, updated.status, updated.summary_explanation, updated.client_id, total_labor_hours, total_material_cost, total_equipment_cost, total_sundry_cost, total_higher_cost, tax_amount, grand_total, req.params.id);

    if (tasks) {
      db.prepare('DELETE FROM quote_tasks WHERE quote_id = ?').run(req.params.id);
      for (const t of tasks) {
        db.prepare('INSERT INTO quote_tasks (id, quote_id, task_name, task_type, estimated_hours, hourly_rate, price) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(uuidv4(), req.params.id, t.task_name, t.task_type || 'hourly', parseFloat(t.estimated_hours) || 0, parseFloat(t.hourly_rate) || default_hourly_rate, parseFloat(t.price) || 0);
      }
    }
    if (materials) {
      db.prepare('DELETE FROM quote_materials WHERE quote_id = ?').run(req.params.id);
      for (const m of materials) db.prepare('INSERT INTO quote_materials (id, quote_id, item_name, quantity, unit_cost, total) VALUES (?, ?, ?, ?, ?, ?)').run(uuidv4(), req.params.id, m.item_name, m.quantity || 1, m.unit_cost || 0, (m.quantity || 1) * (m.unit_cost || 0));
    }
    if (equipment) {
      db.prepare('DELETE FROM quote_equipment WHERE quote_id = ?').run(req.params.id);
      for (const e of equipment) db.prepare('INSERT INTO quote_equipment (id, quote_id, item_name, duration_days, daily_rate, total) VALUES (?, ?, ?, ?, ?, ?)').run(uuidv4(), req.params.id, e.item_name, e.duration_days || 1, e.daily_rate || 0, (e.duration_days || 1) * (e.daily_rate || 0));
    }
    if (sundry) {
      db.prepare('DELETE FROM quote_sundry WHERE quote_id = ?').run(req.params.id);
      for (const s of sundry) db.prepare('INSERT INTO quote_sundry (id, quote_id, description, flat_amount) VALUES (?, ?, ?, ?)').run(uuidv4(), req.params.id, s.description, s.flat_amount || 0);
    }
    if (higher_costs) {
      db.prepare('DELETE FROM quote_higher_costs WHERE quote_id = ?').run(req.params.id);
      for (const h of higher_costs) db.prepare('INSERT INTO quote_higher_costs (id, quote_id, description, amount) VALUES (?, ?, ?, ?)').run(uuidv4(), req.params.id, h.description, h.amount || 0);
    }
  })();

  res.json({ message: 'Quote updated' });
});

// DELETE /quotes/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM quotes WHERE id = ? AND account_id = ?').run(req.params.id, req.user.account_id);
  if (result.changes === 0) return res.status(404).json({ error: 'Quote not found' });
  res.json({ message: 'Quote deleted' });
});

// POST /quotes/:id/photos
router.post('/:id/photos', upload.array('photos', 20), (req, res) => {
  const db = getDb();
  const quote = db.prepare('SELECT id FROM quotes WHERE id = ? AND account_id = ?').get(req.params.id, req.user.account_id);
  if (!quote) return res.status(404).json({ error: 'Quote not found' });

  const inserted = [];
  for (let i = 0; i < req.files.length; i++) {
    const file = req.files[i];
    const photo_id = uuidv4();
    const uri = `/uploads/${file.filename}`;
    db.prepare('INSERT INTO quote_photos (id, quote_id, image_uri, sort_order, sync_status) VALUES (?, ?, ?, ?, ?)').run(photo_id, req.params.id, uri, i, 'synced');
    inserted.push({ id: photo_id, image_uri: uri });
  }
  res.status(201).json(inserted);
});

module.exports = router;
