// --- Monday Dashboard Frontend (Monday-style grid + collapsible groups/subitems) ---

const PROD_ORIGIN = window.location.origin;
const ENDPOINTS = { data: '/api/board', auth: '/auth', scans: '/api/scan-states' };
const DASHBOARD_TAB_STORAGE_KEY = 'ultimateHub.activeDashboardTab';
const DASHBOARD_TAB_NAMES = ['dashboard', 'database', 'visuals'];
const BOARD_AUTO_REFRESH_MS = 2000;
const HIDDEN_BOARD_COLUMN_TYPES = new Set(['subtasks']);
const HIDDEN_BOARD_COLUMN_IDS = new Set(['subitems__1']);
let __boardRefreshTimer = null;
let __boardLoading = false;

// --- Camera globals ---
let __cameraStream = null;
let __captureDataUrl = null;

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
  addCameraUI();
  addSerialScannerUI();
  attachSerialEvents();
  loadBoard({ forceRefresh: true });
  startBoardAutoRefresh();
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
    loadBtn.onclick = () => loadBoard({ forceRefresh: true });
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

// --------------------------- CAMERA UI ---------------------------

function addCameraUI() {
  const bar = document.getElementById('labels-toolbar');
  if (!bar) return;

  ensureCaptureModal();

  if (!document.getElementById('connectCameraBtn')) {
    const btn = document.createElement('button');
    btn.id = 'connectCameraBtn';
    btn.textContent = 'Connect Camera';
    btn.className = 'btn success';
    btn.addEventListener('click', connectCamera);
    const scannerBtn = document.getElementById('connectScannerBtn');
    if (scannerBtn && scannerBtn.parentElement === bar) {
      bar.insertBefore(btn, scannerBtn);
    } else {
      bar.appendChild(btn);
    }
  }
}

