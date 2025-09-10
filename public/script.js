// ---- Endpoints (tweak if your server uses different paths) ----
const ENDPOINTS = {
  data: '/api/data',
  // These are optional; script works even if they don't exist:
  authStatus: '/api/auth/status',
  authUrl: '/api/auth/url',
  // Fallback if neither status nor authUrl is available:
  authLogin: '/auth/login'
};

// Build the auth UI and check status as soon as the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  ensureAuthUI();
  checkAuthAndToggleUI();
});

// Called by the existing "Load Board Info" button in index.html
async function loadBoard() {
  try {
    const res = await fetch(ENDPOINTS.data);
    if (res.status === 401 || res.status === 403) {
      showConnectUI();
      return;
    }
    const data = await res.json();
    renderBoard(data);
  } catch (err) {
    console.error('Error loading board data:', err);
    showConnectUI();
  }
}

/* =========================
   Auth UI (no index changes)
   ========================= */
function ensureAuthUI() {
  const loadBtn = document.getElementById('loadBtn');
  if (!loadBtn) return;

  // Status text (above buttons)
  if (!document.getElementById('authStatus')) {
    const statusEl = document.createElement('div');
    statusEl.id = 'authStatus';
    statusEl.style.margin = '10px 0';
    statusEl.style.fontSize = '14px';
    loadBtn.insertAdjacentElement('beforebegin', statusEl);
  }

  // Connect button (inserted before Load)
  if (!document.getElementById('connectBtn')) {
    const connectBtn = document.createElement('button');
    connectBtn.id = 'connectBtn';
    connectBtn.textContent = 'Connect to Monday';
    Object.assign(connectBtn.style, {
      marginRight: '10px',
      padding: '8px 12px',
      background: '#0078d7',
      color: '#fff',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer'
    });
    // Fallback action; may be overridden when we fetch a specific authUrl
    connectBtn.onclick = () => (window.location.href = ENDPOINTS.authLogin);
    loadBtn.insertAdjacentElement('beforebegin', connectBtn);
  }
}

async function checkAuthAndToggleUI() {
  const loadBtn = document.getElementById('loadBtn');
  const connectBtn = document.getElementById('connectBtn');
  const statusEl = document.getElementById('authStatus');

  // Default state: not connected
  if (statusEl) statusEl.textContent = 'Not connected to Monday.';
  if (connectBtn) connectBtn.style.display = 'inline-block';
  if (loadBtn) loadBtn.disabled = true;

  // Preferred: ask server for status
  try {
    const r = await fetch(ENDPOINTS.authStatus);
    if (r.ok) {
      const { connected, account, authUrl } = await r.json();
      if (connected) {
        if (connectBtn) connectBtn.style.display = 'none';
        if (loadBtn) loadBtn.disabled = false;
        if (statusEl) statusEl.textContent = account ? `Connected: ${account}` : 'Connected to Monday.';
        return;
      } else {
        // Wire the connect button if server provides an authUrl
        if (authUrl && connectBtn) {
          connectBtn.onclick = () => (window.location.href = authUrl);
        }
      }
    }
  } catch (_) {
    // ignore; we'll try other methods below
  }

  // If server exposes a clean auth URL endpoint
  try {
    const r2 = await fetch(ENDPOINTS.authUrl);
    if (r2.ok) {
      const { authUrl } = await r2.json();
      if (authUrl && connectBtn) {
        connectBtn.onclick = () => (window.location.href = authUrl);
      }
    }
  } catch (_) { /* ignore */ }

  // Probe data endpoint in case we already have a session
  try {
    const head = await fetch(ENDPOINTS.data, { method: 'HEAD' });
    if (head.ok) {
      if (connectBtn) connectBtn.style.display = 'none';
      if (loadBtn) loadBtn.disabled = false;
      if (statusEl) statusEl.textContent = 'Connected to Monday.';
      return;
    }
  } catch (_) { /* ignore */ }

  // If we reach here, we likely need to connect
  showConnectUI();
}

function showConnectUI() {
  const loadBtn = document.getElementById('loadBtn');
  const connectBtn = document.getElementById('connectBtn');
  const statusEl = document.getElementById('authStatus');
  if (statusEl) statusEl.textContent = 'Not connected to Monday.';
  if (connectBtn) connectBtn.style.display = 'inline-block';
  if (loadBtn) loadBtn.disabled = true;
}

/* =========================
   Board rendering
   ========================= */
function renderBoard(data) {
  const boardDiv = document.getElementById('board');
  boardDiv.innerHTML = '';

  // Accept either:
  // 1) Object keyed by collection: { "Pre-Production": [...], "Print": [...] }
  // 2) Array of items with a grouping key (collection/group)
  const collections = normalizeToCollections(data);

  for (const [collectionName, items] of Object.entries(collections)) {
    const sectionTitle = document.createElement('h3');
    sectionTitle.textContent = collectionName;
    boardDiv.appendChild(sectionTitle);

    const table = document.createElement('table');

    // Header
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

    // Body
    const tbody = document.createElement('tbody');
    (items || []).forEach((item) => {
      const tr = document.createElement('tr');

      // Print button first column
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
      printBtn.addEventListener('click', () => printLabel(item));
      printTd.appendChild(printBtn);
      tr.appendChild(printTd);

      // Remaining cells
      tr.innerHTML += `
        <td>${safe(item.orderNumber)}</td>
        <td>${safe(item.customerName)}</td>
        <td>${safe(item.jobTitle)}</td>
        <td>${safe(item.priority)}</td>
        <td>${safe(item.status)}</td>
        <td>${safe(item.date)}</td>
        <td>${renderFiles(item.files)}</td>
      `;

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    boardDiv.appendChild(table);
  }
}

function normalizeToCollections(data) {
  // If it's already an object keyed by collection, use it directly
  if (data && typeof data === 'object' && !Array.isArray(data)) return data;

  // If it's an array, group by common keys: collection | group | status_group
  const arr = Array.isArray(data) ? data : [];
  return arr.reduce((acc, item) => {
    const key =
      item.collection ||
      item.group ||
      item.status_group ||
      'Uncategorized';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}

function renderFiles(files) {
  if (!files || files.length === 0) return '';
  // Support either [{name, url}] or raw URL strings
  return files
    .map((f) => {
      const url = typeof f === 'string' ? f : f.url;
      const name = typeof f === 'string' ? extractFileName(f) : (f.name || extractFileName(f.url));
      return `<a href="${encodeURI(url)}" target="_blank" rel="noopener">${escapeHtml(name)}</a>`;
    })
    .join('<br>');
}

function extractFileName(url = '') {
  try {
    const u = new URL(url, window.location.origin);
    const parts = u.pathname.split('/');
    return parts[parts.length - 1] || 'File';
  } catch {
    // Fallback if not a valid URL
    const hash = (url || '').split('?')[0].split('#')[0];
    const parts = hash.split('/');
    return parts[parts.length - 1] || 'File';
  }
}

function safe(val) {
  return val == null ? '' : escapeHtml(String(val));
}

function escapeHtml(s) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/* =========================
   Print label (4" × 6")
   ========================= */
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
          padding: 0.25in; /* quarter inch padding inside the label */
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
        window.onload = function() {
          try { window.print(); } catch (e) {}
        };
      </script>
    </body>
    </html>
  `;

  const printWin = window.open('', '', 'width=480,height=760'); // slightly larger to accommodate browser chrome
  if (!printWin) return;
  printWin.document.open();
  printWin.document.write(labelHtml);
  printWin.document.close();
}

// Optional: expose for debugging from console
window.loadBoard = loadBoard;
