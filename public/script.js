// --- Monday Dashboard Frontend (Monday-style grid + collapsible groups/subitems) ---

const PROD_ORIGIN = window.location.origin;
const ENDPOINTS = {
  data: '/api/board',
  auth: '/auth',
  scans: '/api/scan-states',
  statusColumn: (itemId) => `/api/board/items/${encodeURIComponent(itemId)}/status-column`,
  testData: '/api/test-dashboard/board',
  testStatusColumn: (itemId) => `/api/test-dashboard/items/${encodeURIComponent(itemId)}/status-column`,
  testCheckboxColumn: (itemId) => `/api/test-dashboard/items/${encodeURIComponent(itemId)}/checkbox-column`,
  testScanUrl: (itemId) => `/api/test-dashboard/scan-url?jobId=${encodeURIComponent(itemId)}`,
  testUploadSignature: '/api/test-dashboard/uploads/signature',
  testFiles: (itemId) => `/api/test-dashboard/items/${encodeURIComponent(itemId)}/files`
};
const DASHBOARD_TAB_STORAGE_KEY = 'ultimateHub.activeDashboardTab';
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'ultimateHub.sidebarCollapsed';
const MOBILE_NAV_MEDIA = '(max-width: 720px), (max-width: 960px) and (max-height: 520px)';
const PROOF_PDF_ZOOM_MIN = 0.5;
const PROOF_PDF_ZOOM_MAX = 3;
const PROOF_PDF_ZOOM_STEP = 0.25;
const PRIORITY_HIGHLIGHT_STORAGE_KEY = 'ultimateHub.priorityHighlights';
const DASHBOARD_TAB_NAMES = ['dashboard', 'database', 'visuals', 'test-dashboard'];
const BOARD_AUTO_REFRESH_MS = 1000;
const BOARD_CONTEXT_MONDAY = 'monday';
const BOARD_CONTEXT_TEST = 'test-dashboard';
const DASHBOARD_ZOOM_MIN = 0.45;
const DASHBOARD_ZOOM_MAX = 1;
const HIDDEN_BOARD_COLUMN_TYPES = new Set(['subtasks']);
const HIDDEN_BOARD_COLUMN_IDS = new Set(['subitems__1']);
const HIDDEN_BOARD_COLUMN_TITLES = new Set(['START/END', 'START-END']);
const HIDDEN_SUBITEM_COLUMN_TITLES = new Set(['CHECK IN', 'TEXT']);
const MOBILE_PRINT_EMBROIDERY_HIDDEN_COLUMN_TITLES = new Set([
  'TRANS',
  'TRAN',
  'JAQ',
  'STATUS',
  'TYPE',
  'IMAGE',
  'IMAGES',
  'CHECK IN',
  'CHECKIN',
  'CHECKED IN',
  'CHECKEDIN'
]);
const STATUS_LABEL_FALLBACK_COLORS = {
  'waiting approval': '#8088a8',
  'stock in': '#66ccc9',
  'part-stock': '#e35a75',
  'to sample': '#a8d846',
  'completed': '#33d391',
  'checked in': '#e959b3',
  'sampled': '#579bfc',
  'in production': '#d8c95e',
  'supplied clothing': '#3aa7c9',
  'ready to print': '#2e9b69',
  'invoiced': '#ff2f92',
  'hold': '#c95778',
  'pre-production': '#6840b3',
  'no stock': '#ff7f50',
  'ordered': '#2b7de9',
  'critical': '#bb3354',
  'urgent': '#e2445c',
  'high': '#ff642e',
  'medium': '#fdab3d',
  'low': '#579bfc'
};
let __boardRefreshTimer = null;
let __boardLoading = false;
let __testBoardRefreshTimer = null;
let __testBoardLoading = false;
let __testFileUploadInput = null;
let __testFileUploadTarget = null;
let __testFileUploadsInFlight = 0;
const __testFileUploadingCells = new Set();
const __testCheckboxOptimisticValues = new Map();
let __testCheckboxOptimisticSeq = 0;
let __boardSortState = null;
let __priorityHighlightsEnabled = localStorage.getItem(PRIORITY_HIGHLIGHT_STORAGE_KEY) !== '0';
let __dashboardZoom = 1;
let __dashboardPinchState = null;
let __statusDropdownState = null;
let __statusUpdateInFlight = 0;
let __testCompleteConfirmResolve = null;
let __proofModalState = {
  files: [],
  fileIndex: 0,
  pageNumber: 1,
  pageCount: 1,
  pdf: null,
  pdfZoom: 1,
  pdfRotation: 0,
  pdfDrag: null,
  modalLabel: 'Proof',
  renderToken: 0
};

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
  ensureSidebarToggle();
  ensureAuthUI();
  addCameraUI();
  addSerialScannerUI();
  ensureTestDashboardUI();
  attachSerialEvents();
  initDashboardPinchZoom();
  loadBoard({ forceRefresh: true });
  startBoardAutoRefresh();
  startTestBoardAutoRefresh();
});
window.loadBoard = loadBoard;
window.loadTestBoard = loadTestBoard;

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

  document.getElementById('authStatus')?.remove();

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
  connectBtn.style.display = 'none';
  if (connectBtn.parentElement !== bar) bar.appendChild(connectBtn);

  // Scanner connect button will be inserted by addSerialScannerUI(); keep space updated
}

function ensureSidebarToggle() {
  const app = document.querySelector('.app-container');
  const button = document.getElementById('sidebarToggle');
  const mobileButton = document.getElementById('mobileNavToggle');
  const backdrop = document.getElementById('mobileNavBackdrop');
  if (!app || !button) return;

  const mobileQuery = window.matchMedia(MOBILE_NAV_MEDIA);
  const syncViewportMode = () => {
    setMobileNavOpen(false);
    if (mobileQuery.matches) {
      app.classList.remove('sidebar-collapsed');
      button.textContent = '×';
      button.setAttribute('aria-expanded', 'false');
      button.setAttribute('aria-label', 'Close navigation');
      return;
    }

    const collapsed = localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === '1';
    applyDashboardZoom(1);
    setSidebarCollapsed(collapsed, { persist: false });
  };

  syncViewportMode();
  button.addEventListener('click', () => {
    if (isMobileNavLayout()) {
      setMobileNavOpen(false);
      return;
    }
    setSidebarCollapsed(!app.classList.contains('sidebar-collapsed'));
  });

  mobileButton?.addEventListener('click', () => {
    setMobileNavOpen(!app.classList.contains('mobile-nav-open'));
  });
  backdrop?.addEventListener('click', () => setMobileNavOpen(false));
  window.addEventListener('pageshow', () => setMobileNavOpen(false));
  window.addEventListener('orientationchange', () => setMobileNavOpen(false));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && app.classList.contains('mobile-nav-open')) {
      setMobileNavOpen(false);
    }
  });

  if (typeof mobileQuery.addEventListener === 'function') {
    mobileQuery.addEventListener('change', syncViewportMode);
  } else if (typeof mobileQuery.addListener === 'function') {
    mobileQuery.addListener(syncViewportMode);
  }
}

function setSidebarCollapsed(collapsed, { persist = true } = {}) {
  const app = document.querySelector('.app-container');
  const button = document.getElementById('sidebarToggle');
  if (!app || !button) return;
  app.classList.toggle('sidebar-collapsed', collapsed);
  button.textContent = collapsed ? '›' : '‹';
  button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  button.setAttribute('aria-label', collapsed ? 'Show navigation' : 'Hide navigation');
  if (persist) {
    localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0');
  }
}

function setMobileNavOpen(open) {
  const app = document.querySelector('.app-container');
  const mobileButton = document.getElementById('mobileNavToggle');
  const sidebarButton = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('appSidebar');
  const backdrop = document.getElementById('mobileNavBackdrop');
  if (!app) return;

  const shouldOpen = Boolean(open) && isMobileNavLayout();
  const mobileLayout = isMobileNavLayout();
  app.classList.toggle('mobile-nav-open', shouldOpen);
  document.body.classList.toggle('mobile-nav-open', shouldOpen);
  if (mobileButton) {
    mobileButton.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
    mobileButton.setAttribute('aria-label', shouldOpen ? 'Close navigation' : 'Open navigation');
  }
  if (sidebarButton && mobileLayout) {
    sidebarButton.textContent = '×';
    sidebarButton.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
    sidebarButton.setAttribute('aria-label', 'Close navigation');
  }
  if (sidebar) {
    if (mobileLayout) {
      sidebar.setAttribute('aria-hidden', shouldOpen ? 'false' : 'true');
    } else {
      sidebar.removeAttribute('aria-hidden');
    }
    if ('inert' in sidebar) {
      sidebar.inert = mobileLayout && !shouldOpen;
    }
  }
  if (backdrop) {
    backdrop.hidden = !shouldOpen;
  }
}

function closeMobileNav() {
  if (isMobileNavLayout()) setMobileNavOpen(false);
}

function isMobileNavLayout() {
  return window.matchMedia(MOBILE_NAV_MEDIA).matches;
}

function initDashboardPinchZoom() {
  const boards = [
    document.getElementById('board'),
    document.getElementById('test-board')
  ].filter(Boolean);
  const databaseTab = document.getElementById('tab-database');
  if (boards.length) {
    applyDashboardZoom(__dashboardZoom);
    boards.forEach(board => {
      board.addEventListener('touchstart', handleDashboardPinchStart, { passive: false });
      board.addEventListener('touchmove', handleDashboardPinchMove, { passive: false });
      board.addEventListener('touchend', handleDashboardPinchEnd, { passive: false });
      board.addEventListener('touchcancel', handleDashboardPinchEnd, { passive: false });
    });
  }
  if (databaseTab) {
    databaseTab.addEventListener('touchstart', preventDatabasePinch, { passive: false });
    databaseTab.addEventListener('touchmove', preventDatabasePinch, { passive: false });
  }
}

function handleDashboardPinchStart(event) {
  if (!canUseDashboardPinchZoom() || event.touches.length !== 2) return;
  const distance = getTouchDistance(event.touches);
  if (!distance) return;
  event.preventDefault();
  __dashboardPinchState = {
    startDistance: distance,
    startZoom: __dashboardZoom
  };
}

function handleDashboardPinchMove(event) {
  if (!__dashboardPinchState || event.touches.length !== 2) return;
  event.preventDefault();
  const distance = getTouchDistance(event.touches);
  if (!distance) return;
  const nextZoom = clampDashboardZoom(__dashboardPinchState.startZoom * (distance / __dashboardPinchState.startDistance));
  applyDashboardZoom(nextZoom);
}

function handleDashboardPinchEnd(event) {
  if (event.touches.length < 2) {
    __dashboardPinchState = null;
  }
}

function preventDatabasePinch(event) {
  if (event.touches?.length > 1) {
    event.preventDefault();
  }
}

function canUseDashboardPinchZoom() {
  const dashboard = document.getElementById('tab-dashboard');
  const testDashboard = document.getElementById('tab-test-dashboard');
  return isMobileNavLayout() && (
    dashboard?.classList.contains('active') ||
    testDashboard?.classList.contains('active')
  );
}

function getTouchDistance(touches) {
  if (!touches || touches.length < 2) return 0;
  const first = touches[0];
  const second = touches[1];
  return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
}

function applyDashboardZoom(zoom) {
  __dashboardZoom = clampDashboardZoom(zoom);
  document.getElementById('board')?.style.setProperty('--dashboard-board-zoom', String(__dashboardZoom));
  document.getElementById('test-board')?.style.setProperty('--dashboard-board-zoom', String(__dashboardZoom));
}

function clampDashboardZoom(zoom) {
  const numericZoom = Number.isFinite(zoom) ? zoom : 1;
  return Math.min(DASHBOARD_ZOOM_MAX, Math.max(DASHBOARD_ZOOM_MIN, numericZoom));
}

// --------------------------- CAMERA UI ---------------------------

function addCameraUI() {
  const bar = document.getElementById('labels-toolbar');
  if (!bar) return;

  ensureCaptureModal();
  document.getElementById('connectCameraBtn')?.remove();
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
  const showInitialLoading = !boardDiv.querySelector('.group, .board-loading');
  try {
    __boardLoading = true;
    if (showInitialLoading) renderBoardLoadingState(boardDiv);
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
    renderBoard(payload, { context: BOARD_CONTEXT_MONDAY, boardDiv });
    refreshVisualItemSelect(payload);
    const connectBtn = document.getElementById('connectBtn');
    if (connectBtn) connectBtn.style.display = 'none';
    document.getElementById('authStatus')?.remove();
  } catch (err) {
    console.warn('Board load failed', err);
    boardDiv.textContent = 'Failed to load board: fetch error';
  } finally {
    __boardLoading = false;
  }
}

