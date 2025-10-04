const path = require('path');
const express = require('express');
const app = express();

const { PORT } = require('./config/env');
const { getAccessToken } = require('./services/monday');

// Static
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Health/status
app.get('/api/status', (_req, res) => {
  res.json({ ok: true, mondayAuthenticated: Boolean(getAccessToken()) });
});

// Routers
app.use(require('./routes/auth'));
app.use(require('./routes/board'));
app.use(require('./routes/scanner'));
app.use(require('./routes/customers'));
app.use(require('./routes/orders'));

// 404
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Server error' });
});

module.exports = app;
