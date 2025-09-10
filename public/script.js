// ==============================
// Monday Dashboard Frontend (matches server routes)
// - Data: GET /api/board
// - Auth:  GET /auth
// - Groups -> tables
// - Files as clickable links
// - 4"×6" print label button per row
// ==============================

const ENDPOINTS = {
  data: '/api/board',
  auth: '/auth'
};

// Build auth UI immediately and probe connection
document.addEventListener('DOMContentLoaded', () => {
  ensureAuthUI();
  probeConnection();
});

// Expose for index.html button
window.loadBoard = loadBoard;

// ------------------------------
// Auth UI
// ------------------------------
function ensureAuthUI() {
  const loadBtn = document.getElementById('loadBtn');
  if (!loadBtn) return;

  // Status line
  if (!document.getElementById('authStatus')) {
    const status = document.createElement('div');
    status.id = 'authStatus';
    status.style.margin = '10px 0';
    status.style.fontSize = '14px';
    status.textContent = 'Checking connection…';
    loadBtn.insertAdjacentElement('beforebegin', status);
  }

  // Connect button
  if (!document.getElementById('connectBtn')) {
    const btn = document.createElement('button');
    btn.id = 'connectBtn';
    btn.textContent = 'Connect to Monday';
    Object.assign(btn.style, {
      marginRight: '10px',
      padding: '8px 12px',
      background: '#0078d7',
      color: '#fff',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer'
    });
    btn.addEventListener('click', () => {
      // Directly use server's /auth route (server is known-good)
      window.location.href = ENDPOINTS.auth;
    });
    loadBtn.insertAdjacentElement('beforebegin', btn);
  }
}

async function probeConnection() {
  const loadBtn = document.getElementById('loadBtn');
  const connectBtn = document.getElementById('connectBtn');
  const statusEl = document.getElementById('authStatus');

  try {
    // HEAD works with Express for GET routes; if blocked, GET will also work
    const r = await fetch(ENDPOINTS.data, { method: 'HEAD', cache: 'no-store' });
    if (r.ok) {
      if (statusEl) statusEl.textContent = 'Connected to Monday.';
      if (connectBtn) connectBtn.style.display = 'none';
      if (loadBtn) loadBtn.disabled = false;
      return;
    }
  } catch (_) {}

  // Not connected
  if (statusEl) statusEl.textContent = 'Not connected to Monday.';
  if (connectBtn) connectBtn.style.display = 'inline-block';
  if (loadBtn) loadBtn.disabled = true;
}

// ------------------------------
// Load board
// ------------------------------
async function loadBoard() {
  try {
    const res = await fetch(ENDPOINTS.data, { cache: 'no-store' });

    if (res.status === 401 || res.status === 403) {
      // Not authenticated; show connect
      const statusEl = document.getElementById('authStatus');
      if (statusEl) statusEl.textContent = 'Not connected to Monday.';
      const connectBtn = document.getElementById('connectBtn');
      const loadBtn = document.getElementById('loadBtn');
      if (connectBtn) connectBtn.style.display = 'inline-block';
      if (loadBtn) loadBtn.disabled = true;
      return;
    }

    const payload = await res.json();
    renderBoardFromMonday(payload);
  } catch (err) {
    console.error('Error loading board data:', err);
    const statusEl = document.getElementById('authStatus');
    if (statusEl) statusEl.textContent = 'Failed to load board (see console).';
  }
}

