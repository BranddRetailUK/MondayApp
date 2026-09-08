// --- Tuesday Dashboard Frontend (DB-backed grid + collapsible groups/subitems) ---

const PROD_ORIGIN = window.location.origin;
const ENDPOINTS = {
  testData: '/api/test-dashboard/board',
  testStatusColumn: (itemId) => `/api/test-dashboard/items/${encodeURIComponent(itemId)}/status-column`,
  testCheckboxColumn: (itemId) => `/api/test-dashboard/items/${encodeURIComponent(itemId)}/checkbox-column`,
  testTextColumn: (itemId) => `/api/test-dashboard/items/${encodeURIComponent(itemId)}/text-column`,
  testDesignColumn: (itemId) => `/api/test-dashboard/items/${encodeURIComponent(itemId)}/design-column`,
  testItemName: (itemId) => `/api/test-dashboard/items/${encodeURIComponent(itemId)}/name`,
  testItemGroup: (itemId) => `/api/test-dashboard/items/${encodeURIComponent(itemId)}/group`,
  testDateColumn: (itemId) => `/api/test-dashboard/items/${encodeURIComponent(itemId)}/date-column`,
  testPrivateJobs: '/api/test-dashboard/private-jobs',
  testPrivateJob: (itemId) => `/api/test-dashboard/private-jobs/${encodeURIComponent(itemId)}`,
  testProofFiles: (itemId) => `/api/test-dashboard/items/${encodeURIComponent(itemId)}/proof-files`,
  testFile: (itemId, fileId) => `/api/test-dashboard/items/${encodeURIComponent(itemId)}/files/${encodeURIComponent(fileId)}`,
  testScanUrl: (itemId) => `/api/test-dashboard/scan-url?jobId=${encodeURIComponent(itemId)}`,
  testLabelPrinted: (itemId) => `/api/test-dashboard/items/${encodeURIComponent(itemId)}/label-printed`,
  testUploadSignature: '/api/test-dashboard/uploads/signature',
  testFiles: (itemId) => `/api/test-dashboard/items/${encodeURIComponent(itemId)}/files`
};
const DASHBOARD_TAB_STORAGE_KEY = 'ultimateHub.activeDashboardTab';
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'ultimateHub.sidebarCollapsed';
const MOBILE_NAV_MEDIA = '(max-width: 720px), (max-width: 960px) and (max-height: 520px)';
const PROOF_PDF_ZOOM_MIN = 0.5;
const PROOF_PDF_ZOOM_MAX = 3;
const PROOF_PDF_ZOOM_STEP = 0.25;
const DASHBOARD_TAB_NAMES = ['database', 'test-dashboard', 'dtf-uploader'];
const BOARD_AUTO_REFRESH_MS = 1000;
const BOARD_CONTEXT_TEST = 'test-dashboard';
const PRIVATE_DASHBOARD_TOTAL_COLUMN = Object.freeze({ id: 'private_total', title: 'TOTAL', type: 'text' });
const ULTIMATE_PACKING_USER_NAME = 'ultimate packing';
const TEST_DASHBOARD_CLIENT_COLUMN_IDS = Object.freeze({
  JOB: 'checkbox1__1',
  PRIORITY: 'priority_mkn8p46c',
  DATE: 'date_mksx422k',
  TRANS: 'checkbox_mkm9ah5x',
  JAQ: 'checkbox_mkm99bjn',
  DESIGN: 'text_mkmesygk',
  PROOF: 'file_mky43tg9',
  STATUS: 'label__1',
  TYPE: 'project_status'
});
const TEST_DASHBOARD_APPROVAL_REQUIREMENTS_MESSAGE = 'Please add design number and/or Visual Proof.';
const TEST_DASHBOARD_SAMPLE_REQUIRED_MESSAGE = 'Set this job to SAMPLED before approving it or marking it READY TO PRINT.';
const TEST_DASHBOARD_JOB_APPROVAL_REQUIRED_MESSAGE = 'Tick JOB ✔ before setting READY TO PRINT.';
const TEST_DASHBOARD_SPLIT_TICKS_REQUIRED_MESSAGE = 'Tick both TRANS and JAQ before continuing.';
const TEST_DASHBOARD_VISUAL_UPLOAD_ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';
const TEST_DASHBOARD_VISUAL_UPLOAD_ERROR = 'The VISUAL column only accepts PDF, JPEG, and PNG files.';
const DASHBOARD_COMPLETION_BLOCK_EMAILS = new Set(['melvyn@ultimatepromotions.co.uk']);
const DASHBOARD_COMPLETION_BLOCK_MESSAGE = 'LEAVE IT ALONE MELVYN';
const DASHBOARD_ZOOM_MIN = 0.45;
const DASHBOARD_ZOOM_MAX = 1;
const HIDDEN_BOARD_COLUMN_TYPES = new Set(['subtasks']);
const HIDDEN_BOARD_COLUMN_IDS = new Set(['subitems__1', 'file_mky4xna4', 'checkbox__1', 'project_owner']);
const HIDDEN_BOARD_COLUMN_TITLES = new Set([
  'START/END',
  'START-END',
  'IMAGE',
  'IMAGES',
  'CHECKED IN',
  'CHECKEDIN',
  'JOB OWNER',
  'JOBOWNER',
]);
const HIDDEN_SUBITEM_COLUMN_TITLES = new Set(['CHECK IN', 'TEXT']);
const MOBILE_PRINT_EMBROIDERY_HIDDEN_COLUMN_TITLES = new Set([
  'TRANS',
  'TRAN',
  'JAQ',
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
  'awaiting approval': '#8088a8',
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
  'stock ordered': '#2b7de9',
  'critical': '#bb3354',
  'urgent': '#e2445c',
  'high': '#ff642e',
  'medium': '#fdab3d',
  'low': '#579bfc'
};
let __testBoardRefreshTimer = null;
let __testBoardLoading = false;
let __testFileUploadInput = null;
let __testFileUploadTarget = null;
let __testFileUploadsInFlight = 0;
const __testFileUploadingCells = new Set();
const __testFileCellScrollPositions = new Map();
const __testCheckboxOptimisticValues = new Map();
let __testCheckboxOptimisticSeq = 0;
let __testDesignEditInFlight = 0;
let __testTextEditInFlight = 0;
let __boardSortState = null;
let __dashboardZoom = 1;
let __dashboardPinchState = null;
let __statusDropdownState = null;
let __statusUpdateInFlight = 0;
let __testCompleteConfirmResolve = null;
let __labelQuantityResolve = null;
let __labelQuantityReturnFocus = null;
let __testRowMenuState = null;
let __testVisualRemovalState = null;
let __testDatePopoverState = null;
let __testMobileJobOverviewState = null;
let __testPrivateNameEditInFlight = 0;
let __pendingPrivateJobFocusId = '';
const __testGroupKeysToOpen = new Set();
const __dashboardJobTitleScrollAnimations = new WeakMap();
let __proofModalState = {
  files: [],
  fileIndex: 0,
  pageNumber: 1,
  pageCount: 1,
  pdf: null,
  previewKind: '',
  pdfZoom: 1,
  pdfRotation: 0,
  pdfDrag: null,
  pdfPinch: null,
  pdfTouchPan: null,
  modalLabel: 'Proof',
  downloading: false,
  downloadPhase: '',
  renderToken: 0
};

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
  addSerialScannerUI();
  attachSerialEvents();
  initDashboardPinchZoom();
  Promise.resolve(window.ultimateHubUserPromise).then((user) => {
    refreshPackingControlVisibility();
    if (user && user.access_scope !== 'dtf_only') {
      loadTestBoard({ forceRefresh: true });
      startTestBoardAutoRefresh();
    }
  });
});
window.loadTestBoard = loadTestBoard;

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

    closeTestDashboardMobileJobOverview();
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
  const boards = [document.getElementById('test-board')].filter(Boolean);
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
  const databaseVisualViewer = event.target?.closest?.('.db-proof-viewer');
  if (event.touches?.length > 1 && !databaseVisualViewer) {
    event.preventDefault();
  }
}

function canUseDashboardPinchZoom() {
  const testDashboard = document.getElementById('tab-test-dashboard');
  return isMobileNavLayout() && testDashboard?.classList.contains('active');
}

function getTouchDistance(touches) {
  if (!touches || touches.length < 2) return 0;
  const first = touches[0];
  const second = touches[1];
  return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
}

function applyDashboardZoom(zoom) {
  __dashboardZoom = clampDashboardZoom(zoom);
  document.getElementById('test-board')?.style.setProperty('--dashboard-board-zoom', String(__dashboardZoom));
}

function clampDashboardZoom(zoom) {
  const numericZoom = Number.isFinite(zoom) ? zoom : 1;
  return Math.min(DASHBOARD_ZOOM_MAX, Math.max(DASHBOARD_ZOOM_MIN, numericZoom));
}

async function loadTestBoard(options = {}) {
  if (__testBoardLoading) return;
  const boardDiv = document.getElementById('test-board');
  if (!boardDiv) return;
  const forceRefresh = options === true || options?.forceRefresh === true;
  const allowDuringDesignEdit = options?.allowDuringDesignEdit === true;
  const boardUrl = forceRefresh ? `${ENDPOINTS.testData}?fresh=1` : ENDPOINTS.testData;
  const showInitialLoading = !boardDiv.querySelector('.group, .board-loading');
  try {
    __testBoardLoading = true;
    if (showInitialLoading) renderBoardLoadingState(boardDiv, 'Loading Tuesday Dashboard...');
    const response = await fetch(boardUrl, {
      cache: 'no-store',
      credentials: 'include',
      headers: forceRefresh ? { 'Cache-Control': 'no-cache' } : {}
    });
    if (!response.ok) {
      const error = await readApiError(response);
      boardDiv.textContent = `Failed to load Tuesday Dashboard: ${error}`;
      return;
    }
    const payload = await response.json();
    window.__latestTestBoardPayload = payload;
    pruneSyncedTestCheckboxOptimisticValues(payload);
    if (!allowDuringDesignEdit && isTestDashboardTextEditActive()) return;
    renderBoard(payload, { context: BOARD_CONTEXT_TEST, boardDiv });
  } catch (err) {
    console.warn('Tuesday Dashboard load failed', err);
    boardDiv.textContent = 'Failed to load Tuesday Dashboard: fetch error';
  } finally {
    __testBoardLoading = false;
  }
}

function renderBoardLoadingState(boardDiv, message = 'Loading Tuesday Dashboard...') {
  boardDiv.innerHTML = `
    <div class="board-loading" role="status" aria-live="polite">
      <span class="board-loading-spinner" aria-hidden="true"></span>
      <span class="board-loading-text">${escapeHtml(message)}</span>
    </div>
  `;
}

function startTestBoardAutoRefresh() {
  if (__testBoardRefreshTimer) return;
  __testBoardRefreshTimer = setInterval(() => {
    if (document.hidden) return;
    const dashboard = document.getElementById('tab-test-dashboard');
    if (dashboard && !dashboard.classList.contains('active')) return;
    if (isStatusDropdownOpen() || isTestRowMenuOpen() || isTestVisualRemovalModalOpen() || isTestDatePopoverOpen() || isTestDashboardMobileJobOverviewOpen() || __statusUpdateInFlight > 0 || __testFileUploadsInFlight > 0 || isTestDashboardTextEditActive()) return;
    loadTestBoard({ forceRefresh: true });
  }, BOARD_AUTO_REFRESH_MS);
}

// --------------------------- RENDER BOARD ---------------------------

