// --- Monday Dashboard Frontend (with status dots + collapsible groups/subitems) ---

const PROD_ORIGIN = window.location.origin;
const ENDPOINTS = { data: '/api/board', auth: '/auth', scans: '/api/scan-states' };

// --- Serial globals ---
let __serialPort = null;
let __serialReader = null;
let __decoder = null;
let __inputDone = null;
let __serialBuffer = '';
let __idleTimer = null;
const __IDLE_MS = 140;
const __BUFFER_HARD_LIMIT = 8192;

document.addEventListener('DOMContentLoaded', () => {
  ensureAuthUI();
  addSerialScannerUI();
  attachSerialEvents();
  loadBoard();
});
window.loadBoard = loadBoard;

// --------------------------- AUTH / LOADING ---------------------------

function ensureAuthUI() {
  const board = document.getElementById('board') || document.body;

  // Create toolbar container once
  let bar = document.getElementById('labels-toolbar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'labels-toolbar';
    board.parentElement.insertBefore(bar, board); // toolbar sits above the board area
  }

  // Status text
  let statusEl = document.getElementById('authStatus');
  if (!statusEl) {
    statusEl = document.createElement('div');
    statusEl.id = 'authStatus';
    bar.appendChild(statusEl);
  }
  statusEl.className = 'status-note';
  statusEl.textContent = 'Connected to Monday.'; // will be updated after loadBoard() too

  // Update button (give it proper styling + move into toolbar)
  const loadBtn = document.getElementById('loadBtn');
  if (loadBtn) {
    loadBtn.textContent = 'Update board info';
    loadBtn.onclick = () => loadBoard();
    loadBtn.className = 'btn outline';
    if (loadBtn.parentElement !== bar) bar.appendChild(loadBtn);
  }

  // Connect to Monday (only shown if needed)
  let connectBtn = document.getElementById('connectBtn');
  if (!connectBtn) {
    connectBtn = document.createElement('button');
    connectBtn.id = 'connectBtn';
    connectBtn.textContent = 'Connect to Monday';
    connectBtn.className = 'btn primary';
    connectBtn.addEventListener('click', () => (window.location.href = '/auth'));
  }
  if (connectBtn.parentElement !== bar) bar.appendChild(connectBtn);

  // Scanner connect button will be inserted by addSerialScannerUI(); keep space updated
}


async function loadBoard() {
  const boardDiv = document.getElementById('board') || document.body;
  const statusEl = document.getElementById('authStatus');
  try {
    const [resBoard, resScans] = await Promise.all([
      fetch(ENDPOINTS.data, { cache: 'no-store', credentials: 'include' }),
      fetch(ENDPOINTS.scans, { cache: 'no-store', credentials: 'include' })
    ]);

    if (!resBoard.ok) {
      let msg = `Failed to load board (HTTP ${resBoard.status})`;
      try {
        const errJson = await resBoard.json();
        if (errJson && errJson.error) msg = `Failed to load board: ${errJson.error}`;
        else if (errJson && errJson.errors) msg = `Failed to load board: ${JSON.stringify(errJson.errors)}`;
      } catch {}
      boardDiv.textContent = msg;
      if (resBoard.status === 401 || resBoard.status === 403) {
        if (statusEl) statusEl.textContent = 'Not connected to Monday.';
        const connectBtn = document.getElementById('connectBtn');
        if (connectBtn) connectBtn.style.display = 'inline-block';
      }
      return;
    }

    const payload = await resBoard.json();
    const scansPayload = resScans.ok ? await resScans.json() : { map: {} };
    const scanMap = scansPayload.map || {};

    renderBoard(payload, scanMap); // <<< pass scan states
    const connectBtn = document.getElementById('connectBtn');
    if (connectBtn) connectBtn.style.display = 'none';
    if (statusEl) statusEl.textContent = 'Connected to Monday.';
  } catch {
    boardDiv.textContent = 'Failed to load board: fetch error';
  }
}

// --------------------------- RENDER BOARD ---------------------------