function ensureCaptureModal() {
  if (document.getElementById('cameraModal')) return;
  const modal = document.createElement('div');
  modal.id = 'cameraModal';
  modal.className = 'modal hidden';
  modal.innerHTML = `
    <div class="modal-inner">
      <div class="modal-head">
        <h3>Take Image</h3>
        <button class="modal-close" aria-label="Close" type="button">&times;</button>
      </div>
      <div class="modal-body">
        <div class="cam-live" id="camLiveWrap">
          <video id="camVideo" autoplay playsinline muted></video>
          <div class="cam-overlay" id="camConnectHint">Allow camera access to start.</div>
        </div>
        <div class="cam-preview hidden" id="camPreviewBox">
          <img id="camPreviewImg" alt="Captured preview" />
        </div>
      </div>
      <div class="modal-foot">
        <div class="modal-actions">
          <button id="camCancel" class="btn outline" type="button">Close</button>
          <button id="camReject" class="btn outline hidden" type="button">Reject</button>
          <button id="camCapture" class="btn success" type="button">Capture</button>
          <button id="camApprove" class="btn primary hidden" type="button">Approve & Upload</button>
        </div>
        <div class="small muted" id="camStatus">Ready when the camera is connected.</div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector('#camCancel').addEventListener('click', closeCaptureModal);
  modal.querySelector('.modal-close').addEventListener('click', closeCaptureModal);
  modal.querySelector('#camCapture').addEventListener('click', captureSnapshot);
  modal.querySelector('#camReject').addEventListener('click', rejectSnapshot);
  modal.querySelector('#camApprove').addEventListener('click', approveSnapshot);
}

async function connectCamera() {
  const btn = document.getElementById('connectCameraBtn');
  if (!navigator.mediaDevices?.getUserMedia) {
    alert('Camera not supported in this browser. Please use Chrome or Edge.');
    return null;
  }
  if (__cameraStream) {
    if (btn) btn.textContent = 'Camera Ready';
    attachStreamToVideo(__cameraStream);
    return __cameraStream;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    __cameraStream = stream;
    if (btn) btn.textContent = 'Camera Ready';
    attachStreamToVideo(stream);
    setCaptureStatus('Camera connected. You can capture an image.');
    return stream;
  } catch (err) {
    console.error('Camera connect failed', err);
    if (btn) btn.textContent = 'Connect Camera';
    alert('Could not access the camera. Check permissions and try again.');
    setCaptureStatus('Camera access denied. Please allow permissions.');
    return null;
  }
}

function attachStreamToVideo(stream) {
  const video = document.getElementById('camVideo');
  const hint = document.getElementById('camConnectHint');
  if (video) {
    video.srcObject = stream;
    video.play().catch(() => {});
  }
  if (hint) hint.classList.add('hidden');
}

function openCaptureModal(itemId, jobTitle) {
  const modal = document.getElementById('cameraModal');
  if (!modal) return;
  __captureDataUrl = null;
  modal.dataset.itemId = itemId;
  modal.classList.remove('hidden');
  document.body.classList.add('modal-open');
  showLiveView();
  setCaptureStatus(jobTitle ? `Capturing for: ${jobTitle}` : 'Camera ready.');
  connectCamera();
}

function closeCaptureModal() {
  const modal = document.getElementById('cameraModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.dataset.itemId = '';
  }
  document.body.classList.remove('modal-open');
  showLiveView();
  setCaptureStatus('Ready when the camera is connected.');
}

function showLiveView() {
  const live = document.getElementById('camLiveWrap');
  const preview = document.getElementById('camPreviewBox');
  const capBtn = document.getElementById('camCapture');
  const approveBtn = document.getElementById('camApprove');
  const rejectBtn = document.getElementById('camReject');
  if (live) live.classList.remove('hidden');
  if (preview) preview.classList.add('hidden');
  if (capBtn) capBtn.classList.remove('hidden');
  if (approveBtn) approveBtn.classList.add('hidden');
  if (rejectBtn) rejectBtn.classList.add('hidden');
}

function showPreview() {
  const live = document.getElementById('camLiveWrap');
  const preview = document.getElementById('camPreviewBox');
  const capBtn = document.getElementById('camCapture');
  const approveBtn = document.getElementById('camApprove');
  const rejectBtn = document.getElementById('camReject');
  if (live) live.classList.add('hidden');
  if (preview) preview.classList.remove('hidden');
  if (capBtn) capBtn.classList.add('hidden');
  if (approveBtn) approveBtn.classList.remove('hidden');
  if (rejectBtn) rejectBtn.classList.remove('hidden');
}

function setCaptureStatus(msg) {
  const el = document.getElementById('camStatus');
  if (el) el.textContent = msg || '';
}

function captureSnapshot() {
  const video = document.getElementById('camVideo');
  if (!video || !__cameraStream) {
    setCaptureStatus('Camera not connected. Please connect and try again.');
    connectCamera();
    return;
  }
  const width = video.videoWidth || 1280;
  const height = video.videoHeight || 720;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, width, height);
  __captureDataUrl = canvas.toDataURL('image/jpeg', 0.92);
  const img = document.getElementById('camPreviewImg');
  if (img) img.src = __captureDataUrl;
  showPreview();
  setCaptureStatus('Review the preview. Approve to upload or reject to retake.');
}

function rejectSnapshot() {
  __captureDataUrl = null;
  showLiveView();
  setCaptureStatus('Image rejected. Capture again.');
}

async function approveSnapshot() {
  if (!__captureDataUrl) {
    setCaptureStatus('No image captured yet.');
    return;
  }
  const modal = document.getElementById('cameraModal');
  const itemId = modal?.dataset?.itemId;
  if (!itemId) {
    setCaptureStatus('Missing item reference.');
    return;
  }

  try {
    const blob = dataUrlToBlob(__captureDataUrl);
    const formData = new FormData();
    formData.append('file', blob, `capture-${Date.now()}.jpg`);
    setCaptureStatus('Uploading image to Monday…');

    const res = await fetch(`/api/items/${encodeURIComponent(itemId)}/file`, {
      method: 'POST',
      body: formData,
      credentials: 'include'
    });
    if (!res.ok) {
      const errText = await res.text();
      setCaptureStatus(`Upload failed (${res.status}): ${errText || 'unknown error'}`);
      return;
    }
    const json = await res.json();
    if (!json?.ok) {
      setCaptureStatus(json.error || 'Upload failed.');
      return;
    }
    setCaptureStatus('Uploaded and attached to Monday.');
    setTimeout(closeCaptureModal, 600);
  } catch (err) {
    console.error('Upload failed', err);
    setCaptureStatus('Upload failed. Please try again.');
  }
}

function dataUrlToBlob(dataUrl) {
  const [meta, base64] = dataUrl.split(',');
  const contentType = (meta.match(/data:(.*);base64/) || [])[1] || 'image/jpeg';
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: contentType });
}

function stopCameraStream() {
  if (__cameraStream) {
    try {
      __cameraStream.getTracks().forEach(t => t.stop());
    } catch {}
  }
  __cameraStream = null;
}


async function loadBoard(options = {}) {
  if (__boardLoading) return;
  const boardDiv = document.getElementById('board') || document.body;
  const statusEl = document.getElementById('authStatus');
  const forceRefresh = options === true || options?.forceRefresh === true;
  const boardUrl = forceRefresh ? `${ENDPOINTS.data}?fresh=1` : ENDPOINTS.data;
  try {
    __boardLoading = true;
    const resBoard = await fetch(boardUrl, {
      cache: 'no-store',
      credentials: 'include',
      headers: forceRefresh ? { 'Cache-Control': 'no-cache' } : {}
    });

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
    window.__latestBoardPayload = payload;
    renderBoard(payload);
    refreshVisualItemSelect(payload);
    const connectBtn = document.getElementById('connectBtn');
    if (connectBtn) connectBtn.style.display = 'none';
    if (statusEl) statusEl.textContent = 'Connected to Monday.';
  } catch (err) {
    console.warn('Board load failed', err);
    boardDiv.textContent = 'Failed to load board: fetch error';
  } finally {
    __boardLoading = false;
  }
}

function startBoardAutoRefresh() {
  if (__boardRefreshTimer) return;
  __boardRefreshTimer = setInterval(() => {
    if (document.hidden) return;
    const dashboard = document.getElementById('tab-dashboard');
    if (dashboard && !dashboard.classList.contains('active')) return;
    loadBoard({ forceRefresh: true });
  }, BOARD_AUTO_REFRESH_MS);
}

// --------------------------- RENDER BOARD ---------------------------

function renderBoard(payload) {
  const boardDiv = document.getElementById('board') || document.body;
  const uiState = collectBoardUiState(boardDiv);
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

  const boardColumns = getRenderableBoardColumns(board.columns || []);
  const subitemColumns = getRenderableSubitemColumns(board.subitemColumns || []);
  const gridSpec = buildDashboardGridSpec(boardColumns, { subitem: false });
  const subitemGridSpec = buildDashboardGridSpec(subitemColumns, { subitem: true });

  for (const group of (board.groups || [])) {
    const collectionName = group.title || 'Untitled Group';
    const items = (group.items_page && group.items_page.items) || [];
    const groupKey = slugify(collectionName);

    const groupWrap = document.createElement('section');
    groupWrap.className = 'group';
    groupWrap.dataset.groupKey = groupKey;
    if (uiState.collapsedGroups.has(groupKey)) groupWrap.classList.add('collapsed');
    if (group.color) groupWrap.style.setProperty('--group-accent', group.color);

    const sectionTitle = document.createElement('button');
    sectionTitle.className = 'group-title';
    sectionTitle.type = 'button';
    sectionTitle.innerHTML = `
      <span class="chev" aria-hidden="true"></span>
      <span class="group-name">${escapeHtml(collectionName)}</span>
    `;
    sectionTitle.setAttribute('aria-expanded', uiState.collapsedGroups.has(groupKey) ? 'false' : 'true');
    const toggleGroup = () => {
      const collapsed = groupWrap.classList.toggle('collapsed');
      sectionTitle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      groupSummary.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    };
    sectionTitle.addEventListener('click', toggleGroup);
    groupWrap.appendChild(sectionTitle);

    const groupSummary = buildGroupSummary(collectionName, items, gridSpec);
    groupSummary.setAttribute('aria-expanded', uiState.collapsedGroups.has(groupKey) ? 'false' : 'true');
    groupSummary.addEventListener('click', toggleGroup);
    groupWrap.appendChild(groupSummary);

    const tableWrap = document.createElement('div');
    tableWrap.className = 'group-content';

    const grid = document.createElement('div');
    grid.className = 'board-grid';
    grid.style.setProperty('--board-cols', gridSpec.template);
    grid.style.minWidth = `${gridSpec.minWidth}px`;

    const headRow = document.createElement('div');
    headRow.className = 'grid-row grid-head';
    for (const spec of gridSpec.columns) {
      headRow.appendChild(buildHeaderCell(spec));
    }
    grid.appendChild(headRow);

    for (const item of items) {
      const itemId = String(item.id);
      const subitems = Array.isArray(item.subitems) ? item.subitems : [];

      const row = document.createElement('div');
      row.dataset.itemId = itemId;
      row.className = 'grid-row job-row';
      row.style.setProperty('--board-cols', gridSpec.template);
      const subitemsOpen = uiState.openSubitems.has(itemId);

      for (const spec of gridSpec.columns) {
        row.appendChild(buildItemCell(item, spec, { subitemsOpen }));
      }
      grid.appendChild(row);

      if (subitems.length > 0) {
        const subPanel = document.createElement('div');
        subPanel.className = `subitem-panel ${subitemsOpen ? '' : 'hidden'}`.trim();
        subPanel.dataset.parent = itemId;
        subPanel.style.minWidth = `${gridSpec.minWidth}px`;

        const subGrid = document.createElement('div');
        subGrid.className = 'subitem-grid';
        subGrid.style.setProperty('--subitem-cols', subitemGridSpec.template);
        subGrid.style.minWidth = `${Math.max(subitemGridSpec.minWidth, gridSpec.minWidth)}px`;

        const subHead = document.createElement('div');
        subHead.className = 'subitem-row sub-head';
        for (const spec of subitemGridSpec.columns) {
          subHead.appendChild(buildHeaderCell(spec));
        }
        subGrid.appendChild(subHead);

        for (const sub of subitems) {
          const subRow = document.createElement('div');
          subRow.className = 'subitem-row sub-row';
          subRow.dataset.parent = itemId;
          for (const spec of subitemGridSpec.columns) {
            subRow.appendChild(buildSubitemCell(sub, spec));
          }
          subGrid.appendChild(subRow);
        }

        subPanel.appendChild(subGrid);
        grid.appendChild(subPanel);
      }
    }

    tableWrap.appendChild(grid);
    groupWrap.appendChild(tableWrap);

    boardDiv.appendChild(groupWrap);
  }
}

function collectBoardUiState(boardDiv) {
  const collapsedGroups = new Set();
  const openSubitems = new Set();
  try {
    boardDiv.querySelectorAll('.group.collapsed[data-group-key]').forEach(group => {
      collapsedGroups.add(group.dataset.groupKey);
    });
    boardDiv.querySelectorAll('.job-row[data-item-id] .row-toggle.open').forEach(toggle => {
      const row = toggle.closest('.job-row[data-item-id]');
      if (row?.dataset?.itemId) openSubitems.add(row.dataset.itemId);
    });
  } catch {}
  return { collapsedGroups, openSubitems };
}

function toggleSubRows(parentId, open) {
  const rows = document.querySelectorAll(`.subitem-panel[data-parent="${CSS.escape(parentId)}"]`);
  rows.forEach(r => r.classList.toggle('hidden', !open));
}

function buildGroupSummary(groupName, items, gridSpec) {
  const summary = document.createElement('button');
  summary.type = 'button';
  summary.className = 'group-summary';
  summary.style.setProperty('--board-cols', gridSpec.template);
  summary.style.minWidth = `${gridSpec.minWidth}px`;
  summary.setAttribute('aria-expanded', 'true');

  const left = document.createElement('span');
  left.className = 'group-summary-left';
  const itemCount = items.length;
  const subitemCount = countSubitems(items);
  left.innerHTML = `
    <span class="chev" aria-hidden="true"></span>
    <span class="group-summary-copy">
      <span class="group-summary-name">${escapeHtml(groupName)}</span>
      <span class="group-summary-count">${itemCount} Job${itemCount === 1 ? '' : 's'} / ${subitemCount} Subitem${subitemCount === 1 ? '' : 's'}</span>
    </span>
  `;
  summary.appendChild(left);

  for (const spec of gridSpec.columns.slice(2)) {
    summary.appendChild(buildSummaryCell(items, spec.column));
  }

  return summary;
}

function countSubitems(items) {
  return items.reduce((sum, item) => sum + (Array.isArray(item.subitems) ? item.subitems.length : 0), 0);
}

function buildSummaryCell(items, column) {
  const cell = document.createElement('span');
  cell.className = `group-summary-cell summary-${column.type}`;
  if (column.type === 'status') {
    cell.appendChild(buildSummaryLabel(column.title));
    cell.appendChild(buildSummaryStatusBar(items, column));
  } else if (column.type === 'checkbox') {
    cell.appendChild(buildSummaryLabel(column.title));
    const count = document.createElement('span');
    count.className = 'group-summary-count-value';
    count.textContent = `${countChecked(items, column.id)}/${items.length}`;
    count.style.color = getCheckboxTickColor(column);
    cell.appendChild(count);
  } else {
    cell.classList.add('empty');
  }
  return cell;
}

function buildSummaryLabel(title) {
  const label = document.createElement('span');
  label.className = 'group-summary-label';
  label.textContent = title || '';
  return label;
}

function buildSummaryStatusBar(items, column) {
  const bar = document.createElement('span');
  bar.className = 'group-summary-status-bar';
  const counts = new Map();
  const total = Math.max(items.length, 1);

  for (const item of items) {
    const value = findColumnValue(item, column.id);
    const text = normalizeCellText(value?.text || '');
    const key = text || '__empty__';
    const current = counts.get(key) || {
      count: 0,
      color: text ? resolveStatusColor(column, value, text) : '#83899c'
    };
    current.count += 1;
    counts.set(key, current);
  }

  if (!items.length) {
    counts.set('__empty__', { count: 1, color: '#83899c' });
  }

  for (const entry of counts.values()) {
    const segment = document.createElement('span');
    segment.className = 'group-summary-status-segment';
    segment.style.backgroundColor = entry.color;
    segment.style.flexGrow = String(entry.count / total);
    bar.appendChild(segment);
  }

  return bar;
}

function countChecked(items, columnId) {
  return items.reduce((sum, item) => {
    const value = findColumnValue(item, columnId);
    return sum + (isCheckedValue(value) ? 1 : 0);
  }, 0);
}

function getRenderableBoardColumns(columns) {
  return normalizeColumns(columns).filter(column =>
    column.id !== 'name' &&
    !HIDDEN_BOARD_COLUMN_IDS.has(column.id) &&
    !HIDDEN_BOARD_COLUMN_TYPES.has(column.type)
  );
}

function getRenderableSubitemColumns(columns) {
  return normalizeColumns(columns).filter(column => column.id !== 'name');
}

function normalizeColumns(columns) {
  return (Array.isArray(columns) ? columns : [])
    .map(column => ({
      id: String(column.id || ''),
      title: column.title || column.id || '',
      type: column.type || 'text',
      settings_str: column.settings_str || ''
    }))
    .filter(column => column.id);
}

function buildDashboardGridSpec(mondayColumns, { subitem = false } = {}) {
  const columns = [
    { kind: 'print', title: subitem ? '' : 'Print', width: 82 },
    { kind: 'name', title: subitem ? 'Subitem' : 'Job', width: subitem ? 520 : 560 },
    ...mondayColumns.map(column => ({
      kind: 'column',
      title: column.title,
      width: getColumnWidth(column),
      column
    }))
  ];
  const minWidth = columns.reduce((sum, column) => sum + column.width, 0);
  return {
    columns,
    minWidth,
    template: columns.map(column => `${column.width}px`).join(' ')
  };
}

function getColumnWidth(column) {
  const title = String(column.title || '').toUpperCase();
  if (column.type === 'status') {
    if (title === 'TYPE') return 88;
    if (title === 'STATUS') return 128;
    if (title === 'PRIORITY') return 108;
    return 112;
  }
  if (column.type === 'checkbox') return title.length <= 5 ? 72 : 92;
  if (column.type === 'date') return 92;
  if (column.type === 'file') return title === 'PROOF' ? 100 : 90;
  if (column.type === 'people') return 150;
  if (column.type === 'timeline') return 150;
  if (column.type === 'numbers') return 92;
  if (title === 'NOTES' || title === 'TEXT') return 320;
  if (title === 'DES/PSG') return 122;
  if (title === 'COLOUR' || title === 'COLOR') return 158;
  if (title === 'CODE') return 142;
  if (title === 'QTY') return 80;
  if (title === 'SIZE') return 220;
  return 150;
}

function buildHeaderCell(spec) {
  const cell = document.createElement('div');
  cell.className = `grid-cell head ${spec.kind}-head`;
  cell.textContent = spec.title || '';
  return cell;
}

function buildItemCell(item, spec, { subitemsOpen = false } = {}) {
  if (spec.kind === 'print') return buildPrintCell(item);
  if (spec.kind === 'name') return buildNameCell(item, subitemsOpen);
  return buildColumnValueCell(item, spec.column);
}

function buildSubitemCell(subitem, spec) {
  if (spec.kind === 'print') return buildBlankCell('print-cell');
  if (spec.kind === 'name') return buildSubitemNameCell(subitem);
  return buildColumnValueCell(subitem, spec.column, { subitem: true });
}

function buildPrintCell(item) {
  const cell = document.createElement('div');
  cell.className = 'grid-cell print-cell';
  const jobTitle = item.name || '';
  const printBtn = document.createElement('button');
  printBtn.textContent = 'Print';
  printBtn.className = 'job-action primary';
  printBtn.addEventListener('click', () => printLabel(item.id, jobTitle));
  cell.appendChild(printBtn);

  const photoBtn = document.createElement('button');
  photoBtn.type = 'button';
  photoBtn.className = 'job-action success camera-btn';
  photoBtn.title = 'Capture image';
  photoBtn.textContent = 'Camera';
  photoBtn.addEventListener('click', () => openCaptureModal(item.id, jobTitle));
  cell.appendChild(photoBtn);
  return cell;
}

function buildNameCell(item, initiallyOpen = false) {
  const itemId = String(item.id);
  const subitems = Array.isArray(item.subitems) ? item.subitems : [];
  const cell = document.createElement('div');
  cell.className = 'grid-cell job-cell title-cell';
  const titleWrap = document.createElement('div');
  titleWrap.className = 'title-wrap';

  if (subitems.length > 0) {
    const rowToggle = document.createElement('button');
    rowToggle.className = 'row-toggle';
    rowToggle.type = 'button';
    rowToggle.setAttribute('aria-label', 'Toggle subitems');
    rowToggle.classList.toggle('open', initiallyOpen);
    rowToggle.setAttribute('aria-expanded', initiallyOpen ? 'true' : 'false');
    rowToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = rowToggle.classList.toggle('open');
      rowToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      toggleSubRows(itemId, isOpen);
    });
    titleWrap.appendChild(rowToggle);
  } else {
    const spacer = document.createElement('span');
    spacer.className = 'row-toggle-spacer';
    titleWrap.appendChild(spacer);
  }

  const titleSpan = document.createElement('span');
  titleSpan.className = 'job-title';
  titleSpan.textContent = item.name || '';
  titleWrap.appendChild(titleSpan);

  if (subitems.length > 0) {
    const badge = document.createElement('span');
    badge.className = 'subitem-count-badge';
    badge.textContent = String(subitems.length);
    titleWrap.appendChild(badge);
  }

  cell.appendChild(titleWrap);
  return cell;
}

function buildSubitemNameCell(subitem) {
  const cell = document.createElement('div');
  cell.className = 'grid-cell job-cell subitem-name-cell';
  const wrap = document.createElement('div');
  wrap.className = 'title-wrap';
  const spacer = document.createElement('span');
  spacer.className = 'row-toggle-spacer';
  wrap.appendChild(spacer);
  const title = document.createElement('span');
  title.className = 'subitem-title';
  title.textContent = subitem.name || '';
  wrap.appendChild(title);
  cell.appendChild(wrap);
  return cell;
}

function buildBlankCell(extraClass = '') {
  const cell = document.createElement('div');
  cell.className = `grid-cell ${extraClass}`.trim();
  return cell;
}

function buildColumnValueCell(entity, column, { subitem = false } = {}) {
  const cell = document.createElement('div');
  cell.className = `grid-cell monday-value-cell ${subitem ? 'subitem-value-cell' : ''} column-${column.type}`;
  cell.dataset.columnId = column.id;
  const value = findColumnValue(entity, column.id);
  const text = normalizeCellText(value?.text || '');
  if (text) cell.title = text;

  if (column.type === 'status') {
    renderStatusValue(cell, value, column, text);
  } else if (column.type === 'checkbox') {
    renderCheckboxValue(cell, value, column);
  } else if (column.type === 'file') {
    renderFileValue(cell, value, text);
  } else if (column.type === 'people') {
    renderPeopleValue(cell, text);
  } else if (column.type === 'date') {
    renderPlainTextValue(cell, formatDateText(text));
  } else if (column.type === 'timeline') {
    renderPlainTextValue(cell, text);
  } else if (column.type === 'text' || column.type === 'long_text') {
    renderTextInputValue(cell, text);
  } else {
    renderPlainTextValue(cell, text);
  }

  return cell;
}

function findColumnValue(entity, columnId) {
  return (entity.column_values || []).find(value => value.id === columnId) || null;
}

function normalizeCellText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function renderStatusValue(cell, value, column, text) {
  const badge = document.createElement('span');
  badge.className = 'monday-status-badge';
  if (!text) {
    badge.classList.add('empty');
    cell.appendChild(badge);
    return;
  }

  const color = resolveStatusColor(column, value, text);
  badge.style.backgroundColor = color;
  badge.style.color = readableTextColor(color);
  badge.textContent = text;
  cell.appendChild(badge);
}

function renderCheckboxValue(cell, value, column) {
  if (!isCheckedValue(value)) return;
  const mark = document.createElement('span');
  mark.className = 'monday-check-tick';
  mark.style.color = getCheckboxTickColor(column);
  mark.textContent = '✓';
  cell.appendChild(mark);
}

function getCheckboxTickColor(column) {
  const title = String(column?.title || '').toUpperCase();
  if (title.includes('JAQ')) return '#fdab3d';
  if (title.includes('CHECK')) return '#579bfc';
  return '#579bfc';
}

function renderFileValue(cell, value, text) {
  const files = getFileList(value);
  if (!files.length && !text) return;
  const file = normalizeMondayFile(files[0]) || { name: text || 'File', url: text || '' };
  const link = document.createElement(file.url ? 'a' : 'span');
  link.className = 'monday-file-link';
  if (file.url) {
    link.href = file.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }

  if (isImageFile(file)) {
    const img = document.createElement('img');
    img.className = 'monday-file-thumb';
    img.src = file.url;
    img.alt = file.name || 'Attached file';
    img.loading = 'lazy';
    link.appendChild(img);
  } else {
    const icon = document.createElement('span');
    icon.className = `monday-file-icon ${isPdfFile(file.name, file.mime) ? 'pdf' : ''}`;
    link.appendChild(icon);
  }

  const name = document.createElement('span');
  name.className = 'monday-file-name';
  name.textContent = file.name || 'File';
  link.title = file.name || text || 'Attached file';
  link.appendChild(name);
  cell.appendChild(link);

  if (files.length > 1) {
    const count = document.createElement('span');
    count.className = 'monday-file-count';
    count.textContent = `+${files.length - 1}`;
    cell.appendChild(count);
  }
}

function renderPeopleValue(cell, text) {
  if (!text) return;
  const pill = document.createElement('span');
  pill.className = 'monday-person-pill';
  pill.textContent = text;
  cell.appendChild(pill);
}

function renderTextInputValue(cell, text) {
  if (!text) return;
  const span = document.createElement('span');
  span.className = 'monday-text-input';
  span.textContent = text;
  cell.appendChild(span);
}

function renderPlainTextValue(cell, text) {
  if (!text) return;
  const span = document.createElement('span');
  span.className = 'monday-plain-text';
  span.textContent = text;
  cell.appendChild(span);
}

function isCheckedValue(value) {
  const parsed = parseJsonMaybe(value?.value);
  if (parsed?.checked === true || parsed?.checked === 'true') return true;
  const text = normalizeCellText(value?.text || '').toLowerCase();
  return text === 'v' || text === 'yes' || text === 'true' || text === 'checked' || text === '✓';
}

function getFileList(value) {
  const parsed = parseJsonMaybe(value?.value);
  return Array.isArray(parsed?.files) ? parsed.files : [];
}

function normalizeMondayFile(file) {
  if (!file) return null;
  const assetId = file.assetId || file.asset_id || file.id || '';
  const name = file.name || file.fileName || 'File';
  const url = assetId
    ? `/api/assets/${encodeURIComponent(assetId)}/inline?name=${encodeURIComponent(name)}`
    : (file.url || file.public_url || file.publicUrl || '');
  return {
    ...file,
    assetId,
    name,
    url,
    mime: file.mime || inferMimeTypeFromName(name)
  };
}

function isImageFile(file) {
  if (!file) return false;
  const imageFlag = String(file.isImage || '').toLowerCase();
  if (imageFlag === 'true') return true;
  if (String(file.mime || '').toLowerCase().startsWith('image/')) return true;
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name || '');
}

function inferMimeTypeFromName(name) {
  if (/\.pdf$/i.test(name || '')) return 'application/pdf';
  if (/\.png$/i.test(name || '')) return 'image/png';
  if (/\.jpe?g$/i.test(name || '')) return 'image/jpeg';
  if (/\.gif$/i.test(name || '')) return 'image/gif';
  if (/\.webp$/i.test(name || '')) return 'image/webp';
  return '';
}

function resolveStatusColor(column, value, text) {
  const settings = parseJsonMaybe(column.settings_str) || {};
  const statusIndex = findStatusIndex(settings, value, text);
  const configuredColor = statusIndex != null ? settings.labels_colors?.[statusIndex]?.color : '';
  if (configuredColor) return configuredColor;
  return fallbackStatusColor(text);
}

function findStatusIndex(settings, value, text) {
  const parsed = parseJsonMaybe(value?.value);
  if (parsed?.index !== undefined && parsed?.index !== null) return String(parsed.index);
  if (parsed?.label?.index !== undefined && parsed?.label?.index !== null) return String(parsed.label.index);

  const labels = settings.labels || {};
  const normalizedText = normalizeStatusLabel(text);
  for (const [index, label] of Object.entries(labels)) {
    if (normalizeStatusLabel(label) === normalizedText) return String(index);
  }
  return null;
}

function normalizeStatusLabel(label) {
  return String(label || '').trim().toLowerCase();
}

function fallbackStatusColor(text) {
  const label = normalizeStatusLabel(text);
  if (label.includes('critical')) return '#bb3354';
  if (label.includes('waiting')) return '#8088a8';
  if (label.includes('sample')) return '#9cd326';
  if (label.includes('stock') || label.includes('complete')) return '#00c875';
  if (label.includes('emb')) return '#ff7575';
  if (label.includes('print')) return '#fdab3d';
  return '#579bfc';
}

function readableTextColor(color) {
  const hex = String(color || '').replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return '#fff';
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.64 ? '#1f2329' : '#fff';
}

function parseJsonMaybe(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function formatDateText(text) {
  const trimmed = normalizeCellText(text);
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return trimmed;
  const date = new Date(`${trimmed}T00:00:00`);
  if (Number.isNaN(date.getTime())) return trimmed;
  return new Intl.DateTimeFormat('en-GB', { month: 'short', day: 'numeric' }).format(date);
}

function slugify(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
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
    // Refresh Monday-backed board state after a successful scan.
    if (r2.ok) loadBoard({ forceRefresh: true });
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
  const initialTab = getExplicitDashboardTab() || getStoredDashboardTab() || 'dashboard';

  activateDashboardTab(initialTab);

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      activateDashboardTab(tab.getAttribute("data-tab"));
    });
  });
});

function activateDashboardTab(target) {
  const requestedTab = isValidDashboardTab(target) ? target : 'dashboard';
  const activeTab = document.getElementById(`tab-${requestedTab}`) ? requestedTab : 'dashboard';
  const tabs = document.querySelectorAll(".nav-tabs li");
  const contents = document.querySelectorAll(".tab-content");

  tabs.forEach(tab => {
    tab.classList.toggle("active", tab.getAttribute("data-tab") === activeTab);
  });
  contents.forEach(content => {
    content.classList.toggle("active", content.id === `tab-${activeTab}`);
  });
  setStoredDashboardTab(activeTab);
}

function getExplicitDashboardTab() {
  const params = new URLSearchParams(window.location.search);
  const queryTab = params.get('tab');
  if (isValidDashboardTab(queryTab)) return queryTab;

  const hashTab = window.location.hash.replace(/^#/, '');
  return isValidDashboardTab(hashTab) ? hashTab : '';
}

function getStoredDashboardTab() {
  try {
    const storedTab = window.localStorage.getItem(DASHBOARD_TAB_STORAGE_KEY);
    return isValidDashboardTab(storedTab) ? storedTab : '';
  } catch {
    return '';
  }
}

function setStoredDashboardTab(tabName) {
  if (!isValidDashboardTab(tabName)) return;
  try {
    window.localStorage.setItem(DASHBOARD_TAB_STORAGE_KEY, tabName);
  } catch {}
}

function isValidDashboardTab(tabName) {
  return DASHBOARD_TAB_NAMES.includes(tabName);
}

// ================== VISUAL APPROVALS TAB ==================
const __vaState = { items: [], loaded: false, overlayTimer: null, overlayPct: 0 };

document.addEventListener('DOMContentLoaded', initVisualTab);

function initVisualTab() {
  const refreshBtn = document.getElementById('va-refresh');
  const analyzeBtn = document.getElementById('va-analyze');
  const approveBtn = document.getElementById('va-approve');
  const rejectBtn = document.getElementById('va-reject');
  const itemSel = document.getElementById('va-item');

  if (refreshBtn) refreshBtn.addEventListener('click', () => refreshVisualItemSelect());
  if (analyzeBtn) analyzeBtn.addEventListener('click', () => loadVisualAssets(true));
  if (approveBtn) approveBtn.addEventListener('click', () => handleVAApprove());
  if (rejectBtn) rejectBtn.addEventListener('click', () => handleVAReject());
  if (itemSel) itemSel.addEventListener('change', () => loadVisualAssets(false));

  bindLightboxClicks();
  refreshVABadgeCount();
}

function refreshVisualItemSelect(payload) {
  const sel = document.getElementById('va-item');
  if (!sel) return;

  let items = [];
  const board = unwrapFirstBoard(payload || window.__latestBoardPayload);
  if (board?.groups) {
    for (const g of board.groups) {
      const its = (g.items_page && g.items_page.items) || [];
      items.push(...its);
    }
  }
  __vaState.items = items;

  const current = sel.value;
  sel.innerHTML = '';
  if (!items.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No jobs loaded';
    sel.appendChild(opt);
    return;
  }
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select a job';
  sel.appendChild(placeholder);
  for (const it of items) {
    const opt = document.createElement('option');
    opt.value = it.id;
    opt.textContent = it.name || `Item ${it.id}`;
    sel.appendChild(opt);
  }
  if (current) sel.value = current;
  window.__latestBoardPayload = payload || window.__latestBoardPayload;
  refreshVABadgeCount();
}

function isPdfFile(name, mime) {
  const lowerMime = (mime || '').toLowerCase();
  if (lowerMime.includes('pdf')) return true;
  return /\.pdf(\?|$)/i.test(name || '');
}

function buildAssetSrc(file, { stripPdfUi = false } = {}) {
  if (!file) return '';
  if (file.assetId) {
    const name = encodeURIComponent(file.name || 'file');
    const base = `/api/assets/${encodeURIComponent(file.assetId)}/inline?name=${name}`;
    return stripPdfUi ? `${base}#toolbar=0&navpanes=0&scrollbar=0&view=FitH` : base;
  }
  const url = file.url || '';
  if (stripPdfUi && url) return `${url}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`;
  return url;
}