function renderBoard(payload, options = {}) {
  const context = BOARD_CONTEXT_TEST;
  const boardDiv = options.boardDiv || document.getElementById('test-board') || document.body;
  const uiState = collectBoardUiState(boardDiv);
  boardDiv.innerHTML = '';
  const board = unwrapFirstBoard(payload);
  if (!board) {
    if (payload && payload.errors && payload.errors.length) {
      boardDiv.textContent = `Dashboard error: ${payload.errors.map(e => e.message || e).join('; ')}`;
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
  const allBoardItems = getAllBoardItems(board.groups || []);
  const globalJobNameWidth = buildJobNameColumnWidth(allBoardItems);
  const globalMobileJobTitleWidth = buildMobileJobTitleColumnWidth(allBoardItems);
  const parentTotalColumn = buildParentTotalColumnSpec(allBoardItems, subitemColumns);
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
      nameWidth: globalJobNameWidth,
      mobileNameWidth: globalMobileJobTitleWidth,
      parentTotalColumn
    });
    const groupKey = slugify(collectionName);
    const forceOpenGroup = context === BOARD_CONTEXT_TEST && __testGroupKeysToOpen.has(groupKey);
    if (forceOpenGroup) __testGroupKeysToOpen.delete(groupKey);
    const isCollapsed = !forceOpenGroup && (
      uiState.collapsedGroups.has(groupKey) ||
      (!uiState.hasRenderedGroups && isDefaultCollapsedGroup(collectionName, context))
    );

    const groupWrap = document.createElement('section');
    groupWrap.className = 'group';
    groupWrap.dataset.groupKey = groupKey;
    if (isCollapsed) groupWrap.classList.add('collapsed');
    if (shouldHidePrintEmbroideryMobileColumns(collectionName)) {
      groupWrap.classList.add('mobile-print-embroidery-hidden-columns');
    }
    if (group.color) groupWrap.style.setProperty('--group-accent', group.color);

    const isTestOfficeGroup = context === BOARD_CONTEXT_TEST && normalizeColumnTitle(collectionName) === 'OFFICE';
    const sectionTitleRow = document.createElement('div');
    sectionTitleRow.className = 'group-title-row';
    if (isTestOfficeGroup) {
      sectionTitleRow.appendChild(buildTestDashboardAddJobButton(group));
    }

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
    sectionTitleRow.appendChild(sectionTitle);
    groupWrap.appendChild(sectionTitleRow);

    const groupSummary = buildGroupSummary(collectionName, sortedItems, groupGridSpec, groupSummaryTitleWidth, {
      simple: context === BOARD_CONTEXT_TEST
    });
    groupSummary.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
    groupSummary.addEventListener('click', toggleGroup);
    const groupSummaryRow = document.createElement('div');
    groupSummaryRow.className = 'group-summary-row';
    groupSummaryRow.appendChild(groupSummary);
    groupWrap.appendChild(groupSummaryRow);

    const tableWrap = document.createElement('div');
    tableWrap.className = 'group-content';

    const grid = document.createElement('div');
    grid.className = 'board-grid';
    const mobileGridSpec = buildMobileGridSpecForGroup(groupGridSpec, collectionName);
    grid.style.setProperty('--board-cols', groupGridSpec.template);
    grid.style.setProperty('--mobile-board-cols', mobileGridSpec.template);
    grid.style.setProperty('--mobile-board-min-width', `${mobileGridSpec.minWidth}px`);
    grid.style.width = `${groupGridSpec.minWidth}px`;
    grid.style.minWidth = `${groupGridSpec.minWidth}px`;

    const headRow = document.createElement('div');
    headRow.className = 'grid-row grid-head';
    for (const spec of groupGridSpec.columns) {
      headRow.appendChild(buildHeaderCell(spec, { sortable: true, context }));
    }
    grid.appendChild(headRow);

    for (const item of sortedItems) {
      const itemId = String(item.id);
      const sourceSubitems = Array.isArray(item.subitems) ? item.subitems : [];
      const subitems = context === BOARD_CONTEXT_TEST
        ? buildDashboardSubitemsWithTotal(sourceSubitems, subitemColumns, itemId)
        : sourceSubitems;
      const rowItem = subitems === sourceSubitems ? item : { ...item, subitems };

      const row = document.createElement('div');
      row.dataset.itemId = itemId;
      row.className = 'grid-row job-row';
      if (context === BOARD_CONTEXT_TEST && item?.dashboard_split_job) {
        row.classList.add('dashboard-split-job-row');
      }
      if (context === BOARD_CONTEXT_TEST && item?.dashboard_split_completed) {
        row.classList.add('dashboard-split-branch-completed');
      }
      row.style.setProperty('--board-cols', groupGridSpec.template);
      const subitemsOpen = uiState.openSubitems.has(itemId);

      row.appendChild(buildOutsideJobActions(item));
      for (const spec of groupGridSpec.columns) {
        row.appendChild(buildItemCell(rowItem, spec, { subitemsOpen, context }));
      }
      grid.appendChild(row);

      if (subitems.length > 0) {
        const subitemGridSpec = buildDashboardGridSpec(subitemColumns, {
          subitem: true,
          brandWidth: buildSubitemBrandColumnWidth(subitems),
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
          if (isDashboardTotalSubitem(sub)) subRow.classList.add('subitem-total-row');
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

  syncTestDashboardMobileJobOverview(payload);
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

function isDefaultCollapsedGroup(groupName, context = BOARD_CONTEXT_TEST) {
  if (context === BOARD_CONTEXT_TEST) return true;
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

function buildGroupSummary(groupName, items, gridSpec, titleWidth, options = {}) {
  const summary = document.createElement('button');
  const itemCount = items.length;
  const simpleSummary = options.simple === true;
  summary.type = 'button';
  summary.className = 'group-summary';
  if (simpleSummary) summary.classList.add('simple-closed-summary');
  if (isToSampleGroup(groupName) && itemCount > 0) summary.classList.add('to-sample-has-jobs');
  summary.style.setProperty('--board-cols', gridSpec.template);
  const nameColumnIndex = gridSpec.columns.findIndex((spec) => spec.kind === 'name');
  const summaryColumns = gridSpec.columns.slice(nameColumnIndex + 1);
  const summaryTitleWidth = titleWidth || 180;
  const summaryMinWidth = summaryTitleWidth + summaryColumns.reduce((sum, spec) => sum + spec.width, 0);
  summary.style.setProperty(
    '--group-summary-cols',
    simpleSummary
      ? `${summaryTitleWidth}px minmax(0, 1fr)`
      : `${summaryTitleWidth}px ${summaryColumns.map(spec => `${spec.width}px`).join(' ')}`
  );
  summary.style.minWidth = simpleSummary ? '0' : `${summaryMinWidth}px`;
  summary.setAttribute('aria-expanded', 'true');

  const left = document.createElement('span');
  left.className = 'group-summary-left';
  left.innerHTML = `
    <span class="chev" aria-hidden="true"></span>
    <span class="group-summary-copy">
      <span class="group-summary-name">${escapeHtml(groupName)}</span>
      ${simpleSummary ? `<span class="group-summary-job-count">${escapeHtml(formatGroupJobCount(itemCount))}</span>` : ''}
    </span>
  `;
  summary.appendChild(left);

  if (simpleSummary) {
    const fill = document.createElement('span');
    fill.className = 'group-summary-empty-fill';
    summary.appendChild(fill);
  } else {
    for (const spec of summaryColumns) {
      summary.appendChild(buildSummaryCell(items, spec.column));
    }
  }

  return summary;
}

function formatGroupJobCount(count) {
  const total = Number.isFinite(Number(count)) ? Number(count) : 0;
  return `${total} ${total === 1 ? 'Job' : 'Jobs'}`;
}

function buildTestDashboardAddJobButton(group) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'test-dashboard-add-job-button';
  button.textContent = '+';
  button.title = 'Add private job';
  button.setAttribute('aria-label', 'Add private job');
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    createTestDashboardPrivateJob(group);
  });
  return button;
}

async function createTestDashboardPrivateJob(group) {
  const groupId = group?.id || '';
  __statusUpdateInFlight += 1;
  try {
    const response = await fetch(ENDPOINTS.testPrivateJobs, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId })
    });
    if (!response.ok) throw new Error(await readApiError(response));
    const json = await response.json();
    const itemId = json?.item?.id || '';
    if (itemId) __pendingPrivateJobFocusId = String(itemId);
    __testGroupKeysToOpen.add(slugify(group?.title || 'OFFICE'));
    await loadTestBoard({ forceRefresh: true, allowDuringDesignEdit: true });
  } catch (err) {
    console.warn('Private job create failed', err);
    alert(`Failed to create private job: ${err.message || 'Unknown error'}`);
  } finally {
    __statusUpdateInFlight = Math.max(0, __statusUpdateInFlight - 1);
  }
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

function buildDashboardGridSpec(dashboardColumns, {
  subitem = false,
  widthOverrides = new Map(),
  brandWidth = 140,
  nameWidth = null,
  mobileNameWidth = null,
  parentTotalColumn = null
} = {}) {
  const resolvedNameWidth = nameWidth || (subitem ? 520 : 560);
  const subitemCodeColumn = subitem
    ? dashboardColumns.find(column => normalizeColumnTitle(column.title) === 'CODE')
    : null;
  const trailingDashboardColumns = subitemCodeColumn
    ? dashboardColumns.filter(column => column.id !== subitemCodeColumn.id)
    : dashboardColumns;
  const columns = [
    !subitem && isUltimatePackingUser()
      ? { kind: 'print', title: 'LABEL', width: 82 }
      : null,
    subitem ? null : { kind: 'jobNumber', title: '', width: 64, mobileWidth: 72 },
    subitemCodeColumn
      ? {
          kind: 'column',
          title: subitemCodeColumn.title,
          width: widthOverrides.get(subitemCodeColumn.id) || getColumnWidth(subitemCodeColumn),
          column: subitemCodeColumn
        }
      : null,
    subitem ? { kind: 'brand', title: 'BRAND', width: brandWidth } : null,
    {
      kind: 'name',
      title: subitem ? 'Subitem' : 'JOB TITLE',
      width: resolvedNameWidth,
      mobileWidth: mobileNameWidth || resolvedNameWidth
    },
    !subitem && parentTotalColumn ? {
      kind: 'jobTotal',
      title: 'TOTAL',
      width: parentTotalColumn.width,
      qtyColumn: parentTotalColumn.qtyColumn
    } : null,
    ...trailingDashboardColumns.map(column => ({
      kind: 'column',
      title: normalizeColumnTitle(column.title).replace(/[^A-Z0-9]/g, '') === 'PROOF'
        ? 'VISUAL'
        : column.title,
      width: widthOverrides.get(column.id) || getColumnWidth(column),
      column
    }))
  ].filter(Boolean);
  const desktopColumns = columns;
  const minWidth = desktopColumns.reduce((sum, column) => sum + column.width, 0);
  const mobileColumns = columns.filter(column => column.kind !== 'print');
  const mobileMinWidth = mobileColumns.reduce((sum, column) => sum + getMobileGridColumnWidth(column), 0);
  return {
    columns,
    minWidth,
    mobileMinWidth,
    mobileTemplate: mobileColumns.map(column => `${getMobileGridColumnWidth(column)}px`).join(' '),
    template: desktopColumns.map(column => `${column.width}px`).join(' ')
  };
}

function buildMobileGridSpecForGroup(gridSpec, groupName) {
  const mobileColumns = getMobileVisibleGridColumns(gridSpec?.columns || [], groupName);
  return {
    columns: mobileColumns,
    minWidth: mobileColumns.reduce((sum, column) => sum + getMobileGridColumnWidth(column), 0),
    template: mobileColumns.map(column => `${getMobileGridColumnWidth(column)}px`).join(' ')
  };
}

function getMobileGridColumnWidth(column) {
  const width = Number(column?.mobileWidth ?? column?.width);
  return Number.isFinite(width) && width >= 0 ? width : 0;
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
  if (title === 'REF') return 220;
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

function localDateIso(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
    const isDesignColumn = isDesignBoardTextWidthColumn(title);
    const valueFont = isDesignColumn
      ? "700 14px Manrope, 'Segoe UI', system-ui, sans-serif"
      : "14px Manrope, 'Segoe UI', system-ui, sans-serif";
    const maxTextWidth = getMaxColumnTextWidth(items, column.id, valueFont);
    const titleWidth = measureBoardTextWidth(column.title || column.id || '', "700 13px Manrope, 'Segoe UI', system-ui, sans-serif");
    const widestText = Math.max(titleWidth, maxTextWidth);
    overrides.set(column.id, Math.max(72, Math.ceil(widestText + (isDesignColumn ? 58 : 34))));
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

function isDesignBoardTextWidthColumn(title) {
  const compact = String(title || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return compact === 'DESPSG' ||
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
    const text = getDashboardItemJobTitle(item);
    if (!text) continue;
    max = Math.max(max, measureBoardTextWidth(text));
  }
  return Math.max(220, Math.ceil(max + 66));
}

function buildMobileJobTitleColumnWidth(items) {
  let max = measureBoardTextWidth('JOB TITLE', "700 13px Manrope, 'Segoe UI', system-ui, sans-serif");
  for (const item of (Array.isArray(items) ? items : [])) {
    const text = getDashboardItemJobTitle(item);
    if (!text) continue;
    max = Math.max(max, measureBoardTextWidth(text));
  }
  return Math.min(320, Math.max(190, Math.ceil(max + 38)));
}

function getDashboardItemJobTitle(item) {
  const databaseTitle = normalizeCellText(item?.database_job?.job_title || '');
  const rawTitle = databaseTitle || (item?.dashboard_private_job
    ? normalizeCellText(item?.name || '')
    : normalizeCellText(parseTitle(item?.name || '').jobTitle || item?.name || ''));
  return hideDashboardCustomerNameFromJobTitle(rawTitle, getDashboardItemRawCustomerName(item));
}

function getDashboardItemRawCustomerName(item) {
  const databaseCustomer = normalizeCellText(item?.database_job?.customer_name || '');
  if (databaseCustomer) return databaseCustomer;
  if (item?.dashboard_private_job) return '';
  return normalizeCellText(parseTitle(item?.name || '').customerName || '');
}

function getDashboardItemCustomerName(item) {
  return hideDashboardCustomerCompanyWords(getDashboardItemRawCustomerName(item));
}

function hideDashboardCustomerCompanyWords(customerName) {
  const normalizedCustomer = normalizeCellText(customerName);
  if (!normalizedCustomer) return '';

  const companyWordPattern = /(^|[^\p{L}\p{N}'’])(?:LIMITED|LTD)(?=$|[^\p{L}\p{N}'’])/giu;
  const displayCustomer = normalizedCustomer
    .replace(companyWordPattern, (_match, leadingBoundary) => leadingBoundary)
    .replace(/\(\s*\)|\[\s*\]|\{\s*\}/g, ' ');

  return normalizeCellText(displayCustomer)
    .replace(/^(?:[-–—,.:;|/]\s*)+/, '')
    .replace(/(?:\s*[-–—,.:;|/])+$/, '')
    .trim();
}

function hideDashboardCustomerNameFromJobTitle(jobTitle, customerName) {
  const normalizedTitle = normalizeCellText(jobTitle);
  const normalizedCustomer = normalizeCellText(customerName);
  if (!normalizedTitle || !normalizedCustomer) return normalizedTitle;

  const customerWords = normalizedCustomer.split(' ');
  const customerCandidates = [normalizedCustomer];
  for (let wordCount = customerWords.length - 1; wordCount >= 2; wordCount -= 1) {
    customerCandidates.push(customerWords.slice(0, wordCount).join(' '));
  }

  let displayTitle = normalizedTitle;
  for (const candidate of customerCandidates) {
    const escapedCandidate = candidate
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\s+/g, '\\s+');
    const exactCandidatePattern = new RegExp(
      `(^|[^\\p{L}\\p{N}'’])${escapedCandidate}(?=$|[^\\p{L}\\p{N}'’])`,
      'giu'
    );
    const candidateRemoved = normalizedTitle.replace(
      exactCandidatePattern,
      (_match, leadingBoundary) => leadingBoundary
    );
    if (candidateRemoved === normalizedTitle) continue;
    displayTitle = candidateRemoved;
    break;
  }

  displayTitle = displayTitle
    .replace(/\(\s*\)|\[\s*\]|\{\s*\}/g, ' ')
    .replace(/(?:\s*[-–—|/]\s*){2,}/g, ' - ')
    .replace(/([,;:])(?:\s*[,;:])+/g, '$1');

  return normalizeCellText(displayTitle)
    .replace(/^(?:[-–—,:;|/]\s*)+/, '')
    .replace(/(?:\s*[-–—,:;|/])+$/, '')
    .trim();
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

function buildSubitemBrandColumnWidth(subitems) {
  let max = measureBoardTextWidth('BRAND', "700 13px Manrope, 'Segoe UI', system-ui, sans-serif");
  for (const subitem of (Array.isArray(subitems) ? subitems : [])) {
    const text = normalizeCellText(subitem?.brand || '');
    if (!text) continue;
    max = Math.max(max, measureBoardTextWidth(text));
  }
  return Math.max(112, Math.min(220, Math.ceil(max + 30)));
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
    const maximum = normalizeColumnTitle(column.title) === 'REF' ? 320 : Number.POSITIVE_INFINITY;
    overrides.set(column.id, Math.min(maximum, Math.max(74, Math.ceil(max + 30))));
  }
  return overrides;
}

function buildDashboardSubitemsWithTotal(subitems, subitemColumns, parentId = '') {
  const sourceSubitems = Array.isArray(subitems) ? subitems : [];
  if (!sourceSubitems.length) return sourceSubitems;

  const qtyColumn = findSubitemQuantityColumn(subitemColumns);
  if (!qtyColumn?.id) return sourceSubitems;

  const lineSubitems = sourceSubitems.filter(subitem => !isDashboardTotalSubitem(subitem));
  if (!lineSubitems.length) return sourceSubitems;

  const total = lineSubitems.reduce((sum, subitem) => {
    const value = findColumnValue(subitem, qtyColumn.id);
    return sum + parseDashboardQuantity(value?.text);
  }, 0);

  const totalSubitem = {
    id: `dashboard-total-${parentId || 'item'}`,
    name: 'TOTAL',
    __dashboardTotal: true,
    column_values: [{
      id: qtyColumn.id,
      type: qtyColumn.type || 'text',
      text: formatDashboardQuantity(total),
      value: JSON.stringify({ text: formatDashboardQuantity(total) })
    }]
  };

  return [...lineSubitems, totalSubitem];
}

function buildParentTotalColumnSpec(items, subitemColumns) {
  const qtyColumn = findSubitemQuantityColumn(subitemColumns);
  const titleWidth = measureBoardTextWidth('TOTAL', "700 13px Manrope, 'Segoe UI', system-ui, sans-serif");
  let maxValueWidth = 0;
  for (const item of (Array.isArray(items) ? items : [])) {
    const text = getDashboardParentTotalText(item, qtyColumn);
    if (!text) continue;
    maxValueWidth = Math.max(maxValueWidth, measureBoardTextWidth(text, "800 15.4px Manrope, 'Segoe UI', system-ui, sans-serif"));
  }
  return {
    qtyColumn,
    width: Math.max(58, Math.ceil(Math.max(titleWidth, maxValueWidth) + 22))
  };
}

function getDashboardParentTotalText(item, qtyColumn) {
  if (isTestDashboardPrivateItem(item)) {
    return normalizeCellText(findColumnValue(item, PRIVATE_DASHBOARD_TOTAL_COLUMN.id)?.text || '');
  }
  if (!qtyColumn?.id) return '';
  const subitems = Array.isArray(item?.subitems) ? item.subitems : [];
  const lineSubitems = subitems.filter(subitem => !isDashboardTotalSubitem(subitem));
  if (!lineSubitems.length) return '';
  const total = lineSubitems.reduce((sum, subitem) => {
    const value = findColumnValue(subitem, qtyColumn.id);
    return sum + parseDashboardQuantity(value?.text);
  }, 0);
  return formatDashboardQuantity(total);
}

function findSubitemQuantityColumn(columns) {
  return (Array.isArray(columns) ? columns : []).find(column => {
    const title = normalizeColumnTitle(column?.title || '').replace(/[^A-Z0-9]/g, '');
    return title === 'QTY' || title === 'QUANTITY';
  }) || null;
}

function isDashboardTotalSubitem(subitem) {
  if (subitem?.__dashboardTotal) return true;
  return normalizeCellText(subitem?.name || '').toUpperCase() === 'TOTAL';
}

function parseDashboardQuantity(value) {
  const text = normalizeCellText(value || '').replace(/,/g, '');
  if (!text) return 0;
  const numeric = Number.parseFloat(text);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatDashboardQuantity(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '0';
  if (Number.isInteger(numeric)) return String(numeric);
  return numeric.toFixed(2).replace(/\.?0+$/, '');
}

function isPerJobSubitemWidthColumn(title) {
  const normalized = normalizeColumnTitle(title);
  return normalized === 'SIZE' ||
    normalized === 'CODE' ||
    normalized === 'COLOUR' ||
    normalized === 'COLOR' ||
    normalized === 'REF';
}

function getMaxColumnTextWidth(items, columnId, font = "14px Manrope, 'Segoe UI', system-ui, sans-serif") {
  let max = 0;
  for (const item of (Array.isArray(items) ? items : [])) {
    const value = findColumnValue(item, columnId);
    const text = normalizeCellText(value?.text || '');
    if (!text) continue;
    max = Math.max(max, measureBoardTextWidth(text, font));
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

function buildHeaderCell(spec, { sortable = false, context = BOARD_CONTEXT_TEST } = {}) {
  const cell = document.createElement('div');
  cell.className = `grid-cell head ${spec.kind}-head`;
  if (spec.kind === 'jobNumber') cell.classList.add('job-number-head');
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

function toggleBoardColumnSort(column, context = BOARD_CONTEXT_TEST) {
  const currentDirection = __boardSortState?.columnId === column.id ? __boardSortState.direction : '';
  __boardSortState = {
    columnId: column.id,
    direction: currentDirection === 'desc' ? 'asc' : 'desc'
  };
  rerenderBoardContext(context);
}

function rerenderBoardContext(context = BOARD_CONTEXT_TEST) {
  if (window.__latestTestBoardPayload) {
    renderBoard(window.__latestTestBoardPayload, {
      context,
      boardDiv: document.getElementById('test-board')
    });
  }
}

function buildItemCell(item, spec, { subitemsOpen = false, context = BOARD_CONTEXT_TEST } = {}) {
  let cell;
  if (spec.kind === 'print') {
    cell = buildPrintLabelCell(item);
  } else if (spec.kind === 'jobNumber') {
    cell = buildJobNumberCell(item);
  } else if (spec.kind === 'name') {
    cell = buildNameCell(item, subitemsOpen, { context });
  } else if (spec.kind === 'jobTotal') {
    cell = buildParentTotalCell(item, spec);
  } else {
    cell = buildColumnValueCell(item, spec.column, { context });
  }
  applyPrintEmbroideryMobileHiddenCellClass(cell, spec);
  return cell;
}

function buildSubitemCell(subitem, spec, { context = BOARD_CONTEXT_TEST } = {}) {
  if (spec.kind === 'brand') return buildSubitemBrandCell(subitem);
  if (spec.kind === 'name') return buildSubitemNameCell(subitem);
  return buildColumnValueCell(subitem, spec.column, { subitem: true, context });
}

function buildParentTotalCell(item, spec) {
  const cell = document.createElement('div');
  cell.className = 'grid-cell dashboard-value-cell job-total-cell';
  const text = getDashboardParentTotalText(item, spec?.qtyColumn);
  if (isTestDashboardPrivateItem(item)) {
    renderTestTextInputValue(cell, text, item, PRIVATE_DASHBOARD_TOTAL_COLUMN);
  } else if (text) {
    cell.title = text;
    renderPlainTextValue(cell, text);
  }
  return cell;
}

function buildOutsideJobActions(item) {
  const actions = document.createElement('div');
  actions.className = 'job-row-actions-outside';

  actions.appendChild(buildTestRowMenuButton(item));

  return actions;
}

function buildPrintLabelCell(item) {
  const cell = document.createElement('div');
  cell.className = 'grid-cell job-print-cell';
  const printBtn = document.createElement('button');
  printBtn.type = 'button';
  printBtn.textContent = 'Print';
  printBtn.className = 'job-action primary job-print-button';
  printBtn.addEventListener('click', () => printLabel(item, printBtn));
  cell.appendChild(printBtn);
  return cell;
}

function buildJobNumberCell(item) {
  const cell = document.createElement('div');
  cell.className = 'grid-cell job-number-cell';
  const parsed = parseTitle(item?.name || '');
  const jobNumber = normalizeCellText(item?.database_job?.order_no || parsed.orderNumber || '');
  if (!jobNumber || item?.dashboard_private_job) {
    const empty = document.createElement('span');
    empty.className = 'job-number-empty';
    empty.textContent = '—';
    cell.appendChild(empty);
    return cell;
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'test-dashboard-job-number-link job-number-link';
  button.textContent = jobNumber;
  button.setAttribute('aria-label', `Open DATABASE order ${jobNumber}`);
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    openTestDashboardDatabaseOrder(item);
  });
  cell.appendChild(button);
  return cell;
}

function buildNameCell(item, initiallyOpen = false, { context = BOARD_CONTEXT_TEST } = {}) {
  const itemId = String(item.id);
  const subitems = Array.isArray(item.subitems) ? item.subitems : [];
  const cell = document.createElement('div');
  cell.className = 'grid-cell job-cell title-cell';
  if (context === BOARD_CONTEXT_TEST && isMobileNavLayout()) {
    cell.classList.add('test-mobile-job-overview-trigger');
    cell.tabIndex = 0;
    cell.setAttribute('role', 'button');
    cell.setAttribute('aria-haspopup', 'dialog');
    cell.setAttribute('aria-label', `Open job overview for ${normalizeCellText(item.name || itemId)}`);
    cell.addEventListener('click', () => {
      openTestDashboardMobileJobOverview(item, cell);
    });
    cell.addEventListener('keydown', (event) => {
      if (event.target !== cell || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      openTestDashboardMobileJobOverview(item, cell);
    });
  }
  const titleWrap = document.createElement('div');
  titleWrap.className = 'title-wrap job-title-wrap';

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

  const titleCopy = document.createElement('span');
  titleCopy.className = 'job-title-copy';
  const customerName = context === BOARD_CONTEXT_TEST
    ? getDashboardItemCustomerName(item)
    : normalizeCellText(parseTitle(item?.name || '').customerName || '');
  if (customerName) {
    titleWrap.classList.add('has-customer-eyebrow');
    const customerEyebrow = document.createElement('span');
    customerEyebrow.className = 'job-customer-eyebrow';
    customerEyebrow.textContent = customerName;
    customerEyebrow.title = customerName;
    titleCopy.appendChild(customerEyebrow);
  }

  const titleSpan = document.createElement('span');
  titleSpan.className = 'job-title';
  if (context === BOARD_CONTEXT_TEST && item?.dashboard_private_job) {
    renderTestPrivateJobNameInput(titleSpan, item);
  } else if (context === BOARD_CONTEXT_TEST) {
    titleSpan.textContent = getDashboardItemJobTitle(item);
  } else {
    titleSpan.textContent = item.name || '';
  }
  if (!(context === BOARD_CONTEXT_TEST && item?.dashboard_private_job)) {
    enableDashboardJobTitleHoverScroll(titleSpan);
  }
  titleCopy.appendChild(titleSpan);
  titleWrap.appendChild(titleCopy);
  if (context === BOARD_CONTEXT_TEST && item?.dashboard_split_job) {
    const splitPill = document.createElement('span');
    splitPill.className = 'dashboard-split-job-pill';
    splitPill.textContent = 'SPLIT JOB';
    titleWrap.appendChild(splitPill);
  }

  cell.appendChild(titleWrap);
  return cell;
}

function enableDashboardJobTitleHoverScroll(titleElement) {
  titleElement.addEventListener('mouseenter', () => {
    startDashboardJobTitleHoverScroll(titleElement);
  });
  titleElement.addEventListener('mouseleave', () => {
    stopDashboardJobTitleHoverScroll(titleElement);
  });
}

function startDashboardJobTitleHoverScroll(titleElement) {
  stopDashboardJobTitleHoverScroll(titleElement);
  const maxScroll = Math.ceil(titleElement.scrollWidth - titleElement.clientWidth);
  if (maxScroll <= 1) return;

  titleElement.classList.add('dashboard-job-title-scrolling');
  const delayMs = 250;
  const durationMs = Math.max(1600, Math.min(8000, maxScroll * 30));
  const startAt = window.performance.now() + delayMs;
  const animation = { frame: 0 };

  const tick = (now) => {
    if (!titleElement.isConnected) {
      __dashboardJobTitleScrollAnimations.delete(titleElement);
      return;
    }
    if (now < startAt) {
      animation.frame = window.requestAnimationFrame(tick);
      return;
    }

    const progress = Math.min((now - startAt) / durationMs, 1);
    titleElement.scrollLeft = Math.round(maxScroll * progress);
    if (progress < 1) {
      animation.frame = window.requestAnimationFrame(tick);
    }
  };

  animation.frame = window.requestAnimationFrame(tick);
  __dashboardJobTitleScrollAnimations.set(titleElement, animation);
}

function stopDashboardJobTitleHoverScroll(titleElement) {
  const animation = __dashboardJobTitleScrollAnimations.get(titleElement);
  if (animation) window.cancelAnimationFrame(animation.frame);
  __dashboardJobTitleScrollAnimations.delete(titleElement);
  titleElement.classList.remove('dashboard-job-title-scrolling');
  titleElement.scrollLeft = 0;
}

function buildTestRowMenuButton(item) {
  const menuBtn = document.createElement('button');
  menuBtn.type = 'button';
  menuBtn.className = 'test-row-menu-button';
  menuBtn.title = 'Job actions';
  menuBtn.setAttribute('aria-label', 'Job actions');
  menuBtn.setAttribute('aria-haspopup', 'menu');
  menuBtn.innerHTML = '<span></span><span></span><span></span>';
  menuBtn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    openTestRowMenu(menuBtn, item);
  });
  return menuBtn;
}

function openTestDashboardMobileJobOverview(item, opener = null) {
  if (!isMobileNavLayout() || !item?.id) return;
  closeStatusDropdown();
  closeTestRowMenu();
  closeTestDatePopover();
  closeMobileNav();

  const modal = ensureTestDashboardMobileJobOverview();
  __testMobileJobOverviewState = {
    itemId: String(item.id),
    linesOpen: false,
    opener,
  };
  renderTestDashboardMobileJobOverview(window.__latestTestBoardPayload);
  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('test-dashboard-mobile-job-open');
  window.requestAnimationFrame(() => {
    modal.querySelector('[data-test-mobile-job-close]')?.focus();
  });
}

function ensureTestDashboardMobileJobOverview() {
  let modal = document.getElementById('test-dashboard-mobile-job-overview');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'test-dashboard-mobile-job-overview';
  modal.className = 'test-dashboard-mobile-job-modal';
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `
    <section class="test-dashboard-mobile-job-shell" role="dialog" aria-modal="true" aria-labelledby="test-dashboard-mobile-job-title">
      <header class="test-dashboard-mobile-job-head">
        <div class="test-dashboard-mobile-job-heading">
          <span class="test-dashboard-mobile-job-eyebrow">JOB OVERVIEW</span>
          <button class="test-dashboard-mobile-job-order-link" id="test-dashboard-mobile-job-title" type="button" data-test-mobile-job-title>Job</button>
        </div>
        <button class="test-dashboard-mobile-job-close" type="button" data-test-mobile-job-close aria-label="Close job overview">×</button>
      </header>
      <div class="test-dashboard-mobile-job-content" data-test-mobile-job-content></div>
      <button class="test-dashboard-mobile-job-status" type="button" data-test-mobile-job-status aria-haspopup="menu">
        <span class="test-dashboard-mobile-job-status-label">STATUS</span>
        <span class="test-dashboard-mobile-job-status-value" data-test-mobile-job-status-value>Set status</span>
      </button>
    </section>
  `;
  modal.addEventListener('click', (event) => {
    if (event.target === modal || event.target.closest('[data-test-mobile-job-close]')) {
      closeTestDashboardMobileJobOverview();
    }
  });
  document.addEventListener('keydown', handleTestDashboardMobileJobOverviewKeydown);
  document.body.appendChild(modal);
  return modal;
}

function renderTestDashboardMobileJobOverview(payload = window.__latestTestBoardPayload) {
  const state = __testMobileJobOverviewState;
  const modal = document.getElementById('test-dashboard-mobile-job-overview');
  if (!state?.itemId || !modal) return;

  const board = unwrapFirstBoard(payload);
  const item = findBoardPayloadItem(payload, state.itemId);
  if (!board || !item) {
    closeTestDashboardMobileJobOverview();
    return;
  }

  const parsedTitle = parseTitle(item.name || '');
  const databaseJob = item.database_job || {};
  const orderNumber = normalizeCellText(databaseJob.order_no || parsedTitle.orderNumber || '');
  const customerName = getDashboardItemCustomerName(item);
  const jobTitle = getDashboardItemJobTitle(item);
  const designColumn = findBoardColumnByIdOrCompactTitle(
    board,
    TEST_DASHBOARD_CLIENT_COLUMN_IDS.DESIGN,
    'DESPSG'
  );
  const designNumbers = designColumn
    ? normalizeCellText(findColumnValue(item, designColumn.id)?.text || '')
    : '';
  const statusColumn = findBoardColumnByIdOrCompactTitle(
    board,
    TEST_DASHBOARD_CLIENT_COLUMN_IDS.STATUS,
    'STATUS'
  );
  const statusValue = statusColumn ? findColumnValue(item, statusColumn.id) : null;
  const statusText = normalizeCellText(statusValue?.text || '');
  const quantityColumn = findSubitemQuantityColumn(board.subitemColumns || []);
  const garmentTotal = getDashboardParentTotalText(item, quantityColumn) || '0';
  const lineItems = (Array.isArray(item.subitems) ? item.subitems : [])
    .filter(subitem => !isDashboardTotalSubitem(subitem));

  const title = modal.querySelector('[data-test-mobile-job-title]');
  if (title) {
    const linkedOrder = Boolean(orderNumber && item?.database_job?.source_order_id);
    title.textContent = orderNumber || 'PRIVATE JOB';
    title.disabled = !linkedOrder;
    title.setAttribute(
      'aria-label',
      linkedOrder ? `Open DATABASE order ${orderNumber}` : 'Private dashboard job'
    );
    title.onclick = linkedOrder
      ? (event) => {
          event.preventDefault();
          openTestDashboardDatabaseOrder(item);
        }
      : null;
  }

  const content = modal.querySelector('[data-test-mobile-job-content]');
  if (content) {
    const overview = document.createElement('div');
    overview.className = 'test-dashboard-mobile-job-fields';
    overview.appendChild(buildTestDashboardMobileJobField('CUSTOMER', customerName || '—'));
    overview.appendChild(buildTestDashboardMobileJobField('JOB TITLE', jobTitle || '—'));
    overview.appendChild(buildTestDashboardMobileJobField('DESIGN NUMBERS', designNumbers || '—'));
    overview.appendChild(buildTestDashboardMobileJobField('GARMENT TOTAL', garmentTotal, { strong: true }));

    const lineSection = document.createElement('section');
    lineSection.className = 'test-dashboard-mobile-job-lines';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'test-dashboard-mobile-job-lines-toggle';
    toggle.disabled = lineItems.length === 0;
    toggle.setAttribute('aria-expanded', state.linesOpen ? 'true' : 'false');
    toggle.innerHTML = `
      <span>LINE ITEMS <span class="test-dashboard-mobile-job-lines-count">${lineItems.length}</span></span>
      <span class="test-dashboard-mobile-job-lines-arrow" aria-hidden="true"></span>
    `;
    toggle.addEventListener('click', () => {
      if (!__testMobileJobOverviewState) return;
      __testMobileJobOverviewState.linesOpen = !__testMobileJobOverviewState.linesOpen;
      renderTestDashboardMobileJobOverview(window.__latestTestBoardPayload);
    });
    lineSection.appendChild(toggle);

    const lineList = document.createElement('div');
    lineList.className = 'test-dashboard-mobile-job-line-list';
    lineList.hidden = !state.linesOpen;
    if (lineItems.length) {
      lineItems.forEach((lineItem, index) => {
        lineList.appendChild(buildTestDashboardMobileLineItem(
          lineItem,
          board.subitemColumns || [],
          index
        ));
      });
    } else {
      const empty = document.createElement('div');
      empty.className = 'test-dashboard-mobile-job-lines-empty';
      empty.textContent = 'No garment line items';
      lineList.appendChild(empty);
    }
    lineSection.appendChild(lineList);

    content.replaceChildren(overview, lineSection);
  }

  const statusButton = modal.querySelector('[data-test-mobile-job-status]');
  const statusLabel = modal.querySelector('[data-test-mobile-job-status-value]');
  if (statusLabel) statusLabel.textContent = statusText || 'SET STATUS';
  if (statusButton) {
    const editable = Boolean(statusColumn?.id && getStatusOptions(statusColumn).length);
    statusButton.disabled = !editable;
    statusButton.style.backgroundColor = statusText && statusColumn
      ? resolveStatusColor(statusColumn, statusValue, statusText)
      : '#7f879e';
    statusButton.setAttribute(
      'aria-label',
      statusText ? `Change job status from ${statusText}` : 'Set job status'
    );
    statusButton.onclick = editable
      ? (event) => {
          event.preventDefault();
          openStatusDropdown({
            anchor: statusButton,
            item,
            column: statusColumn,
            currentText: statusText,
            context: BOARD_CONTEXT_TEST,
          });
        }
      : null;
  }
}

function buildTestDashboardMobileJobField(label, value, { strong = false } = {}) {
  const row = document.createElement('div');
  row.className = 'test-dashboard-mobile-job-field';
  if (strong) row.classList.add('strong');

  const labelEl = document.createElement('span');
  labelEl.className = 'test-dashboard-mobile-job-field-label';
  labelEl.textContent = label;
  const valueEl = document.createElement('span');
  valueEl.className = 'test-dashboard-mobile-job-field-value';
  valueEl.textContent = value;
  row.append(labelEl, valueEl);
  return row;
}

function buildTestDashboardMobileLineItem(lineItem, columns, index) {
  const card = document.createElement('article');
  card.className = 'test-dashboard-mobile-job-line';

  const title = document.createElement('div');
  title.className = 'test-dashboard-mobile-job-line-title';
  title.textContent = normalizeCellText(lineItem?.name || '') || `Line item ${index + 1}`;
  card.appendChild(title);

  const values = document.createElement('div');
  values.className = 'test-dashboard-mobile-job-line-values';
  [
    ['CODE', 'CODE'],
    ['COLOUR', 'COLOUR'],
    ['REF', 'REF'],
    ['SIZE', 'SIZE'],
    ['QTY', 'QTY'],
  ].forEach(([label, compactTitle]) => {
    const column = findDashboardColumnByCompactTitle(columns, compactTitle);
    const value = column ? normalizeCellText(findColumnValue(lineItem, column.id)?.text || '') : '';
    const field = document.createElement('span');
    field.className = 'test-dashboard-mobile-job-line-value';
    const fieldLabel = document.createElement('span');
    fieldLabel.textContent = label;
    const fieldValue = document.createElement('strong');
    fieldValue.textContent = value || '—';
    field.append(fieldLabel, fieldValue);
    values.appendChild(field);
  });
  card.appendChild(values);
  return card;
}

function findDashboardColumnByCompactTitle(columns, compactTitle) {
  const wanted = normalizeColumnTitle(compactTitle).replace(/[^A-Z0-9]/g, '');
  return (Array.isArray(columns) ? columns : []).find(column => {
    const candidate = normalizeColumnTitle(column?.title || '').replace(/[^A-Z0-9]/g, '');
    if (candidate === wanted) return true;
    return wanted === 'COLOUR' && candidate === 'COLOR';
  }) || null;
}

function syncTestDashboardMobileJobOverview(payload = window.__latestTestBoardPayload) {
  if (!isTestDashboardMobileJobOverviewOpen()) return;
  renderTestDashboardMobileJobOverview(payload);
}

function isTestDashboardMobileJobOverviewOpen() {
  const modal = document.getElementById('test-dashboard-mobile-job-overview');
  return Boolean(__testMobileJobOverviewState?.itemId && modal && !modal.hidden);
}

function handleTestDashboardMobileJobOverviewKeydown(event) {
  if (event.key !== 'Escape' || !isTestDashboardMobileJobOverviewOpen()) return;
  if (isStatusDropdownOpen()) return;
  const confirmModal = document.getElementById('test-dashboard-complete-confirm-modal');
  if (confirmModal && !confirmModal.hidden) return;
  event.preventDefault();
  closeTestDashboardMobileJobOverview();
}

function closeTestDashboardMobileJobOverview({ restoreFocus = true } = {}) {
  const modal = document.getElementById('test-dashboard-mobile-job-overview');
  if (!modal && !__testMobileJobOverviewState) return;

  const opener = __testMobileJobOverviewState?.opener;
  if (modal) {
    if (__statusDropdownState?.anchor && modal.contains(__statusDropdownState.anchor)) {
      closeStatusDropdown();
    }
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
  }
  __testMobileJobOverviewState = null;
  document.body.classList.remove('test-dashboard-mobile-job-open');
  if (restoreFocus && opener?.isConnected) {
    window.requestAnimationFrame(() => opener.focus());
  }
}

function renderTestPrivateJobNameInput(container, item) {
  const input = document.createElement('input');
  input.className = 'test-private-job-name-input';
  input.type = 'text';
  input.value = item?.name || '';
  input.placeholder = 'Private job';
  input.dataset.originalValue = item?.name || '';
  input.autocomplete = 'off';
  input.spellcheck = true;
  input.setAttribute('aria-label', 'Private job title');
  input.addEventListener('pointerdown', (event) => event.stopPropagation());
  input.addEventListener('click', (event) => event.stopPropagation());
  input.addEventListener('focus', () => {
    input.dataset.originalValue = input.value || '';
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      input.blur();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      input.value = input.dataset.originalValue || '';
      input.blur();
    }
  });
  input.addEventListener('blur', () => {
    saveTestPrivateJobName(input, item);
  });
  container.appendChild(input);

  if (__pendingPrivateJobFocusId && String(item?.id) === __pendingPrivateJobFocusId) {
    __pendingPrivateJobFocusId = '';
    window.requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  }
}

async function saveTestPrivateJobName(input, item) {
  if (!input || !item?.id) return;
  const previousValue = String(input.dataset.originalValue || '').trim();
  const nextValue = String(input.value || '').trim();
  if (nextValue === previousValue) return;

  input.disabled = true;
  input.classList.add('saving');
  __testPrivateNameEditInFlight += 1;
  try {
    const response = await fetch(ENDPOINTS.testItemName(item.id), {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nextValue })
    });
    if (!response.ok) throw new Error(await readApiError(response));
    updateCachedPrivateJobName(item.id, nextValue);
    input.dataset.originalValue = nextValue;
  } catch (err) {
    console.warn('Private job rename failed', err);
    input.value = previousValue;
    alert(`Failed to rename private job: ${err.message || 'Unknown error'}`);
  } finally {
    __testPrivateNameEditInFlight = Math.max(0, __testPrivateNameEditInFlight - 1);
    input.disabled = false;
    input.classList.remove('saving');
  }
}

function openTestDashboardDatabaseOrder(item) {
  const sourceOrderId = item?.database_job?.source_order_id || item?.id;
  const numericId = Number.parseInt(sourceOrderId, 10);
  if (!Number.isFinite(numericId)) return;

  if (typeof window.ultimateHubOpenDatabaseOrder === 'function') {
    window.ultimateHubOpenDatabaseOrder(numericId, 'details').catch((err) => {
      console.warn('Failed to open DATABASE order', err);
    });
    return;
  }

  if (typeof window.activateDashboardTab === 'function') {
    window.activateDashboardTab('database');
  } else {
    document.querySelector('.nav-tabs li[data-tab="database"]')?.click();
  }
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

function buildSubitemBrandCell(subitem) {
  const cell = document.createElement('div');
  cell.className = 'grid-cell dashboard-value-cell subitem-value-cell subitem-brand-cell';
  const brand = normalizeCellText(subitem?.brand || '');
  if (brand) {
    cell.title = brand;
    renderPlainTextValue(cell, brand);
  }
  return cell;
}

function buildBlankCell(extraClass = '') {
  const cell = document.createElement('div');
  cell.className = `grid-cell ${extraClass}`.trim();
  return cell;
}

function buildColumnValueCell(entity, column, { subitem = false, context = BOARD_CONTEXT_TEST } = {}) {
  const cell = document.createElement('div');
  cell.className = `grid-cell dashboard-value-cell ${subitem ? 'subitem-value-cell' : ''} column-${column.type}`;
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
    if (context === BOARD_CONTEXT_TEST && !subitem && entity?.id) {
      renderTestDateValue(cell, value, text, entity, column);
    } else {
      renderPlainTextValue(cell, formatDateText(text));
    }
  } else if (column.type === 'timeline') {
    renderPlainTextValue(cell, text);
  } else if (column.type === 'text' || column.type === 'long_text') {
    if (context === BOARD_CONTEXT_TEST && !subitem && entity?.id && isTestDesignColumn(column)) {
      renderTestDesignInputValue(cell, text, entity, column);
    } else if (context === BOARD_CONTEXT_TEST && !subitem && entity?.id && isTestEditableTextColumn(column)) {
      renderTestTextInputValue(cell, text, entity, column);
    } else {
      renderTextInputValue(cell, text);
    }
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

function renderStatusValue(cell, value, column, text, { entity = null, subitem = false, context = BOARD_CONTEXT_TEST } = {}) {
  const editable = !subitem && entity?.id && isEditableDashboardStatusColumn(column, entity) && getStatusOptions(column).length > 0;
  const badge = document.createElement(editable ? 'button' : 'span');
  badge.className = 'dashboard-status-badge';
  if (editable) {
    badge.type = 'button';
    badge.classList.add('dashboard-status-button');
    badge.setAttribute('aria-haspopup', 'menu');
    const fieldName = normalizeColumnTitle(column.title).toLowerCase();
    badge.setAttribute('aria-label', text ? `Change job ${fieldName} from ${text}` : `Set job ${fieldName}`);
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
    if (isPriorityStatusColumn(column)) badge.classList.add('empty-priority');
    cell.appendChild(badge);
    return;
  }

  const color = resolveStatusColor(column, value, text);
  badge.style.backgroundColor = color;
  badge.style.color = '#fff';
  badge.textContent = text;
  cell.appendChild(badge);
}

function isEditableDashboardStatusColumn(column, entity = null) {
  if (column?.type !== 'status') return false;
  const title = normalizeColumnTitle(column.title);
  return title === 'STATUS' || title === 'PRIORITY' ||
    (title === 'TYPE' && isTestDashboardPrivateItem(entity));
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
  let dropdown = document.getElementById('dashboard-status-popover');
  if (dropdown) return dropdown;

  dropdown = document.createElement('div');
  dropdown.id = 'dashboard-status-popover';
  dropdown.className = 'dashboard-status-popover hidden';
  dropdown.setAttribute('role', 'menu');
  document.body.appendChild(dropdown);

  document.addEventListener('pointerdown', handleStatusDropdownDocumentPointerDown, true);
  document.addEventListener('keydown', handleStatusDropdownKeydown);
  window.addEventListener('resize', closeStatusDropdown);
  window.addEventListener('scroll', closeStatusDropdown, true);
  return dropdown;
}

function openStatusDropdown({ anchor, item, column, currentText, context = BOARD_CONTEXT_TEST }) {
  if (!anchor || !item?.id || !column?.id) return;
  if (__statusDropdownState?.anchor === anchor && isStatusDropdownOpen()) {
    closeStatusDropdown();
    return;
  }
  closeTestRowMenu();
  closeTestDatePopover();

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
    button.className = 'dashboard-status-option';
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
  const dropdown = document.getElementById('dashboard-status-popover');
  return Boolean(dropdown && !dropdown.classList.contains('hidden'));
}

function closeStatusDropdown() {
  const dropdown = document.getElementById('dashboard-status-popover');
  if (dropdown) dropdown.classList.add('hidden');
  __statusDropdownState = null;
}

function ensureTestRowMenu() {
  let menu = document.getElementById('test-row-action-menu');
  if (menu) return menu;

  menu = document.createElement('div');
  menu.id = 'test-row-action-menu';
  menu.className = 'test-row-action-menu hidden';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = `
    <div class="test-row-action-item has-submenu" role="none">
      <button class="test-row-action-button" type="button" role="menuitem" data-test-row-move-root="true">
        <span>Move To</span>
        <span class="test-row-action-arrow" aria-hidden="true">›</span>
      </button>
      <div class="test-row-action-submenu" role="menu" aria-label="Move job to group">
        <button type="button" role="menuitem" data-test-row-move-group="HOLD">Hold</button>
        <button type="button" role="menuitem" data-test-row-move-group="OFFICE">Office</button>
        <button type="button" role="menuitem" data-test-row-move-group="PRE-PRODUCTION">Pre-Production</button>
      </div>
    </div>
    <button class="test-row-action-button danger" type="button" role="menuitem" data-test-row-remove-proof="true">REMOVE VISUAL</button>
    <button class="test-row-action-button danger" type="button" role="menuitem" data-test-row-delete-private="true" hidden>Delete</button>
  `;
  menu.addEventListener('click', handleTestRowMenuClick);
  document.body.appendChild(menu);
  document.addEventListener('pointerdown', handleTestRowMenuDocumentPointerDown, true);
  document.addEventListener('keydown', handleTestRowMenuKeydown);
  window.addEventListener('resize', closeTestRowMenu);
  window.addEventListener('scroll', closeTestRowMenu, true);
  return menu;
}

function openTestRowMenu(anchor, item) {
  if (!anchor || !item?.id) return;
  if (__testRowMenuState?.anchor === anchor && isTestRowMenuOpen()) {
    closeTestRowMenu();
    return;
  }
  closeStatusDropdown();
  closeTestDatePopover();
  const menu = ensureTestRowMenu();
  __testRowMenuState = {
    anchor,
    itemId: String(item.id),
    itemName: normalizeCellText(item.name || ''),
    privateJob: isTestDashboardPrivateItem(item),
    visualFiles: getTestDashboardVisualFiles(item),
  };
  const deleteButton = menu.querySelector('[data-test-row-delete-private]');
  syncTestRowMenuDeleteAction(deleteButton, __testRowMenuState.privateJob);
  menu.classList.remove('hidden');
  menu.style.visibility = 'hidden';
  positionTestRowMenu(anchor, menu);
  menu.style.visibility = '';
}

function syncTestRowMenuDeleteAction(deleteButton, visible) {
  if (!deleteButton) return;
  deleteButton.hidden = !visible;
  deleteButton.disabled = !visible;
  deleteButton.style.display = visible ? '' : 'none';
  deleteButton.setAttribute('aria-hidden', visible ? 'false' : 'true');
}

function isTestDashboardPrivateItem(item) {
  return item?.dashboard_private_job === true
    && !item?.database_job
    && isTestPrivateItemId(item?.id);
}

function getTestDashboardVisualFiles(item) {
  const board = unwrapFirstBoard(window.__latestTestBoardPayload);
  const proofColumn = findBoardColumnByIdOrCompactTitle(
    board,
    TEST_DASHBOARD_CLIENT_COLUMN_IDS.PROOF,
    'PROOF'
  );
  const value = findColumnValue(item, proofColumn?.id || TEST_DASHBOARD_CLIENT_COLUMN_IDS.PROOF);
  return getFileList(value).map(normalizeDashboardFile).filter(Boolean);
}

function testDashboardVisualFileId(file) {
  return normalizeCellText(
    file?.dashboardFileId
    || file?.dashboardPrivateFileId
    || file?.id
    || ''
  );
}

function positionTestRowMenu(anchor, menu) {
  const rect = anchor.getBoundingClientRect();
  const margin = 8;
  const gap = 8;
  const width = menu.offsetWidth;
  const height = menu.offsetHeight;
  const left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin));
  let top = rect.bottom + gap;
  if (top + height > window.innerHeight - margin) {
    top = Math.max(margin, rect.top - height - gap);
  }
  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;
}

function isTestRowMenuOpen() {
  const menu = document.getElementById('test-row-action-menu');
  return Boolean(menu && !menu.classList.contains('hidden'));
}

function closeTestRowMenu() {
  const menu = document.getElementById('test-row-action-menu');
  if (menu) menu.classList.add('hidden');
  __testRowMenuState = null;
}

function handleTestRowMenuClick(event) {
  const removeProofButton = event.target.closest('[data-test-row-remove-proof]');
  if (removeProofButton) {
    event.preventDefault();
    event.stopPropagation();
    const state = __testRowMenuState;
    closeTestRowMenu();
    if (!state?.itemId) return;
    if (state.visualFiles?.length > 1) {
      openTestVisualRemovalModal(state);
    } else {
      removeTestDashboardProof(state.itemId, state.itemName);
    }
    return;
  }

  const deleteButton = event.target.closest('[data-test-row-delete-private]');
  if (deleteButton) {
    event.preventDefault();
    event.stopPropagation();
    const state = __testRowMenuState;
    closeTestRowMenu();
    if (state?.privateJob && isTestPrivateItemId(state.itemId)) {
      deleteTestDashboardPrivateJob(state.itemId, state.itemName);
    }
    return;
  }

  const button = event.target.closest('[data-test-row-move-group]');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  const group = button.dataset.testRowMoveGroup || '';
  const itemId = __testRowMenuState?.itemId || '';
  closeTestRowMenu();
  if (itemId && group) moveTestDashboardItemToGroup(itemId, group);
}

function handleTestRowMenuDocumentPointerDown(event) {
  if (!isTestRowMenuOpen()) return;
  const menu = document.getElementById('test-row-action-menu');
  if (menu?.contains(event.target)) return;
  if (__testRowMenuState?.anchor?.contains?.(event.target)) return;
  closeTestRowMenu();
}

function handleTestRowMenuKeydown(event) {
  if (!isTestRowMenuOpen()) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeTestRowMenu();
  }
}