async function loadTestBoard(options = {}) {
  if (__testBoardLoading) return;
  const boardDiv = document.getElementById('test-board');
  if (!boardDiv) return;
  const forceRefresh = options === true || options?.forceRefresh === true;
  const boardUrl = forceRefresh ? `${ENDPOINTS.testData}?fresh=1` : ENDPOINTS.testData;
  const showInitialLoading = !boardDiv.querySelector('.group, .board-loading');
  try {
    __testBoardLoading = true;
    if (showInitialLoading) renderBoardLoadingState(boardDiv, 'Loading test dashboard...');
    const response = await fetch(boardUrl, {
      cache: 'no-store',
      credentials: 'include',
      headers: forceRefresh ? { 'Cache-Control': 'no-cache' } : {}
    });
    if (!response.ok) {
      const error = await readApiError(response);
      boardDiv.textContent = `Failed to load test dashboard: ${error}`;
      return;
    }
    const payload = await response.json();
    window.__latestTestBoardPayload = payload;
    pruneSyncedTestCheckboxOptimisticValues(payload);
    renderBoard(payload, { context: BOARD_CONTEXT_TEST, boardDiv });
  } catch (err) {
    console.warn('Test dashboard load failed', err);
    boardDiv.textContent = 'Failed to load test dashboard: fetch error';
  } finally {
    __testBoardLoading = false;
  }
}

function renderBoardLoadingState(boardDiv, message = 'Loading Monday board...') {
  boardDiv.innerHTML = `
    <div class="board-loading" role="status" aria-live="polite">
      <span class="board-loading-spinner" aria-hidden="true"></span>
      <span class="board-loading-text">${escapeHtml(message)}</span>
    </div>
  `;
}

function startBoardAutoRefresh() {
  if (__boardRefreshTimer) return;
  __boardRefreshTimer = setInterval(() => {
    if (document.hidden) return;
    const dashboard = document.getElementById('tab-dashboard');
    if (dashboard && !dashboard.classList.contains('active')) return;
    if (isStatusDropdownOpen() || __statusUpdateInFlight > 0) return;
    loadBoard({ forceRefresh: true });
  }, BOARD_AUTO_REFRESH_MS);
}

function startTestBoardAutoRefresh() {
  if (__testBoardRefreshTimer) return;
  __testBoardRefreshTimer = setInterval(() => {
    if (document.hidden) return;
    const dashboard = document.getElementById('tab-test-dashboard');
    if (dashboard && !dashboard.classList.contains('active')) return;
    if (isStatusDropdownOpen() || __statusUpdateInFlight > 0 || __testFileUploadsInFlight > 0) return;
    loadTestBoard({ forceRefresh: true });
  }, BOARD_AUTO_REFRESH_MS);
}

// --------------------------- RENDER BOARD ---------------------------

function renderBoard(payload, options = {}) {
  const context = options.context || BOARD_CONTEXT_MONDAY;
  const boardDiv = options.boardDiv || document.getElementById(context === BOARD_CONTEXT_TEST ? 'test-board' : 'board') || document.body;
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
  const groupSummaryTitleWidth = buildGroupSummaryTitleWidth(board.groups || []);
  const mobileClosedGroupWidth = buildMobileClosedGroupSummaryWidth(board.groups || []);
  boardDiv.style.setProperty('--mobile-closed-group-width', `${mobileClosedGroupWidth}px`);
  const boardSortPlan = getBoardSortPlan(boardColumns);
  const dueDateColumn = getDueDateColumn(boardColumns);
  const globalJobNameWidth = buildJobNameColumnWidth(getAllBoardItems(board.groups || []));
  const zoomLayer = document.createElement('div');
  zoomLayer.className = 'dashboard-zoom-layer';
  boardDiv.appendChild(zoomLayer);

  for (const group of (board.groups || [])) {
    const collectionName = group.title || 'Untitled Group';
    const items = (group.items_page && group.items_page.items) || [];
    const sortedItems = sortItemsForBoard(items, boardSortPlan);
    const groupColumnWidths = buildBoardColumnWidthOverrides(boardColumns, sortedItems);
    const groupGridSpec = buildDashboardGridSpec(boardColumns, {
      subitem: false,
      widthOverrides: groupColumnWidths,
      nameWidth: globalJobNameWidth
    });
    const groupKey = slugify(collectionName);
    const isCollapsed = uiState.collapsedGroups.has(groupKey) ||
      (!uiState.hasRenderedGroups && isDefaultCollapsedGroup(collectionName));

    const groupWrap = document.createElement('section');
    groupWrap.className = 'group';
    groupWrap.dataset.groupKey = groupKey;
    if (isCollapsed) groupWrap.classList.add('collapsed');
    if (shouldHidePrintEmbroideryMobileColumns(collectionName)) {
      groupWrap.classList.add('mobile-print-embroidery-hidden-columns');
    }
    if (group.color) groupWrap.style.setProperty('--group-accent', group.color);

    const sectionTitle = document.createElement('button');
    sectionTitle.className = 'group-title';
    sectionTitle.type = 'button';
    sectionTitle.innerHTML = `
      <span class="chev" aria-hidden="true"></span>
      <span class="group-name">${escapeHtml(collectionName)}</span>
    `;
    sectionTitle.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
    const toggleGroup = () => {
      const collapsed = groupWrap.classList.toggle('collapsed');
      sectionTitle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      groupSummary.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    };
    sectionTitle.addEventListener('click', toggleGroup);
    groupWrap.appendChild(sectionTitle);

    const groupSummary = buildGroupSummary(collectionName, sortedItems, groupGridSpec, groupSummaryTitleWidth);
    groupSummary.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
    groupSummary.addEventListener('click', toggleGroup);
    groupWrap.appendChild(groupSummary);

    const tableWrap = document.createElement('div');
    tableWrap.className = 'group-content';

    const grid = document.createElement('div');
    grid.className = 'board-grid';
    const mobileGridSpec = buildMobileGridSpecForGroup(groupGridSpec, collectionName);
    grid.style.setProperty('--board-cols', groupGridSpec.template);
    grid.style.setProperty('--mobile-board-cols', mobileGridSpec.template);
    grid.style.setProperty('--mobile-board-min-width', `${mobileGridSpec.minWidth}px`);
    grid.style.minWidth = `${groupGridSpec.minWidth}px`;

    const headRow = document.createElement('div');
    headRow.className = 'grid-row grid-head';
    for (const spec of groupGridSpec.columns) {
      headRow.appendChild(buildHeaderCell(spec, { sortable: true, context }));
    }
    grid.appendChild(headRow);

    for (const item of sortedItems) {
      const itemId = String(item.id);
      const subitems = Array.isArray(item.subitems) ? item.subitems : [];

      const row = document.createElement('div');
      row.dataset.itemId = itemId;
      row.className = 'grid-row job-row';
      const duePriorityClass = __priorityHighlightsEnabled ? getDuePriorityClass(item, dueDateColumn) : '';
      if (duePriorityClass) row.classList.add(duePriorityClass);
      row.style.setProperty('--board-cols', groupGridSpec.template);
      const subitemsOpen = uiState.openSubitems.has(itemId);

      for (const spec of groupGridSpec.columns) {
        row.appendChild(buildItemCell(item, spec, { subitemsOpen, context }));
      }
      grid.appendChild(row);

      if (subitems.length > 0) {
        const subitemGridSpec = buildDashboardGridSpec(subitemColumns, {
          subitem: true,
          nameWidth: buildSubitemNameColumnWidth(subitems),
          widthOverrides: buildSubitemColumnWidthOverrides(subitemColumns, subitems)
        });
        const subPanel = document.createElement('div');
        subPanel.className = `subitem-panel ${subitemsOpen ? '' : 'hidden'}`.trim();
        subPanel.dataset.parent = itemId;
        subPanel.style.setProperty('--mobile-board-min-width', `${subitemGridSpec.mobileMinWidth}px`);
        subPanel.style.minWidth = `calc(${subitemGridSpec.minWidth}px + var(--subitem-connector-width, 32px))`;

        const subGrid = document.createElement('div');
        subGrid.className = 'subitem-grid';
        subGrid.style.setProperty('--subitem-cols', subitemGridSpec.template);
        subGrid.style.width = `${subitemGridSpec.minWidth}px`;
        subGrid.style.minWidth = `${subitemGridSpec.minWidth}px`;

        const subHead = document.createElement('div');
        subHead.className = 'subitem-row sub-head';
        for (const spec of subitemGridSpec.columns) {
          subHead.appendChild(buildHeaderCell(spec, { sortable: false, context }));
        }
        subGrid.appendChild(subHead);

        for (const sub of subitems) {
          const subRow = document.createElement('div');
          subRow.className = 'subitem-row sub-row';
          subRow.dataset.parent = itemId;
          for (const spec of subitemGridSpec.columns) {
            subRow.appendChild(buildSubitemCell(sub, spec, { context }));
          }
          subGrid.appendChild(subRow);
        }

        subPanel.appendChild(subGrid);
        grid.appendChild(subPanel);
      }
    }

    tableWrap.appendChild(grid);
    groupWrap.appendChild(tableWrap);

    zoomLayer.appendChild(groupWrap);
  }
}

function collectBoardUiState(boardDiv) {
  const collapsedGroups = new Set();
  const openSubitems = new Set();
  let hasRenderedGroups = false;
  try {
    const groups = boardDiv.querySelectorAll('.group[data-group-key]');
    hasRenderedGroups = groups.length > 0;
    groups.forEach(group => {
      if (group.classList.contains('collapsed')) collapsedGroups.add(group.dataset.groupKey);
    });
    boardDiv.querySelectorAll('.job-row[data-item-id] .row-toggle.open').forEach(toggle => {
      const row = toggle.closest('.job-row[data-item-id]');
      if (row?.dataset?.itemId) openSubitems.add(row.dataset.itemId);
    });
  } catch {}
  return { collapsedGroups, openSubitems, hasRenderedGroups };
}

function isDefaultCollapsedGroup(groupName) {
  if (isMobileNavLayout()) return true;
  const normalized = String(groupName || '').trim().toUpperCase();
  return normalized === 'HOLD' ||
    normalized === 'COMPLETED' ||
    normalized === 'TO SAMPLE' ||
    normalized === 'OFFICE';
}

function toggleSubRows(parentId, open) {
  const rows = document.querySelectorAll(`.subitem-panel[data-parent="${CSS.escape(parentId)}"]`);
  rows.forEach(r => r.classList.toggle('hidden', !open));
}

function buildGroupSummary(groupName, items, gridSpec, titleWidth) {
  const summary = document.createElement('button');
  const itemCount = items.length;
  summary.type = 'button';
  summary.className = 'group-summary';
  if (isToSampleGroup(groupName) && itemCount > 0) summary.classList.add('to-sample-has-jobs');
  summary.style.setProperty('--board-cols', gridSpec.template);
  const summaryColumns = gridSpec.columns.slice(2);
  const summaryTitleWidth = titleWidth || 180;
  const summaryMinWidth = summaryTitleWidth + summaryColumns.reduce((sum, spec) => sum + spec.width, 0);
  summary.style.setProperty('--group-summary-cols', `${summaryTitleWidth}px ${summaryColumns.map(spec => `${spec.width}px`).join(' ')}`);
  summary.style.minWidth = `${summaryMinWidth}px`;
  summary.setAttribute('aria-expanded', 'true');

  const left = document.createElement('span');
  left.className = 'group-summary-left';
  left.innerHTML = `
    <span class="chev" aria-hidden="true"></span>
    <span class="group-summary-copy">
      <span class="group-summary-name">${escapeHtml(groupName)}</span>
    </span>
  `;
  summary.appendChild(left);

  for (const spec of summaryColumns) {
    summary.appendChild(buildSummaryCell(items, spec.column));
  }

  return summary;
}

function isToSampleGroup(groupName) {
  return String(groupName || '').trim().toUpperCase() === 'TO SAMPLE';
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
    !isHiddenBoardColumnTitle(column.title) &&
    !HIDDEN_BOARD_COLUMN_IDS.has(column.id) &&
    !HIDDEN_BOARD_COLUMN_TYPES.has(column.type)
  );
}

function getRenderableSubitemColumns(columns) {
  return normalizeColumns(columns).filter(column =>
    column.id !== 'name' &&
    !isHiddenBoardColumnTitle(column.title) &&
    !isHiddenSubitemColumnTitle(column.title)
  );
}

function isHiddenBoardColumnTitle(title) {
  const normalized = String(title || '').trim().toUpperCase().replace(/\s*([/-])\s*/g, '$1');
  return HIDDEN_BOARD_COLUMN_TITLES.has(normalized);
}

function isHiddenSubitemColumnTitle(title) {
  const normalized = normalizeColumnTitle(title);
  const compact = normalized.replace(/[^A-Z0-9]/g, '');
  return HIDDEN_SUBITEM_COLUMN_TITLES.has(normalized) ||
    compact === 'CHECKIN' ||
    compact === 'TEXT';
}

