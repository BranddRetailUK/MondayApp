const express = require('express');
const router = express.Router();
const {
  changeColumnValue,
  fetchBoardColumn,
  fetchBoardLitePaged,
  getAccessToken
} = require('../services/monday');
const { BOARD_CACHE_MS, STATUS_COLUMN_ID } = require('../config/env');

let cache = { data: null, expires: 0, inFlight: null };
const EDITABLE_DASHBOARD_STATUS_COLUMN_TITLES = new Set(['STATUS', 'PRIORITY']);

function clearBoardCache() {
  cache.data = null;
  cache.expires = 0;
  cache.inFlight = null;
}

router.get('/api/board', async (req, res) => {
  if (!getAccessToken()) return res.status(401).json({ error: 'Not authenticated. Visit /auth first.' });

  const now = Date.now();
  const forceFresh =
    req.query.fresh === '1' ||
    req.query.refresh === '1' ||
    /\bno-cache\b/i.test(req.get('cache-control') || '');

  if (!forceFresh && cache.data && cache.expires > now) return res.json(cache.data);
  if (!forceFresh && cache.inFlight) {
    try { const d = await cache.inFlight; return res.json(d); }
    catch (_) { cache.inFlight = null; }
  }
  const inFlight = fetchBoardLitePaged();
  cache.inFlight = inFlight;
  try {
    const data = await inFlight;
    if (cache.inFlight === inFlight) {
      cache.data = data;
      cache.expires = Date.now() + BOARD_CACHE_MS;
    }
    return res.json(data);
  } catch (e) {
    console.error('board fetch failed:', e.message);
    return res.status(500).json({ error: 'Failed to fetch board' });
  } finally {
    if (cache.inFlight === inFlight) cache.inFlight = null;
  }
});

router.put('/api/board/items/:itemId/status-column', updateDashboardStatusColumn);
router.put('/api/board/items/:itemId/job-status', updateDashboardStatusColumn);

async function updateDashboardStatusColumn(req, res) {
  if (!getAccessToken()) return res.status(401).json({ error: 'Not authenticated. Visit /auth first.' });

  const itemId = String(req.params.itemId || '').trim();
  const columnId = String(req.body?.columnId || '').trim();
  const requestedLabel = String(req.body?.label || '').trim();

  if (!/^\d+$/.test(itemId)) return res.status(400).json({ error: 'Invalid item id' });
  if (!columnId) return res.status(400).json({ error: 'columnId is required' });
  if (!requestedLabel) return res.status(400).json({ error: 'label is required' });

  try {
    const column = await fetchBoardColumn(columnId);
    if (!column) return res.status(404).json({ error: 'Status column not found' });
    if (column.type !== 'status') return res.status(400).json({ error: 'Column is not a Monday status column' });
    const matchesConfiguredColumn = Boolean(STATUS_COLUMN_ID && columnId === STATUS_COLUMN_ID);
    const normalizedTitle = normalizeColumnTitle(column.title);
    const matchesEditableDashboardColumn = EDITABLE_DASHBOARD_STATUS_COLUMN_TITLES.has(normalizedTitle);
    if (!matchesConfiguredColumn && !matchesEditableDashboardColumn) {
      return res.status(400).json({ error: 'Only dashboard STATUS and PRIORITY columns can be updated' });
    }

    const matchedLabel = findConfiguredStatusLabel(column.settings_str, requestedLabel);
    if (!matchedLabel) {
      return res.status(400).json({ error: 'Status label is not configured on that dashboard column' });
    }

    await changeColumnValue(itemId, columnId, JSON.stringify({ label: matchedLabel }));
    clearBoardCache();
    return res.json({
      ok: true,
      itemId,
      columnId,
      columnTitle: column.title || columnId,
      label: matchedLabel
    });
  } catch (e) {
    console.error('dashboard status-column update failed:', e.message);
    return res.status(500).json({ error: 'Failed to update dashboard status column' });
  }
}

function findConfiguredStatusLabel(settingsStr, requestedLabel) {
  const settings = parseJsonMaybe(settingsStr) || {};
  const labels = settings.labels || {};
  const wanted = normalizeStatusLabel(requestedLabel);
  for (const label of Object.values(labels)) {
    const cleanLabel = String(label || '').trim();
    if (cleanLabel && normalizeStatusLabel(cleanLabel) === wanted) return cleanLabel;
  }
  return null;
}

function normalizeStatusLabel(label) {
  return String(label || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeColumnTitle(title) {
  return String(title || '').trim().replace(/\s+/g, ' ').toUpperCase();
}

function parseJsonMaybe(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

module.exports = router;
