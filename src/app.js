// app.js
const path = require('path');
const express = require('express');
const app = express();

const { PORT } = require('./config/env');
const { getAccessToken } = require('./services/monday');
const pencarrieRouter = require('./routes/pencarrie');
const pencarrieSmoke = require('./routes/pencarrie-smoke');
const visualJobs = require('./routes/visual-jobs');
const filesRoute = require('./routes/files');


// ---- parse JSON BEFORE routes
app.use(express.json());

// Static
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Health/status
app.get('/api/status', (_req, res) => {
  res.json({ ok: true, mondayAuthenticated: Boolean(getAccessToken()) });
});
app.get('/health', (_req, res) => res.json({ ok: true }));

// Routers
app.use(require('./routes/auth'));
app.use(require('./routes/board'));
app.use(require('./routes/scanner'));
app.use(require('./routes/customers'));
app.use(require('./routes/orders'));
app.use('/api/visual-jobs', visualJobs);
app.use(filesRoute);

// Monday webhook routes
app.use('/api/monday', require('./routes/monday-events'));
app.use('/api/dropbox', require('./routes/dropbox-webhook'));
console.log('[boot] monday-events mounted at /api/monday');

// PenCarrie routes
app.use('/api/pencarrie', pencarrieRouter);
app.use('/api/pencarrie', pencarrieSmoke);


// 404
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Server error' });
});

module.exports = app;
