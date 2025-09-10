// ==============================
// Monday Dashboard Frontend
// - No hardcoded /auth/login
// - Smart auth discovery (status/url)
// - Preserves collections -> tables render
// - Adds 4"x6" print label per row
// ==============================

const API = {
  data: '/api/data',
  // Discovery candidates (the script will try these in order):
  authStatus: ['/api/auth/status', '/auth/status'],
  authUrl: ['/api/auth/url', '/auth/url', '/api/auth/start', '/auth/start']
};

let AUTH = {
  connected: false,
  authUrl: null
};

// Build Connect button + status row and try to discover auth on load
document.addEventListener('DOMContentLoaded', () => {
  ensureAuthUI();
  discoverAuth().then(updateAuthUI);
});

// Expose for the "Load Board Info" button in index.html
window.loadBoard = loadBoard;

// ------------------------------
// Main: Load board
// ------------------------------
async function loadBoard() {
  try {
    const res = await fetch(API.data, { cache: 'no-store' });
    if (res.status === 401 || res.status === 403) {
      // Not authorized → try rediscovery and surface Connect
      await discoverAuth();
      updateAuthUI();
      return;
    }
    const data = await res.json();
    renderBoard(data);
  } catch (err) {
    console.error('Error loading board data:', err);
    // If anything fails, give user a way to connect
    await discoverAuth();
    updateAuthUI();
  }
}

// ------------------------------
// Auth: UI
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
    btn.addEventListener('click', async () => {
      // On click, re-run discovery in case URL just became available
      await discoverAuth();
      if (AUTH.authUrl) {
        window.location.href = AUTH.authUrl;
      } else {
        alert('Unable to find an authorization URL from the server.');
      }
    });
    loadBtn.insertAdjacentElement('beforebegin', btn);
  }
}

function updateAuthUI() {
  const loadBtn = document.getElementById('loadBtn');
  const connectBtn = document.getElementById('connectBtn');
  const statusEl = document.getElementById('authStatus');

  if (AUTH.connected) {
    if (statusEl) statusEl.textContent = 'Connected to Monday.';
    if (connectBtn) connectBtn.style.display = 'none';
    if (loadBtn) loadBtn.disabled = false;
  } else {
    if (statusEl) statusEl.textContent = 'Not connected to Monday.';
    if (connectBtn) {
      connectBtn.style.display = 'inline-block';
      // Only enable the button if we truly have a URL to send the user to.
      connectBtn.disabled = !AUTH.authUrl;
      connectBtn.style.opacity = AUTH.authUrl ? '1' : '0.6';
      connectBtn.title = AUTH.authUrl ? '' : 'Waiting for server to provide an auth URL…';
    }
    if (loadBtn) loadBtn.disabled = true;
  }
}

// ------------------------------
// Auth: Discovery
// ------------------------------
async function discoverAuth() {
  AUTH = { connected: false, authUrl: null };

  // Try a status endpoint that may also provide authUrl
  for (const path of API.authStatus) {
    try {
      const r = await fetch(path, { cache: 'no-store' });
      if (r.ok) {
        const json = await r.json().catch(() => ({}));
        const connected = !!json.connected;
        const url = json.authUrl || json.url || json.authorizationUrl || null;

        if (connected) {
          AUTH.connected = true;
          return AUTH;
        }
        if (url) {
          AUTH.authUrl = url;
          // keep looking for a "connected" = true, but we have a URL now
          break;
        }
      }
    } catch (_) { /* ignore */ }
  }

  // If we still don't have an authUrl, try explicit URL endpoints
  if (!AUTH.authUrl) {
    for (const path of API.authUrl) {
      try {
        const r = await fetch(path, { cache: 'no-store' });
        if (r.ok) {
          const json = await r.json().catch(() => ({}));
          const url = json.authUrl || json.url || json.authorizationUrl || null;
          if (url) {
            AUTH.authUrl = url;
            break;
          }
        }
      } catch (_) { /* ignore */ }
    }
  }

  // Final probe: maybe already authorized and no status endpoint exposed
  if (!AUTH.connected) {
    try {
      const probe = await fetch(API.data, { method: 'HEAD', cache: 'no-store' });
      if (probe.ok) {
        AUTH.connected = true;
      }
    } catch (_) { /* ignore */ }
  }

  return AUTH;
}

// ------------------------------
// Rendering (collections -> tables)
// ------------------------------
function renderBoard(data) {
  const boardDiv = document.getElementById('board');
  boardDiv.innerHTML = '';

  const collections = normalizeToCollections(data);

  for (const [collectionName, items] of Object.entries(collections)) {
    const sectionTitle = document.createElement('h3');
    sectionTitle.textContent = collectionName;
    boardDiv.appendChild(sectionTitle);

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

    (items || []).forEach(item => {
      const tr = document.createElement('tr');

      // Print button (first column)
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

      // Remaining columns
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
  if (data && typeof data === 'object' && !Array.isArray(data)) return data;
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
  return files
    .map(f => {
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
    const clean = (url || '').split('?')[0].split('#')[0];
    const parts = clean.split('/');
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
        window.onload = function() {
          try { window.print(); } catch (e) {}
        };
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