let __pdfJsPromise = null;
async function ensurePdfJs() {
  if (window.pdfjsLib) return window.pdfjsLib;
  if (__pdfJsPromise) return __pdfJsPromise;
  __pdfJsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.async = true;
    script.onload = () => {
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        window.pdfjsLib.disableWorker = false;
        resolve(window.pdfjsLib);
      } else {
        reject(new Error('pdfjsLib not available after load'));
      }
    };
    script.onerror = () => reject(new Error('Failed to load pdf.js'));
    document.head.appendChild(script);
  });
  return __pdfJsPromise;
}

async function renderPdfImage(src, altText = 'PDF') {
  const pdfjs = await ensurePdfJs();
  // Fetch buffer first to avoid worker cross-origin fetch issues
  const resp = await fetch(src, { credentials: 'include', cache: 'no-store' });
  if (!resp.ok) throw new Error(`PDF fetch failed (${resp.status})`);
  const buffer = await resp.arrayBuffer();

  const loadingTask = pdfjs.getDocument({
    data: buffer,
    useWorkerFetch: true,
    isEvalSupported: true,
    disableAutoFetch: false,
  });

  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1.3 });
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: ctx, viewport }).promise;
  const img = document.createElement('img');
  img.src = canvas.toDataURL('image/png');
  img.alt = altText;
  img.className = 'va-pdf-img';
  return img;
}