function normalizeColumnTitle(title) {
  return String(title || '').trim().toUpperCase().replace(/\s+/g, ' ');
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

function buildDashboardGridSpec(mondayColumns, { subitem = false, widthOverrides = new Map(), nameWidth = null } = {}) {
  const columns = [
    subitem ? null : { kind: 'print', title: 'LABEL', width: 82 },
    { kind: 'name', title: subitem ? 'Subitem' : 'JOB', width: nameWidth || (subitem ? 520 : 560) },
    ...mondayColumns.map(column => ({
      kind: 'column',
      title: column.title,
      width: widthOverrides.get(column.id) || getColumnWidth(column),
      column
    }))
  ].filter(Boolean);
  const minWidth = columns.reduce((sum, column) => sum + column.width, 0);
  const mobileColumns = columns.filter(column => column.kind !== 'print');
  const mobileMinWidth = mobileColumns.reduce((sum, column) => sum + column.width, 0);
  return {
    columns,
    minWidth,
    mobileMinWidth,
    mobileTemplate: mobileColumns.map(column => `${column.width}px`).join(' '),
    template: columns.map(column => `${column.width}px`).join(' ')
  };
}

function buildMobileGridSpecForGroup(gridSpec, groupName) {
  const mobileColumns = getMobileVisibleGridColumns(gridSpec?.columns || [], groupName);
  return {
    columns: mobileColumns,
    minWidth: mobileColumns.reduce((sum, column) => sum + column.width, 0),
    template: mobileColumns.map(column => `${column.width}px`).join(' ')
  };
}

function getMobileVisibleGridColumns(columns, groupName) {
  const hidePrintEmbroideryColumns = shouldHidePrintEmbroideryMobileColumns(groupName);
  return (Array.isArray(columns) ? columns : []).filter(column => {
    if (column.kind === 'print') return false;
    return !hidePrintEmbroideryColumns || !isPrintEmbroideryMobileHiddenColumn(column);
  });
}

function shouldHidePrintEmbroideryMobileColumns(groupName) {
  const normalized = normalizeColumnTitle(groupName);
  return normalized.includes('PRINT') || normalized.includes('EMBROIDERY');
}

function isPrintEmbroideryMobileHiddenColumn(spec) {
  if (spec?.kind !== 'column') return false;
  const normalized = normalizeColumnTitle(spec.column?.title || spec.title || '');
  const compact = normalized.replace(/[^A-Z0-9]/g, '');
  return MOBILE_PRINT_EMBROIDERY_HIDDEN_COLUMN_TITLES.has(normalized) ||
    MOBILE_PRINT_EMBROIDERY_HIDDEN_COLUMN_TITLES.has(compact);
}

function getColumnWidth(column) {
  const title = String(column.title || '').toUpperCase();
  if (column.type === 'status') {
    if (title === 'TYPE') return 88;
    if (title === 'STATUS') return 168;
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

function getActiveSortColumn(columns) {
  if (!__boardSortState?.columnId) return null;
  return (columns || []).find(column => column.id === __boardSortState.columnId) || null;
}

function getBoardSortPlan(columns) {
  const activeSortColumn = getActiveSortColumn(columns);
  if (activeSortColumn && __boardSortState?.direction) {
    return [{ column: activeSortColumn, direction: __boardSortState.direction }];
  }

  const priorityColumn = (columns || []).find(isPriorityColumn);
  const dateColumn = getDueDateColumn(columns);
  return [
    priorityColumn ? { column: priorityColumn, direction: 'desc' } : null,
    dateColumn ? { column: dateColumn, direction: 'desc' } : null
  ].filter(Boolean);
}

function isPriorityColumn(column) {
  return String(column?.title || '').trim().toUpperCase() === 'PRIORITY';
}

function isDateColumn(column) {
  const title = String(column?.title || '').trim().toUpperCase();
  return title === 'DATE' || column?.type === 'date';
}

function getDueDateColumn(columns) {
  return (columns || []).find(isDateColumn) || null;
}

function getDuePriorityClass(item, dueDateColumn) {
  if (!dueDateColumn) return '';
  const value = findColumnValue(item, dueDateColumn.id);
  const dueDate = parseDueDate(value, normalizeCellText(value?.text || ''));
  if (!dueDate) return '';

  const daysUntilDue = getLocalDayDiff(new Date(), dueDate);
  if (daysUntilDue <= 1) return 'priority-due-urgent';
  if (daysUntilDue <= 3) return 'priority-due-soon';
  return '';
}

function parseDueDate(value, text) {
  const parsed = parseJsonMaybe(value?.value);
  const candidates = [
    parsed?.date,
    parsed?.to,
    parsed?.from,
    text
  ].filter(Boolean);

  for (const candidate of candidates) {
    const date = parseLocalDate(candidate);
    if (date) return date;
  }
  return null;
}

function parseLocalDate(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;

  let match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return buildLocalDate(Number(match[1]), Number(match[2]), Number(match[3]));
  }

  match = value.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})$/);
  if (match) {
    const year = normalizeDateYear(match[3]);
    return buildLocalDate(year, Number(match[2]), Number(match[1]));
  }

  const currentYear = new Date().getFullYear();
  const candidates = /\b\d{4}\b/.test(value) ? [value] : [`${value} ${currentYear}`, value];
  for (const candidate of candidates) {
    const timestamp = Date.parse(candidate);
    if (Number.isFinite(timestamp)) return startOfLocalDay(new Date(timestamp));
  }
  return null;
}

function normalizeDateYear(rawYear) {
  const year = Number(rawYear);
  if (!Number.isFinite(year)) return new Date().getFullYear();
  return year < 100 ? 2000 + year : year;
}

function buildLocalDate(year, month, day) {
  if (![year, month, day].every(Number.isFinite)) return null;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function getLocalDayDiff(fromDate, toDate) {
  const from = startOfLocalDay(fromDate).getTime();
  const to = startOfLocalDay(toDate).getTime();
  return Math.round((to - from) / 86400000);
}

function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function sortItemsForBoard(items, sortPlan) {
  const list = Array.isArray(items) ? items : [];
  const plan = Array.isArray(sortPlan) ? sortPlan.filter(entry => entry?.column && entry?.direction) : [];
  if (!plan.length) return list;
  return list
    .map((item, index) => ({
      item,
      index,
      sortValues: plan.map(entry => ({
        direction: entry.direction,
        value: getItemSortValue(item, entry.column)
      }))
    }))
    .sort((a, b) => {
      for (let i = 0; i < plan.length; i += 1) {
        const compared = compareSortValuePair(a.sortValues[i], b.sortValues[i]);
        if (compared !== 0) return compared;
      }
      return a.index - b.index;
    })
    .map(entry => entry.item);
}

function compareSortValuePair(a, b) {
  if (!a?.value || !b?.value) return 0;
  if (a.value.empty && b.value.empty) return 0;
  if (a.value.empty) return 1;
  if (b.value.empty) return -1;
  const compared = compareSortValues(a.value, b.value);
  return a.direction === 'desc' ? -compared : compared;
}

function getItemSortValue(item, column) {
  const value = findColumnValue(item, column.id);
  const text = normalizeCellText(value?.text || '');
  if (!text && !value?.value) return { empty: true, type: 'string', value: '' };

  if (column.type === 'date' || column.type === 'timeline') {
    const timestamp = parseSortDate(value, text);
    if (Number.isFinite(timestamp)) {
      // Earlier dates are treated as higher priority so first click is most urgent first.
      return { empty: false, type: 'number', value: -timestamp };
    }
  }

  if (column.type === 'status') {
    const priorityRank = getPrioritySortRank(column, text);
    if (priorityRank != null) return { empty: false, type: 'number', value: priorityRank };
    const statusIndex = getStatusSortIndex(value);
    if (statusIndex != null) return { empty: false, type: 'number', value: statusIndex };
  }

  if (column.type === 'checkbox') {
    return { empty: false, type: 'number', value: isCheckedValue(value) ? 1 : 0 };
  }

  if (column.type === 'numbers') {
    const number = Number.parseFloat(text.replace(/[^0-9.-]/g, ''));
    if (Number.isFinite(number)) return { empty: false, type: 'number', value: number };
  }

  return { empty: !text, type: 'string', value: text.toLowerCase() };
}

function compareSortValues(a, b) {
  if (a.type === 'number' && b.type === 'number') return a.value - b.value;
  return String(a.value || '').localeCompare(String(b.value || ''), undefined, { numeric: true, sensitivity: 'base' });
}

function parseSortDate(value, text) {
  const parsed = parseJsonMaybe(value?.value);
  const candidates = [
    parsed?.date,
    parsed?.from,
    parsed?.to,
    text
  ].filter(Boolean);
  const currentYear = new Date().getFullYear();
  for (const candidate of candidates) {
    const raw = String(candidate).trim();
    if (!/\b\d{4}\b/.test(raw)) {
      const withYear = Date.parse(`${raw} ${currentYear}`);
      if (Number.isFinite(withYear)) return withYear;
    }
    const direct = Date.parse(raw);
    if (Number.isFinite(direct)) return direct;
  }
  return NaN;
}

function getPrioritySortRank(column, text) {
  const title = String(column?.title || '').toUpperCase();
  if (!title.includes('PRIORITY')) return null;
  const label = normalizeStatusLabel(text);
  if (label.includes('critical')) return 100;
  if (label.includes('urgent')) return 90;
  if (label.includes('high')) return 80;
  if (label.includes('medium')) return 50;
  if (label.includes('low')) return 20;
  return 0;
}

function getStatusSortIndex(value) {
  const parsed = parseJsonMaybe(value?.value);
  const raw = parsed?.index ?? parsed?.label?.index;
  if (raw === undefined || raw === null || raw === '') return null;
  const index = Number.parseFloat(raw);
  return Number.isFinite(index) ? index : null;
}

function buildBoardColumnWidthOverrides(columns, items) {
  const overrides = new Map();
  for (const column of columns) {
    const title = String(column.title || '').trim().toUpperCase();
    if (!isDynamicBoardTextWidthColumn(title)) continue;
    const maxTextWidth = getMaxColumnTextWidth(items, column.id);
    const titleWidth = measureBoardTextWidth(column.title || column.id || '', "700 13px Manrope, 'Segoe UI', system-ui, sans-serif");
    const widestText = Math.max(titleWidth, maxTextWidth);
    overrides.set(column.id, Math.max(72, Math.ceil(widestText + 34)));
  }
  return overrides;
}

function isDynamicBoardTextWidthColumn(title) {
  const normalized = String(title || '').trim().toUpperCase().replace(/\s+/g, ' ');
  const compact = normalized.replace(/[^A-Z0-9]/g, '');
  return normalized === 'NOTES' ||
    compact === 'DESPSG' ||
    compact === 'DESNOPSG' ||
    compact === 'DESIGNNUMBER' ||
    compact === 'DESIGNNO' ||
    compact === 'DESIGNNUM';
}

function getAllBoardItems(groups) {
  return (Array.isArray(groups) ? groups : []).flatMap(group => group?.items_page?.items || []);
}

function buildJobNameColumnWidth(items) {
  let max = measureBoardTextWidth('JOB', "700 13px Manrope, 'Segoe UI', system-ui, sans-serif");
  for (const item of (Array.isArray(items) ? items : [])) {
    const text = normalizeCellText(item?.name || '');
    if (!text) continue;
    const subitems = Array.isArray(item?.subitems) ? item.subitems : [];
    const subitemBadgeWidth = subitems.length > 0 ? measureSubitemCountBadgeWidth(subitems.length) : 0;
    max = Math.max(max, measureBoardTextWidth(text) + subitemBadgeWidth);
  }
  return Math.max(220, Math.ceil(max + 66));
}

function buildGroupSummaryTitleWidth(groups) {
  let max = 0;
  for (const group of (Array.isArray(groups) ? groups : [])) {
    const title = normalizeCellText(group?.title || 'Untitled Group').toUpperCase();
    if (!title) continue;
    max = Math.max(max, measureBoardTextWidth(title, "800 17px Manrope, 'Segoe UI', system-ui, sans-serif"));
  }
  const titleOnlyWidth = max ? Math.ceil(max * 1.2) : 120;
  return Math.max(128, titleOnlyWidth + 54);
}

function buildMobileClosedGroupSummaryWidth(groups) {
  const preProductionGroup = (Array.isArray(groups) ? groups : []).find(group => {
    const compact = normalizeColumnTitle(group?.title || '').replace(/[^A-Z0-9]/g, '');
    return compact === 'PREPRODUCTION';
  });
  const title = normalizeCellText(preProductionGroup?.title || 'PRE-PRODUCTION').toUpperCase();
  const titleWidth = measureBoardTextWidth(title, "800 17px Manrope, 'Segoe UI', system-ui, sans-serif");
  return Math.max(128, Math.ceil(titleWidth + 54));
}

function buildSubitemNameColumnWidth(subitems) {
  let max = measureBoardTextWidth('Subitem', "700 14px Manrope, 'Segoe UI', system-ui, sans-serif");
  for (const subitem of (Array.isArray(subitems) ? subitems : [])) {
    const text = normalizeCellText(subitem?.name || '');
    if (!text) continue;
    max = Math.max(max, measureBoardTextWidth(text));
  }
  return Math.max(180, Math.ceil(max + 28));
}

function buildSubitemColumnWidthOverrides(columns, subitems) {
  const overrides = new Map();
  for (const column of (Array.isArray(columns) ? columns : [])) {
    if (!isPerJobSubitemWidthColumn(column.title)) continue;
    let max = measureBoardTextWidth(column.title || '', "700 13px Manrope, 'Segoe UI', system-ui, sans-serif");
    for (const subitem of (Array.isArray(subitems) ? subitems : [])) {
      const value = findColumnValue(subitem, column.id);
      const text = normalizeCellText(value?.text || '');
      if (!text) continue;
      max = Math.max(max, measureBoardTextWidth(text));
    }
    overrides.set(column.id, Math.max(74, Math.ceil(max + 30)));
  }
  return overrides;
}

function isPerJobSubitemWidthColumn(title) {
  const normalized = normalizeColumnTitle(title);
  return normalized === 'SIZE' ||
    normalized === 'CODE' ||
    normalized === 'COLOUR' ||
    normalized === 'COLOR';
}

function measureSubitemCountBadgeWidth(count) {
  const textWidth = measureBoardTextWidth(String(count), "11px Manrope, 'Segoe UI', system-ui, sans-serif");
  return Math.max(18, Math.ceil(textWidth + 10)) + 9;
}

function getMaxColumnTextWidth(items, columnId) {
  let max = 0;
  for (const item of (Array.isArray(items) ? items : [])) {
    const value = findColumnValue(item, columnId);
    const text = normalizeCellText(value?.text || '');
    if (!text) continue;
    max = Math.max(max, measureBoardTextWidth(text));
  }
  return max;
}

let __boardTextMeasureCanvas = null;
function measureBoardTextWidth(text, font = "14px Manrope, 'Segoe UI', system-ui, sans-serif") {
  try {
    if (!__boardTextMeasureCanvas) __boardTextMeasureCanvas = document.createElement('canvas');
    const ctx = __boardTextMeasureCanvas.getContext('2d');
    if (ctx) {
      ctx.font = font;
      return ctx.measureText(String(text || '')).width;
    }
  } catch {}
  return String(text || '').length * 7.5;
}

function buildHeaderCell(spec, { sortable = false, context = BOARD_CONTEXT_MONDAY } = {}) {
  const cell = document.createElement('div');
  cell.className = `grid-cell head ${spec.kind}-head`;
  applyPrintEmbroideryMobileHiddenCellClass(cell, spec);
  const title = document.createElement('span');
  title.className = 'column-title-text';
  title.textContent = spec.title || '';
  cell.appendChild(title);

  if (sortable && spec.kind === 'column' && spec.column?.id) {
    cell.classList.add('sortable-head');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'column-sort-btn';
    if (__boardSortState?.columnId === spec.column.id) button.classList.add('active');
    button.title = getColumnSortButtonTitle(spec.column);
    button.setAttribute('aria-label', button.title);
    button.textContent = '↕';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleBoardColumnSort(spec.column, context);
    });
    cell.appendChild(button);
  }

  return cell;
}