// ------------------------------
// Transform Monday payload -> collections
// Server returns response.data from axios, i.e. { data: { boards: [...] } }
// ------------------------------
function renderBoardFromMonday(payload) {
  const boardDiv = document.getElementById('board');
  boardDiv.innerHTML = '';

  const board = payload?.data?.boards?.[0];
  if (!board) {
    boardDiv.textContent = 'No board data.';
    return;
  }

  // Build column maps (id <-> title)
  const idToTitle = {};
  const titleToId = {};
  (board.columns || []).forEach(col => {
    idToTitle[col.id] = col.title || col.id;
    titleToId[normalize(col.title || col.id)] = col.id;
  });

  // Collections by group title
  for (const group of (board.groups || [])) {
    const collectionName = group.title || 'Untitled Group';
    const items = group.items_page?.items || [];

    const sectionTitle = document.createElement('h3');
    sectionTitle.textContent = collectionName;
    document.getElementById('board').appendChild(sectionTitle);

    const table = document.createElement('table');

    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th>Print</th>
        <th>Order #</th>
        <th>Customer</th>
        <th>Job Title</th>
        <th>Priority</th>
        <th>Status</th>
        <th>Date</th>
        <th>Files</th>
      </tr>
    `;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    for (const item of items) {
      const cv = indexColumnValues(item.column_values, idToTitle);

      // Try to find columns by friendly title
      const orderNumber = pick(cv, ['order number', 'order', 'order id']);
      const customerName = pick(cv, ['customer', 'client', 'customer name']);
      const jobTitle = item.name || '';
      const priority = pick(cv, ['priority']);
      const status = pick(cv, ['status', 'state']);
      const date = pick(cv, ['date', 'due date', 'delivery date']);

      // Files: accept columns whose text looks like URLs
      const filesText = pick(cv, ['files', 'file', 'links', 'attachments']);
      const files = parseUrls(filesText);

      const tr = document.createElement('tr');

      // Print button
      const printTd = document.createElement('td');
      const printBtn = document.createElement('button');
      printBtn.textContent = '🖨️ Print';
      Object.assign(printBtn.style, {
        padding: '5px 10px',
        background: '#0078d7',
        color: '#fff',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer'
      });
      printBtn.addEventListener('click', () =>
        printLabel({
          orderNumber: orderNumber,
          customerName: customerName,
          jobTitle: jobTitle
        })
      );
      printTd.appendChild(printBtn);
      tr.appendChild(printTd);

      // Remaining cells
      tr.innerHTML += `
        <td>${escapeHtml(orderNumber)}</td>
        <td>${escapeHtml(customerName)}</td>
        <td>${escapeHtml(jobTitle)}</td>
        <td>${escapeHtml(priority)}</td>
        <td>${escapeHtml(status)}</td>
        <td>${escapeHtml(date)}</td>
        <td>${renderFiles(files)}</td>
      `;

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    document.getElementById('board').appendChild(table);
  }
}

// Build a map of normalized column title -> text value
function indexColumnValues(columnValues, idToTitle) {
  const map = {};
  (columnValues || []).forEach(cv => {
    const title = idToTitle[cv.id] || cv.id;
    map[normalize(title)] = cv.text || '';
  });
  return map;
}

// Pick first non-empty value from a list of candidate column titles
function pick(cvMap, candidates) {
  for (const c of candidates) {
    const key = normalize(c);
    if (cvMap[key]) return cvMap[key];
  }
  return '';
}

// Render files (array of URLs) as clickable links
function renderFiles(urls) {
  if (!urls || urls.length === 0) return '';
  return urls
    .map(u => `<a href="${encodeURI(u)}" target="_blank" rel="noopener">${escapeHtml(fileName(u))}</a>`)
    .join('<br>');
}

function fileName(url) {
  try {
    const u = new URL(url);
    const p = u.pathname.split('/');
    return p[p.length - 1] || 'File';
  } catch {
    const p = (url || '').split('?')[0].split('#')[0].split('/');
    return p[p.length - 1] || 'File';
  }
}

// Extract URLs from a text blob (space or newline separated)
function parseUrls(text) {
  if (!text) return [];
  const re = /(https?:\/\/[^\s]+)/g;
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) out.push(m[1]);
  return out;
}

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function escapeHtml(s) {
  return String(s || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// ------------------------------
// Print label (4" × 6")
// ------------------------------
function printLabel(item) {
  const orderNumber = item?.orderNumber ? String(item.orderNumber) : '';
  const customerName = item?.customerName ? String(item.customerName) : '';
  const jobTitle = item?.jobTitle ? String(item.jobTitle).replace(/-/g, ' ') : '';

  const labelHtml = `
    <!doctype html>
    <html>
    <head>
      <meta charset="utf-8" />
      <title>Shipping Label</title>
      <style>
        @media print {
          @page { size: 4in 6in; margin: 0; }
          body { width: 4in; height: 6in; }
        }
        body {
          margin: 0;
          padding: 0.25in;
          font-family: Arial, sans-serif;
          display: flex;
          flex-direction: column;
          justify-content: flex-start;
          align-items: stretch;
          box-sizing: border-box;
        }
        .block { margin-bottom: 0.25in; }
        .head  { font-size: 14pt; font-weight: 700; letter-spacing: 0.5px; margin: 0 0 6px; }
        .value { font-size: 18pt; font-weight: 800; margin: 0; word-break: break-word; }
      </style>
    </head>
    <body>
      <div class="block">
        <div class="head">ORDER NUMBER</div>
        <div class="value">${escapeHtml(orderNumber)}</div>
      </div>
      <div class="block">
        <div class="head">CUSTOMER NAME</div>
        <div class="value">${escapeHtml(customerName)}</div>
      </div>
      <div class="block">
        <div class="head">JOB TITLE</div>
        <div class="value">${escapeHtml(jobTitle)}</div>
      </div>
      <script>
        window.onload = function() { try { window.print(); } catch (e) {} };
      </script>
    </body>
    </html>
  `;

  const printWin = window.open('', '', 'width=480,height=760');
  if (!printWin) return;
  printWin.document.open();
  printWin.document.write(labelHtml);
  printWin.document.close();
}
