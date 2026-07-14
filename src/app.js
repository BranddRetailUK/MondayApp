// app.js
const path = require('path');
const express = require('express');
const app = express();
const publicDir = path.join(__dirname, '..', 'public');

const { attachHubUser, requireHubApiAuth, requireHubPageAuth } = require('./middleware/hubAuth');
const testDashboardRoutes = require('./routes/test-dashboard');

// ---- parse JSON BEFORE routes
app.use(express.json());
app.use(attachHubUser);

app.use(require('./routes/hub-auth'));

app.get(['/', '/index.html'], requireHubPageAuth, (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});
app.get('/database-job.html', requireHubPageAuth, (req, res) => {
  res.sendFile(path.join(publicDir, path.basename(req.path)));
});

// Static
app.use(express.static(publicDir, { index: false }));

// Health/status
app.get('/api/status', (_req, res) => {
  res.json({
    ok: true,
    hubAuthenticated: Boolean(_req.hubUser),
  });
});
app.get('/health', (_req, res) => res.json({ ok: true }));

// Routers
app.use(testDashboardRoutes.publicRouter);
app.use(requireHubApiAuth, require('./routes/database'));
app.use(requireHubApiAuth, testDashboardRoutes.protectedRouter);

// 404
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Server error' });
});

module.exports = app;