function renderBoard(payload, scanMap) {
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

    // Group container + header with chevron
    const groupWrap = document.createElement('section');
    groupWrap.className = 'group';

    const sectionTitle = document.createElement('button');
    sectionTitle.className = 'group-title';
    sectionTitle.type = 'button';
    sectionTitle.innerHTML = `
      <span class="chev" aria-hidden="true"></span>
      <span>${escapeHtml(collectionName)}</span>
    `;
    sectionTitle.addEventListener('click', () => {
      groupWrap.classList.toggle('collapsed');
    });
    groupWrap.appendChild(sectionTitle);

    const tableWrap = document.createElement('div');
    tableWrap.className = 'group-content';

    const table = document.createElement('table');
    table.className = 'data-table';

    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th class="w-90">Print</th>
        <th>Job Title</th>
        <th class="w-120">Scan Status</th>
      </tr>
    `;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    for (const item of items) {
      const jobTitle = item.name || '';
      const itemId = String(item.id);
      const scan = scanMap[itemId] || { scan_count: 0, status: 'Pending' };

      const tr = document.createElement('tr');
      tr.dataset.itemId = itemId;

      // Print button
      const printTd = document.createElement('td');
      const printBtn = document.createElement('button');
      printBtn.textContent = 'Print';
      printBtn.className = 'btn primary';
      printBtn.addEventListener('click', () => printLabel(item.id, jobTitle));
      printTd.appendChild(printBtn);
      tr.appendChild(printTd);

      // Title + row subitem toggler (only if has subitems)
      const titleTd = document.createElement('td');
      titleTd.className = 'title-cell';

      if (item.subitems && item.subitems.length > 0) {
        const rowToggle = document.createElement('button');
        rowToggle.className = 'row-toggle';
        rowToggle.type = 'button';
        rowToggle.setAttribute('aria-label', 'Toggle subitems');
        rowToggle.addEventListener('click', (e) => {
          e.stopPropagation();
          const isOpen = rowToggle.classList.toggle('open');
          toggleSubRows(itemId, isOpen);
        });
        titleTd.appendChild(rowToggle);
      } else {
        // placeholder to align
        const spacer = document.createElement('span');
        spacer.className = 'row-toggle-spacer';
        titleTd.appendChild(spacer);
      }

      const titleSpan = document.createElement('span');
      titleSpan.textContent = jobTitle;
      titleTd.appendChild(titleSpan);
      tr.appendChild(titleTd);

      // Status dots
      const statusTd = document.createElement('td');
      statusTd.appendChild(buildStatusDots(scan.scan_count));
      statusTd.title = scan.status || '';
      tr.appendChild(statusTd);

      tbody.appendChild(tr);

      // Subitems (initially hidden; shown when parent toggles)
      if (item.subitems && item.subitems.length > 0) {
        for (const sub of item.subitems) {
          const subTr = document.createElement('tr');
          subTr.className = 'sub-row hidden';
          subTr.dataset.parent = itemId;

          const subPrintTd = document.createElement('td');
          const subPrintBtn = document.createElement('button');
          subPrintBtn.textContent = 'Print';
          subPrintBtn.className = 'btn';
          subPrintBtn.addEventListener('click', () => printLabel(sub.id, sub.name || ''));
          subPrintTd.appendChild(subPrintBtn);
          subTr.appendChild(subPrintTd);

          const size = (sub.column_values || []).find(c => c.id === 'dropdown_mkr73m5s')?.text || '';
          const qty  = (sub.column_values || []).find(c => c.id === 'text_mkr31cjs')?.text || '';

          const subTitleTd = document.createElement('td');
          subTitleTd.colSpan = 1;
          subTitleTd.innerHTML = `<span class="sub-arrow">↳</span> ${escapeHtml(sub.name || '')} <span class="muted">| Size: ${escapeHtml(size)} | Qty: ${escapeHtml(qty)}</span>`;
          subTr.appendChild(subTitleTd);

          // sub rows use parent's scan state visually (or leave blank)
          const subStatus = document.createElement('td');
          subStatus.appendChild(buildStatusDots(scan.scan_count));
          subStatus.title = scan.status || '';
          subTr.appendChild(subStatus);

          tbody.appendChild(subTr);
        }
      }
    }

    table.appendChild(tbody);
    tableWrap.appendChild(table);
    groupWrap.appendChild(tableWrap);

    boardDiv.appendChild(groupWrap);
  }
}

function toggleSubRows(parentId, open) {
  const rows = document.querySelectorAll(`tr.sub-row[data-parent="${CSS.escape(parentId)}"]`);
  rows.forEach(r => r.classList.toggle('hidden', !open));
}

function buildStatusDots(count) {
  // count: 0..3
  const wrap = document.createElement('div');
  wrap.className = 'status-dots';
  // dot1: purple (checked in), dot2: gold (in prod), dot3: bright green (completed)
  const colors = ['var(--dot-purple)', 'var(--dot-gold)', 'var(--dot-green)'];
  for (let i = 1; i <= 3; i++) {
    const dot = document.createElement('span');
    dot.className = 'dot';
    if (count >= i) dot.style.background = colors[i-1];
    wrap.appendChild(dot);
  }
  return wrap;
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
    const r = await fetch(`/api/scan-url?itemId=${encodeURIComponent(itemId)}`, { credentials: 'include' });
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

// --------------------------- SERIAL UI (unchanged core) ---------------------------

function addSerialScannerUI() {
  const bar = document.getElementById('labels-toolbar');

  // Connect Scanner button
  if (!document.getElementById('connectScannerBtn')) {
    const btn = document.createElement('button');
    btn.id = 'connectScannerBtn';
    btn.textContent = 'Connect Scanner';
    btn.className = 'btn success';
    btn.onclick = connectSerialScanner;
    if (bar) bar.appendChild(btn);
  }

  // Small status pill
  if (!document.getElementById('scanPill')) {
    const pill = document.createElement('span');
    pill.id = 'scanPill';
    pill.className = 'pill';
    pill.textContent = 'ready';
    if (bar) bar.appendChild(pill);
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
  if (__serialPort) { updateScanPill('already connected'); return; }

  try {
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none', bufferSize: 255 });
    try { await port.setSignals({ dataTerminalReady: true, requestToSend: true }); } catch {}

    __serialPort = port;
    updateScanPill('scanner connected');
    startSerialReadLoop(port);
  } catch (e) {
    console.error('Serial connect failed', e);
    alert('Could not open scanner port. Ensure no other program is using it, then try again.');
  }
}

async function disconnectSerialScanner() {
  try {
    if (__serialReader) { try { await __serialReader.cancel(); } catch {} try { __serialReader.releaseLock(); } catch {} }
    if (__inputDone) { try { await __inputDone.catch(() => {}); } catch {} }
    if (__decoder) { try { __decoder.readable.cancel(); } catch {} }
    if (__serialPort) { try { await __serialPort.close(); } catch {} }
  } finally {
    __serialReader = null; __decoder = null; __inputDone = null; __serialPort = null; __serialBuffer = '';
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
    handleSerialScan(line);
  };

  (async () => {
    try {
      while (true) {
        const { value, done } = await __serialReader.read();
        if (done) break;
        if (value) {
          __serialBuffer += value;
          if (__serialBuffer.length > __BUFFER_HARD_LIMIT) flush();

          let parts = __serialBuffer.split(/[\r\n]+/);
          __serialBuffer = parts.pop();
          for (const part of parts) {
            const line = part.trim();
            if (line) handleSerialScan(line);
          }

          if (/([?&]i=\d+).+([?&]sig=[a-f0-9]+)/i.test(__serialBuffer) && !/[\r\n]/.test(__serialBuffer)) {
            const line = __serialBuffer.trim();
            __serialBuffer = '';
            handleSerialScan(line);
          }

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

async function handleSerialScan(text) {
  let scanUrl = normalizeScanUrl(text);
  if (!scanUrl && /^\d+$/.test(text)) {
    try {
      const r = await fetch(`/api/scan-url?itemId=${encodeURIComponent(text)}`, { cache: 'no-store', credentials: 'include' });
      if (r.ok) {
        const j = await r.json();
        if (j && j.url) scanUrl = j.url;
      }
    } catch {}
  }
  if (!scanUrl) { updateScanPill('unrecognized code'); return; }

  try {
    const r2 = await fetch('/api/scanner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ scan: text, url: scanUrl })
    });
    updateScanPill(r2.ok ? 'status: ok' : 'status: error');
    // refresh status dots after a successful scan
    if (r2.ok) loadBoard();
  } catch (e) {
    console.warn('POST /api/scanner failed:', e);
    updateScanPill('status: error');
  }
}

function normalizeScanUrl(input) {
  if (/^https?:\/\/.+\/scan\?.*i=\d+.*ts=\d+.*sig=[a-f0-9]+/i.test(input)) return input;
  if (/(^|[?&])i=\d+/.test(input) && /ts=\d+/.test(input) && /sig=/.test(input)) {
    return `${PROD_ORIGIN}/scan?${String(input).replace(/^[^?]*\?/, '')}`;
  }
  return null;
}

// --------------------------- CLEANUP ---------------------------

window.addEventListener('beforeunload', async () => {
  await disconnectSerialScanner();
});

// --------------------------- TAB NAVIGATION (sidebar) ---------------------------

document.addEventListener("DOMContentLoaded", () => {
  const tabs = document.querySelectorAll(".nav-tabs li");
  const contents = document.querySelectorAll(".tab-content");

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const target = tab.getAttribute("data-tab");
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      contents.forEach(c => {
        c.classList.remove("active");
        if (c.id === `tab-${target}`) c.classList.add("active");
      });
    });
  });
});

// ================== HOME DASH LOGIC ==================
document.addEventListener('DOMContentLoaded', initHomeDash);

function initHomeDash(){
  // click-through to tabs
  document.querySelectorAll('.home-card[data-goto-tab]').forEach(el=>{
    el.addEventListener('click', () => {
      const tab = el.getAttribute('data-goto-tab');
      const btn = document.querySelector(`.nav-tabs li[data-tab="${tab}"]`);
      if (btn) btn.click();
    });
  });

  // initial load + gentle refresh interval
  loadHomeMetrics();
  // optional: refresh every 5 minutes
  setInterval(loadHomeMetrics, 5 * 60 * 1000);
}

async function loadHomeMetrics(){
  // parallel fetches; each card handles its own errors gracefully
  await Promise.all([
    hydratePenCarrieCard(),
    hydrateLabelsCard(),
    hydrateOrdersCard(),
    hydrateCustomersCard()
  ]);
}

// ---- Card: PenCarrie (Stock Orders) ----
async function hydratePenCarrieCard(){
  const elTotal = document.getElementById('hc-pc-total');
  const elInProg = document.getElementById('hc-pc-inprog');
  const elShipped = document.getElementById('hc-pc-shipped');
  const elFoot = document.getElementById('hc-pc-foot');

  try{
    const r = await fetch('/api/pencarrie/orders', { cache:'no-store', credentials:'include' });
    if(!r.ok) throw new Error('HTTP '+r.status);
    const j = await r.json();
    const orders = Array.isArray(j.orders) ? j.orders : [];

    const total = orders.length;

    // naive buckets: anything with "shipped" in status/trackntrace -> shipped
    let shipped = 0;
    for(const o of orders){
      const s = (o.status || '').toLowerCase() + ' ' + (o.trackntrace || '').toLowerCase();
      if (/\bshipped|despatched|dispatched|complete\b/.test(s)) shipped++;
    }
    const inprog = Math.max(total - shipped, 0);

    bumpNumber(elTotal, total);
    bumpNumber(elInProg, inprog);
    bumpNumber(elShipped, shipped);

    if (elFoot) elFoot.textContent = total ? 'Live orders synced from PenCarrie' : 'No live stock orders';
  }catch(e){
    if (elTotal) elTotal.textContent = '—';
    if (elInProg) elInProg.textContent = '—';
    if (elShipped) elShipped.textContent = '—';
    if (elFoot) elFoot.textContent = 'Unable to fetch PenCarrie orders';
  }
}

// ---- Card: Labels / Production (Board + Scan States) ----
async function hydrateLabelsCard(){
  const elItems = document.getElementById('hc-lb-items');
  const elChecked = document.getElementById('hc-lb-checkedin');
  const elInProd = document.getElementById('hc-lb-inprod');
  const elDone = document.getElementById('hc-lb-done');

  try{
    const [resBoard, resScans] = await Promise.all([
      fetch('/api/board', { cache:'no-store', credentials:'include' }),
      fetch('/api/scan-states', { cache:'no-store', credentials:'include' })
    ]);
    if (!resBoard.ok) throw new Error('board '+resBoard.status);
    const payload = await resBoard.json();
    const scans = resScans.ok ? await resScans.json() : { map:{} };
    const scanMap = scans.map || {};

    const board = unwrapFirstBoard(payload) || {};
    const groups = board.groups || [];
    let items = 0;

    // quick rollup across items
    let c1=0, c2=0, c3=0;
    for(const g of groups){
      const its = (g.items_page && g.items_page.items) || [];
      items += its.length;
      for (const it of its){
        const id = String(it.id);
        const sc = scanMap[id]?.scan_count || 0;
        if (sc >= 1) c1++;
        if (sc >= 2) c2++;
        if (sc >= 3) c3++;
      }
    }

    bumpNumber(elItems, items);
    bumpNumber(elChecked, c1);
    bumpNumber(elInProd, c2);
    bumpNumber(elDone, c3);
  }catch(e){
    if (elItems) elItems.textContent = '—';
    if (elChecked) elChecked.textContent = '—';
    if (elInProd) elInProd.textContent = '—';
    if (elDone) elDone.textContent = '—';
  }
}

// ---- Card: Orders (app orders) ----
async function hydrateOrdersCard(){
  const elOpen = document.getElementById('hc-odr-open');
  const elInProd = document.getElementById('hc-odr-inprod');
  const elDraft = document.getElementById('hc-odr-draft');

  try{
    const r = await fetch('/api/orders', { cache:'no-store', credentials:'include' });
    if (!r.ok) throw new Error('HTTP '+r.status);
    const j = await r.json();
    const rows = Array.isArray(j.orders) ? j.orders : (Array.isArray(j) ? j : []);
    // Count buckets (fallback to reasonable field names)
    let open=0, inprod=0, draft=0;
    for(const o of rows){
      const s = (o.status || o.order_status || '').toLowerCase();
      if (/in production/.test(s)) inprod++;
      if (/draft/.test(s)) draft++;
      if (/confirmed|in production|draft/.test(s)) open++;
    }
    bumpNumber(elOpen, open || rows.length || 0);
    bumpNumber(elInProd, inprod);
    bumpNumber(elDraft, draft);
  }catch(e){
    if (elOpen) elOpen.textContent = '—';
    if (elInProd) elInProd.textContent = '—';
    if (elDraft) elDraft.textContent = '—';
  }
}

// ---- Card: Customers ----
async function hydrateCustomersCard(){
  const elTotal = document.getElementById('hc-cus-total');
  const elRecent = document.getElementById('hc-cus-recent');

  try{
    const r = await fetch('/api/customers', { cache:'no-store', credentials:'include' });
    if (!r.ok) throw new Error('HTTP '+r.status);
    const j = await r.json();
    const rows = Array.isArray(j.customers) ? j.customers : (Array.isArray(j) ? j : []);
    const total = rows.length;

    // simple “new this month” using created_at / created fields if present
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    let recent = 0;
    for (const c of rows){
      const d = c.created_at || c.created || c.updated_at || null;
      if (d && String(d).startsWith(ym)) recent++;
    }

    bumpNumber(elTotal, total);
    bumpNumber(elRecent, recent);
  }catch(e){
    if (elTotal) elTotal.textContent = '—';
    if (elRecent) elRecent.textContent = '—';
  }
}

// small helper for number "pop" animation + safe text set
function bumpNumber(el, val){
  if (!el) return;
  el.textContent = typeof val === 'number' ? val.toLocaleString() : String(val);
  el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
}
