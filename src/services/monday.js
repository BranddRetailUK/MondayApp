const axios = require('axios');
const {
  MONDAY_CLIENT_ID, MONDAY_CLIENT_SECRET, MONDAY_REDIRECT_URI, MONDAY_SCOPES,
  MONDAY_API_TOKEN, BOARD_ID, BOARD_PAGE_LIMIT, BOARD_MAX_PAGES
} = require('../config/env');

let accessToken = MONDAY_API_TOKEN || null;

// OAuth helpers (unchanged)
function buildAuthorizeUrl() {
  const u = new URL('https://auth.monday.com/oauth2/authorize');
  u.searchParams.set('client_id', MONDAY_CLIENT_ID);
  u.searchParams.set('redirect_uri', MONDAY_REDIRECT_URI);
  u.searchParams.set('response_type', 'code');
  if (MONDAY_SCOPES) u.searchParams.set('scope', MONDAY_SCOPES);
  u.searchParams.set('state', 'monday-demo');
  return u.toString();
}
async function exchangeCodeForToken(code) {
  const { data } = await axios.post('https://auth.monday.com/oauth2/token', {
    code, client_id: MONDAY_CLIENT_ID, client_secret: MONDAY_CLIENT_SECRET, redirect_uri: MONDAY_REDIRECT_URI
  });
  accessToken = data.access_token;
  return accessToken;
}
function getAccessToken() { return accessToken; }

// GraphQL wrapper (unchanged)
async function gql(query, variables = {}) {
  if (!accessToken) throw new Error('Not authenticated with Monday');
  const { data } = await axios.post('https://api.monday.com/v2', { query, variables }, {
    headers: { Authorization: accessToken, 'Content-Type': 'application/json' }
  });
  if (data?.errors) throw new Error(JSON.stringify(data.errors));
  return data.data;
}

// Change a single column value (unchanged)
async function changeColumnValue(itemId, columnId, valueJson) {
  const query = `
    mutation ChangeValue($board: ID!, $item: ID!, $col: String!, $val: JSON!) {
      change_column_value(board_id: $board, item_id: $item, column_id: $col, value: $val) { id }
    }
  `;
  return gql(query, { board: String(BOARD_ID), item: String(itemId), col: columnId, val: valueJson });
}

// Paged board fetch with board and subitem column metadata for the dashboard.
async function fetchBoardLitePaged(limit = BOARD_PAGE_LIMIT, maxPages = BOARD_MAX_PAGES) {
  let cursor = null, pages = 0, items = [];
  let boardMeta = null;
  let subitemColumns = [];

  while (pages < maxPages) {
    const query = `
      query($boardId: [ID!], $limit: Int!, $cursor: String) {
        boards(ids: $boardId) {
          id
          name
          columns { id title type settings_str }
          groups { id title color position }
          items_page(limit: $limit, cursor: $cursor) {
            cursor
            items {
              id
              name
              group { id title color }
              column_values { id text type value }
              subitems {
                id
                name
                board {
                  id
                  columns { id title type settings_str }
                }
                column_values { id text type value }
              }
            }
          }
        }
      }
    `;
    const vars = { boardId: [String(BOARD_ID)], limit, cursor };
    const data = await gql(query, vars);
    const boardObj = data?.boards?.[0];
    if (!boardObj) break;
    if (!boardMeta) {
      boardMeta = {
        id: boardObj.id,
        name: boardObj.name,
        columns: boardObj.columns || [],
        groups: boardObj.groups || []
      };
    }

    const pageObj = boardObj.items_page;
    if (!pageObj) break;

    const pageItems = pageObj.items || [];
    for (const item of pageItems) {
      for (const subitem of (item.subitems || [])) {
        if (!subitemColumns.length && subitem?.board?.columns?.length) {
          subitemColumns = subitem.board.columns;
        }
        if (subitem?.board) {
          subitem.board = { id: subitem.board.id };
        }
      }
    }

    items = items.concat(pageItems);
    cursor = pageObj.cursor || null;
    pages++;
    if (!cursor) break;
  }

  // Preserve Monday group ordering and colors rather than ordering by first item seen.
  const grouped = new Map();
  for (const it of items) {
    const key = it?.group?.id || it?.group?.title || 'ungrouped';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push({
      id: it.id,
      name: it.name,
      group: it.group || null,
      column_values: it.column_values || [],
      subitems: it.subitems || []
    });
  }

  const knownGroupKeys = new Set();
  const groups = (boardMeta?.groups || []).map(group => {
    knownGroupKeys.add(group.id);
    return {
      id: group.id,
      title: group.title,
      color: group.color,
      position: group.position,
      items_page: { items: grouped.get(group.id) || [] }
    };
  });

  for (const [key, arr] of grouped.entries()) {
    if (knownGroupKeys.has(key)) continue;
    const firstGroup = arr[0]?.group || {};
    groups.push({
      id: firstGroup.id || key,
      title: firstGroup.title || 'Ungrouped',
      color: firstGroup.color || null,
      position: null,
      items_page: { items: arr }
    });
  }

  return {
    boards: [{
      id: boardMeta?.id || BOARD_ID,
      name: boardMeta?.name || '',
      columns: boardMeta?.columns || [],
      subitemColumns,
      groups
    }]
  };
}

// Upload a file to a Files column for a given item
async function addFileToColumn(itemId, columnId, fileBuffer, filename) {
  if (!accessToken) throw new Error('Not authenticated with Monday');
  const FormData = require('form-data');
  const formData = new FormData();

  const query = `
    mutation ($file: File!, $itemId: ID!, $columnId: String!) {
      add_file_to_column (file: $file, item_id: $itemId, column_id: $columnId) { id }
    }
  `;

  formData.append('query', query);
  formData.append('variables', JSON.stringify({ itemId: String(itemId), columnId }));
  formData.append('map', JSON.stringify({ "0": ["variables.file"] }));
  formData.append('0', fileBuffer, { filename });

  const { data } = await axios.post('https://api.monday.com/v2/file', formData, {
    headers: {
      Authorization: accessToken,
      ...formData.getHeaders()
    },
    maxContentLength: Infinity,
    maxBodyLength: Infinity
  });

  if (data?.errors) {
    const msg = data.errors.map(e => e.message || e).join('; ');
    throw new Error(`Monday upload error: ${msg}`);
  }
  return data?.data?.add_file_to_column || null;
}

module.exports = {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  getAccessToken,
  changeColumnValue,
  fetchBoardLitePaged,
  addFileToColumn
};