function renderProofGrid(proofs) {
  const grid = document.getElementById('va-proof-grid');
  const phProof = document.getElementById('va-proof-ph');
  if (!grid) return;
  grid.innerHTML = '';
  const items = (Array.isArray(proofs) ? proofs : []).filter(f => f && (f.url || f.assetId));
  if (!items.length) {
    grid.classList.add('hidden');
    if (phProof) phProof.classList.remove('hidden');
    return;
  }
  for (const file of items.slice(0, 4)) {
    const pdf = isPdfFile(file.name, file.mime);
    const src = buildAssetSrc(file, { stripPdfUi: pdf });
    if (!src) continue;
    const cell = document.createElement('div');
    cell.className = 'va-proof-cell';
    if (pdf) {
      const loader = document.createElement('div');
      loader.className = 'va-pdf-loading';
      loader.textContent = 'Rendering PDF…';
      cell.appendChild(loader);
      renderPdfImage(src, file.name || 'PDF')
        .then(img => {
          if (!cell.isConnected) return;
          img.dataset.fullSrc = img.src;
          img.dataset.caption = file.name || '';
          cell.innerHTML = '';
          cell.appendChild(img);
        })
        .catch((err) => {
          console.error('PDF render failed (proof)', err);
          if (!cell.isConnected) return;
          // Fallback to native viewer if render fails
          const obj = document.createElement('object');
          obj.type = 'application/pdf';
          obj.data = src;
          obj.title = file.name || 'PDF preview';
          obj.style.width = '100%';
          obj.style.height = '100%';
          obj.dataset.fullSrc = src;
          obj.dataset.caption = file.name || '';
          cell.innerHTML = '';
          cell.appendChild(obj);
        });
    } else {
      const node = document.createElement('img');
      node.src = src;
      node.alt = file.name || 'Finished visual';
      node.loading = 'lazy';
      node.dataset.fullSrc = src;
      node.dataset.caption = file.name || '';
      cell.appendChild(node);
    }
    grid.appendChild(cell);
  }
  grid.classList.toggle('single', items.length === 1);
  grid.classList.remove('hidden');
  if (phProof) phProof.classList.add('hidden');
}

