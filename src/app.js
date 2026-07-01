// app.js
const path = require('path');
const express = require('express');
const app = express();
const publicDir = path.join(__dirname, '..', 'public');

const { PORT } = require('./config/env');
const { getAccessToken } = require('./services/monday');
const { attachHubUser, requireHubApiAuth, requireHubPageAuth } = require('./middleware/hubAuth');
const visualJobs = require('./routes/visual-jobs');
const visualApprovals = require('./routes/visual-approvals');
const filesRoute = require('./routes/files');
const testDashboardRoutes = require('./routes/test-dashboard');


// ---- parse JSON BEFORE routes
app.use(express.json());
app.use(attachHubUser);

app.use(require('./routes/hub-auth'));
app.use(require('./routes/auth'));

app.get(['/', '/index.html'], requireHubPageAuth, (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});
app.get(['/database-job.html', '/launch.html'], requireHubPageAuth, (req, res) => {
  res.sendFile(path.join(publicDir, path.basename(req.path)));
});

// Static
app.use(express.static(publicDir, { index: false }));

// Health/status
app.get('/api/status', (_req, res) => {
  res.json({
    ok: true,
    mondayAuthenticated: Boolean(getAccessToken()),
    hubAuthenticated: Boolean(_req.hubUser),
  });
});
app.get('/health', (_req, res) => res.json({ ok: true }));

// Machine-to-machine webhooks must stay before Hub API auth middleware.
app.use('/api/monday', require('./routes/monday-events'));
app.use('/api/dropbox', require('./routes/dropbox-webhook'));
console.log('[boot] monday-events mounted at /api/monday');

// Routers
app.use(testDashboardRoutes.publicRouter);
app.use(requireHubApiAuth, require('./routes/board'));
app.use(require('./routes/scanner'));
app.use(requireHubApiAuth, require('./routes/database'));
app.use(requireHubApiAuth, testDashboardRoutes.protectedRouter);
app.use('/api/visual-jobs', visualJobs);
app.use(requireHubApiAuth, visualApprovals);
app.use(requireHubApiAuth, filesRoute);

// 404
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Server error' });
});

module.exports = app;
