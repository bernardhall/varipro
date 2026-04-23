const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const quotesRoutes = require('./routes/quotes');
const accountsRoutes = require('./routes/accounts');
const clientsUsersRoutes = require('./routes/clientsUsers');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health check (must be before authenticated routes)
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Routes
app.use('/auth', authRoutes);
app.use('/quotes', quotesRoutes);
app.use('/account', accountsRoutes);
app.use('/', clientsUsersRoutes);

// 404
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

const { initSchema } = require('./db/database');

const startServer = async () => {
  try {
    // Initialize DB schema (async for Postgres)
    if (process.env.DATABASE_URL) {
      console.log('Connecting to PostgreSQL...');
      await initSchema();
      console.log('PostgreSQL schema initialized.');
    }

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`VariPro API running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Critical Failure: Could not start server', err);
    process.exit(1);
  }
};

startServer();

module.exports = app;