async function moveTestDashboardItemToGroup(itemId, group) {
  __statusUpdateInFlight += 1;
  try {
    const response = await fetch(ENDPOINTS.testItemGroup(itemId), {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group })
    });
    if (!response.ok) throw new Error(await readApiError(response));
    __testGroupKeysToOpen.add(slugify(group));
    await loadTestBoard({ forceRefresh: true });
  } catch (err) {
    console.warn('Tuesday Dashboard move failed', err);
    alert(`Failed to move job: ${err.message || 'Unknown error'}`);
    await loadTestBoard({ forceRefresh: true });
  } finally {
    __statusUpdateInFlight = Math.max(0, __statusUpdateInFlight - 1);
  }
}

async function removeTestDashboardProof(itemId, itemName = '') {
  const label = itemName ? `"${itemName}"` : 'this job';
  if (!window.confirm(`Remove proof from ${label}?`)) return;

  __statusUpdateInFlight += 1;
  try {
    const response = await fetch(ENDPOINTS.testProofFiles(itemId), {
      method: 'DELETE',
      credentials: 'include'
    });
    if (!response.ok) throw new Error(await readApiError(response));
    await loadTestBoard({ forceRefresh: true });
  } catch (err) {
    console.warn('Proof removal failed', err);
    alert(`Failed to remove proof: ${err.message || 'Unknown error'}`);
    await loadTestBoard({ forceRefresh: true });
  } finally {
    __statusUpdateInFlight = Math.max(0, __statusUpdateInFlight - 1);
  }
}

