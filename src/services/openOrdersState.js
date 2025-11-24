// src/services/openOrdersState.js
const fs = require('fs');
const path = require('path');

const STATE_PATH =
  process.env.OPEN_ORDERS_STATE_PATH ||
  path.join(__dirname, '..', '..', 'data', 'open-orders-state.json');

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadState() {
  try {
    const raw = fs.readFileSync(STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : { jobs: {} };
  } catch (err) {
    return { jobs: {} };
  }
}

function saveState(state) {
  ensureDir(STATE_PATH);
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function hasJob(state, jobNumber) {
  if (!jobNumber) return false;
  return Boolean(state.jobs && state.jobs[jobNumber]);
}

function setJobState(state, jobNumber, { itemId = null, signature = null }) {
  if (!jobNumber) return;
  const now = new Date().toISOString();
  const existing = state.jobs[jobNumber] || {};
  state.jobs[jobNumber] = {
    itemId: itemId || existing.itemId || null,
    signature: signature || existing.signature || null,
    createdAt: existing.createdAt || now,
    updatedAt: now,
  };
}

function markJobCreated(state, jobNumber, itemId, signature = null) {
  setJobState(state, jobNumber, { itemId, signature });
}

function markJobUpdated(state, jobNumber, itemId, signature = null) {
  setJobState(state, jobNumber, { itemId, signature });
}

module.exports = {
  STATE_PATH,
  loadState,
  saveState,
  hasJob,
  markJobCreated,
  markJobUpdated,
};
