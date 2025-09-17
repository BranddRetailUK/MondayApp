// --- Monday Dashboard Frontend (updated with robust Web Serial @115200 8N1) ---

const PROD_ORIGIN = window.location.origin; // dynamic origin
const ENDPOINTS = { data: '/api/board', auth: '/auth' };

// --- Serial globals (so we can reconnect/cleanup properly) ---
let __serialPort = null;
let __serialReader = null;
let __decoder = null;
let __inputDone = null;
let __serialBuffer = '';
let __idleTimer = null;
const __IDLE_MS = 140; // treat short idle as end-of-scan

document.addEventListener('DOMContentLoaded', () => {
  ensureAuthUI();
  addSerialScannerUI();
  attachSerialEvents();
  loadBoard();
});
window.loadBoard = loadBoard;

// --------------------------- AUTH / LOADING ---------------------------

function ensureAuthUI() {
  const loadBtn = document.getElementById('loadBtn');
  if (loadBtn) {
    loadBtn.textContent = 'Update board info';
    loadBtn.onclick = () => loadBoard();
  }
  if (!document.getElementById('authStatus')) {
    const status = document.createElement('div');
    status.id = 'authStatus';
    status.style.margin = '10px 0';
    status.style.fontSize = '14px';
    status.textContent = 'Ready.';
    if (loadBtn) loadBtn.insertAdjacentElement('beforebegin', status);
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
    if (loadBtn) loadBtn.insertAdjacentElement('beforebegin', btn);
  }
}

async function loadBoard() {
  const boardDiv = document.getElementById('board') || document.body;
  const statusEl = document.getElementById('authStatus');
  try {
    const res = await fetch(ENDPOINTS.data, { cache: 'no-store' });
    if (!res.ok) {
      let msg = `Failed to load board (HTTP ${res.status})`;
      try {
        const errJson = await res.json();
        if (errJson && errJson.error) msg = `Failed to load board: ${errJson.error}`;
        else if (errJson && errJson.errors) msg = `Failed to load board: ${JSON.stringify(errJson.errors)}`;
      } catch {}
      boardDiv.textContent = msg;
      if (res.status === 401 || res.status === 403) {
        if (statusEl) statusEl.textContent = 'Not connected to Monday.';
        const connectBtn = document.getElementById('connectBtn');
        if (connectBtn) connectBtn.style.display = 'inline-block';
      }
      return;
    }
    const payload = await res.json();
    renderBoard(payload);
    const connectBtn = document.getElementById('connectBtn');
    if (connectBtn) connectBtn.style.display = 'none';
    if (statusEl) statusEl.textContent = 'Connected to Monday.';
  } catch {
    boardDiv.textContent = 'Failed to load board: fetch error';
  }
}

// --------------------------- RENDER BOARD ---------------------------

function renderBoard(payload) {
  const boardDiv = document.getElementById('board') || document.body;
  boardDiv.innerHTML = '';
  const board = unwrapFirstBoard(payload);
  if (!board) {
    if (payload && payload.errors && payload.errors.length) {
      boardDiv.textContent = `GraphQL error: ${payload.errors.map(e => e.message || e).join('; ')}`;
    } else {
      boardDiv.textContent = 'No board data.';
    }
    return;
  }

  for (const group of (board.groups || [])) {
    const collectionName = group.title || 'Untitled Group';
    const items = (group.items_page && group.items_page.items) || [];

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

      if (item.subitems && item.subitems.length > 0) {
        for (const sub of item.subitems) {
          const subTr = document.createElement('tr');

          const subPrintTd = document.createElement('td');
          subPrintTd.style.border = '1px solid #ddd';
          subPrintTd.style.padding = '8px';
          const subPrintBtn = document.createElement('button');
          subPrintBtn.textContent = 'Print';
          Object.assign(subPrintBtn.style, {
            padding: '6px 10px',
            background: '#555',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          });
          subPrintBtn.addEventListener('click', () => printLabel(sub.id, sub.name || ''));
          subPrintTd.appendChild(subPrintBtn);
          subTr.appendChild(subPrintTd);

          const size = (sub.column_values || []).find(c => c.id === 'dropdown_mkr73m5s')?.text || '';
          const qty = (sub.column_values || []).find(c => c.id === 'text_mkr31cjs')?.text || '';

          const subTitleTd = document.createElement('td');
          subTitleTd.style.border = '1px solid #ddd';
          subTitleTd.style.padding = '8px';
          subTitleTd.style.paddingLeft = '30px';
          subTitleTd.innerHTML = `↳ ${escapeHtml(sub.name || '')} | Size: ${escapeHtml(size)} | Qty: ${escapeHtml(qty)}`;
          subTr.appendChild(subTitleTd);

          tbody.appendChild(subTr);
        }
      }
    }

    table.appendChild(tbody);
    boardDiv.appendChild(table);
  }
}