function ensureTestVisualRemovalModal() {
  let modal = document.getElementById('test-visual-removal-modal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'test-visual-removal-modal';
  modal.className = 'test-visual-removal-modal';
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `
    <section class="test-visual-removal-shell" role="dialog" aria-modal="true" aria-labelledby="test-visual-removal-title">
      <header class="test-visual-removal-header">
        <div>
          <h2 id="test-visual-removal-title">Remove visual</h2>
          <p class="test-visual-removal-summary"></p>
        </div>
        <button class="test-visual-removal-close" type="button" data-test-visual-removal-close aria-label="Close visual removal">×</button>
      </header>
      <div class="test-visual-removal-feedback" role="status" aria-live="polite"></div>
      <div class="test-visual-removal-grid"></div>
      <footer class="test-visual-removal-footer">
        <button type="button" data-test-visual-removal-close>Done</button>
      </footer>
    </section>
  `;
  modal.addEventListener('click', handleTestVisualRemovalModalClick);
  document.addEventListener('keydown', handleTestVisualRemovalModalKeydown);
  document.body.appendChild(modal);
  return modal;
}

function openTestVisualRemovalModal(options = {}) {
  const files = Array.isArray(options.visualFiles)
    ? options.visualFiles.map(normalizeDashboardFile).filter(Boolean)
    : [];
  if (!options.itemId || files.length < 2) return;

  const modal = ensureTestVisualRemovalModal();
  __testVisualRemovalState = {
    itemId: String(options.itemId),
    itemName: normalizeCellText(options.itemName || ''),
    files,
    deletingIds: new Set(),
    feedback: '',
    feedbackType: '',
    opener: options.anchor || null,
  };
  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open', 'test-visual-removal-open');
  renderTestVisualRemovalModal();
  window.requestAnimationFrame(() => {
    modal.querySelector('[data-test-visual-remove-file]')?.focus();
  });
}

function isTestVisualRemovalModalOpen() {
  const modal = document.getElementById('test-visual-removal-modal');
  return Boolean(modal && !modal.hidden);
}

function renderTestVisualRemovalModal() {
  const modal = document.getElementById('test-visual-removal-modal');
  const state = __testVisualRemovalState;
  if (!modal || !state) return;

  const summary = modal.querySelector('.test-visual-removal-summary');
  const feedback = modal.querySelector('.test-visual-removal-feedback');
  const grid = modal.querySelector('.test-visual-removal-grid');
  if (summary) {
    const label = state.itemName || `job ${state.itemId}`;
    summary.textContent = state.files.length
      ? `${state.files.length} visual${state.files.length === 1 ? '' : 's'} attached to ${label}`
      : `No visuals remain on ${label}`;
  }
  if (feedback) {
    feedback.textContent = state.feedback;
    feedback.classList.toggle('success', state.feedbackType === 'success');
    feedback.classList.toggle('error', state.feedbackType === 'error');
  }
  if (!grid) return;
  grid.replaceChildren();

  for (const file of state.files) {
    const fileId = testDashboardVisualFileId(file);
    const filename = normalizeCellText(file.name || 'Visual');
    const deleting = state.deletingIds.has(fileId);
    const card = document.createElement('article');
    card.className = 'test-visual-removal-card';
    if (deleting) card.classList.add('deleting');

    const preview = document.createElement('div');
    preview.className = 'test-visual-removal-preview';
    const fallback = document.createElement('span');
    fallback.className = 'test-visual-removal-fallback';
    fallback.textContent = isPdfFile(filename, file.mime) ? 'PDF' : 'VISUAL';
    preview.appendChild(fallback);

    const thumbnailUrl = buildTestVisualRemovalThumbnailUrl(file);
    if (thumbnailUrl) {
      const image = document.createElement('img');
      image.src = thumbnailUrl;
      image.alt = filename;
      image.loading = 'lazy';
      image.decoding = 'async';
      image.addEventListener('error', () => image.remove(), { once: true });
      preview.appendChild(image);
    }

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'test-visual-removal-x';
    removeButton.dataset.testVisualRemoveFile = fileId;
    removeButton.setAttribute('aria-label', `Remove ${filename}`);
    removeButton.title = `Remove ${filename}`;
    removeButton.textContent = '×';
    removeButton.disabled = deleting || !fileId;

    const name = document.createElement('div');
    name.className = 'test-visual-removal-name';
    name.textContent = filename;
    name.title = filename;

    card.append(preview, removeButton, name);
    grid.appendChild(card);
  }

  if (!state.files.length) {
    const empty = document.createElement('div');
    empty.className = 'test-visual-removal-empty';
    empty.textContent = 'All attached visuals have been removed.';
    grid.appendChild(empty);
  }
}

function buildTestVisualRemovalThumbnailUrl(file) {
  const source = buildAssetSrc(file);
  if (!source || !isCloudinaryDeliveryUrl(source)) return source;
  const marker = '/upload/';
  if (!source.includes(marker)) return source;
  return source.replace(
    marker,
    `${marker}f_jpg,q_auto:eco,c_limit,w_360,h_250,pg_1/`
  );
}

function handleTestVisualRemovalModalClick(event) {
  const modal = document.getElementById('test-visual-removal-modal');
  if (!modal || modal.hidden) return;
  if (event.target === modal || event.target.closest('[data-test-visual-removal-close]')) {
    closeTestVisualRemovalModal();
    return;
  }
  const removeButton = event.target.closest('[data-test-visual-remove-file]');
  if (removeButton && modal.contains(removeButton)) {
    removeTestDashboardVisual(removeButton.dataset.testVisualRemoveFile);
  }
}

function handleTestVisualRemovalModalKeydown(event) {
  if (event.key !== 'Escape' || !isTestVisualRemovalModalOpen()) return;
  event.preventDefault();
  closeTestVisualRemovalModal();
}

function closeTestVisualRemovalModal() {
  const modal = document.getElementById('test-visual-removal-modal');
  if (modal) {
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
  }
  document.body.classList.remove('modal-open', 'test-visual-removal-open');
  const opener = __testVisualRemovalState?.opener;
  __testVisualRemovalState = null;
  opener?.focus?.({ preventScroll: true });
}

async function removeTestDashboardVisual(fileId) {
  const state = __testVisualRemovalState;
  const normalizedFileId = normalizeCellText(fileId);
  const file = state?.files.find(item => testDashboardVisualFileId(item) === normalizedFileId);
  if (!state || !file || !normalizedFileId || state.deletingIds.has(normalizedFileId)) return;

  state.deletingIds.add(normalizedFileId);
  state.feedback = `Removing ${file.name || 'visual'}…`;
  state.feedbackType = '';
  renderTestVisualRemovalModal();
  __statusUpdateInFlight += 1;

  try {
    const response = await fetch(ENDPOINTS.testFile(state.itemId, normalizedFileId), {
      method: 'DELETE',
      credentials: 'include'
    });
    if (!response.ok) throw new Error(await readApiError(response));
    if (__testVisualRemovalState === state) {
      state.files = state.files.filter(item => testDashboardVisualFileId(item) !== normalizedFileId);
      state.feedback = `✓ ${file.name || 'Visual'} removed`;
      state.feedbackType = 'success';
    }
    await loadTestBoard({ forceRefresh: true });
  } catch (err) {
    console.warn('Visual removal failed', err);
    if (__testVisualRemovalState === state) {
      state.feedback = `Failed to remove visual: ${err.message || 'Unknown error'}`;
      state.feedbackType = 'error';
    }
  } finally {
    state.deletingIds.delete(normalizedFileId);
    __statusUpdateInFlight = Math.max(0, __statusUpdateInFlight - 1);
    if (__testVisualRemovalState === state) renderTestVisualRemovalModal();
  }
}

async function deleteTestDashboardPrivateJob(itemId, itemName = '') {
  if (!isTestPrivateItemId(itemId)) return;
  const label = itemName ? `"${itemName}"` : 'this private job';
  if (!window.confirm(`Delete ${label}?`)) return;

  __statusUpdateInFlight += 1;
  try {
    const response = await fetch(ENDPOINTS.testPrivateJob(itemId), {
      method: 'DELETE',
      credentials: 'include'
    });
    if (!response.ok) throw new Error(await readApiError(response));
    await loadTestBoard({ forceRefresh: true });
  } catch (err) {
    console.warn('Private job delete failed', err);
    alert(`Failed to delete private job: ${err.message || 'Unknown error'}`);
    await loadTestBoard({ forceRefresh: true });
  } finally {
    __statusUpdateInFlight = Math.max(0, __statusUpdateInFlight - 1);
  }
}

function renderTestDateValue(cell, value, text, entity, column) {
  const locked = isTestDashboardDateLocked(entity);
  const iso = getDateIsoFromValue(value, text);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'test-date-button';
  if (locked) button.classList.add('locked');
  button.textContent = iso ? formatDateText(iso) : '';
  button.title = locked ? 'Customer date is set in DATABASE' : (iso ? 'Change date' : 'Set date');
  button.setAttribute('aria-label', button.title);
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (locked) return;
    openTestDatePopover(button, entity, column, iso);
  });
  cell.classList.add('test-date-cell');
  cell.appendChild(button);
}