function renderCapturedMedia(media) {
  const grid = document.getElementById('va-captured-grid');
  const phCap = document.getElementById('va-captured-ph');
  if (!grid) return;
  grid.innerHTML = '';
  const items = Array.isArray(media) ? media : (media ? [media] : []);
  if (!items.length) {
    grid.classList.add('hidden');
    if (phCap) phCap.classList.remove('hidden');
    return;
  }
  for (const file of items.slice(0, 4)) {
    const pdf = isPdfFile(file?.name, file?.mime);
    const src = buildAssetSrc(file, { stripPdfUi: pdf });
    if (!src) continue;
    const cell = document.createElement('div');
    cell.className = 'va-proof-cell';
    if (pdf) {
      const loader = document.createElement('div');
      loader.className = 'va-pdf-loading';
      loader.textContent = 'Rendering PDF…';
      cell.appendChild(loader);
      renderPdfImage(src, file?.name || 'PDF')
        .then(img => {
          if (!cell.isConnected) return;
          img.dataset.fullSrc = img.src;
          img.dataset.caption = file?.name || '';
          cell.innerHTML = '';
          cell.appendChild(img);
        })
        .catch((err) => {
          console.error('PDF render failed (captured)', err);
          if (!cell.isConnected) return;
          const obj = document.createElement('object');
          obj.type = 'application/pdf';
          obj.data = src;
          obj.title = file?.name || 'PDF preview';
          obj.style.width = '100%';
          obj.style.height = '100%';
          obj.dataset.fullSrc = src;
          obj.dataset.caption = file?.name || '';
          cell.innerHTML = '';
          cell.appendChild(obj);
        });
    } else {
      const node = document.createElement('img');
      node.src = src;
      node.alt = file?.name || 'Captured image';
      node.loading = 'lazy';
      node.dataset.fullSrc = src;
      node.dataset.caption = file?.name || '';
      cell.appendChild(node);
    }
    grid.appendChild(cell);
  }
  grid.classList.toggle('single', items.length === 1);
  grid.classList.remove('hidden');
  if (phCap) phCap.classList.add('hidden');
}