function getColumnSortButtonTitle(column) {
  const active = __boardSortState?.columnId === column.id;
  if (!active) return `Sort ${column.title || 'column'} high to low`;
  return __boardSortState.direction === 'desc'
    ? `Sort ${column.title || 'column'} low to high`
    : `Sort ${column.title || 'column'} high to low`;
}

function toggleBoardColumnSort(column, context = BOARD_CONTEXT_MONDAY) {
  const currentDirection = __boardSortState?.columnId === column.id ? __boardSortState.direction : '';
  __boardSortState = {
    columnId: column.id,
    direction: currentDirection === 'desc' ? 'asc' : 'desc'
  };
  rerenderBoardContext(context);
}

function rerenderBoardContext(context = BOARD_CONTEXT_MONDAY) {
  if (context === BOARD_CONTEXT_TEST) {
    if (window.__latestTestBoardPayload) {
      renderBoard(window.__latestTestBoardPayload, {
        context,
        boardDiv: document.getElementById('test-board')
      });
    }
    return;
  }
  if (window.__latestBoardPayload) {
    renderBoard(window.__latestBoardPayload, {
      context: BOARD_CONTEXT_MONDAY,
      boardDiv: document.getElementById('board')
    });
  }
}

function buildItemCell(item, spec, { subitemsOpen = false, context = BOARD_CONTEXT_MONDAY } = {}) {
  let cell;
  if (spec.kind === 'print') {
    cell = buildPrintCell(item, context);
  } else if (spec.kind === 'name') {
    cell = buildNameCell(item, subitemsOpen);
  } else {
    cell = buildColumnValueCell(item, spec.column, { context });
  }
  applyPrintEmbroideryMobileHiddenCellClass(cell, spec);
  return cell;
}

function buildSubitemCell(subitem, spec, { context = BOARD_CONTEXT_MONDAY } = {}) {
  if (spec.kind === 'print') return buildBlankCell('print-cell');
  if (spec.kind === 'name') return buildSubitemNameCell(subitem);
  return buildColumnValueCell(subitem, spec.column, { subitem: true, context });
}

function buildPrintCell(item, context = BOARD_CONTEXT_MONDAY) {
  const cell = document.createElement('div');
  cell.className = 'grid-cell print-cell';
  const jobTitle = item.name || '';
  const printBtn = document.createElement('button');
  printBtn.textContent = 'Print';
  printBtn.className = 'job-action primary';
  printBtn.addEventListener('click', () => printLabel(item.id, jobTitle, context));
  cell.appendChild(printBtn);

  if (context === BOARD_CONTEXT_TEST) return cell;

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

function buildColumnValueCell(entity, column, { subitem = false, context = BOARD_CONTEXT_MONDAY } = {}) {
  const cell = document.createElement('div');
  cell.className = `grid-cell monday-value-cell ${subitem ? 'subitem-value-cell' : ''} column-${column.type}`;
  cell.dataset.columnId = column.id;
  if (entity?.id) cell.dataset.itemId = String(entity.id);
  const value = findColumnValue(entity, column.id);
  const text = normalizeCellText(value?.text || '');
  if (text) cell.title = text;

  if (column.type === 'status') {
    renderStatusValue(cell, value, column, text, { entity, subitem, context });
  } else if (column.type === 'checkbox') {
    renderCheckboxValue(cell, value, column, { entity, subitem, context });
  } else if (column.type === 'file') {
    const fileCount = renderFileValue(cell, value, text, column);
    if (context === BOARD_CONTEXT_TEST && !subitem) {
      decorateTestFileDropCell(cell, entity, column, { hasFiles: fileCount > 0 });
    }
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

function applyPrintEmbroideryMobileHiddenCellClass(cell, spec) {
  if (!cell || !isPrintEmbroideryMobileHiddenColumn(spec)) return;
  cell.classList.add('mobile-print-embroidery-hidden-cell');
}

function findColumnValue(entity, columnId) {
  return (entity.column_values || []).find(value => value.id === columnId) || null;
}

function normalizeCellText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function renderStatusValue(cell, value, column, text, { entity = null, subitem = false, context = BOARD_CONTEXT_MONDAY } = {}) {
  const editable = !subitem && entity?.id && isEditableDashboardStatusColumn(column) && getStatusOptions(column).length > 0;
  const badge = document.createElement(editable ? 'button' : 'span');
  badge.className = 'monday-status-badge';
  if (editable) {
    badge.type = 'button';
    badge.classList.add('monday-status-button');
    badge.setAttribute('aria-haspopup', 'menu');
    badge.setAttribute('aria-label', text ? `Change job status from ${text}` : 'Set job status');
    badge.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openStatusDropdown({
        anchor: badge,
        item: entity,
        column,
        currentText: text,
        context
      });
    });
  }

  if (!text) {
    badge.classList.add('empty');
    cell.appendChild(badge);
    return;
  }

  const color = resolveStatusColor(column, value, text);
  badge.style.backgroundColor = color;
  badge.style.color = '#fff';
  badge.textContent = text;
  cell.appendChild(badge);
}

function isEditableDashboardStatusColumn(column) {
  if (column?.type !== 'status') return false;
  const title = normalizeColumnTitle(column.title);
  return title === 'STATUS' || title === 'PRIORITY';
}

function getStatusOptions(column) {
  const settings = parseJsonMaybe(column?.settings_str) || {};
  const labels = settings.labels || settings.labels_positions || {};
  const options = Object.entries(labels)
    .map(([index, label]) => {
      const cleanLabel = normalizeCellText(label);
      if (!cleanLabel) return null;
      return {
        index: String(index),
        label: cleanLabel,
        color: resolveStatusOptionColor(settings, index, cleanLabel),
        position: getStatusOptionPosition(settings, index)
      };
    })
    .filter(Boolean)
    .sort(compareStatusOptions);
  if (isPriorityStatusColumn(column)) {
    return [{
      clear: true,
      index: '',
      label: '',
      displayLabel: 'No Priority',
      color: '#7f879e',
      position: -1
    }, ...options];
  }
  return options;
}

function isPriorityStatusColumn(column) {
  return normalizeColumnTitle(column?.title || '') === 'PRIORITY';
}

function resolveStatusOptionColor(settings, index, label) {
  const configuredColor = settings?.labels_colors?.[index]?.color;
  return configuredColor || fallbackStatusColor(label);
}

function getStatusOptionPosition(settings, index) {
  const positions = settings?.labels_positions_v2 || settings?.label_positions || settings?.labels_positions || {};
  const raw = positions?.[index]?.position ?? positions?.[index];
  const position = Number(raw);
  return Number.isFinite(position) ? position : null;
}

function compareStatusOptions(a, b) {
  if (a.position != null && b.position != null && a.position !== b.position) {
    return a.position - b.position;
  }
  if (a.position != null && b.position == null) return -1;
  if (a.position == null && b.position != null) return 1;
  const aIndex = Number(a.index);
  const bIndex = Number(b.index);
  if (Number.isFinite(aIndex) && Number.isFinite(bIndex) && aIndex !== bIndex) {
    return aIndex - bIndex;
  }
  return a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' });
}

function ensureStatusDropdown() {
  let dropdown = document.getElementById('monday-status-popover');
  if (dropdown) return dropdown;

  dropdown = document.createElement('div');
  dropdown.id = 'monday-status-popover';
  dropdown.className = 'monday-status-popover hidden';
  dropdown.setAttribute('role', 'menu');
  document.body.appendChild(dropdown);

  document.addEventListener('pointerdown', handleStatusDropdownDocumentPointerDown, true);
  document.addEventListener('keydown', handleStatusDropdownKeydown);
  window.addEventListener('resize', closeStatusDropdown);
  window.addEventListener('scroll', closeStatusDropdown, true);
  return dropdown;
}

function openStatusDropdown({ anchor, item, column, currentText, context = BOARD_CONTEXT_MONDAY }) {
  if (!anchor || !item?.id || !column?.id) return;
  if (__statusDropdownState?.anchor === anchor && isStatusDropdownOpen()) {
    closeStatusDropdown();
    return;
  }

  const options = getStatusOptions(column);
  if (!options.length) return;

  const dropdown = ensureStatusDropdown();
  const currentLabel = normalizeStatusLabel(currentText);
  dropdown.innerHTML = '';
  dropdown.setAttribute('aria-label', `Change ${column.title || 'status'}`);

  for (const option of options) {
    const button = document.createElement('button');
    const optionText = option.displayLabel || option.label;
    const active = option.clear ? !currentLabel : normalizeStatusLabel(option.label) === currentLabel;
    button.type = 'button';
    button.className = 'monday-status-option';
    if (active) button.classList.add('active');
    button.textContent = optionText;
    button.title = optionText;
    button.style.backgroundColor = option.color;
    button.setAttribute('role', 'menuitemradio');
    button.setAttribute('aria-checked', active ? 'true' : 'false');
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      selectStatusOption(option);
    });
    dropdown.appendChild(button);
  }

  __statusDropdownState = {
    anchor,
    itemId: String(item.id),
    itemName: normalizeCellText(item.name || ''),
    columnId: String(column.id),
    columnTitle: column.title || column.id,
    context
  };
  dropdown.classList.remove('hidden', 'above');
  dropdown.style.visibility = 'hidden';
  positionStatusDropdown(anchor, dropdown);
  dropdown.style.visibility = '';
}

