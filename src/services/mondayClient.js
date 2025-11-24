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
        subitems {
          id
          name
          board { id }
          column_values { id text value type }
        }
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

async function setTextColumnValue(boardId, itemId, columnId, value) {
  const q = `
    mutation SetText($boardId: ID!, $itemId: ID!, $columnId: String!, $value: String!) {
      change_simple_column_value(board_id: $boardId, item_id: $itemId, column_id: $columnId, value: $value) { id }
    }
  `;
  await gql(q, {
    boardId: Number(boardId),
    itemId: Number(itemId),
    columnId,
    value: value != null ? String(value) : '',
  });
}

async function archiveItem(itemId) {
  const q = `
    mutation ArchiveItem($itemId: ID!) {
      archive_item (item_id: $itemId) { id }
    }
  `;
  await gql(q, { itemId: Number(itemId) });
}

async function deleteItem(itemId) {
  const q = `
    mutation DeleteItem($itemId: ID!) {
      delete_item (item_id: $itemId) { id }
    }
  `;
  await gql(q, { itemId: Number(itemId) });
}

async function setItemName(boardId, itemId, name) {
  // Monday’s public API for this workspace does not expose an item-name mutation.
  // Keep the signature so callers can no-op gracefully.
  throw new Error('Item renaming not supported on this Monday plan/API');
}

async function postUpdate(itemId, body) {
  const q = `
    mutation AddUpdate($itemId: ID!, $body: String!) {
      create_update (item_id: $itemId, body: $body) { id }
    }
  `;
  await gql(q, { itemId: Number(itemId), body });
}

async function findItemsByColumnValue(boardId, columnId, compareValue, limit = 5) {
  const q = `
    query FindItems($boardId: ID!, $columnId: String!, $value: String!, $limit: Int!) {
      items_page_by_column_values(
        board_id: $boardId,
        columns: [{ column_id: $columnId, column_values: [$value] }],
        limit: $limit
      ) {
        items {
          id
          name
          column_values { id text value }
        }
      }
    }
  `;
  const resp = await gql(q, {
    boardId: Number(boardId),
    columnId,
    value: String(compareValue),
    limit,
  });
  const items = resp.items_page_by_column_values?.items || [];
  return items;
}

async function createSubitem(parentItemId, itemName, columnValues = {}) {
  const q = `
    mutation CreateSubitem($parentId: ID!, $name: String!, $cols: JSON) {
      create_subitem(parent_item_id: $parentId, item_name: $name, column_values: $cols) { id }
    }
  `;
  const columnsJson =
    columnValues && Object.keys(columnValues).length > 0
      ? JSON.stringify(columnValues)
      : null;
  const resp = await gql(q, {
    parentId: Number(parentItemId),
    name: itemName,
    cols: columnsJson,
  });
  return resp.create_subitem?.id;
}

const ITEM_FRAGMENT = `
  id
  name
  group { id title }
  column_values { id text value }
`;

async function listBoardItems(boardId, { perPage = 100, maxPages = 20 } = {}) {
  const firstQuery = `
    query ItemsPage($boardId: [ID!], $limit: Int!) {
      boards(ids: $boardId) {
        items_page(limit: $limit) {
          cursor
          items { ${ITEM_FRAGMENT} }
        }
      }
    }
  `;

  const nextQuery = `
    query NextItems($cursor: String!) {
      next_items_page(cursor: $cursor) {
        cursor
        items { ${ITEM_FRAGMENT} }
      }
    }
  `;

  let currentPage = await gql(firstQuery, {
    boardId: [Number(boardId)],
    limit: perPage,
  });
  let payload = currentPage.boards?.[0]?.items_page;
  let pagesRead = 0;
  const items = [];

  while (payload && pagesRead < maxPages) {
    pagesRead += 1;
    if (Array.isArray(payload.items)) items.push(...payload.items);

    if (!payload.cursor) break;
    const next = await gql(nextQuery, { cursor: payload.cursor });
    payload = next.next_items_page;
  }

  return items;
}

async function findItemByNamePrefix(boardId, prefix, options = {}) {
  const items = await listBoardItems(boardId, options);
  return items.find(item => item.name?.startsWith(String(prefix))) || null;
}

async function createItem(boardId, groupId, itemName, columnValues = {}) {
  const q = `
    mutation CreateItem($boardId: ID!, $groupId: String, $itemName: String!, $columnValues: JSON) {
      create_item(board_id: $boardId, group_id: $groupId, item_name: $itemName, column_values: $columnValues) {
        id
      }
    }
  `;
  const columnJson =
    columnValues && Object.keys(columnValues).length > 0
      ? JSON.stringify(columnValues)
      : null;
  const resp = await gql(q, {
    boardId: Number(boardId),
    groupId: groupId || null,
    itemName,
    columnValues: columnJson,
  });
  return resp.create_item?.id;
}

module.exports = {
  getItemWithColumns,
  setStatusByLabel,
  postUpdate,
  findItemsByColumnValue,
  createSubitem,
  findItemByNamePrefix,
  listBoardItems,
  createItem,
  setTextColumnValue,
  archiveItem,
  deleteItem,
  setItemName,
};