function ensureTestDatePopover() {
  let popover = document.getElementById('test-date-popover');
  if (popover) return popover;

  popover = document.createElement('div');
  popover.id = 'test-date-popover';
  popover.className = 'test-date-popover hidden';
  popover.setAttribute('role', 'dialog');
  popover.setAttribute('aria-label', 'Set dashboard date');
  popover.innerHTML = `
    <input class="test-date-popover-input" type="date" aria-label="Dashboard date">
    <div class="test-date-popover-actions">
      <button class="test-date-popover-button clear" type="button" data-test-date-clear="true">Clear</button>
      <button class="test-date-popover-button save" type="button" data-test-date-save="true">Save</button>
    </div>
  `;
  popover.addEventListener('click', handleTestDatePopoverClick);
  popover.addEventListener('keydown', handleTestDatePopoverKeydown);
  document.body.appendChild(popover);
  document.addEventListener('pointerdown', handleTestDatePopoverDocumentPointerDown, true);
  window.addEventListener('resize', closeTestDatePopover);
  window.addEventListener('scroll', closeTestDatePopover, true);
  return popover;
}

function openTestDatePopover(anchor, item, column, iso) {
  if (!anchor || !item?.id || !column?.id) return;
  closeStatusDropdown();
  closeTestRowMenu();
  const popover = ensureTestDatePopover();
  const input = popover.querySelector('.test-date-popover-input');
  if (input) input.value = iso || '';
  __testDatePopoverState = {
    anchor,
    itemId: String(item.id),
    columnId: String(column.id),
    columnTitle: column.title || column.id,
    originalDate: iso || '',
  };
  popover.classList.remove('hidden');
  popover.style.visibility = 'hidden';
  positionTestDatePopover(anchor, popover);
  popover.style.visibility = '';
  window.requestAnimationFrame(() => input?.focus());
}

function positionTestDatePopover(anchor, popover) {
  const rect = anchor.getBoundingClientRect();
  const margin = 8;
  const gap = 8;
  const width = popover.offsetWidth;
  const height = popover.offsetHeight;
  const preferredLeft = rect.left + rect.width / 2 - width / 2;
  const left = Math.max(margin, Math.min(preferredLeft, window.innerWidth - width - margin));
  let top = rect.bottom + gap;
  if (top + height > window.innerHeight - margin) {
    top = Math.max(margin, rect.top - height - gap);
  }
  popover.style.left = `${Math.round(left)}px`;
  popover.style.top = `${Math.round(top)}px`;
}

function isTestDatePopoverOpen() {
  const popover = document.getElementById('test-date-popover');
  return Boolean(popover && !popover.classList.contains('hidden'));
}

function closeTestDatePopover() {
  const popover = document.getElementById('test-date-popover');
  if (popover) popover.classList.add('hidden');
  __testDatePopoverState = null;
}

function handleTestDatePopoverClick(event) {
  const popover = document.getElementById('test-date-popover');
  if (!popover || popover.classList.contains('hidden')) return;
  if (event.target.closest('[data-test-date-save]')) {
    event.preventDefault();
    const input = popover.querySelector('.test-date-popover-input');
    saveTestDashboardDate(input?.value || '');
  } else if (event.target.closest('[data-test-date-clear]')) {
    event.preventDefault();
    saveTestDashboardDate('');
  }
}

function handleTestDatePopoverKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeTestDatePopover();
  } else if (event.key === 'Enter') {
    event.preventDefault();
    const input = document.getElementById('test-date-popover')?.querySelector('.test-date-popover-input');
    saveTestDashboardDate(input?.value || '');
  }
}

function handleTestDatePopoverDocumentPointerDown(event) {
  if (!isTestDatePopoverOpen()) return;
  const popover = document.getElementById('test-date-popover');
  if (popover?.contains(event.target)) return;
  if (__testDatePopoverState?.anchor?.contains?.(event.target)) return;
  closeTestDatePopover();
}

async function saveTestDashboardDate(date) {
  const state = __testDatePopoverState;
  if (!state?.itemId || !state?.columnId) return;
  closeTestDatePopover();
  __statusUpdateInFlight += 1;
  updateCachedBoardDateValue(state.itemId, state.columnId, date, BOARD_CONTEXT_TEST);
  rerenderBoardContext(BOARD_CONTEXT_TEST);
  try {
    const response = await fetch(ENDPOINTS.testDateColumn(state.itemId), {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        columnId: state.columnId,
        date,
      })
    });
    if (!response.ok) throw new Error(await readApiError(response));
    await loadTestBoard({ forceRefresh: true });
  } catch (err) {
    console.warn('Date update failed', err);
    alert(`Failed to update date: ${err.message || 'Unknown error'}`);
    await loadTestBoard({ forceRefresh: true });
  } finally {
    __statusUpdateInFlight = Math.max(0, __statusUpdateInFlight - 1);
  }
}

function isTestDashboardDateLocked(item) {
  return item?.database_job?.customer_date_required === true ||
    item?.database_job?.customer_date_required === 'true';
}

function getDateIsoFromValue(value, text) {
  const parsed = parseJsonMaybe(value?.value);
  const candidate = parsed?.date || text || value?.text || '';
  const date = parseLocalDate(candidate);
  return date ? localDateIso(date) : '';
}