async function loadVisualAssets(runAnalysis = false) {
  const itemSel = document.getElementById('va-item');
  if (!itemSel) return;
  const itemId = itemSel.value;
  const side = 'front';
  if (!itemId) return;

  setVAStatus('', 'info');
  if (runAnalysis) showVAOverlay('Running analysis…', 10, false, true);
  renderVAResult(null);

  try {
    const url = `/api/visual-approvals/${encodeURIComponent(itemId)}?side=${encodeURIComponent(side)}${runAnalysis ? '&analyze=1' : ''}`;
    const res = await fetch(url, { cache: 'no-store', credentials: 'include' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) {
      if (runAnalysis) hideVAOverlay();
      return;
    }
    const proofName = document.getElementById('va-proof-name');
    const capName = document.getElementById('va-captured-name');

    const proofs = Array.isArray(json.proofs) ? json.proofs : (json.proof ? [json.proof] : []);

    renderProofGrid(proofs);
    renderCapturedMedia(json.capturedFiles && json.capturedFiles.length ? json.capturedFiles : json.captured);

    if (proofName) proofName.textContent = proofs[0]?.name || json.proof?.name || '';
    if (capName) capName.textContent = (json.capturedFiles && json.capturedFiles[0]?.name) || json.captured?.name || '';

    renderVAResult(json.analysis);
    if (runAnalysis) showVAOverlay('Analysis complete.', 100, true);
    refreshVABadgeCount();
  } catch (err) {
    console.error('visual approvals fetch failed', err);
    if (runAnalysis) showVAOverlay('Analysis failed.', 100, true);
  }
}

function clearVisualPreview() {
  const proofGrid = document.getElementById('va-proof-grid');
  const capGrid = document.getElementById('va-captured-grid');
  const proofName = document.getElementById('va-proof-name');
  const capName = document.getElementById('va-captured-name');
  const phProof = document.getElementById('va-proof-ph');
  const phCap = document.getElementById('va-captured-ph');
  if (proofGrid) { proofGrid.innerHTML = ''; proofGrid.classList.add('hidden'); }
  if (capGrid) { capGrid.innerHTML = ''; capGrid.classList.add('hidden'); capGrid.dataset.type = ''; }
  if (phProof) phProof.classList.remove('hidden');
  if (phCap) phCap.classList.remove('hidden');
  if (proofName) proofName.textContent = '';
  if (capName) capName.textContent = '';
  renderVAResult(null);
}

function renderVAResult(analysis) {
  const wrap = document.getElementById('va-result-float');
  if (!wrap) return;
  const conf = wrap.querySelector('.va-confidence');
  const findings = wrap.querySelector('.va-findings');
  const proofGrid = document.getElementById('va-proof-grid');
  const capFrame = document.getElementById('va-captured-grid');
  const previewCard = document.getElementById('va-preview-card');
  if (conf) {
    if (!analysis) {
      conf.textContent = '';
    } else {
      const pct = Math.round(analysis.confidence || 0);
      const label = analysis.ok ? 'Match' : 'Differences found';
      conf.innerHTML = `<span class="va-confidence-number">${pct}%</span> confidence — ${escapeHtml(label)}`;
    }
  }
  if (findings) {
    if (!analysis) {
      findings.innerHTML = '';
    } else if (analysis.findings && analysis.findings.length) {
      findings.innerHTML = `<div>Findings:</div><ul>${analysis.findings.map(f => `<li>${escapeHtml(f)}</li>`).join('')}</ul>`;
    } else {
      findings.textContent = analysis.summary || 'No discrepancies reported.';
    }
  }
  wrap.classList.toggle('hidden', !analysis);
  if (analysis && proofGrid && capFrame) {
    proofGrid.classList.add('va-img-dim');
    capFrame.classList.add('va-img-dim');
    if (previewCard) previewCard.classList.add('dim');
  } else {
    if (proofGrid) proofGrid.classList.remove('va-img-dim');
    if (capFrame) capFrame.classList.remove('va-img-dim');
    if (previewCard) previewCard.classList.remove('dim');
  }
}

// Lightbox
function bindLightboxClicks() {
  const proofGrid = document.getElementById('va-proof-grid');
  const capFrame = document.getElementById('va-captured-frame');
  const lightbox = document.getElementById('va-lightbox');
  const lbImg = document.getElementById('va-lightbox-img');
  const lbCap = document.getElementById('va-lightbox-caption');
  const lbClose = document.getElementById('va-lightbox-close');
  if (!lightbox || !lbImg || !lbClose) return;

  const open = (src, caption = '') => {
    if (!src) return;
    lbImg.src = src;
    lbCap.textContent = caption || '';
    lightbox.classList.remove('hidden');
    document.body.classList.add('modal-open');
  };
  const close = () => {
    lightbox.classList.add('hidden');
    lbImg.src = '';
    lbCap.textContent = '';
    document.body.classList.remove('modal-open');
  };

  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox || e.target.classList.contains('va-lightbox-backdrop') || e.target === lbClose) {
      close();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  const clickHandler = (e) => {
    const target = e.target;
    if (!target) return;
    const full = target.dataset?.fullSrc;
    if (full) {
      e.stopPropagation();
      open(full, target.dataset?.caption || '');
    }
  };

  if (proofGrid) proofGrid.addEventListener('click', clickHandler);
  if (capFrame) capFrame.addEventListener('click', clickHandler);
}

function showVAOverlay(label, pct, autoHide = false, animate = false) {
  const overlay = document.getElementById('va-overlay');
  const bar = document.getElementById('va-progress-bar');
  const txt = document.getElementById('va-progress-label');
  const previewCard = document.getElementById('va-preview-card');
  if (!overlay || !bar || !txt) return;
  overlay.classList.add('show');
  bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  txt.textContent = label || '';
  if (animate) {
    clearInterval(__vaState.overlayTimer);
    __vaState.overlayPct = pct;
    __vaState.overlayTimer = setInterval(() => {
      __vaState.overlayPct = Math.min(90, __vaState.overlayPct + 2);
      bar.style.width = `${__vaState.overlayPct}%`;
    }, 300);
  }
  if (autoHide) {
    clearInterval(__vaState.overlayTimer);
    bar.style.width = '100%';
    setTimeout(() => {
      overlay.classList.remove('show');
      bar.style.width = '0%';
      if (previewCard) previewCard.classList.remove('dim');
    }, 600);
  } else if (previewCard) {
    previewCard.classList.add('dim');
  }
}

function hideVAOverlay() {
  const overlay = document.getElementById('va-overlay');
  const bar = document.getElementById('va-progress-bar');
  const previewCard = document.getElementById('va-preview-card');
  clearInterval(__vaState.overlayTimer);
  if (overlay) overlay.classList.remove('show');
  if (bar) bar.style.width = '0%';
  if (previewCard) previewCard.classList.remove('dim');
}

function getVASelection() {
  const itemSel = document.getElementById('va-item');
  return {
    itemId: itemSel?.value || '',
    side: 'front'
  };
}

function setVABusy(disabled) {
  const ids = ['va-approve', 'va-reject', 'va-analyze', 'va-refresh'];
  for (const id of ids) {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = !!disabled;
  }
}

function updateVABadge(count) {
  const badge = document.getElementById('va-badge');
  if (!badge) return;
  const n = Number(count) || 0;
  badge.textContent = n > 99 ? '99+' : String(n);
  badge.classList.toggle('hidden', n <= 0);
}

async function refreshVABadgeCount() {
  try {
    const res = await fetch('/api/visual-approvals/notifications', { cache: 'no-store', credentials: 'include' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) return;
    updateVABadge(json.count);
  } catch (err) {
    // ignore badge fetch errors
  }
}

function setVAStatus(msg, tone = 'info') {
  const el = document.getElementById('va-status');
  if (!el) return;
  el.textContent = msg || '';
  el.dataset.tone = tone;
}

async function handleVAApprove() {
  const { itemId, side } = getVASelection();
  if (!itemId) {
    setVAStatus('Select a job first.', 'error');
    return;
  }
  setVAStatus('Approving…', 'info');
  setVABusy(true);
  try {
    const res = await fetch(`/api/visual-approvals/${encodeURIComponent(itemId)}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ side })
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) throw new Error(json.error || 'Approval failed');
    setVAStatus('Proof approved and checkbox updated.', 'success');
    refreshVABadgeCount();
  } catch (err) {
    console.error('Approve failed', err);
    setVAStatus(err.message || 'Approval failed.', 'error');
  } finally {
    setVABusy(false);
  }
}

async function handleVAReject() {
  const { itemId, side } = getVASelection();
  if (!itemId) {
    setVAStatus('Select a job first.', 'error');
    return;
  }
  setVAStatus('Moving to Pre-Production…', 'info');
  setVABusy(true);
  try {
    const res = await fetch(`/api/visual-approvals/${encodeURIComponent(itemId)}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ side })
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) throw new Error(json.error || 'Reject failed');
    if (json.failedSubitems?.length) {
      setVAStatus(`Moved item; ${json.failedSubitems.length} subitems not moved.`, 'error');
    } else {
      setVAStatus('Moved to PRE-PRODUCTION.', 'success');
    }
    refreshVABadgeCount();
  } catch (err) {
    console.error('Reject failed', err);
    setVAStatus(err.message || 'Failed to move item.', 'error');
  } finally {
    setVABusy(false);
  }
}