function positionStatusDropdown(anchor, dropdown) {
  const rect = anchor.getBoundingClientRect();
  if (!rect.width && !rect.height) {
    closeStatusDropdown();
    return;
  }

  const margin = 8;
  const gap = 10;
  const width = dropdown.offsetWidth;
  const height = dropdown.offsetHeight;
  const preferredLeft = rect.left + (rect.width / 2) - (width / 2);
  const left = Math.max(margin, Math.min(preferredLeft, window.innerWidth - width - margin));
  let top = rect.bottom + gap;
  let above = false;

  if (top + height > window.innerHeight - margin && rect.top - height - gap >= margin) {
    top = rect.top - height - gap;
    above = true;
  }

  const arrowLeft = Math.max(14, Math.min(rect.left + (rect.width / 2) - left, width - 14));
  dropdown.style.left = `${Math.round(left)}px`;
  dropdown.style.top = `${Math.round(top)}px`;
  dropdown.style.setProperty('--status-popover-arrow-left', `${Math.round(arrowLeft)}px`);
  dropdown.classList.toggle('above', above);
}

function isStatusDropdownOpen() {
  const dropdown = document.getElementById('monday-status-popover');
  return Boolean(dropdown && !dropdown.classList.contains('hidden'));
}

function closeStatusDropdown() {
  const dropdown = document.getElementById('monday-status-popover');
  if (dropdown) dropdown.classList.add('hidden');
  __statusDropdownState = null;
}

function handleStatusDropdownDocumentPointerDown(event) {
  if (!isStatusDropdownOpen()) return;
  const dropdown = document.getElementById('monday-status-popover');
  if (dropdown?.contains(event.target)) return;
  if (__statusDropdownState?.anchor?.contains?.(event.target)) return;
  closeStatusDropdown();
}

function handleStatusDropdownKeydown(event) {
  if (!isStatusDropdownOpen()) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeStatusDropdown();
  }
}

async function selectStatusOption(option) {
  const state = __statusDropdownState;
  if (!state?.itemId || !state?.columnId || (!option?.label && !option?.clear)) return;
  const context = state.context || BOARD_CONTEXT_MONDAY;
  closeStatusDropdown();

  if (shouldConfirmTestDashboardCompletedStatus(state, option)) {
    const confirmed = await confirmTestDashboardCompletedStatus(state);
    if (!confirmed) return;
  }

  __statusUpdateInFlight += 1;

  updateCachedBoardStatusValue(state.itemId, state.columnId, option, context);
  rerenderBoardContext(context);

  try {
    const response = await fetch(getStatusColumnEndpoint(context, state.itemId), {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        columnId: state.columnId,
        label: option.clear ? '' : option.label,
        clear: option.clear === true
      })
    });
    if (!response.ok) throw new Error(await readApiError(response));
    await loadBoardForContext(context, { forceRefresh: true });
  } catch (err) {
    console.warn('Status update failed', err);
    await loadBoardForContext(context, { forceRefresh: true });
    alert(`Failed to update ${state.columnTitle || 'status'}: ${err.message || 'Unknown error'}`);
  } finally {
    __statusUpdateInFlight = Math.max(0, __statusUpdateInFlight - 1);
  }
}

function shouldConfirmTestDashboardCompletedStatus(state, option) {
  return state?.context === BOARD_CONTEXT_TEST
    && normalizeColumnTitle(state.columnTitle) === 'STATUS'
    && !option?.clear
    && normalizeColumnTitle(option?.label) === 'COMPLETED';
}

function confirmTestDashboardCompletedStatus(state) {
  if (__testCompleteConfirmResolve) closeTestDashboardCompleteConfirm(false);

  const modal = ensureTestDashboardCompleteConfirmModal();
  const message = modal.querySelector('.test-dashboard-complete-confirm-message');
  const label = state?.itemName || state?.itemId || 'this job';
  if (message) message.textContent = `Set ${label} to completed?`;

  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open', 'test-dashboard-complete-confirm-open');

  window.requestAnimationFrame(() => {
    modal.querySelector('[data-test-dashboard-complete-cancel]')?.focus();
  });

  return new Promise((resolve) => {
    __testCompleteConfirmResolve = resolve;
  });
}

function ensureTestDashboardCompleteConfirmModal() {
  let modal = document.getElementById('test-dashboard-complete-confirm-modal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'test-dashboard-complete-confirm-modal';
  modal.className = 'test-dashboard-complete-confirm-modal';
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `
    <div class="test-dashboard-complete-confirm-shell" role="dialog" aria-modal="true" aria-labelledby="test-dashboard-complete-confirm-title">
      <div class="test-dashboard-complete-confirm-title" id="test-dashboard-complete-confirm-title">Are you sure?</div>
      <div class="test-dashboard-complete-confirm-message">Set this job to completed?</div>
      <div class="test-dashboard-complete-confirm-actions">
        <button class="test-dashboard-complete-confirm-button confirm" type="button" data-test-dashboard-complete-confirm="true">Confirm</button>
        <button class="test-dashboard-complete-confirm-button cancel" type="button" data-test-dashboard-complete-cancel="true">No</button>
      </div>
    </div>
  `;
  modal.addEventListener('click', handleTestDashboardCompleteConfirmClick);
  document.addEventListener('keydown', handleTestDashboardCompleteConfirmKeydown);
  document.body.appendChild(modal);
  return modal;
}

function handleTestDashboardCompleteConfirmClick(event) {
  const modal = document.getElementById('test-dashboard-complete-confirm-modal');
  if (!modal || modal.hidden) return;

  if (event.target === modal) {
    closeTestDashboardCompleteConfirm(false);
    return;
  }

  const button = event.target.closest('button');
  if (!button || !modal.contains(button)) return;

  if (button.dataset.testDashboardCompleteConfirm) {
    closeTestDashboardCompleteConfirm(true);
  } else if (button.dataset.testDashboardCompleteCancel) {
    closeTestDashboardCompleteConfirm(false);
  }
}

function handleTestDashboardCompleteConfirmKeydown(event) {
  const modal = document.getElementById('test-dashboard-complete-confirm-modal');
  if (!modal || modal.hidden || event.key !== 'Escape') return;
  event.preventDefault();
  closeTestDashboardCompleteConfirm(false);
}

function closeTestDashboardCompleteConfirm(confirmed) {
  const modal = document.getElementById('test-dashboard-complete-confirm-modal');
  if (modal) {
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
  }
  document.body.classList.remove('modal-open', 'test-dashboard-complete-confirm-open');

  const resolve = __testCompleteConfirmResolve;
  __testCompleteConfirmResolve = null;
  if (resolve) resolve(Boolean(confirmed));
}

function getStatusColumnEndpoint(context, itemId) {
  return context === BOARD_CONTEXT_TEST
    ? ENDPOINTS.testStatusColumn(itemId)
    : ENDPOINTS.statusColumn(itemId);
}

async function updateTestDashboardCheckbox(itemId, column, checked) {
  const optimisticKey = testCheckboxOptimisticKey(itemId, column.id);
  const requestId = ++__testCheckboxOptimisticSeq;
  __statusUpdateInFlight += 1;
  __testCheckboxOptimisticValues.set(optimisticKey, { checked: Boolean(checked), requestId });
  updateCachedBoardCheckboxValue(itemId, column.id, checked);
  rerenderBoardContext(BOARD_CONTEXT_TEST);

  try {
    const response = await fetch(ENDPOINTS.testCheckboxColumn(itemId), {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        columnId: column.id,
        checked,
      }),
    });
    if (!response.ok) throw new Error(await readApiError(response));
    await loadTestBoard({ forceRefresh: true });
  } catch (err) {
    console.warn('Checkbox update failed', err);
    const optimistic = __testCheckboxOptimisticValues.get(optimisticKey);
    if (optimistic?.requestId === requestId) {
      __testCheckboxOptimisticValues.delete(optimisticKey);
    }
    await loadTestBoard({ forceRefresh: true });
    alert(`Failed to update ${column?.title || 'checkbox'}: ${err.message || 'Unknown error'}`);
  } finally {
    __statusUpdateInFlight = Math.max(0, __statusUpdateInFlight - 1);
  }
}

async function loadBoardForContext(context, options = {}) {
  if (context === BOARD_CONTEXT_TEST) return loadTestBoard(options);
  return loadBoard(options);
}

function updateCachedBoardStatusValue(itemId, columnId, option, context = BOARD_CONTEXT_MONDAY) {
  const item = findBoardPayloadItem(
    context === BOARD_CONTEXT_TEST ? window.__latestTestBoardPayload : window.__latestBoardPayload,
    itemId
  );
  if (!item) return;

  let value = findColumnValue(item, columnId);
  if (!value) {
    value = { id: columnId, type: 'status', text: '', value: '' };
    if (!Array.isArray(item.column_values)) item.column_values = [];
    item.column_values.push(value);
  }

  value.text = option.clear ? '' : option.label;
  value.type = 'status';
  value.value = option.clear
    ? JSON.stringify({})
    : JSON.stringify({ index: normalizeStatusOptionIndex(option.index) });
}

function updateCachedBoardCheckboxValue(itemId, columnId, checked) {
  const item = findBoardPayloadItem(window.__latestTestBoardPayload, itemId);
  if (!item) return;

  let value = findColumnValue(item, columnId);
  if (!value) {
    value = { id: columnId, type: 'checkbox', text: '', value: '' };
    if (!Array.isArray(item.column_values)) item.column_values = [];
    item.column_values.push(value);
  }

  value.text = checked ? 'v' : '';
  value.type = 'checkbox';
  value.value = checked ? JSON.stringify({ checked: 'true' }) : JSON.stringify({});
}

function testCheckboxOptimisticKey(itemId, columnId) {
  return `${String(itemId)}:${String(columnId)}`;
}

function getTestCheckboxOptimisticValue(itemId, columnId) {
  const optimistic = __testCheckboxOptimisticValues.get(testCheckboxOptimisticKey(itemId, columnId));
  return optimistic ? optimistic.checked === true : null;
}

function pruneSyncedTestCheckboxOptimisticValues(payload = window.__latestTestBoardPayload) {
  if (!__testCheckboxOptimisticValues.size) return;
  for (const [key, optimistic] of Array.from(__testCheckboxOptimisticValues.entries())) {
    const separatorIndex = key.indexOf(':');
    if (separatorIndex <= 0) continue;
    const itemId = key.slice(0, separatorIndex);
    const columnId = key.slice(separatorIndex + 1);
    const item = findBoardPayloadItem(payload, itemId);
    if (!item) {
      __testCheckboxOptimisticValues.delete(key);
      continue;
    }
    const value = findColumnValue(item, columnId);
    if (isCheckedValue(value) === optimistic.checked) {
      __testCheckboxOptimisticValues.delete(key);
    }
  }
}

function normalizeStatusOptionIndex(index) {
  const numeric = Number(index);
  return Number.isFinite(numeric) ? numeric : index;
}

function findBoardPayloadItem(payload, itemId) {
  const board = unwrapFirstBoard(payload);
  if (!board) return null;
  const wanted = String(itemId);
  for (const group of (board.groups || [])) {
    const items = group?.items_page?.items || [];
    const match = items.find(item => String(item?.id) === wanted);
    if (match) return match;
  }
  return null;
}

async function readApiError(response) {
  try {
    const json = await response.json();
    if (json?.error) return json.error;
    if (json?.errors) return JSON.stringify(json.errors);
  } catch {}
  try {
    const text = await response.text();
    if (text) return text;
  } catch {}
  return `Request failed (${response.status})`;
}

function renderCheckboxValue(cell, value, column, { entity = null, subitem = false, context = BOARD_CONTEXT_MONDAY } = {}) {
  const optimisticChecked = context === BOARD_CONTEXT_TEST && !subitem && entity?.id
    ? getTestCheckboxOptimisticValue(entity.id, column.id)
    : null;
  const checked = optimisticChecked === null ? isCheckedValue(value) : optimisticChecked;
  const editable = context === BOARD_CONTEXT_TEST && !subitem && entity?.id;
  const mark = document.createElement(editable ? 'button' : 'span');
  mark.className = 'monday-check-tick';
  mark.style.color = getCheckboxTickColor(column);
  mark.textContent = checked ? '✓' : '';

  if (editable) {
    mark.type = 'button';
    mark.classList.add('monday-check-button');
    mark.setAttribute('aria-label', `${checked ? 'Clear' : 'Set'} ${column.title || 'checkbox'}`);
    mark.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      updateTestDashboardCheckbox(entity.id, column, !checked);
    });
  } else if (!checked) {
    return;
  }

  cell.appendChild(mark);
}

function getCheckboxTickColor(column) {
  const title = String(column?.title || '').toUpperCase();
  if (title.includes('JAQ')) return '#fdab3d';
  if (title.includes('JOB')) return '#00c875';
  if (title.includes('CHECK')) return '#579bfc';
  return '#579bfc';
}