function handleStatusDropdownDocumentPointerDown(event) {
  if (!isStatusDropdownOpen()) return;
  const dropdown = document.getElementById('dashboard-status-popover');
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
  const context = state.context || BOARD_CONTEXT_TEST;
  closeStatusDropdown();

  if (shouldBlockDashboardCompletion(state, option)) {
    showTestDashboardApprovalWarning(
      DASHBOARD_COMPLETION_BLOCK_MESSAGE,
      'Status blocked'
    );
    return;
  }

  const readinessMessage = testDashboardReadyStatusBlockMessage(state, option);
  if (readinessMessage) {
    showTestDashboardApprovalWarning(readinessMessage, 'Status blocked');
    return;
  }

  if (shouldBlockTestDashboardSplitReadyStatus(state, option)) {
    showTestDashboardApprovalWarning(
      TEST_DASHBOARD_SPLIT_TICKS_REQUIRED_MESSAGE,
      'Split job blocked'
    );
    return;
  }

  if (shouldConfirmTestDashboardCompletedStatus(state, option)) {
    const confirmed = await confirmTestDashboardCompletedStatus(state);
    if (!confirmed) return;
  }

  __statusUpdateInFlight += 1;

  updateCachedBoardStatusValue(state.itemId, state.columnId, option, context);
  rerenderBoardContext(context);

  try {
    const response = await fetch(getStatusColumnEndpoint(state.itemId), {
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
    if (isTestDashboardReadinessMessage(err.message)) {
      showTestDashboardApprovalWarning(err.message, 'Status blocked');
    } else if (isDashboardCompletionBlockMessage(err.message)) {
      showTestDashboardApprovalWarning(
        DASHBOARD_COMPLETION_BLOCK_MESSAGE,
        'Status blocked'
      );
    } else if (isTestSplitTicksRequirementsMessage(err.message)) {
      showTestDashboardApprovalWarning(
        TEST_DASHBOARD_SPLIT_TICKS_REQUIRED_MESSAGE,
        'Split job blocked'
      );
    } else {
      alert(`Failed to update ${state.columnTitle || 'status'}: ${err.message || 'Unknown error'}`);
    }
  } finally {
    __statusUpdateInFlight = Math.max(0, __statusUpdateInFlight - 1);
  }
}

function shouldBlockDashboardCompletion(state, option, user = window.ultimateHubUser) {
  return isDashboardCompletionBlockedUser(user)
    && state?.context === BOARD_CONTEXT_TEST
    && normalizeColumnTitle(state.columnTitle) === 'STATUS'
    && !option?.clear
    && normalizeColumnTitle(option?.label) === 'COMPLETED';
}

function isDashboardCompletionBlockedUser(user) {
  const email = String(user?.email || '').trim().toLowerCase();
  return DASHBOARD_COMPLETION_BLOCK_EMAILS.has(email);
}

function isDashboardCompletionBlockMessage(message) {
  return String(message || '').trim().toUpperCase() === DASHBOARD_COMPLETION_BLOCK_MESSAGE;
}

function shouldBlockTestDashboardSplitReadyStatus(state, option) {
  if (
    state?.context !== BOARD_CONTEXT_TEST ||
    normalizeColumnTitle(state.columnTitle) !== 'STATUS' ||
    option?.clear ||
    normalizeColumnTitle(option?.label) !== 'READY TO PRINT'
  ) {
    return false;
  }

  const payload = window.__latestTestBoardPayload;
  const item = findBoardPayloadItem(payload, state.itemId);
  if (!item?.database_job || item?.dashboard_split_job) return false;
  const typeText = normalizeColumnTitle(
    findColumnValue(item, TEST_DASHBOARD_CLIENT_COLUMN_IDS.TYPE)?.text || ''
  );
  if (!typeText.includes('PRINT') || !typeText.includes('EMB')) return false;

  return !isCheckedValue(findColumnValue(item, TEST_DASHBOARD_CLIENT_COLUMN_IDS.TRANS)) ||
    !isCheckedValue(findColumnValue(item, TEST_DASHBOARD_CLIENT_COLUMN_IDS.JAQ));
}

function testDashboardReadyStatusBlockMessage(state, option) {
  if (state?.context !== BOARD_CONTEXT_TEST || normalizeColumnTitle(state.columnTitle) !== 'STATUS'
    || option?.clear || normalizeColumnTitle(option?.label) !== 'READY TO PRINT') return '';
  const item = findBoardPayloadItem(window.__latestTestBoardPayload, state.itemId);
  if (!item || item.dashboard_split_job) return '';
  if (item.dashboard_sampling?.blocked) return TEST_DASHBOARD_SAMPLE_REQUIRED_MESSAGE;
  if (item.database_job && !isCheckedValue(findColumnValue(item, TEST_DASHBOARD_CLIENT_COLUMN_IDS.JOB))) {
    return TEST_DASHBOARD_JOB_APPROVAL_REQUIRED_MESSAGE;
  }
  return '';
}

function isTestDashboardReadinessMessage(message) {
  return [TEST_DASHBOARD_SAMPLE_REQUIRED_MESSAGE, TEST_DASHBOARD_JOB_APPROVAL_REQUIRED_MESSAGE]
    .includes(String(message || '').trim());
}

function isTestSplitTicksRequirementsMessage(message) {
  return String(message || '').trim().toLowerCase() ===
    TEST_DASHBOARD_SPLIT_TICKS_REQUIRED_MESSAGE.toLowerCase();
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

function showTestDashboardApprovalWarning(
  message = TEST_DASHBOARD_APPROVAL_REQUIREMENTS_MESSAGE,
  title = 'Approval blocked'
) {
  const modal = ensureTestDashboardApprovalWarningModal();
  const titleEl = modal.querySelector('.test-dashboard-complete-confirm-title');
  const messageEl = modal.querySelector('.test-dashboard-complete-confirm-message');
  modal.classList.toggle(
    'test-dashboard-completion-block-warning-modal',
    message === DASHBOARD_COMPLETION_BLOCK_MESSAGE
  );
  if (titleEl) titleEl.textContent = title;
  if (messageEl) messageEl.textContent = message;
  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open', 'test-dashboard-approval-warning-open');
  window.requestAnimationFrame(() => {
    modal.querySelector('[data-test-dashboard-approval-ok]')?.focus();
  });
}

function ensureTestDashboardApprovalWarningModal() {
  let modal = document.getElementById('test-dashboard-approval-warning-modal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'test-dashboard-approval-warning-modal';
  modal.className = 'test-dashboard-complete-confirm-modal test-dashboard-approval-warning-modal';
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `
    <div class="test-dashboard-complete-confirm-shell" role="dialog" aria-modal="true" aria-labelledby="test-dashboard-approval-warning-title">
      <div class="test-dashboard-complete-confirm-title" id="test-dashboard-approval-warning-title">Approval blocked</div>
      <div class="test-dashboard-complete-confirm-message">${escapeHtml(TEST_DASHBOARD_APPROVAL_REQUIREMENTS_MESSAGE)}</div>
      <div class="test-dashboard-complete-confirm-actions">
        <button class="test-dashboard-complete-confirm-button confirm" type="button" data-test-dashboard-approval-ok="true">Okay</button>
      </div>
    </div>
  `;
  modal.addEventListener('click', handleTestDashboardApprovalWarningClick);
  document.addEventListener('keydown', handleTestDashboardApprovalWarningKeydown);
  document.body.appendChild(modal);
  return modal;
}

function handleTestDashboardApprovalWarningClick(event) {
  const modal = document.getElementById('test-dashboard-approval-warning-modal');
  if (!modal || modal.hidden) return;
  if (event.target === modal || event.target.closest('[data-test-dashboard-approval-ok]')) {
    closeTestDashboardApprovalWarning();
  }
}

function handleTestDashboardApprovalWarningKeydown(event) {
  const modal = document.getElementById('test-dashboard-approval-warning-modal');
  if (!modal || modal.hidden || event.key !== 'Escape') return;
  event.preventDefault();
  closeTestDashboardApprovalWarning();
}

function closeTestDashboardApprovalWarning() {
  const modal = document.getElementById('test-dashboard-approval-warning-modal');
  if (modal) {
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    modal.classList.remove('test-dashboard-completion-block-warning-modal');
  }
  document.body.classList.remove('modal-open', 'test-dashboard-approval-warning-open');
}

function getStatusColumnEndpoint(itemId) {
  return ENDPOINTS.testStatusColumn(itemId);
}

async function saveTestDesignInput(input, entity, column) {
  if (!input || !entity?.id || !column?.id) return;
  const previousValue = normalizeCellText(input.dataset.originalValue || '');
  const nextValue = normalizeCellText(input.value || '');
  if (nextValue === previousValue) return;

  input.disabled = true;
  input.classList.add('saving');
  __testDesignEditInFlight += 1;
  try {
    const response = await fetch(ENDPOINTS.testDesignColumn(entity.id), {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        columnId: column.id,
        value: nextValue,
      }),
    });
    if (!response.ok) throw new Error(await readApiError(response));
    await loadTestBoard({ forceRefresh: true, allowDuringDesignEdit: true });
  } catch (err) {
    console.warn('DES/PSG update failed', err);
    input.value = previousValue;
    alert(`Failed to update ${column?.title || 'DES/PSG'}: ${err.message || 'Unknown error'}`);
  } finally {
    __testDesignEditInFlight = Math.max(0, __testDesignEditInFlight - 1);
    input.disabled = false;
    input.classList.remove('saving');
  }
}

async function saveTestTextInput(input, entity, column) {
  if (!input || !entity?.id || !column?.id) return;
  const previousValue = String(input.dataset.originalValue || '').trim();
  const nextValue = String(input.value || '').trim();
  if (nextValue === previousValue) return;

  input.disabled = true;
  input.classList.add('saving');
  __testTextEditInFlight += 1;
  try {
    const response = await fetch(ENDPOINTS.testTextColumn(entity.id), {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        columnId: column.id,
        value: nextValue,
      }),
    });
    if (!response.ok) throw new Error(await readApiError(response));
    await loadTestBoard({ forceRefresh: true, allowDuringDesignEdit: true });
  } catch (err) {
    console.warn('Text column update failed', err);
    input.value = previousValue;
    alert(`Failed to update ${column?.title || 'text'}: ${err.message || 'Unknown error'}`);
  } finally {
    __testTextEditInFlight = Math.max(0, __testTextEditInFlight - 1);
    input.disabled = false;
    input.classList.remove('saving');
  }
}

function isTestDesignColumn(column) {
  if (column?.type !== 'text') return false;
  const compact = normalizeColumnTitle(column?.title || '').replace(/[^A-Z0-9]/g, '');
  return compact === 'DESPSG' || compact === 'DESNOPSG';
}

function isTestEditableTextColumn(column) {
  if (!['text', 'long_text'].includes(column?.type)) return false;
  return normalizeColumnTitle(column?.title || '') === 'NOTES';
}

function isTestDesignEditActive() {
  return __testDesignEditInFlight > 0 ||
    Boolean(document.activeElement?.classList?.contains('test-design-input'));
}

function isTestTextEditActive() {
  return __testTextEditInFlight > 0 ||
    Boolean(document.activeElement?.classList?.contains('test-text-input'));
}

function isTestDashboardTextEditActive() {
  return isTestDesignEditActive() || isTestTextEditActive() || __testPrivateNameEditInFlight > 0 ||
    Boolean(document.activeElement?.classList?.contains('test-private-job-name-input'));
}

async function updateTestDashboardCheckbox(itemId, column, checked) {
  if (checked && isTestJobApprovalColumn(column)) {
    const readiness = getTestDashboardApprovalReadiness(itemId);
    if (readiness && !readiness.ok) {
      showTestDashboardApprovalWarning(readiness.message);
      return;
    }
  }

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
    const message = err.message || 'Unknown error';
    if (isTestDashboardReadinessMessage(message)) {
      showTestDashboardApprovalWarning(message);
    } else if (isTestApprovalRequirementsMessage(message)) {
      showTestDashboardApprovalWarning();
    } else {
      alert(`Failed to update ${column?.title || 'checkbox'}: ${message}`);
    }
  } finally {
    __statusUpdateInFlight = Math.max(0, __statusUpdateInFlight - 1);
  }
}

function getTestDashboardApprovalReadiness(itemId) {
  const payload = window.__latestTestBoardPayload;
  const board = unwrapFirstBoard(payload);
  const item = findBoardPayloadItem(payload, itemId);
  if (!board || !item) return null;

  if (item.dashboard_sampling?.blocked) {
    return { ok: false, message: TEST_DASHBOARD_SAMPLE_REQUIRED_MESSAGE };
  }

  const designColumn = findBoardColumnByIdOrCompactTitle(board, TEST_DASHBOARD_CLIENT_COLUMN_IDS.DESIGN, 'DESPSG');
  const proofColumn = findBoardColumnByIdOrCompactTitle(board, TEST_DASHBOARD_CLIENT_COLUMN_IDS.PROOF, 'PROOF');
  const designText = designColumn ? normalizeCellText(findColumnValue(item, designColumn.id)?.text || '') : '';
  const proofValue = proofColumn ? findColumnValue(item, proofColumn.id) : null;
  const proofFiles = getFileList(proofValue);
  const proofText = normalizeCellText(proofValue?.text || '');

  return {
    ok: Boolean(designText) && (proofFiles.length > 0 || Boolean(proofText)),
    hasDesign: Boolean(designText),
    hasProof: proofFiles.length > 0 || Boolean(proofText),
  };
}

