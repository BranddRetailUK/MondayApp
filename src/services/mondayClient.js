// src/services/mondayClient.js
const axios = require('axios');
require('dotenv').config();

const MONDAY_API_URL = process.env.MONDAY_API_URL || 'https://api.monday.com/v2';

// If you have an OAuth token helper, swap this to use it.
// For now we read MONDAY_API_TOKEN from env.
async function getAuthHeader() {
  const token = process.env.MONDAY_API_TOKEN;
  if (!token) throw new Error('MONDAY_API_TOKEN not configured and no OAuth token helper wired');
  return { Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}` };
}

async function gql(query, variables = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(await getAuthHeader())
  };
  const { data } = await axios.post(MONDAY_API_URL, { query, variables }, { headers });
  if (data.errors) {
    const msg = data.errors.map(e => e.message).join('; ');
    throw new Error(`Monday GQL error: ${msg}`);
  }
  return data.data;
}

/** Read item name (Customer) + all column_values + group + board id */
async function getItemWithColumns(itemId) {
  const q = `
    query GetItem($id: [ID!]) {
      items (ids: $id) {
        id
        name
        group { id title }
        board { id }
        column_values {
          id
          text
          value
          type
        }
      }
    }
  `;
  const d = await gql(q, { id: Number(itemId) });
  if (!d.items || !d.items[0]) throw new Error(`Item ${itemId} not found`);
  return d.items[0];
}

/** Set status by label (requires board_id on your account) */
async function setStatusLabel(boardId, itemId, columnId, label) {
  const q = `
    mutation SetStatus($boardId: ID!, $itemId: ID!, $columnId: String!, $value: String!) {
      change_simple_column_value(
        board_id: $boardId,
        item_id: $itemId,
        column_id: $columnId,
        value: $value
      ) { id }
    }
  `;
  await gql(q, {
    boardId: Number(boardId),
    itemId: Number(itemId),
    columnId,
    value: label
  });
}

/** Post an update (no board_id required) */
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
  setStatusLabel,
  postUpdate,
};