function renderFileValue(cell, value, text, column) {
  const files = getFileList(value).map(normalizeMondayFile).filter(Boolean);
  if (!files.length && text) {
    files.push({
      name: text || 'File',
      url: isLikelyFileUrl(text) ? text : '',
      mime: inferMimeTypeFromName(text)
    });
  }
  if (!files.length) return 0;
  cell.classList.add('monday-file-cell');
  files.forEach((file, index) => {
    if (isPreviewModalFileColumn(column)) {
      renderPreviewFileButton(cell, files, index, text, column);
    } else {
      renderFileIconLink(cell, file, text);
    }
  });
  return files.length;
}

function isPreviewModalFileColumn(column) {
  const normalized = normalizeColumnTitle(column?.title || '');
  const compact = normalized.replace(/[^A-Z0-9]/g, '');
  return compact === 'PROOF' ||
    compact === 'FILE' ||
    compact === 'FILES' ||
    compact === 'IMAGE' ||
    compact === 'IMAGES';
}

function isLikelyFileUrl(value) {
  return /^(https?:\/\/|\/)/i.test(String(value || '').trim());
}

function renderFileIconLink(cell, file, text) {
  const link = document.createElement(file.url ? 'a' : 'span');
  link.className = 'monday-file-link';
  link.title = file.name || text || 'Attached file';
  if (file.url) {
    link.href = file.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }
  link.appendChild(buildFileIcon(file));
  cell.appendChild(link);
}

function renderPreviewFileButton(cell, files, index, text, column) {
  const file = files[index];
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'monday-file-link monday-proof-trigger';
  const label = getPreviewModalLabel(column);
  button.title = file.name || text || `Open ${label.toLowerCase()}`;
  button.setAttribute('aria-label', button.title);

  button.appendChild(buildFileIcon(file));
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    openProofModal(files, index, { label });
  });
  cell.appendChild(button);
}

function decorateTestFileDropCell(cell, entity, column, { hasFiles = false } = {}) {
  if (!cell || !entity?.id || !column?.id) return;
  const uploadKey = testFileUploadKey(entity.id, column.id);
  const uploading = __testFileUploadingCells.has(uploadKey);
  cell.classList.add('test-file-drop-target');
  cell.classList.toggle('uploading', uploading);
  cell.title = cell.title || `${hasFiles ? 'Drop another' : 'Drop or click to upload'} ${column.title || 'file'}`;
  if (!hasFiles || uploading) renderTestFileUploadAffordance(cell, entity, column, { uploading });
  cell.addEventListener('dragenter', handleTestFileDragEnter);
  cell.addEventListener('dragover', handleTestFileDragOver);
  cell.addEventListener('dragleave', handleTestFileDragLeave);
  cell.addEventListener('drop', (event) => handleTestFileDrop(event, entity, column, cell));
}

function renderTestFileUploadAffordance(cell, entity, column, { uploading = false } = {}) {
  cell.classList.add('monday-file-cell');

  if (uploading) {
    const spinner = document.createElement('span');
    spinner.className = 'test-file-upload-spinner';
    spinner.setAttribute('aria-label', 'Uploading file');
    spinner.setAttribute('role', 'status');
    cell.appendChild(spinner);
    return;
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'test-file-upload-empty-button';
  button.textContent = '+';
  button.title = `Upload ${column.title || 'file'}`;
  button.setAttribute('aria-label', button.title);
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    openTestFilePicker(entity, column, cell);
  });
  cell.appendChild(button);
}

function handleTestFileDragEnter(event) {
  if (!hasDraggedFiles(event)) return;
  event.preventDefault();
  event.currentTarget?.classList.add('drag-over');
}

function handleTestFileDragOver(event) {
  if (!hasDraggedFiles(event)) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  event.currentTarget?.classList.add('drag-over');
}

function handleTestFileDragLeave(event) {
  const target = event.currentTarget;
  if (!target || target.contains(event.relatedTarget)) return;
  target.classList.remove('drag-over');
}

async function handleTestFileDrop(event, entity, column, cell) {
  if (!hasDraggedFiles(event)) return;
  event.preventDefault();
  event.stopPropagation();
  cell?.classList.remove('drag-over');
  const files = Array.from(event.dataTransfer?.files || []).filter(Boolean);
  if (!files.length) return;

  await uploadTestDashboardFiles(entity.id, column, files, cell);
}

function openTestFilePicker(entity, column, cell) {
  const input = ensureTestFileUploadInput();
  __testFileUploadTarget = { entity, column, cell };
  input.value = '';
  input.click();
}

function ensureTestFileUploadInput() {
  if (__testFileUploadInput) return __testFileUploadInput;
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.hidden = true;
  input.addEventListener('change', handleTestFileInputChange);
  document.body.appendChild(input);
  __testFileUploadInput = input;
  return input;
}

async function handleTestFileInputChange(event) {
  const target = __testFileUploadTarget;
  __testFileUploadTarget = null;
  const files = Array.from(event.target?.files || []).filter(Boolean);
  if (!target?.entity?.id || !target?.column?.id || !files.length) return;
  await uploadTestDashboardFiles(target.entity.id, target.column, files, target.cell);
}

async function uploadTestDashboardFiles(itemId, column, files, cell) {
  const uploadKey = testFileUploadKey(itemId, column.id);
  __testFileUploadsInFlight += 1;
  __testFileUploadingCells.add(uploadKey);
  setTestFileCellUploading(cell, true);
  let uploaded = false;
  try {
    for (const file of files) {
      await uploadTestDashboardFile(itemId, column, file);
    }
    uploaded = true;
  } catch (err) {
    console.warn('Test dashboard file upload failed', err);
    alert(`File upload failed: ${err.message || 'Unknown error'}`);
  } finally {
    __testFileUploadingCells.delete(uploadKey);
    __testFileUploadsInFlight = Math.max(0, __testFileUploadsInFlight - 1);
    setTestFileCellUploading(cell, false, { itemId, column });
  }
  if (uploaded) await loadTestBoard({ forceRefresh: true });
}

function setTestFileCellUploading(cell, uploading, target = {}) {
  if (!cell) return;
  cell.classList.toggle('uploading', Boolean(uploading));
  cell.querySelector('.test-file-upload-empty-button, .test-file-upload-spinner')?.remove();
  if (uploading) {
    const spinner = document.createElement('span');
    spinner.className = 'test-file-upload-spinner';
    spinner.setAttribute('aria-label', 'Uploading file');
    spinner.setAttribute('role', 'status');
    cell.appendChild(spinner);
  } else if (!cell.querySelector('.monday-file-link') && target?.column?.id) {
    renderTestFileUploadAffordance(cell, { id: target.itemId }, target.column);
  }
}

function testFileUploadKey(itemId, columnId) {
  return `${String(itemId)}:${String(columnId)}`;
}

function hasDraggedFiles(event) {
  const types = Array.from(event?.dataTransfer?.types || []);
  return types.includes('Files');
}

async function uploadTestDashboardFile(itemId, column, file) {
  const signatureResponse = await fetch(ENDPOINTS.testUploadSignature, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jobId: itemId,
      columnId: column.id,
      filename: file.name || 'file'
    })
  });
  if (!signatureResponse.ok) throw new Error(await readApiError(signatureResponse));
  const signature = await signatureResponse.json();
  if (!signature?.uploadUrl || !signature?.signature || !signature?.apiKey) {
    throw new Error('Upload signature response was incomplete');
  }

  const form = new FormData();
  form.append('file', file);
  form.append('api_key', signature.apiKey);
  form.append('timestamp', signature.timestamp);
  form.append('signature', signature.signature);
  form.append('folder', signature.folder);
  form.append('public_id', signature.publicId);

  const uploadResponse = await fetch(signature.uploadUrl, {
    method: 'POST',
    body: form
  });
  let uploadJson = null;
  try { uploadJson = await uploadResponse.json(); } catch {}
  if (!uploadResponse.ok) {
    throw new Error(formatCloudinaryUploadError(uploadJson?.error?.message, uploadResponse.status));
  }

  const saveResponse = await fetch(ENDPOINTS.testFiles(itemId), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      columnId: column.id,
      publicId: uploadJson.public_id,
      secureUrl: uploadJson.secure_url,
      resourceType: uploadJson.resource_type,
      format: uploadJson.format,
      originalFilename: file.name || uploadJson.original_filename || uploadJson.public_id,
      bytes: uploadJson.bytes || file.size || null,
      width: uploadJson.width || null,
      height: uploadJson.height || null,
      metadata: {
        upload_source: 'test_dashboard_drag_drop',
        column_title: column.title || column.id
      }
    })
  });
  if (!saveResponse.ok) throw new Error(await readApiError(saveResponse));
  return saveResponse.json();
}

function formatCloudinaryUploadError(message, status) {
  const clean = normalizeCellText(message || '');
  if (/invalid cloud_name|cloud_name mismatch/i.test(clean)) {
    return 'Cloudinary cloud name/API key mismatch. Check CLOUDINARY_CLOUD_NAME matches the API key product environment.';
  }
  return clean || `Cloudinary upload failed (${status})`;
}

