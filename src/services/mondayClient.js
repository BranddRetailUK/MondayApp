// src/services/mondayClient.js
const axios = require('axios');
require('dotenv').config();

const MONDAY_API_URL = process.env.MONDAY_API_URL || 'https://api.monday.com/v2';

async function getAuthHeader() {
  const token = process.env.MONDAY_API_TOKEN;
  if (!token) throw new Error('MONDAY_API_TOKEN not configured');
  return { Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}` };
}

async function gql(query, variables = {}) {
  const headers = { 'Content-Type': 'application/json', ...(await getAuthHeader()) };
  const { data } = await axios.post(MONDAY_API_URL, { query, variables }, { headers });
  if (data.errors) {
    const msg = data.errors.map(e => e.message).join('; ');
    throw new Error(`Monday GQL error: ${msg}`);
  }
  return data.data;
}

async function getItemWithColumns(itemId) {
  const q = `
    query GetItem($id: [ID!]) {
      items (ids: $id) {
        id
        name
        group { id title }
        board { id }
        column_values { id text value type }
      }
    }
  `;
  const d = await gql(q, { id: Number(itemId) });
  if (!d.items || !d.items[0]) throw new Error(`Item ${itemId} not found`);
  return d.items[0];
}

/** Read the settings_str for a column and map label->index (case-insensitive) */
async function getStatusIndex(boardId, columnId, targetLabel) {
  const q = `
    query GetColSettings($boardId: [ID!], $colIds: [String!]) {
      boards (ids: $boardId) {
        columns (ids: $colIds) { id settings_str }
      }
    }
  `;
  const d = await gql(q, { boardId: Number(boardId), colIds: [columnId] });
  const col = d.boards?.[0]?.columns?.[0];
  if (!col?.settings_str) throw new Error(`No settings_str for column ${columnId}`);
  let settings;
  try { settings = JSON.parse(col.settings_str); } catch {}
  const labels = settings?.labels || settings?.labels_positions || {};
  const wanted = String(targetLabel).trim().toLowerCase();
  for (const [idx, label] of Object.entries(labels)) {
    if (String(label).trim().toLowerCase() === wanted) return Number(idx);
  }
  throw new Error(`Status label "${targetLabel}" not found on column ${columnId}`);
}

/** Set a status by label, internally resolves to an index and uses change_column_value */
async function setStatusByLabel(boardId, itemId, columnId, label) {
  const index = await getStatusIndex(boardId, columnId, label);
  const valueJson = JSON.stringify({ index });
  const q = `
    mutation SetStatus($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!) {
      change_column_value(board_id: $boardId, item_id: $itemId, column_id: $columnId, value: $value) { id }
    }
  `;
  console.log(`[mondayClient] setStatusByLabel -> label="${label}" index=${index} on column=${columnId}`);
  await gql(q, {
    boardId: Number(boardId),
    itemId: Number(itemId),
    columnId,
    value: valueJson
  });
}

async function postUpdate(itemId, body) {
  const q = `
    mutation AddUpdate($itemId: ID!, $body: String!) {
      create_update (item_id: $itemId, body: $body) { id }
    }
  `;
  await gql(q, { itemId: Number(itemId), body });
}

module.exports = {
  getItemWithColumns,
  setStatusByLabel,
  postUpdate,
};
