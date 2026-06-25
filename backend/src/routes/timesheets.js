const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { query } = require('../db/database');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// GET /timesheets/accepted-quotes - Fetch accepted quotes for dropdown
router.get('/accepted-quotes', async (req, res) => {
  try {
    const sql = `
      SELECT q.id, q.job_name, c.full_name as client_name 
      FROM quotes q
      LEFT JOIN clients c ON q.client_id = c.id
      WHERE q.account_id = $1 AND q.status = 'accepted'
      ORDER BY q.updated_at DESC
    `;
    const result = await query(sql, [req.user.account_id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /timesheets - Get user's timesheet logs for the day / list
router.get('/', async (req, res) => {
  try {
    const sql = `
      SELECT t.*, q.job_name, c.full_name as client_name
      FROM timesheet_entries t
      LEFT JOIN quotes q ON t.quote_id = q.id
      LEFT JOIN clients c ON q.client_id = c.id
      WHERE t.account_id = $1 AND t.user_id = $2
      ORDER BY t.created_at DESC
    `;
    const result = await query(sql, [req.user.account_id, req.user.user_id]);
    const entries = result.rows;

    // Fetch events for each entry
    for (const entry of entries) {
      const eventsRes = await query(
        'SELECT * FROM timesheet_events WHERE timesheet_id = $1 ORDER BY created_at ASC',
        [entry.id]
      );
      entry.events = eventsRes.rows;
    }

    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /timesheets/start - Start a new timesheet session
router.post('/start', async (req, res) => {
  try {
    const { quote_id, task_name, notes, latitude, longitude } = req.body;
    if (!quote_id) return res.status(400).json({ error: 'quote_id is required' });

    // Check if there is an active timesheet for the user
    const activeRes = await query(
      "SELECT id FROM timesheet_entries WHERE user_id = $1 AND status != 'stopped'",
      [req.user.user_id]
    );
    if (activeRes.rowCount > 0) {
      return res.status(409).json({ error: 'You already have an active timesheet session running.' });
    }

    const timesheetId = uuidv4();
    const eventId = uuidv4();

    // Insert Entry
    await query(
      `INSERT INTO timesheet_entries (id, account_id, user_id, quote_id, task_name, notes, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'working')`,
      [timesheetId, req.user.account_id, req.user.user_id, quote_id, task_name || null, notes || null]
    );

    // Insert Start Event
    await query(
      `INSERT INTO timesheet_events (id, timesheet_id, event_type, latitude, longitude)
       VALUES ($1, $2, 'start', $3, $4)`,
      [eventId, timesheetId, latitude || null, longitude || null]
    );

    res.status(201).json({ id: timesheetId, status: 'working' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /timesheets/:id/event - Log a timesheet event (pause, resume, stop)
router.post('/:id/event', async (req, res) => {
  try {
    const { event_type, latitude, longitude, task_name, notes } = req.body;
    const timesheetId = req.params.id;

    if (!['pause', 'resume', 'stop'].includes(event_type)) {
      return res.status(400).json({ error: 'Invalid event type' });
    }

    // Verify timesheet exists and belongs to user
    const entryRes = await query(
      'SELECT id, status FROM timesheet_entries WHERE id = $1 AND user_id = $2',
      [timesheetId, req.user.user_id]
    );
    const entry = entryRes.rows[0];
    if (!entry) return res.status(404).json({ error: 'Active timesheet not found' });
    if (entry.status === 'stopped') {
      return res.status(400).json({ error: 'Timesheet session has already been stopped.' });
    }

    const eventId = uuidv4();
    let newStatus = entry.status;

    if (event_type === 'pause') {
      newStatus = 'paused';
    } else if (event_type === 'resume') {
      newStatus = 'working';
    } else if (event_type === 'stop') {
      newStatus = 'stopped';
    }

    // Log the event
    await query(
      `INSERT INTO timesheet_events (id, timesheet_id, event_type, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5)`,
      [eventId, timesheetId, event_type, latitude || null, longitude || null]
    );

    // Update the parent status and fields (like updating notes/task on save/stop)
    await query(
      `UPDATE timesheet_entries 
       SET status = $1, 
           task_name = COALESCE($2, task_name),
           notes = COALESCE($3, notes),
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = $4`,
      [newStatus, task_name || null, notes || null, timesheetId]
    );

    res.json({ id: timesheetId, status: newStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