function getPreviewModalLabel(column) {
  const title = normalizeCellText(column?.title || '');
  if (!title) return 'File';
  const lower = title.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function buildFileIcon(file) {
  const icon = document.createElement('span');
  const classes = ['monday-file-icon'];
  if (isPdfFile(file.name, file.mime)) classes.push('pdf');
  if (isImageFile(file)) classes.push('image');
  icon.className = classes.join(' ');
  return icon;
}

function ensureProofModal() {
  let modal = document.getElementById('proof-modal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'proof-modal';
  modal.className = 'proof-modal hidden';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'proof-modal-title');
  modal.innerHTML = `
    <div class="proof-modal-backdrop" data-proof-close></div>
    <div class="proof-modal-inner">
      <button class="proof-modal-mobile-close" id="proof-modal-mobile-close" type="button" aria-label="Close proof">×</button>
      <div class="proof-modal-head">
        <div class="proof-modal-title-block">
          <div class="proof-modal-label" id="proof-modal-label">Proof</div>
          <h3 id="proof-modal-title">Proof file</h3>
        </div>
        <button class="proof-modal-close" id="proof-modal-close" type="button" aria-label="Close proof">×</button>
      </div>
      <div id="proof-modal-body" class="proof-modal-body"></div>
      <div id="proof-mobile-page-controls" class="proof-mobile-page-controls" hidden>
        <button id="proof-page-prev-mobile" class="proof-mobile-page-button" type="button" aria-label="Previous PDF page">‹</button>
        <span id="proof-page-status-mobile" class="proof-modal-page">Page 1 / 1</span>
        <button id="proof-page-next-mobile" class="proof-mobile-page-button" type="button" aria-label="Next PDF page">›</button>
      </div>
      <div class="proof-modal-foot">
        <div class="proof-pdf-tools" id="proof-pdf-tools" hidden>
          <div class="proof-zoom-controls" aria-label="PDF zoom controls">
            <button id="proof-zoom-out" class="proof-icon-button" type="button" aria-label="Zoom out" title="Zoom out">-</button>
            <span id="proof-zoom-status" class="proof-zoom-status" aria-live="polite">100%</span>
            <button id="proof-zoom-in" class="proof-icon-button" type="button" aria-label="Zoom in" title="Zoom in">+</button>
          </div>
          <button id="proof-rotate" class="proof-icon-button proof-rotate-button" type="button" aria-label="Rotate PDF 180 degrees" title="Rotate 180 degrees">⟳</button>
        </div>
        <div class="proof-file-controls">
          <button id="proof-file-prev" class="btn outline small" type="button">Prev file</button>
          <button id="proof-file-next" class="btn outline small" type="button">Next file</button>
        </div>
        <div class="proof-modal-controls">
          <button id="proof-page-prev" class="btn outline small" type="button">Previous</button>
          <span id="proof-page-status" class="proof-modal-page">Page 1 / 1</span>
          <button id="proof-page-next" class="btn outline small" type="button">Next</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector('[data-proof-close]').addEventListener('click', closeProofModal);
  modal.querySelector('#proof-modal-close').addEventListener('click', closeProofModal);
  modal.querySelector('#proof-modal-mobile-close').addEventListener('click', closeProofModal);
  modal.querySelector('#proof-file-prev').addEventListener('click', () => changeProofFile(-1));
  modal.querySelector('#proof-file-next').addEventListener('click', () => changeProofFile(1));
  modal.querySelector('#proof-page-prev').addEventListener('click', () => changeProofPage(-1));
  modal.querySelector('#proof-page-next').addEventListener('click', () => changeProofPage(1));
  modal.querySelector('#proof-page-prev-mobile').addEventListener('click', () => changeProofPage(-1));
  modal.querySelector('#proof-page-next-mobile').addEventListener('click', () => changeProofPage(1));
  modal.querySelector('#proof-zoom-out').addEventListener('click', () => changeProofZoom(-PROOF_PDF_ZOOM_STEP));
  modal.querySelector('#proof-zoom-in').addEventListener('click', () => changeProofZoom(PROOF_PDF_ZOOM_STEP));
  modal.querySelector('#proof-rotate').addEventListener('click', toggleProofPdfRotation);
  modal.querySelector('#proof-modal-body').addEventListener('pointerdown', handleProofPdfPointerDown);
  modal.querySelector('#proof-modal-body').addEventListener('pointermove', handleProofPdfPointerMove);
  modal.querySelector('#proof-modal-body').addEventListener('pointerup', handleProofPdfPointerEnd);
  modal.querySelector('#proof-modal-body').addEventListener('pointercancel', handleProofPdfPointerEnd);
  window.addEventListener('resize', handleProofModalViewportChange);
  document.addEventListener('keydown', handleProofModalKeydown);
  return modal;
}

function openProofModal(files, startIndex = 0, options = {}) {
  const normalized = (Array.isArray(files) ? files : [])
    .map(file => normalizeMondayFile(file) || file)
    .filter(file => file && (file.url || file.assetId || file.name));
  if (!normalized.length) return;
  const safeStartIndex = Math.min(Math.max(Number.parseInt(startIndex, 10) || 0, 0), normalized.length - 1);
  const modalLabel = normalizeCellText(options.label || 'Proof') || 'Proof';

  ensureProofModal();
  __proofModalState = {
    files: normalized,
    fileIndex: safeStartIndex,
    pageNumber: 1,
    pageCount: 1,
    pdf: null,
    pdfZoom: 1,
    pdfRotation: 0,
    pdfDrag: null,
    modalLabel,
    renderToken: __proofModalState.renderToken + 1
  };
  document.getElementById('proof-modal')?.classList.remove('hidden');
  document.body.classList.add('modal-open');
  renderProofModalFile();
}

function closeProofModal() {
  const modal = document.getElementById('proof-modal');
  if (modal) modal.classList.add('hidden');
  __proofModalState.pdf = null;
  __proofModalState.pdfDrag = null;
  __proofModalState.renderToken += 1;
  resetProofPdfBodyState();
  const anotherModalOpen = document.querySelector('.modal:not(.hidden), .va-lightbox:not(.hidden)');
  if (!anotherModalOpen) document.body.classList.remove('modal-open');
}

function handleProofModalKeydown(event) {
  const modal = document.getElementById('proof-modal');
  if (!modal || modal.classList.contains('hidden')) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeProofModal();
  } else if (event.key === 'ArrowLeft') {
    changeProofPage(-1);
  } else if (event.key === 'ArrowRight') {
    changeProofPage(1);
  }
}

function getProofModalElements() {
  return {
    modal: document.getElementById('proof-modal'),
    body: document.getElementById('proof-modal-body'),
    label: document.getElementById('proof-modal-label'),
    title: document.getElementById('proof-modal-title'),
    filePrev: document.getElementById('proof-file-prev'),
    fileNext: document.getElementById('proof-file-next'),
    pdfTools: document.getElementById('proof-pdf-tools'),
    zoomOut: document.getElementById('proof-zoom-out'),
    zoomIn: document.getElementById('proof-zoom-in'),
    zoomStatus: document.getElementById('proof-zoom-status'),
    rotate: document.getElementById('proof-rotate'),
    prev: document.getElementById('proof-page-prev'),
    next: document.getElementById('proof-page-next'),
    page: document.getElementById('proof-page-status'),
    mobilePager: document.getElementById('proof-mobile-page-controls'),
    mobilePrev: document.getElementById('proof-page-prev-mobile'),
    mobileNext: document.getElementById('proof-page-next-mobile'),
    mobilePage: document.getElementById('proof-page-status-mobile')
  };
}

function setProofLoading(message) {
  const { body } = getProofModalElements();
  if (!body) return;
  resetProofPdfBodyState(body);
  body.innerHTML = '';
  const loader = document.createElement('div');
  loader.className = 'proof-modal-loading';
  loader.textContent = message;
  body.appendChild(loader);
}

async function renderProofModalFile() {
  const state = __proofModalState;
  const token = ++state.renderToken;
  const file = state.files[state.fileIndex];
  const { label, title } = getProofModalElements();
  const modalLabel = state.modalLabel || 'File';
  if (label) label.textContent = modalLabel;
  if (title) title.textContent = file?.name || `${modalLabel} file`;
  state.pageNumber = 1;
  state.pageCount = 1;
  state.pdf = null;
  state.pdfZoom = 1;
  state.pdfRotation = 0;
  state.pdfDrag = null;
  resetProofPdfBodyState();
  updateProofPageControls();

  if (!file) {
    setProofLoading('No proof file available.');
    return;
  }

  if (isPdfFile(file.name, file.mime)) {
    await renderProofPdf(file, token);
  } else if (isImageFile(file)) {
    renderProofImage(file, token);
  } else {
    renderProofNativeViewer(file, token);
  }
}

async function renderProofPdf(file, token) {
  setProofLoading('Loading PDF...');
  try {
    const pdfjs = await ensurePdfJs();
    const src = buildAssetSrc(file);
    const resp = await fetch(src, { credentials: 'include', cache: 'no-store' });
    if (!resp.ok) throw new Error(`PDF fetch failed (${resp.status})`);
    const buffer = await resp.arrayBuffer();
    if (token !== __proofModalState.renderToken) return;

    const loadingTask = pdfjs.getDocument({
      data: buffer,
      useWorkerFetch: true,
      isEvalSupported: true,
      disableAutoFetch: false
    });
    const pdf = await loadingTask.promise;
    if (token !== __proofModalState.renderToken) return;
    __proofModalState.pdf = pdf;
    __proofModalState.pageCount = Math.max(1, pdf.numPages || 1);
    __proofModalState.pageNumber = 1;
    await renderProofPdfPage();
  } catch (err) {
    console.error('Proof PDF render failed', err);
    renderProofNativeViewer(file, token, 'PDF preview unavailable. Opening with the browser viewer.');
  }
}

async function renderProofPdfPage() {
  const state = __proofModalState;
  const token = state.renderToken;
  const { body } = getProofModalElements();
  if (!body || !state.pdf) return;
  const scrollPosition = getProofPdfScrollPosition(body);
  setProofLoading('Rendering page...');
  updateProofPageControls(true);

  const page = await state.pdf.getPage(state.pageNumber);
  if (token !== state.renderToken) return;
  const baseViewport = page.getViewport({ scale: 1 });
  const availableWidth = Math.max(320, (body.clientWidth || 920) - 32);
  const scale = Math.min(1.8, Math.max(0.8, availableWidth / baseViewport.width));
  const zoom = normalizeProofPdfZoom(state.pdfZoom);
  const viewport = page.getViewport({ scale: scale * zoom, rotation: state.pdfRotation || 0 });
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.className = 'proof-pdf-canvas';
  await page.render({ canvasContext: ctx, viewport }).promise;
  if (token !== state.renderToken) return;

  const stage = document.createElement('div');
  stage.className = 'proof-pdf-stage';
  stage.appendChild(canvas);
  body.innerHTML = '';
  body.classList.add('proof-pdf-body');
  body.appendChild(stage);
  restoreProofPdfScrollPosition(body, scrollPosition);
  updateProofPdfPanState(body);
  updateProofPageControls(false);
}

function renderProofImage(file, token) {
  const { body } = getProofModalElements();
  if (!body || token !== __proofModalState.renderToken) return;
  resetProofPdfBodyState(body);
  const img = document.createElement('img');
  img.className = 'proof-modal-image';
  img.src = buildAssetSrc(file);
  img.alt = file.name || 'Proof image';
  body.innerHTML = '';
  body.appendChild(img);
  updateProofPageControls();
}

function renderProofNativeViewer(file, token, note = '') {
  const { body } = getProofModalElements();
  if (!body || token !== __proofModalState.renderToken) return;
  resetProofPdfBodyState(body);
  const src = buildAssetSrc(file, { stripPdfUi: isPdfFile(file.name, file.mime) });
  body.innerHTML = '';
  if (note) {
    const noteEl = document.createElement('div');
    noteEl.className = 'proof-modal-note';
    noteEl.textContent = note;
    body.appendChild(noteEl);
  }
  if (src) {
    const viewer = document.createElement('iframe');
    viewer.className = 'proof-modal-viewer';
    viewer.src = src;
    viewer.title = file.name || 'Proof file';
    body.appendChild(viewer);
  } else {
    const empty = document.createElement('div');
    empty.className = 'proof-modal-loading';
    empty.textContent = 'No preview URL is available for this proof.';
    body.appendChild(empty);
  }
  updateProofPageControls();
}

function normalizeProofPdfZoom(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.min(PROOF_PDF_ZOOM_MAX, Math.max(PROOF_PDF_ZOOM_MIN, Number(numeric.toFixed(2))));
}

function formatProofPdfZoom(value) {
  return `${Math.round(normalizeProofPdfZoom(value) * 100)}%`;
}

function isProofDesktopView() {
  return !window.matchMedia || !window.matchMedia(MOBILE_NAV_MEDIA).matches;
}

function resetProofPdfBodyState(body = document.getElementById('proof-modal-body')) {
  __proofModalState.pdfDrag = null;
  if (!body) return;
  body.classList.remove('proof-pdf-body', 'proof-pdf-pan-enabled', 'proof-pdf-dragging');
}

function updateProofPdfPanState(body = document.getElementById('proof-modal-body')) {
  if (!body) return;
  const enabled = !!__proofModalState.pdf && normalizeProofPdfZoom(__proofModalState.pdfZoom) > 1 && isProofDesktopView();
  body.classList.toggle('proof-pdf-pan-enabled', enabled);
  if (!enabled) {
    __proofModalState.pdfDrag = null;
    body.classList.remove('proof-pdf-dragging');
  }
}

function getProofPdfScrollPosition(body) {
  if (!body || !body.classList.contains('proof-pdf-body')) return { x: 0.5, y: 0 };
  const maxLeft = Math.max(0, body.scrollWidth - body.clientWidth);
  const maxTop = Math.max(0, body.scrollHeight - body.clientHeight);
  return {
    x: maxLeft > 0 ? body.scrollLeft / maxLeft : 0.5,
    y: maxTop > 0 ? body.scrollTop / maxTop : 0
  };
}

function restoreProofPdfScrollPosition(body, position = { x: 0.5, y: 0 }) {
  if (!body) return;
  const maxLeft = Math.max(0, body.scrollWidth - body.clientWidth);
  const maxTop = Math.max(0, body.scrollHeight - body.clientHeight);
  const x = Number.isFinite(position.x) ? Math.min(1, Math.max(0, position.x)) : 0.5;
  const y = Number.isFinite(position.y) ? Math.min(1, Math.max(0, position.y)) : 0;
  body.scrollLeft = maxLeft * x;
  body.scrollTop = maxTop * y;
}

function changeProofZoom(delta) {
  const state = __proofModalState;
  if (!state.pdf || !isProofDesktopView()) return;
  const nextZoom = normalizeProofPdfZoom(normalizeProofPdfZoom(state.pdfZoom) + delta);
  if (nextZoom === normalizeProofPdfZoom(state.pdfZoom)) return;
  state.pdfZoom = nextZoom;
  state.pdfDrag = null;
  state.renderToken += 1;
  renderProofPdfPage().catch((err) => {
    console.error('Proof PDF zoom render failed', err);
    updateProofPageControls(false);
  });
}

function toggleProofPdfRotation() {
  const state = __proofModalState;
  if (!state.pdf || !isProofDesktopView()) return;
  state.pdfRotation = state.pdfRotation === 180 ? 0 : 180;
  state.pdfDrag = null;
  state.renderToken += 1;
  renderProofPdfPage().catch((err) => {
    console.error('Proof PDF rotate render failed', err);
    updateProofPageControls(false);
  });
}

function handleProofModalViewportChange() {
  const { modal, body } = getProofModalElements();
  if (!modal || modal.classList.contains('hidden')) return;
  const state = __proofModalState;
  if (!state.pdf) {
    updateProofPageControls();
    return;
  }
  if (!isProofDesktopView() && (normalizeProofPdfZoom(state.pdfZoom) !== 1 || state.pdfRotation !== 0)) {
    state.pdfZoom = 1;
    state.pdfRotation = 0;
    state.pdfDrag = null;
    state.renderToken += 1;
    renderProofPdfPage().catch((err) => {
      console.error('Proof PDF viewport reset render failed', err);
      updateProofPageControls(false);
    });
    return;
  }
  updateProofPdfPanState(body);
  updateProofPageControls();
}

function handleProofPdfPointerDown(event) {
  const state = __proofModalState;
  if (!state.pdf || normalizeProofPdfZoom(state.pdfZoom) <= 1 || !isProofDesktopView()) return;
  if (event.button !== undefined && event.button !== 0) return;
  const { body } = getProofModalElements();
  if (!body || !body.classList.contains('proof-pdf-body')) return;
  if (event.target?.closest?.('button, a, input, select, textarea')) return;
  if (body.scrollWidth <= body.clientWidth && body.scrollHeight <= body.clientHeight) return;

  state.pdfDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    scrollLeft: body.scrollLeft,
    scrollTop: body.scrollTop
  };
  body.classList.add('proof-pdf-dragging');
  body.setPointerCapture?.(event.pointerId);
  event.preventDefault();
}

function handleProofPdfPointerMove(event) {
  const state = __proofModalState;
  const drag = state.pdfDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  const { body } = getProofModalElements();
  if (!body) return;
  body.scrollLeft = drag.scrollLeft - (event.clientX - drag.startX);
  body.scrollTop = drag.scrollTop - (event.clientY - drag.startY);
  event.preventDefault();
}

function handleProofPdfPointerEnd(event) {
  const state = __proofModalState;
  const drag = state.pdfDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  const { body } = getProofModalElements();
  if (body) {
    body.classList.remove('proof-pdf-dragging');
    body.releasePointerCapture?.(event.pointerId);
  }
  state.pdfDrag = null;
}

function changeProofPage(delta) {
  const state = __proofModalState;
  if (!state.pdf) return;
  const nextPage = state.pageNumber + delta;
  if (nextPage < 1 || nextPage > state.pageCount) return;
  state.pageNumber = nextPage;
  state.renderToken += 1;
  renderProofPdfPage().catch((err) => {
    console.error('Proof PDF page render failed', err);
    updateProofPageControls(false);
  });
}

function changeProofFile(delta) {
  const state = __proofModalState;
  if (!Array.isArray(state.files) || state.files.length <= 1) return;
  const nextIndex = state.fileIndex + delta;
  if (nextIndex < 0 || nextIndex >= state.files.length) return;
  state.fileIndex = nextIndex;
  state.pageNumber = 1;
  state.pageCount = 1;
  state.pdf = null;
  state.renderToken += 1;
  renderProofModalFile();
}

function updateProofPageControls(loading = false) {
  const {
    modal,
    filePrev,
    fileNext,
    pdfTools,
    zoomOut,
    zoomIn,
    zoomStatus,
    rotate,
    prev,
    next,
    page,
    mobilePager,
    mobilePrev,
    mobileNext,
    mobilePage
  } = getProofModalElements();
  const state = __proofModalState;
  const currentFile = Array.isArray(state.files) ? state.files[state.fileIndex] : null;
  const currentFileIsPdf = isPdfFile(currentFile?.name, currentFile?.mime);
  const isPdf = !!state.pdf;
  const zoom = normalizeProofPdfZoom(state.pdfZoom);
  const showDesktopPdfTools = currentFileIsPdf && isPdf && isProofDesktopView();
  const pageText = `Page ${state.pageNumber} / ${state.pageCount}`;
  if (page) page.textContent = pageText;
  if (mobilePage) mobilePage.textContent = pageText;
  if (mobilePager) mobilePager.hidden = !currentFileIsPdf;
  const hasMultipleFiles = Array.isArray(state.files) && state.files.length > 1;
  if (modal) modal.classList.toggle('proof-modal-has-file-controls', hasMultipleFiles);
  if (modal) modal.classList.toggle('proof-modal-has-pdf-tools', showDesktopPdfTools);
  if (pdfTools) pdfTools.hidden = !showDesktopPdfTools;
  if (zoomStatus) zoomStatus.textContent = formatProofPdfZoom(zoom);
  if (zoomOut) zoomOut.disabled = loading || !showDesktopPdfTools || zoom <= PROOF_PDF_ZOOM_MIN;
  if (zoomIn) zoomIn.disabled = loading || !showDesktopPdfTools || zoom >= PROOF_PDF_ZOOM_MAX;
  if (rotate) {
    rotate.disabled = loading || !showDesktopPdfTools;
    rotate.setAttribute('aria-pressed', state.pdfRotation === 180 ? 'true' : 'false');
  }
  if (filePrev) {
    filePrev.hidden = !hasMultipleFiles;
    filePrev.disabled = loading || !hasMultipleFiles || state.fileIndex <= 0;
  }
  if (fileNext) {
    fileNext.hidden = !hasMultipleFiles;
    fileNext.disabled = loading || !hasMultipleFiles || state.fileIndex >= state.files.length - 1;
  }
  if (prev) prev.disabled = loading || !isPdf || state.pageNumber <= 1;
  if (next) next.disabled = loading || !isPdf || state.pageNumber >= state.pageCount;
  if (mobilePrev) mobilePrev.disabled = loading || !isPdf || state.pageNumber <= 1;
  if (mobileNext) mobileNext.disabled = loading || !isPdf || state.pageNumber >= state.pageCount;
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
  if (STATUS_LABEL_FALLBACK_COLORS[label]) return STATUS_LABEL_FALLBACK_COLORS[label];
  if (label.startsWith('supplied clothing')) return STATUS_LABEL_FALLBACK_COLORS['supplied clothing'];
  if (label.includes('critical')) return '#bb3354';
  if (label.includes('urgent')) return '#e2445c';
  if (label.includes('high')) return '#ff642e';
  if (label.includes('medium')) return '#fdab3d';
  if (label.includes('low')) return '#579bfc';
  if (label.includes('waiting')) return '#8088a8';
  if (label.includes('sample')) return '#9cd326';
  if (label.includes('stock') || label.includes('complete')) return '#00c875';
  if (label.includes('emb')) return '#ff7575';
  if (label.includes('print')) return '#fdab3d';
  return '#579bfc';
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

async function printLabel(itemId, rawTitle, context = BOARD_CONTEXT_MONDAY) {
  const { orderNumber, customerName, jobTitle } = parseTitle(rawTitle);
  let scanUrl = '';
  try {
    const url = context === BOARD_CONTEXT_TEST
      ? ENDPOINTS.testScanUrl(itemId)
      : `/api/scan-url?itemId=${encodeURIComponent(itemId)}`;
    const r = await fetch(url, { credentials: 'include' });
    if (r.ok) {
      const j = await r.json();
      scanUrl = j.url || '';
    }
  } catch {}
  const qrImg = scanUrl ? `<img class="qr" src="/api/qr?data=${encodeURIComponent(scanUrl)}" alt="QR">` : '';
  const blocks = [
    { head: 'JOB NUMBER', value: orderNumber, ratio: 0.62, maxSize: 96 },
    { head: 'CUSTOMER', value: customerName, ratio: 0.46, maxSize: 54 },
    { head: 'JOB TITLE', value: jobTitle, ratio: 0.50, maxSize: 54 }
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
              <div class="value" data-ratio="${b.ratio}" data-max-size="${b.maxSize}">${escapeHtml(b.value)}</div>
            </div>
          `).join('')}
        </div>
        <div class="qr-container">${qrImg}</div>
      </div>
      <script>
        (function(){
          function fit(el, ratio, min, max){
            var parent = el.parentElement;
            var w = parent.clientWidth || parent.getBoundingClientRect().width;
            var cap = max > 0 ? max : Number.POSITIVE_INFINITY;
            var size = Math.min(cap, Math.max(min, Math.floor(w * ratio)));
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
            var max = parseFloat(v.getAttribute('data-max-size')) || 0;
            fit(v, ratio, 10, max);
          });
          var closeTimer = null;
          var printed = false;
          function closeAfterPrint(){
            if (closeTimer) return;
            closeTimer = setTimeout(function(){
              try { window.close(); } catch (e) {}
            }, 250);
          }
          function startPrint(){
            if (printed) return;
            printed = true;
            window.addEventListener('afterprint', closeAfterPrint, { once: true });
            window.addEventListener('focus', function(){
              if (printed) closeAfterPrint();
            }, { once: true });
            window.print();
          }
          const qr = document.querySelector('.qr');
          if (qr) {
            qr.addEventListener('load', () => { setTimeout(startPrint, 150); });
          } else {
            setTimeout(startPrint, 150);
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

  addPriorityHighlightUI();
  document.getElementById('scanPill')?.remove();
}

function ensureTestDashboardUI() {
  const bar = document.getElementById('test-labels-toolbar');
  if (!bar) return;

  if (!document.getElementById('testConnectScannerBtn')) {
    const scannerBtn = document.createElement('button');
    scannerBtn.id = 'testConnectScannerBtn';
    scannerBtn.type = 'button';
    scannerBtn.textContent = 'Connect Scanner';
    scannerBtn.className = 'btn success';
    scannerBtn.addEventListener('click', connectSerialScanner);
    bar.appendChild(scannerBtn);
  }

  let priorityBtn = document.getElementById('testPriorityHighlightBtn');
  if (!priorityBtn) {
    priorityBtn = document.createElement('button');
    priorityBtn.id = 'testPriorityHighlightBtn';
    priorityBtn.type = 'button';
    priorityBtn.className = 'btn priority-highlight-toggle';
    priorityBtn.addEventListener('click', () => {
      setPriorityHighlightsEnabled(!__priorityHighlightsEnabled);
    });
    bar.appendChild(priorityBtn);
  }
  updatePriorityHighlightButton(priorityBtn);
}

function addPriorityHighlightUI() {
  const bar = document.getElementById('labels-toolbar');
  if (!bar) return;

  let btn = document.getElementById('priorityHighlightBtn');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'priorityHighlightBtn';
    btn.type = 'button';
    btn.className = 'btn priority-highlight-toggle';
    btn.addEventListener('click', () => {
      setPriorityHighlightsEnabled(!__priorityHighlightsEnabled);
    });
  }

  const scannerBtn = document.getElementById('connectScannerBtn');
  if (scannerBtn?.parentElement === bar && btn.previousElementSibling !== scannerBtn) {
    scannerBtn.insertAdjacentElement('afterend', btn);
  } else if (btn.parentElement !== bar) {
    bar.appendChild(btn);
  }
  updatePriorityHighlightButton(btn);
}

