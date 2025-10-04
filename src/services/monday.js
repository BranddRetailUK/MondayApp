const axios = require('axios');
const {
  MONDAY_CLIENT_ID, MONDAY_CLIENT_SECRET, MONDAY_REDIRECT_URI, MONDAY_SCOPES,
  MONDAY_API_TOKEN, BOARD_ID, BOARD_PAGE_LIMIT, BOARD_MAX_PAGES
} = require('../config/env');

let accessToken = MONDAY_API_TOKEN || null;

// OAuth helpers
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

// GraphQL wrapper
async function gql(query, variables={}) {
  if (!accessToken) throw new Error('Not authenticated with Monday');
  const { data } = await axios.post('https://api.monday.com/v2', { query, variables }, {
    headers: { Authorization: accessToken, 'Content-Type': 'application/json' }
  });
  if (data?.errors) throw new Error(JSON.stringify(data.errors));
  return data.data;
}

// Change a single column value
async function changeColumnValue(itemId, columnId, valueJson) {
  const query = `
    mutation ChangeValue($board: ID!, $item: ID!, $col: String!, $val: JSON!) {
      change_column_value(board_id: $board, item_id: $item, column_id: $col, value: $val) { id }
    }
  `;
  return gql(query, { board: String(BOARD_ID), item: String(itemId), col: columnId, val: valueJson });
}

// Paged board fetch (light)
async function fetchBoardLitePaged(limit=BOARD_PAGE_LIMIT, maxPages=BOARD_MAX_PAGES) {
  let cursor = null, pages = 0, items = [];
  while (pages < maxPages) {
    const query = `
      query($boardId: [ID!], $limit: Int!, $cursor: String) {
        boards(ids: $boardId) {
          items_page(limit: $limit, cursor: $cursor) {
            cursor
            items {
              id
              name
              group { title }
              subitems {
                id
                name
                column_values(ids: ["dropdown_mkr73m5s", "text_mkr31cjs"]) { id text }
              }
            }
          }
        }
      }
    `;
    const data = await gql(query, { boardId: [BOARD_ID], limit, cursor });
    const pageObj = data?.boards?.[0]?.items_page;
    if (!pageObj) break;
    items = items.concat(pageObj.items || []);
    cursor = pageObj.cursor || null;
    pages++;
    if (!cursor) break;
  }

  // group to keep frontend shape
  const grouped = {};
  for (const it of items) {
    const title = it?.group?.title || 'Ungrouped';
    if (!grouped[title]) grouped[title] = [];
    grouped[title].push({ id: it.id, name: it.name, subitems: it.subitems || [] });
  }
  const groups = Object.entries(grouped).map(([title, arr]) => ({
    title,
    items_page: { items: arr }
  }));
  return { boards: [{ groups }] };
}

module.exports = {
  buildAuthorizeUrl, exchangeCodeForToken, getAccessToken,
  changeColumnValue, fetchBoardLitePaged
};