function unwrapFirstBoard(payload) {
  if (payload && payload.data && payload.data.boards && payload.data.boards.length) return payload.data.boards[0];
  if (payload && payload.boards && payload.boards.length) return payload.boards[0];
  if (payload && payload.data && payload.data.data && payload.data.data.boards && payload.data.data.boards.length) return payload.data.data.boards[0];
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

// --------------------------- PRINT LABEL ---------------------------

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
        html,body { width: 4in; height: 6in; margin: 0; padding: 0; overflow: hidden; }
        .wrap { box-sizing: border-box; width: 4in; height: 6in; padding: 0.15in; display: flex; flex-direction: column; justify-content: space-between; }
        .content { flex: 1 1 auto; overflow: hidden; }
        .block { margin: 0 0 0.25in 0; }
        .head { font-family: Arial, sans-serif; font-size: 14pt; font-weight: 800; margin: 0 0 6px 0; }
        .value { font-family: Arial, sans-serif; font-weight: 900; margin: 0; white-space: nowrap; overflow: hidden; width: 100%; line-height: 1.05; }
        .qr-container { flex: 0 0 auto; display: flex; justify-content: center; align-items: center; height: 1.6in; }
        .qr { width: 1.4in; height: 1.4in; }
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
        <div class="qr-container">${qrImg}</div>
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
          const qr = document.querySelector('.qr');
          if (qr) {
            qr.addEventListener('load', () => { setTimeout(() => window.print(), 150); });
          } else {
            setTimeout(() => window.print(), 150);
          }
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

// --------------------------- SERIAL UI ---------------------------

function addSerialScannerUI() {
  const loadBtn = document.getElementById('loadBtn');

  // status pill
  if (!document.getElementById('scanPill')) {
    const pill = document.createElement('span');
    pill.id = 'scanPill';
    pill.className = 'scan-pill-text';
    pill.textContent = 'ready';
    Object.assign(pill.style, {
      marginLeft: '12px',
      padding: '6px 10px',
      background: '#eee',
      borderRadius: '14px',
      fontSize: '12px'
    });
    if (loadBtn) loadBtn.insertAdjacentElement('afterend', pill);
  }

  // connect button
  if (!document.getElementById('connectScannerBtn')) {
    const btn = document.createElement('button');
    btn.id = 'connectScannerBtn';
    btn.textContent = 'Connect Scanner';
    Object.assign(btn.style, {
      marginLeft: '10px',
      padding: '8px 12px',
      background: '#0a7',
      color: '#fff',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer'
    });
    btn.onclick = connectSerialScanner;
    if (loadBtn) loadBtn.insertAdjacentElement('afterend', btn);
  }
}

function attachSerialEvents() {
  if (!('serial' in navigator)) return;
  navigator.serial.addEventListener('connect', () => updateScanPill('scanner connected'));
  navigator.serial.addEventListener('disconnect', async () => {
    updateScanPill('scanner disconnected');
    await disconnectSerialScanner();
  });
}

function updateScanPill(msg) {
  const pill = document.getElementById('scanPill') || document.querySelector('.scan-pill-text');
  if (pill) {
    pill.textContent = msg;
    // brief auto-reset
    if (!/connected|disconnected/i.test(msg)) {
      setTimeout(() => { pill.textContent = 'ready'; }, 900);
    }
  }
}

// --------------------------- SERIAL CORE ---------------------------

async function connectSerialScanner() {
  if (!('serial' in navigator)) {
    alert('Web Serial API not supported. Use Chrome or Edge.');
    return;
  }

  // If already connected, do nothing
  if (__serialPort) {
    updateScanPill('already connected');
    return;
  }

  try {
    // Ask user to choose a device (we keep it unfiltered for CH340)
    const port = await navigator.serial.requestPort();

    // Open with explicit 8N1 settings (CH340s like these spelled out)
    await port.open({
      baudRate: 115200,       // ✅ confirmed
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      flowControl: 'none',
      bufferSize: 255
    });

    // Some adapters need DTR/RTS asserted
    try { await port.setSignals({ dataTerminalReady: true, requestToSend: true }); } catch {}

    __serialPort = port;
    updateScanPill('scanner connected');
    console.log('✅ Scanner connected at 115200 8N1');

    // Start the read loop
    startSerialReadLoop(port);
  } catch (e) {
    console.error('Serial connect failed', e);
    alert('Could not open scanner port. Ensure no other program (e.g., PowerShell, PuTTY) is using it, then try again.');
  }
}

async function disconnectSerialScanner() {
  try {
    if (__serialReader) {
      try { await __serialReader.cancel(); } catch {}
      try { __serialReader.releaseLock(); } catch {}
    }
    if (__inputDone) {
      try { await __inputDone.catch(() => {}); } catch {}
    }
    if (__decoder) {
      try { __decoder.readable.cancel(); } catch {}
    }
    if (__serialPort) {
      try { await __serialPort.close(); } catch {}
    }
  } finally {
    __serialReader = null;
    __decoder = null;
    __inputDone = null;
    __serialPort = null;
    __serialBuffer = '';
    clearTimeout(__idleTimer);
  }
}

function startSerialReadLoop(port) {
  __decoder = new TextDecoderStream();
  __inputDone = port.readable.pipeTo(__decoder.writable).catch(() => {});
  const inputStream = __decoder.readable;
  __serialReader = inputStream.getReader();

  const flush = () => {
    const line = __serialBuffer.trim();
    __serialBuffer = '';
    if (!line) return;
    console.log('RAW:', line);
    handleSerialScan(line);
  };

  (async () => {
    try {
      while (true) {
        const { value, done } = await __serialReader.read();
        if (done) break;
        if (value) {
          __serialBuffer += value;

          // Split on CR/LF if the scanner sends terminators
          let parts = __serialBuffer.split(/[\r\n]+/);
          __serialBuffer = parts.pop(); // keep the remainder
          for (const part of parts) {
            const line = part.trim();
            if (line) {
              console.log('RAW:', line);
              handleSerialScan(line);
            }
          }

          // Idle flush for scanners that send no terminator
          clearTimeout(__idleTimer);
          __idleTimer = setTimeout(flush, __IDLE_MS);
        }
      }
    } catch (err) {
      console.warn('Serial read loop ended:', err);
    } finally {
      try { __serialReader.releaseLock(); } catch {}
    }
  })();
}

// --------------------------- SCAN HANDLING ---------------------------

async function handleSerialScan(text) {
  // Normalise into a /scan URL your backend understands
  let scanUrl = normalizeScanUrl(text);

  // If it’s just an item ID (digits), derive the scan URL from backend helper
  if (!scanUrl && /^\d+$/.test(text)) {
    try {
      const r = await fetch(`/api/scan-url?itemId=${encodeURIComponent(text)}`, { cache: 'no-store' });
      if (r.ok) {
        const j = await r.json();
        if (j && j.url) scanUrl = j.url;
      }
    } catch {}
  }

  if (!scanUrl) {
    updateScanPill('unrecognized code');
    return;
  }

  // Hit the scan URL in JSON mode so the backend can update Monday and reply
  try {
    const url = scanUrl + (scanUrl.includes('?') ? '&' : '?') + 'json=1';
    const r = await fetch(url, { method: 'GET', cache: 'no-store', credentials: 'omit' });
    if (r.ok) {
      const j = await r.json().catch(() => ({}));
      if (j && (j.ok || j.status)) {
        updateScanPill(`status: ${j.status || 'ok'}`);
        return;
      }
    }
  } catch (e) {
    console.error('Process scan failed', e);
  }
  updateScanPill('processed');
}

function normalizeScanUrl(input) {
  // Accept full URLs your scanner emits, or query fragments (i, ts, sig)
  if (/^https?:\/\/.+\/scan\?.*i=\d+.*ts=\d+.*sig=[a-f0-9]+/i.test(input)) return input;
  if (/(^|[?&])i=\d+/.test(input) && /ts=\d+/.test(input) && /sig=/.test(input)) {
    return `${PROD_ORIGIN}/scan?${input.replace(/^[^?]*\?/, '')}`;
  }
  return null;
}

// --------------------------- CLEANUP ---------------------------

window.addEventListener('beforeunload', async () => {
  await disconnectSerialScanner();
});