function setPriorityHighlightsEnabled(enabled) {
  __priorityHighlightsEnabled = Boolean(enabled);
  localStorage.setItem(PRIORITY_HIGHLIGHT_STORAGE_KEY, __priorityHighlightsEnabled ? '1' : '0');
  updatePriorityHighlightButton();
  updatePriorityHighlightButton(document.getElementById('testPriorityHighlightBtn'));
  rerenderBoardContext(BOARD_CONTEXT_MONDAY);
  rerenderBoardContext(BOARD_CONTEXT_TEST);
}

function updatePriorityHighlightButton(btn = document.getElementById('priorityHighlightBtn')) {
  if (!btn) return;
  btn.classList.toggle('active', __priorityHighlightsEnabled);
  btn.setAttribute('aria-pressed', __priorityHighlightsEnabled ? 'true' : 'false');
  btn.textContent = __priorityHighlightsEnabled ? 'Priority highlights On' : 'Priority highlights Off';
  btn.title = __priorityHighlightsEnabled ? 'Turn priority row highlights off' : 'Turn priority row highlights on';
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
  const testScan = normalizeTestScanUrl(text);
  if (testScan) {
    await postScannerResult('/api/test-dashboard/scanner', text, 'test-dashboard');
    return;
  }

  let scanUrl = normalizeScanUrl(text);
  if (!scanUrl && /^\d+$/.test(text)) {
    try {
      const activeTestDashboard = document.getElementById('tab-test-dashboard')?.classList.contains('active');
      const url = activeTestDashboard ? ENDPOINTS.testScanUrl(text) : `/api/scan-url?itemId=${encodeURIComponent(text)}`;
      const r = await fetch(url, { cache: 'no-store', credentials: 'include' });
      if (r.ok) {
        const j = await r.json();
        if (j && j.url) scanUrl = j.url;
      }
    } catch {}
  }
  if (!scanUrl) { updateScanPill('unrecognized code'); return; }

  if (normalizeTestScanUrl(scanUrl)) {
    await postScannerResult('/api/test-dashboard/scanner', scanUrl, 'test-dashboard');
    return;
  }

  await postScannerResult('/api/scanner', scanUrl || text, 'monday');
}

async function postScannerResult(endpoint, scanText, context) {
  try {
    const r2 = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ scan: scanText })
    });
    updateScanPill(r2.ok ? 'status: ok' : 'status: error');
    if (r2.ok) {
      if (context === 'test-dashboard') loadTestBoard({ forceRefresh: true });
      else loadBoard({ forceRefresh: true });
    }
  } catch (e) {
    console.warn(`POST ${endpoint} failed:`, e);
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

function normalizeTestScanUrl(input) {
  const value = String(input || '').trim();
  if (!value) return null;
  if (/^https?:\/\/.+\/test-scan\?.*(j|i)=\d+.*ts=\d+.*sig=[a-f0-9]+/i.test(value)) return value;
  if (/\/test-scan\?/i.test(value) && /(^|[?&])(j|i)=\d+/.test(value) && /ts=\d+/.test(value) && /sig=/.test(value)) {
    return `${PROD_ORIGIN}${value.startsWith('/') ? value : `/test-scan?${value.replace(/^[^?]*\?/, '')}`}`;
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
  if (activeTab === 'test-dashboard') {
    loadTestBoard({ forceRefresh: true });
  }
  closeMobileNav();
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
