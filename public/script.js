const ENDPOINTS = { data: '/api/board', auth: '/auth' };

document.addEventListener('DOMContentLoaded', () => {
  ensureAuthUI();
});

window.loadBoard = loadBoard;

function ensureAuthUI() {
  const loadBtn = document.getElementById('loadBtn');
  if (!loadBtn) return;
  if (!document.getElementById('authStatus')) {
    const status = document.createElement('div');
    status.id = 'authStatus';
    status.style.margin = '10px 0';
    status.style.fontSize = '14px';
    status.textContent = 'Ready. Click "Load Board Info".';
    loadBtn.insertAdjacentElement('beforebegin', status);
  }
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
    btn.addEventListener('click', () => (window.location.href = ENDPOINTS.auth));
    loadBtn.insertAdjacentElement('beforebegin', btn);
  }
}

async function loadBoard() {
  const boardDiv = document.getElementById('board');
  const statusEl = document.getElementById('authStatus');
  try {
    const res = await fetch(ENDPOINTS.data, { cache: 'no-store' });
    if (!res.ok) {
      let msg = `Failed to load board (HTTP ${res.status})`;
      try {
        const errJson = await res.json();
        if (errJson?.error) msg = `Failed to load board: ${errJson.error}`;
        else if (errJson?.errors) msg = `Failed to load board: ${JSON.stringify(errJson.errors)}`;
      } catch {}
      boardDiv.textContent = msg;
      if (res.status === 401 || res.status === 403) {
        if (statusEl) statusEl.textContent = 'Not connected to Monday.';
        const connectBtn = document.getElementById('connectBtn');
        const loadBtn = document.getElementById('loadBtn');
        if (connectBtn) connectBtn.style.display = 'inline-block';
        if (loadBtn) loadBtn.disabled = false;
      }
      return;
    }
    const payload = await res.json();
    renderBoardMinimal(payload);
    const connectBtn = document.getElementById('connectBtn');
    if (connectBtn) connectBtn.style.display = 'none';
    if (statusEl) statusEl.textContent = 'Connected to Monday.';
  } catch {
    boardDiv.textContent = 'Failed to load board: Failed to fetch board';
  }
}

function renderBoardMinimal(payload) {
  const boardDiv = document.getElementById('board');
  boardDiv.innerHTML = '';
  const board = unwrapFirstBoard(payload);
  if (!board) {
    if (payload?.errors?.length) {
      boardDiv.textContent = `GraphQL error: ${payload.errors.map(e => e.message || e).join('; ')}`;
    } else {
      boardDiv.textContent = 'No board data.';
    }
    return;
  }

  for (const group of (board.groups || [])) {
    const collectionName = group.title || 'Untitled Group';
    const items = group.items_page?.items || [];

    const sectionTitle = document.createElement('h3');
    sectionTitle.textContent = collectionName;
    boardDiv.appendChild(sectionTitle);

    const table = document.createElement('table');

    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th>Print</th>
        <th>Job Title</th>
      </tr>
    `;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    for (const item of items) {
      const jobTitle = item.name || '';
      const tr = document.createElement('tr');

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
      printBtn.addEventListener('click', () => printLabel({ jobTitle }));
      printTd.appendChild(printBtn);
      tr.appendChild(printTd);

      tr.innerHTML += `
        <td>${escapeHtml(jobTitle)}</td>
      `;

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    boardDiv.appendChild(table);
  }
}

function unwrapFirstBoard(payload) {
  if (payload?.data?.boards?.length) return payload.data.boards[0];
  if (payload?.boards?.length) return payload.boards[0];
  if (payload?.data?.data?.boards?.length) return payload.data.data.boards[0];
  return null;
}

function escapeHtml(s) {
  return String(s || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function printLabel(item) {
  const orderNumber = '';
  const customerName = '';
  const jobTitle = item?.jobTitle ? String(item.jobTitle).replace(/-/g, ' ') : '';
  const blocks = [];
  if (orderNumber) blocks.push(`<div class="block"><div class="head">ORDER NUMBER</div><div class="value">${escapeHtml(orderNumber)}</div></div>`);
  if (customerName) blocks.push(`<div class="block"><div class="head">CUSTOMER NAME</div><div class="value">${escapeHtml(customerName)}</div></div>`);
  if (jobTitle) blocks.push(`<div class="block"><div class="head">JOB TITLE</div><div class="value">${escapeHtml(jobTitle)}</div></div>`);
  const labelHtml = `
    <!doctype html>
    <html>
    <head>
      <meta charset="utf-8" />
      <title>Shipping Label</title>
      <style>
        @media print { @page { size: 4in 6in; margin: 0; } body { width: 4in; height: 6in; } }
        body { margin: 0; padding: 0.25in; font-family: Arial, sans-serif; display: flex; flex-direction: column; justify-content: flex-start; align-items: stretch; box-sizing: border-box; }
        .block { margin-bottom: 0.25in; }
        .head { font-size: 14pt; font-weight: 700; letter-spacing: 0.5px; margin: 0 0 6px; }
        .value { font-size: 18pt; font-weight: 800; margin: 0; word-break: break-word; }
      </style>
    </head>
    <body>
      ${blocks.join('')}
      <script>window.onload=function(){try{window.print()}catch(e){}};</script>
    </body>
    </html>
  `;
  const printWin = window.open('', '', 'width=480,height=760');
  if (!printWin) return;
  printWin.document.open();
  printWin.document.write(labelHtml);
  printWin.document.close();
}