function findBoardColumnByIdOrCompactTitle(board, columnId, compactTitle) {
  const wantedTitle = String(compactTitle || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  return (board?.columns || []).find((column) => {
    if (column?.id === columnId) return true;
    const title = normalizeColumnTitle(column?.title || '').replace(/[^A-Z0-9]/g, '');
    return title === wantedTitle;
  }) || null;
}

function isTestApprovalRequirementsMessage(message) {
  return String(message || '').toLowerCase().includes('design number') &&
    String(message || '').toLowerCase().includes('visual proof');
}

async function loadBoardForContext(context, options = {}) {
  return loadTestBoard(options);
}

function updateCachedBoardStatusValue(itemId, columnId, option, context = BOARD_CONTEXT_TEST) {
  const item = findBoardPayloadItem(window.__latestTestBoardPayload, itemId);
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
  if (
    context === BOARD_CONTEXT_TEST &&
    item.dashboard_split_job &&
    columnId === TEST_DASHBOARD_CLIENT_COLUMN_IDS.STATUS
  ) {
    item.dashboard_split_completed = !option.clear &&
      normalizeColumnTitle(option.label) === 'COMPLETED';
  }
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

function updateCachedBoardDateValue(itemId, columnId, date, context = BOARD_CONTEXT_TEST) {
  const item = findBoardPayloadItem(window.__latestTestBoardPayload, itemId);
  if (!item) return;

  let value = findColumnValue(item, columnId);
  if (!value) {
    value = { id: columnId, type: 'date', text: '', value: '' };
    if (!Array.isArray(item.column_values)) item.column_values = [];
    item.column_values.push(value);
  }
  value.text = date || '';
  value.type = 'date';
  value.value = date ? JSON.stringify({ date }) : JSON.stringify({});

  updateCachedTestPriorityFromDate(item, date);
}

function updateCachedTestPriorityFromDate(item, date) {
  const board = unwrapFirstBoard(window.__latestTestBoardPayload);
  const priorityColumn = findBoardColumnByIdOrCompactTitle(board, TEST_DASHBOARD_CLIENT_COLUMN_IDS.PRIORITY, 'PRIORITY');
  if (!priorityColumn?.id) return;
  const option = date
    ? getStatusOptions(priorityColumn).find(entry => normalizeStatusLabel(entry.label) === normalizeStatusLabel(priorityLabelForIsoDate(date)))
    : { clear: true, label: '', index: '' };
  if (!option) return;

  let value = findColumnValue(item, priorityColumn.id);
  if (!value) {
    value = { id: priorityColumn.id, type: 'status', text: '', value: '' };
    if (!Array.isArray(item.column_values)) item.column_values = [];
    item.column_values.push(value);
  }
  value.text = option.clear ? '' : option.label;
  value.type = 'status';
  value.value = option.clear ? JSON.stringify({}) : JSON.stringify({ index: normalizeStatusOptionIndex(option.index) });
}

function updateCachedPrivateJobName(itemId, name) {
  const item = findBoardPayloadItem(window.__latestTestBoardPayload, itemId);
  if (item) item.name = name || '';
}

function priorityLabelForIsoDate(isoDate) {
  const date = parseLocalDate(isoDate);
  if (!date) return 'Low';
  const days = getLocalDayDiff(new Date(), date);
  if (days <= 1) return 'Critical';
  if (days <= 3) return 'High';
  if (days <= 7) return 'Medium';
  return 'Low';
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

function renderCheckboxValue(cell, value, column, { entity = null, subitem = false, context = BOARD_CONTEXT_TEST } = {}) {
  const optimisticChecked = context === BOARD_CONTEXT_TEST && !subitem && entity?.id
    ? getTestCheckboxOptimisticValue(entity.id, column.id)
    : null;
  const checked = optimisticChecked === null ? isCheckedValue(value) : optimisticChecked;
  const editable = context === BOARD_CONTEXT_TEST && !subitem && entity?.id;
  const mark = document.createElement(editable ? 'button' : 'span');
  mark.className = 'dashboard-check-tick';
  mark.style.color = getCheckboxTickColor(column);
  mark.textContent = checked ? '✓' : '';

  if (editable) {
    mark.type = 'button';
    mark.classList.add('dashboard-check-button');
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

function isTestJobApprovalColumn(column) {
  const title = normalizeColumnTitle(column?.title || '');
  return column?.id === TEST_DASHBOARD_CLIENT_COLUMN_IDS.JOB || title.includes('JOB');
}

function getCheckboxTickColor(column) {
  const title = String(column?.title || '').toUpperCase();
  if (title.includes('JAQ')) return '#fdab3d';
  if (title.includes('JOB')) return '#00c875';
  if (title.includes('CHECK')) return '#579bfc';
  return '#579bfc';
}

function renderFileValue(cell, value, text, column) {
  const files = getFileList(value).map(normalizeDashboardFile).filter(Boolean);
  if (!files.length && text) {
    files.push({
      name: text || 'File',
      url: isLikelyFileUrl(text) ? text : '',
      mime: inferMimeTypeFromName(text)
    });
  }
  if (!files.length) return 0;
  cell.classList.add('dashboard-file-cell');
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
  return compact === 'VISUAL' ||
    compact === 'PROOF' ||
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
  link.className = 'dashboard-file-link';
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
  button.className = 'dashboard-file-link dashboard-proof-trigger';
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

function isTestDashboardVisualColumn(column) {
  if (!column) return false;
  if (String(column.id || '') === TEST_DASHBOARD_CLIENT_COLUMN_IDS.PROOF) return true;
  const compactTitle = normalizeColumnTitle(column.title || '').replace(/[^A-Z0-9]/g, '');
  return compactTitle === 'PROOF' || compactTitle === 'VISUAL';
}

function isAllowedTestDashboardVisualFile(file) {
  const filename = String(file?.name || '').trim();
  const extension = (filename.match(/\.([^.]+)$/)?.[1] || '').toLowerCase();
  if (!['pdf', 'jpg', 'jpeg', 'png'].includes(extension)) return false;

  const mime = String(file?.type || '').trim().toLowerCase();
  return !mime ||
    mime === 'application/octet-stream' ||
    mime === 'application/pdf' ||
    mime === 'image/jpeg' ||
    mime === 'image/png';
}

function getUnsupportedTestDashboardVisualFiles(column, files) {
  if (!isTestDashboardVisualColumn(column)) return [];
  return (Array.isArray(files) ? files : []).filter(file => !isAllowedTestDashboardVisualFile(file));
}

function showTestDashboardFileTypeWarning(files = []) {
  const modal = ensureTestDashboardFileTypeWarningModal();
  const names = (Array.isArray(files) ? files : [])
    .map(file => normalizeCellText(file?.name || ''))
    .filter(Boolean)
    .slice(0, 3);
  const message = modal.querySelector('.test-dashboard-complete-confirm-message');
  if (message) {
    message.textContent = names.length
      ? `${TEST_DASHBOARD_VISUAL_UPLOAD_ERROR} Unsupported: ${names.join(', ')}.`
      : TEST_DASHBOARD_VISUAL_UPLOAD_ERROR;
  }
  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open', 'test-dashboard-file-type-warning-open');
  window.requestAnimationFrame(() => {
    modal.querySelector('[data-test-dashboard-file-type-ok]')?.focus();
  });
}

function ensureTestDashboardFileTypeWarningModal() {
  let modal = document.getElementById('test-dashboard-file-type-warning-modal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'test-dashboard-file-type-warning-modal';
  modal.className = 'test-dashboard-complete-confirm-modal test-dashboard-file-type-warning-modal';
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `
    <div class="test-dashboard-complete-confirm-shell" role="dialog" aria-modal="true" aria-labelledby="test-dashboard-file-type-warning-title">
      <div class="test-dashboard-complete-confirm-title" id="test-dashboard-file-type-warning-title">Unsupported file type</div>
      <div class="test-dashboard-complete-confirm-message">${escapeHtml(TEST_DASHBOARD_VISUAL_UPLOAD_ERROR)}</div>
      <div class="test-dashboard-complete-confirm-actions">
        <button class="test-dashboard-complete-confirm-button confirm" type="button" data-test-dashboard-file-type-ok="true">Okay</button>
      </div>
    </div>
  `;
  modal.addEventListener('click', handleTestDashboardFileTypeWarningClick);
  document.addEventListener('keydown', handleTestDashboardFileTypeWarningKeydown);
  document.body.appendChild(modal);
  return modal;
}

function handleTestDashboardFileTypeWarningClick(event) {
  const modal = document.getElementById('test-dashboard-file-type-warning-modal');
  if (!modal || modal.hidden) return;
  if (event.target === modal || event.target.closest('[data-test-dashboard-file-type-ok]')) {
    closeTestDashboardFileTypeWarning();
  }
}

function handleTestDashboardFileTypeWarningKeydown(event) {
  const modal = document.getElementById('test-dashboard-file-type-warning-modal');
  if (!modal || modal.hidden || event.key !== 'Escape') return;
  event.preventDefault();
  closeTestDashboardFileTypeWarning();
}

function closeTestDashboardFileTypeWarning() {
  const modal = document.getElementById('test-dashboard-file-type-warning-modal');
  if (modal) {
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
  }
  document.body.classList.remove('modal-open', 'test-dashboard-file-type-warning-open');
}

function decorateTestFileDropCell(cell, entity, column, { hasFiles = false } = {}) {
  if (!cell || !entity?.id || !column?.id) return;
  const uploadKey = testFileUploadKey(entity.id, column.id);
  const uploading = __testFileUploadingCells.has(uploadKey);
  cell.classList.add('test-file-drop-target');
  cell.classList.toggle('uploading', uploading);
  cell.title = cell.title || `${hasFiles ? 'Drop another' : 'Drop or click to upload'} ${column.title || 'file'}`;
  renderTestFileUploadAffordance(cell, entity, column, { uploading, hasFiles });
  preserveTestFileCellScrollPosition(cell, uploadKey);
  cell.addEventListener('dragenter', handleTestFileDragEnter);
  cell.addEventListener('dragover', handleTestFileDragOver);
  cell.addEventListener('dragleave', handleTestFileDragLeave);
  cell.addEventListener('drop', (event) => handleTestFileDrop(event, entity, column, cell));
}

function preserveTestFileCellScrollPosition(cell, uploadKey) {
  if (!cell || !uploadKey) return;
  cell.addEventListener('scroll', () => {
    const scrollLeft = Number(cell.scrollLeft);
    if (Number.isFinite(scrollLeft)) {
      __testFileCellScrollPositions.set(uploadKey, Math.max(0, scrollLeft));
    }
  }, { passive: true });

  const savedScrollLeft = Number(__testFileCellScrollPositions.get(uploadKey));
  if (!Number.isFinite(savedScrollLeft) || savedScrollLeft <= 0) return;
  window.requestAnimationFrame(() => {
    if (!cell.isConnected) return;
    const maxScrollLeft = Math.max(0, cell.scrollWidth - cell.clientWidth);
    cell.scrollLeft = Math.min(savedScrollLeft, maxScrollLeft);
  });
}

function renderTestFileUploadAffordance(cell, entity, column, { uploading = false, hasFiles = false } = {}) {
  cell.classList.add('dashboard-file-cell');

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
  button.className = `test-file-upload-empty-button${hasFiles ? ' test-file-upload-add-button' : ''}`;
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
  input.accept = isTestDashboardVisualColumn(column) ? TEST_DASHBOARD_VISUAL_UPLOAD_ACCEPT : '';
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
  const unsupportedFiles = getUnsupportedTestDashboardVisualFiles(column, files);
  if (unsupportedFiles.length) {
    showTestDashboardFileTypeWarning(unsupportedFiles);
    return;
  }

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
    console.warn('Tuesday Dashboard file upload failed', err);
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
  } else if (target?.column?.id) {
    renderTestFileUploadAffordance(cell, { id: target.itemId }, target.column, {
      hasFiles: Boolean(cell.querySelector('.dashboard-file-link')),
    });
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
  if (signature.format) form.append('format', signature.format);

  const uploadResponse = await fetch(signature.uploadUrl, {
    method: 'POST',
    body: form
  });
  let uploadJson = null;
  try { uploadJson = await uploadResponse.json(); } catch {}
  if (!uploadResponse.ok) {
    throw new Error(formatCloudinaryUploadError(uploadJson?.error?.message, uploadResponse.status));
  }

  const originalFilename = file.name || uploadJson.original_filename || uploadJson.public_id || 'file';
  const normalizedUploadFile = normalizeDashboardFile({
    name: originalFilename,
    url: uploadJson.secure_url,
    public_url: uploadJson.secure_url,
    mime: inferMimeTypeFromName(originalFilename),
    format: uploadJson.format,
    resourceType: uploadJson.resource_type,
    resource_type: uploadJson.resource_type,
  });
  const secureUrl = isPdfFile(originalFilename, normalizedUploadFile?.mime)
    ? buildAssetSrc(normalizedUploadFile)
    : uploadJson.secure_url;
  const savedFormat = /\.pdf$/i.test(originalFilename) ? 'pdf' : uploadJson.format;

  const saveResponse = await fetch(ENDPOINTS.testFiles(itemId), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      columnId: column.id,
      publicId: uploadJson.public_id,
      secureUrl,
      resourceType: uploadJson.resource_type,
      format: savedFormat,
      originalFilename,
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
  const classes = ['dashboard-file-icon'];
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
        <div class="proof-modal-head-actions">
          <button class="proof-modal-download" id="proof-modal-download" type="button">Download</button>
          <button class="proof-modal-close" id="proof-modal-close" type="button" aria-label="Close proof">×</button>
        </div>
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
  modal.querySelector('#proof-modal-download').addEventListener('click', downloadCurrentProofFile);
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
  modal.querySelector('#proof-modal-body').addEventListener('touchstart', handleProofPreviewTouchStart, { passive: false });
  modal.querySelector('#proof-modal-body').addEventListener('touchmove', handleProofPreviewTouchMove, { passive: false });
  modal.querySelector('#proof-modal-body').addEventListener('touchend', handleProofPreviewTouchEnd, { passive: false });
  modal.querySelector('#proof-modal-body').addEventListener('touchcancel', handleProofPreviewTouchEnd, { passive: false });
  window.addEventListener('resize', handleProofModalViewportChange);
  document.addEventListener('keydown', handleProofModalKeydown);
  return modal;
}

function openProofModal(files, startIndex = 0, options = {}) {
  const normalized = (Array.isArray(files) ? files : [])
    .map(file => normalizeDashboardFile(file) || file)
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
    previewKind: '',
    pdfZoom: 1,
    pdfRotation: 0,
    pdfDrag: null,
    pdfPinch: null,
    pdfTouchPan: null,
    modalLabel,
    downloading: false,
    downloadPhase: '',
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
  __proofModalState.previewKind = '';
  __proofModalState.pdfDrag = null;
  __proofModalState.pdfPinch = null;
  __proofModalState.pdfTouchPan = null;
  __proofModalState.renderToken += 1;
  resetProofPdfBodyState();
  const anotherModalOpen = document.querySelector('.modal:not(.hidden)');
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
    download: document.getElementById('proof-modal-download'),
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

async function downloadCurrentProofFile() {
  const state = __proofModalState;
  if (state.downloading) return;

  const file = Array.isArray(state.files) ? state.files[state.fileIndex] : null;
  const src = buildAssetSrc(file);
  if (!file || !src) {
    window.alert('No download URL is available for this file.');
    return;
  }

  const filename = proofDownloadFilename(file);
  state.downloading = true;
  state.downloadPhase = typeof window.showSaveFilePicker === 'function' ? 'choosing' : 'downloading';
  updateProofPageControls();

  try {
    if (typeof window.showSaveFilePicker === 'function') {
      const fileHandle = await window.showSaveFilePicker({ suggestedName: filename });
      state.downloadPhase = 'downloading';
      updateProofPageControls();
      const blob = await fetchProofDownloadBlob(src);
      const writable = await fileHandle.createWritable();
      try {
        await writable.write(blob);
        await writable.close();
      } catch (err) {
        await writable.abort?.().catch(() => {});
        throw err;
      }
    } else {
      const blob = await fetchProofDownloadBlob(src);
      downloadProofBlobWithBrowser(blob, filename);
    }
  } catch (err) {
    if (err?.name !== 'AbortError') {
      console.error('Proof file download failed', err);
      window.alert(err?.message || 'Failed to download this file.');
    }
  } finally {
    state.downloading = false;
    state.downloadPhase = '';
    updateProofPageControls();
  }
}

function proofDownloadFilename(file) {
  const rawName = normalizeCellText(file?.name || '') || 'dashboard-file';
  const cleanName = rawName
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '')
    .slice(0, 180);
  return cleanName || 'dashboard-file';
}

async function fetchProofDownloadBlob(src) {
  let credentials = 'include';
  try {
    const url = new URL(src, window.location.href);
    if (url.origin !== window.location.origin) credentials = 'omit';
  } catch {}

  const response = await fetch(src, {
    credentials,
    cache: 'no-store'
  });
  if (!response.ok) throw new Error(`File download failed (${response.status})`);
  return response.blob();
}

function downloadProofBlobWithBrowser(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
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
  state.previewKind = '';
  state.pdfZoom = 1;
  state.pdfRotation = 0;
  state.pdfDrag = null;
  state.pdfPinch = null;
  state.pdfTouchPan = null;
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
    __proofModalState.previewKind = 'pdf';
    __proofModalState.pageCount = Math.max(1, pdf.numPages || 1);
    __proofModalState.pageNumber = 1;
    await renderProofPdfPage();
  } catch (err) {
    console.error('Proof PDF render failed', err);
    renderProofNativeViewer(file, token);
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
  __proofModalState.previewKind = 'image';
  const img = document.createElement('img');
  img.className = 'proof-modal-image';
  img.src = buildAssetSrc(file);
  img.alt = file.name || 'Proof image';
  const stage = document.createElement('div');
  stage.className = 'proof-image-stage';
  stage.appendChild(img);
  body.innerHTML = '';
  body.classList.add('proof-image-body');
  body.appendChild(stage);
  applyProofImageZoom(body);
  updateProofPdfPanState(body);
  updateProofPageControls();
}

function renderProofNativeViewer(file, token, note = '') {
  const { body } = getProofModalElements();
  if (!body || token !== __proofModalState.renderToken) return;
  resetProofPdfBodyState(body);
  __proofModalState.previewKind = 'native';
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
  __proofModalState.pdfPinch = null;
  __proofModalState.pdfTouchPan = null;
  if (!body) return;
  const stage = body.querySelector('.proof-pdf-stage, .proof-image-stage');
  if (stage) {
    stage.style.transform = '';
    stage.style.transformOrigin = '';
  }
  body.classList.remove(
    'proof-pdf-body',
    'proof-image-body',
    'proof-pdf-pan-enabled',
    'proof-pdf-dragging',
    'proof-preview-pinching'
  );
}

function updateProofPdfPanState(body = document.getElementById('proof-modal-body')) {
  if (!body) return;
  const enabled = isProofZoomablePreview() && normalizeProofPdfZoom(__proofModalState.pdfZoom) > 1;
  body.classList.toggle('proof-pdf-pan-enabled', enabled);
  if (!enabled) {
    __proofModalState.pdfDrag = null;
    __proofModalState.pdfTouchPan = null;
    body.classList.remove('proof-pdf-dragging');
  }
}

function isProofZoomablePreview() {
  return Boolean(__proofModalState.pdf || __proofModalState.previewKind === 'image');
}

function applyProofImageZoom(body = document.getElementById('proof-modal-body')) {
  if (!body || __proofModalState.previewKind !== 'image') return;
  const stage = body.querySelector('.proof-image-stage');
  if (!stage) return;
  const zoom = normalizeProofPdfZoom(__proofModalState.pdfZoom);
  stage.style.width = `${zoom * 100}%`;
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
  if (!isProofZoomablePreview()) return;
  const nextZoom = normalizeProofPdfZoom(normalizeProofPdfZoom(state.pdfZoom) + delta);
  if (nextZoom === normalizeProofPdfZoom(state.pdfZoom)) return;
  state.pdfZoom = nextZoom;
  state.pdfDrag = null;
  state.pdfTouchPan = null;
  if (state.previewKind === 'image') {
    const { body } = getProofModalElements();
    applyProofImageZoom(body);
    updateProofPdfPanState(body);
    updateProofPageControls(false);
    return;
  }
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
  if (!isProofZoomablePreview()) {
    updateProofPageControls();
    return;
  }
  if (state.previewKind === 'image') {
    applyProofImageZoom(body);
    updateProofPdfPanState(body);
    updateProofPageControls();
    return;
  }
  if (!isProofDesktopView() && state.pdfRotation !== 0) {
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
  if (!isProofZoomablePreview() || normalizeProofPdfZoom(state.pdfZoom) <= 1) return;
  if (event.pointerType === 'touch') return;
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

function handleProofPreviewTouchStart(event) {
  const state = __proofModalState;
  const { body } = getProofModalElements();
  if (!body || !isProofZoomablePreview()) return;

  if (event.touches.length >= 2) {
    const distance = getTouchDistance(event.touches);
    if (!distance) return;
    state.pdfTouchPan = null;
    state.pdfPinch = {
      startDistance: distance,
      startZoom: normalizeProofPdfZoom(state.pdfZoom),
      nextZoom: normalizeProofPdfZoom(state.pdfZoom)
    };
    body.classList.add('proof-preview-pinching');
    event.preventDefault();
    return;
  }

  if (event.touches.length === 1 && normalizeProofPdfZoom(state.pdfZoom) > 1) {
    const touch = event.touches[0];
    state.pdfTouchPan = {
      startX: touch.clientX,
      startY: touch.clientY,
      scrollLeft: body.scrollLeft,
      scrollTop: body.scrollTop
    };
    event.preventDefault();
  }
}

function handleProofPreviewTouchMove(event) {
  const state = __proofModalState;
  const { body } = getProofModalElements();
  if (!body || !isProofZoomablePreview()) return;

  if (state.pdfPinch && event.touches.length >= 2) {
    const distance = getTouchDistance(event.touches);
    if (!distance) return;
    const nextZoom = normalizeProofPdfZoom(
      state.pdfPinch.startZoom * (distance / state.pdfPinch.startDistance)
    );
    state.pdfPinch.nextZoom = nextZoom;
    const stage = getProofPreviewStage(body);
    if (stage) {
      const first = event.touches[0];
      const second = event.touches[1];
      const midpointX = (first.clientX + second.clientX) / 2;
      const midpointY = (first.clientY + second.clientY) / 2;
      const stageRect = stage.getBoundingClientRect();
      stage.style.transformOrigin = `${midpointX - stageRect.left}px ${midpointY - stageRect.top}px`;
      stage.style.transform = `scale(${nextZoom / state.pdfPinch.startZoom})`;
    }
    event.preventDefault();
    return;
  }

  if (state.pdfTouchPan && event.touches.length === 1) {
    const touch = event.touches[0];
    body.scrollLeft = state.pdfTouchPan.scrollLeft - (touch.clientX - state.pdfTouchPan.startX);
    body.scrollTop = state.pdfTouchPan.scrollTop - (touch.clientY - state.pdfTouchPan.startY);
    event.preventDefault();
  }
}

function handleProofPreviewTouchEnd(event) {
  const state = __proofModalState;
  const { body } = getProofModalElements();
  if (!body) return;

  if (state.pdfPinch && event.touches.length < 2) {
    const nextZoom = normalizeProofPdfZoom(state.pdfPinch.nextZoom);
    const changed = nextZoom !== normalizeProofPdfZoom(state.pdfZoom);
    const stage = getProofPreviewStage(body);
    if (stage) {
      stage.style.transform = '';
      stage.style.transformOrigin = '';
    }
    state.pdfPinch = null;
    state.pdfTouchPan = null;
    body.classList.remove('proof-preview-pinching');
    if (changed) {
      state.pdfZoom = nextZoom;
      if (state.previewKind === 'image') {
        applyProofImageZoom(body);
        updateProofPdfPanState(body);
        updateProofPageControls(false);
      } else if (state.pdf) {
        state.renderToken += 1;
        renderProofPdfPage().catch((err) => {
          console.error('Proof PDF pinch zoom render failed', err);
          updateProofPageControls(false);
        });
      }
    }
    event.preventDefault();
    return;
  }

  if (event.touches.length === 0) {
    state.pdfTouchPan = null;
  }
}

function getProofPreviewStage(body = document.getElementById('proof-modal-body')) {
  return body?.querySelector('.proof-pdf-stage, .proof-image-stage') || null;
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
    download,
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
  if (download) {
    download.disabled = state.downloading || !currentFile || !buildAssetSrc(currentFile);
    download.textContent = state.downloadPhase === 'choosing'
      ? 'Choose location…'
      : (state.downloadPhase === 'downloading' ? 'Downloading…' : 'Download');
  }
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
  pill.className = 'dashboard-person-pill';
  pill.textContent = text;
  cell.appendChild(pill);
}

function renderTextInputValue(cell, text) {
  if (!text) return;
  const span = document.createElement('span');
  span.className = 'dashboard-text-input';
  span.textContent = text;
  cell.appendChild(span);
}

function renderTestDesignInputValue(cell, text, entity, column) {
  const display = document.createElement('button');
  display.className = 'test-design-display';
  display.type = 'button';
  display.setAttribute('aria-label', text ? `Edit ${column?.title || 'DES/PSG'} ${text}` : `Set ${column?.title || 'DES/PSG'}`);
  renderColoredDesignText(display, text);

  const input = document.createElement('input');
  input.className = 'test-design-input';
  input.type = 'text';
  input.value = text || '';
  input.dataset.originalValue = text || '';
  input.setAttribute('aria-label', `Set ${column?.title || 'DES/PSG'}`);
  input.autocomplete = 'off';
  input.spellcheck = false;
  if (text) input.classList.add('hidden');

  display.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    display.classList.add('hidden');
    input.classList.remove('hidden');
    window.requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  });

  input.addEventListener('pointerdown', (event) => event.stopPropagation());
  input.addEventListener('click', (event) => event.stopPropagation());
  input.addEventListener('focus', () => {
    input.dataset.originalValue = normalizeCellText(input.value || '');
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      input.blur();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      input.value = input.dataset.originalValue || '';
      input.blur();
    }
  });
  input.addEventListener('blur', () => {
    saveTestDesignInput(input, entity, column).finally(() => {
      if (!input.isConnected || !display.isConnected) return;
      if (document.activeElement === input) return;
      input.classList.add('hidden');
      display.classList.remove('hidden');
    });
  });

  cell.classList.add('test-design-cell');
  if (text) cell.appendChild(display);
  cell.appendChild(input);
}

function renderTestTextInputValue(cell, text, entity, column) {
  const input = document.createElement('input');
  input.className = 'test-text-input';
  input.type = 'text';
  input.value = text || '';
  input.dataset.originalValue = text || '';
  input.setAttribute('aria-label', `Set ${column?.title || 'text'}`);
  input.autocomplete = 'off';
  input.spellcheck = true;
  if (column?.id === PRIVATE_DASHBOARD_TOTAL_COLUMN.id) {
    input.inputMode = 'numeric';
    input.spellcheck = false;
  }

  input.addEventListener('pointerdown', (event) => event.stopPropagation());
  input.addEventListener('click', (event) => event.stopPropagation());
  input.addEventListener('focus', () => {
    input.dataset.originalValue = String(input.value || '').trim();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      input.blur();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      input.value = input.dataset.originalValue || '';
      input.blur();
    }
  });
  input.addEventListener('blur', () => {
    saveTestTextInput(input, entity, column);
  });

  cell.classList.add('test-text-cell');
  cell.appendChild(input);
}

function renderColoredDesignText(container, text) {
  container.textContent = '';
  const value = normalizeCellText(text || '');
  if (!value) return;

  const segments = splitDesignDisplaySegments(value);
  for (const segment of segments) {
    const span = document.createElement('span');
    span.className = `test-design-segment ${segment.kind}`;
    span.textContent = segment.text;
    container.appendChild(span);
  }
}

function splitDesignDisplaySegments(value) {
  const segments = [];
  const slashParts = String(value || '').split(/(\s*\/\s*)/);

  for (const part of slashParts) {
    if (!part) continue;
    if (part.includes('/')) {
      segments.push({ kind: 'separator', text: part });
      continue;
    }

    const refs = part.split(/(,\s*)/);
    for (const ref of refs) {
      if (!ref) continue;
      if (/^,\s*$/.test(ref)) {
        segments.push({ kind: 'separator', text: ref });
        continue;
      }
      const trimmed = ref.trim();
      const kind = isPsgDisplayReference(trimmed) ? 'psg' : 'design';
      segments.push({ kind, text: ref });
    }
  }

  return segments;
}

function isPsgDisplayReference(value) {
  return /^(?:P\s*S\s*G|S\s*T)(?=[\s:._#/-]*\d)/i.test(String(value || '').trim());
}

function renderPlainTextValue(cell, text) {
  if (!text) return;
  const span = document.createElement('span');
  span.className = 'dashboard-plain-text';
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

function normalizeDashboardFile(file) {
  if (!file) return null;
  const name = file.name || file.fileName || 'File';
  const url = file.secure_url || file.url || file.public_url || file.publicUrl || '';
  return {
    ...file,
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
  const normalized = String(label || '').trim().toLowerCase();
  if (normalized === 'waiting approval' || normalized === 'awaiting approval') return 'awaiting approval';
  return normalized;
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
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const ukMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  let normalized = trimmed;
  if (ukMatch) {
    const year = ukMatch[3].length === 2 ? `20${ukMatch[3]}` : ukMatch[3];
    normalized = `${year}-${ukMatch[2].padStart(2, '0')}-${ukMatch[1].padStart(2, '0')}`;
  } else if (!isoMatch) {
    return trimmed;
  }
  const date = new Date(`${normalized}T00:00:00`);
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

function isTestPrivateItemId(value) {
  return /^private_[0-9a-f-]{36}$/i.test(String(value || '').trim());
}

// --------------------------- PRINT LABEL ---------------------------

function requestLabelQuantity(trigger) {
  if (__labelQuantityResolve) closeLabelQuantityModal(null);

  const modal = ensureLabelQuantityModal();
  const input = modal.querySelector('[data-label-quantity-input]');
  if (input) input.value = '1';
  __labelQuantityReturnFocus = trigger || document.activeElement;
  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open', 'label-quantity-open');

  window.requestAnimationFrame(() => {
    input?.focus();
  });

  return new Promise((resolve) => {
    __labelQuantityResolve = resolve;
  });
}

function ensureLabelQuantityModal() {
  let modal = document.getElementById('label-quantity-modal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'label-quantity-modal';
  modal.className = 'test-dashboard-complete-confirm-modal label-quantity-modal';
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `
    <form class="test-dashboard-complete-confirm-shell label-quantity-shell" data-label-quantity-form role="dialog" aria-modal="true" aria-labelledby="label-quantity-title">
      <div class="test-dashboard-complete-confirm-title" id="label-quantity-title">Print labels</div>
      <div class="label-quantity-body">
        <label for="label-quantity-input">How many labels?</label>
        <div class="label-quantity-control">
          <button type="button" data-label-quantity-decrement aria-label="Remove one label">−</button>
          <input id="label-quantity-input" data-label-quantity-input type="number" inputmode="numeric" min="1" max="99" step="1" value="1" required>
          <button type="button" data-label-quantity-increment aria-label="Add one label">+</button>
        </div>
        <div class="label-quantity-help">Labels will be numbered automatically. Keep Copies set to 1 in the print dialog.</div>
      </div>
      <div class="test-dashboard-complete-confirm-actions">
        <button class="test-dashboard-complete-confirm-button cancel" type="button" data-label-quantity-cancel>Cancel</button>
        <button class="test-dashboard-complete-confirm-button confirm" type="submit">Continue</button>
      </div>
    </form>
  `;
  modal.addEventListener('click', handleLabelQuantityClick);
  modal.querySelector('[data-label-quantity-form]')?.addEventListener('submit', handleLabelQuantitySubmit);
  document.addEventListener('keydown', handleLabelQuantityKeydown);
  document.body.appendChild(modal);
  return modal;
}

function readLabelQuantity(modal) {
  const input = modal?.querySelector('[data-label-quantity-input]');
  const quantity = Number(input?.value);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    input?.setCustomValidity('Enter a quantity from 1 to 99.');
    input?.reportValidity();
    return null;
  }
  input.setCustomValidity('');
  return quantity;
}

function changeLabelQuantity(modal, change) {
  const input = modal?.querySelector('[data-label-quantity-input]');
  if (!input) return;
  const current = Number.isInteger(Number(input.value)) ? Number(input.value) : 1;
  input.value = String(Math.min(99, Math.max(1, current + change)));
  input.setCustomValidity('');
  input.focus();
}

function handleLabelQuantityClick(event) {
  const modal = document.getElementById('label-quantity-modal');
  if (!modal || modal.hidden) return;
  if (event.target === modal || event.target.closest('[data-label-quantity-cancel]')) {
    closeLabelQuantityModal(null);
    return;
  }
  if (event.target.closest('[data-label-quantity-decrement]')) {
    changeLabelQuantity(modal, -1);
  } else if (event.target.closest('[data-label-quantity-increment]')) {
    changeLabelQuantity(modal, 1);
  }
}

function handleLabelQuantitySubmit(event) {
  event.preventDefault();
  const modal = document.getElementById('label-quantity-modal');
  const quantity = readLabelQuantity(modal);
  if (quantity !== null) closeLabelQuantityModal(quantity);
}

function handleLabelQuantityKeydown(event) {
  const modal = document.getElementById('label-quantity-modal');
  if (!modal || modal.hidden || event.key !== 'Escape') return;
  event.preventDefault();
  closeLabelQuantityModal(null);
}

function closeLabelQuantityModal(quantity) {
  const modal = document.getElementById('label-quantity-modal');
  if (modal) {
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
  }
  document.body.classList.remove('modal-open', 'label-quantity-open');

  const resolve = __labelQuantityResolve;
  const returnFocus = __labelQuantityReturnFocus;
  __labelQuantityResolve = null;
  __labelQuantityReturnFocus = null;
  if (resolve) resolve(quantity);
  if (returnFocus?.isConnected) {
    window.requestAnimationFrame(() => returnFocus.focus());
  }
}

async function printLabel(item, trigger) {
  const quantity = await requestLabelQuantity(trigger);
  if (!quantity) return;

  const itemId = item?.id;
  const parsed = parseTitle(item?.name || '');
  const orderNumber = normalizeCellText(item?.database_job?.order_no || parsed.orderNumber || '');
  const customerName = normalizeCellText(item?.database_job?.customer_name || parsed.customerName || '');
  const jobTitle = normalizeCellText(item?.database_job?.job_title || parsed.jobTitle || '');
  const buildLabelDocument = window.LabelLayout?.buildLabelDocument;
  if (typeof buildLabelDocument !== 'function') {
    alert('Label could not be printed: Label layout is unavailable');
    return;
  }

  let win = null;
  try { win = window.open('', '', 'width=480,height=760'); } catch {}
  if (!win || !win.document) {
    alert('Label could not be printed: Allow popups for this site and try again');
    return;
  }

  __statusUpdateInFlight += 1;
  try {
    const response = await fetch(ENDPOINTS.testLabelPrinted(itemId), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    if (!response.ok) throw new Error(await readApiError(response));
    await response.json();
    loadTestBoard({ forceRefresh: true });
  } catch (err) {
    try { win.close(); } catch {}
    alert(`Label could not be printed: ${err.message || 'Failed to prepare the label'}`);
    return;
  } finally {
    __statusUpdateInFlight = Math.max(0, __statusUpdateInFlight - 1);
  }
  const body = buildLabelDocument({ orderNumber, customerName, jobTitle }, { quantity });

  if (!win.closed && win.document) {
    win.document.open();
    win.document.write(body);
    win.document.close();
  }
}

// --------------------------- SERIAL UI (unchanged core) ---------------------------

function addSerialScannerUI() {
  const bar = document.getElementById('sidebarDashboardControls') || document.getElementById('labels-toolbar');
  let btn = document.getElementById('connectScannerBtn');

  // Connect Scanner button
  if (!isUltimatePackingUser()) {
    btn?.remove();
  } else if (!btn) {
    btn = document.createElement('button');
    btn.id = 'connectScannerBtn';
    btn.textContent = 'Connect Scanner';
    btn.className = 'btn success';
    btn.onclick = connectSerialScanner;
    if (bar) bar.appendChild(btn);
  } else if (bar && btn.parentElement !== bar) {
    bar.appendChild(btn);
  }

  const logoutBtn = document.getElementById('logoutButton');
  if (bar && btn?.parentElement === bar && logoutBtn?.parentElement === bar && btn.nextElementSibling !== logoutBtn) {
    bar.insertBefore(btn, logoutBtn);
  }

  document.getElementById('priorityHighlightBtn')?.remove();
  document.getElementById('scanPill')?.remove();
}

function isUltimatePackingUser(user = window.ultimateHubUser) {
  const fullName = String(
    user?.full_name || [user?.first_name, user?.last_name].filter(Boolean).join(' ')
  ).trim().replace(/\s+/g, ' ').toLowerCase();
  return fullName === ULTIMATE_PACKING_USER_NAME;
}

function refreshPackingControlVisibility() {
  addSerialScannerUI();
  rerenderBoardContext(BOARD_CONTEXT_TEST);
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
  let scanUrl = normalizeTestScanUrl(text);
  if (!scanUrl && /^\d+$/.test(text)) {
    try {
      const r = await fetch(ENDPOINTS.testScanUrl(text), { cache: 'no-store', credentials: 'include' });
      if (r.ok) {
        const j = await r.json();
        if (j && j.url) scanUrl = j.url;
      }
    } catch {}
  }
  if (!scanUrl) { updateScanPill('unrecognized code'); return; }
  await postScannerResult(scanUrl);
}

async function postScannerResult(scanText) {
  const endpoint = '/api/test-dashboard/scanner';
  try {
    const r2 = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ scan: scanText })
    });
    updateScanPill(r2.ok ? 'status: ok' : 'status: error');
    if (r2.ok) loadTestBoard({ forceRefresh: true });
  } catch (e) {
    console.warn(`POST ${endpoint} failed:`, e);
    updateScanPill('status: error');
  }
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
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      activateDashboardTab(tab.getAttribute("data-tab"));
    });
  });

  Promise.resolve(window.ultimateHubUserPromise).then((user) => {
    const dtfOnly = user?.access_scope === 'dtf_only';
    const initialTab = dtfOnly
      ? 'dtf-uploader'
      : (getExplicitDashboardTab() || getStoredDashboardTab() || 'test-dashboard');
    activateDashboardTab(initialTab);
  });
});

function activateDashboardTab(target) {
  if (!window.ultimateHubUser) return;
  const dtfOnly = window.ultimateHubUser?.access_scope === 'dtf_only';
  const fallbackTab = dtfOnly ? 'dtf-uploader' : 'test-dashboard';
  const requestedTab = !dtfOnly && isValidDashboardTab(target)
    ? target
    : (target === 'dtf-uploader' ? target : fallbackTab);
  const activeTab = document.getElementById(`tab-${requestedTab}`) ? requestedTab : 'test-dashboard';
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
  } else {
    closeTestDashboardMobileJobOverview({ restoreFocus: false });
  }
  closeMobileNav();
}

window.activateDashboardTab = activateDashboardTab;

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

function isPdfFile(name, mime) {
  const lowerMime = (mime || '').toLowerCase();
  if (lowerMime.includes('pdf')) return true;
  return /\.pdf(\?|$)/i.test(name || '');
}

function isCloudinaryDeliveryUrl(url) {
  return /^https?:\/\/res\.cloudinary\.com\//i.test(String(url || ''));
}

function buildCloudinaryPdfDeliveryUrl(url) {
  const source = String(url || '');
  if (!source) return '';

  const hashIndex = source.indexOf('#');
  const withoutHash = hashIndex >= 0 ? source.slice(0, hashIndex) : source;
  const hash = hashIndex >= 0 ? source.slice(hashIndex) : '';
  const queryIndex = withoutHash.indexOf('?');
  const path = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
  const query = queryIndex >= 0 ? withoutHash.slice(queryIndex) : '';
  const pdfPath = /\.[a-z0-9]{2,6}$/i.test(path)
    ? path.replace(/\.[a-z0-9]{2,6}$/i, '.pdf')
    : `${path}.pdf`;
  return `${pdfPath}${query}${hash}`;
}

function normalizePdfDeliveryUrl(file, url) {
  if (!url || !isPdfFile(file?.name, file?.mime)) return url || '';
  if (!isCloudinaryDeliveryUrl(url)) return url;
  if (/\.pdf(?:[?#]|$)/i.test(url)) return url;
  return buildCloudinaryPdfDeliveryUrl(url);
}

function buildAssetSrc(file, { stripPdfUi = false } = {}) {
  if (!file) return '';
  const url = normalizePdfDeliveryUrl(file, file.url || file.secure_url || file.public_url || '');
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
