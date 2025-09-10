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
    renderBoard(payload);
    const connectBtn = document.getElementById('connectBtn');
    if (connectBtn) connectBtn.style.display = 'none';
    if (statusEl) statusEl.textContent = 'Connected to Monday.';
  } catch {
    boardDiv.textContent = 'Failed to load board: Failed to fetch board';
  }
}

function renderBoard(payload) {
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
    sectionTitle.style.marginTop = '20px';
    sectionTitle.style.padding = '8px 12px';
    sectionTitle.style.background = '#0a67c3';
    sectionTitle.style.color = '#fff';
    sectionTitle.style.borderRadius = '4px';
    boardDiv.appendChild(sectionTitle);

    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    table.style.marginBottom = '20px';
    table.style.background = '#fff';
    table.style.border = '1px solid #ddd';

    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th style="text-align:left;border:1px solid #ddd;padding:8px;width:90px">Print</th>
        <th style="text-align:left;border:1px solid #ddd;padding:8px">Job Title</th>
      </tr>
    `;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    for (const item of items) {
      const jobTitle = item.name || '';
      const tr = document.createElement('tr');

      const printTd = document.createElement('td');
      printTd.style.border = '1px solid #ddd';
      printTd.style.padding = '8px';
      const printBtn = document.createElement('button');
      printBtn.textContent = 'Print';
      Object.assign(printBtn.style, {
        padding: '6px 10px',
        background: '#0078d7',
        color: '#fff',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer'
      });
      printBtn.addEventListener('click', () => printLabel(item.id, jobTitle));
      printTd.appendChild(printBtn);
      tr.appendChild(printTd);

      const titleTd = document.createElement('td');
      titleTd.style.border = '1px solid #ddd';
      titleTd.style.padding = '8px';
      titleTd.innerHTML = escapeHtml(jobTitle);
      tr.appendChild(titleTd);

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

function parseTitle(raw) {
  const t = String(raw || '').trim();
  const parts = t.split(/\s*[-–—]\s*/);
  if (parts.length >= 3) {
    const orderNumber = (parts[0].match(/^\d+/) || [parts[0]])[0].trim();
    const customerName = parts[1].trim();
    const jobTitle = parts.slice(2).join(' - ').trim().replace(/[-–—]/g, ' ');
    return { orderNumber, customerName, jobTitle };
  }
  const m = t.match(/^\s*(\d+)\s*[-–—]\s*(.+?)\s*[-–—]\s*(.+)$/);
  if (m) return { orderNumber: m[1].trim(), customerName: m[2].trim(), jobTitle: m[3].trim().replace(/[-–—]/g, ' ') };
  return { orderNumber: '', customerName: '', jobTitle: t.replace(/[-–—]/g, ' ') };
}

async function printLabel(itemId, rawTitle) {
  const { orderNumber, customerName, jobTitle } = parseTitle(rawTitle);
  let scanUrl = '';
  try {
    const r = await fetch(`/api/scan-url?itemId=${encodeURIComponent(itemId)}`);
    if (r.ok) {
      const j = await r.json();
      scanUrl = j.url || '';
    }
  } catch {}

  const qrImg = scanUrl ? `<img class="qr" src="/api/qr?data=${encodeURIComponent(scanUrl)}" alt="QR">` : '';

  const blocks = [
    { head: 'JOB NUMBER', value: orderNumber, ratio: 0.62 },
    { head: 'CUSTOMER', value: customerName, ratio: 0.46 },
    { head: 'JOB TITLE', value: jobTitle, ratio: 0.50 }
  ];

const body = `
  <!doctype html>
  <html>
  <head>
    <meta charset="utf-8" />
    <title>Shipping Label</title>
    <style>
      @media print { 
        @page { size: 4in 6in; margin: 0; } 
        html,body { width: 4in; height: 6in; margin: 0; padding: 0; }
      }
      html,body {
        width: 4in; height: 6in;
        margin: 0; padding: 0;
        overflow: hidden;
      }
      .wrap {
        box-sizing: border-box;
        width: 4in;
        height: 6in;
        padding: 0.15in;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
      }
      .content {
        flex: 1 1 auto;
        overflow: hidden;
      }
      .block { margin: 0 0 0.25in 0; }
      .head { font-family: Arial, sans-serif; font-size: 14pt; font-weight: 800; margin: 0 0 6px 0; }
      .value { font-family: Arial, sans-serif; font-weight: 900; margin: 0; white-space: nowrap; overflow: hidden; width: 100%; line-height: 1.05; }
      .qr-container {
        flex: 0 0 auto;
        display: flex;
        justify-content: center;
        align-items: center;
        height: 1.6in;
      }
      .qr {
        width: 1.4in;
        height: 1.4in;
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="content">
        ${blocks.map(b=>`
          <div class="block">
            <div class="head">${escapeHtml(b.head)}</div>
            <div class="value" data-ratio="${b.ratio}">${escapeHtml(b.value)}</div>
          </div>
        `).join('')}
      </div>
      <div class="qr-container">
        ${qrImg}
      </div>
    </div>
    <script>
      (function(){
        function fit(el, ratio, min){
          var parent = el.parentElement;
          var w = parent.clientWidth || parent.getBoundingClientRect().width;
          var size = Math.max(min, Math.floor(w * ratio));
          el.style.fontSize = size + 'px';
          var guard = 0;
          while ((el.scrollWidth > parent.clientWidth) && size > min && guard < 200){
            size -= 1;
            el.style.fontSize = size + 'px';
            guard++;
          }
        }
        Array.prototype.slice.call(document.querySelectorAll('.value')).forEach(function(v){
          var ratio = parseFloat(v.getAttribute('data-ratio')) || 0.4;
          fit(v, ratio, 10);
        });
        try { window.print(); } catch(e) {}
      })();
    </script>
  </body>
  </html>
`;



  let win = null;
  try { win = window.open('', '', 'width=480,height=760'); } catch {}
  if (win && win.document) {
    win.document.open();
    win.document.write(body);
    win.document.close();
  }
}
