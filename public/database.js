(function () {
  const PAGE_LIMIT = 100;
  const ALL_ORDERS_VISIBLE_BATCH_SIZE = PAGE_LIMIT;
  const BACKGROUND_LOAD_DELAY_MS = 50;
  const ORDER_SELECTOR_LIMIT = 500;
  const CUSTOMER_SEARCH_DELAY = 180;
  const PRODUCT_SEARCH_DELAY = 180;
  const DESIGN_AUTOSAVE_MS = 5000;
  const JOB_AUTOSAVE_MS = DESIGN_AUTOSAVE_MS;
  const CONTACT_AUTOSAVE_MS = DESIGN_AUTOSAVE_MS;
  const LINE_ORDER_AUTOSAVE_MS = 3500;
  const DATABASE_ROUTE_STORAGE_KEY = 'ultimateHub.databaseRoute.v1';
  const DATABASE_MOBILE_MEDIA = '(max-width: 720px), (max-width: 960px) and (max-height: 520px)';
  const DATABASE_PROOF_ZOOM_MIN = 0.75;
  const DATABASE_PROOF_ZOOM_MAX = 4;
  const DATABASE_PROOF_ZOOM_STEP = 0.25;
  const DATABASE_VISUAL_PAGE_LIMIT = 30;
  const DATABASE_VISUAL_SEARCH_DELAY = 260;
  const DATABASE_CUSTOMER_SORTS = new Set(['recent', 'active', 'az', 'za']);
  const DATABASE_STYLE_SORTS = new Set(['most-used', 'highest-price', 'lowest-price', 'az', 'za']);
  const DATABASE_REPORT_RANGES = new Set(['daily', 'weekly', 'monthly', 'yearly', 'mtd', 'ytd']);
  const DATABASE_REPORT_COMPARE_MODES = new Set(['month', 'year']);
  const DATABASE_RESTRICTED_HOME_USERS = new Set(['ultimate packing', 'lubos svorad']);
  const DATABASE_RESTRICTED_HOME_VIEWS = new Set(['reports', 'stock-ordering', 'to-invoice', 'users']);
  const DATABASE_REPORT_METRICS = Object.freeze({
    grossSales: Object.freeze({ label: 'Gross sales', subtitle: 'Net sales plus VAT', currency: true }),
    netSales: Object.freeze({ label: 'Net sales', subtitle: 'Sales before VAT', currency: true }),
    vat: Object.freeze({ label: 'VAT', subtitle: 'Invoice VAT', currency: true }),
    costOfGoods: Object.freeze({ label: 'Cost of goods', subtitle: 'Unit cost multiplied by quantity', currency: true }),
    grossProfit: Object.freeze({ label: 'Gross profit', subtitle: 'Net sales less cost of goods', currency: true }),
    orderCount: Object.freeze({ label: 'Orders', subtitle: 'Orders created in each period', currency: false }),
  });
  const DATABASE_REPORT_METRIC_KEYS = new Set(Object.keys(DATABASE_REPORT_METRICS));
  const DATABASE_RESTORABLE_VIEWS = new Set([
    'home',
    'reports',
    'outstanding',
    'customers',
    'customer',
    'order',
    'styles',
    'visuals',
    'to-invoice',
    'stock-ordering',
    'users',
    'dtf-admin',
    'new-order',
    'new-customer',
  ]);
  const DATABASE_ORDER_TABS = new Set(['details', 'items', 'design', 'proof']);
  const DATABASE_CUSTOMER_TABS = new Set(['orders', 'contacts', 'addresses', 'quotations', 'design-numbers']);
  const OUTSTANDING_TABLE_COLUMN_COUNT = 9;
  const OUTSTANDING_ALL_TABLE_COLUMN_COUNT = 10;
  const OUTSTANDING_INVOICE_COLUMN_WIDTH = 98;
  const TO_INVOICE_TABLE_COLUMN_COUNT = 7;
  const STYLE_TABLE_COLUMN_COUNT = 5;
  const STYLE_PAGE_LIMIT = 50;
  const STYLE_SEARCH_DELAY = 180;
  const OUTSTANDING_STATUS_COLUMN_WIDTH = 128;
  const OUTSTANDING_TAKEN_BY_COLUMN_MIN_WIDTH = 54;
  const OUTSTANDING_TAKEN_BY_CELL_EXTRA_WIDTH = 12;
  const OUTSTANDING_TABLE_FIXED_BASE_WIDTH = 19 + 68 + 198 + 36 + 88 + 82 + OUTSTANDING_STATUS_COLUMN_WIDTH;
  const STOCK_ORDERING_TABLE_COLUMN_COUNT = 9;
  const STOCK_ORDERED_STATUS_LABEL = 'STOCK ORDERED';
  const OUTSTANDING_TITLE_COLUMN_MIN_WIDTH = 170;
  const OUTSTANDING_TITLE_CELL_EXTRA_WIDTH = 12;
  const ORDER_ACK_LOGO_URL = 'https://res.cloudinary.com/dhlqooyuk/image/upload/v1781699668/ultimate_logo_imyxvr.png';
  const ORDER_ACK_FOOTER_URL = 'https://res.cloudinary.com/dhlqooyuk/image/upload/v1781779546/LETTERHEAD_INFO_pxmlak.png';
  const ORDER_ACK_NO_BANK_FOOTER_URL = 'https://res.cloudinary.com/dhlqooyuk/image/upload/v1781869078/LETTERHEAD_INFO_del_note_wcjsjt.png';
  const ORDER_APPROVED_ICON_URL = 'https://res.cloudinary.com/brandduk/image/upload/v1783668662/approved_tcqr9k.png';
  const ULTIMATE_VAT_NUMBER = '984 5655 65';
  const ORDER_ACK_FIRST_PAGE_CONTENT_MAX_MM = 96;
  const ORDER_ACK_CONTINUATION_PAGE_CONTENT_MAX_MM = 220;
  const ORDER_ACK_TABLE_TOP_MM = 6;
  const ORDER_ACK_TABLE_HEADER_MM = 5.5;
  const ORDER_ACK_EMPTY_ROW_MM = 12;
  const ORDER_ACK_GAP_ROW_MM = 3;
  const ORDER_ACK_ITEM_ROW_BASE_MM = 6.8;
  const ORDER_ACK_ITEM_ROW_EXTRA_LINE_MM = 3.4;
  const ORDER_ACK_ITEM_CHARS_PER_LINE = 48;
  const ORDER_ACK_PAGE_SPLIT_BUFFER_MM = 3;
  const ORDER_ACK_ROW_MEASURE_BUFFER_MM = 0.8;
  const ORDER_ACK_SUMMARY_MM = 22;
  const ORDER_ACK_COMMENTS_TOP_MM = 6;
  const ORDER_ACK_COMMENTS_BASE_MM = 11;
  const ORDER_ACK_COMMENTS_LINE_MM = 4.2;
  const ORDER_ACK_COMMENTS_CHARS_PER_LINE = 95;
  const ORDER_DOC_PAGE_CONTENT_MAX_MM = 140;
  const ORDER_DOC_TABLE_TOP_MM = 5;
  const ORDER_DOC_TABLE_HEADER_MM = 5.5;
  const ORDER_DOC_EMPTY_ROW_MM = 10;
  const ORDER_DOC_GAP_ROW_MM = 2.8;
  const ORDER_DOC_ITEM_ROW_BASE_MM = 5.8;
  const ORDER_DOC_ITEM_ROW_EXTRA_LINE_MM = 3;
  const ORDER_DOC_ITEM_CHARS_PER_LINE = 42;
  const ORDER_DOC_PAGE_SPLIT_BUFFER_MM = 4;
  const ORDER_DOC_ROW_MEASURE_BUFFER_MM = 0.8;
  const INVOICE_SUMMARY_MM = 32;
  const PRO_FORMA_SUMMARY_MM = 42;
  const OUTSTANDING_REPORT_PAGE_CONTENT_MAX_MM = 220;
  const OUTSTANDING_REPORT_GROUP_HEADER_MM = 7;
  const OUTSTANDING_REPORT_TABLE_HEADER_MM = 7;
  const OUTSTANDING_REPORT_ROW_BASE_MM = 6.2;
  const OUTSTANDING_REPORT_ROW_EXTRA_LINE_MM = 3.4;
  const OUTSTANDING_REPORT_TITLE_CHARS_PER_LINE = 36;
  const OUTSTANDING_REPORT_CUSTOMER_CHARS_PER_LINE = 31;
  const STOCK_ORDERING_REPORT_JOB_MM = 7.2;
  const STOCK_ORDERING_REPORT_ROW_BASE_MM = 5.8;
  const STOCK_ORDERING_REPORT_ROW_EXTRA_LINE_MM = 2.8;
  const STOCK_ORDERING_REPORT_DESCRIPTION_CHARS_PER_LINE = 54;
  const FINANCIAL_REPORT_ORDER_PAGE_CONTENT_MM = 185;
  const FINANCIAL_REPORT_ORDER_ROW_BASE_MM = 6;
  const FINANCIAL_REPORT_ORDER_ROW_EXTRA_LINE_MM = 3.1;
  const FINANCIAL_REPORT_ORDER_CUSTOMER_CHARS_PER_LINE = 24;
  const FINANCIAL_REPORT_ORDER_TITLE_CHARS_PER_LINE = 34;
  const ORDER_TYPE_OPTIONS = ['Business Gifts', 'Printing', 'Print + Emb', 'Embroidery'];
  const PAYMENT_TERM_OPTIONS = ['Account', 'COD', 'Pro Forma'];
  const NEW_ORDER_REQUIRED_FIELDS = [
    { name: 'customer_name', label: 'Customer' },
    { name: 'contact_name', label: 'Contact' },
    { name: 'order_type', label: 'Order type' },
    { name: 'job_title', label: 'Job title' },
    { name: 'order_date', label: 'Order date' },
    { name: 'delivery_date', label: 'Delivery date' },
    { name: 'delivery_method', label: 'Delivery method' },
    { name: 'payment_terms', label: 'Payment terms' },
    { name: 'order_taken_by', label: 'Order taken by' },
    { name: 'delivery_address', label: 'Delivery adds' },
    { name: 'invoice_address', label: 'Invoice adds' },
    { name: 'invoice_required', label: 'Invoice required' },
  ];
  const CHILD_PRODUCT_TITLE_PATTERN = /\b(kids?|children'?s?|childrens?|child|youth|junior|juniors?|boys?|girls?)\b/i;
  const CHILD_YOUTH_SIZE_PATTERN = /\bY(?:XS|S|M|L|XL|XXL)\b/i;
  const CHILD_AGE_RANGE_SIZE_PATTERN = /\b(?:[1-9]|1[0-8])\s*[-\u2010-\u2015]\s*(?:[1-9]|1[0-8])\b/;
  const CHILD_TODDLER_SIZE_PATTERN = /\b[2-5]T\b/i;
  const compareProductSizes = window.DatabaseProductSizeOrder?.compareSizes
    || ((left, right) => String(left || '').localeCompare(String(right || ''), undefined, { numeric: true }));
  const DATABASE_DOCUMENTS = {
    'order-ack': {
      toolbarTitle: 'Order acknowledgement',
      ariaLabel: 'Order acknowledgement PDF preview',
      filenameTitle: 'Order Acknowlegement',
    },
    invoice: {
      toolbarTitle: 'Invoice',
      ariaLabel: 'Invoice PDF preview',
      filenameTitle: 'Invoice',
    },
    'pro-forma': {
      toolbarTitle: 'Pro-forma invoice',
      ariaLabel: 'Pro-forma invoice PDF preview',
      filenameTitle: 'Pro-Forma Invoice',
    },
    'delivery-note': {
      toolbarTitle: 'Delivery note',
      ariaLabel: 'Delivery note PDF preview',
      filenameTitle: 'Delivery Note',
    },
    'outstanding-orders': {
      toolbarTitle: 'Outstanding orders',
      ariaLabel: 'Outstanding orders PDF preview',
      filenameTitle: 'Outstanding Orders',
    },
    'stock-ordering': {
      toolbarTitle: 'Stock ordering',
      ariaLabel: 'Stock ordering PDF preview',
      filenameTitle: 'Stock Ordering',
    },
    'financial-report': {
      toolbarTitle: 'Financial report',
      ariaLabel: 'Financial report PDF preview',
      filenameTitle: 'Financial Report',
    },
  };

  const state = {
    loadedHome: false,
    loadingOrders: false,
    orderMode: 'open',
    loadedOrderMode: '',
    outstandingJobs: [],
    outstandingTotal: 0,
    toInvoiceJobs: [],
    toInvoiceLoaded: false,
    toInvoiceLoading: false,
    stockOrderingJobs: [],
    stockOrderingLoaded: false,
    stockOrderingLoading: false,
    stockOrderingRalawiseSyncing: false,
    stockOrderingRalawiseAddingIds: new Set(),
    stockOrderingSelectedIds: new Set(),
    stockOrderingExpandedIds: new Set(),
    stockOrderingSnapshot: null,
    stockOrderingStatusSaving: false,
    stockOrderingStatusAppliedIds: new Set(),
    productStyles: [],
    productStylesLoaded: false,
    productStylesLoading: false,
    productStylesTotal: 0,
    productStylesHasMore: false,
    productStylesNextOffset: 0,
    loadedProductStyleQuery: '',
    loadedProductStyleSort: '',
    selectedStyleId: '',
    selectedStyleColourKeys: new Map(),
    productStyleQuery: '',
    productStyleSort: 'most-used',
    visuals: [],
    visualsQuery: '',
    visualsLoadedQuery: '',
    visualsLoading: false,
    visualsHasMore: true,
    visualsNextOffset: 0,
    visualsRequest: 0,
    visualsError: '',
    visualOpenJobs: [],
    visualOpenJobsLoaded: false,
    visualOpenJobsLoading: false,
    activeVisual: null,
    visualAttachSaving: false,
    visualAttachedJobIds: new Set(),
    orderLoadToken: 0,
    orderLoadComplete: false,
    orderSearchQuery: '',
    visibleOrderLimit: PAGE_LIMIT,
    loadingCustomers: false,
    loadedCustomers: false,
    loadedCustomerQuery: '',
    loadedCustomerSort: 'recent',
    databaseCustomers: [],
    databaseCustomerQuery: '',
    databaseCustomerSort: 'recent',
    activeGroup: 'all',
    activeSort: 'order',
    activeView: 'home',
    viewHistory: [],
    activeOrderTab: 'details',
    activeCustomerTab: 'orders',
    orderStatsCollapsed: true,
    newOrderSubmitting: false,
    newCustomerSubmitting: false,
    newContactSubmitting: false,
    selectedCustomer: null,
    newOrderCustomerDetail: null,
    customerResults: [],
    selectedCustomerDetail: null,
    orderCustomerDetail: null,
    selectedCustomerOverview: null,
    selectedCustomerPageOverview: null,
    selectedCustomerOrders: [],
    selectedCustomerContacts: [],
    selectedCustomerAddresses: [],
    selectedCustomerDesignNumbers: [],
    customerUsers: [],
    loadedCustomerUsers: false,
    registeredUsers: [],
    signupRequests: [],
    signupRequestSavingIds: new Set(),
    canManageUsers: false,
    usersLoaded: false,
    usersLoading: false,
    userDeleteTarget: null,
    userDeleteSaving: false,
    customerAccountManagerSaving: false,
    selectedJob: null,
    selectedLineItems: [],
    selectedPositions: [],
    selectedProofFiles: [],
    proofViewer: {
      fileIndex: 0,
      pageNumber: 1,
      pageCount: 1,
      pdf: null,
      pdfZoom: 1,
      pdfPinch: null,
      renderToken: 0,
    },
    lineDraft: null,
    productResults: [],
    productVariantCache: new Map(),
    productVariantLoading: new Map(),
    stockVariantSavingIds: new Set(),
    productSearchOpen: false,
    productSearchField: 'style',
    productSearchQuery: '',
    lineOrderDirty: false,
    lineOrderSaving: false,
    lineOrderSaveQueued: false,
    lineOrderPendingGroups: [],
    lineOrderLastSavedSignature: '[]',
    designDirty: false,
    designSaving: false,
    designSaveQueued: false,
    designLastSavedSignature: '[]',
    jobDirty: false,
    jobSaving: false,
    jobSaveQueued: false,
    jobLastSavedSignature: '{}',
    contactDirtyKeys: new Set(),
    contactSavingKeys: new Set(),
    contactSaveQueuedKeys: new Set(),
    contactLastSavedSignatures: {},
    contactDeleteTarget: null,
    contactDeleteSaving: false,
    customerAddressDirty: false,
    customerAddressSaving: false,
    customerAddressSaveQueued: false,
    customerAddressLastSavedSignature: '{}',
    customLineDraft: null,
    lineDeleteTarget: null,
    lineDeleteSaving: false,
    designDeleteTarget: null,
    designDeleteSaving: false,
    closeOrderTarget: null,
    closeOrderSaving: false,
    repeatOrderTarget: null,
    repeatOrderSaving: false,
    noInvoiceCloseTarget: null,
    noInvoiceCloseSaving: false,
    currentUser: null,
    activeDocumentType: 'order-ack',
    documentGeneratedAt: null,
    outstandingReportSnapshot: null,
    financialReportSnapshot: null,
    dashboardStatusColors: {},
    reportsRange: 'ytd',
    reportsMetric: 'grossSales',
    reportsYear: null,
    reportsMonth: '',
    reportsAvailableYears: [],
    reportsCompareMode: 'none',
    reportsCompareMonthA: '',
    reportsCompareMonthB: '',
    reportsCompareYearA: null,
    reportsCompareYearB: null,
    reportsComparisonData: null,
    reportsData: null,
    reportsLoading: false,
    reportsRequest: 0,
  };

  let els = {};
  let customerSearchTimer = 0;
  let databaseCustomerSearchTimer = 0;
  let productSearchTimer = 0;
  let productStyleSearchTimer = 0;
  let visualSearchTimer = 0;
  let customerSearchRequest = 0;
  let databaseCustomerRequest = 0;
  let productSearchRequest = 0;
  let productStylesRequest = 0;
  let designAutosaveTimer = 0;
  let jobAutosaveTimer = 0;
  let contactAutosaveTimer = 0;
  let customerAddressAutosaveTimer = 0;
  let lineOrderAutosaveTimer = 0;
  let orderSearchTimer = 0;
  let outstandingScrollFrame = 0;
  let productStylesScrollFrame = 0;
  let visualsScrollFrame = 0;
  let outstandingLayoutFrame = 0;
  let databaseProofResizeFrame = 0;
  let mobileTableLabelFrame = 0;
  let mobileTableObserver = null;
  let visualsIntersectionObserver = null;
  let visualModalOpener = null;
  let outstandingTitleMeasureCanvas = null;
  let lineItemMeasureCanvas = null;
  let lineDrag = null;
  let databaseRouteRestored = false;
  let restoringDatabaseRoute = false;
  const lineTextScrollAnimations = new WeakMap();

  document.addEventListener('DOMContentLoaded', initDatabaseHub);

  function initDatabaseHub() {
    els = {
      root: document.getElementById('db-legacy-app'),
      databaseTab: document.getElementById('tab-database'),
      stage: document.querySelector('#db-legacy-app .db-legacy-stage'),
      sideTab: document.querySelector('.nav-tabs li[data-tab="database"]'),
      homeButton: document.getElementById('db-home-button'),
      mainTabs: Array.from(document.querySelectorAll('.db-main-tab')),
      views: Array.from(document.querySelectorAll('#db-legacy-app .db-view')),
      homeCountPrinting: document.getElementById('db-count-printing'),
      homeCountEmbroidery: document.getElementById('db-count-embroidery'),
      homeCountGifts: document.getElementById('db-count-gifts'),
      reportsPeriod: document.getElementById('db-reports-period'),
      stockOrderingHomeButton: document.querySelector('[data-db-action="stock-ordering"]'),
      usersHomeButton: document.querySelector('[data-db-action="users"]'),
      reportsHomeButton: document.querySelector('[data-db-action="reports"]'),
      toInvoiceHomeButton: document.querySelector('[data-db-action="to-invoice"]'),
      reportsRangeButtons: Array.from(document.querySelectorAll('[data-db-report-range]')),
      reportsPeriodControl: document.getElementById('db-report-period-control'),
      reportsPeriodControlLabel: document.getElementById('db-report-period-control-label'),
      reportsYear: document.getElementById('db-report-year-select'),
      reportsCompareMonthWrap: document.getElementById('db-report-compare-months'),
      reportsCompareYearWrap: document.getElementById('db-report-compare-years'),
      reportsCompareMonthNameA: document.getElementById('db-report-compare-month-name-a'),
      reportsCompareMonthYearA: document.getElementById('db-report-compare-month-year-a'),
      reportsCompareMonthNameB: document.getElementById('db-report-compare-month-name-b'),
      reportsCompareMonthYearB: document.getElementById('db-report-compare-month-year-b'),
      reportsCompareYearA: document.getElementById('db-report-compare-year-a'),
      reportsCompareYearB: document.getElementById('db-report-compare-year-b'),
      reportsCompareClear: document.getElementById('db-report-compare-clear'),
      reportsChartLegend: document.getElementById('db-reports-chart-legend'),
      reportsChart: document.getElementById('db-reports-chart'),
      reportsChartState: document.getElementById('db-reports-chart-state'),
      reportsChartTitle: document.getElementById('db-reports-chart-title'),
      reportsChartSubtitle: document.getElementById('db-reports-chart-subtitle'),
      reportsChartTotal: document.getElementById('db-reports-chart-total'),
      reportsKpis: document.getElementById('db-reports-kpis'),
      reportsTopCustomer: document.getElementById('db-report-top-customer'),
      reportsCustomersBody: document.getElementById('db-report-customers-body'),
      reportsTypesBody: document.getElementById('db-report-types-body'),
      reportsStatus: document.getElementById('db-reports-status'),
      customersSearch: document.getElementById('db-customers-search'),
      customersSort: document.getElementById('db-customers-sort'),
      customersBody: document.getElementById('db-customers-body'),
      customerName: document.getElementById('db-customer-name'),
      customerCode: document.getElementById('db-customer-code'),
      customerAccountManager: document.getElementById('db-customer-account-manager'),
      customerHeaderStats: document.getElementById('db-customer-header-stats'),
      customerTabs: Array.from(document.querySelectorAll('.db-customer-tab')),
      customerPanels: Array.from(document.querySelectorAll('.db-customer-panel')),
      customerOrdersBody: document.getElementById('db-customer-orders-body'),
      customerContactsBody: document.getElementById('db-customer-contacts-body'),
      customerAddressesBody: document.getElementById('db-customer-addresses-body'),
      customerDesignNumbersBody: document.getElementById('db-customer-design-numbers-body'),
      outstandingFrame: document.querySelector('.db-outstanding-table-frame'),
      outstandingTable: document.getElementById('db-outstanding-table'),
      outstandingBody: document.getElementById('db-outstanding-body'),
      toInvoiceTable: document.getElementById('db-to-invoice-table'),
      toInvoiceBody: document.getElementById('db-to-invoice-body'),
      stockOrderingTable: document.getElementById('db-stock-ordering-table'),
      stockOrderingBody: document.getElementById('db-stock-ordering-body'),
      stockOrderingSummary: document.getElementById('db-stock-ordering-summary'),
      stockOrderingCreate: document.querySelector('[data-db-action="create-stock-ordering"]'),
      stylesSearch: document.getElementById('db-styles-search'),
      stylesSort: document.getElementById('db-styles-sort'),
      stylesSummary: document.getElementById('db-styles-summary'),
      stylesFrame: document.querySelector('.db-styles-table-frame'),
      stylesBody: document.getElementById('db-styles-body'),
      stylesDetailPanel: document.querySelector('.db-styles-detail-panel'),
      stylesSelectedTitle: document.getElementById('db-styles-selected-title'),
      stylesSelectedMeta: document.getElementById('db-styles-selected-meta'),
      stylesSelectedCost: document.getElementById('db-styles-selected-cost'),
      stylesPreview: document.getElementById('db-styles-preview'),
      stylesPreviewImage: document.getElementById('db-styles-preview-image'),
      stylesPreviewPlaceholder: document.getElementById('db-styles-preview-placeholder'),
      stylesImageModal: document.getElementById('db-styles-image-modal'),
      stylesImageModalImage: document.getElementById('db-styles-image-modal-image'),
      stylesImageModalClose: document.getElementById('db-styles-image-modal-close'),
      stylesColourLabel: document.getElementById('db-styles-colour-label'),
      stylesSizeLabel: document.getElementById('db-styles-size-label'),
      stylesSizes: document.getElementById('db-styles-sizes'),
      stylesColours: document.getElementById('db-styles-colours'),
      visualsSearch: document.getElementById('db-visuals-search'),
      visualsSummary: document.getElementById('db-visuals-summary'),
      visualsScroll: document.getElementById('db-visuals-scroll'),
      visualsGrid: document.getElementById('db-visuals-grid'),
      visualsStatus: document.getElementById('db-visuals-status'),
      visualsLoadMore: document.getElementById('db-visuals-load-more'),
      visualsSentinel: document.getElementById('db-visuals-sentinel'),
      visualModal: document.getElementById('db-visual-modal'),
      visualModalTitle: document.getElementById('db-visual-modal-title'),
      visualModalMeta: document.getElementById('db-visual-modal-meta'),
      visualModalViewer: document.getElementById('db-visual-modal-viewer'),
      visualModalJob: document.getElementById('db-visual-modal-job'),
      visualModalFeedback: document.getElementById('db-visual-modal-feedback'),
      visualModalClose: document.getElementById('db-visual-modal-close'),
      usersTable: document.getElementById('db-users-table'),
      usersBody: document.getElementById('db-users-body'),
      signupRequestsBody: document.getElementById('db-signup-requests-body'),
      orderSearch: document.getElementById('db-order-search'),
      selectOrder: document.getElementById('db-select-order'),
      footerTitle: document.getElementById('db-footer-title'),
      orderTitle: document.getElementById('db-order-job-title'),
      orderNumber: document.getElementById('db-order-number'),
      orderStatsDrawer: document.getElementById('db-order-stats-drawer'),
      orderStatsToggle: document.getElementById('db-order-stats-toggle'),
      orderHeaderStats: document.getElementById('db-order-header-stats'),
      headerJobSelect: document.getElementById('db-header-job-select'),
      headerOrderSelect: document.getElementById('db-header-order-select'),
      orderTabs: Array.from(document.querySelectorAll('.db-order-tab')),
      detailsPanel: document.getElementById('db-order-details-panel'),
      itemsPanel: document.getElementById('db-order-items-panel'),
      designPanel: document.getElementById('db-order-design-panel'),
      proofPanel: document.getElementById('db-order-proof-panel'),
      newOrderForm: document.getElementById('db-new-order-form'),
      newOrderAccept: document.getElementById('db-new-order-accept'),
      newOrderCancel: document.getElementById('db-new-order-cancel'),
      newOrderStatus: document.getElementById('db-new-order-status'),
      newCustomerInput: document.getElementById('db-new-customer'),
      newContactInput: document.getElementById('db-new-contact'),
      newCustomerResults: document.getElementById('db-new-customer-results'),
      newDeliveryAddress: document.getElementById('db-new-delivery-address'),
      newInvoiceAddress: document.getElementById('db-new-invoice-address'),
      newCustomerForm: document.getElementById('db-new-customer-form'),
      newCustomerAccept: document.getElementById('db-new-customer-accept'),
      newCustomerCancel: document.getElementById('db-new-customer-cancel'),
      newCustomerStatus: document.getElementById('db-new-customer-status'),
      newCustomerAccountManager: document.getElementById('db-new-customer-account-manager'),
      addContactForm: document.getElementById('db-add-contact-form'),
      addContactTitle: document.getElementById('db-add-contact-title'),
      addContactAccept: document.getElementById('db-add-contact-accept'),
      addContactCancel: document.getElementById('db-add-contact-cancel'),
      addContactStatus: document.getElementById('db-add-contact-status'),
    };

    if (!els.root) return;
    els.stage?.classList.add('db-view-home');
    setupDatabaseMobileTableLabels();

    els.root.addEventListener('click', handleRootClick);
    els.outstandingBody.addEventListener('click', handleOutstandingRowClick);
    els.outstandingBody.addEventListener('keydown', handleOutstandingRowKeydown);
    els.toInvoiceBody?.addEventListener('click', handleToInvoiceRowClick);
    els.toInvoiceBody?.addEventListener('keydown', handleToInvoiceRowKeydown);
    els.stockOrderingBody?.addEventListener('click', handleStockOrderingRowClick);
    els.stockOrderingBody?.addEventListener('keydown', handleStockOrderingRowKeydown);
    els.stockOrderingBody?.addEventListener('change', handleStockOrderingSelectChange);
    els.stylesBody?.addEventListener('click', handleProductStyleRowClick);
    els.stylesBody?.addEventListener('keydown', handleProductStyleRowKeydown);
    els.stylesSearch?.addEventListener('input', handleProductStyleSearchInput);
    els.stylesSort?.addEventListener('change', handleProductStyleSortChange);
    els.stylesFrame?.addEventListener('scroll', handleProductStylesScroll);
    els.stylesColours?.addEventListener('click', handleProductStyleColourClick);
    els.stylesPreview?.addEventListener('click', openProductStyleImageModal);
    els.stylesPreview?.addEventListener('keydown', handleProductStylePreviewKeydown);
    els.stylesPreviewImage?.addEventListener('load', handleProductStyleImageLoad);
    els.stylesPreviewImage?.addEventListener('error', handleProductStyleImageError);
    els.stylesImageModal?.addEventListener('click', handleProductStyleImageModalClick);
    els.stylesImageModalClose?.addEventListener('click', closeProductStyleImageModal);
    els.visualsSearch?.addEventListener('input', handleDatabaseVisualSearchInput);
    els.visualsScroll?.addEventListener('scroll', handleDatabaseVisualsScroll, { passive: true });
    els.visualsGrid?.addEventListener('error', handleDatabaseVisualThumbnailError, true);
    els.visualsLoadMore?.addEventListener('click', () => loadDatabaseVisuals({ append: true }));
    els.visualModal?.addEventListener('click', handleDatabaseVisualModalClick);
    els.visualModalClose?.addEventListener('click', closeDatabaseVisualModal);
    els.visualModalJob?.addEventListener('change', attachActiveDatabaseVisual);
    els.reportsYear?.addEventListener('change', handleReportYearChange);
    els.reportsCompareMonthNameA?.addEventListener('change', handleReportComparisonInputChange);
    els.reportsCompareMonthYearA?.addEventListener('change', handleReportComparisonInputChange);
    els.reportsCompareMonthNameB?.addEventListener('change', handleReportComparisonInputChange);
    els.reportsCompareMonthYearB?.addEventListener('change', handleReportComparisonInputChange);
    els.reportsCompareYearA?.addEventListener('change', handleReportComparisonInputChange);
    els.reportsCompareYearB?.addEventListener('change', handleReportComparisonInputChange);
    els.outstandingFrame?.addEventListener('scroll', handleOutstandingScroll);
    window.addEventListener('resize', scheduleOutstandingTableLayout);
    els.customersBody.addEventListener('click', handleDatabaseCustomerRowClick);
    els.customersBody.addEventListener('keydown', handleDatabaseCustomerRowKeydown);
    els.customerOrdersBody.addEventListener('click', handleCustomerOrderRowClick);
    els.customerOrdersBody.addEventListener('keydown', handleCustomerOrderRowKeydown);
    els.customerDesignNumbersBody?.addEventListener('click', handleCustomerOrderRowClick);
    els.customerDesignNumbersBody?.addEventListener('keydown', handleCustomerOrderRowKeydown);
    els.customerContactsBody.addEventListener('input', handleCustomerContactInput);
    els.customerContactsBody.addEventListener('focusout', handleCustomerContactFocusOut);
    els.customerAddressesBody.addEventListener('input', handleCustomerAddressInput);
    els.customerAddressesBody.addEventListener('focusout', handleCustomerAddressFocusOut);
    els.customersSearch.addEventListener('input', handleDatabaseCustomerSearchInput);
    els.customersSort?.addEventListener('change', handleDatabaseCustomerSortChange);
    els.customerAccountManager?.addEventListener('change', handleCustomerAccountManagerChange);
    els.orderSearch?.addEventListener('input', handleOrderSearchInput);
    els.selectOrder?.addEventListener('change', () => openSelectedOrder(els.selectOrder.value));
    els.headerJobSelect?.addEventListener('change', () => openSelectedOrder(els.headerJobSelect.value));
    els.headerOrderSelect?.addEventListener('change', () => openSelectedOrder(els.headerOrderSelect.value));
    els.orderTitle.addEventListener('input', handleJobTitleInput);
    els.orderTitle.addEventListener('blur', () => flushJobAutosave());
    els.newOrderForm.addEventListener('submit', submitNewOrder);
    els.newOrderForm.addEventListener('input', validateNewOrderForm);
    els.newOrderForm.addEventListener('change', validateNewOrderForm);
    els.newOrderCancel.addEventListener('click', showHome);
    els.newCustomerForm?.addEventListener('submit', submitNewCustomer);
    els.newCustomerForm?.addEventListener('input', validateNewCustomerForm);
    els.newCustomerForm?.addEventListener('change', validateNewCustomerForm);
    els.newCustomerCancel?.addEventListener('click', showCustomers);
    els.addContactForm?.addEventListener('submit', submitNewContact);
    els.addContactForm?.addEventListener('input', validateNewContactForm);
    els.addContactForm?.addEventListener('change', validateNewContactForm);
    els.addContactCancel?.addEventListener('click', cancelNewContact);
    els.newCustomerInput.addEventListener('input', handleNewCustomerInput);
    els.newCustomerInput.addEventListener('focus', showExistingCustomerResults);
    els.newCustomerInput.addEventListener('keydown', handleCustomerSearchKeydown);
    els.newCustomerResults.addEventListener('mousedown', (event) => event.preventDefault());
    els.newCustomerResults.addEventListener('click', handleCustomerResultClick);
    els.itemsPanel.addEventListener('input', handleLineDraftInput);
    els.itemsPanel.addEventListener('input', handleCustomLineDraftInput);
    els.itemsPanel.addEventListener('focusin', handleLineDraftFocus);
    els.itemsPanel.addEventListener('focusin', handleLineTextFocusIn);
    els.itemsPanel.addEventListener('keydown', handleLineDraftKeydown);
    els.itemsPanel.addEventListener('keydown', handleCustomLineDraftKeydown);
    els.itemsPanel.addEventListener('keydown', handleLineItemEditKeydown);
    els.itemsPanel.addEventListener('focusout', handleLineDraftFocusOut);
    els.itemsPanel.addEventListener('focusout', handleCustomLineDraftFocusOut);
    els.itemsPanel.addEventListener('focusout', handleLineItemEditFocusOut);
    els.itemsPanel.addEventListener('change', handleLineDraftChange);
    els.itemsPanel.addEventListener('change', handleStockVariantChange);
    els.itemsPanel.addEventListener('mousedown', handleLineDraftMouseDown);
    els.itemsPanel.addEventListener('pointerdown', handleLineDragPointerDown);
    els.itemsPanel.addEventListener('pointerover', handleLineTextHoverIn);
    els.itemsPanel.addEventListener('pointerout', handleLineTextHoverOut);
    els.detailsPanel.addEventListener('input', handleDetailsPanelInput);
    els.detailsPanel.addEventListener('change', handleDetailsPanelChange);
    els.detailsPanel.addEventListener('focusout', handleDetailsPanelFocusOut);
    els.designPanel.addEventListener('input', handleDesignInput);
    els.designPanel.addEventListener('focusout', handleDesignFocusOut);
    els.designPanel.addEventListener('pointerdown', handleLineDragPointerDown);
    els.proofPanel?.addEventListener('touchstart', handleDatabaseProofTouchStart, { passive: false });
    els.proofPanel?.addEventListener('touchmove', handleDatabaseProofTouchMove, { passive: false });
    els.proofPanel?.addEventListener('touchend', handleDatabaseProofTouchEnd, { passive: false });
    els.proofPanel?.addEventListener('touchcancel', handleDatabaseProofTouchEnd, { passive: false });
    document.addEventListener('pointermove', handleLineDragPointerMove);
    document.addEventListener('pointerup', handleLineDragPointerUp);
    document.addEventListener('pointercancel', handleLineDragPointerUp);
    document.addEventListener('keydown', handleOrderAckKeydown);
    window.addEventListener('scroll', handleDatabasePageScroll, { passive: true });
    window.addEventListener('resize', handleDatabaseViewportResize);
    window.addEventListener('pagehide', () => flushOrderAutosaves({ keepalive: true }));
    window.addEventListener('beforeunload', () => flushOrderAutosaves({ keepalive: true }));
    document.querySelectorAll('.nav-tabs li').forEach((tab) => {
      tab.addEventListener('click', () => {
        if (tab.dataset.tab !== 'database') flushOrderAutosaves();
      }, { capture: true });
    });
    document.addEventListener('click', handleDocumentClick);

    document.querySelectorAll('input[name="db-sort"]').forEach((input) => {
      input.addEventListener('change', () => {
        state.activeSort = input.value;
        resetVisibleOrderLimit();
        renderOutstandingOrders();
      });
    });

    if (els.sideTab) {
      els.sideTab.addEventListener('click', () => {
        if (!window.ultimateHubUser || window.ultimateHubUser.access_scope === 'dtf_only') return;
        if (!state.loadedHome) loadHomeMetrics();
        restoreDatabaseRouteOnce();
      });
    }
    window.ultimateHubOpenDatabaseOrder = openDatabaseOrderFromDashboard;
    document.addEventListener('ultimatehub:user', (event) => setCurrentUser(event.detail));
    if (window.ultimateHubUser) setCurrentUser(window.ultimateHubUser);
    window.ultimateHubUserPromise?.then((currentUser) => {
      if (!currentUser) return;
      setCurrentUser(currentUser);
      if (currentUser.access_scope === 'dtf_only') return;
      const params = new URLSearchParams(window.location.search);
      if ((params.get('tab') === 'database' || window.location.hash === '#database') && !isDatabaseTopLevelActive()) {
        els.sideTab?.click();
      }
      if (isDatabaseTopLevelActive()) {
        if (!state.loadedHome) loadHomeMetrics();
        restoreDatabaseRouteOnce();
      }
    });
  }

  function setupDatabaseMobileTableLabels() {
    syncDatabaseMobileTableLabels();
    if (!els.root || typeof MutationObserver !== 'function') return;
    mobileTableObserver?.disconnect();
    mobileTableObserver = new MutationObserver(scheduleDatabaseMobileTableLabels);
    mobileTableObserver.observe(els.root, { childList: true, subtree: true });
  }

  function scheduleDatabaseMobileTableLabels() {
    if (mobileTableLabelFrame) return;
    mobileTableLabelFrame = window.requestAnimationFrame(() => {
      mobileTableLabelFrame = 0;
      syncDatabaseMobileTableLabels();
    });
  }

  function syncDatabaseMobileTableLabels() {
    els.root?.querySelectorAll('table.db-mobile-card-table').forEach((table) => {
      const labels = Array.from(table.querySelectorAll(':scope > thead > tr > th')).map((header) => (
        String(header.textContent || '').replace(/:\s*$/, '').trim()
      ));
      table.querySelectorAll(':scope > tbody > tr:not([data-mobile-label-ready])').forEach((row) => {
        Array.from(row.children).forEach((cell, index) => {
          if (cell.tagName !== 'TD') return;
          if (Number.parseInt(cell.getAttribute('colspan'), 10) > 1) {
            cell.removeAttribute('data-mobile-label');
            return;
          }
          const label = labels[index] || '';
          if (label) cell.dataset.mobileLabel = label;
          else cell.removeAttribute('data-mobile-label');
        });
        row.dataset.mobileLabelReady = 'true';
      });
    });
  }

  function isDatabaseMobileLayout() {
    return window.matchMedia?.(DATABASE_MOBILE_MEDIA).matches === true;
  }

  function handleDatabasePageScroll() {
    if (!isDatabaseMobileLayout() || !isDatabaseTopLevelActive()) return;
    if (state.activeView === 'outstanding') handleOutstandingScroll();
    if (state.activeView === 'styles') handleProductStylesScroll();
    if (state.activeView === 'visuals') handleDatabaseVisualsScroll();
  }

  function handleDatabaseViewportResize() {
    fitDatabaseDocumentPreviewToViewport();
    if (databaseProofResizeFrame) window.cancelAnimationFrame(databaseProofResizeFrame);
    databaseProofResizeFrame = window.requestAnimationFrame(() => {
      databaseProofResizeFrame = 0;
      if (!state.proofViewer?.pdf || !els.proofPanel?.classList.contains('active')) return;
      state.proofViewer.pdfPinch = null;
      state.proofViewer.renderToken += 1;
      renderDatabaseProofPdfPage().catch((err) => {
        console.error('Database proof resize render failed', err);
        updateDatabaseProofControls(false);
      });
    });
  }

  async function handleRootClick(event) {
    const button = event.target.closest('button');
    if (!button || !els.root.contains(button) || button.disabled) return;

    const productIndex = button.dataset.dbProductIndex;
    if (productIndex !== undefined) {
      const product = state.productResults[Number.parseInt(productIndex, 10)];
      if (product) await selectProductResult(product);
      return;
    }

    const lineAction = button.dataset.dbLineAction;
    if (lineAction === 'add') {
      startLineDraft();
      return;
    }
    if (lineAction === 'save') {
      await saveLineDraft();
      return;
    }
    if (lineAction === 'cancel') {
      cancelLineDraft();
      return;
    }

    const deleteLineId = button.dataset.dbLineDelete;
    if (deleteLineId) {
      openLineDeleteConfirmation(deleteLineId);
      return;
    }

    const deleteDesignKey = button.dataset.dbDesignDelete;
    if (deleteDesignKey) {
      openDesignDeleteConfirmation(deleteDesignKey);
      return;
    }

    const deleteContactKey = button.dataset.dbContactDelete;
    if (deleteContactKey) {
      openContactDeleteConfirmation(deleteContactKey);
      return;
    }

    const deleteUserId = button.dataset.dbUserRemove;
    if (deleteUserId) {
      openUserDeleteConfirmation(deleteUserId);
      return;
    }

    const signupRequestId = button.dataset.dbSignupRequest;
    const signupDecision = button.dataset.dbSignupDecision;
    if (signupRequestId && (signupDecision === 'accept' || signupDecision === 'reject')) {
      await reviewSignupRequest(signupRequestId, signupDecision, button.dataset.dbSignupAccess);
      return;
    }

    const stockToggleId = button.dataset.dbStockToggle;
    if (stockToggleId) {
      toggleStockOrderingDetails(stockToggleId);
      return;
    }

    const stockRalawiseId = button.dataset.dbStockRalawise;
    if (stockRalawiseId) {
      await addStockOrderingJobToRalawise(stockRalawiseId);
      return;
    }

    if (button.dataset.dbOrderStatsToggle !== undefined) {
      toggleOrderStatsDrawer();
      return;
    }

    const visualId = button.dataset.dbVisualOpen;
    if (visualId) {
      openDatabaseVisualModal(visualId, button);
      return;
    }

    const reportRange = button.dataset.dbReportRange;
    if (reportRange && DATABASE_REPORT_RANGES.has(reportRange)) {
      state.reportsRange = reportRange;
      if (reportRange === 'monthly') {
        const month = normalizeDatabaseReportMonth(state.reportsMonth) || currentDatabaseReportMonth();
        const year = normalizeDatabaseReportYear(state.reportsYear) || currentDatabaseReportYear();
        state.reportsMonth = `${year}-${month.slice(5, 7)}`;
      }
      state.reportsCompareMode = 'none';
      state.reportsComparisonData = null;
      syncReportRangeButtons();
      syncReportComparisonControls();
      persistDatabaseRoute();
      await loadDatabaseReports();
      return;
    }

    const reportCompareMode = button.dataset.dbReportCompareMode;
    if (reportCompareMode && DATABASE_REPORT_COMPARE_MODES.has(reportCompareMode)) {
      await activateReportComparison(reportCompareMode);
      return;
    }

    const reportMetric = button.dataset.dbReportMetric;
    if (reportMetric && DATABASE_REPORT_METRIC_KEYS.has(reportMetric)) {
      state.reportsMetric = reportMetric;
      persistDatabaseRoute();
      if (state.reportsData) renderDatabaseReports(state.reportsData);
      return;
    }

    if (button.dataset.dbNoInvoiceClose) {
      await flushOrderAutosaves();
      openNoInvoiceCloseConfirmation();
      return;
    }

    if (button.dataset.dbCloseOrder) {
      await flushOrderAutosaves();
      openCloseOrderConfirmation();
      return;
    }

    const customLineAction = button.dataset.dbCustomLineAction;
    if (customLineAction) {
      const lineType = button.dataset.dbLineType;
      if (customLineAction === 'add') {
        startCustomLineDraft(lineType);
        return;
      }
      if (customLineAction === 'save') {
        await saveCustomLineDraft();
        return;
      }
      if (customLineAction === 'cancel') {
        cancelCustomLineDraft();
        return;
      }
    }

    if (button.id === 'db-home-button') {
      await flushOrderAutosaves();
      goBackDatabaseView();
      return;
    }

    const proofZoomDelta = button.dataset.dbProofZoom;
    if (proofZoomDelta !== undefined) {
      changeDatabaseProofZoom(Number.parseFloat(proofZoomDelta));
      return;
    }

    if (button.dataset.dbProofFit !== undefined) {
      setDatabaseProofZoom(1);
      return;
    }

    const proofFileDelta = button.dataset.dbProofFile;
    if (proofFileDelta !== undefined) {
      changeDatabaseProofFile(Number.parseInt(proofFileDelta, 10));
      return;
    }

    const proofPageDelta = button.dataset.dbProofPage;
    if (proofPageDelta !== undefined) {
      changeDatabaseProofPage(Number.parseInt(proofPageDelta, 10));
      return;
    }

    const customerKey = button.dataset.dbCustomerOpen;
    if (customerKey) {
      await flushOrderAutosaves();
      openCustomer(customerKey, 'orders');
      return;
    }

    const customerTab = button.dataset.dbCustomerTab;
    if (customerTab) {
      await flushOrderAutosaves();
      showCustomerTab(customerTab);
      return;
    }

    const go = button.dataset.dbGo;
    if (go === 'home') {
      await flushOrderAutosaves();
      showHome();
      return;
    }
    if (go === 'outstanding') {
      await flushOrderAutosaves();
      openOutstandingOrders('open');
      return;
    }

    const action = button.dataset.dbAction;
    if (action === 'new-order') {
      await flushOrderAutosaves();
      showNewOrder();
      return;
    }
    if (action === 'new-customer') {
      await flushOrderAutosaves();
      showNewCustomer();
      return;
    }
    if (action === 'add-contact') {
      await flushOrderAutosaves();
      showNewContact();
      return;
    }
    if (action === 'open-orders') {
      await flushOrderAutosaves();
      openOutstandingOrders('open');
      return;
    }
    if (action === 'all-orders') {
      await flushOrderAutosaves();
      openOutstandingOrders('all');
      return;
    }
    if (action === 'customers') {
      await flushOrderAutosaves();
      showCustomers();
      return;
    }
    if (action === 'styles') {
      await flushOrderAutosaves();
      showStyles();
      return;
    }
    if (action === 'visuals') {
      await flushOrderAutosaves();
      showVisuals();
      return;
    }
    if (action === 'reports') {
      await flushOrderAutosaves();
      showReports();
      return;
    }
    if (action === 'download-financial-report') {
      await flushOrderAutosaves();
      await openFinancialReportDocument();
      return;
    }
    if (action === 'clear-report-comparison') {
      await clearReportComparison();
      return;
    }
    if (action === 'users') {
      await flushOrderAutosaves();
      showUsers();
      return;
    }
    if (action === 'dtf-admin') {
      await flushOrderAutosaves();
      showDtfAdmin();
      return;
    }
    if (action === 'stock-ordering') {
      await flushOrderAutosaves();
      showStockOrdering();
      return;
    }
    if (action === 'create-stock-ordering') {
      await flushOrderAutosaves();
      openStockOrderingDocument();
      return;
    }
    if (action === 'to-invoice') {
      await flushOrderAutosaves();
      showToInvoice();
      return;
    }
    if (action === 'print-outstanding') {
      await flushOrderAutosaves();
      openOutstandingReportDocument();
      return;
    }

    const documentType = button.dataset.dbDocument || (button.dataset.dbOrderAck ? 'order-ack' : '');
    if (documentType) {
      await flushOrderAutosaves();
      await openDatabaseDocument(documentType);
      return;
    }

    const group = button.dataset.dbGroup;
    if (group) {
      state.activeGroup = group;
      syncOutstandingFilterButtons();
      resetVisibleOrderLimit();
      if (group === 'all' && state.orderMode !== 'open') {
        state.orderMode = 'open';
        setFooterTitle('Open Orders');
        syncOrderSearchVisibility();
        persistDatabaseRoute();
        loadOutstandingOrders({ force: false });
        return;
      }
      renderOutstandingOrders();
      persistDatabaseRoute();
      return;
    }

    const orderTab = button.dataset.dbOrderTab;
    if (orderTab) {
      if (state.activeOrderTab === 'design' && orderTab !== 'design') {
        await flushOrderAutosaves();
      }
      showOrderTab(orderTab);
    }
  }

  async function handleOutstandingRowClick(event) {
    const invoiceButton = event.target.closest('[data-db-invoice-job]');
    if (invoiceButton) {
      await openInvoiceFromOrderList(invoiceButton.dataset.dbInvoiceJob);
      return;
    }

    const row = event.target.closest('tr[data-job-id]');
    if (!row) return;
    await flushOrderAutosaves();
    openOrder(row.dataset.jobId, 'details');
  }

  async function handleOutstandingRowKeydown(event) {
    if (event.key !== 'Enter') return;
    if (event.target.closest('[data-db-invoice-job]')) return;
    const row = event.target.closest('tr[data-job-id]');
    if (!row) return;
    await flushOrderAutosaves();
    openOrder(row.dataset.jobId, 'details');
  }

  async function openInvoiceFromOrderList(jobId) {
    const sourceOrderId = Number.parseInt(jobId, 10);
    if (!Number.isFinite(sourceOrderId)) return;
    await flushOrderAutosaves();
    try {
      const job = await loadOrderForDocument(sourceOrderId);
      if (Number(job?.source_order_id) !== sourceOrderId || !job?.invoice_no) return;
      await openDatabaseDocument('invoice', { skipInvoiceMark: true });
    } catch (err) {
      alert(err.message || 'Failed to load invoice');
    }
  }

  async function handleToInvoiceRowClick(event) {
    const row = event.target.closest('tr[data-job-id]');
    if (!row) return;
    await flushOrderAutosaves();
    openOrder(row.dataset.jobId, 'details');
  }

  async function handleToInvoiceRowKeydown(event) {
    if (event.key !== 'Enter') return;
    const row = event.target.closest('tr[data-job-id]');
    if (!row) return;
    await flushOrderAutosaves();
    openOrder(row.dataset.jobId, 'details');
  }

  function handleOutstandingScroll() {
    if (outstandingScrollFrame) return;
    outstandingScrollFrame = window.requestAnimationFrame(() => {
      outstandingScrollFrame = 0;
      maybeExtendVisibleOrders();
    });
  }

  function maybeExtendVisibleOrders() {
    if (state.orderMode !== 'all' || !els.outstandingFrame) return;

    const distanceFromBottom = isDatabaseMobileLayout()
      ? els.outstandingFrame.getBoundingClientRect().bottom - window.innerHeight
      : els.outstandingFrame.scrollHeight
        - els.outstandingFrame.scrollTop
        - els.outstandingFrame.clientHeight;
    if (distanceFromBottom > 140) return;

    const nextLimit = Math.min(
      state.visibleOrderLimit + ALL_ORDERS_VISIBLE_BATCH_SIZE,
      state.outstandingJobs.length
    );
    if (nextLimit <= state.visibleOrderLimit) return;

    state.visibleOrderLimit = nextLimit;
    renderOutstandingOrders({ hydrateSelectors: false, preserveScroll: true });
  }

  function resetVisibleOrderLimit() {
    if (state.orderMode === 'all') state.visibleOrderLimit = PAGE_LIMIT;
  }

  function syncOutstandingFilterButtons() {
    document.querySelectorAll('[data-db-group]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.dbGroup === state.activeGroup);
    });
  }

  function isDatabaseTopLevelActive() {
    return document.getElementById('tab-database')?.classList.contains('active') === true;
  }

  function restoreDatabaseRouteOnce() {
    if (databaseRouteRestored) return;
    databaseRouteRestored = true;
    restoreDatabaseRoute();
  }

  async function restoreDatabaseRoute() {
    const route = readStoredDatabaseRoute();
    if (!route?.view || !DATABASE_RESTORABLE_VIEWS.has(route.view)) {
      persistDatabaseRoute({ force: true });
      return;
    }

    restoringDatabaseRoute = true;
    try {
      await applyStoredDatabaseRoute(route);
    } catch (err) {
      console.warn('Failed to restore DATABASE route', err);
      showHome({ skipHistory: true, skipPersistence: true });
    } finally {
      restoringDatabaseRoute = false;
      persistDatabaseRoute({ force: true });
    }
  }

  async function applyStoredDatabaseRoute(route) {
    state.viewHistory = [];

    if (route.view === 'order') {
      if (!route.orderId) {
        showHome({ skipHistory: true, skipPersistence: true });
        return;
      }
      await openOrder(route.orderId, normalizeDatabaseOrderTab(route.orderTab), { skipHistory: true, throwOnError: true });
      return;
    }

    if (route.view === 'customer') {
      if (!route.customerKey) {
        showCustomers({ skipHistory: true, skipPersistence: true });
        return;
      }
      await openCustomer(route.customerKey, normalizeDatabaseCustomerTab(route.customerTab), { skipHistory: true, throwOnError: true });
      return;
    }

    if (route.view === 'outstanding') {
      state.orderMode = route.orderMode === 'all' ? 'all' : 'open';
      state.activeGroup = normalizeOutstandingGroup(route.activeGroup);
      state.orderSearchQuery = String(route.orderSearchQuery || '').trim();
      if (els.orderSearch) els.orderSearch.value = state.orderSearchQuery;
      showView('outstanding', { skipHistory: true, skipPersistence: true });
      setFooterTitle(state.orderMode === 'all' ? 'All Orders' : 'Open Orders');
      syncOutstandingFilterButtons();
      syncOrderSearchVisibility();
      loadOutstandingOrders({ force: false });
      return;
    }

    if (route.view === 'reports') {
      state.reportsRange = normalizeDatabaseReportRange(route.reportsRange);
      state.reportsMetric = normalizeDatabaseReportMetric(route.reportsMetric);
      state.reportsYear = normalizeDatabaseReportYear(route.reportsYear);
      state.reportsMonth = normalizeDatabaseReportMonth(route.reportsMonth);
      state.reportsCompareMode = normalizeDatabaseReportCompareMode(route.reportsCompareMode);
      state.reportsCompareMonthA = normalizeDatabaseReportMonth(route.reportsCompareMonthA);
      state.reportsCompareMonthB = normalizeDatabaseReportMonth(route.reportsCompareMonthB);
      state.reportsCompareYearA = normalizeDatabaseReportYear(route.reportsCompareYearA);
      state.reportsCompareYearB = normalizeDatabaseReportYear(route.reportsCompareYearB);
      showReports({ skipHistory: true, skipPersistence: true });
      return;
    }

    if (route.view === 'customers') {
      state.databaseCustomerQuery = String(route.customerQuery || '').trim();
      state.databaseCustomerSort = normalizeDatabaseCustomerSort(route.customerSort);
      if (els.customersSearch) els.customersSearch.value = state.databaseCustomerQuery;
      if (els.customersSort) els.customersSort.value = state.databaseCustomerSort;
      showCustomers({ skipHistory: true, skipPersistence: true });
      return;
    }

    if (route.view === 'styles') {
      state.selectedStyleId = String(route.styleId || '');
      state.productStyleQuery = String(route.styleQuery || '').trim();
      state.productStyleSort = normalizeDatabaseStyleSort(route.styleSort);
      if (els.stylesSearch) els.stylesSearch.value = state.productStyleQuery;
      if (els.stylesSort) els.stylesSort.value = state.productStyleSort;
      showStyles({ skipHistory: true, skipPersistence: true });
      return;
    }

    if (route.view === 'visuals') {
      state.visualsQuery = String(route.visualsQuery || '').trim();
      if (els.visualsSearch) els.visualsSearch.value = state.visualsQuery;
      showVisuals({ skipHistory: true, skipPersistence: true });
      return;
    }

    if (route.view === 'to-invoice') {
      showToInvoice({ skipHistory: true, skipPersistence: true });
      return;
    }

    if (route.view === 'stock-ordering') {
      showStockOrdering({ skipHistory: true, skipPersistence: true });
      return;
    }

    if (route.view === 'users') {
      showUsers({ skipHistory: true, skipPersistence: true });
      return;
    }

    if (route.view === 'dtf-admin') {
      showDtfAdmin({ skipHistory: true, skipPersistence: true });
      return;
    }

    if (route.view === 'new-order') {
      showNewOrder({ skipHistory: true, skipPersistence: true });
      return;
    }

    if (route.view === 'new-customer') {
      showNewCustomer({ skipHistory: true, skipPersistence: true });
      return;
    }

    showHome({ skipHistory: true, skipPersistence: true });
  }

  function persistDatabaseRoute(options = {}) {
    if (restoringDatabaseRoute && !options.force) return;
    const route = buildDatabaseRouteSnapshot();
    if (!route) return;
    try {
      window.localStorage.setItem(DATABASE_ROUTE_STORAGE_KEY, JSON.stringify(route));
    } catch {}
  }

  function readStoredDatabaseRoute() {
    try {
      const raw = window.localStorage.getItem(DATABASE_ROUTE_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  function buildDatabaseRouteSnapshot() {
    const view = DATABASE_RESTORABLE_VIEWS.has(state.activeView) ? state.activeView : 'home';
    const route = { view, savedAt: Date.now() };

    if (view === 'order') {
      const orderId = Number(state.selectedJob?.source_order_id);
      if (!Number.isFinite(orderId)) return null;
      route.orderId = orderId;
      route.orderTab = normalizeDatabaseOrderTab(state.activeOrderTab);
      return route;
    }

    if (view === 'customer') {
      const customerKey = state.selectedCustomerDetail?.customer_key;
      if (!customerKey) return null;
      route.customerKey = customerKey;
      route.customerTab = normalizeDatabaseCustomerTab(state.activeCustomerTab);
      return route;
    }

    if (view === 'outstanding') {
      route.orderMode = state.orderMode === 'all' ? 'all' : 'open';
      route.activeGroup = normalizeOutstandingGroup(state.activeGroup);
      route.orderSearchQuery = String(state.orderSearchQuery || '').trim();
      return route;
    }

    if (view === 'customers') {
      route.customerQuery = String(state.databaseCustomerQuery || els.customersSearch?.value || '').trim();
      route.customerSort = normalizeDatabaseCustomerSort(state.databaseCustomerSort || els.customersSort?.value);
      return route;
    }

    if (view === 'reports') {
      route.reportsRange = normalizeDatabaseReportRange(state.reportsRange);
      route.reportsMetric = normalizeDatabaseReportMetric(state.reportsMetric);
      route.reportsYear = normalizeDatabaseReportYear(state.reportsYear);
      route.reportsMonth = normalizeDatabaseReportMonth(state.reportsMonth);
      route.reportsCompareMode = normalizeDatabaseReportCompareMode(state.reportsCompareMode);
      route.reportsCompareMonthA = normalizeDatabaseReportMonth(state.reportsCompareMonthA);
      route.reportsCompareMonthB = normalizeDatabaseReportMonth(state.reportsCompareMonthB);
      route.reportsCompareYearA = normalizeDatabaseReportYear(state.reportsCompareYearA);
      route.reportsCompareYearB = normalizeDatabaseReportYear(state.reportsCompareYearB);
      return route;
    }

    if (view === 'styles') {
      route.styleId = String(state.selectedStyleId || '');
      route.styleQuery = String(state.productStyleQuery || els.stylesSearch?.value || '').trim();
      route.styleSort = normalizeDatabaseStyleSort(state.productStyleSort || els.stylesSort?.value);
      return route;
    }

    if (view === 'visuals') {
      route.visualsQuery = String(state.visualsQuery || els.visualsSearch?.value || '').trim();
      return route;
    }

    return route;
  }

  function normalizeDatabaseOrderTab(tab) {
    return DATABASE_ORDER_TABS.has(tab) ? tab : 'details';
  }

  function normalizeDatabaseCustomerTab(tab) {
    return DATABASE_CUSTOMER_TABS.has(tab) ? tab : 'orders';
  }

  function normalizeDatabaseCustomerSort(sort) {
    return DATABASE_CUSTOMER_SORTS.has(sort) ? sort : 'recent';
  }

  function normalizeDatabaseStyleSort(sort) {
    return DATABASE_STYLE_SORTS.has(sort) ? sort : 'most-used';
  }

  function normalizeDatabaseReportRange(range) {
    if (range === 'last12') return 'yearly';
    return DATABASE_REPORT_RANGES.has(range) ? range : 'ytd';
  }

  function normalizeDatabaseReportMetric(metric) {
    return DATABASE_REPORT_METRIC_KEYS.has(metric) ? metric : 'grossSales';
  }

  function normalizeDatabaseReportCompareMode(mode) {
    return DATABASE_REPORT_COMPARE_MODES.has(mode) ? mode : 'none';
  }

  function normalizeDatabaseReportMonth(value) {
    const clean = String(value || '').trim();
    const match = clean.match(/^(\d{4})-(\d{2})$/);
    const year = Number.parseInt(match?.[1], 10);
    const month = Number.parseInt(match?.[2], 10);
    return match && year >= 1900 && year <= 2100 && month >= 1 && month <= 12 ? clean : '';
  }

  function normalizeDatabaseReportYear(value) {
    const year = Number.parseInt(value, 10);
    return Number.isFinite(year) && year >= 1900 && year <= 2100 ? year : null;
  }

  function normalizeOutstandingGroup(group) {
    return String(group || 'all').trim() || 'all';
  }

  async function loadHomeMetrics() {
    state.loadedHome = true;
    try {
      const data = await fetchJson('/api/database/outstanding-counts');
      setHomeCounts(data);
    } catch {
      setHomeCounts({ printing: '!', embroidery: '!', business_gifts: '!' });
    }
  }

  function setHomeCounts(counts) {
    els.homeCountPrinting.textContent = formatNumber(counts.printing ?? 0);
    els.homeCountEmbroidery.textContent = formatNumber(counts.embroidery ?? 0);
    els.homeCountGifts.textContent = formatNumber(counts.business_gifts ?? counts.gifts ?? 0);
  }

  function showHome(options = {}) {
    showView('home', options);
    state.activeOrderTab = 'details';
    setFooterTitle('Main Menu');
  }

  function showNewOrder(options = {}) {
    showView('new-order', options);
    setFooterTitle('New Order');
    resetNewOrderForm();
  }

  function showNewCustomer(options = {}) {
    showView('new-customer', options);
    setFooterTitle('New Customer');
    resetNewCustomerForm();
    ensureCustomerUsers().then(() => {
      populateNewCustomerAccountManagers();
      validateNewCustomerForm();
    });
  }

  function showNewContact() {
    if (!state.selectedCustomerDetail?.customer_key) return;
    showView('new-contact');
    setFooterTitle('Add Contact');
    resetNewContactForm();
  }

  function cancelNewContact() {
    showView('customer');
    setFooterTitle('Customer');
    showCustomerTab('contacts');
  }

  function showCustomers(options = {}) {
    showView('customers', options);
    setFooterTitle('Customers');
    loadDatabaseCustomers({ force: false });
  }

  function showStyles(options = {}) {
    state.productStyleSort = normalizeDatabaseStyleSort(state.productStyleSort);
    if (els.stylesSearch) els.stylesSearch.value = state.productStyleQuery || '';
    if (els.stylesSort) els.stylesSort.value = state.productStyleSort;
    showView('styles', options);
    setFooterTitle('Styles');
    loadProductStyles({ force: false });
  }

  function showVisuals(options = {}) {
    if (els.visualsSearch) els.visualsSearch.value = state.visualsQuery || '';
    showView('visuals', options);
    setFooterTitle('Visuals');
    ensureDatabaseVisualsObserver();
    const queryChanged = state.visualsLoadedQuery !== String(state.visualsQuery || '').trim();
    if (!state.visuals.length || queryChanged) {
      loadDatabaseVisuals({ force: true });
    } else {
      renderDatabaseVisuals();
    }
  }

  function handleDatabaseVisualSearchInput() {
    window.clearTimeout(visualSearchTimer);
    visualSearchTimer = window.setTimeout(() => {
      state.visualsQuery = String(els.visualsSearch?.value || '').trim();
      persistDatabaseRoute();
      loadDatabaseVisuals({ force: true });
    }, DATABASE_VISUAL_SEARCH_DELAY);
  }

  function resetDatabaseVisuals() {
    state.visuals = [];
    state.visualsHasMore = true;
    state.visualsNextOffset = 0;
    state.visualsLoadedQuery = '';
    state.visualsError = '';
    state.visualsRequest += 1;
  }

  async function loadDatabaseVisuals(options = {}) {
    const append = options.append === true;
    const query = String(state.visualsQuery || els.visualsSearch?.value || '').trim();

    if (options.force) {
      resetDatabaseVisuals();
      state.visualsLoading = false;
    }
    if (state.visualsLoading || (append && !state.visualsHasMore)) return;
    if (append && state.visualsLoadedQuery !== query) return;

    const requestId = ++state.visualsRequest;
    const offset = append ? state.visualsNextOffset : 0;
    let appendedVisuals = [];
    state.visualsLoading = true;
    state.visualsError = '';
    renderDatabaseVisuals({ preserveGrid: append });

    try {
      const params = new URLSearchParams({
        limit: String(DATABASE_VISUAL_PAGE_LIMIT),
        offset: String(offset),
      });
      if (query) params.set('q', query);
      const data = await fetchJson(`/api/database/visuals?${params}`);
      if (requestId !== state.visualsRequest) return;

      const loaded = (Array.isArray(data.visuals) ? data.visuals : [])
        .map(normalizeDatabaseVisual)
        .filter(Boolean);
      const seen = new Set((append ? state.visuals : []).map((visual) => (
        String(visual.id || `${visual.source_order_id}:${visual.public_id}`)
      )));
      const uniqueLoaded = loaded.filter((visual) => {
        const key = String(visual.id || `${visual.source_order_id}:${visual.public_id}`);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      appendedVisuals = append ? uniqueLoaded : [];
      state.visuals = append ? [...state.visuals, ...uniqueLoaded] : uniqueLoaded;
      state.visualsHasMore = data.hasMore === true;
      state.visualsNextOffset = Number.isFinite(Number(data.nextOffset))
        ? Number(data.nextOffset)
        : offset + loaded.length;
      state.visualsLoadedQuery = query;
    } catch (err) {
      if (requestId !== state.visualsRequest) return;
      state.visualsHasMore = false;
      state.visualsError = err.message || 'Visual previews could not be loaded';
    } finally {
      if (requestId === state.visualsRequest) {
        state.visualsLoading = false;
        renderDatabaseVisuals(
          append
            ? { append: true, visuals: appendedVisuals, preserveGrid: !appendedVisuals.length }
            : {}
        );
      }
    }
  }

  function normalizeDatabaseVisual(visual) {
    const file = normalizeDatabaseProofFiles([visual])[0];
    if (!file) return null;
    return {
      ...file,
      id: Number(visual.id || visual.dashboardFileId),
      source_order_id: Number(visual.source_order_id),
      order_no: visual.order_no,
      customer_name: String(visual.customer_name || ''),
      job_title: String(visual.job_title || ''),
      design_numbers: String(visual.design_numbers || ''),
      created_at: visual.created_at || null,
    };
  }

  function renderDatabaseVisuals(options = {}) {
    if (!els.visualsGrid || !els.visualsStatus) return;
    const visuals = state.visuals || [];
    if (options.append && Array.isArray(options.visuals) && options.visuals.length) {
      els.visualsGrid.insertAdjacentHTML('beforeend', options.visuals.map(renderDatabaseVisualCard).join(''));
    } else if (!options.preserveGrid) {
      els.visualsGrid.innerHTML = visuals.map(renderDatabaseVisualCard).join('');
    }

    els.visualsStatus.classList.toggle('is-error', Boolean(state.visualsError));
    if (state.visualsError) {
      els.visualsStatus.hidden = false;
      els.visualsStatus.textContent = state.visualsError;
    } else if (state.visualsLoading && !visuals.length) {
      els.visualsStatus.hidden = false;
      els.visualsStatus.textContent = 'Loading visual previews…';
    } else if (!visuals.length) {
      els.visualsStatus.hidden = false;
      els.visualsStatus.textContent = state.visualsLoadedQuery
        ? 'No visuals match this search'
        : 'No job visuals have been attached yet';
    } else if (state.visualsLoading) {
      els.visualsStatus.hidden = false;
      els.visualsStatus.textContent = 'Loading more visuals…';
    } else {
      els.visualsStatus.hidden = true;
      els.visualsStatus.textContent = '';
    }

    if (els.visualsSummary) {
      const label = visuals.length === 1 ? 'visual' : 'visuals';
      els.visualsSummary.textContent = `${visuals.length} ${label} loaded${state.visualsHasMore ? ' · scroll for more' : ''}`;
    }

    const usesObserver = typeof window.IntersectionObserver === 'function';
    if (els.visualsLoadMore) {
      els.visualsLoadMore.hidden = usesObserver || !state.visualsHasMore || state.visualsLoading;
    }
    if (els.visualsSentinel) {
      els.visualsSentinel.hidden = !state.visualsHasMore;
    }
  }

  function renderDatabaseVisualCard(visual) {
    const thumbnailUrl = databaseVisualThumbnailUrl(visual);
    const isPdf = isDatabasePdfFile(visual);
    const orderNumber = visual.order_no || visual.source_order_id || '';
    const customer = visual.customer_name || 'Customer not recorded';
    const design = visual.design_numbers || 'No design number';
    const name = visual.name || 'Visual';
    const aria = `Open ${name} from job ${orderNumber}`;

    return `
      <button
        class="db-visual-card"
        type="button"
        role="listitem"
        data-db-visual-open="${escapeAttr(visual.id)}"
        aria-label="${escapeAttr(aria)}"
      >
        <span class="db-visual-card-preview${thumbnailUrl ? '' : ' is-unavailable'}">
          ${thumbnailUrl ? `
            <img
              src="${escapeAttr(thumbnailUrl)}"
              alt=""
              loading="lazy"
              decoding="async"
              fetchpriority="low"
              data-db-visual-thumbnail
            >
          ` : ''}
          <span class="db-visual-card-fallback">${isPdf ? 'PDF' : 'Preview unavailable'}</span>
          ${isPdf ? '<span class="db-visual-card-type">PDF</span>' : ''}
        </span>
        <span class="db-visual-card-name" title="${escapeAttr(name)}">${escapeHtml(name)}</span>
        <span class="db-visual-card-job">Job ${escapeHtml(orderNumber)}</span>
        <span class="db-visual-card-customer" title="${escapeAttr(customer)}">${escapeHtml(customer)}</span>
        <span class="db-visual-card-design" title="${escapeAttr(design)}">${escapeHtml(design)}</span>
      </button>
    `;
  }

  function databaseVisualThumbnailUrl(visual) {
    const original = buildDatabaseAssetSrc(visual);
    if (!original) return '';
    const marker = '/image/upload/';
    const markerIndex = original.indexOf(marker);
    if (markerIndex < 0) return isDatabasePdfFile(visual) ? '' : original;

    const transform = isDatabasePdfFile(visual)
      ? 'f_jpg,q_auto:eco,c_limit,w_420,h_420,pg_1'
      : 'f_auto,q_auto:eco,c_limit,w_420,h_420';
    let transformed = `${original.slice(0, markerIndex)}${marker}${transform}/${original.slice(markerIndex + marker.length)}`;
    if (isDatabasePdfFile(visual)) {
      transformed = transformed.replace(/\.pdf(?=([?#]|$))/i, '.jpg');
    }
    return transformed;
  }

  function handleDatabaseVisualThumbnailError(event) {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || !image.matches('[data-db-visual-thumbnail]')) return;
    image.hidden = true;
    image.closest('.db-visual-card-preview')?.classList.add('is-unavailable');
  }

  function ensureDatabaseVisualsObserver() {
    if (
      visualsIntersectionObserver
      || typeof window.IntersectionObserver !== 'function'
      || !els.visualsSentinel
    ) return;
    visualsIntersectionObserver = new window.IntersectionObserver((entries) => {
      if (
        entries.some((entry) => entry.isIntersecting)
        && state.activeView === 'visuals'
        && state.visualsHasMore
        && !state.visualsLoading
      ) {
        loadDatabaseVisuals({ append: true });
      }
    }, { root: null, rootMargin: '400px 0px' });
    visualsIntersectionObserver.observe(els.visualsSentinel);
  }

  function handleDatabaseVisualsScroll() {
    if (visualsScrollFrame || state.activeView !== 'visuals') return;
    visualsScrollFrame = window.requestAnimationFrame(() => {
      visualsScrollFrame = 0;
      if (!state.visualsHasMore || state.visualsLoading) return;

      if (isDatabaseMobileLayout()) {
        const top = els.visualsSentinel?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY;
        if (top <= window.innerHeight + 400) loadDatabaseVisuals({ append: true });
        return;
      }

      const scroll = els.visualsScroll;
      if (scroll && scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 400) {
        loadDatabaseVisuals({ append: true });
      }
    });
  }

  function openDatabaseVisualModal(visualId, opener = null) {
    const id = Number(visualId);
    const visual = state.visuals.find((item) => Number(item.id) === id);
    if (!visual || !els.visualModal || !els.visualModalViewer) return;

    state.activeVisual = visual;
    state.visualAttachedJobIds = new Set();
    visualModalOpener = opener;
    if (els.visualModalTitle) els.visualModalTitle.textContent = visual.name || 'Visual preview';
    if (els.visualModalMeta) {
      const meta = [`Job ${visual.order_no || visual.source_order_id}`];
      if (visual.customer_name) meta.push(visual.customer_name);
      if (visual.design_numbers) meta.push(`Design ${visual.design_numbers}`);
      els.visualModalMeta.textContent = meta.join(' · ');
    }
    if (els.visualModalFeedback) els.visualModalFeedback.textContent = '';

    els.visualModalViewer.replaceChildren();
    const src = buildDatabaseAssetSrc(visual);
    if (isDatabaseImageFile(visual)) {
      const image = document.createElement('img');
      image.src = src;
      image.alt = visual.name || 'Visual';
      els.visualModalViewer.appendChild(image);
    } else {
      const frame = document.createElement('iframe');
      frame.src = src;
      frame.title = visual.name || 'Visual PDF';
      frame.allow = 'fullscreen';
      els.visualModalViewer.appendChild(frame);
    }

    els.visualModal.hidden = false;
    els.visualModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open', 'db-visual-modal-open');
    renderDatabaseVisualJobOptions({ loading: true });
    ensureDatabaseVisualOpenJobs({ force: true });
    els.visualModalClose?.focus({ preventScroll: true });
  }

  async function ensureDatabaseVisualOpenJobs(options = {}) {
    if (state.visualOpenJobsLoading || (state.visualOpenJobsLoaded && !options.force)) {
      renderDatabaseVisualJobOptions();
      return;
    }

    state.visualOpenJobsLoading = true;
    renderDatabaseVisualJobOptions({ loading: true });
    let loadFailed = false;
    try {
      const data = await fetchJson('/api/database/visuals/open-jobs');
      state.visualOpenJobs = Array.isArray(data.jobs) ? data.jobs : [];
      state.visualOpenJobsLoaded = true;
    } catch (err) {
      loadFailed = true;
      state.visualOpenJobsLoaded = false;
      if (els.visualModalFeedback) {
        els.visualModalFeedback.textContent = err.message || 'Open jobs could not be loaded';
      }
    } finally {
      state.visualOpenJobsLoading = false;
      renderDatabaseVisualJobOptions({ error: loadFailed });
    }
  }

  function renderDatabaseVisualJobOptions(options = {}) {
    if (!els.visualModalJob) return;
    const visual = state.activeVisual;
    if (options.loading || state.visualOpenJobsLoading) {
      els.visualModalJob.innerHTML = '<option value="">Loading open jobs…</option>';
      els.visualModalJob.disabled = true;
      return;
    }
    if (options.error) {
      els.visualModalJob.innerHTML = '<option value="">Open jobs unavailable</option>';
      els.visualModalJob.disabled = true;
      return;
    }

    const jobs = state.visualOpenJobs || [];
    const optionsHtml = jobs.map((job) => {
      const id = Number(job.source_order_id);
      const label = [
        job.order_no || id,
        job.customer_name,
        job.job_title,
      ].filter(Boolean).join(' — ');
      const attached = state.visualAttachedJobIds.has(id);
      const current = id === Number(visual?.source_order_id);
      const suffix = current ? ' (current job)' : (attached ? ' (added)' : '');
      return `<option value="${escapeAttr(id)}" ${current || attached ? 'disabled' : ''}>${escapeHtml(label)}${suffix}</option>`;
    }).join('');

    els.visualModalJob.innerHTML = `
      <option value="">${jobs.length ? 'Choose a job…' : 'No open jobs'}</option>
      ${optionsHtml}
    `;
    const hasSelectableJob = jobs.some((job) => {
      const id = Number(job.source_order_id);
      return id !== Number(visual?.source_order_id) && !state.visualAttachedJobIds.has(id);
    });
    els.visualModalJob.disabled = state.visualAttachSaving || !hasSelectableJob;
  }

  async function attachActiveDatabaseVisual() {
    if (!els.visualModalJob || state.visualAttachSaving || !state.activeVisual) return;
    const targetId = Number(els.visualModalJob.value);
    if (!Number.isFinite(targetId)) return;
    const job = state.visualOpenJobs.find((item) => Number(item.source_order_id) === targetId);

    state.visualAttachSaving = true;
    els.visualModalJob.disabled = true;
    if (els.visualModalFeedback) {
      els.visualModalFeedback.textContent = `Adding visual to job ${job?.order_no || targetId}…`;
    }

    try {
      const data = await fetchJson(
        `/api/database/visuals/${encodeURIComponent(state.activeVisual.id)}/attach`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source_order_id: targetId }),
        }
      );
      state.visualAttachedJobIds.add(targetId);
      const attachedVisual = normalizeDatabaseVisual(data.visual);
      if (
        data.attached === true
        && attachedVisual
        && !state.visualsQuery
        && !state.visuals.some((visual) => Number(visual.id) === Number(attachedVisual.id))
      ) {
        state.visuals.unshift(attachedVisual);
        renderDatabaseVisuals();
      }
      if (els.visualModalFeedback) {
        els.visualModalFeedback.textContent = data.attached === false
          ? `This visual is already on job ${job?.order_no || targetId}`
          : `Visual added to job ${job?.order_no || targetId}`;
      }
    } catch (err) {
      if (els.visualModalFeedback) {
        els.visualModalFeedback.textContent = err.message || 'Visual could not be added to this job';
      }
    } finally {
      state.visualAttachSaving = false;
      renderDatabaseVisualJobOptions();
    }
  }

  function handleDatabaseVisualModalClick(event) {
    if (event.target === els.visualModal) closeDatabaseVisualModal();
  }

  function closeDatabaseVisualModal() {
    if (!els.visualModal || els.visualModal.hidden) return;
    els.visualModal.hidden = true;
    els.visualModal.setAttribute('aria-hidden', 'true');
    els.visualModalViewer?.replaceChildren();
    document.body.classList.remove('modal-open', 'db-visual-modal-open');
    state.activeVisual = null;
    const opener = visualModalOpener;
    visualModalOpener = null;
    opener?.focus({ preventScroll: true });
  }

  function showToInvoice(options = {}) {
    if (isDatabaseHomeAccessRestrictedUser()) {
      syncDatabaseHomeAccess();
      return;
    }
    showView('to-invoice', options);
    setFooterTitle('To Invoice');
    loadToInvoiceJobs({ force: true });
  }

  function showStockOrdering(options = {}) {
    if (isDatabaseHomeAccessRestrictedUser()) {
      syncDatabaseHomeAccess();
      return;
    }
    showView('stock-ordering', options);
    setFooterTitle('Stock Ordering');
    loadStockOrderingJobs({ force: true });
  }

  function showUsers(options = {}) {
    if (isDatabaseHomeAccessRestrictedUser()) {
      syncDatabaseHomeAccess();
      return;
    }
    showView('users', options);
    setFooterTitle('Users');
    loadRegisteredUsers({ force: true });
  }

  function showDtfAdmin(options = {}) {
    showView('dtf-admin', options);
    setFooterTitle('Lami DTF');
    window.DtfAdmin?.open?.();
  }

  function showReports(options = {}) {
    if (isDatabaseHomeAccessRestrictedUser()) {
      syncDatabaseHomeAccess();
      return;
    }
    state.reportsRange = normalizeDatabaseReportRange(state.reportsRange);
    state.reportsMetric = normalizeDatabaseReportMetric(state.reportsMetric);
    state.reportsCompareMode = normalizeDatabaseReportCompareMode(state.reportsCompareMode);
    ensureDatabaseReportSelectionDefaults();
    showView('reports', options);
    setFooterTitle('Analytics & Reports');
    syncReportRangeButtons();
    syncReportComparisonControls();
    if (state.reportsCompareMode === 'none') {
      loadDatabaseReports();
    } else {
      loadDatabaseReportComparison();
    }
  }

  function syncReportRangeButtons() {
    els.reportsRangeButtons?.forEach((button) => {
      const active = state.reportsCompareMode === 'none' && button.dataset.dbReportRange === state.reportsRange;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    syncDatabaseReportPeriodControl();
  }

  function ensureDatabaseReportSelectionDefaults() {
    const currentYear = currentDatabaseReportYear();
    state.reportsYear = normalizeDatabaseReportYear(state.reportsYear) || currentYear;
    state.reportsMonth = normalizeDatabaseReportMonth(state.reportsMonth)
      || `${state.reportsYear}-${currentDatabaseReportMonth().slice(5, 7)}`;
    if (state.reportsRange === 'monthly') {
      state.reportsYear = databaseReportMonthYear(state.reportsMonth) || state.reportsYear;
    }
    state.reportsCompareMonthB = normalizeDatabaseReportMonth(state.reportsCompareMonthB) || currentDatabaseReportMonth();
    state.reportsCompareMonthA = normalizeDatabaseReportMonth(state.reportsCompareMonthA)
      || shiftDatabaseReportMonth(state.reportsCompareMonthB, -1);
    state.reportsCompareYearB = normalizeDatabaseReportYear(state.reportsCompareYearB) || currentYear;
    state.reportsCompareYearA = normalizeDatabaseReportYear(state.reportsCompareYearA) || currentYear - 1;
    mergeDatabaseReportYears([
      state.reportsYear,
      databaseReportMonthYear(state.reportsMonth),
      state.reportsCompareYearA,
      state.reportsCompareYearB,
      databaseReportMonthYear(state.reportsCompareMonthA),
      databaseReportMonthYear(state.reportsCompareMonthB),
      ...Array.from({ length: 10 }, (_, index) => currentYear - index),
    ]);
  }

  function currentDatabaseReportYear() {
    return Number(new Intl.DateTimeFormat('en-GB', {
      year: 'numeric',
      timeZone: 'Europe/London',
    }).format(new Date()));
  }

  function currentDatabaseReportMonth() {
    const parts = new Intl.DateTimeFormat('en-GB', {
      year: 'numeric',
      month: '2-digit',
      timeZone: 'Europe/London',
    }).formatToParts(new Date());
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    return `${year}-${month}`;
  }

  function shiftDatabaseReportMonth(value, delta) {
    const clean = normalizeDatabaseReportMonth(value);
    if (!clean) return '';
    const [year, month] = clean.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1 + delta, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  function mergeDatabaseReportYears(years) {
    const values = [
      ...(state.reportsAvailableYears || []),
      ...(Array.isArray(years) ? years : []),
    ].map(normalizeDatabaseReportYear).filter(Boolean);
    state.reportsAvailableYears = Array.from(new Set(values)).sort((a, b) => b - a);
    syncDatabaseReportPeriodControl();
    populateDatabaseReportYearSelect(els.reportsCompareYearA, state.reportsCompareYearA);
    populateDatabaseReportYearSelect(els.reportsCompareYearB, state.reportsCompareYearB);
    populateDatabaseReportYearSelect(els.reportsCompareMonthYearA, databaseReportMonthYear(state.reportsCompareMonthA));
    populateDatabaseReportYearSelect(els.reportsCompareMonthYearB, databaseReportMonthYear(state.reportsCompareMonthB));
  }

  function populateDatabaseReportYearSelect(select, selectedYear) {
    if (!select) return;
    const year = normalizeDatabaseReportYear(selectedYear) || currentDatabaseReportYear();
    const years = Array.from(new Set([...(state.reportsAvailableYears || []), year])).sort((a, b) => b - a);
    select.innerHTML = years.map((value) => `<option value="${value}">${value}</option>`).join('');
    select.value = String(year);
  }

  function populateDatabaseReportMonthSelect(select, selectedMonth) {
    if (!select) return;
    const month = String(selectedMonth || '').padStart(2, '0');
    select.innerHTML = Array.from({ length: 12 }, (_, index) => {
      const value = String(index + 1).padStart(2, '0');
      const label = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' })
        .format(new Date(Date.UTC(2020, index, 1)));
      return `<option value="${value}">${escapeHtml(label)}</option>`;
    }).join('');
    select.value = month;
  }

  function populateDatabaseSingleReportMonthSelect(select, selectedMonth) {
    if (!select) return;
    const month = normalizeDatabaseReportMonth(selectedMonth) || currentDatabaseReportMonth();
    const year = databaseReportMonthYear(month) || currentDatabaseReportYear();
    select.innerHTML = Array.from({ length: 12 }, (_, index) => {
      const monthValue = String(index + 1).padStart(2, '0');
      const value = `${year}-${monthValue}`;
      const label = new Intl.DateTimeFormat('en-GB', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(Date.UTC(year, index, 1)));
      return `<option value="${value}">${escapeHtml(label)}</option>`;
    }).join('');
    select.value = month;
  }

  function syncDatabaseReportPeriodControl() {
    if (!els.reportsYear) return;
    const isMonthly = state.reportsRange === 'monthly';
    const isEnabled = state.reportsCompareMode === 'none'
      && (isMonthly || state.reportsRange === 'yearly' || state.reportsRange === 'ytd');
    if (els.reportsPeriodControlLabel) els.reportsPeriodControlLabel.textContent = isMonthly ? 'Month' : 'Year';
    els.reportsPeriodControl?.classList.toggle('is-month', isMonthly);
    els.reportsYear.disabled = !isEnabled;
    els.reportsYear.setAttribute('aria-label', isMonthly ? 'Report month' : 'Report year');
    if (isMonthly) {
      populateDatabaseSingleReportMonthSelect(els.reportsYear, state.reportsMonth);
    } else {
      populateDatabaseReportYearSelect(els.reportsYear, state.reportsYear);
    }
  }

  function databaseReportMonthYear(value) {
    const month = normalizeDatabaseReportMonth(value);
    return month ? Number.parseInt(month.slice(0, 4), 10) : null;
  }

  function syncDatabaseReportMonthBox(value, monthSelect, yearSelect) {
    const month = normalizeDatabaseReportMonth(value) || currentDatabaseReportMonth();
    populateDatabaseReportMonthSelect(monthSelect, month.slice(5, 7));
    populateDatabaseReportYearSelect(yearSelect, Number.parseInt(month.slice(0, 4), 10));
  }

  function databaseReportMonthFromControls(monthSelect, yearSelect) {
    return normalizeDatabaseReportMonth(`${yearSelect?.value || ''}-${monthSelect?.value || ''}`);
  }

  function syncReportComparisonControls() {
    const mode = normalizeDatabaseReportCompareMode(state.reportsCompareMode);
    document.querySelectorAll('[data-db-report-compare-mode]').forEach((button) => {
      const active = button.dataset.dbReportCompareMode === mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    if (els.reportsCompareMonthWrap) els.reportsCompareMonthWrap.hidden = mode !== 'month';
    if (els.reportsCompareYearWrap) els.reportsCompareYearWrap.hidden = mode !== 'year';
    if (els.reportsCompareClear) els.reportsCompareClear.hidden = mode === 'none';
    syncDatabaseReportMonthBox(state.reportsCompareMonthA, els.reportsCompareMonthNameA, els.reportsCompareMonthYearA);
    syncDatabaseReportMonthBox(state.reportsCompareMonthB, els.reportsCompareMonthNameB, els.reportsCompareMonthYearB);
    populateDatabaseReportYearSelect(els.reportsCompareYearA, state.reportsCompareYearA);
    populateDatabaseReportYearSelect(els.reportsCompareYearB, state.reportsCompareYearB);
    syncReportRangeButtons();
  }

  async function handleReportYearChange() {
    if (state.reportsRange === 'monthly') {
      state.reportsMonth = normalizeDatabaseReportMonth(els.reportsYear?.value) || currentDatabaseReportMonth();
      state.reportsYear = databaseReportMonthYear(state.reportsMonth) || currentDatabaseReportYear();
      state.reportsCompareMode = 'none';
      state.reportsComparisonData = null;
      syncReportRangeButtons();
      syncReportComparisonControls();
      persistDatabaseRoute();
      await loadDatabaseReports();
      return;
    }
    state.reportsYear = normalizeDatabaseReportYear(els.reportsYear?.value) || currentDatabaseReportYear();
    const month = normalizeDatabaseReportMonth(state.reportsMonth) || currentDatabaseReportMonth();
    state.reportsMonth = `${state.reportsYear}-${month.slice(5, 7)}`;
    state.reportsRange = state.reportsRange === 'yearly' ? 'yearly' : 'ytd';
    state.reportsCompareMode = 'none';
    state.reportsComparisonData = null;
    syncReportRangeButtons();
    syncReportComparisonControls();
    persistDatabaseRoute();
    await loadDatabaseReports();
  }

  async function handleReportComparisonInputChange(event) {
    if (event.target === els.reportsCompareMonthNameA || event.target === els.reportsCompareMonthYearA) {
      state.reportsCompareMonthA = databaseReportMonthFromControls(els.reportsCompareMonthNameA, els.reportsCompareMonthYearA);
    }
    if (event.target === els.reportsCompareMonthNameB || event.target === els.reportsCompareMonthYearB) {
      state.reportsCompareMonthB = databaseReportMonthFromControls(els.reportsCompareMonthNameB, els.reportsCompareMonthYearB);
    }
    if (event.target === els.reportsCompareYearA) state.reportsCompareYearA = normalizeDatabaseReportYear(event.target.value);
    if (event.target === els.reportsCompareYearB) state.reportsCompareYearB = normalizeDatabaseReportYear(event.target.value);
    persistDatabaseRoute();
    await loadDatabaseReportComparison();
  }

  async function activateReportComparison(mode) {
    state.reportsCompareMode = normalizeDatabaseReportCompareMode(mode);
    state.reportsComparisonData = null;
    ensureDatabaseReportSelectionDefaults();
    syncReportComparisonControls();
    persistDatabaseRoute();
    await loadDatabaseReportComparison();
  }

  async function clearReportComparison() {
    state.reportsCompareMode = 'none';
    state.reportsComparisonData = null;
    syncReportComparisonControls();
    persistDatabaseRoute();
    await loadDatabaseReports();
  }

  function databaseReportComparisonPeriods() {
    if (state.reportsCompareMode === 'month') {
      return {
        range: 'custom-month',
        primary: normalizeDatabaseReportMonth(state.reportsCompareMonthA),
        secondary: normalizeDatabaseReportMonth(state.reportsCompareMonthB),
      };
    }
    if (state.reportsCompareMode === 'year') {
      return {
        range: 'custom-year',
        primary: String(normalizeDatabaseReportYear(state.reportsCompareYearA) || ''),
        secondary: String(normalizeDatabaseReportYear(state.reportsCompareYearB) || ''),
      };
    }
    return null;
  }

  async function loadDatabaseReportComparison() {
    const periods = databaseReportComparisonPeriods();
    if (!periods?.primary || !periods?.secondary || periods.primary === periods.secondary) {
      state.reportsComparisonData = null;
      if (state.reportsData) renderDatabaseReports(state.reportsData);
      if (els.reportsStatus) {
        els.reportsStatus.textContent = periods?.primary === periods?.secondary
          ? 'Choose two different periods to compare.'
          : 'Choose both periods to compare.';
      }
      return;
    }

    const request = ++state.reportsRequest;
    state.reportsLoading = true;
    state.reportsComparisonData = null;
    renderDatabaseReportsLoading();
    const reportUrl = (period) => `/api/database/reports?range=${encodeURIComponent(periods.range)}&period=${encodeURIComponent(period)}`;

    try {
      const [primary, secondary] = await Promise.all([
        fetchJson(reportUrl(periods.primary)),
        fetchJson(reportUrl(periods.secondary)),
      ]);
      if (request !== state.reportsRequest) return null;
      state.reportsData = primary;
      state.reportsComparisonData = {
        mode: state.reportsCompareMode,
        primary,
        secondary,
      };
      mergeDatabaseReportYears([...(primary.availableYears || []), ...(secondary.availableYears || [])]);
      renderDatabaseReports(primary);
      return state.reportsComparisonData;
    } catch (err) {
      if (request !== state.reportsRequest) return null;
      renderDatabaseReportsError(err);
      return null;
    } finally {
      if (request === state.reportsRequest) state.reportsLoading = false;
    }
  }

  async function loadDatabaseReports() {
    const range = normalizeDatabaseReportRange(state.reportsRange);
    const request = ++state.reportsRequest;
    state.reportsLoading = true;
    state.reportsComparisonData = null;
    renderDatabaseReportsLoading();

    try {
      const requestRange = range === 'monthly' ? 'custom-month' : (range === 'yearly' ? 'custom-year' : range);
      const params = new URLSearchParams({ range: requestRange });
      if (range === 'monthly') params.set('period', normalizeDatabaseReportMonth(state.reportsMonth) || currentDatabaseReportMonth());
      if (range === 'yearly') params.set('period', String(normalizeDatabaseReportYear(state.reportsYear) || currentDatabaseReportYear()));
      if (range === 'ytd' && state.reportsYear) params.set('year', String(state.reportsYear));
      const data = await fetchJson(`/api/database/reports?${params.toString()}`);
      if (request !== state.reportsRequest) return;
      state.reportsData = data;
      mergeDatabaseReportYears(data.availableYears || []);
      renderDatabaseReports(data);
      return data;
    } catch (err) {
      if (request !== state.reportsRequest) return;
      renderDatabaseReportsError(err);
      return null;
    } finally {
      if (request === state.reportsRequest) state.reportsLoading = false;
    }
  }

  function renderDatabaseReportsLoading() {
    if (els.reportsStatus) els.reportsStatus.textContent = 'Loading financial report…';
    if (els.reportsChart) els.reportsChart.replaceChildren();
    if (els.reportsChartLegend) els.reportsChartLegend.hidden = true;
    syncDatabaseReportChartHeading({});
    if (els.reportsChartState) {
      els.reportsChartState.hidden = false;
      els.reportsChartState.textContent = 'Loading financial report';
    }
    if (els.reportsKpis) {
      els.reportsKpis.innerHTML = Array.from({ length: 6 }, () => `
        <div class="db-report-kpi db-report-loading-block"><span>&nbsp;</span><strong>&nbsp;</strong></div>
      `).join('');
    }
    if (els.reportsTopCustomer) els.reportsTopCustomer.innerHTML = '<div class="db-report-card-title">Highest grossing customer</div><div class="db-report-card-empty">Loading…</div>';
    if (els.reportsCustomersBody) els.reportsCustomersBody.innerHTML = '<tr><td colspan="3">Loading…</td></tr>';
    if (els.reportsTypesBody) els.reportsTypesBody.innerHTML = '<tr><td colspan="3">Loading…</td></tr>';
  }

  function renderDatabaseReportsError(err) {
    const message = err?.message || 'Failed to load financial report';
    if (els.reportsStatus) els.reportsStatus.textContent = message;
    if (els.reportsChartState) {
      els.reportsChartState.hidden = false;
      els.reportsChartState.textContent = 'Financial report unavailable';
    }
    if (els.reportsChartLegend) els.reportsChartLegend.hidden = true;
    if (els.reportsKpis) els.reportsKpis.innerHTML = '<div class="db-report-error">Financial totals could not be loaded.</div>';
    if (els.reportsTopCustomer) els.reportsTopCustomer.innerHTML = `<div class="db-report-card-title">Highest grossing customer</div><div class="db-report-card-empty">${escapeHtml(message)}</div>`;
    if (els.reportsCustomersBody) els.reportsCustomersBody.innerHTML = '<tr><td colspan="3">Unavailable</td></tr>';
    if (els.reportsTypesBody) els.reportsTypesBody.innerHTML = '<tr><td colspan="3">Unavailable</td></tr>';
  }

  function renderDatabaseReports(data) {
    const summary = data?.summary || {};
    const comparison = state.reportsComparisonData;
    const periodDates = reportPeriodDates(data?.periodStart, data?.periodEnd);
    if (els.reportsPeriod) {
      els.reportsPeriod.textContent = comparison
        ? `${comparison.primary.rangeDescription || comparison.primary.rangeLabel} compared with ${comparison.secondary.rangeDescription || comparison.secondary.rangeLabel}`
        : [data?.rangeDescription || data?.rangeLabel, periodDates].filter(Boolean).join(' · ');
    }
    if (els.reportsStatus) els.reportsStatus.textContent = '';
    syncDatabaseReportChartHeading(summary);

    const metrics = [
      { key: 'grossSales', note: 'Net plus VAT' },
      { key: 'netSales', note: 'Before VAT' },
      { key: 'vat', note: 'Invoice VAT' },
      { key: 'costOfGoods', note: 'Unit cost × quantity' },
      { key: 'grossProfit', note: `${formatReportPercent(summary.grossMarginPercent)} margin`, profit: reportNumber(summary.grossProfit) },
      { key: 'orderCount', note: `${formatCurrency(reportNumber(summary.averageOrderValue))} average` },
    ];
    if (els.reportsKpis) {
      els.reportsKpis.innerHTML = metrics.map((metric) => {
        const definition = DATABASE_REPORT_METRICS[metric.key];
        const selected = metric.key === state.reportsMetric;
        const primaryLabel = comparison?.primary?.rangeLabel;
        const secondaryLabel = comparison?.secondary?.rangeLabel;
        const metricLabel = primaryLabel ? `${definition.label} · ${primaryLabel}` : definition.label;
        const note = comparison
          ? `Compared to ${secondaryLabel}: ${formatDatabaseReportMetricValue(comparison.secondary.summary?.[metric.key], definition)}`
          : metric.note;
        return `
        <button class="db-report-kpi ${selected ? 'is-primary' : ''} ${metric.profit < 0 ? 'is-negative' : ''}" type="button" data-db-report-metric="${escapeAttr(metric.key)}" aria-pressed="${selected ? 'true' : 'false'}">
          <span title="${escapeAttr(metricLabel)}">${escapeHtml(metricLabel)}</span>
          <strong>${escapeHtml(formatDatabaseReportMetricValue(summary[metric.key], definition))}</strong>
          <small class="${comparison ? 'db-report-kpi-comparison' : ''}" title="${escapeAttr(note)}">${escapeHtml(note)}</small>
        </button>
      `;
      }).join('');
    }

    renderDatabaseReportsChart(data?.series || [], data?.grain, data?.rangeLabel, state.reportsMetric);
    renderDatabaseReportsTopCustomer(data?.topCustomers || [], data?.topOrder, summary);
    renderDatabaseReportsTable(els.reportsCustomersBody, data?.topCustomers || [], (customer) => [
      customer.customerName || 'Unknown customer',
      formatNumber(customer.orderCount || 0),
      formatCurrency(reportNumber(customer.grossSales)),
    ]);
    renderDatabaseReportsTable(els.reportsTypesBody, data?.orderTypes || [], (type) => [
      type.orderType || 'Other',
      formatNumber(type.orderCount || 0),
      formatCurrency(reportNumber(type.grossSales)),
    ]);
  }

  function renderDatabaseReportsTopCustomer(customers, topOrder, summary) {
    if (!els.reportsTopCustomer) return;
    const customer = customers[0];
    if (!customer) {
      els.reportsTopCustomer.innerHTML = '<div class="db-report-card-title">Highest grossing customer</div><div class="db-report-card-empty">No customer sales in this period</div>';
      return;
    }
    const totalGross = reportNumber(summary?.grossSales);
    const customerGross = reportNumber(customer.grossSales);
    const share = totalGross ? (customerGross / totalGross) * 100 : 0;
    const orderNumber = topOrder?.order_no || topOrder?.orderNo;
    const orderGross = topOrder?.gross_sales ?? topOrder?.grossSales;
    els.reportsTopCustomer.innerHTML = `
      <div class="db-report-card-title">Highest grossing customer</div>
      <div class="db-report-highlight-name" title="${escapeAttr(customer.customerName || '')}">${escapeHtml(customer.customerName || 'Unknown customer')}</div>
      <div class="db-report-highlight-value">${escapeHtml(formatCurrency(customerGross))}</div>
      <div class="db-report-detail-row"><span>Orders</span><strong>${escapeHtml(formatNumber(customer.orderCount || 0))}</strong></div>
      <div class="db-report-detail-row"><span>Share of gross sales</span><strong>${escapeHtml(formatReportPercent(share))}</strong></div>
      <div class="db-report-detail-row"><span>Highest order${orderNumber ? ` #${escapeHtml(orderNumber)}` : ''}</span><strong>${escapeHtml(formatCurrency(reportNumber(orderGross)))}</strong></div>
    `;
  }

  function syncDatabaseReportChartHeading(summary) {
    const metricKey = normalizeDatabaseReportMetric(state.reportsMetric);
    const metric = DATABASE_REPORT_METRICS[metricKey];
    const comparison = state.reportsComparisonData;
    if (els.reportsChartTitle) els.reportsChartTitle.textContent = `${metric.label} ${comparison ? 'comparison' : 'over time'}`;
    if (els.reportsChartSubtitle) {
      els.reportsChartSubtitle.textContent = comparison
        ? `${comparison.primary.rangeLabel} against ${comparison.secondary.rangeLabel}`
        : metric.subtitle;
    }
    if (els.reportsChartTotal) {
      els.reportsChartTotal.classList.toggle('is-comparison', Boolean(comparison));
      els.reportsChartTotal.textContent = comparison
        ? `${formatDatabaseReportMetricValue(comparison.primary.summary?.[metricKey], metric)} / ${formatDatabaseReportMetricValue(comparison.secondary.summary?.[metricKey], metric)}`
        : formatDatabaseReportMetricValue(summary?.[metricKey], metric);
    }
    if (els.reportsChartLegend) {
      if (!comparison) {
        els.reportsChartLegend.hidden = true;
        els.reportsChartLegend.replaceChildren();
      } else {
        els.reportsChartLegend.innerHTML = `
          <span><i class="is-primary"></i>${escapeHtml(comparison.primary.rangeLabel)}</span>
          <span><i class="is-secondary"></i>${escapeHtml(comparison.secondary.rangeLabel)}</span>
        `;
        els.reportsChartLegend.hidden = false;
      }
    }
  }

  function formatDatabaseReportMetricValue(value, metric) {
    return metric?.currency ? formatCurrency(reportNumber(value)) : formatNumber(value || 0);
  }

  function renderDatabaseReportsTable(body, rows, cellsForRow) {
    if (!body) return;
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="3">No sales in this period</td></tr>';
      return;
    }
    body.innerHTML = rows.map((row) => {
      const cells = cellsForRow(row);
      return `<tr>${cells.map((cell, index) => `<td${index === 0 ? ` title="${escapeAttr(cell)}"` : ''}>${escapeHtml(cell)}</td>`).join('')}</tr>`;
    }).join('');
  }

  function renderDatabaseReportsChart(series, grain, rangeLabel, metricKey) {
    if (!els.reportsChart) return;
    if (state.reportsComparisonData) {
      renderDatabaseReportsComparisonChart(state.reportsComparisonData, metricKey);
      return;
    }
    if (!series.length) {
      els.reportsChart.replaceChildren();
      if (els.reportsChartState) {
        els.reportsChartState.hidden = false;
        els.reportsChartState.textContent = 'No chart data for this period';
      }
      return;
    }

    const width = 900;
    const height = 236;
    const margin = { top: 14, right: 22, bottom: 42, left: 68 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const normalizedMetricKey = normalizeDatabaseReportMetric(metricKey);
    const metric = DATABASE_REPORT_METRICS[normalizedMetricKey];
    const values = series.map((point) => reportNumber(point[normalizedMetricKey]));
    const bounds = metric.currency ? reportAxisBounds(values, 4) : reportCountAxisBounds(values, 4);
    const xFor = (index) => series.length === 1
      ? margin.left + (plotWidth / 2)
      : margin.left + (index / (series.length - 1)) * plotWidth;
    const yFor = (value) => margin.top + ((bounds.max - value) / (bounds.max - bounds.min)) * plotHeight;
    const zeroY = yFor(0);
    const points = values.map((value, index) => ({ x: xFor(index), y: yFor(value), value, index }));
    const path = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
    const area = `M ${points[0].x.toFixed(2)} ${zeroY.toFixed(2)} ${points.map((point) => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ')} L ${points[points.length - 1].x.toFixed(2)} ${zeroY.toFixed(2)} Z`;
    const maximumLabels = grain === 'month' || grain === 'day' ? series.length : 9;
    const labelIndexes = reportChartLabelIndexes(series.length, maximumLabels);
    const tickMarkup = Array.from({ length: 5 }, (_, index) => {
      const value = bounds.min + ((bounds.max - bounds.min) * index / 4);
      const y = yFor(value);
      return `
        <line class="db-report-chart-grid" x1="${margin.left}" y1="${y.toFixed(2)}" x2="${width - margin.right}" y2="${y.toFixed(2)}"></line>
        <text class="db-report-chart-y-label" x="${margin.left - 8}" y="${(y + 3.5).toFixed(2)}">${escapeHtml(formatReportAxisValue(value, metric))}</text>
      `;
    }).join('');
    const xMarkup = Array.from(labelIndexes).sort((a, b) => a - b).map((index) => {
      const x = xFor(index);
      return `
        <line class="db-report-chart-tick" x1="${x.toFixed(2)}" y1="${height - margin.bottom}" x2="${x.toFixed(2)}" y2="${height - margin.bottom + 4}"></line>
        <text class="db-report-chart-x-label" x="${x.toFixed(2)}" y="${height - 17}">${escapeHtml(formatReportChartBucketLabel(series, index, grain))}</text>
      `;
    }).join('');
    const pointMarkup = points.map((point) => {
      const label = formatReportBucketLabel(series[point.index]?.bucketStart, grain, true);
      const orderCount = Number(series[point.index]?.orderCount || 0);
      const metricValue = formatDatabaseReportMetricValue(point.value, metric);
      const detail = normalizedMetricKey === 'orderCount'
        ? `${metricValue} order${point.value === 1 ? '' : 's'}`
        : `${metricValue} · ${formatNumber(orderCount)} order${orderCount === 1 ? '' : 's'}`;
      return `
        <circle class="db-report-chart-point" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="3.2">
          <title>${escapeHtml(`${label}: ${detail}`)}</title>
        </circle>
      `;
    }).join('');
    const total = values.reduce((sum, value) => sum + value, 0);

    els.reportsChart.setAttribute('aria-label', `${metric.label} for ${rangeLabel || 'selected period'}: ${formatDatabaseReportMetricValue(total, metric)}`);
    els.reportsChart.innerHTML = `
      <desc>${escapeHtml(metric.label)} plotted by ${escapeHtml(grain || 'period')}, with exact values available on each point.</desc>
      ${tickMarkup}
      <line class="db-report-chart-axis" x1="${margin.left}" y1="${zeroY.toFixed(2)}" x2="${width - margin.right}" y2="${zeroY.toFixed(2)}"></line>
      <path class="db-report-chart-area" d="${area}"></path>
      <path class="db-report-chart-line" d="${path}"></path>
      ${pointMarkup}
      ${xMarkup}
    `;
    if (els.reportsChartState) els.reportsChartState.hidden = true;
  }

  function renderDatabaseReportsComparisonChart(comparison, metricKey) {
    const primarySeries = comparison?.primary?.series || [];
    const secondarySeries = comparison?.secondary?.series || [];
    const pointCount = Math.max(primarySeries.length, secondarySeries.length);
    if (!pointCount) {
      els.reportsChart.replaceChildren();
      if (els.reportsChartState) {
        els.reportsChartState.hidden = false;
        els.reportsChartState.textContent = 'No chart data for these periods';
      }
      return;
    }

    const width = 900;
    const height = 236;
    const margin = { top: 14, right: 22, bottom: 42, left: 68 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const normalizedMetricKey = normalizeDatabaseReportMetric(metricKey);
    const metric = DATABASE_REPORT_METRICS[normalizedMetricKey];
    const primaryValues = primarySeries.map((point) => reportNumber(point[normalizedMetricKey]));
    const secondaryValues = secondarySeries.map((point) => reportNumber(point[normalizedMetricKey]));
    const allValues = [...primaryValues, ...secondaryValues];
    const bounds = metric.currency ? reportAxisBounds(allValues, 4) : reportCountAxisBounds(allValues, 4);
    const xFor = (index) => pointCount === 1
      ? margin.left + (plotWidth / 2)
      : margin.left + (index / (pointCount - 1)) * plotWidth;
    const yFor = (value) => margin.top + ((bounds.max - value) / (bounds.max - bounds.min)) * plotHeight;
    const zeroY = yFor(0);
    const lineMarkup = (values, label, className) => {
      if (!values.length) return '';
      const points = values.map((value, index) => ({ x: xFor(index), y: yFor(value), value, index }));
      const path = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
      return `
        <path class="db-report-chart-line ${className}" d="${path}"></path>
        ${points.map((point) => `
          <circle class="db-report-chart-point ${className}" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="3.2">
            <title>${escapeHtml(`${label}, ${databaseReportComparisonPointLabel(point.index, comparison.mode)}: ${formatDatabaseReportMetricValue(point.value, metric)}`)}</title>
          </circle>
        `).join('')}
      `;
    };
    const tickMarkup = Array.from({ length: 5 }, (_, index) => {
      const value = bounds.min + ((bounds.max - bounds.min) * index / 4);
      const y = yFor(value);
      return `
        <line class="db-report-chart-grid" x1="${margin.left}" y1="${y.toFixed(2)}" x2="${width - margin.right}" y2="${y.toFixed(2)}"></line>
        <text class="db-report-chart-y-label" x="${margin.left - 8}" y="${(y + 3.5).toFixed(2)}">${escapeHtml(formatReportAxisValue(value, metric))}</text>
      `;
    }).join('');
    const maximumLabels = comparison.mode === 'year' ? 12 : pointCount;
    const xMarkup = Array.from(reportChartLabelIndexes(pointCount, maximumLabels)).sort((a, b) => a - b).map((index) => {
      const x = xFor(index);
      return `
        <line class="db-report-chart-tick" x1="${x.toFixed(2)}" y1="${height - margin.bottom}" x2="${x.toFixed(2)}" y2="${height - margin.bottom + 4}"></line>
        <text class="db-report-chart-x-label" x="${x.toFixed(2)}" y="${height - 17}">${escapeHtml(databaseReportComparisonAxisLabel(index, comparison.mode))}</text>
      `;
    }).join('');
    const primaryTotal = primaryValues.reduce((sum, value) => sum + value, 0);
    const secondaryTotal = secondaryValues.reduce((sum, value) => sum + value, 0);

    els.reportsChart.setAttribute(
      'aria-label',
      `${metric.label}: ${comparison.primary.rangeLabel} ${formatDatabaseReportMetricValue(primaryTotal, metric)}, ${comparison.secondary.rangeLabel} ${formatDatabaseReportMetricValue(secondaryTotal, metric)}`
    );
    els.reportsChart.innerHTML = `
      <desc>${escapeHtml(metric.label)} comparison with aligned ${comparison.mode === 'month' ? 'days of month' : 'months of year'} and exact values on every point.</desc>
      ${tickMarkup}
      <line class="db-report-chart-axis" x1="${margin.left}" y1="${zeroY.toFixed(2)}" x2="${width - margin.right}" y2="${zeroY.toFixed(2)}"></line>
      ${lineMarkup(primaryValues, comparison.primary.rangeLabel, 'is-primary')}
      ${lineMarkup(secondaryValues, comparison.secondary.rangeLabel, 'is-secondary')}
      ${xMarkup}
    `;
    if (els.reportsChartState) els.reportsChartState.hidden = true;
  }

  function databaseReportComparisonAxisLabel(index, mode) {
    if (mode === 'month') return String(index + 1);
    return new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' })
      .format(new Date(Date.UTC(2020, index, 1)));
  }

  function databaseReportComparisonPointLabel(index, mode) {
    if (mode === 'month') return `day ${index + 1}`;
    return new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' })
      .format(new Date(Date.UTC(2020, index, 1)));
  }

  function formatReportChartBucketLabel(series, index, grain) {
    const value = series[index]?.bucketStart;
    if (grain !== 'day' || series.length <= 14) return formatReportBucketLabel(value, grain);
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value || '');
    const day = new Intl.DateTimeFormat('en-GB', { day: '2-digit' }).format(date);
    if (index === 0 || date.getDate() === 1) {
      const month = new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(date);
      return `${day} ${month}`;
    }
    return day;
  }

  function reportAxisBounds(values, tickCount) {
    let minimum = Math.min(0, ...values);
    let maximum = Math.max(0, ...values);
    if (minimum === maximum) maximum = minimum + 1;
    const roughStep = (maximum - minimum) / tickCount;
    const magnitude = 10 ** Math.floor(Math.log10(Math.max(roughStep, Number.EPSILON)));
    const normalized = roughStep / magnitude;
    const multiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
    const step = multiplier * magnitude;
    minimum = Math.floor(minimum / step) * step;
    maximum = Math.ceil(maximum / step) * step;
    if (minimum === maximum) maximum = minimum + step;
    return { min: minimum, max: maximum };
  }

  function reportCountAxisBounds(values, tickCount) {
    const maximum = Math.max(0, ...values);
    return {
      min: 0,
      max: Math.max(tickCount, Math.ceil(maximum / tickCount) * tickCount),
    };
  }

  function reportChartLabelIndexes(length, maximumLabels) {
    const indexes = new Set();
    if (!length) return indexes;
    if (length <= maximumLabels) {
      for (let index = 0; index < length; index += 1) indexes.add(index);
      return indexes;
    }
    for (let index = 0; index < maximumLabels; index += 1) {
      indexes.add(Math.round(index * (length - 1) / (maximumLabels - 1)));
    }
    return indexes;
  }

  function formatReportBucketLabel(value, grain, verbose = false) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value || '');
    if (grain === 'hour') {
      return new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        ...(verbose ? { day: '2-digit', month: 'short' } : {}),
      }).format(date);
    }
    if (grain === 'month') {
      return new Intl.DateTimeFormat('en-GB', { month: 'short', year: verbose ? 'numeric' : '2-digit' }).format(date);
    }
    return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', ...(verbose ? { year: 'numeric' } : {}) }).format(date);
  }

  function formatReportAxisValue(value, metric) {
    if (!metric?.currency) return formatNumber(Math.round(reportNumber(value)));
    const number = Number(value);
    if (!Number.isFinite(number)) return '£0';
    const absolute = Math.abs(number);
    const sign = number < 0 ? '-' : '';
    if (absolute >= 1000000) return `${sign}£${trimReportDecimal(absolute / 1000000)}m`;
    if (absolute >= 1000) return `${sign}£${trimReportDecimal(absolute / 1000)}k`;
    return `${sign}£${trimReportDecimal(absolute)}`;
  }

  function trimReportDecimal(value) {
    if (!value) return '0';
    return Number(value.toPrecision(3)).toString();
  }

  function reportPeriodDates(start, end) {
    const startLabel = formatReportIsoDate(start);
    const endLabel = formatReportIsoDate(end);
    if (!startLabel) return endLabel;
    if (!endLabel || start === end) return startLabel;
    return `${startLabel} – ${endLabel}`;
  }

  function formatReportIsoDate(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
  }

  function formatReportPercent(value) {
    const number = Number(value);
    return `${Number.isFinite(number) ? number.toFixed(1) : '0.0'}%`;
  }

  function reportNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function setCurrentUser(user) {
    state.currentUser = user || null;
    syncDatabaseHomeAccess();
    updateNewOrderTakenBy();
    populateNewCustomerAccountManagers();
    if (state.usersLoaded) renderRegisteredUsers();
  }

  function isDatabaseHomeAccessRestrictedUser(user = state.currentUser || window.ultimateHubUser) {
    const fullName = String(
      user?.full_name || [user?.first_name, user?.last_name].filter(Boolean).join(' ')
    ).trim().replace(/\s+/g, ' ').toLowerCase();
    return DATABASE_RESTRICTED_HOME_USERS.has(fullName);
  }

  function syncDatabaseHomeAccess() {
    const restricted = isDatabaseHomeAccessRestrictedUser();
    const restrictedButtons = [
      els.stockOrderingHomeButton,
      els.usersHomeButton,
      els.reportsHomeButton,
      els.toInvoiceHomeButton,
    ];
    restrictedButtons.forEach((button) => {
      if (!button) return;
      button.disabled = restricted;
      button.setAttribute('aria-disabled', restricted ? 'true' : 'false');
      button.title = restricted ? 'This page is unavailable for this user' : '';
    });
    if (!restricted) return;

    state.viewHistory = state.viewHistory.filter((view) => !DATABASE_RESTRICTED_HOME_VIEWS.has(view));
    if (DATABASE_RESTRICTED_HOME_VIEWS.has(state.activeView)) {
      if (state.activeView === 'reports') {
        state.reportsRequest += 1;
        state.reportsLoading = false;
      }
      showHome({ skipHistory: true });
    }
  }

  function currentUserFullName() {
    const user = state.currentUser || window.ultimateHubUser || null;
    return user?.full_name || [user?.first_name, user?.last_name].filter(Boolean).join(' ');
  }

  function updateNewOrderTakenBy() {
    const select = document.getElementById('db-new-order-taken-by');
    if (!select) return;
    const name = currentUserFullName();
    if (!name) return;
    select.innerHTML = `<option value="${escapeAttr(name)}">${escapeHtml(name)}</option>`;
    select.value = name;
  }

  function resetNewOrderForm() {
    els.newOrderForm.reset();
    clearTimeout(customerSearchTimer);
    customerSearchRequest += 1;
    state.selectedCustomer = null;
    state.newOrderCustomerDetail = null;
    state.customerResults = [];
    closeCustomerResults();
    populateNewOrderCustomerChoices();
    const today = new Date();
    const delivery = addDays(today, 14);
    document.getElementById('db-new-order-date').value = formatLegacyInputDate(today);
    document.getElementById('db-new-delivery-date').value = formatLegacyInputDate(delivery);
    updateNewOrderTakenBy();
    els.newOrderStatus.textContent = '';
    els.newOrderStatus.dataset.tone = '';
    validateNewOrderForm();
  }

  function validateNewOrderForm() {
    els.newOrderAccept.disabled = state.newOrderSubmitting;
    if (
      els.newOrderStatus?.dataset.tone === 'error'
      && String(els.newOrderStatus.textContent || '').startsWith('Missing required fields:')
      && !missingNewOrderFields().length
    ) {
      els.newOrderStatus.textContent = '';
      els.newOrderStatus.dataset.tone = '';
    }
  }

  function resetNewCustomerForm() {
    if (!els.newCustomerForm) return;
    els.newCustomerForm.reset();
    populateNewCustomerAccountManagers();
    els.newCustomerStatus.textContent = '';
    els.newCustomerStatus.dataset.tone = '';
    validateNewCustomerForm();
  }

  function validateNewCustomerForm() {
    if (!els.newCustomerForm || !els.newCustomerAccept) return;
    const fields = els.newCustomerForm.elements;
    const valid = Boolean(
      fields.customer_name.value.trim()
      && fields.customer_code.value.trim()
    );
    els.newCustomerAccept.disabled = !valid || state.newCustomerSubmitting;
  }

  function populateNewCustomerAccountManagers() {
    const select = els.newCustomerAccountManager;
    if (!select) return;
    const currentValue = select.value;
    const users = state.customerUsers || [];
    const options = ['<option value=""></option>'];
    const seen = new Set();

    users.forEach((user) => {
      const id = String(user.id || '');
      const name = user.full_name || [user.first_name, user.last_name].filter(Boolean).join(' ');
      const key = id || String(name || '').trim().toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      options.push(`<option value="${escapeAttr(id)}">${escapeHtml(name || user.email || id)}</option>`);
    });

    select.innerHTML = options.join('');
    const currentUserId = String((state.currentUser || window.ultimateHubUser || {}).id || '');
    if (currentValue && Array.from(select.options).some((option) => option.value === currentValue)) {
      select.value = currentValue;
    } else if (currentUserId && Array.from(select.options).some((option) => option.value === currentUserId)) {
      select.value = currentUserId;
    }
  }

  function resetNewContactForm() {
    if (!els.addContactForm) return;
    els.addContactForm.reset();
    const customer = state.selectedCustomerDetail || {};
    const code = customer.customer_code || customer.business_name || 'Customer';
    if (els.addContactTitle) els.addContactTitle.textContent = `${code} - Add contact`;
    els.addContactStatus.textContent = '';
    els.addContactStatus.dataset.tone = '';
    validateNewContactForm();
  }

  function validateNewContactForm() {
    if (!els.addContactForm || !els.addContactAccept) return;
    const fields = els.addContactForm.elements;
    const valid = Boolean(fields.contact_first_name.value.trim());
    els.addContactAccept.disabled = !valid || state.newContactSubmitting;
  }

  function handleNewCustomerInput() {
    state.selectedCustomer = null;
    state.newOrderCustomerDetail = null;
    populateNewOrderCustomerChoices();
    const query = els.newCustomerInput.value.trim();
    clearTimeout(customerSearchTimer);

    if (!query) {
      customerSearchRequest += 1;
      state.customerResults = [];
      closeCustomerResults();
      validateNewOrderForm();
      return;
    }

    customerSearchTimer = window.setTimeout(() => {
      searchCustomers(query);
    }, CUSTOMER_SEARCH_DELAY);
    validateNewOrderForm();
  }

  async function searchCustomers(query) {
    const requestId = ++customerSearchRequest;

    try {
      const results = await fetchJson(`/api/database/customers/search?q=${encodeURIComponent(query)}`);
      if (requestId !== customerSearchRequest || els.newCustomerInput.value.trim() !== query) return;
      state.customerResults = rankCustomers(Array.isArray(results) ? results : [], query);
      renderCustomerResults(state.customerResults, query);
    } catch {
      if (requestId !== customerSearchRequest || els.newCustomerInput.value.trim() !== query) return;
      state.customerResults = [];
      renderCustomerResults([], query);
    }
  }

  function rankCustomers(customers, query) {
    const normalized = query.trim().toLowerCase();
    return customers.slice().sort((a, b) => {
      const aName = String(a.business_name || '').trim().toLowerCase();
      const bName = String(b.business_name || '').trim().toLowerCase();
      const aContact = String(a.contact_name || '').trim().toLowerCase();
      const bContact = String(b.contact_name || '').trim().toLowerCase();
      const aScore = customerMatchScore(aName, aContact, normalized);
      const bScore = customerMatchScore(bName, bContact, normalized);
      if (aScore !== bScore) return aScore - bScore;
      return aName.localeCompare(bName);
    });
  }

  function customerMatchScore(name, contact, query) {
    if (name === query) return 0;
    if (name.startsWith(query)) return 1;
    if (contact === query) return 2;
    if (contact.startsWith(query)) return 3;
    if (name.includes(query)) return 4;
    if (contact.includes(query)) return 5;
    return 6;
  }

  function showExistingCustomerResults() {
    const query = els.newCustomerInput.value.trim();
    if (!query) return;
    if (state.customerResults.length) {
      renderCustomerResults(state.customerResults, query);
      return;
    }
    searchCustomers(query);
  }

  function renderCustomerResults(results, query) {
    if (!els.newCustomerResults) return;
    if (!query.trim()) {
      closeCustomerResults();
      return;
    }

    if (!results.length) {
      els.newCustomerResults.innerHTML = '<div class="db-customer-result-empty">No matching customers</div>';
      els.newCustomerResults.classList.add('open');
      return;
    }

    els.newCustomerResults.innerHTML = results.map((customer, index) => {
      const name = customer.business_name || '';
      const contact = customer.contact_name || customer.email || '';
      const exact = name.trim().toLowerCase() === query.trim().toLowerCase();
      return `
        <button class="db-customer-result ${exact ? 'active' : ''}" type="button" role="option" data-customer-index="${index}">
          <span class="db-customer-result-name">${highlightMatch(name, query)}</span>
          ${contact ? `<span class="db-customer-result-contact">${highlightMatch(contact, query)}</span>` : ''}
        </button>
      `;
    }).join('');
    els.newCustomerResults.classList.add('open');
  }

  function handleCustomerResultClick(event) {
    const result = event.target.closest('[data-customer-index]');
    if (!result) return;
    const index = Number.parseInt(result.dataset.customerIndex, 10);
    const customer = state.customerResults[index];
    if (customer) selectCustomer(customer);
  }

  function handleCustomerSearchKeydown(event) {
    if (event.key !== 'Enter' || !els.newCustomerResults.classList.contains('open')) return;
    const first = state.customerResults[0];
    if (!first) return;
    event.preventDefault();
    selectCustomer(first);
  }

  function handleDocumentClick(event) {
    if (els.newCustomerResults && els.newCustomerInput) {
      const insideCustomerSearch = event.target === els.newCustomerInput || els.newCustomerResults.contains(event.target);
      if (!insideCustomerSearch) closeCustomerResults();
    }

    const productResults = els.itemsPanel?.querySelector('.db-product-results');
    const insideProductSearch = event.target.closest('[data-line-search]')
      || (productResults && productResults.contains(event.target));
    if (!insideProductSearch) closeProductResults();
  }

  function selectCustomer(customer) {
    state.selectedCustomer = customer;
    state.newOrderCustomerDetail = null;
    els.newCustomerInput.value = customer.business_name || '';

    const invoiceAddress = formatCustomerAddress(customer, 'inv') || '';
    const deliveryAddress = formatCustomerAddress(customer, 'ship') || '';
    populateNewOrderCustomerChoices({
      contactName: customer.contact_name || '',
      invoiceAddress: invoiceAddress || deliveryAddress || customer.business_name || '',
      deliveryAddress: deliveryAddress || invoiceAddress || customer.business_name || '',
    });
    loadNewOrderCustomerDetail(customer);

    state.customerResults = [];
    closeCustomerResults();
    validateNewOrderForm();
  }

  function closeCustomerResults() {
    if (!els.newCustomerResults) return;
    els.newCustomerResults.classList.remove('open');
    els.newCustomerResults.innerHTML = '';
  }

  function formatCustomerAddress(customer, prefix) {
    if (prefix === 'inv' && customer.invoice_address) return String(customer.invoice_address).trim();
    if (prefix === 'ship' && customer.delivery_address) return String(customer.delivery_address).trim();
    return [
      customer[`${prefix}_line1`],
      customer[`${prefix}_line2`],
      customer[`${prefix}_city`],
      customer[`${prefix}_region`],
      customer[`${prefix}_postcode`],
      customer[`${prefix}_country`],
    ].map((part) => String(part || '').trim()).filter(Boolean).join(', ');
  }

  async function loadNewOrderCustomerDetail(customer) {
    const key = customerKeyForRecord(customer);
    if (!key) return;
    const selectedKey = key;

    try {
      const detail = await fetchJson(`/api/database/customers/${encodeURIComponent(key)}`);
      if (!state.selectedCustomer || customerKeyForRecord(state.selectedCustomer) !== selectedKey) return;
      state.newOrderCustomerDetail = detail;
      populateNewOrderCustomerChoices();
    } catch (err) {
      console.warn('New order customer detail load failed', err);
    }
  }

  async function loadOrderCustomerDetail(job) {
    const key = customerKeyForRecord({
      customer_id: job?.customer_id,
      business_name: job?.customer_name,
      customer_key: job?.customer_key,
    });
    if (!key) return null;

    try {
      return await fetchJson(`/api/database/customers/${encodeURIComponent(key)}`);
    } catch (err) {
      console.warn('Order customer detail load failed', err);
      return null;
    }
  }

  function populateNewOrderCustomerChoices(fallback = {}) {
    populateContactSelect(els.newContactInput, newOrderContactChoices(fallback.contactName));
    populateAddressSelect(
      els.newDeliveryAddress,
      newOrderAddressChoices('delivery', fallback.deliveryAddress),
      fallback.deliveryAddress
    );
    populateAddressSelect(
      els.newInvoiceAddress,
      newOrderAddressChoices('invoice', fallback.invoiceAddress),
      fallback.invoiceAddress
    );
  }

  function newOrderContactChoices(fallbackContactName = '') {
    const contacts = [];
    for (const contact of state.newOrderCustomerDetail?.contacts || []) {
      const normalized = normalizeCustomerContact(contact);
      if (normalized.contact_name || normalized.contact_email || normalized.contact_phone || normalized.contact_mobile) {
        contacts.push(normalized);
      }
    }

    const selected = state.selectedCustomer || {};
    if (!contacts.length && (selected.contact_name || fallbackContactName)) {
      contacts.push(normalizeCustomerContact({
        contact_id: selected.contact_id,
        contact_name: fallbackContactName || selected.contact_name,
        contact_phone: selected.contact_phone,
        contact_mobile: selected.contact_mobile,
        contact_email: selected.contact_email || selected.email,
      }));
    }

    return dedupeContacts(contacts);
  }

  function newOrderAddressChoices(role, fallbackAddress = '') {
    const selected = state.selectedCustomer || {};
    const directAddress = role === 'invoice'
      ? (fallbackAddress || selected.invoice_address)
      : (fallbackAddress || selected.delivery_address);
    return customerAddressChoicesForRole(state.newOrderCustomerDetail, role, directAddress);
  }

  function populateContactSelect(select, contacts) {
    if (!select) return;
    const current = select.value;
    const options = ['<option value=""></option>'];
    contacts.forEach((contact, index) => {
      const value = contactOptionValue(contact, index);
      options.push(`
        <option
          value="${escapeAttr(value)}"
          data-contact-index="${escapeAttr(index)}"
        >${escapeHtml(contactOptionLabel(contact))}</option>
      `);
    });
    select.innerHTML = options.join('');
    select.dataset.contactChoices = JSON.stringify(contacts);
    select.value = contacts.some((contact, index) => contactOptionValue(contact, index) === current)
      ? current
      : (contacts.length ? contactOptionValue(contacts[0], 0) : '');
  }

  function populateAddressSelect(select, addresses, preferredAddress = '') {
    if (!select) return;
    const current = preferredAddress || select.value;
    const options = addresses.length ? [] : ['<option value=""></option>'];
    addresses.forEach((address, index) => {
      options.push(`
        <option
          value="${escapeAttr(address.address || '')}"
          data-address-index="${escapeAttr(index)}"
        >${escapeHtml(addressOptionLabel(address))}</option>
      `);
    });
    select.innerHTML = options.join('');
    select.dataset.addressChoices = JSON.stringify(addresses);
    const normalizedCurrent = normalizeOrderAckText(current);
    const matching = addresses.find((address) => normalizeOrderAckText(address.address) === normalizedCurrent);
    select.value = matching?.address || addresses[0]?.address || '';
  }

  function selectedNewOrderContact() {
    return selectedContactFromSelect(els.newContactInput);
  }

  function selectedNewOrderAddress(role) {
    return selectedAddressFromSelect(role === 'invoice' ? els.newInvoiceAddress : els.newDeliveryAddress);
  }

  function selectedContactFromSelect(select) {
    if (!select) return null;
    const choices = parseSelectChoices(select.dataset.contactChoices);
    const selectedOption = select.selectedOptions?.[0];
    const index = Number.parseInt(selectedOption?.dataset.contactIndex, 10);
    return Number.isFinite(index) ? choices[index] || null : null;
  }

  function selectedAddressFromSelect(select) {
    if (!select) return null;
    const choices = parseSelectChoices(select.dataset.addressChoices);
    const selectedOption = select.selectedOptions?.[0];
    const index = Number.parseInt(selectedOption?.dataset.addressIndex, 10);
    return Number.isFinite(index) ? choices[index] || null : null;
  }

  function parseSelectChoices(value) {
    try {
      const parsed = JSON.parse(value || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function normalizeCustomerContact(contact) {
    return {
      contact_id: contact?.contact_id || null,
      contact_name: contact?.contact_name || contactNameFromParts(contact?.contact_title, contact?.contact_first_name, contact?.contact_last_name) || '',
      contact_phone: contact?.contact_phone || '',
      contact_mobile: contact?.contact_mobile || '',
      contact_email: contact?.contact_email || contact?.email || '',
    };
  }

  function dedupeContacts(contacts) {
    const seen = new Set();
    const uniqueContacts = [];
    for (const contact of contacts || []) {
      const key = [
        contact.contact_id || '',
        normalizeOrderAckText(contact.contact_name),
        normalizeOrderAckText(contact.contact_email),
        normalizeOrderAckText(contact.contact_phone),
      ].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueContacts.push(contact);
    }
    return uniqueContacts;
  }

  function contactOptionLabel(contact) {
    const name = contact.contact_name || contact.contact_email || contact.contact_phone || 'Contact';
    const meta = [contact.contact_email, contact.contact_phone || contact.contact_mobile].filter(Boolean).join(' | ');
    return meta ? `${name} - ${meta}` : name;
  }

  function contactOptionValue(contact, index) {
    return contact.contact_name || contact.contact_email || contact.contact_phone || contact.contact_mobile || `contact:${index}`;
  }

  function contactNameFromParts(title, firstName, lastName) {
    return [title, firstName, lastName].map((part) => String(part || '').trim()).filter(Boolean).join(' ');
  }

  function customerAddressChoices(detail, fallbackAddress = '') {
    const addresses = [];
    for (const address of detail?.addresses || []) {
      const normalized = normalizeCustomerAddress(address);
      if (normalized.address) addresses.push(normalized);
    }
    if (fallbackAddress) addresses.push(normalizeCustomerAddress({ address: fallbackAddress, address_type: 'Address' }));
    return dedupeAddresses(addresses);
  }

  function normalizeCustomerAddress(address) {
    const addressText = address?.address || [
      address?.address_line1,
      address?.address_line2,
      address?.address_line3,
      address?.address_line4,
      address?.address_line5,
      address?.postcode,
    ].map((part) => String(part || '').trim()).filter(Boolean).join(', ');
    return {
      source_address_id: address?.source_address_id || null,
      address_type: address?.address_type || '',
      address: String(addressText || '').trim(),
    };
  }

  function dedupeAddresses(addresses) {
    const seen = new Set();
    const uniqueAddresses = [];
    for (const address of addresses || []) {
      const key = normalizeOrderAckText(address.address);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      uniqueAddresses.push(address);
    }
    return uniqueAddresses;
  }

  function customerAddressChoicesForRole(detail, role, fallbackAddress = '') {
    const addresses = customerAddressChoices(detail);
    const matchingAddresses = addresses.filter((address) => customerAddressHasRole(address, role));
    const genericAddresses = addresses.filter((address) => {
      const type = String(address?.address_type || '').trim().toLowerCase();
      return !type || type === 'address';
    });
    const choices = matchingAddresses.length ? matchingAddresses : genericAddresses;
    if (!fallbackAddress) return choices;

    const normalizedFallback = normalizeCustomerAddress({ address: fallbackAddress });
    const storedFallback = addresses.find((address) => (
      normalizeOrderAckText(address.address) === normalizeOrderAckText(fallbackAddress)
    ));
    return dedupeAddresses([storedFallback || normalizedFallback, ...choices]);
  }

  function addressOptionLabel(address) {
    return String(address.address || '').replace(/\s*,\s*/g, ', ');
  }

  function highlightMatch(value, query) {
    const text = String(value || '');
    const clean = query.trim();
    if (!clean) return escapeHtml(text);
    const index = text.toLowerCase().indexOf(clean.toLowerCase());
    if (index === -1) return escapeHtml(text);
    const before = text.slice(0, index);
    const match = text.slice(index, index + clean.length);
    const after = text.slice(index + clean.length);
    return `${escapeHtml(before)}<span class="match">${escapeHtml(match)}</span>${escapeHtml(after)}`;
  }

  async function submitNewOrder(event) {
    event.preventDefault();
    if (state.newOrderSubmitting) return;
    validateNewOrderForm();
    const missingFields = missingNewOrderFields();
    if (missingFields.length) {
      els.newOrderStatus.textContent = `Missing required fields: ${missingFields.join(', ')}`;
      els.newOrderStatus.dataset.tone = 'error';
      return;
    }

    state.newOrderSubmitting = true;
    validateNewOrderForm();
    els.newOrderStatus.textContent = 'Creating order...';
    els.newOrderStatus.dataset.tone = 'info';

    try {
      const payload = collectNewOrderPayload();
      const response = await fetch('/api/database/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) {
          window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search + window.location.hash)}`);
          return;
        }
        throw new Error(data.error || `Request failed: ${response.status}`);
      }

      state.loadedHome = false;
      state.loadedOrderMode = '';
      els.newOrderStatus.textContent = `Created order ${data.job?.order_no || ''}`;
      els.newOrderStatus.dataset.tone = 'success';
      await openOrder(data.job.source_order_id, 'details');
      loadHomeMetrics();
    } catch (err) {
      els.newOrderStatus.textContent = err.message;
      els.newOrderStatus.dataset.tone = 'error';
    } finally {
      state.newOrderSubmitting = false;
      validateNewOrderForm();
    }
  }

  function missingNewOrderFields() {
    const fields = els.newOrderForm.elements;
    return NEW_ORDER_REQUIRED_FIELDS
      .filter((field) => !String(fields[field.name]?.value || '').trim())
      .map((field) => field.label);
  }

  async function submitNewCustomer(event) {
    event.preventDefault();
    if (state.newCustomerSubmitting) return;
    validateNewCustomerForm();
    if (els.newCustomerAccept.disabled) return;

    state.newCustomerSubmitting = true;
    validateNewCustomerForm();
    els.newCustomerStatus.textContent = 'Creating customer...';
    els.newCustomerStatus.dataset.tone = 'info';

    try {
      const payload = collectNewCustomerPayload();
      const data = await fetchJson('/api/database/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      state.loadedCustomers = false;
      state.databaseCustomers = [];
      els.newCustomerStatus.textContent = `Created customer ${data.customer?.business_name || ''}`;
      els.newCustomerStatus.dataset.tone = 'success';
      await openCustomer(data.customer.customer_key, 'orders');
    } catch (err) {
      els.newCustomerStatus.textContent = err.message;
      els.newCustomerStatus.dataset.tone = 'error';
    } finally {
      state.newCustomerSubmitting = false;
      validateNewCustomerForm();
    }
  }

  async function submitNewContact(event) {
    event.preventDefault();
    if (state.newContactSubmitting) return;
    validateNewContactForm();
    if (els.addContactAccept.disabled) return;

    const customerKey = state.selectedCustomerDetail?.customer_key;
    if (!customerKey) return;

    state.newContactSubmitting = true;
    validateNewContactForm();
    els.addContactStatus.textContent = 'Creating contact...';
    els.addContactStatus.dataset.tone = 'info';

    try {
      await fetchJson(`/api/database/customers/${encodeURIComponent(customerKey)}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(collectNewContactPayload()),
      });

      els.addContactStatus.textContent = 'Created contact';
      els.addContactStatus.dataset.tone = 'success';
      await openCustomer(customerKey, 'contacts');
    } catch (err) {
      els.addContactStatus.textContent = err.message;
      els.addContactStatus.dataset.tone = 'error';
    } finally {
      state.newContactSubmitting = false;
      validateNewContactForm();
    }
  }

  function collectNewContactPayload() {
    const fields = els.addContactForm.elements;
    return {
      contact_title: fields.contact_title.value,
      contact_first_name: fields.contact_first_name.value,
      contact_last_name: fields.contact_last_name.value,
      contact_phone: fields.contact_phone.value,
      contact_fax: fields.contact_fax.value,
      contact_mobile: fields.contact_mobile.value,
      contact_email: fields.contact_email.value,
      contact_address: fields.contact_address.value,
    };
  }

  function collectNewCustomerPayload() {
    const fields = els.newCustomerForm.elements;
    return {
      customer_name: fields.customer_name.value,
      customer_code: fields.customer_code.value,
      contact_name: fields.contact_name.value,
      contact_phone: fields.contact_phone.value,
      contact_mobile: fields.contact_mobile.value,
      contact_email: fields.contact_email.value,
      invoice_address_line1: fields.invoice_address_line1.value,
      invoice_address_line2: fields.invoice_address_line2.value,
      invoice_address_line3: fields.invoice_address_line3.value,
      invoice_address_line4: fields.invoice_address_line4.value,
      invoice_address_line5: fields.invoice_address_line5.value,
      invoice_postcode: fields.invoice_postcode.value,
      delivery_address_line1: fields.delivery_address_line1.value,
      delivery_address_line2: fields.delivery_address_line2.value,
      delivery_address_line3: fields.delivery_address_line3.value,
      delivery_address_line4: fields.delivery_address_line4.value,
      delivery_address_line5: fields.delivery_address_line5.value,
      delivery_postcode: fields.delivery_postcode.value,
      account_manager_user_id: fields.account_manager_user_id.value,
    };
  }

  function collectNewOrderPayload() {
    const fields = els.newOrderForm.elements;
    const selectedCustomer = selectedDatabaseCustomer(fields.customer_name.value);
    const selectedContact = selectedNewOrderContact();
    const deliveryAddress = selectedNewOrderAddress('delivery');
    const invoiceAddress = selectedNewOrderAddress('invoice');
    return {
      customer_id: selectedCustomer?.customer_id,
      customer_name: fields.customer_name.value,
      customer_code: selectedCustomer?.customer_code,
      contact_id: selectedContact?.contact_id || selectedCustomer?.contact_id,
      contact_name: selectedContact?.contact_name || fields.contact_name.value,
      contact_phone: selectedContact?.contact_phone || selectedCustomer?.contact_phone,
      contact_mobile: selectedContact?.contact_mobile || selectedCustomer?.contact_mobile,
      contact_email: selectedContact?.contact_email || selectedCustomer?.contact_email || selectedCustomer?.email,
      order_type: fields.order_type.value,
      job_title: fields.job_title.value,
      order_date: legacyInputDateToIso(fields.order_date.value),
      delivery_date: legacyInputDateToIso(fields.delivery_date.value),
      customer_date_required: false,
      delivery_method: fields.delivery_method.value,
      payment_terms: fields.payment_terms.value,
      order_taken_by: fields.order_taken_by.value,
      delivery_address_id: deliveryAddress?.source_address_id || null,
      delivery_address: deliveryAddress?.address || fields.delivery_address.value,
      invoice_address_id: invoiceAddress?.source_address_id || null,
      invoice_address: invoiceAddress?.address || fields.invoice_address.value,
      invoice_required: fields.invoice_required.value,
      client_order_no: fields.client_order_no.value,
    };
  }

  function selectedDatabaseCustomer(customerName) {
    if (!state.selectedCustomer) return null;
    const selectedName = String(state.selectedCustomer.business_name || '').trim().toLowerCase();
    const currentName = String(customerName || '').trim().toLowerCase();
    return selectedName && selectedName === currentName ? state.selectedCustomer : null;
  }

  function handleDatabaseCustomerSearchInput() {
    state.databaseCustomerQuery = els.customersSearch.value.trim();
    persistDatabaseRoute();
    clearTimeout(databaseCustomerSearchTimer);
    databaseCustomerSearchTimer = window.setTimeout(() => {
      loadDatabaseCustomers({ force: true });
    }, CUSTOMER_SEARCH_DELAY);
  }

  function handleDatabaseCustomerSortChange() {
    state.databaseCustomerSort = normalizeDatabaseCustomerSort(els.customersSort?.value);
    if (els.customersSort && els.customersSort.value !== state.databaseCustomerSort) {
      els.customersSort.value = state.databaseCustomerSort;
    }
    persistDatabaseRoute();
    loadDatabaseCustomers({ force: true });
  }

  async function handleDatabaseCustomerRowClick(event) {
    const row = event.target.closest('tr[data-customer-key]');
    if (!row) return;
    await flushOrderAutosaves();
    openCustomer(row.dataset.customerKey, 'orders');
  }

  async function handleDatabaseCustomerRowKeydown(event) {
    if (event.key !== 'Enter') return;
    const row = event.target.closest('tr[data-customer-key]');
    if (!row) return;
    await flushOrderAutosaves();
    openCustomer(row.dataset.customerKey, 'orders');
  }

  async function handleCustomerOrderRowClick(event) {
    const repeatOrderButton = event.target.closest('[data-db-repeat-order]');
    if (repeatOrderButton) {
      event.preventDefault();
      event.stopPropagation();
      openRepeatOrderConfirmation(repeatOrderButton.dataset.dbRepeatOrder);
      return;
    }

    const invoiceButton = event.target.closest('[data-db-invoice-job]');
    if (invoiceButton) {
      await openInvoiceFromOrderList(invoiceButton.dataset.dbInvoiceJob);
      return;
    }

    const row = event.target.closest('tr[data-job-id]');
    if (!row) return;
    await flushOrderAutosaves();
    openOrder(row.dataset.jobId, 'details');
  }

  async function handleCustomerOrderRowKeydown(event) {
    if (event.key !== 'Enter') return;
    if (event.target.closest('[data-db-repeat-order]')) return;
    if (event.target.closest('[data-db-invoice-job]')) return;
    const row = event.target.closest('tr[data-job-id]');
    if (!row) return;
    await flushOrderAutosaves();
    openOrder(row.dataset.jobId, 'details');
  }

  function openRepeatOrderConfirmation(sourceOrderId) {
    const id = Number.parseInt(sourceOrderId, 10);
    if (!Number.isFinite(id) || state.repeatOrderSaving) return;

    state.repeatOrderTarget = { sourceOrderId: id };
    state.repeatOrderSaving = false;
    const modal = ensureRepeatOrderModal();
    const error = modal.querySelector('.db-repeat-order-error');
    if (error) error.textContent = '';
    setRepeatOrderModalSaving(false);
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open', 'db-repeat-order-open');

    window.requestAnimationFrame(() => {
      modal.querySelector('[data-db-repeat-order-choice="cancel"]')?.focus();
    });
  }

  function ensureRepeatOrderModal() {
    let modal = document.getElementById('db-repeat-order-modal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'db-repeat-order-modal';
    modal.className = 'db-repeat-order-modal';
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="db-repeat-order-shell" role="dialog" aria-modal="true" aria-labelledby="db-repeat-order-title">
        <div class="db-repeat-order-title" id="db-repeat-order-title">Repeat Order</div>
        <div class="db-repeat-order-message">Copy line items?</div>
        <div class="db-repeat-order-error" aria-live="polite"></div>
        <div class="db-repeat-order-actions">
          <button class="db-repeat-order-choice" type="button" data-db-repeat-order-choice="yes">Yes</button>
          <button class="db-repeat-order-choice" type="button" data-db-repeat-order-choice="no">No</button>
          <button class="db-repeat-order-choice" type="button" data-db-repeat-order-choice="cancel">Cancel</button>
        </div>
      </div>
    `;
    modal.addEventListener('click', handleRepeatOrderModalClick);
    document.body.appendChild(modal);
    return modal;
  }

  function handleRepeatOrderModalClick(event) {
    const modal = document.getElementById('db-repeat-order-modal');
    if (!modal || modal.hidden) return;

    if (event.target === modal) {
      closeRepeatOrderConfirmation();
      return;
    }

    const button = event.target.closest('[data-db-repeat-order-choice]');
    if (!button || state.repeatOrderSaving) return;
    const choice = button.dataset.dbRepeatOrderChoice;
    if (choice === 'cancel') {
      closeRepeatOrderConfirmation();
      return;
    }
    if (choice === 'yes' || choice === 'no') {
      repeatSelectedOrder(choice === 'yes', choice);
    }
  }

  async function repeatSelectedOrder(copyLineItems, choice) {
    const target = state.repeatOrderTarget;
    if (!target || state.repeatOrderSaving) return;

    state.repeatOrderSaving = true;
    setRepeatOrderModalSaving(true, choice);
    const modal = document.getElementById('db-repeat-order-modal');
    const error = modal?.querySelector('.db-repeat-order-error');
    if (error) error.textContent = '';

    try {
      await flushOrderAutosaves();
      const data = await fetchJson(`/api/database/jobs/${encodeURIComponent(target.sourceOrderId)}/repeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ copy_line_items: copyLineItems }),
      });
      const job = data.job || {};
      if (!job.source_order_id) throw new Error('The repeated order was created without a job id');

      state.selectedCustomerOrders = [
        job,
        ...(state.selectedCustomerOrders || []).filter(order => (
          Number(order.source_order_id) !== Number(job.source_order_id)
        )),
      ];
      renderCustomerOrders();
      state.repeatOrderSaving = false;
      closeRepeatOrderConfirmation();
      await openOrder(job.source_order_id, 'details');
    } catch (err) {
      state.repeatOrderSaving = false;
      setRepeatOrderModalSaving(false);
      if (error) error.textContent = err.message || 'Failed to repeat order';
    }
  }

  function setRepeatOrderModalSaving(saving, choice = '') {
    const modal = document.getElementById('db-repeat-order-modal');
    if (!modal) return;
    modal.querySelectorAll('[data-db-repeat-order-choice]').forEach((button) => {
      button.disabled = saving;
      const buttonChoice = button.dataset.dbRepeatOrderChoice;
      if (buttonChoice === 'yes') button.textContent = saving && choice === 'yes' ? 'Copying...' : 'Yes';
      if (buttonChoice === 'no') button.textContent = saving && choice === 'no' ? 'Copying...' : 'No';
      if (buttonChoice === 'cancel') button.textContent = 'Cancel';
    });
  }

  function closeRepeatOrderConfirmation() {
    if (state.repeatOrderSaving) return;
    const modal = document.getElementById('db-repeat-order-modal');
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open', 'db-repeat-order-open');
    state.repeatOrderTarget = null;
  }

  function openNoInvoiceCloseConfirmation() {
    const sourceOrderId = Number(state.selectedJob?.source_order_id);
    if (!Number.isFinite(sourceOrderId)
      || !invoiceNotRequired(state.selectedJob)
      || truthy(state.selectedJob?.closed_without_invoice)
      || state.noInvoiceCloseSaving) {
      return;
    }

    state.noInvoiceCloseTarget = { sourceOrderId };
    const modal = ensureNoInvoiceCloseModal();
    const error = modal.querySelector('.db-no-invoice-close-error');
    if (error) error.textContent = '';
    setNoInvoiceCloseModalSaving(false);
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open', 'db-no-invoice-close-open');

    window.requestAnimationFrame(() => {
      modal.querySelector('[data-db-no-invoice-close-choice="cancel"]')?.focus();
    });
  }

  function ensureNoInvoiceCloseModal() {
    let modal = document.getElementById('db-no-invoice-close-modal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'db-no-invoice-close-modal';
    modal.className = 'db-no-invoice-close-modal';
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="db-no-invoice-close-shell" role="dialog" aria-modal="true" aria-labelledby="db-no-invoice-close-title">
        <div class="db-no-invoice-close-title" id="db-no-invoice-close-title">Close Order</div>
        <div class="db-no-invoice-close-message">Are you sure?</div>
        <div class="db-no-invoice-close-error" aria-live="polite"></div>
        <div class="db-no-invoice-close-actions">
          <button class="db-no-invoice-close-choice" type="button" data-db-no-invoice-close-choice="yes">Yes</button>
          <button class="db-no-invoice-close-choice" type="button" data-db-no-invoice-close-choice="cancel">Cancel</button>
        </div>
      </div>
    `;
    modal.addEventListener('click', handleNoInvoiceCloseModalClick);
    document.body.appendChild(modal);
    return modal;
  }

  function handleNoInvoiceCloseModalClick(event) {
    const modal = document.getElementById('db-no-invoice-close-modal');
    if (!modal || modal.hidden || state.noInvoiceCloseSaving) return;

    if (event.target === modal) {
      closeNoInvoiceCloseConfirmation();
      return;
    }

    const button = event.target.closest('[data-db-no-invoice-close-choice]');
    if (!button) return;
    if (button.dataset.dbNoInvoiceCloseChoice === 'cancel') {
      closeNoInvoiceCloseConfirmation();
      return;
    }
    if (button.dataset.dbNoInvoiceCloseChoice === 'yes') closeSelectedNoInvoiceOrder();
  }

  async function closeSelectedNoInvoiceOrder() {
    const target = state.noInvoiceCloseTarget;
    if (!target || state.noInvoiceCloseSaving) return;

    state.noInvoiceCloseSaving = true;
    setNoInvoiceCloseModalSaving(true);
    const modal = document.getElementById('db-no-invoice-close-modal');
    const error = modal?.querySelector('.db-no-invoice-close-error');
    if (error) error.textContent = '';

    try {
      const data = await fetchJson(
        `/api/database/jobs/${encodeURIComponent(target.sourceOrderId)}/close-without-invoice`,
        { method: 'POST' }
      );
      state.selectedJob = { ...state.selectedJob, ...data.job };

      if (state.orderMode === 'all') {
        updateOutstandingJob(state.selectedJob);
      } else if (shouldRemoveFromOpenOrders(state.selectedJob)) {
        state.outstandingJobs = state.outstandingJobs.filter((job) => (
          Number(job.source_order_id) !== target.sourceOrderId
        ));
      } else {
        updateOutstandingJob(state.selectedJob);
      }
      state.toInvoiceJobs = state.toInvoiceJobs.filter((job) => (
        Number(job.source_order_id) !== target.sourceOrderId
      ));

      state.noInvoiceCloseSaving = false;
      closeNoInvoiceCloseConfirmation();
      renderOrderHeaderStats();
      renderDetailsPanel();
      renderOutstandingOrders();
      renderToInvoiceJobs();
      hydrateOrderSelectors();
      syncOrderDocumentButtons(state.selectedJob);
      loadHomeMetrics();
    } catch (err) {
      state.noInvoiceCloseSaving = false;
      setNoInvoiceCloseModalSaving(false);
      if (error) error.textContent = err.message || 'Failed to close order';
    }
  }

  function setNoInvoiceCloseModalSaving(saving) {
    const modal = document.getElementById('db-no-invoice-close-modal');
    if (!modal) return;
    modal.querySelectorAll('[data-db-no-invoice-close-choice]').forEach((button) => {
      button.disabled = saving;
      if (button.dataset.dbNoInvoiceCloseChoice === 'yes') {
        button.textContent = saving ? 'Closing...' : 'Yes';
      } else {
        button.textContent = 'Cancel';
      }
    });
  }

  function closeNoInvoiceCloseConfirmation() {
    if (state.noInvoiceCloseSaving) return;
    const modal = document.getElementById('db-no-invoice-close-modal');
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open', 'db-no-invoice-close-open');
    state.noInvoiceCloseTarget = null;
  }

  async function loadDatabaseCustomers(options = {}) {
    const query = els.customersSearch.value.trim();
    const sort = normalizeDatabaseCustomerSort(els.customersSort?.value || state.databaseCustomerSort);
    state.databaseCustomerQuery = query;
    state.databaseCustomerSort = sort;
    if (els.customersSort && els.customersSort.value !== sort) els.customersSort.value = sort;

    const cacheMatches = state.loadedCustomerQuery === query && state.loadedCustomerSort === sort;
    if (state.loadedCustomers && cacheMatches && !options.force && state.databaseCustomers.length) {
      renderDatabaseCustomers();
      return;
    }

    const requestId = ++databaseCustomerRequest;
    state.loadingCustomers = true;
    els.customersBody.innerHTML = renderStatusRow('Loading customers', 8);

    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      params.set('sort', sort);
      const suffix = params.toString() ? `?${params.toString()}` : '';
      const data = await fetchJson(`/api/database/customers${suffix}`);
      if (requestId !== databaseCustomerRequest) return;
      state.databaseCustomers = data.customers || [];
      state.loadedCustomers = true;
      state.loadedCustomerQuery = query;
      state.loadedCustomerSort = sort;
      renderDatabaseCustomers();
    } catch (err) {
      if (requestId !== databaseCustomerRequest) return;
      els.customersBody.innerHTML = renderStatusRow(err.message, 8);
    } finally {
      if (requestId === databaseCustomerRequest) state.loadingCustomers = false;
    }
  }

  function renderDatabaseCustomers() {
    const customers = state.databaseCustomers || [];
    if (!customers.length) {
      els.customersBody.innerHTML = renderStatusRow('No matching customers', 8);
      return;
    }

    els.customersBody.innerHTML = customers.map(renderDatabaseCustomerRow).join('');
  }

  function renderDatabaseCustomerRow(customer, index) {
    const customerKey = customerKeyForRecord(customer);
    return `
      <tr class="db-customer-row" data-customer-key="${escapeAttr(customerKey)}" tabindex="0">
        <td class="db-row-selector">${index === 0 ? '&#9654;' : ''}</td>
        <td class="db-customer-link">${escapeHtml(customer.business_name || '')}</td>
        <td class="db-order-link">${escapeHtml(customer.latest_order_no || '')}</td>
        <td>${escapeHtml(customer.latest_job_title || '')}</td>
        <td>${escapeHtml(formatDate(customer.latest_order_date, 'long'))}</td>
        <td>${escapeHtml(customer.contact_name || '')}</td>
        <td>${escapeHtml(customer.customer_code || '')}</td>
        <td>${escapeHtml(formatNumber(customer.order_count || 0))}</td>
      </tr>
    `;
  }

  async function openCustomer(customerKey, tab, options = {}) {
    if (!customerKey) return;
    state.activeCustomerTab = normalizeDatabaseCustomerTab(tab);
    showView('customer', { skipHistory: options.skipHistory, skipPersistence: true });
    setFooterTitle('Customer');
    setCustomerLoading();
    showCustomerTab(state.activeCustomerTab, { skipPersistence: true });

    try {
      const [data] = await Promise.all([
        fetchJson(`/api/database/customers/${encodeURIComponent(customerKey)}`),
        ensureCustomerUsers(),
      ]);
      state.selectedCustomerDetail = data.customer || {};
      state.selectedCustomerPageOverview = data.customerOverview || null;
      state.selectedCustomerOrders = data.orders || [];
      state.selectedCustomerContacts = data.contacts || [];
      state.selectedCustomerAddresses = data.addresses || [];
      state.selectedCustomerDesignNumbers = data.designNumbers || [];
      renderCustomerPage();
      showCustomerTab(state.activeCustomerTab);
    } catch (err) {
      renderCustomerError(err.message);
      if (options.throwOnError) throw err;
    }
  }

  function setCustomerLoading() {
    resetContactAutosaveState();
    resetCustomerAddressAutosaveState();
    state.selectedCustomerDetail = null;
    state.selectedCustomerPageOverview = null;
    state.selectedCustomerOrders = [];
    state.selectedCustomerContacts = [];
    state.selectedCustomerAddresses = [];
    state.selectedCustomerDesignNumbers = [];
    els.customerName.value = 'Loading...';
    els.customerCode.value = '';
    setCustomerAccountManagerOptions(null, true);
    renderCustomerHeaderStats();
    els.customerOrdersBody.innerHTML = renderStatusRow('Loading customer orders', 11);
    els.customerContactsBody.innerHTML = '<div class="db-panel-message">Loading contacts</div>';
    els.customerAddressesBody.innerHTML = '<div class="db-panel-message">Loading addresses</div>';
    if (els.customerDesignNumbersBody) els.customerDesignNumbersBody.innerHTML = renderStatusRow('Loading design numbers', 6);
  }

  function renderCustomerError(message) {
    resetContactAutosaveState();
    resetCustomerAddressAutosaveState();
    els.customerName.value = 'Customer unavailable';
    els.customerCode.value = '';
    state.selectedCustomerPageOverview = null;
    setCustomerAccountManagerOptions(null, true);
    renderCustomerHeaderStats();
    els.customerOrdersBody.innerHTML = renderStatusRow(message, 11);
    els.customerContactsBody.innerHTML = `<div class="db-panel-message">${escapeHtml(message)}</div>`;
    els.customerAddressesBody.innerHTML = `<div class="db-panel-message">${escapeHtml(message)}</div>`;
    if (els.customerDesignNumbersBody) els.customerDesignNumbersBody.innerHTML = renderStatusRow(message, 6);
  }

  function renderCustomerPage() {
    const customer = state.selectedCustomerDetail || {};
    els.customerName.value = customer.business_name || '';
    els.customerCode.value = customer.customer_code || '';
    setCustomerAccountManagerOptions(customer, false);
    renderCustomerHeaderStats();
    renderCustomerOrders();
    renderCustomerContacts();
    renderCustomerAddresses();
    renderCustomerDesignNumbers();
  }

  async function ensureCustomerUsers() {
    if (state.loadedCustomerUsers) return state.customerUsers;

    try {
      const data = await fetchJson('/api/database/users');
      state.customerUsers = Array.isArray(data.users)
        ? data.users.filter((user) => user.access_scope !== 'dtf_only')
        : [];
      state.loadedCustomerUsers = true;
    } catch (err) {
      console.error('Failed to load DATABASE users', err);
      state.customerUsers = [];
      state.loadedCustomerUsers = true;
    }

    return state.customerUsers;
  }

  async function loadRegisteredUsers(options = {}) {
    if (state.usersLoading && !options.force) {
      renderRegisteredUsers();
      return;
    }
    if (state.usersLoaded && !options.force) {
      renderRegisteredUsers();
      return;
    }

    state.usersLoading = true;
    state.usersLoaded = false;
    if (els.usersBody) {
      els.usersBody.innerHTML = renderStatusRow('Loading users', 5);
    }
    if (els.signupRequestsBody) {
      els.signupRequestsBody.innerHTML = renderStatusRow('Loading signup requests', 4);
    }

    try {
      const data = await fetchJson('/api/database/users');
      const users = Array.isArray(data.users) ? data.users : [];
      state.signupRequests = Array.isArray(data.signupRequests) ? data.signupRequests : [];
      state.canManageUsers = data.canManageUsers === true;
      state.registeredUsers = users;
      state.customerUsers = users.filter((user) => user.access_scope !== 'dtf_only');
      state.loadedCustomerUsers = true;
      state.usersLoaded = true;
      renderRegisteredUsers();
    } catch (err) {
      state.usersLoaded = false;
      if (els.usersBody) {
        els.usersBody.innerHTML = renderStatusRow(err.message || 'Failed to load users', 5);
      }
      if (els.signupRequestsBody) {
        els.signupRequestsBody.innerHTML = renderStatusRow(err.message || 'Failed to load signup requests', 4);
      }
    } finally {
      state.usersLoading = false;
    }
  }

  function renderRegisteredUsers() {
    renderPendingSignupRequests();
    if (!els.usersBody) return;
    const users = state.registeredUsers || [];
    if (!users.length) {
      els.usersBody.innerHTML = renderStatusRow('No registered users', 5);
      return;
    }
    els.usersBody.innerHTML = users.map(renderRegisteredUserRow).join('');
  }

  function renderRegisteredUserRow(user) {
    const currentUserId = Number(state.currentUser?.id || window.ultimateHubUser?.id);
    const canRemove = state.canManageUsers && Number(user.id) !== currentUserId;
    return `
      <tr>
        <td>${escapeHtml(user.full_name || [user.first_name, user.last_name].filter(Boolean).join(' ') || '-')}</td>
        <td>${escapeHtml(user.email || '')}</td>
        <td>${user.access_scope === 'dtf_only' ? 'Lami DTF only' : 'Full dashboard'}</td>
        <td>${escapeHtml(formatDate(user.created_at, 'long'))}</td>
        <td>${canRemove
          ? `<button class="db-user-remove-button" type="button" data-db-user-remove="${escapeAttr(user.id || '')}">Remove</button>`
          : '<span aria-hidden="true">—</span>'}</td>
      </tr>
    `;
  }

  function renderPendingSignupRequests() {
    if (!els.signupRequestsBody) return;
    if (!state.canManageUsers) {
      els.signupRequestsBody.innerHTML = renderStatusRow('User management permission required', 4);
      return;
    }
    const requests = state.signupRequests || [];
    if (!requests.length) {
      els.signupRequestsBody.innerHTML = renderStatusRow('No pending signup requests', 4);
      return;
    }

    els.signupRequestsBody.innerHTML = requests.map((request) => {
      const requestId = Number(request.id);
      const saving = state.signupRequestSavingIds.has(requestId);
      return `
        <tr>
          <td>${escapeHtml(request.full_name || [request.first_name, request.last_name].filter(Boolean).join(' ') || '-')}</td>
          <td>${escapeHtml(request.email || '')}</td>
          <td>${escapeHtml(formatDate(request.requested_at, 'long'))}</td>
          <td class="db-signup-review-cell">
            <button
              class="db-signup-review-button db-signup-accept-button"
              type="button"
              data-db-signup-request="${escapeAttr(requestId)}"
              data-db-signup-decision="accept"
              data-db-signup-access="full"
              ${saving ? 'disabled' : ''}
            >${saving ? 'Saving...' : 'Accept'}</button>
            <button
              class="db-signup-review-button db-signup-accept-button"
              type="button"
              data-db-signup-request="${escapeAttr(requestId)}"
              data-db-signup-decision="accept"
              data-db-signup-access="dtf_only"
              ${saving ? 'disabled' : ''}
            >Lami DTF</button>
            <button
              class="db-signup-review-button db-signup-reject-button"
              type="button"
              data-db-signup-request="${escapeAttr(requestId)}"
              data-db-signup-decision="reject"
              ${saving ? 'disabled' : ''}
            >Reject</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  async function reviewSignupRequest(requestId, decision, accessScope = 'full') {
    const id = Number.parseInt(String(requestId), 10);
    const request = (state.signupRequests || []).find((item) => Number(item.id) === id);
    if (!request || state.signupRequestSavingIds.has(id)) return;

    const label = request.full_name || request.email || 'this signup request';
    const dtfOnly = decision === 'accept' && accessScope === 'dtf_only';
    const verb = decision === 'accept' ? (dtfOnly ? 'Accept as Lami DTF only' : 'Accept') : 'Reject';
    if (!window.confirm(`${verb} ${label}?`)) return;

    state.signupRequestSavingIds.add(id);
    renderPendingSignupRequests();
    try {
      const data = await fetchJson(
        `/api/database/signup-requests/${encodeURIComponent(id)}/${decision}`,
        {
          method: 'POST',
          headers: decision === 'accept' ? { 'Content-Type': 'application/json' } : undefined,
          body: decision === 'accept' ? JSON.stringify({ accessScope: dtfOnly ? 'dtf_only' : 'full' }) : undefined,
        }
      );
      state.signupRequests = (state.signupRequests || []).filter((item) => Number(item.id) !== id);

      if (decision === 'accept' && data.user) {
        const withoutAcceptedUser = (state.registeredUsers || []).filter((user) => (
          Number(user.id) !== Number(data.user.id)
          && String(user.email || '').toLowerCase() !== String(data.user.email || '').toLowerCase()
        ));
        state.registeredUsers = [...withoutAcceptedUser, data.user].sort((left, right) => (
          String(left.full_name || left.email || '').localeCompare(
            String(right.full_name || right.email || ''),
            undefined,
            { sensitivity: 'base' }
          )
        ));
        state.customerUsers = state.registeredUsers.filter((user) => user.access_scope !== 'dtf_only');
        state.loadedCustomerUsers = true;
        populateNewCustomerAccountManagers();
      }
    } catch (err) {
      window.alert(err.message || `Failed to ${decision} signup request`);
    } finally {
      state.signupRequestSavingIds.delete(id);
      renderRegisteredUsers();
    }
  }

  function setCustomerAccountManagerOptions(customer, disabled) {
    const select = els.customerAccountManager;
    if (!select) return;

    if (!customer) {
      select.innerHTML = '<option></option>';
      select.disabled = true;
      return;
    }

    const selectedId = Number.parseInt(customer.account_manager_user_id, 10);
    const selectedName = staffLabel(customer.account_manager);
    const users = state.customerUsers || [];
    const options = selectedName ? [] : ['<option></option>'];
    const seenNames = new Set();

    if (selectedName && !users.some((user) => userMatchesAccountManager(user, selectedId, selectedName))) {
      seenNames.add(selectedName.toLowerCase());
      options.push(`<option value="${escapeAttr(selectedName)}">${escapeHtml(selectedName)}</option>`);
    }

    options.push(...users
      .filter((user) => {
        const name = user.full_name || [user.first_name, user.last_name].filter(Boolean).join(' ');
        const key = String(name || '').trim().toLowerCase();
        if (!key || seenNames.has(key)) return false;
        seenNames.add(key);
        return true;
      })
      .map((user) => {
        const name = user.full_name || [user.first_name, user.last_name].filter(Boolean).join(' ');
        const selected = userMatchesAccountManager(user, selectedId, selectedName) ? ' selected' : '';
        return `<option value="${escapeAttr(name)}" data-user-id="${escapeAttr(user.id || '')}"${selected}>${escapeHtml(name)}</option>`;
      }));

    if (!options.length) options.push('<option></option>');
    select.innerHTML = options.join('');
    if (selectedName) select.value = selectedName;
    select.disabled = Boolean(disabled || state.customerAccountManagerSaving || !state.selectedCustomerDetail?.customer_key);
  }

  function userMatchesAccountManager(user, selectedId, selectedName) {
    const userId = Number.parseInt(user?.id, 10);
    if (Number.isFinite(selectedId) && Number.isFinite(userId) && selectedId === userId) return true;
    const name = String(user?.full_name || [user?.first_name, user?.last_name].filter(Boolean).join(' ')).trim();
    return Boolean(selectedName && name && name.toLowerCase() === String(selectedName).trim().toLowerCase());
  }

  async function handleCustomerAccountManagerChange() {
    const customerKey = state.selectedCustomerDetail?.customer_key;
    if (!customerKey || state.customerAccountManagerSaving) return;

    const select = els.customerAccountManager;
    const option = select?.selectedOptions?.[0];
    const accountManager = select?.value || '';
    const userId = Number.parseInt(option?.dataset?.userId, 10);

    state.customerAccountManagerSaving = true;
    if (select) select.disabled = true;

    try {
      const data = await fetchJson(`/api/database/customers/${encodeURIComponent(customerKey)}/account-manager`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_manager: accountManager,
          user_id: Number.isFinite(userId) ? userId : null,
        }),
      });
      state.selectedCustomerDetail = { ...state.selectedCustomerDetail, ...(data.customer || {}) };
      renderCustomerPage();
    } catch (err) {
      console.error('Failed to update customer account manager', err);
      renderCustomerPage();
    } finally {
      state.customerAccountManagerSaving = false;
      setCustomerAccountManagerOptions(state.selectedCustomerDetail, false);
    }
  }

  function renderCustomerOrders() {
    const orders = state.selectedCustomerOrders || [];
    if (!orders.length) {
      els.customerOrdersBody.innerHTML = renderStatusRow('No orders recorded for this customer', 11);
      return;
    }

    els.customerOrdersBody.innerHTML = orders.map(renderCustomerOrderRow).join('');
  }

  function renderCustomerOrderRow(order, index) {
    return `
      <tr class="db-customer-order-row" data-job-id="${escapeAttr(order.source_order_id || '')}" tabindex="0">
        <td class="db-row-selector">${index === 0 ? '&#9654;' : ''}</td>
        <td class="db-order-link">${escapeHtml(order.order_no || '')}</td>
        <td class="db-invoice-number-cell">${renderInvoiceNumberCell(order)}</td>
        <td>${escapeHtml(order.client_order_no || '')}</td>
        <td class="db-type-cell db-type-${categoryForJob(order)}">${escapeHtml(typeAbbr(order))}</td>
        <td>${escapeHtml(order.contact_name || '')}</td>
        <td>${escapeHtml(order.job_title || '')}</td>
        <td>${escapeHtml(outstandingTakenByFirstName(order))}</td>
        <td>${escapeHtml(formatDate(order.order_date, 'long'))}</td>
        <td>${escapeHtml(formatDate(order.complete_date, 'long'))}</td>
        <td class="db-repeat-order-cell">
          <button
            class="db-repeat-order-button"
            type="button"
            data-db-repeat-order="${escapeAttr(order.source_order_id || '')}"
          >Repeat Order</button>
        </td>
      </tr>
    `;
  }

  function renderCustomerDesignNumbers() {
    if (!els.customerDesignNumbersBody) return;
    const designNumbers = state.selectedCustomerDesignNumbers || [];
    setCustomerDesignNumberColumnWidths(designNumbers);
    if (!designNumbers.length) {
      els.customerDesignNumbersBody.innerHTML = renderStatusRow('No design or PSG / Stitch Count recorded for this customer', 6);
      return;
    }

    els.customerDesignNumbersBody.innerHTML = designNumbers.map(renderCustomerDesignNumberRow).join('');
  }

  function setCustomerDesignNumberColumnWidths(designNumbers) {
    const table = els.customerDesignNumbersBody?.closest('table');
    if (!table) return;

    const designLength = longestTextLength(designNumbers, 'design_ref', 'Design number:');
    const referenceLength = longestTextLength(designNumbers, 'psg_numbers', 'PSG / Stitch Count');
    table.style.setProperty('--db-design-number-column-width', `${designLength + 2}ch`);
    table.style.setProperty('--db-psg-stitch-column-width', `${referenceLength + 2}ch`);
  }

  function longestTextLength(rows, field, heading) {
    return (rows || []).reduce((longest, row) => {
      const valueLength = String(row?.[field] || '').length;
      return Math.max(longest, valueLength);
    }, String(heading || '').length);
  }

  function renderCustomerDesignNumberRow(designNumber, index) {
    return `
      <tr class="db-customer-design-number-row" data-job-id="${escapeAttr(designNumber.source_order_id || '')}" tabindex="0">
        <td class="db-row-selector">${index === 0 ? '&#9654;' : ''}</td>
        <td class="db-order-link">${escapeHtml(designNumber.order_no || '')}</td>
        <td class="db-design-number-link">${escapeHtml(designNumber.design_ref || '')}</td>
        <td>${escapeHtml(designNumber.psg_numbers || '')}</td>
        <td>${escapeHtml(designNumber.job_title || '')}</td>
        <td>${escapeHtml(formatDate(designNumber.order_date, 'long'))}</td>
      </tr>
    `;
  }

  function renderCustomerContacts() {
    const contacts = state.selectedCustomerContacts || [];
    els.customerContactsBody.innerHTML = `
      <div class="db-contact-cards-scroll">
        ${contacts.length
          ? contacts.map(renderCustomerContactCard).join('')
          : '<div class="db-panel-message">No contact information recorded for this customer</div>'}
      </div>
      <div class="db-contact-actions-panel">
        <button class="db-toolbar-button db-contact-add-button" type="button" data-db-action="add-contact">Add Contact</button>
      </div>
    `;
    hydrateContactAutosaveSignatures();
  }

  function renderCustomerContactCard(contact, index) {
    const parts = contactNameParts(contact);
    const contactKey = contactCardKey(contact, index);
    const rowId = contact.contact_row_id || contact.manual_contact_id || '';
    return `
      <article class="db-contact-card" data-contact-key="${escapeAttr(contactKey)}" data-contact-row-id="${escapeAttr(rowId)}" data-source-contact-id="${escapeAttr(contact.contact_id || '')}">
        <button class="db-contact-delete-button" type="button" data-db-contact-delete="${escapeAttr(contactKey)}" aria-label="Delete contact" title="Delete contact">X</button>
        <div class="db-contact-card-row db-contact-name-row">
          <label>Contact:</label>
          <input class="db-contact-title-field" data-contact-field="contact_title" value="${escapeAttr(parts.title)}">
          <input data-contact-field="contact_first_name" value="${escapeAttr(parts.firstName)}">
          <input data-contact-field="contact_last_name" value="${escapeAttr(parts.lastName)}">
        </div>
        <div class="db-contact-card-row db-contact-two-column-row">
          <label>Tel:</label>
          <input data-contact-field="contact_phone" value="${escapeAttr(contact.contact_phone || '')}">
          <label>Email:</label>
          <input data-contact-field="contact_email" value="${escapeAttr(contact.contact_email || '')}">
        </div>
        <div class="db-contact-card-row db-contact-two-column-row">
          <label>Fax:</label>
          <input data-contact-field="contact_fax" value="${escapeAttr(contact.contact_fax || '')}">
          <label>Mobile:</label>
          <input data-contact-field="contact_mobile" value="${escapeAttr(contact.contact_mobile || '')}">
        </div>
        <div class="db-contact-card-row db-contact-address-row">
          <label>Address:</label>
          <input data-contact-field="contact_address" value="${escapeAttr(contact.contact_address || '')}">
        </div>
      </article>
    `;
  }

  function contactNameParts(contact) {
    const title = contact.contact_title || '';
    const firstName = contact.contact_first_name || '';
    const lastName = contact.contact_last_name || '';
    if (firstName || lastName || title) return { title, firstName, lastName };

    const parts = String(contact.contact_name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return { title: '', firstName: '', lastName: '' };
    if (parts.length === 1) return { title: '', firstName: parts[0], lastName: '' };
    return {
      title: '',
      firstName: parts.slice(0, -1).join(' '),
      lastName: parts[parts.length - 1],
    };
  }

  function contactCardKey(contact, index = 0) {
    const rowId = contact?.contact_row_id || contact?.manual_contact_id;
    if (rowId) return `row:${rowId}`;
    if (contact?.contact_id) return `source:${contact.contact_id}`;
    return `fallback:${index}`;
  }

  function hydrateContactAutosaveSignatures() {
    clearTimeout(contactAutosaveTimer);
    state.contactDirtyKeys = new Set();
    state.contactSavingKeys = new Set();
    state.contactSaveQueuedKeys = new Set();
    state.contactLastSavedSignatures = {};
    (state.selectedCustomerContacts || []).forEach((contact, index) => {
      state.contactLastSavedSignatures[contactCardKey(contact, index)] = contactSignature(contactPayloadFromContact(contact));
    });
  }

  function resetContactAutosaveState() {
    clearTimeout(contactAutosaveTimer);
    state.contactDirtyKeys = new Set();
    state.contactSavingKeys = new Set();
    state.contactSaveQueuedKeys = new Set();
    state.contactLastSavedSignatures = {};
    state.contactDeleteTarget = null;
    state.contactDeleteSaving = false;
  }

  function handleCustomerContactInput(event) {
    const input = event.target.closest('[data-contact-field]');
    if (!input) return;
    const card = input.closest('.db-contact-card');
    if (!card) return;

    syncContactStateFromCard(card);
    markContactDirty(card.dataset.contactKey);
    card.classList.add('db-contact-card-dirty');
    card.classList.remove('db-contact-card-error');
  }

  function handleCustomerContactFocusOut(event) {
    const input = event.target.closest('[data-contact-field]');
    if (!input) return;
    const card = input.closest('.db-contact-card');
    if (!card) return;

    const nextTarget = event.relatedTarget;
    if (nextTarget && card.contains(nextTarget)) return;

    window.setTimeout(() => {
      if (!card.isConnected || card.matches(':focus-within')) return;
      flushContactAutosaveForKey(card.dataset.contactKey);
    }, 0);
  }

  function syncContactStateFromCard(card) {
    const key = card?.dataset.contactKey;
    if (!key) return;
    const contact = findContactByKey(key);
    if (!contact) return;
    const payload = collectContactPayloadFromCard(card);
    Object.assign(contact, payload, {
      contact_name: contactNameFromPayload(payload),
    });
  }

  function markContactDirty(contactKey) {
    if (!contactKey) return;
    state.contactDirtyKeys.add(contactKey);
    scheduleContactAutosave();
  }

  function scheduleContactAutosave() {
    clearTimeout(contactAutosaveTimer);
    contactAutosaveTimer = window.setTimeout(() => {
      flushContactAutosaves();
    }, CONTACT_AUTOSAVE_MS);
  }

  async function flushContactAutosaves(options = {}) {
    clearTimeout(contactAutosaveTimer);
    const keys = Array.from(state.contactDirtyKeys || []);
    for (const key of keys) {
      await flushContactAutosaveForKey(key, options);
    }
  }

  async function flushContactAutosaveForKey(contactKey, options = {}) {
    if (!contactKey || !state.contactDirtyKeys.has(contactKey)) return true;
    const card = findContactCardByKey(contactKey);
    if (!card) return true;

    syncContactStateFromCard(card);
    const payload = collectContactPayloadFromCard(card);
    const signature = contactSignature(payload);
    if (signature === state.contactLastSavedSignatures[contactKey]) {
      state.contactDirtyKeys.delete(contactKey);
      card.classList.remove('db-contact-card-dirty');
      card.classList.remove('db-contact-card-error');
      return true;
    }

    if (state.contactSavingKeys.has(contactKey)) {
      state.contactSaveQueuedKeys.add(contactKey);
      return false;
    }

    const customerKey = state.selectedCustomerDetail?.customer_key;
    if (!customerKey || !contactHasAnyValue(payload)) return false;

    state.contactSavingKeys.add(contactKey);
    card.classList.add('db-contact-card-saving');

    try {
      const rowId = card.dataset.contactRowId;
      const sourceContactId = card.dataset.sourceContactId;
      const endpoint = rowId
        ? `/api/database/customers/${encodeURIComponent(customerKey)}/contacts/${encodeURIComponent(rowId)}`
        : `/api/database/customers/${encodeURIComponent(customerKey)}/contacts`;
      const method = rowId ? 'PUT' : 'POST';
      const body = JSON.stringify({
        ...payload,
        source_contact_id: sourceContactId || null,
      });
      const data = await fetchJson(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: Boolean(options.keepalive),
      });
      const savedContact = data.contact || {};
      replaceSelectedContact(contactKey, savedContact);
      state.contactDirtyKeys.delete(contactKey);
      delete state.contactLastSavedSignatures[contactKey];
      const newKey = contactCardKey(savedContact, selectedContactIndex(savedContact));
      state.contactLastSavedSignatures[newKey] = contactSignature(contactPayloadFromContact(savedContact));

      if (!rowId || newKey !== contactKey) {
        renderCustomerContacts();
      } else {
        card.classList.remove('db-contact-card-dirty');
        card.classList.remove('db-contact-card-error');
        card.dataset.contactRowId = savedContact.contact_row_id || savedContact.manual_contact_id || rowId;
      }
      return true;
    } catch (err) {
      state.contactDirtyKeys.add(contactKey);
      card.classList.add('db-contact-card-error');
      console.error('Contact autosave failed', err);
      return false;
    } finally {
      state.contactSavingKeys.delete(contactKey);
      card.classList.remove('db-contact-card-saving');
      if (state.contactSaveQueuedKeys.has(contactKey)) {
        state.contactSaveQueuedKeys.delete(contactKey);
        scheduleContactAutosave();
      }
    }
  }

  function collectContactPayloadFromCard(card) {
    return {
      contact_title: contactFieldValue(card, 'contact_title'),
      contact_first_name: contactFieldValue(card, 'contact_first_name'),
      contact_last_name: contactFieldValue(card, 'contact_last_name'),
      contact_phone: contactFieldValue(card, 'contact_phone'),
      contact_fax: contactFieldValue(card, 'contact_fax'),
      contact_mobile: contactFieldValue(card, 'contact_mobile'),
      contact_email: contactFieldValue(card, 'contact_email'),
      contact_address: contactFieldValue(card, 'contact_address'),
    };
  }

  function contactPayloadFromContact(contact) {
    const parts = contactNameParts(contact);
    return {
      contact_title: contact.contact_title || parts.title || '',
      contact_first_name: contact.contact_first_name || parts.firstName || '',
      contact_last_name: contact.contact_last_name || parts.lastName || '',
      contact_phone: contact.contact_phone || '',
      contact_fax: contact.contact_fax || '',
      contact_mobile: contact.contact_mobile || '',
      contact_email: contact.contact_email || '',
      contact_address: contact.contact_address || '',
    };
  }

  function contactFieldValue(card, field) {
    return card.querySelector(`[data-contact-field="${field}"]`)?.value.trim() || '';
  }

  function contactSignature(payload) {
    return JSON.stringify({
      contact_title: payload?.contact_title || '',
      contact_first_name: payload?.contact_first_name || '',
      contact_last_name: payload?.contact_last_name || '',
      contact_phone: payload?.contact_phone || '',
      contact_fax: payload?.contact_fax || '',
      contact_mobile: payload?.contact_mobile || '',
      contact_email: payload?.contact_email || '',
      contact_address: payload?.contact_address || '',
    });
  }

  function contactNameFromPayload(payload) {
    return [payload?.contact_first_name, payload?.contact_last_name]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join(' ') || null;
  }

  function contactHasAnyValue(payload) {
    return Object.values(payload || {}).some((value) => String(value || '').trim());
  }

  function findContactCardByKey(contactKey) {
    return Array.from(els.customerContactsBody.querySelectorAll('.db-contact-card'))
      .find((card) => card.dataset.contactKey === String(contactKey));
  }

  function findContactByKey(contactKey) {
    return (state.selectedCustomerContacts || []).find((contact, index) => (
      contactCardKey(contact, index) === String(contactKey)
    ));
  }

  function selectedContactIndex(targetContact) {
    return (state.selectedCustomerContacts || []).findIndex((contact) => (
      (targetContact.contact_row_id || targetContact.manual_contact_id)
        ? Number(contact.contact_row_id || contact.manual_contact_id) === Number(targetContact.contact_row_id || targetContact.manual_contact_id)
        : contact === targetContact
    ));
  }

  function replaceSelectedContact(contactKey, savedContact) {
    const contacts = state.selectedCustomerContacts || [];
    const index = contacts.findIndex((contact, contactIndex) => contactCardKey(contact, contactIndex) === contactKey);
    if (index === -1) {
      state.selectedCustomerContacts = [...contacts, savedContact];
      return;
    }
    state.selectedCustomerContacts = contacts.map((contact, contactIndex) => (
      contactIndex === index ? { ...contact, ...savedContact } : contact
    ));
  }

  function renderCustomerAddresses() {
    const addresses = state.selectedCustomerAddresses || [];
    const invoiceAddress = defaultCustomerAddress(addresses, 'invoice');
    const deliveryAddress = defaultCustomerAddress(addresses, 'delivery') || blankCustomerAddress('As Per Order');

    els.customerAddressesBody.innerHTML = `
      <div class="db-customer-address-columns">
        ${renderCustomerAddressBox('Invoice address (default):', invoiceAddress, 'invoice')}
        ${renderCustomerAddressBox('Delivery address (default):', deliveryAddress, 'delivery')}
      </div>
    `;
    hydrateCustomerAddressAutosaveSignature();
  }

  function defaultCustomerAddress(addresses, role) {
    const normalizedRole = String(role || '').toLowerCase();
    const matches = (addresses || []).filter((address) => customerAddressHasRole(address, normalizedRole));
    if (matches.length) return matches[0];
    if (normalizedRole === 'invoice') return (addresses || [])[0] || blankCustomerAddress('');
    return null;
  }

  function customerAddressHasRole(address, role) {
    const type = String(address?.address_type || '').toLowerCase();
    if (role === 'invoice') return type.includes('invoice') || type.includes('inv');
    if (role === 'delivery') return type.includes('delivery') || type.includes('deliver');
    return false;
  }

  function blankCustomerAddress(line1) {
    return {
      address_line1: line1 || '',
      address_line2: '',
      address_line3: '',
      address_line4: '',
      address_line5: '',
      postcode: '',
      phone: '',
      fax: '',
      created_at_source: null,
      updated_at_source: null,
      updated_by: null,
    };
  }

  function renderCustomerAddressBox(title, address, role) {
    const fields = customerAddressFields(address || blankCustomerAddress(''));
    return `
      <section class="db-customer-address-box" data-customer-address-role="${escapeAttr(role)}">
        <h3>${escapeHtml(title)}</h3>
        <div class="db-customer-address-inner">
          ${customerAddressInputRow('Address 1:', fields.address_line1, 'address_line1')}
          ${customerAddressInputRow('Address 2:', fields.address_line2, 'address_line2')}
          ${customerAddressInputRow('Address 3:', fields.address_line3, 'address_line3')}
          ${customerAddressInputRow('Address 4:', fields.address_line4, 'address_line4')}
          ${customerAddressInputRow('Address 5:', fields.address_line5, 'address_line5')}
          ${customerAddressInputRow('Postcode:', fields.postcode, 'postcode', 'postcode')}
          ${customerAddressInputRow('Tel:', fields.phone, 'phone', 'tel')}
          ${customerAddressInputRow('Fax:', fields.fax, 'fax', 'tel')}
        </div>
      </section>
    `;
  }

  function customerAddressInputRow(label, value, field, size = '') {
    return `
      <label class="db-customer-address-row ${size ? `db-customer-address-row-${escapeAttr(size)}` : ''}">
        <span>${escapeHtml(label)}</span>
        <input data-customer-address-field="${escapeAttr(field)}" value="${escapeAttr(value || '')}" autocomplete="off">
      </label>
    `;
  }

  function customerAddressFields(address) {
    const fallback = splitCustomerAddress(address?.address || '');
    return normalizeCustomerAddressFields({
      address_line1: address?.address_line1 || fallback[0] || '',
      address_line2: address?.address_line2 || fallback[1] || '',
      address_line3: address?.address_line3 || fallback[2] || '',
      address_line4: address?.address_line4 || fallback[3] || '',
      address_line5: address?.address_line5 || fallback[4] || '',
      postcode: address?.postcode || fallback[5] || '',
      phone: address?.phone || '',
      fax: address?.fax || '',
      created_at_source: address?.created_at_source || address?.first_seen_at || null,
      updated_at_source: address?.updated_at_source || address?.last_seen_at || null,
      updated_by: address?.updated_by || null,
    });
  }

  function hydrateCustomerAddressAutosaveSignature() {
    clearTimeout(customerAddressAutosaveTimer);
    state.customerAddressDirty = false;
    state.customerAddressSaving = false;
    state.customerAddressSaveQueued = false;
    state.customerAddressLastSavedSignature = customerAddressSignature(collectCustomerAddressPayloadFromDom());
    els.customerAddressesBody?.classList.remove('db-customer-addresses-dirty', 'db-customer-addresses-saving', 'db-customer-addresses-error');
  }

  function resetCustomerAddressAutosaveState() {
    clearTimeout(customerAddressAutosaveTimer);
    state.customerAddressDirty = false;
    state.customerAddressSaving = false;
    state.customerAddressSaveQueued = false;
    state.customerAddressLastSavedSignature = '{}';
  }

  function handleCustomerAddressInput(event) {
    const input = event.target.closest('[data-customer-address-field]');
    if (!input) return;

    state.customerAddressDirty = true;
    els.customerAddressesBody?.classList.add('db-customer-addresses-dirty');
    els.customerAddressesBody?.classList.remove('db-customer-addresses-error');
    scheduleCustomerAddressAutosave();
  }

  function handleCustomerAddressFocusOut(event) {
    const input = event.target.closest('[data-customer-address-field]');
    if (!input) return;
    const panel = input.closest('[data-customer-address-role]');
    if (!panel) return;

    const nextTarget = event.relatedTarget;
    if (nextTarget && panel.contains(nextTarget)) return;

    window.setTimeout(() => {
      if (!panel.isConnected || panel.matches(':focus-within')) return;
      normalizeCustomerAddressPanel(panel);
      flushCustomerAddressAutosave();
    }, 0);
  }

  function scheduleCustomerAddressAutosave() {
    clearTimeout(customerAddressAutosaveTimer);
    customerAddressAutosaveTimer = window.setTimeout(() => {
      flushCustomerAddressAutosave();
    }, CONTACT_AUTOSAVE_MS);
  }

  async function flushCustomerAddressAutosave(options = {}) {
    clearTimeout(customerAddressAutosaveTimer);
    if (!state.customerAddressDirty) return true;

    const payload = collectCustomerAddressPayloadFromDom();
    const signature = customerAddressSignature(payload);
    if (signature === state.customerAddressLastSavedSignature) {
      state.customerAddressDirty = false;
      els.customerAddressesBody?.classList.remove('db-customer-addresses-dirty', 'db-customer-addresses-error');
      return true;
    }

    if (state.customerAddressSaving) {
      state.customerAddressSaveQueued = true;
      return false;
    }

    const customerKey = state.selectedCustomerDetail?.customer_key;
    if (!customerKey) return false;

    state.customerAddressSaving = true;
    let saveSucceeded = false;
    els.customerAddressesBody?.classList.add('db-customer-addresses-saving');

    try {
      const data = await fetchJson(`/api/database/customers/${encodeURIComponent(customerKey)}/addresses`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: Boolean(options.keepalive),
      });
      state.selectedCustomerDetail = { ...state.selectedCustomerDetail, ...(data.customer || {}) };
      if (Array.isArray(data.addresses)) state.selectedCustomerAddresses = data.addresses;
      state.customerAddressLastSavedSignature = signature;
      state.customerAddressDirty = customerAddressSignature(collectCustomerAddressPayloadFromDom()) !== signature;
      saveSucceeded = true;
      updateCustomerHeaderFields();
      els.customerAddressesBody?.classList.toggle('db-customer-addresses-dirty', state.customerAddressDirty);
      els.customerAddressesBody?.classList.remove('db-customer-addresses-error');
      return true;
    } catch (err) {
      state.customerAddressDirty = true;
      els.customerAddressesBody?.classList.add('db-customer-addresses-error');
      console.error('Customer address autosave failed', err);
      return false;
    } finally {
      state.customerAddressSaving = false;
      els.customerAddressesBody?.classList.remove('db-customer-addresses-saving');
      if (state.customerAddressSaveQueued || (saveSucceeded && state.customerAddressDirty)) {
        state.customerAddressSaveQueued = false;
        scheduleCustomerAddressAutosave();
      }
    }
  }

  function updateCustomerHeaderFields() {
    const customer = state.selectedCustomerDetail || {};
    els.customerName.value = customer.business_name || '';
    els.customerCode.value = customer.customer_code || '';
    renderCustomerHeaderStats();
  }

  function collectCustomerAddressPayloadFromDom() {
    return ['invoice', 'delivery'].reduce((payload, role) => {
      const panel = els.customerAddressesBody?.querySelector(`[data-customer-address-role="${role}"]`);
      const fields = customerAddressPanelFields(panel);
      payload[`${role}_address_line1`] = fields.address_line1;
      payload[`${role}_address_line2`] = fields.address_line2;
      payload[`${role}_address_line3`] = fields.address_line3;
      payload[`${role}_address_line4`] = fields.address_line4;
      payload[`${role}_address_line5`] = fields.address_line5;
      payload[`${role}_postcode`] = fields.postcode;
      payload[`${role}_phone`] = fields.phone;
      payload[`${role}_fax`] = fields.fax;
      return payload;
    }, {});
  }

  function customerAddressPanelFields(panel) {
    return normalizeCustomerAddressFields({
      address_line1: customerAddressFieldValue(panel, 'address_line1'),
      address_line2: customerAddressFieldValue(panel, 'address_line2'),
      address_line3: customerAddressFieldValue(panel, 'address_line3'),
      address_line4: customerAddressFieldValue(panel, 'address_line4'),
      address_line5: customerAddressFieldValue(panel, 'address_line5'),
      postcode: customerAddressFieldValue(panel, 'postcode'),
      phone: customerAddressFieldValue(panel, 'phone'),
      fax: customerAddressFieldValue(panel, 'fax'),
    });
  }

  function customerAddressFieldValue(panel, field) {
    return panel?.querySelector(`[data-customer-address-field="${field}"]`)?.value.trim() || '';
  }

  function customerAddressSignature(payload) {
    return JSON.stringify(payload || {});
  }

  function normalizeCustomerAddressPanel(panel) {
    if (!panel) return;
    const fields = customerAddressPanelFields(panel);
    Object.entries(fields).forEach(([field, value]) => {
      const input = panel.querySelector(`[data-customer-address-field="${field}"]`);
      if (input && input.value !== value) input.value = value;
    });
  }

  function normalizeCustomerAddressFields(fields) {
    const normalized = {
      address_line1: String(fields?.address_line1 || '').trim(),
      address_line2: String(fields?.address_line2 || '').trim(),
      address_line3: String(fields?.address_line3 || '').trim(),
      address_line4: String(fields?.address_line4 || '').trim(),
      address_line5: String(fields?.address_line5 || '').trim(),
      postcode: formatUkPostcode(fields?.postcode) || String(fields?.postcode || '').trim(),
      phone: String(fields?.phone || '').trim(),
      fax: String(fields?.fax || '').trim(),
      created_at_source: fields?.created_at_source || null,
      updated_at_source: fields?.updated_at_source || null,
      updated_by: fields?.updated_by || null,
    };

    for (const field of ['address_line5', 'address_line4', 'address_line3', 'address_line2', 'address_line1']) {
      const extracted = extractUkPostcodeFromAddressLine(normalized[field]);
      if (!extracted) continue;
      normalized[field] = extracted.remaining;
      if (!normalized.postcode || normalizePostcodeCompact(normalized.postcode) === normalizePostcodeCompact(extracted.postcode)) {
        normalized.postcode = extracted.postcode;
      }
    }

    return normalized;
  }

  function extractUkPostcodeFromAddressLine(value) {
    const clean = String(value || '').trim();
    if (!clean) return null;
    const exact = formatUkPostcode(clean);
    if (exact) return { postcode: exact, remaining: '' };

    const match = clean.match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i);
    if (!match) return null;
    const postcode = formatUkPostcode(match[1]);
    if (!postcode) return null;
    const remaining = clean
      .replace(match[0], '')
      .replace(/\s*,\s*/g, ', ')
      .replace(/^[,\s]+|[,\s]+$/g, '')
      .trim();
    return { postcode, remaining };
  }

  function formatUkPostcode(value) {
    const compact = normalizePostcodeCompact(value);
    const match = compact.match(/^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/);
    return match ? `${match[1]} ${match[2]}` : '';
  }

  function normalizePostcodeCompact(value) {
    return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function splitCustomerAddress(value) {
    return String(value || '')
      .split(/\r?\n|,\s*/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 6);
  }

  function showCustomerTab(tab, options = {}) {
    state.activeCustomerTab = normalizeDatabaseCustomerTab(tab);
    els.customerTabs.forEach((button) => {
      button.classList.toggle('active', button.dataset.dbCustomerTab === state.activeCustomerTab);
    });
    els.customerPanels.forEach((panel) => {
      panel.classList.toggle('active', panel.id === `db-customer-${state.activeCustomerTab}-panel`);
    });
    if (!options.skipPersistence) persistDatabaseRoute();
  }

  function openOutstandingOrders(mode) {
    state.orderMode = mode === 'all' ? 'all' : 'open';
    showView('outstanding');
    setFooterTitle(state.orderMode === 'all' ? 'All Orders' : 'Open Orders');
    syncOrderSearchVisibility();
    loadOutstandingOrders({ force: false });
  }

  function handleOrderSearchInput() {
    state.orderSearchQuery = els.orderSearch?.value.trim() || '';
    if (state.orderMode !== 'all') return;
    persistDatabaseRoute();

    clearTimeout(orderSearchTimer);
    orderSearchTimer = window.setTimeout(() => {
      if (state.orderMode !== 'all') return;
      state.visibleOrderLimit = PAGE_LIMIT;
      loadOutstandingOrders({ force: true });
    }, CUSTOMER_SEARCH_DELAY);
  }

  function syncOrderSearchVisibility() {
    const wrapper = els.orderSearch?.closest('.db-order-search');
    if (!wrapper) return;

    const visible = state.orderMode === 'all';
    wrapper.hidden = !visible;
    if (visible && els.orderSearch.value !== state.orderSearchQuery) {
      els.orderSearch.value = state.orderSearchQuery;
    }
  }

  async function loadToInvoiceJobs(options = {}) {
    if (state.toInvoiceLoading && !options.force) {
      renderToInvoiceJobs();
      return;
    }
    if (state.toInvoiceLoaded && !options.force) {
      if (!state.loadedCustomerUsers) await ensureCustomerUsers();
      renderToInvoiceJobs();
      return;
    }

    state.toInvoiceLoading = true;
    state.toInvoiceLoaded = false;
    state.toInvoiceJobs = [];
    const usersPromise = ensureCustomerUsers();
    if (els.toInvoiceBody) {
      els.toInvoiceBody.innerHTML = renderStatusRow('Loading jobs to invoice', TO_INVOICE_TABLE_COLUMN_COUNT);
    }

    try {
      const jobs = [];
      let offset = 0;
      let total = 0;
      do {
        const params = new URLSearchParams({
          status: 'to-invoice',
          limit: String(PAGE_LIMIT),
          offset: String(offset),
        });
        if (offset > 0) params.set('includeTotal', 'false');
        const data = await fetchJson(`/api/database/jobs?${params.toString()}`);
        const pageJobs = data.jobs || [];
        jobs.push(...pageJobs);
        const limit = data.limit || PAGE_LIMIT;
        total = data.total !== null && data.total !== undefined && Number.isFinite(Number(data.total))
          ? Number(data.total)
          : Math.max(total, offset + pageJobs.length);
        offset += limit;
        if (!pageJobs.length) break;
      } while (offset < total);

      await usersPromise;
      state.toInvoiceJobs = jobs;
      state.toInvoiceLoaded = true;
      renderToInvoiceJobs();
    } catch (err) {
      state.toInvoiceLoaded = false;
      if (els.toInvoiceBody) {
        els.toInvoiceBody.innerHTML = renderStatusRow(err.message, TO_INVOICE_TABLE_COLUMN_COUNT);
      }
    } finally {
      state.toInvoiceLoading = false;
    }
  }

  function renderToInvoiceJobs() {
    if (!els.toInvoiceBody) return;
    const jobs = state.toInvoiceJobs || [];
    if (!jobs.length) {
      els.toInvoiceBody.innerHTML = renderStatusRow('No jobs to invoice', TO_INVOICE_TABLE_COLUMN_COUNT);
      return;
    }
    els.toInvoiceBody.innerHTML = jobs.map(renderToInvoiceRow).join('');
  }

  function renderToInvoiceRow(job) {
    const selected = state.selectedJob && Number(state.selectedJob.source_order_id) === Number(job.source_order_id);
    return `
      <tr class="db-outstanding-row ${selected ? 'selected' : ''}" data-job-id="${escapeAttr(job.source_order_id)}" tabindex="0">
        <td class="db-row-selector">${selected ? '&#9654;' : ''}</td>
        <td class="db-order-link">${escapeHtml(job.order_no || '')}</td>
        <td class="db-customer-link">${escapeHtml(job.customer_name || '')}</td>
        <td class="db-type-cell db-type-${categoryForJob(job)}">${escapeHtml(typeAbbr(job))}</td>
        <td>${escapeHtml(job.job_title || '')}</td>
        <td>${escapeHtml(formatDate(job.dashboard_status_updated_at || job.complete_date || job.updated_at_source, 'long'))}</td>
        <td>${escapeHtml(outstandingTakenByFirstName(job))}</td>
      </tr>
    `;
  }

  async function loadStockOrderingJobs(options = {}) {
    if (state.stockOrderingLoading && !options.force) {
      renderStockOrderingJobs();
      return;
    }
    if (state.stockOrderingLoaded && !options.force) {
      renderStockOrderingJobs();
      return;
    }

    state.stockOrderingLoading = true;
    state.stockOrderingLoaded = false;
    state.stockOrderingJobs = [];
    state.stockOrderingSelectedIds.clear();
    state.stockOrderingExpandedIds.clear();
    if (els.stockOrderingBody) {
      els.stockOrderingBody.innerHTML = renderStatusRow('Loading stock ordering jobs', STOCK_ORDERING_TABLE_COLUMN_COUNT);
    }
    updateStockOrderingControls();

    try {
      const data = await fetchJson('/api/database/stock-ordering');
      state.stockOrderingJobs = (data.jobs || []).filter((job) => !isStockOrderedDashboardStatus(job.dashboard_status));
      state.stockOrderingLoaded = true;
      renderStockOrderingJobs();
      void syncStockOrderingRalawiseOrders();
    } catch (err) {
      state.stockOrderingLoaded = false;
      if (els.stockOrderingBody) {
        els.stockOrderingBody.innerHTML = renderStatusRow(err.message, STOCK_ORDERING_TABLE_COLUMN_COUNT);
      }
      updateStockOrderingControls();
    } finally {
      state.stockOrderingLoading = false;
    }
  }

  async function syncStockOrderingRalawiseOrders() {
    if (state.stockOrderingRalawiseSyncing) return;
    state.stockOrderingRalawiseSyncing = true;
    try {
      const result = await fetchJson('/api/database/stock-ordering/ralawise-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const updatedJobs = Array.isArray(result.updatedJobs) ? result.updatedJobs : [];
      if (updatedJobs.length) {
        removeStockOrderedJobsFromStockOrderingList(updatedJobs);
        updateCachedDashboardStatusForJobs(updatedJobs, STOCK_ORDERED_STATUS_LABEL);
      }
    } catch (syncError) {
      console.warn('Failed to check Ralawise placed orders from Stock Ordering', syncError);
    } finally {
      state.stockOrderingRalawiseSyncing = false;
    }
  }

  function renderStockOrderingJobs() {
    if (!els.stockOrderingBody) return;
    const jobs = (state.stockOrderingJobs || []).filter((job) => !isStockOrderedDashboardStatus(job.dashboard_status));
    if (jobs.length !== (state.stockOrderingJobs || []).length) {
      const visibleIds = new Set(jobs.map((job) => String(job.source_order_id || '')).filter(Boolean));
      state.stockOrderingJobs = jobs;
      for (const selectedId of Array.from(state.stockOrderingSelectedIds)) {
        if (!visibleIds.has(selectedId)) state.stockOrderingSelectedIds.delete(selectedId);
      }
      for (const expandedId of Array.from(state.stockOrderingExpandedIds)) {
        if (!visibleIds.has(expandedId)) state.stockOrderingExpandedIds.delete(expandedId);
      }
    }
    if (!jobs.length) {
      els.stockOrderingBody.innerHTML = renderStatusRow('No jobs require stock ordering', STOCK_ORDERING_TABLE_COLUMN_COUNT);
      updateStockOrderingControls();
      return;
    }

    els.stockOrderingBody.innerHTML = jobs.map((job) => {
      const sourceOrderId = String(job.source_order_id || '');
      const expanded = state.stockOrderingExpandedIds.has(sourceOrderId);
      return `${renderStockOrderingParentRow(job, expanded)}${expanded ? renderStockOrderingDetailRow(job) : ''}`;
    }).join('');
    updateStockOrderingControls();
  }

  function renderStockOrderingParentRow(job, expanded) {
    const sourceOrderId = String(job.source_order_id || '');
    const checked = state.stockOrderingSelectedIds.has(sourceOrderId);
    const lineItems = stockOrderingLineItems(job);
    const customerKey = customerKeyForRecord({
      customer_id: job.customer_id,
      business_name: job.customer_name,
    });
    const ralawise = job.ralawiseBasket || {};
    const adding = state.stockOrderingRalawiseAddingIds.has(sourceOrderId) || ralawise.busy;
    const unresolvedCount = Array.isArray(ralawise.unresolved) ? ralawise.unresolved.length : 0;
    const buttonLabel = adding
      ? 'Adding...'
      : ralawise.alreadyBasketed
        ? 'Added to basket'
        : unresolvedCount
          ? 'Needs SKU'
          : ralawise.status === 'failed'
            ? 'Retry Ralawise'
            : 'Add to Ralawise';
    const buttonTitle = unresolvedCount
      ? `${formatNumber(unresolvedCount)} product line${unresolvedCount === 1 ? '' : 's'} need an exact live Ralawise colour/size SKU`
      : ralawise.error || '';
    const ralawiseDisabled = adding || ralawise.alreadyBasketed || !ralawise.eligible;
    return `
      <tr class="db-stock-ordering-row${ralawise.alreadyBasketed ? ' is-ralawise-basketed' : ''}" data-stock-order-id="${escapeAttr(sourceOrderId)}" tabindex="0">
        <td class="db-row-selector">
          <input
            class="db-stock-ordering-check"
            type="checkbox"
            data-db-stock-select="${escapeAttr(sourceOrderId)}"
            ${checked ? 'checked' : ''}
            aria-label="Select order ${escapeAttr(job.order_no || sourceOrderId)}"
          >
        </td>
        <td class="db-row-selector">
          <button
            class="db-stock-toggle"
            type="button"
            data-db-stock-toggle="${escapeAttr(sourceOrderId)}"
            aria-label="${expanded ? 'Hide' : 'Show'} line items for order ${escapeAttr(job.order_no || sourceOrderId)}"
          >${expanded ? '&#9662;' : '&#9656;'}</button>
        </td>
        <td class="db-order-link">
          <button class="db-control-link" type="button" data-db-stock-order-open="${escapeAttr(sourceOrderId)}">${escapeHtml(job.order_no || '')}</button>
        </td>
        <td class="db-customer-link">
          <button class="db-control-link" type="button" data-db-stock-customer-open="${escapeAttr(customerKey)}" ${customerKey ? '' : 'disabled'}>${escapeHtml(job.customer_name || '')}</button>
        </td>
        <td class="db-type-cell db-type-${categoryForJob(job)}">${escapeHtml(typeAbbr(job))}</td>
        <td>${escapeHtml(job.job_title || '')}</td>
        <td>${escapeHtml(formatNumber(lineItems.length))}</td>
        <td>${escapeHtml(formatNumber(stockOrderingQuantity(job)))}</td>
        <td class="db-stock-ralawise-cell">
          <button
            class="db-stock-ralawise-button${ralawise.alreadyBasketed ? ' is-basketed' : ''}"
            type="button"
            data-db-stock-ralawise="${escapeAttr(sourceOrderId)}"
            ${ralawiseDisabled ? 'disabled' : ''}
            ${buttonTitle ? `title="${escapeAttr(buttonTitle)}"` : ''}
          >${escapeHtml(buttonLabel)}</button>
        </td>
      </tr>
    `;
  }

  async function handleStockOrderingRowClick(event) {
    const orderButton = event.target.closest('[data-db-stock-order-open]');
    if (orderButton) {
      event.preventDefault();
      event.stopPropagation();
      await flushOrderAutosaves();
      openOrder(orderButton.dataset.dbStockOrderOpen, 'details');
      return;
    }

    const customerButton = event.target.closest('[data-db-stock-customer-open]');
    if (customerButton && !customerButton.disabled) {
      event.preventDefault();
      event.stopPropagation();
      await flushOrderAutosaves();
      openCustomer(customerButton.dataset.dbStockCustomerOpen, 'orders');
    }
  }

  async function handleStockOrderingRowKeydown(event) {
    if (event.key !== 'Enter') return;
    await handleStockOrderingRowClick(event);
  }

  function renderStockOrderingDetailRow(job) {
    return `
      <tr class="db-stock-ordering-detail-row">
        <td colspan="${STOCK_ORDERING_TABLE_COLUMN_COUNT}">
          <div class="db-stock-ordering-detail">
            ${renderStockOrderingLineTable(stockOrderingLineItems(job), { compact: true })}
          </div>
        </td>
      </tr>
    `;
  }

  function renderStockOrderingLineTable(lineItems, options = {}) {
    const compactClass = options.compact ? ' db-stock-ordering-lines-compact' : '';
    return `
      <table class="db-stock-ordering-lines db-mobile-card-table${compactClass}">
        ${renderStockOrderingLineColgroup(lineItems)}
        <thead>
          <tr>
            <th>Type</th>
            <th>Code</th>
            <th>Ralawise SKU</th>
            <th>Description</th>
            <th>Colour</th>
            <th>Size</th>
            <th>Qty</th>
            <th>Supplier</th>
          </tr>
        </thead>
        <tbody>
          ${lineItems.length
            ? lineItems.map(renderStockOrderingLineRow).join('')
            : '<tr><td colspan="8">No stock ordering line items</td></tr>'}
        </tbody>
      </table>
    `;
  }

  function renderStockOrderingLineColgroup(lineItems) {
    const headers = ['Type', 'Code', 'Ralawise SKU', 'Description', 'Colour', 'Size', 'Qty', 'Supplier'];
    const minChars = [6, 6, 12, 12, 8, 6, 4, 8];
    const rows = (lineItems || []).map((item) => [
      isStockItem(item) ? 'Stock' : 'Non-stock',
      orderDocumentItemCode(item),
      item.ralawise_sku || (isStockItem(item) ? 'Needs mapping' : '-'),
      orderDocumentItemDescription(item),
      item.colour || '',
      item.size || '',
      formatNumber(orderAckQuantity(item)),
      item.supplier_name || '',
    ]);
    const widths = headers.map((header, columnIndex) => {
      const maxChars = rows.reduce(
        (max, row) => Math.max(max, String(row[columnIndex] || '').length),
        header.length
      );
      return Math.max(minChars[columnIndex], maxChars + 2);
    });
    return `<colgroup>${widths.map((width) => `<col style="width:${width}ch">`).join('')}</colgroup>`;
  }

  function renderStockOrderingLineRow(item) {
    return `
      <tr>
        <td>${escapeHtml(isStockItem(item) ? 'Stock' : 'Non-stock')}</td>
        <td>${escapeHtml(orderDocumentItemCode(item))}</td>
        <td>${escapeHtml(item.ralawise_sku || (isStockItem(item) ? 'Needs mapping' : '-'))}</td>
        <td>${escapeHtml(orderDocumentItemDescription(item))}</td>
        <td>${escapeHtml(item.colour || '')}</td>
        <td>${escapeHtml(item.size || '')}</td>
        <td>${escapeHtml(formatNumber(orderAckQuantity(item)))}</td>
        <td>${escapeHtml(item.supplier_name || '')}</td>
      </tr>
    `;
  }

  function handleStockOrderingSelectChange(event) {
    const input = event.target.closest('[data-db-stock-select]');
    if (!input) return;
    const sourceOrderId = String(input.dataset.dbStockSelect || '');
    if (!sourceOrderId) return;
    if (input.checked) {
      state.stockOrderingSelectedIds.add(sourceOrderId);
    } else {
      state.stockOrderingSelectedIds.delete(sourceOrderId);
    }
    updateStockOrderingControls();
  }

  function toggleStockOrderingDetails(sourceOrderId) {
    const id = String(sourceOrderId || '');
    if (!id) return;
    if (state.stockOrderingExpandedIds.has(id)) {
      state.stockOrderingExpandedIds.delete(id);
    } else {
      state.stockOrderingExpandedIds.add(id);
    }
    renderStockOrderingJobs();
  }

  async function addStockOrderingJobToRalawise(sourceOrderId) {
    const id = String(sourceOrderId || '');
    if (!id || state.stockOrderingRalawiseAddingIds.has(id)) return;
    const job = (state.stockOrderingJobs || []).find((item) => String(item.source_order_id || '') === id);
    if (!job) return;

    state.stockOrderingRalawiseAddingIds.add(id);
    renderStockOrderingJobs();
    try {
      const data = await fetchJson(`/api/database/stock-ordering/${encodeURIComponent(id)}/ralawise-basket`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      job.ralawiseBasket = {
        ...(job.ralawiseBasket || {}),
        status: 'basketed',
        eligible: false,
        busy: false,
        alreadyBasketed: true,
        basketUrl: data.basketUrl || job.ralawiseBasket?.basketUrl || null,
        stockWarnings: Array.isArray(data.stockWarnings) ? data.stockWarnings : [],
        error: null,
      };

      const warnings = Array.isArray(data.stockWarnings) ? data.stockWarnings : [];
      if (warnings.length) {
        const unavailable = warnings.filter((warning) => warning.out_of_stock).length;
        alert(
          `Order ${job.order_no || id} was added to the Ralawise basket. `
          + `Ralawise reported ${formatNumber(warnings.length)} stock warning${warnings.length === 1 ? '' : 's'}`
          + `${unavailable ? `, including ${formatNumber(unavailable)} out of stock` : ''}.`
        );
      }
    } catch (err) {
      alert(err.message || 'Failed to add this job to Ralawise');
      const current = (state.stockOrderingJobs || []).find((item) => String(item.source_order_id || '') === id);
      if (current?.ralawiseBasket) {
        current.ralawiseBasket.status = 'failed';
        current.ralawiseBasket.error = err.message || 'Failed to add this job to Ralawise';
      }
    } finally {
      state.stockOrderingRalawiseAddingIds.delete(id);
      if (state.activeView === 'stock-ordering') renderStockOrderingJobs();
    }
  }

  function updateStockOrderingControls() {
    const selectedCount = state.stockOrderingSelectedIds.size;
    if (els.stockOrderingSummary) {
      els.stockOrderingSummary.textContent = `${formatNumber(selectedCount)} selected`;
    }
    if (els.stockOrderingCreate) {
      els.stockOrderingCreate.disabled = selectedCount < 1;
    }
  }

  function selectedStockOrderingJobs() {
    return (state.stockOrderingJobs || []).filter((job) => (
      state.stockOrderingSelectedIds.has(String(job.source_order_id || ''))
    ));
  }

  function stockOrderingLineItems(job) {
    return (job?.lineItems || []).filter((item) => !truthy(item.is_non_deliverable) && !truthy(item.is_internal));
  }

  function stockOrderingQuantity(job) {
    return stockOrderingLineItems(job).reduce((sum, item) => sum + orderAckQuantity(item), 0);
  }

  function isStockOrderedDashboardStatus(status) {
    const normalized = String(status || '').trim().toLowerCase();
    return normalized === 'stock ordered' || normalized === 'ordered';
  }

  async function loadProductStyles(options = {}) {
    const append = Boolean(options.append);
    const query = String(state.productStyleQuery || '').trim();
    const sort = normalizeDatabaseStyleSort(state.productStyleSort);
    const matchesLoadedRequest = state.loadedProductStyleQuery === query
      && state.loadedProductStyleSort === sort;

    if (append && (!state.productStylesHasMore || state.productStylesLoading || !matchesLoadedRequest)) return;
    if (state.productStylesLoading && !options.force) return;
    if (state.productStylesLoaded && matchesLoadedRequest && !options.force && !append) {
      renderProductStyles();
      return;
    }

    const requestId = ++productStylesRequest;
    const offset = append ? state.productStylesNextOffset : 0;
    const preferredStyleId = append ? '' : String(state.selectedStyleId || '');
    state.productStylesLoading = true;
    if (!append) {
      state.productStylesLoaded = false;
      state.productStylesHasMore = false;
      state.productStylesTotal = 0;
      state.productStylesNextOffset = 0;
      if (els.stylesFrame) els.stylesFrame.scrollTop = 0;
      if (els.stylesBody) {
        els.stylesBody.innerHTML = renderStatusRow(query ? 'Searching styles' : 'Loading styles', STYLE_TABLE_COLUMN_COUNT);
      }
      renderProductStyleDetails(null, query ? 'Searching style catalogue' : 'Loading style details');
    } else {
      updateProductStyleSummary(state.productStyles.length, state.productStylesTotal);
    }

    const params = new URLSearchParams({
      limit: String(STYLE_PAGE_LIMIT),
      offset: String(offset),
      sort,
    });
    if (query) params.set('q', query);

    try {
      const data = await fetchJson(`/api/database/products/styles?${params.toString()}`);
      if (requestId !== productStylesRequest) return;

      let rows = Array.isArray(data.styles) ? data.styles : [];
      if (!append && preferredStyleId && !styleIdExists(preferredStyleId, rows)) {
        const selectedParams = new URLSearchParams(params);
        selectedParams.set('limit', '1');
        selectedParams.set('offset', '0');
        selectedParams.set('styleId', preferredStyleId);
        const selectedData = await fetchJson(`/api/database/products/styles?${selectedParams.toString()}`);
        if (requestId !== productStylesRequest) return;
        const selectedStyle = Array.isArray(selectedData.styles) ? selectedData.styles[0] : null;
        if (selectedStyle) rows = [selectedStyle, ...rows];
      }
      if (append) {
        const existingIds = new Set(state.productStyles.map(productStyleKey));
        state.productStyles = state.productStyles.concat(
          rows.filter((style) => !existingIds.has(productStyleKey(style)))
        );
      } else {
        state.productStyles = rows;
      }
      state.productStylesTotal = Number.isFinite(Number(data.total))
        ? Number(data.total)
        : state.productStyles.length;
      state.productStylesNextOffset = Number.isFinite(Number(data.nextOffset))
        ? Number(data.nextOffset)
        : offset + (Array.isArray(data.styles) ? data.styles.length : 0);
      state.productStylesHasMore = Boolean(data.hasMore)
        && state.productStyles.length < state.productStylesTotal;
      state.loadedProductStyleQuery = query;
      state.loadedProductStyleSort = sort;
      state.productStylesLoaded = true;
      if (!styleIdExists(state.selectedStyleId)) {
        state.selectedStyleId = productStyleKey(state.productStyles[0]);
      }
      renderProductStyles();
    } catch (err) {
      if (requestId !== productStylesRequest) return;
      state.productStylesLoaded = append && state.productStyles.length > 0;
      if (!append && els.stylesBody) {
        els.stylesBody.innerHTML = renderStatusRow(err.message || 'Failed to load styles', STYLE_TABLE_COLUMN_COUNT);
      }
      if (!append) renderProductStyleDetails(null, err.message || 'Failed to load style details');
    } finally {
      if (requestId === productStylesRequest) {
        state.productStylesLoading = false;
        updateProductStyleSummary(state.productStyles.length, state.productStylesTotal);
      }
    }
  }

  function renderProductStyles() {
    if (!els.stylesBody) return;
    const styles = state.productStyles || [];
    updateProductStyleSummary(styles.length, state.productStylesTotal);
    if (!styles.length) {
      const emptyMessage = state.productStyleQuery ? 'No matching styles' : 'No product styles found';
      els.stylesBody.innerHTML = renderStatusRow(emptyMessage, STYLE_TABLE_COLUMN_COUNT);
      renderProductStyleDetails(null, emptyMessage);
      return;
    }

    if (!styleIdExists(state.selectedStyleId, styles)) {
      state.selectedStyleId = productStyleKey(styles[0]);
    }
    els.stylesBody.innerHTML = styles.map(renderProductStyleRow).join('');
    renderProductStyleDetails(selectedProductStyle());
  }

  function renderProductStyleRow(style, index) {
    const styleId = productStyleKey(style);
    const selected = styleId && styleId === String(state.selectedStyleId || '');
    return `
      <tr class="db-style-row ${selected ? 'selected' : ''}" data-style-id="${escapeAttr(styleId)}" tabindex="0">
        <td class="db-row-selector">${selected || (!state.selectedStyleId && index === 0) ? '&#9654;' : ''}</td>
        <td class="db-style-sku-cell">${escapeHtml(productStyleSku(style))}</td>
        <td>${escapeHtml(productStyleTitle(style))}</td>
        <td>${escapeHtml(formatProductStyleCost(style))}</td>
        <td>${escapeHtml(formatNumber(style?.variant_count || 0))}</td>
      </tr>
    `;
  }

  function handleProductStyleRowClick(event) {
    const row = event.target.closest('tr[data-style-id]');
    if (!row) return;
    selectProductStyle(row.dataset.styleId);
  }

  function handleProductStyleRowKeydown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const row = event.target.closest('tr[data-style-id]');
    if (!row) return;
    event.preventDefault();
    selectProductStyle(row.dataset.styleId);
  }

  function handleProductStyleSearchInput() {
    state.productStyleQuery = String(els.stylesSearch?.value || '').trim();
    state.selectedStyleId = '';
    window.clearTimeout(productStyleSearchTimer);
    productStylesRequest += 1;
    state.productStylesLoading = false;
    if (els.stylesSummary) els.stylesSummary.textContent = 'Searching styles...';
    productStyleSearchTimer = window.setTimeout(() => {
      loadProductStyles({ force: true });
    }, STYLE_SEARCH_DELAY);
    persistDatabaseRoute();
  }

  function handleProductStyleSortChange() {
    window.clearTimeout(productStyleSearchTimer);
    state.productStyleSort = normalizeDatabaseStyleSort(els.stylesSort?.value);
    if (els.stylesSort && els.stylesSort.value !== state.productStyleSort) {
      els.stylesSort.value = state.productStyleSort;
    }
    loadProductStyles({ force: true });
    persistDatabaseRoute();
  }

  function handleProductStylesScroll() {
    if (productStylesScrollFrame) return;
    productStylesScrollFrame = window.requestAnimationFrame(() => {
      productStylesScrollFrame = 0;
      if (!els.stylesFrame || !state.productStylesHasMore || state.productStylesLoading) return;
      const distanceFromBottom = isDatabaseMobileLayout()
        ? els.stylesFrame.getBoundingClientRect().bottom - window.innerHeight
        : els.stylesFrame.scrollHeight
          - els.stylesFrame.scrollTop
          - els.stylesFrame.clientHeight;
      if (distanceFromBottom <= 120) loadProductStyles({ append: true });
    });
  }

  function selectProductStyle(styleId) {
    const nextId = String(styleId || '');
    if (!nextId || nextId === String(state.selectedStyleId || '')) return;
    state.selectedStyleId = nextId;
    renderProductStyles();
    persistDatabaseRoute();
    if (isDatabaseMobileLayout()) {
      window.requestAnimationFrame(() => {
        els.stylesDetailPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }

  function renderProductStyleDetails(style, message = '') {
    if (
      !els.stylesSelectedTitle
      || !els.stylesSelectedMeta
      || !els.stylesSelectedCost
      || !els.stylesSizes
      || !els.stylesColours
    ) return;
    if (!style) {
      els.stylesDetailPanel?.classList.remove('db-styles-many-colours');
      els.stylesSelectedTitle.textContent = message || 'Select a parent product';
      els.stylesSelectedMeta.textContent = '';
      els.stylesSelectedCost.textContent = '';
      if (els.stylesColourLabel) els.stylesColourLabel.textContent = '';
      if (els.stylesSizeLabel) els.stylesSizeLabel.textContent = '';
      els.stylesSizes.innerHTML = `<div class="db-panel-message">${escapeHtml(message || 'No size options')}</div>`;
      els.stylesColours.innerHTML = `<div class="db-panel-message">${escapeHtml(message || 'No colours')}</div>`;
      setProductStylePreview('', '', message || 'Select a parent product');
      return;
    }

    const sizes = sortProductSizeOptions(style.sizes);
    const colours = productStyleOptionArray(style.colours);
    const sku = productStyleSku(style);
    const type = String(style.product_type || '').trim();
    const supplier = String(style.supplier_name || '').trim();
    const meta = [
      sku ? `SKU ${sku}` : '',
      type,
      supplier,
      `${formatNumber(style.variant_count || 0)} variants`,
      `${formatNumber(style.size_count || sizes.length)} sizes`,
      `${formatNumber(style.colour_count || colours.length)} colours`,
    ].filter(Boolean).join(' | ');

    els.stylesSelectedTitle.textContent = productStyleTitle(style);
    els.stylesSelectedMeta.textContent = meta;
    els.stylesSelectedCost.textContent = formatProductStyleCost(style);
    setProductStylePreview(
      productStyleImageUrl(style.primary_image_url),
      productStyleTitle(style),
      'No image available'
    );

    renderProductStyleVariantOptions(style, colours);
  }

  function renderProductStyleVariantOptions(style, variants) {
    const colourGroups = productStyleColourGroups(variants);
    els.stylesDetailPanel?.classList.toggle('db-styles-many-colours', colourGroups.length > 24);
    if (!colourGroups.length) {
      if (els.stylesColourLabel) els.stylesColourLabel.textContent = '';
      if (els.stylesSizeLabel) els.stylesSizeLabel.textContent = '';
      els.stylesColours.innerHTML = renderProductStyleChips(style.colours, 'No colours');
      els.stylesSizes.innerHTML = renderProductStyleChips(sortProductSizeOptions(style.sizes), 'No size options');
      return;
    }

    const styleId = productStyleKey(style);
    const rememberedKey = state.selectedStyleColourKeys.get(styleId);
    const selectedGroup = colourGroups.find((group) => group.key === rememberedKey)
      || colourGroups.find((group) => group.imageUrl)
      || colourGroups[0];
    state.selectedStyleColourKeys.set(styleId, selectedGroup.key);

    els.stylesColours.innerHTML = colourGroups.map((group) => {
      const selected = group.key === selectedGroup.key;
      return `
        <button
          class="db-styles-chip db-styles-colour-chip ${selected ? 'selected' : ''}"
          type="button"
          data-style-colour="${escapeAttr(group.key)}"
          aria-pressed="${selected ? 'true' : 'false'}"
          title="${escapeAttr(`Show ${group.label} image`)}"
        ><span>${escapeHtml(group.label)}</span></button>
      `;
    }).join('');

    const availableSizes = sortProductSizeLabels(selectedGroup.sizes.length
      ? selectedGroup.sizes
      : unique(selectedGroup.variants
        .map((variant) => String(variant?.size || '').trim())
        .filter(Boolean)));
    const availableSizeSet = new Set(availableSizes);
    const orderedSizes = sortProductSizeOptions(style.sizes)
      .map((size) => String(typeof size === 'string' ? size : size?.label || '').trim())
      .filter((size) => size && availableSizeSet.has(size));
    const sizes = sortProductSizeLabels(unique(orderedSizes.concat(availableSizes)));
    els.stylesSizes.innerHTML = renderProductStyleChips(sizes, 'No sizes for this colour');
    if (els.stylesColourLabel) els.stylesColourLabel.textContent = `· ${selectedGroup.label}`;
    if (els.stylesSizeLabel) {
      els.stylesSizeLabel.textContent = sizes.length
        ? `· ${formatNumber(sizes.length)} available`
        : '';
    }

    const imageUrl = selectedGroup.imageUrl || productStyleImageUrl(style.primary_image_url);
    setProductStylePreview(
      imageUrl,
      `${productStyleTitle(style)} - ${selectedGroup.label}`,
      `No image available for ${selectedGroup.label}`
    );
  }

  function productStyleColourGroups(variants) {
    const groups = new Map();
    for (const variant of variants || []) {
      const label = String(variant?.colour || variant?.label || '').trim();
      if (!label) continue;
      const key = String(variant?.colour_id ?? variant?.key ?? label.toLowerCase());
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          label,
          imageUrl: '',
          sizes: [],
          variants: [],
        });
      }
      const group = groups.get(key);
      group.variants.push(variant);
      group.imageUrl = group.imageUrl
        || productStyleImageUrl(variant?.image_url)
        || productStyleImageUrl(variant?.colour_image_url)
        || productStyleImageUrl(variant?.primary_image_url);
      group.sizes = unique(group.sizes.concat(
        productStyleOptionArray(variant?.sizes)
          .map((size) => String(typeof size === 'string' ? size : size?.label || '').trim())
          .filter(Boolean)
      ));
    }
    return Array.from(groups.values()).map((group) => ({
      ...group,
      sizes: sortProductSizeLabels(group.sizes),
    }));
  }

  function handleProductStyleColourClick(event) {
    const button = event.target.closest('button[data-style-colour]');
    const style = selectedProductStyle();
    if (!button || !style) return;
    state.selectedStyleColourKeys.set(productStyleKey(style), String(button.dataset.styleColour || ''));
    renderProductStyleVariantOptions(style, productStyleOptionArray(style.colours));
  }

  function setProductStylePreview(url, alt, emptyLabel) {
    if (!els.stylesPreviewImage || !els.stylesPreviewPlaceholder) return;
    const imageUrl = productStyleImageUrl(url);
    els.stylesPreviewImage.alt = alt || '';
    els.stylesPreviewImage.dataset.emptyLabel = emptyLabel || 'No image available';
    if (
      imageUrl
      && els.stylesPreviewImage.dataset.imageUrl === imageUrl
      && els.stylesPreviewImage.complete
      && els.stylesPreviewImage.naturalWidth > 0
    ) {
      els.stylesPreviewImage.classList.remove('is-loading');
      els.stylesPreviewPlaceholder.hidden = true;
      setProductStylePreviewInteractive(true);
      return;
    }

    els.stylesPreviewImage.classList.add('is-loading');
    setProductStylePreviewInteractive(false);
    els.stylesPreviewPlaceholder.hidden = false;
    els.stylesPreviewPlaceholder.textContent = imageUrl ? 'Loading image...' : (emptyLabel || 'No image available');
    if (!imageUrl) {
      delete els.stylesPreviewImage.dataset.imageUrl;
      els.stylesPreviewImage.removeAttribute('src');
      return;
    }
    els.stylesPreviewImage.dataset.imageUrl = imageUrl;
    els.stylesPreviewImage.src = imageUrl;
  }

  function handleProductStyleImageLoad(event) {
    const image = event.currentTarget;
    if (!image?.src) return;
    image.classList.remove('is-loading');
    if (els.stylesPreviewPlaceholder) els.stylesPreviewPlaceholder.hidden = true;
    setProductStylePreviewInteractive(true);
  }

  function handleProductStyleImageError(event) {
    const image = event.currentTarget;
    image.classList.add('is-loading');
    setProductStylePreviewInteractive(false);
    if (els.stylesPreviewPlaceholder) {
      els.stylesPreviewPlaceholder.hidden = false;
      els.stylesPreviewPlaceholder.textContent = image.dataset.emptyLabel || 'Image unavailable';
    }
  }

  function setProductStylePreviewInteractive(enabled) {
    if (!els.stylesPreview) return;
    els.stylesPreview.classList.toggle('is-zoomable', enabled);
    els.stylesPreview.setAttribute('aria-disabled', enabled ? 'false' : 'true');
    els.stylesPreview.title = enabled ? 'Click to view fullscreen' : '';
  }

  function handleProductStylePreviewKeydown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openProductStyleImageModal();
  }

  function openProductStyleImageModal() {
    const previewImage = els.stylesPreviewImage;
    if (
      !previewImage
      || previewImage.classList.contains('is-loading')
      || !previewImage.complete
      || previewImage.naturalWidth <= 0
      || !els.stylesImageModal
      || !els.stylesImageModalImage
    ) return;

    const imageUrl = productStyleImageUrl(previewImage.dataset.imageUrl || previewImage.currentSrc || previewImage.src);
    if (!imageUrl) return;
    els.stylesImageModalImage.src = imageUrl;
    els.stylesImageModalImage.alt = previewImage.alt || 'Product image';
    els.stylesImageModal.hidden = false;
    els.stylesImageModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open', 'db-styles-image-modal-open');
    els.stylesImageModalClose?.focus({ preventScroll: true });
  }

  function handleProductStyleImageModalClick(event) {
    if (event.target === els.stylesImageModal) closeProductStyleImageModal();
  }

  function closeProductStyleImageModal() {
    if (!els.stylesImageModal || els.stylesImageModal.hidden) return;
    els.stylesImageModal.hidden = true;
    els.stylesImageModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open', 'db-styles-image-modal-open');
    els.stylesPreview?.focus({ preventScroll: true });
  }

  function productStyleImageUrl(value) {
    const url = String(value || '').trim();
    if (!/^https?:\/\//i.test(url) || url.toLowerCase() === 'not available') return '';
    return url;
  }

  function renderProductStyleChips(items, emptyLabel) {
    const options = productStyleOptionArray(items);
    if (!options.length) {
      return `<div class="db-panel-message">${escapeHtml(emptyLabel)}</div>`;
    }
    return options.map((item) => {
      const label = typeof item === 'string' ? item : item?.label;
      return `
        <span class="db-styles-chip" title="${escapeAttr(label || '')}">
          <span>${escapeHtml(label || '-')}</span>
        </span>
      `;
    }).join('');
  }

  function selectedProductStyle() {
    const selectedId = String(state.selectedStyleId || '');
    return (state.productStyles || []).find((style) => productStyleKey(style) === selectedId) || null;
  }

  function styleIdExists(styleId, styles = state.productStyles) {
    const key = String(styleId || '');
    return Boolean(key && (styles || []).some((style) => productStyleKey(style) === key));
  }

  function updateProductStyleSummary(loadedCount, totalCount) {
    if (!els.stylesSummary) return;
    const query = String(state.productStyleQuery || '').trim();
    if (state.productStylesLoading && !state.productStylesLoaded) {
      els.stylesSummary.textContent = query ? 'Searching styles...' : 'Loading styles...';
      return;
    }
    const total = Number.isFinite(Number(totalCount)) ? Number(totalCount) : loadedCount;
    if (loadedCount < total) {
      els.stylesSummary.textContent = `Showing ${formatNumber(loadedCount)} of ${formatNumber(total)}${query ? ' matches' : ' styles'}${state.productStylesLoading ? ' · loading more' : ''}`;
      return;
    }
    els.stylesSummary.textContent = `${formatNumber(total)}${query ? ' matches' : ' styles'}`;
  }

  function productStyleKey(style) {
    if (!style) return '';
    return String(style.style_id ?? '');
  }

  function productStyleTitle(style) {
    return style?.style_name || 'Untitled style';
  }

  function productStyleSku(style) {
    return style?.style_code || style?.alt_style_code || '';
  }

  function productStyleOptionArray(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (typeof value === 'string' && value.trim()) {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  function productSizeOptionLabel(option) {
    return String(typeof option === 'string' ? option : option?.label || '').trim();
  }

  function sortProductSizeLabels(values) {
    return Array.from(values || []).sort(compareProductSizes);
  }

  function sortProductSizeOptions(value) {
    return productStyleOptionArray(value)
      .slice()
      .sort((left, right) => compareProductSizes(
        productSizeOptionLabel(left),
        productSizeOptionLabel(right)
      ));
  }

  function productStyleCosts(style) {
    const rawCosts = productStyleOptionArray(style?.unit_costs);
    const costs = rawCosts
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));
    const min = Number(style?.min_unit_cost);
    const max = Number(style?.max_unit_cost);
    if (Number.isFinite(min)) costs.push(min);
    if (Number.isFinite(max)) costs.push(max);
    const uniqueCosts = Array.from(new Set(costs.map((value) => value.toFixed(2))))
      .map((value) => Number(value))
      .sort((a, b) => a - b);
    const positiveCosts = uniqueCosts.filter((value) => value > 0);
    return positiveCosts.length ? positiveCosts : uniqueCosts;
  }

  function formatProductStyleCost(style) {
    const costs = productStyleCosts(style);
    if (!costs.length) return '-';
    if (costs.length === 1) return formatCurrency(costs[0]);
    if (costs.length <= 3) return costs.map(formatCurrency).join(', ');
    return `${formatCurrency(costs[0])} - ${formatCurrency(costs[costs.length - 1])}`;
  }

  async function markStockOrderingSnapshotOrdered() {
    if (state.activeDocumentType !== 'stock-ordering') return true;
    if (state.stockOrderingStatusSaving) return false;

    const jobs = (state.stockOrderingSnapshot?.jobs || [])
      .filter((job) => job?.source_order_id)
      .filter((job) => !state.stockOrderingStatusAppliedIds.has(String(job.source_order_id)));
    if (!jobs.length) return true;

    state.stockOrderingStatusSaving = true;
    setOrderAckActionSaving(true);
    try {
      const sourceOrderIds = jobs.map((job) => job.source_order_id);
      const data = await fetchJson('/api/database/stock-ordering/mark-ordered', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceOrderIds }),
      });
      for (const updatedJob of data.updatedJobs || []) {
        state.stockOrderingStatusAppliedIds.add(String(updatedJob.source_order_id));
      }
      removeStockOrderedJobsFromStockOrderingList(jobs);
      updateCachedDashboardStatusForJobs(jobs, STOCK_ORDERED_STATUS_LABEL);
      return true;
    } catch (err) {
      console.error('Failed to mark stock ordering jobs as ordered', err);
      alert(err.message || 'Failed to update dashboard status to Stock Ordered');
      return false;
    } finally {
      state.stockOrderingStatusSaving = false;
      setOrderAckActionSaving(false);
    }
  }

  function removeStockOrderedJobsFromStockOrderingList(jobs) {
    const orderedIds = new Set((jobs || []).map((job) => String(job.source_order_id || '')).filter(Boolean));
    if (!orderedIds.size) return;
    state.stockOrderingJobs = (state.stockOrderingJobs || []).filter((job) => (
      !orderedIds.has(String(job.source_order_id || ''))
    ));
    orderedIds.forEach((id) => {
      state.stockOrderingSelectedIds.delete(id);
      state.stockOrderingExpandedIds.delete(id);
    });
    if (state.activeView === 'stock-ordering') renderStockOrderingJobs();
  }

  function updateCachedDashboardStatusForJobs(jobs, statusLabel) {
    const statusUpdatedAt = new Date().toISOString();
    for (const job of jobs || []) {
      if (!job?.source_order_id) continue;
      const patch = {
        source_order_id: job.source_order_id,
        dashboard_status: statusLabel,
        dashboard_status_updated_at: statusUpdatedAt,
      };
      updateOutstandingJob(patch);
      if (state.selectedJob && Number(state.selectedJob.source_order_id) === Number(job.source_order_id)) {
        state.selectedJob = { ...state.selectedJob, ...patch };
      }
    }
  }

  async function loadOutstandingOrders(options = {}) {
    const mode = state.orderMode;
    if (state.loadingOrders && state.loadedOrderMode === mode && !options.force) {
      renderOutstandingOrders();
      return;
    }
    if (state.outstandingJobs.length && state.loadedOrderMode === mode && !options.force) {
      if (!state.loadedCustomerUsers) {
        await ensureCustomerUsers();
      }
      renderOutstandingOrders();
      return;
    }

    const token = state.orderLoadToken + 1;
    state.orderLoadToken = token;
    state.loadingOrders = true;
    state.orderLoadComplete = false;
    state.loadedOrderMode = mode;
    state.outstandingJobs = [];
    state.outstandingTotal = 0;
    state.visibleOrderLimit = PAGE_LIMIT;
    syncOutstandingTableMode();
    els.outstandingBody.innerHTML = renderStatusRow(mode === 'all' ? 'Loading all orders' : 'Loading outstanding orders', outstandingTableColumnCount());
    scheduleOutstandingTableLayout([]);

    try {
      const [result] = await Promise.all([
        fetchJobsPage(mode, 0, { includeTotal: true }),
        ensureCustomerUsers(),
      ]);
      if (!isCurrentOrderLoad(token, mode)) return;

      state.outstandingJobs = result.jobs;
      state.outstandingTotal = result.total;
      renderOutstandingOrders();
      hydrateOrderSelectors();
      if (result.hasMore) {
        loadRemainingJobs(mode, result.nextOffset, token, result.hasMore);
      } else {
        state.loadingOrders = false;
        state.orderLoadComplete = true;
      }
    } catch (err) {
      if (!isCurrentOrderLoad(token, mode)) return;
      state.loadingOrders = false;
      state.orderLoadComplete = true;
      state.loadedOrderMode = '';
      els.outstandingBody.innerHTML = renderStatusRow(err.message, outstandingTableColumnCount());
      scheduleOutstandingTableLayout([]);
    }
  }

  async function loadRemainingJobs(mode, offset, token, hasMore) {
    let nextOffset = offset;
    let hasMorePages = hasMore;

    try {
      while (isCurrentOrderLoad(token, mode) && hasMorePages) {
        const result = await fetchJobsPage(mode, nextOffset, { includeTotal: false });
        if (!isCurrentOrderLoad(token, mode)) return;
        if (!result.jobs.length) break;

        state.outstandingJobs.push(...result.jobs);
        state.outstandingTotal = Math.max(state.outstandingTotal, result.total);
        nextOffset = result.nextOffset;
        hasMorePages = result.hasMore;
        await yieldOrderLoad(BACKGROUND_LOAD_DELAY_MS);
      }
    } catch (err) {
      if (isCurrentOrderLoad(token, mode)) {
        console.error('Background order load failed', err);
      }
    } finally {
      if (!isCurrentOrderLoad(token, mode)) return;
      state.outstandingTotal = state.outstandingJobs.length;
      state.loadingOrders = false;
      state.orderLoadComplete = true;
    }
  }

  async function fetchJobsPage(mode, offset, options = {}) {
    const includeTotal = options.includeTotal !== false;
    const hasActiveSearch = mode === 'all' && Boolean(state.orderSearchQuery);
    const params = new URLSearchParams({
      limit: String(PAGE_LIMIT),
      offset: String(offset),
    });
    if (!includeTotal || hasActiveSearch) params.set('includeTotal', 'false');
    if (mode !== 'all') params.set('status', 'open');
    if (hasActiveSearch) params.set('q', state.orderSearchQuery);

    const data = await fetchJson(`/api/database/jobs?${params.toString()}`);
    storeDashboardStatusColors(data.dashboardStatusColors);
    const jobs = data.jobs || [];
    const limit = data.limit || PAGE_LIMIT;
    const nextOffset = offset + limit;
    const hasMore = typeof data.hasMore === 'boolean'
      ? data.hasMore
      : jobs.length > 0 && nextOffset < Number(data.total || 0);
    const total = Number.isFinite(Number(data.total))
      ? Number(data.total)
      : Math.max(state.outstandingTotal || 0, offset + jobs.length + (hasMore ? 1 : 0));
    return {
      jobs,
      total,
      nextOffset,
      hasMore,
    };
  }

  function isCurrentOrderLoad(token, mode) {
    return state.orderLoadToken === token
      && state.loadedOrderMode === mode
      && state.orderMode === mode;
  }

  function yieldOrderLoad(delayMs = 0) {
    return new Promise((resolve) => window.setTimeout(resolve, delayMs));
  }

  function renderOutstandingOrders(options = {}) {
    const hydrateSelectors = options.hydrateSelectors !== false;
    syncOutstandingTableMode();
    const rows = groupedOutstandingRows(ordersForCurrentRender());
    const jobs = rows.flatMap((group) => group.jobs);
    if (!jobs.length) {
      els.outstandingBody.innerHTML = renderStatusRow('No matching orders', outstandingTableColumnCount());
      scheduleOutstandingTableLayout([]);
      if (hydrateSelectors) hydrateOrderSelectors();
      return;
    }

    const scrollTop = options.preserveScroll ? els.outstandingFrame?.scrollTop : null;
    els.outstandingBody.innerHTML = jobs.map(renderOutstandingRow).join('');
    scheduleOutstandingTableLayout(jobs);
    if (scrollTop !== null && els.outstandingFrame) els.outstandingFrame.scrollTop = scrollTop;
    if (hydrateSelectors) hydrateOrderSelectors();
  }

  function scheduleOutstandingTableLayout(jobs = null) {
    if (outstandingLayoutFrame) window.cancelAnimationFrame(outstandingLayoutFrame);
    const layoutJobs = Array.isArray(jobs)
      ? jobs
      : groupedOutstandingRows(ordersForCurrentRender()).flatMap((group) => group.jobs);
    outstandingLayoutFrame = window.requestAnimationFrame(() => {
      outstandingLayoutFrame = 0;
      updateOutstandingTableLayout(layoutJobs);
    });
  }

  function updateOutstandingTableLayout(jobs = []) {
    const table = els.outstandingTable;
    if (!table) return;
    if (isDatabaseMobileLayout()) {
      table.style.removeProperty('--db-outstanding-taken-by-width');
      table.style.removeProperty('--db-outstanding-title-width');
      table.style.removeProperty('--db-outstanding-table-width');
      return;
    }

    const frameWidth = els.outstandingFrame?.clientWidth || 0;
    const measuredTakenByWidth = measureOutstandingTakenByWidth(table, jobs);
    const takenByWidth = Math.ceil(Math.max(
      OUTSTANDING_TAKEN_BY_COLUMN_MIN_WIDTH,
      measuredTakenByWidth + OUTSTANDING_TAKEN_BY_CELL_EXTRA_WIDTH
    ));
    const measuredTitleWidth = measureOutstandingTitleWidth(table, jobs);
    const desiredTitleWidth = Math.ceil(Math.max(
      OUTSTANDING_TITLE_COLUMN_MIN_WIDTH,
      measuredTitleWidth + OUTSTANDING_TITLE_CELL_EXTRA_WIDTH
    ));
    const fixedWidth = outstandingTableFixedWidth(takenByWidth);
    const maxTitleWidth = frameWidth > fixedWidth
      ? Math.max(OUTSTANDING_TITLE_COLUMN_MIN_WIDTH, frameWidth - fixedWidth - 2)
      : desiredTitleWidth;
    const titleWidth = Math.min(desiredTitleWidth, maxTitleWidth);
    const tableWidth = fixedWidth + titleWidth;

    table.style.setProperty('--db-outstanding-taken-by-width', `${takenByWidth}px`);
    table.style.setProperty('--db-outstanding-title-width', `${titleWidth}px`);
    table.style.setProperty('--db-outstanding-table-width', `${tableWidth}px`);
  }

  function syncOutstandingTableMode() {
    els.outstandingTable?.classList.toggle('db-all-orders-mode', state.orderMode === 'all');
  }

  function outstandingTableColumnCount() {
    return state.orderMode === 'all' ? OUTSTANDING_ALL_TABLE_COLUMN_COUNT : OUTSTANDING_TABLE_COLUMN_COUNT;
  }

  function outstandingTableFixedWidth(takenByWidth = OUTSTANDING_TAKEN_BY_COLUMN_MIN_WIDTH) {
    return OUTSTANDING_TABLE_FIXED_BASE_WIDTH
      + takenByWidth
      + (state.orderMode === 'all' ? OUTSTANDING_INVOICE_COLUMN_WIDTH : 0);
  }

  function measureOutstandingTitleWidth(table, jobs = []) {
    if (!outstandingTitleMeasureCanvas) {
      outstandingTitleMeasureCanvas = document.createElement('canvas');
    }
    const context = outstandingTitleMeasureCanvas.getContext('2d');
    if (!context) return OUTSTANDING_TITLE_COLUMN_MIN_WIDTH;

    const sourceCell = table.querySelector('tbody td:nth-child(6)')
      || table.querySelector('thead th:nth-child(6)')
      || table;
    const style = window.getComputedStyle(sourceCell);
    context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;

    let width = context.measureText('Job title:').width;
    for (const job of jobs) {
      width = Math.max(width, context.measureText(String(job?.job_title || '')).width);
    }
    return width;
  }

  function measureOutstandingTakenByWidth(table, jobs = []) {
    if (!outstandingTitleMeasureCanvas) {
      outstandingTitleMeasureCanvas = document.createElement('canvas');
    }
    const context = outstandingTitleMeasureCanvas.getContext('2d');
    if (!context) return OUTSTANDING_TAKEN_BY_COLUMN_MIN_WIDTH;

    const sourceCell = table.querySelector('tbody td:nth-child(7)')
      || table.querySelector('thead th:nth-child(7)')
      || table;
    const style = window.getComputedStyle(sourceCell);
    context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;

    let width = context.measureText('Taken by:').width;
    for (const job of jobs) {
      width = Math.max(width, context.measureText(outstandingTakenByFirstName(job)).width);
    }
    return width;
  }

  function ordersForCurrentRender() {
    if (state.orderMode !== 'all') return state.outstandingJobs;
    return state.outstandingJobs.slice(0, state.visibleOrderLimit);
  }

  function groupedOutstandingRows(sourceJobs = state.outstandingJobs) {
    const groups = [
      { key: 'print', label: 'Print', jobs: [] },
      { key: 'print_embroidery', label: 'Print + Emb', jobs: [] },
      { key: 'embroidery', label: 'Embroidery', jobs: [] },
      { key: 'gifts', label: 'Gifts', jobs: [] },
      { key: 'other', label: 'Other', jobs: [] },
    ];
    const groupMap = new Map(groups.map((group) => [group.key, group]));

    for (const job of filteredOutstandingJobs(sourceJobs)) {
      const category = categoryForJob(job);
      (groupMap.get(category) || groupMap.get('other')).jobs.push(job);
    }

    groups.forEach((group) => group.jobs.sort(compareJobs));
    return groups.filter((group) => group.jobs.length);
  }

  function filteredOutstandingJobs(sourceJobs = state.outstandingJobs) {
    const active = state.activeGroup;
    return sourceJobs.filter((job) => {
      const category = categoryForJob(job);
      if (active === 'all') return true;
      if (active === 'ready') return isReady(job);
      if (active === 'not-ready') return !isReady(job);
      return category === active;
    });
  }

  function compareJobs(a, b) {
    if (state.activeSort === 'delivery') {
      const aTime = dateTime(a.delivery_date);
      const bTime = dateTime(b.delivery_date);
      if (aTime !== bTime) return aTime - bTime;
    }
    return Number(b.order_no || 0) - Number(a.order_no || 0);
  }

  function renderOutstandingRow(job) {
    const selected = state.selectedJob && Number(state.selectedJob.source_order_id) === Number(job.source_order_id);
    const statusLabel = outstandingDashboardStatusLabel(job);
    const statusCompleted = normalizeDashboardStatusLabel(statusLabel) === 'COMPLETED';
    return `
      <tr class="db-outstanding-row ${selected ? 'selected' : ''} ${statusCompleted ? 'db-dashboard-status-completed' : ''}" data-job-id="${escapeAttr(job.source_order_id)}" tabindex="0">
        <td class="db-row-selector">${selected ? '&#9654;' : ''}</td>
        <td class="db-order-link">${escapeHtml(job.order_no || '')}</td>
        <td class="db-invoice-number-cell">${renderInvoiceNumberCell(job)}</td>
        <td class="db-customer-link">${escapeHtml(job.customer_name || '')}</td>
        <td class="db-type-cell db-type-${categoryForJob(job)}">${escapeHtml(typeAbbr(job))}</td>
        <td>${escapeHtml(job.job_title || '')}</td>
        <td>${escapeHtml(outstandingTakenByFirstName(job))}</td>
        <td>${escapeHtml(formatDate(job.order_date, 'long'))}</td>
        <td>${escapeHtml(outstandingDeliveryLabel(job))}</td>
        ${renderOutstandingStatusCell(statusLabel)}
      </tr>
    `;
  }

  function outstandingDeliveryLabel(job) {
    return `${formatDate(job?.delivery_date, 'long')}${truthy(job?.customer_date_required) ? ' *' : ''}`;
  }

  function renderOutstandingStatusCell(statusLabel) {
    const label = String(statusLabel || '').trim();
    if (!label) return '<td class="db-dashboard-status-cell db-dashboard-status-empty"></td>';
    return `
      <td
        class="db-dashboard-status-cell"
        style="background-color:${escapeAttr(dashboardStatusColor(label))}"
        title="${escapeAttr(label)}"
      ><span class="db-dashboard-status-label">${escapeHtml(label)}</span></td>
    `;
  }

  function outstandingDashboardStatusLabel(job) {
    if (categoryForJob(job || {}) === 'gifts') return '';
    const explicit = String(job?.dashboard_status || '').trim();
    if (explicit) return explicit;
    if (state.orderMode === 'open' && !truthy(job?.is_complete)) return 'AWAITING APPROVAL';
    return '';
  }

  function storeDashboardStatusColors(colors) {
    if (!colors || typeof colors !== 'object') return;
    state.dashboardStatusColors = Object.entries(colors).reduce((map, [label, color]) => {
      const normalized = normalizeDashboardStatusLabel(label);
      const safeColor = safeDashboardStatusColor(color, '');
      if (normalized && safeColor) map[normalized] = safeColor;
      return map;
    }, {});
  }

  function dashboardStatusColor(label) {
    return state.dashboardStatusColors[normalizeDashboardStatusLabel(label)] || '#c4c4c4';
  }

  function normalizeDashboardStatusLabel(label) {
    const normalized = String(label || '').trim().replace(/\s+/g, ' ').toUpperCase();
    if (normalized === 'WAITING APPROVAL') return 'AWAITING APPROVAL';
    return normalized;
  }

  function safeDashboardStatusColor(color, fallback = '#c4c4c4') {
    const value = String(color || '').trim();
    return /^#[0-9a-f]{3,8}$/i.test(value) ? value : fallback;
  }

  function renderInvoiceNumberCell(job) {
    if (!job?.invoice_no) return '';
    return `
      <button
        class="db-invoice-number-button"
        type="button"
        data-db-invoice-job="${escapeAttr(job.source_order_id)}"
      >${escapeHtml(job.invoice_no)}</button>
    `;
  }

  async function openSelectedOrder(value) {
    const id = Number.parseInt(value, 10);
    if (!Number.isFinite(id)) return;
    await flushOrderAutosaves();
    await openOrder(id, state.activeOrderTab || 'details');
  }

  async function openDatabaseOrderFromDashboard(id, tab = 'details') {
    const sourceOrderId = Number.parseInt(id, 10);
    if (!Number.isFinite(sourceOrderId)) return;
    await flushOrderAutosaves();
    if (typeof window.activateDashboardTab === 'function') {
      window.activateDashboardTab('database');
    } else {
      els.sideTab?.click();
    }
    if (!state.loadedHome) loadHomeMetrics();
    await openOrder(sourceOrderId, tab || 'details');
  }

  async function openOrder(id, tab, options = {}) {
    state.activeOrderTab = normalizeDatabaseOrderTab(tab);
    const sourceView = state.activeView;
    showView('order', { skipHistory: options.skipHistory, skipPersistence: true });
    setFooterTitle(sourceView === 'to-invoice' ? 'To Invoice' : 'Open Orders');
    setOrderLoading();

    try {
      const data = await fetchJson(`/api/database/jobs/${encodeURIComponent(id)}`);
      state.selectedJob = data.job || {};
      state.selectedLineItems = data.lineItems || [];
      state.selectedPositions = data.positions || [];
      state.selectedProofFiles = normalizeDatabaseProofFiles(data.proofFiles || []);
      state.selectedCustomerOverview = data.customerOverview || null;
      state.orderCustomerDetail = await loadOrderCustomerDetail(state.selectedJob);
      resetDatabaseProofViewerState();
      resetLineDraftState();
      resetCustomLineDraftState();
      resetLineOrderAutosaveState();
      resetJobAutosaveState();
      state.jobLastSavedSignature = jobSignature(state.selectedJob);
      renderOrder();
      renderOutstandingOrders();
      showOrderTab(state.activeOrderTab);
    } catch (err) {
      renderOrderError(err.message);
      if (options.throwOnError) throw err;
    }
  }

  async function loadOrderForDocument(id) {
    const data = await fetchJson(`/api/database/jobs/${encodeURIComponent(id)}`);
    state.selectedJob = data.job || {};
    state.selectedLineItems = data.lineItems || [];
    state.selectedPositions = data.positions || [];
    state.selectedProofFiles = normalizeDatabaseProofFiles(data.proofFiles || []);
    state.selectedCustomerOverview = data.customerOverview || null;
    state.orderCustomerDetail = await loadOrderCustomerDetail(state.selectedJob);
    resetDatabaseProofViewerState();
    resetLineDraftState();
    resetCustomLineDraftState();
    resetLineOrderAutosaveState();
    resetJobAutosaveState();
    state.jobLastSavedSignature = jobSignature(state.selectedJob);
    renderOutstandingOrders();
    hydrateOrderSelectors();
    syncOrderDocumentButtons(state.selectedJob);
    return state.selectedJob;
  }

  function setOrderLoading() {
    resetDesignAutosaveState();
    resetJobAutosaveState();
    state.orderCustomerDetail = null;
    state.selectedCustomerOverview = null;
    syncOrderDocumentButtons(null);
    els.orderTitle.value = 'Loading...';
    els.orderNumber.value = '';
    renderOrderHeaderStats();
    els.detailsPanel.innerHTML = '<div class="db-panel-message">Loading order details</div>';
    els.itemsPanel.innerHTML = '';
    els.designPanel.innerHTML = '';
    if (els.proofPanel) els.proofPanel.innerHTML = '';
  }

  function renderOrderError(message) {
    resetDesignAutosaveState();
    resetJobAutosaveState();
    state.selectedCustomerOverview = null;
    syncOrderDocumentButtons(null);
    els.orderTitle.value = 'Order unavailable';
    els.orderNumber.value = '';
    els.detailsPanel.innerHTML = `<div class="db-panel-message">${escapeHtml(message)}</div>`;
    els.itemsPanel.innerHTML = '';
    els.designPanel.innerHTML = '';
    if (els.proofPanel) els.proofPanel.innerHTML = '';
  }

  function renderOrder() {
    const job = state.selectedJob || {};
    els.orderTitle.value = job.job_title || '';
    els.orderNumber.value = job.order_no || '';
    renderOrderHeaderStats();

    hydrateOrderSelectors();
    renderDetailsPanel();
    renderItemsPanel();
    renderDesignPanel();
    renderProofPanel();
    syncOrderDocumentButtons(job);
  }

  function hydrateOrderSelectors() {
    const selectedId = state.selectedJob?.source_order_id ? String(state.selectedJob.source_order_id) : '';
    const jobs = selectorJobs();
    const placeholder = '<option value="">Select order</option>';
    const options = jobs.map((job) => {
      const id = String(job.source_order_id);
      const label = `${job.order_no || ''} - ${job.job_title || job.customer_name || ''}`.trim();
      return `<option value="${escapeAttr(id)}" ${id === selectedId ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('');

    [els.selectOrder, els.headerJobSelect, els.headerOrderSelect].filter(Boolean).forEach((select) => {
      select.innerHTML = placeholder + options;
      if (selectedId) select.value = selectedId;
    });
  }

  function selectorJobs() {
    const jobs = state.orderMode === 'all'
      ? state.outstandingJobs.slice(0, ORDER_SELECTOR_LIMIT)
      : [...state.outstandingJobs];
    if (state.selectedJob?.source_order_id && !jobs.some((job) => Number(job.source_order_id) === Number(state.selectedJob.source_order_id))) {
      jobs.unshift(state.selectedJob);
    }
    return jobs.sort((a, b) => Number(b.order_no || 0) - Number(a.order_no || 0));
  }

  function showOrderTab(tab, options = {}) {
    state.activeOrderTab = normalizeDatabaseOrderTab(tab);
    els.orderTabs.forEach((button) => {
      button.classList.toggle('active', button.dataset.dbOrderTab === state.activeOrderTab);
    });
    [
      ['details', els.detailsPanel],
      ['items', els.itemsPanel],
      ['design', els.designPanel],
      ['proof', els.proofPanel],
    ].forEach(([key, panel]) => {
      panel?.classList.toggle('active', key === state.activeOrderTab);
    });
    syncOrderItemsExpansion();
    if (state.activeOrderTab === 'proof') queueRenderDatabaseProofFile();
    if (!options.skipPersistence) persistDatabaseRoute();
  }

  function renderDetailsPanel() {
    const job = state.selectedJob || {};
    els.detailsPanel.innerHTML = `
      <div class="db-details-layout">
        <div class="db-detail-box db-customer-box">
          ${detailRow('Customer:', `${customerOpenButton(job)}<input class="db-legacy-input db-code-input" readonly value="${escapeAttr(job.customer_code || '')}">`)}
          ${detailRow('Contact:', inputBox(job.contact_name))}
          ${detailRow('Order type:', orderTypeSelect(job))}
          ${detailRow('Taken by:', inputBox(takenByLabel(job)))}
          ${detailRow('Delivery:', inputBox(job.delivery_method))}
          ${detailRow('Order date:', inputBox(formatDate(job.order_date, 'short')))}
          ${detailRow('Delivery:', `${inputBox(formatDate(job.delivery_date, 'short'), 'db-delivery-date-field')}<label class="db-inline-check">${renderCheck(job.customer_date_required)} Customer date</label>`)}
          ${detailRow('Invoice date:', manualInvoiceDateControl(job))}
          ${detailRow('Invoice required:', invoiceRequiredSelect(job))}
        </div>
        ${renderOrderApprovedMark(job)}

        <div class="db-detail-box db-address-box">
          ${detailRow('Invoice to:', orderAddressSelect('invoice', job.invoice_address || job.customer_name))}
          ${detailRow('Deliver to:', orderAddressSelect('delivery', job.delivery_address || job.customer_name))}
        </div>

        <div class="db-detail-box db-payment-box">
          ${detailRow('Payment:', paymentTermsSelect(job))}
          ${detailRow('Client ref:', editableJobInput('client_order_no', job.client_order_no || ''))}
          <div class="db-form-row db-comments-row">
            <label>Comments:</label>
            <textarea data-db-job-field="comments">${escapeHtml(job.comments || '')}</textarea>
          </div>
        </div>
      </div>
    `;
  }

  function renderOrderApprovedMark(job) {
    if (!truthy(job.proof_approved)) return '';
    return `
      <div class="db-order-approved-mark" aria-label="Job approved">
        <img src="${escapeAttr(ORDER_APPROVED_ICON_URL)}" alt="Approved">
      </div>
    `;
  }

  function manualInvoiceDateControl(job) {
    return `${inputBox(formatDate(job.invoice_date, 'short'), 'db-invoice-date-field db-manual-invoice-date-field')}<label class="db-inline-check"><input class="db-tiny-check" type="checkbox" data-db-manual-invoice-date="true"> Manual Date</label><input class="db-legacy-input db-invoice-number-field" readonly value="${escapeAttr(job.invoice_no || '')}">`;
  }

  function orderTypeSelect(job) {
    const current = normalizeOrderTypeOption(job?.order_type) || normalizeOrderTypeOption(typeLabel(job));
    const options = current ? [] : ['<option value="" selected></option>'];
    options.push(...ORDER_TYPE_OPTIONS.map((orderType) => `
      <option value="${escapeAttr(orderType)}" ${orderType === current ? 'selected' : ''}>${escapeHtml(orderType)}</option>
    `));
    return `<select class="db-order-type-select" data-db-job-field="order_type">${options.join('')}</select>`;
  }

  function invoiceRequiredSelect(job) {
    const invoiceRequired = !invoiceNotRequired(job);
    const locked = invoiceGenerated(job);
    const lockedTitle = locked
      ? 'Invoice Required cannot be changed after an invoice has been generated'
      : '';
    return `
      <select
        class="db-invoice-required-select ${locked ? 'is-invoice-locked' : ''}"
        data-db-invoice-required="true"
        aria-label="Invoice required"
        ${locked ? 'disabled' : ''}
        ${lockedTitle ? `title="${escapeAttr(lockedTitle)}"` : ''}
      >
        <option value="yes" ${invoiceRequired ? 'selected' : ''}>Yes</option>
        <option value="no" ${invoiceRequired ? '' : 'selected'}>No</option>
      </select>
    `;
  }

  function paymentTermsSelect(job) {
    const current = String(job?.payment_terms || '').trim();
    const options = ['<option value=""></option>'];
    PAYMENT_TERM_OPTIONS.forEach((term) => {
      options.push(`<option value="${escapeAttr(term)}" ${term === current ? 'selected' : ''}>${escapeHtml(term)}</option>`);
    });
    if (current && !PAYMENT_TERM_OPTIONS.includes(current)) {
      options.push(`<option value="${escapeAttr(current)}" selected>${escapeHtml(current)}</option>`);
    }
    return `<select class="db-payment-terms-select" disabled>${options.join('')}</select>`;
  }

  function renderOrderHeaderStats() {
    if (!els.orderHeaderStats) return;
    const metrics = customerOverviewCardMetrics(state.selectedCustomerOverview);
    els.orderHeaderStats.innerHTML = renderCustomerOverviewCards(metrics);
    syncOrderStatsDrawer();
  }

  function toggleOrderStatsDrawer() {
    state.orderStatsCollapsed = !state.orderStatsCollapsed;
    syncOrderStatsDrawer();
  }

  function syncOrderStatsDrawer() {
    const collapsed = Boolean(state.orderStatsCollapsed);
    els.orderStatsDrawer?.classList.toggle('is-collapsed', collapsed);
    if (els.orderStatsToggle) {
      els.orderStatsToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      els.orderStatsToggle.setAttribute('aria-label', collapsed ? 'Show customer overview' : 'Hide customer overview');
      const icon = els.orderStatsToggle.querySelector('span');
      if (icon) icon.textContent = collapsed ? '\u2039' : '\u203a';
    }
  }

  function renderCustomerHeaderStats() {
    if (!els.customerHeaderStats) return;
    const metrics = customerOverviewCardMetrics(state.selectedCustomerPageOverview);
    els.customerHeaderStats.innerHTML = renderCustomerOverviewCards(metrics);
  }

  function renderCustomerOverviewCards(metrics) {
    return `
      <div class="db-customer-header-stats-grid">
        ${(metrics || []).map((metric) => `
          <section class="db-customer-overview-card" title="${escapeAttr(`${metric.label}: ${metric.value}`)}">
            <span>${escapeHtml(metric.label)}</span>
            <strong>${escapeHtml(metric.value)}</strong>
          </section>
        `).join('')}
      </div>
    `;
  }

  function customerOverviewCardMetrics(overview = {}) {
    const data = overview || {};
    return [
      { label: 'Last order', value: formatDate(data.last_order_date, 'short') || '-' },
      { label: 'Orders', value: formatNumber(data.order_count || 0) },
      { label: '3 mo activity', value: formatNumber(data.activity_3_months || 0) },
      { label: '12 mo spend', value: formatCurrency(data.spend_12_months || 0) },
      { label: 'Avg value', value: formatCurrency(data.average_order_value || 0) },
      { label: 'Top types', value: customerOverviewTopLabel(data.top_order_types) },
    ];
  }

  function customerOverviewTopLabel(rows) {
    const values = Array.isArray(rows) ? rows : [];
    const top = values[0];
    return top ? (String(top.label || '').trim() || 'Unknown') : '-';
  }

  function handleDetailsPanelChange(event) {
    if (event.target?.matches?.('[data-db-manual-invoice-date]')) {
      syncManualInvoiceDateInput(event.target.checked);
      return;
    }
    if (event.target?.matches?.('[data-db-job-field="order_type"]')) {
      handleOrderTypeChange(event.target);
      return;
    }
    if (event.target?.matches?.('[data-db-invoice-required]')) {
      saveInvoiceRequiredSelection(event.target);
      return;
    }
    if (event.target?.matches?.('[data-db-address-select]')) {
      saveOrderAddressSelection(event.target);
    }
  }

  async function saveInvoiceRequiredSelection(select) {
    if (!select || select.dataset.invoiceRequiredSaving === 'true') return;
    const sourceOrderId = Number(state.selectedJob?.source_order_id);
    if (!Number.isFinite(sourceOrderId)) return;

    const previousValue = invoiceNotRequired(state.selectedJob) ? 'no' : 'yes';
    const requestedValue = select.value === 'no' ? 'no' : 'yes';
    if (requestedValue === previousValue) return;

    select.dataset.invoiceRequiredSaving = 'true';
    select.classList.add('is-saving');
    select.disabled = true;

    try {
      const data = await fetchJson(`/api/database/jobs/${encodeURIComponent(sourceOrderId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_required: requestedValue }),
      });
      state.selectedJob = { ...state.selectedJob, ...data.job };
      updateOutstandingJob(state.selectedJob);

      const toInvoiceIndex = state.toInvoiceJobs.findIndex((job) => (
        Number(job.source_order_id) === sourceOrderId
      ));
      if (toInvoiceIndex >= 0) {
        state.toInvoiceJobs[toInvoiceIndex] = {
          ...state.toInvoiceJobs[toInvoiceIndex],
          ...state.selectedJob,
        };
      }

      select.value = invoiceNotRequired(state.selectedJob) ? 'no' : 'yes';
      syncOrderDocumentButtons(state.selectedJob);
      renderOutstandingOrders();
      renderToInvoiceJobs();
      hydrateOrderSelectors();
      loadHomeMetrics();
      if (state.toInvoiceLoaded) loadToInvoiceJobs({ force: true });
    } catch (err) {
      select.value = previousValue;
      window.alert(err.message || 'Failed to update Invoice Required');
    } finally {
      if (!select.isConnected) return;
      delete select.dataset.invoiceRequiredSaving;
      select.classList.remove('is-saving');
      const locked = invoiceGenerated(state.selectedJob);
      select.classList.toggle('is-invoice-locked', locked);
      select.disabled = locked;
      if (locked) {
        select.title = 'Invoice Required cannot be changed after an invoice has been generated';
      } else {
        select.removeAttribute('title');
      }
    }
  }

  function handleOrderTypeChange(select) {
    const orderType = normalizeOrderTypeOption(select.value);
    if (!orderType || !state.selectedJob?.source_order_id) return;
    if (select.value !== orderType) select.value = orderType;
    state.selectedJob.order_type = orderType;
    state.selectedJob.order_type_abbr = orderTypeAbbreviation(orderType);
    updateOutstandingJob(state.selectedJob);
    renderOutstandingOrders();
    state.jobDirty = true;
    flushJobAutosave();
  }

  function handleDetailsPanelInput(event) {
    const field = event.target?.dataset?.dbJobField;
    if (field !== 'comments' && field !== 'client_order_no') return;
    if (!state.selectedJob?.source_order_id) return;
    state.selectedJob[field] = event.target.value;
    state.jobDirty = true;
    scheduleJobAutosave();
  }

  function handleDetailsPanelFocusOut(event) {
    if (!event.target?.matches?.('[data-db-job-field]')) return;
    flushJobAutosave();
  }

  function syncManualInvoiceDateInput(isManual) {
    const input = els.detailsPanel?.querySelector('.db-manual-invoice-date-field');
    if (!input) return;

    if (isManual) {
      input.readOnly = false;
      input.value = formatDate(
        state.selectedJob?.invoice_date || new Date(),
        'short'
      );
      input.focus();
      input.select();
      return;
    }

    input.readOnly = true;
    input.value = formatDate(state.selectedJob?.invoice_date, 'short');
  }

  function renderItemsPanel() {
    const items = state.selectedLineItems || [];
    const showNonStockSupplier = isBusinessGiftOrder(state.selectedJob);
    const nonStockColspan = showNonStockSupplier ? 8 : 7;
    const stockItems = items.filter(isStockItem);
    const nonStockItems = items.filter(isNonStockItem);
    const nonDeliverableItems = items.filter((item) => truthy(item.is_non_deliverable));
    const internalItems = items.filter((item) => truthy(item.is_internal));
    const suppliers = unique(items.map((item) => item.supplier_name).filter(Boolean)).join(', ');

    const stockRows = [
      stockItems.length ? stockItems.map(renderStockRow).join('') : (state.lineDraft ? '' : renderItemEmptyRow(10)),
      state.lineDraft ? renderLineDraftRow() : renderAddLineButtonRow(),
    ].join('');

    els.itemsPanel.innerHTML = `
      <div class="db-items-layout">
        <div class="db-items-stock-frame" data-db-item-scroll>
          <table class="db-legacy-table db-items-table db-mobile-card-table">
            <thead>
              <tr>
                <th class="db-row-selector"></th>
                <th class="db-row-selector"></th>
                <th>Code:</th>
                <th>Style:</th>
                <th>Colour:</th>
                <th>Size:</th>
                <th>Cost:</th>
                <th>Price:</th>
                <th>Qty:</th>
                <th>VAT:</th>
              </tr>
            </thead>
            <tbody>${stockRows}</tbody>
          </table>
        </div>

        <div class="db-items-lower-grid">
          <div class="db-items-left-stack">
            ${renderSmallItemBox('Non-deliverable item:', nonDeliverableItems, 'nondelivery')}
            ${renderSmallItemBox('Internal item:', internalItems, 'internal')}
          </div>
          <div class="db-edit-spine">E<br>D<br>I<br>T</div>
          <div class="db-nonstock-box">
            <div class="db-custom-table-scroll" data-db-item-scroll>
              <table class="db-legacy-table db-nonstock-table db-mobile-card-table ${showNonStockSupplier ? 'has-supplier' : ''}">
                ${renderNonStockColgroup(showNonStockSupplier)}
                <thead>
                  <tr>
                    <th class="db-row-selector"></th>
                    <th class="db-row-selector"></th>
                    <th>Non-stock item:</th>
                    ${showNonStockSupplier ? '<th>Supplier:</th>' : ''}
                    <th>Cost:</th>
                    <th>Price:</th>
                    <th>Qty:</th>
                    <th>VAT:</th>
                  </tr>
                </thead>
                <tbody>
                  ${renderCustomSectionRows(nonStockItems, 'nonstock', nonStockColspan, (item, index) => renderNonStockRow(item, index, { showSupplier: showNonStockSupplier }))}
                </tbody>
              </table>
            </div>
            ${showNonStockSupplier ? '' : `<div class="db-supplier-row"><span>Supplier:</span><input readonly value="${escapeAttr(suppliers)}"></div>`}
          </div>
        </div>
        <div class="db-product-results" role="listbox"></div>
      </div>
    `;
    window.requestAnimationFrame(() => {
      applyNonStockTableLayout();
      scrollItemSectionsToAddLine();
      paintProductResults();
      preloadStockItemVariants();
    });
  }

  function renderNonStockColgroup(showSupplier) {
    return `
      <colgroup>
        <col class="db-row-selector-col">
        <col class="db-row-selector-col">
        <col class="db-nonstock-desc-col">
        ${showSupplier ? '<col class="db-nonstock-supplier-col">' : ''}
        <col class="db-nonstock-cost-col">
        <col class="db-nonstock-price-col">
        <col class="db-nonstock-qty-col">
        <col class="db-nonstock-vat-col">
      </colgroup>
    `;
  }

  function applyNonStockTableLayout() {
    const table = els.itemsPanel?.querySelector('.db-nonstock-table');
    if (!table) return;

    [
      { field: 'unit_cost', header: 'Cost:', property: '--db-nonstock-cost-width' },
      { field: 'unit_price', header: 'Price:', property: '--db-nonstock-price-width' },
      { field: 'quantity', header: 'Qty:', property: '--db-nonstock-qty-width' },
      { field: 'vatPercent', header: 'VAT:', property: '--db-nonstock-vat-width' },
    ].forEach((column) => {
      const values = [column.header];
      table.querySelectorAll(`[data-line-item-field="${column.field}"], [data-custom-line-field="${column.field}"]`).forEach((input) => {
        values.push(input.value || '');
      });

      const width = Math.ceil(Math.max(...values.map(measureLineItemTextWidth)) + 14);
      table.style.setProperty(column.property, `${width}px`);
    });
  }

  function measureLineItemTextWidth(value) {
    if (!lineItemMeasureCanvas) lineItemMeasureCanvas = document.createElement('canvas');
    const context = lineItemMeasureCanvas.getContext('2d');
    context.font = '12px Arial';
    return context.measureText(String(value || '')).width;
  }

  function scrollItemSectionsToAddLine() {
    if (state.activeOrderTab !== 'items') return;

    els.itemsPanel.querySelectorAll('[data-db-item-scroll]').forEach((section) => {
      const target = section.querySelector('.db-add-line-button-row, .db-add-line-edit-row, .db-custom-line-edit-row');
      if (!target) return;
      section.scrollTop = section.scrollHeight;
    });
  }

  function renderDesignPanel() {
    const positions = state.selectedPositions || [];
    const job = state.selectedJob || {};
    const rows = positions.length ? positions : [{}];
    if (positions.length) rows.push({});

    els.designPanel.innerHTML = `
      <div class="db-design-layout">
        <div class="db-design-table-frame">
          <table class="db-legacy-table db-design-table db-mobile-card-table">
            <thead>
              <tr>
                <th class="db-row-selector"></th>
                <th class="db-row-selector"></th>
                <th>Position:</th>
                <th>Colour:</th>
                <th>Design:</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(renderPositionRow).join('')}
            </tbody>
          </table>
          <div class="db-design-filler"></div>
        </div>
        <div class="db-screens-row">
          <span>Screens:</span>
          <input readonly value="${escapeAttr(job.screen_numbers || '')}">
        </div>
      </div>
    `;
    state.designDirty = false;
    state.designLastSavedSignature = designSignature(collectDesignPositions());
  }

  function renderProofPanel() {
    if (!els.proofPanel) return;
    const files = state.selectedProofFiles || [];
    const viewer = state.proofViewer || {};
    const fileIndex = clampNumber(viewer.fileIndex, 0, Math.max(0, files.length - 1));
    const currentFile = files[fileIndex];
    const hasMultiple = files.length > 1;
    const fileCount = files.length ? `${fileIndex + 1} of ${files.length}` : '';

    els.proofPanel.innerHTML = `
      <div class="db-proof-layout">
        <button class="db-proof-file-arrow db-proof-file-arrow-left" type="button" data-db-proof-file="-1" aria-label="Previous proof file" ${hasMultiple ? '' : 'hidden'} ${fileIndex <= 0 ? 'disabled' : ''}>‹</button>
        <div class="db-proof-frame">
          <div class="db-proof-toolbar">
            <div class="db-proof-file-meta">
              <span>Visual:</span>
              <input class="db-legacy-input db-proof-name-field" aria-label="Visual filename" readonly value="${escapeAttr(currentFile?.name || '')}">
              <span class="db-proof-file-count">${escapeHtml(fileCount)}</span>
            </div>
            <div class="db-proof-zoom-controls" data-db-proof-zoom-controls hidden aria-label="PDF zoom controls">
              <button class="db-proof-zoom-button" type="button" data-db-proof-zoom="-${DATABASE_PROOF_ZOOM_STEP}" aria-label="Zoom out">−</button>
              <span class="db-proof-zoom-status" data-db-proof-zoom-status aria-live="polite">100%</span>
              <button class="db-proof-zoom-button" type="button" data-db-proof-zoom="${DATABASE_PROOF_ZOOM_STEP}" aria-label="Zoom in">+</button>
              <button class="db-proof-fit-button" type="button" data-db-proof-fit aria-label="Fit PDF to screen">Fit</button>
              <span class="db-proof-gesture-hint">Pinch to zoom · drag to move</span>
            </div>
          </div>
          <div class="db-proof-viewer" data-db-proof-viewer>
            <div class="db-panel-message">${files.length ? 'Loading proof file' : 'No proof PDFs attached in the Tuesday Dashboard proof column'}</div>
          </div>
          <div class="db-proof-page-controls" data-db-proof-page-controls hidden>
            <button class="db-small-button" type="button" data-db-proof-page="-1">‹</button>
            <span data-db-proof-page-status>Page 1 / 1</span>
            <button class="db-small-button" type="button" data-db-proof-page="1">›</button>
          </div>
        </div>
        <button class="db-proof-file-arrow db-proof-file-arrow-right" type="button" data-db-proof-file="1" aria-label="Next proof file" ${hasMultiple ? '' : 'hidden'} ${fileIndex >= files.length - 1 ? 'disabled' : ''}>›</button>
      </div>
    `;

    if (state.activeOrderTab === 'proof') queueRenderDatabaseProofFile();
  }

  function normalizeDatabaseProofFiles(files) {
    return (Array.isArray(files) ? files : [])
      .map((file) => {
        const name = file?.name || file?.original_filename || file?.public_id || 'Proof file';
        const url = file?.url || file?.secure_url || file?.public_url || '';
        if (!url && !file?.assetId && !file?.asset_id) return null;
        return {
          ...file,
          assetId: file.assetId || file.asset_id || '',
          name,
          url,
          mime: file.mime || inferDatabaseMimeFromName(name, file.format, file.resource_type || file.resourceType),
        };
      })
      .filter(Boolean);
  }

  function inferDatabaseMimeFromName(name, format, resourceType) {
    const cleanFormat = String(format || '').toLowerCase();
    if (cleanFormat === 'pdf' || /\.pdf$/i.test(name || '')) return 'application/pdf';
    if (resourceType === 'image' && cleanFormat) return `image/${cleanFormat === 'jpg' ? 'jpeg' : cleanFormat}`;
    if (typeof window.inferMimeTypeFromName === 'function') return window.inferMimeTypeFromName(name);
    if (/\.png$/i.test(name || '')) return 'image/png';
    if (/\.jpe?g$/i.test(name || '')) return 'image/jpeg';
    if (/\.gif$/i.test(name || '')) return 'image/gif';
    if (/\.webp$/i.test(name || '')) return 'image/webp';
    return '';
  }

  function resetDatabaseProofViewerState() {
    state.proofViewer = {
      fileIndex: 0,
      pageNumber: 1,
      pageCount: 1,
      pdf: null,
      pdfZoom: 1,
      pdfPinch: null,
      renderToken: (state.proofViewer?.renderToken || 0) + 1,
    };
  }

  function queueRenderDatabaseProofFile() {
    if (!els.proofPanel?.classList.contains('active')) return;
    window.requestAnimationFrame(() => renderDatabaseProofFile());
  }

  async function renderDatabaseProofFile() {
    if (!els.proofPanel?.classList.contains('active')) return;
    const files = state.selectedProofFiles || [];
    const viewer = state.proofViewer;
    viewer.fileIndex = clampNumber(viewer.fileIndex, 0, Math.max(0, files.length - 1));
    const file = files[viewer.fileIndex];
    const token = ++viewer.renderToken;
    viewer.pageNumber = 1;
    viewer.pageCount = 1;
    viewer.pdf = null;
    viewer.pdfZoom = 1;
    viewer.pdfPinch = null;
    updateDatabaseProofControls(true);

    if (!file) {
      setDatabaseProofViewerMessage('No proof PDFs attached in the Tuesday Dashboard proof column');
      updateDatabaseProofControls(false);
      return;
    }

    if (isDatabasePdfFile(file)) {
      await renderDatabaseProofPdf(file, token);
    } else if (isDatabaseImageFile(file)) {
      renderDatabaseProofImage(file, token);
    } else {
      renderDatabaseProofNativeViewer(file, token);
    }
  }

  async function renderDatabaseProofPdf(file, token) {
    setDatabaseProofViewerMessage('Loading PDF...');
    try {
      const pdfjs = await ensureDatabasePdfJs();
      const src = buildDatabaseAssetSrc(file);
      const resp = await fetch(src, { credentials: 'include', cache: 'no-store' });
      if (!resp.ok) throw new Error(`PDF fetch failed (${resp.status})`);
      const buffer = await resp.arrayBuffer();
      if (token !== state.proofViewer.renderToken) return;

      const loadingTask = pdfjs.getDocument({
        data: buffer,
        useWorkerFetch: true,
        isEvalSupported: true,
        disableAutoFetch: false,
      });
      const pdf = await loadingTask.promise;
      if (token !== state.proofViewer.renderToken) return;
      state.proofViewer.pdf = pdf;
      state.proofViewer.pageCount = Math.max(1, pdf.numPages || 1);
      state.proofViewer.pageNumber = 1;
      await renderDatabaseProofPdfPage();
    } catch (err) {
      console.error('Database proof PDF render failed', err);
      renderDatabaseProofNativeViewer(file, token);
    }
  }

  async function renderDatabaseProofPdfPage() {
    const viewer = state.proofViewer;
    const token = viewer.renderToken;
    const body = els.proofPanel?.querySelector('[data-db-proof-viewer]');
    if (!body || !viewer.pdf) return;
    const scrollPosition = getDatabaseProofScrollPosition(body);
    setDatabaseProofViewerMessage('Rendering page...');
    updateDatabaseProofControls(true);

    const page = await viewer.pdf.getPage(viewer.pageNumber);
    if (token !== viewer.renderToken) return;
    const baseViewport = page.getViewport({ scale: 1 });
    const availableWidth = Math.max(160, (body.clientWidth || 860) - (isDatabaseMobileLayout() ? 12 : 26));
    const fitScale = Math.min(1.75, Math.max(0.25, availableWidth / baseViewport.width));
    const zoom = normalizeDatabaseProofZoom(viewer.pdfZoom);
    const viewport = page.getViewport({ scale: fitScale * zoom });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { alpha: false });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.className = 'db-proof-pdf-canvas';
    await page.render({ canvasContext: ctx, viewport }).promise;
    if (token !== viewer.renderToken) return;

    const stage = document.createElement('div');
    stage.className = 'db-proof-pdf-stage';
    stage.appendChild(canvas);
    body.innerHTML = '';
    body.appendChild(stage);
    restoreDatabaseProofScrollPosition(body, scrollPosition);
    updateDatabaseProofControls(false);
  }

  function renderDatabaseProofImage(file, token) {
    if (token !== state.proofViewer.renderToken) return;
    const body = els.proofPanel?.querySelector('[data-db-proof-viewer]');
    if (!body) return;
    const img = document.createElement('img');
    img.className = 'db-proof-image';
    img.src = buildDatabaseAssetSrc(file);
    img.alt = file.name || 'Proof file';
    body.innerHTML = '';
    body.appendChild(img);
    updateDatabaseProofControls(false);
  }

  function renderDatabaseProofNativeViewer(file, token, note = '') {
    if (token !== state.proofViewer.renderToken) return;
    const body = els.proofPanel?.querySelector('[data-db-proof-viewer]');
    if (!body) return;
    const src = buildDatabaseAssetSrc(file, { stripPdfUi: isDatabasePdfFile(file) });
    body.innerHTML = '';
    if (note) {
      const noteEl = document.createElement('div');
      noteEl.className = 'db-proof-note';
      noteEl.textContent = note;
      body.appendChild(noteEl);
    }
    if (src) {
      const iframe = document.createElement('iframe');
      iframe.className = 'db-proof-native-viewer';
      iframe.src = src;
      iframe.title = file.name || 'Proof file';
      body.appendChild(iframe);
    } else {
      setDatabaseProofViewerMessage('No preview URL is available for this proof.');
    }
    updateDatabaseProofControls(false);
  }

  function setDatabaseProofViewerMessage(message) {
    const body = els.proofPanel?.querySelector('[data-db-proof-viewer]');
    if (!body) return;
    body.innerHTML = `<div class="db-panel-message">${escapeHtml(message)}</div>`;
  }

  function changeDatabaseProofFile(delta) {
    if (!Number.isFinite(delta) || !delta) return;
    const files = state.selectedProofFiles || [];
    if (files.length <= 1) return;
    const viewer = state.proofViewer;
    const nextIndex = clampNumber(viewer.fileIndex + delta, 0, files.length - 1);
    if (nextIndex === viewer.fileIndex) return;
    viewer.fileIndex = nextIndex;
    viewer.pageNumber = 1;
    viewer.pageCount = 1;
    viewer.pdf = null;
    viewer.pdfZoom = 1;
    viewer.pdfPinch = null;
    viewer.renderToken += 1;
    renderProofPanel();
    queueRenderDatabaseProofFile();
  }

  function changeDatabaseProofPage(delta) {
    if (!Number.isFinite(delta) || !delta) return;
    const viewer = state.proofViewer;
    if (!viewer.pdf) return;
    const nextPage = clampNumber(viewer.pageNumber + delta, 1, viewer.pageCount);
    if (nextPage === viewer.pageNumber) return;
    viewer.pageNumber = nextPage;
    viewer.renderToken += 1;
    renderDatabaseProofPdfPage().catch((err) => {
      console.error('Database proof page render failed', err);
      updateDatabaseProofControls(false);
    });
  }

  function normalizeDatabaseProofZoom(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 1;
    return Math.min(
      DATABASE_PROOF_ZOOM_MAX,
      Math.max(DATABASE_PROOF_ZOOM_MIN, Number(numeric.toFixed(2)))
    );
  }

  function formatDatabaseProofZoom(value) {
    return `${Math.round(normalizeDatabaseProofZoom(value) * 100)}%`;
  }

  function getDatabaseProofScrollPosition(body) {
    if (!body?.querySelector('.db-proof-pdf-stage')) return { x: 0.5, y: 0 };
    const maxLeft = Math.max(0, body.scrollWidth - body.clientWidth);
    const maxTop = Math.max(0, body.scrollHeight - body.clientHeight);
    return {
      x: maxLeft > 0 ? body.scrollLeft / maxLeft : 0.5,
      y: maxTop > 0 ? body.scrollTop / maxTop : 0,
    };
  }

  function restoreDatabaseProofScrollPosition(body, position = { x: 0.5, y: 0 }) {
    if (!body) return;
    const maxLeft = Math.max(0, body.scrollWidth - body.clientWidth);
    const maxTop = Math.max(0, body.scrollHeight - body.clientHeight);
    const x = Number.isFinite(position.x) ? clampNumber(position.x, 0, 1) : 0.5;
    const y = Number.isFinite(position.y) ? clampNumber(position.y, 0, 1) : 0;
    body.scrollLeft = maxLeft * x;
    body.scrollTop = maxTop * y;
  }

  function changeDatabaseProofZoom(delta) {
    if (!Number.isFinite(delta) || !delta) return;
    setDatabaseProofZoom(normalizeDatabaseProofZoom(state.proofViewer?.pdfZoom) + delta);
  }

  function setDatabaseProofZoom(value) {
    const viewer = state.proofViewer;
    if (!viewer?.pdf) return;
    const nextZoom = normalizeDatabaseProofZoom(value);
    if (nextZoom === normalizeDatabaseProofZoom(viewer.pdfZoom)) return;
    viewer.pdfZoom = nextZoom;
    viewer.pdfPinch = null;
    viewer.renderToken += 1;
    renderDatabaseProofPdfPage().catch((err) => {
      console.error('Database proof zoom render failed', err);
      updateDatabaseProofControls(false);
    });
  }

  function databaseProofTouchDistance(touches) {
    if (!touches || touches.length < 2) return 0;
    return Math.hypot(
      touches[1].clientX - touches[0].clientX,
      touches[1].clientY - touches[0].clientY
    );
  }

  function handleDatabaseProofTouchStart(event) {
    const viewer = state.proofViewer;
    if (!viewer?.pdf || event.touches.length !== 2 || !event.target.closest('.db-proof-viewer')) return;
    const distance = databaseProofTouchDistance(event.touches);
    if (!distance) return;
    viewer.pdfPinch = {
      startDistance: distance,
      startZoom: normalizeDatabaseProofZoom(viewer.pdfZoom),
      nextZoom: normalizeDatabaseProofZoom(viewer.pdfZoom),
    };
    event.preventDefault();
  }

  function handleDatabaseProofTouchMove(event) {
    const viewer = state.proofViewer;
    const pinch = viewer?.pdfPinch;
    if (!pinch || event.touches.length !== 2) return;
    const distance = databaseProofTouchDistance(event.touches);
    if (!distance) return;
    pinch.nextZoom = normalizeDatabaseProofZoom(
      pinch.startZoom * (distance / pinch.startDistance)
    );
    const stage = els.proofPanel?.querySelector('.db-proof-pdf-stage');
    if (stage) {
      stage.style.transformOrigin = 'center top';
      stage.style.transform = `scale(${pinch.nextZoom / pinch.startZoom})`;
    }
    const zoomStatus = els.proofPanel?.querySelector('[data-db-proof-zoom-status]');
    if (zoomStatus) zoomStatus.textContent = formatDatabaseProofZoom(pinch.nextZoom);
    event.preventDefault();
  }

  function handleDatabaseProofTouchEnd(event) {
    const viewer = state.proofViewer;
    const pinch = viewer?.pdfPinch;
    if (!pinch || event.touches.length >= 2) return;
    const stage = els.proofPanel?.querySelector('.db-proof-pdf-stage');
    if (stage) {
      stage.style.transform = '';
      stage.style.transformOrigin = '';
    }
    viewer.pdfPinch = null;
    const nextZoom = normalizeDatabaseProofZoom(pinch.nextZoom);
    if (nextZoom !== normalizeDatabaseProofZoom(viewer.pdfZoom)) {
      setDatabaseProofZoom(nextZoom);
    } else {
      updateDatabaseProofControls(false);
    }
    event.preventDefault();
  }

  function updateDatabaseProofControls(loading = false) {
    const files = state.selectedProofFiles || [];
    const viewer = state.proofViewer || {};
    const file = files[viewer.fileIndex];
    const isPdf = Boolean(viewer.pdf);
    const pageControls = els.proofPanel?.querySelector('[data-db-proof-page-controls]');
    const pageStatus = els.proofPanel?.querySelector('[data-db-proof-page-status]');
    const pagePrev = els.proofPanel?.querySelector('[data-db-proof-page="-1"]');
    const pageNext = els.proofPanel?.querySelector('[data-db-proof-page="1"]');
    const filePrev = els.proofPanel?.querySelector('[data-db-proof-file="-1"]');
    const fileNext = els.proofPanel?.querySelector('[data-db-proof-file="1"]');
    const nameField = els.proofPanel?.querySelector('.db-proof-name-field');
    const fileCount = els.proofPanel?.querySelector('.db-proof-file-count');
    const zoomControls = els.proofPanel?.querySelector('[data-db-proof-zoom-controls]');
    const zoomStatus = els.proofPanel?.querySelector('[data-db-proof-zoom-status]');
    const zoomOut = els.proofPanel?.querySelector('[data-db-proof-zoom^="-"]');
    const zoomIn = els.proofPanel?.querySelector('[data-db-proof-zoom]:not([data-db-proof-zoom^="-"])');
    const fit = els.proofPanel?.querySelector('[data-db-proof-fit]');
    const zoom = normalizeDatabaseProofZoom(viewer.pdfZoom);

    if (nameField) nameField.value = file?.name || '';
    if (fileCount) fileCount.textContent = files.length ? `${viewer.fileIndex + 1} of ${files.length}` : '';
    if (pageStatus) pageStatus.textContent = `Page ${viewer.pageNumber || 1} / ${viewer.pageCount || 1}`;
    if (pageControls) pageControls.hidden = !isDatabasePdfFile(file);
    if (zoomControls) zoomControls.hidden = !isDatabasePdfFile(file);
    if (zoomStatus) zoomStatus.textContent = formatDatabaseProofZoom(zoom);
    if (zoomOut) zoomOut.disabled = loading || !isPdf || zoom <= DATABASE_PROOF_ZOOM_MIN;
    if (zoomIn) zoomIn.disabled = loading || !isPdf || zoom >= DATABASE_PROOF_ZOOM_MAX;
    if (fit) fit.disabled = loading || !isPdf || zoom === 1;
    if (pagePrev) pagePrev.disabled = loading || !isPdf || viewer.pageNumber <= 1;
    if (pageNext) pageNext.disabled = loading || !isPdf || viewer.pageNumber >= viewer.pageCount;
    if (filePrev) filePrev.disabled = loading || files.length <= 1 || viewer.fileIndex <= 0;
    if (fileNext) fileNext.disabled = loading || files.length <= 1 || viewer.fileIndex >= files.length - 1;
  }

  async function ensureDatabasePdfJs() {
    if (typeof window.ensurePdfJs === 'function') return window.ensurePdfJs();
    if (window.pdfjsLib) return window.pdfjsLib;
    throw new Error('PDF renderer is not available');
  }

  function isDatabasePdfFile(file) {
    if (!file) return false;
    if (typeof window.isPdfFile === 'function') return window.isPdfFile(file.name, file.mime);
    return String(file.mime || '').toLowerCase().includes('pdf') || /\.pdf(\?|$)/i.test(file.name || '');
  }

  function isDatabaseImageFile(file) {
    if (!file) return false;
    if (typeof window.isImageFile === 'function') return window.isImageFile(file);
    if (String(file.mime || '').toLowerCase().startsWith('image/')) return true;
    return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name || '');
  }

  function buildDatabaseAssetSrc(file, options = {}) {
    if (typeof window.buildAssetSrc === 'function') return window.buildAssetSrc(file, options);
    const url = file?.url || file?.secure_url || file?.public_url || '';
    if (options.stripPdfUi && url) return `${url}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`;
    return url;
  }

  function openOrderAcknowledgement() {
    openDatabaseDocument('order-ack');
  }

  async function openDatabaseDocument(type, options = {}) {
    if (!state.selectedJob?.source_order_id && !state.selectedJob?.order_no) return;

    const documentType = databaseDocumentType(type);
    const existingInvoicePreview = documentType === 'invoice' && options.skipInvoiceMark && state.selectedJob?.invoice_no;
    if (documentType === 'invoice' && invoiceNotRequired(state.selectedJob) && !existingInvoicePreview) return;

    let generatedAt = new Date();
    if (documentType === 'invoice' && options.skipInvoiceMark) {
      generatedAt = validDateOrNow(
        state.selectedJob?.invoice_date
        || state.selectedJob?.complete_date
        || state.selectedJob?.dashboard_status_updated_at
      );
    } else if (documentType === 'invoice') {
      try {
        const invoicedJob = await markSelectedJobInvoiced();
        generatedAt = validDateOrNow(invoicedJob?.invoice_date || invoicedJob?.complete_date || invoicedJob?.dashboard_status_updated_at);
      } catch (err) {
        console.error('Invoice mark failed', err);
        alert(err.message || 'Failed to mark order invoiced');
        return;
      }
    } else if (documentType === 'pro-forma') {
      generatedAt = validDateOrNow(state.selectedJob?.pf_invoice_date || new Date());
    }

    state.activeDocumentType = documentType;
    state.documentGeneratedAt = generatedAt;
    applyGeneratedDocumentDateToOrderUi(documentType, state.documentGeneratedAt);

    const modal = ensureOrderAckModal();
    const config = databaseDocumentConfig(documentType);
    const shell = modal.querySelector('.db-order-ack-shell');
    const title = modal.querySelector('.db-order-ack-toolbar-title');
    const pages = modal.querySelector('.db-order-ack-pages');
    if (shell) shell.setAttribute('aria-label', config.ariaLabel);
    if (title) title.textContent = config.toolbarTitle;
    modal.dataset.dbDocumentType = documentType;
    pages.innerHTML = renderDatabaseDocument(documentType);
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open', 'db-order-ack-open');

    window.requestAnimationFrame(() => {
      fitDatabaseDocumentPreviewToViewport();
      const printButton = modal.querySelector('[data-db-ack-print]');
      if (printButton) printButton.focus();
    });
  }

  function openOutstandingReportDocument() {
    const snapshot = buildOutstandingReportSnapshot();
    if (!snapshot.jobs.length) {
      alert('No orders to print');
      return;
    }

    state.activeDocumentType = 'outstanding-orders';
    state.documentGeneratedAt = snapshot.generatedAt;
    state.outstandingReportSnapshot = snapshot;

    const modal = ensureOrderAckModal();
    const shell = modal.querySelector('.db-order-ack-shell');
    const title = modal.querySelector('.db-order-ack-toolbar-title');
    const pages = modal.querySelector('.db-order-ack-pages');
    if (shell) shell.setAttribute('aria-label', DATABASE_DOCUMENTS['outstanding-orders'].ariaLabel);
    if (title) title.textContent = snapshot.toolbarTitle;
    modal.dataset.dbDocumentType = 'outstanding-orders';
    pages.innerHTML = renderOutstandingReportDocument();
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open', 'db-order-ack-open');

    window.requestAnimationFrame(() => {
      fitDatabaseDocumentPreviewToViewport();
      const printButton = modal.querySelector('[data-db-ack-print]');
      if (printButton) printButton.focus();
    });
  }

  async function openFinancialReportDocument() {
    const range = normalizeDatabaseReportRange(state.reportsRange);
    let data = state.reportsComparisonData?.primary || state.reportsData;
    const matchesSelection = (report) => {
      if (range === 'monthly') {
        return report?.range === 'custom-month'
          && normalizeDatabaseReportMonth(report?.period) === normalizeDatabaseReportMonth(state.reportsMonth);
      }
      if (range === 'yearly') {
        return report?.range === 'custom-year'
          && normalizeDatabaseReportYear(report?.period) === normalizeDatabaseReportYear(state.reportsYear);
      }
      if (range === 'ytd') {
        return report?.range === 'ytd'
          && normalizeDatabaseReportYear(report?.period) === normalizeDatabaseReportYear(state.reportsYear);
      }
      return report?.range === range;
    };
    if (!state.reportsComparisonData && !matchesSelection(data)) data = await loadDatabaseReports();
    if (!data || (!state.reportsComparisonData && !matchesSelection(data))) {
      alert('Financial report data is not available');
      return;
    }

    const snapshot = buildFinancialReportSnapshot(data);
    state.activeDocumentType = 'financial-report';
    state.documentGeneratedAt = snapshot.generatedAt;
    state.financialReportSnapshot = snapshot;

    const modal = ensureOrderAckModal();
    const shell = modal.querySelector('.db-order-ack-shell');
    const title = modal.querySelector('.db-order-ack-toolbar-title');
    const pages = modal.querySelector('.db-order-ack-pages');
    if (shell) shell.setAttribute('aria-label', DATABASE_DOCUMENTS['financial-report'].ariaLabel);
    if (title) title.textContent = snapshot.toolbarTitle;
    modal.dataset.dbDocumentType = 'financial-report';
    pages.innerHTML = renderFinancialReportDocument();
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open', 'db-order-ack-open');

    window.requestAnimationFrame(() => {
      fitDatabaseDocumentPreviewToViewport();
      const printButton = modal.querySelector('[data-db-ack-print]');
      if (printButton) printButton.focus();
    });
  }

  function openStockOrderingDocument() {
    const snapshot = buildStockOrderingSnapshot();
    if (!snapshot.jobs.length) {
      alert('Select at least one job for stock ordering');
      return;
    }

    state.activeDocumentType = 'stock-ordering';
    state.documentGeneratedAt = snapshot.generatedAt;
    state.stockOrderingSnapshot = snapshot;
    state.stockOrderingStatusAppliedIds.clear();

    const modal = ensureOrderAckModal();
    const shell = modal.querySelector('.db-order-ack-shell');
    const title = modal.querySelector('.db-order-ack-toolbar-title');
    const pages = modal.querySelector('.db-order-ack-pages');
    if (shell) shell.setAttribute('aria-label', DATABASE_DOCUMENTS['stock-ordering'].ariaLabel);
    if (title) title.textContent = snapshot.toolbarTitle;
    modal.dataset.dbDocumentType = 'stock-ordering';
    pages.innerHTML = renderStockOrderingDocument();
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open', 'db-order-ack-open');

    window.requestAnimationFrame(() => {
      fitDatabaseDocumentPreviewToViewport();
      const printButton = modal.querySelector('[data-db-ack-print]');
      if (printButton) printButton.focus();
    });
  }

  function buildOutstandingReportSnapshot() {
    const groups = groupedOutstandingRows(ordersForCurrentRender()).map((group) => ({
      key: group.key,
      label: outstandingReportGroupLabel(group.key, group.label),
      jobs: [...group.jobs],
    }));
    const jobs = groups.flatMap((group) => group.jobs);
    const modeLabel = state.orderMode === 'all' ? 'All Orders' : 'Open Orders';
    const filterLabel = outstandingFilterLabel(state.activeGroup);
    const title = state.orderMode === 'all' ? 'All Orders' : 'Outstanding Orders';
    const filterSuffix = filterLabel && filterLabel !== 'All outstanding' ? ` - ${filterLabel}` : '';

    return {
      title,
      toolbarTitle: `${title} PDF`,
      filenameTitle: `${modeLabel}${filterSuffix}`,
      modeLabel,
      filterLabel,
      searchQuery: state.orderMode === 'all' ? state.orderSearchQuery : '',
      generatedAt: new Date(),
      groups,
      jobs,
    };
  }

  function buildStockOrderingSnapshot() {
    const jobs = selectedStockOrderingJobs().map((job) => ({
      ...job,
      lineItems: stockOrderingLineItems(job),
    })).filter((job) => job.lineItems.length);

    return {
      title: 'Stock Ordering',
      toolbarTitle: 'Stock Ordering PDF',
      filenameTitle: 'Stock Ordering',
      generatedAt: new Date(),
      jobs,
    };
  }

  function buildFinancialReportSnapshot(data = state.reportsData || {}) {
    const summary = data.summary || {};
    const periodDates = reportPeriodDates(data.periodStart, data.periodEnd);
    const rangeLabel = data.rangeLabel || 'Selected period';
    const generatedAt = new Date();
    return {
      title: 'Financial Report',
      toolbarTitle: 'Financial Report PDF',
      filenameTitle: ['Financial Report', rangeLabel, periodDates].filter(Boolean).join(' - '),
      generatedAt,
      range: data.range || normalizeDatabaseReportRange(state.reportsRange),
      rangeLabel,
      rangeDescription: data.rangeDescription || rangeLabel,
      periodDates,
      grain: data.grain || 'period',
      summary: {
        grossSales: reportNumber(summary.grossSales),
        vat: reportNumber(summary.vat),
        netSales: reportNumber(summary.netSales),
        costOfGoods: reportNumber(summary.costOfGoods),
        grossProfit: reportNumber(summary.grossProfit),
        grossMarginPercent: reportNumber(summary.grossMarginPercent),
      },
      series: Array.isArray(data.series) ? data.series.map((row) => ({
        bucketStart: row.bucketStart || '',
        grossSales: reportNumber(row.grossSales),
        vat: reportNumber(row.vat),
        netSales: reportNumber(row.netSales),
        costOfGoods: reportNumber(row.costOfGoods),
        grossProfit: reportNumber(row.grossProfit),
      })) : [],
      orders: Array.isArray(data.orders) ? data.orders.map((order) => ({
        sourceOrderId: order.sourceOrderId || order.source_order_id || '',
        orderNo: order.orderNo || order.order_no || '',
        customerName: order.customerName || order.customer_name || 'Unknown customer',
        jobTitle: order.jobTitle || order.job_title || '',
        grossSales: reportNumber(order.grossSales ?? order.gross_sales),
        netSales: reportNumber(order.netSales ?? order.net_sales),
        costOfGoods: reportNumber(order.costOfGoods ?? order.cost_of_goods),
        grossProfit: reportNumber(order.grossProfit ?? order.gross_profit),
      })) : [],
    };
  }

  function renderOutstandingReportDocument() {
    const snapshot = state.outstandingReportSnapshot || buildOutstandingReportSnapshot();
    const pages = buildOutstandingReportPages(snapshot.groups);
    return pages.map((page, index) => (
      renderOutstandingReportPage(snapshot, page, index)
    )).join('');
  }

  function renderStockOrderingDocument() {
    const snapshot = state.stockOrderingSnapshot || buildStockOrderingSnapshot();
    const pages = buildStockOrderingPages(snapshot.jobs);
    return pages.map((page, index) => renderStockOrderingPage(snapshot, page, index)).join('');
  }

  function renderFinancialReportDocument() {
    const snapshot = state.financialReportSnapshot || buildFinancialReportSnapshot();
    const pages = [
      ...buildFinancialReportPages(snapshot.series).map((rows) => ({ type: 'financials', rows })),
      ...buildFinancialReportOrderPages(snapshot.orders).map((rows) => ({ type: 'orders', rows })),
    ];
    return pages.map((page, index) => renderFinancialReportPage(snapshot, page, index, pages.length)).join('');
  }

  function buildFinancialReportPages(series) {
    const rows = Array.isArray(series) ? series : [];
    if (!rows.length) return [[]];
    const pages = [rows.slice(0, 24)];
    for (let index = 24; index < rows.length; index += 34) {
      pages.push(rows.slice(index, index + 34));
    }
    return pages;
  }

  function buildFinancialReportOrderPages(orders) {
    const rows = Array.isArray(orders) ? orders : [];
    if (!rows.length) return [[]];
    const pages = [];
    let page = [];
    let usedMm = 0;

    for (const order of rows) {
      const rowHeight = financialReportOrderRowHeight(order);
      if (page.length && usedMm + rowHeight > FINANCIAL_REPORT_ORDER_PAGE_CONTENT_MM) {
        pages.push(page);
        page = [];
        usedMm = 0;
      }
      page.push(order);
      usedMm += rowHeight;
    }
    if (page.length) pages.push(page);
    return pages;
  }

  function financialReportOrderRowHeight(order) {
    const customerLines = Math.max(
      1,
      Math.ceil(String(order?.customerName || '').length / FINANCIAL_REPORT_ORDER_CUSTOMER_CHARS_PER_LINE)
    );
    const titleLines = Math.max(
      1,
      Math.ceil(String(order?.jobTitle || '').length / FINANCIAL_REPORT_ORDER_TITLE_CHARS_PER_LINE)
    );
    const lines = Math.max(customerLines, titleLines);
    return FINANCIAL_REPORT_ORDER_ROW_BASE_MM + ((lines - 1) * FINANCIAL_REPORT_ORDER_ROW_EXTRA_LINE_MM);
  }

  function renderFinancialReportPage(snapshot, page, pageIndex, pageCount) {
    const continued = pageIndex > 0;
    const isOrderPage = page.type === 'orders';
    return `
      <section class="db-order-ack-page db-outstanding-report-page db-financial-report-page" aria-label="${escapeAttr(snapshot.title)} page ${pageIndex + 1}">
        <header class="db-outstanding-report-header db-financial-report-header">
          <div>
            <h1>${escapeHtml(snapshot.title.toUpperCase())}</h1>
            ${continued ? '<span>CONTINUED</span>' : ''}
          </div>
          <img class="db-order-ack-logo" src="${escapeAttr(ORDER_ACK_LOGO_URL)}" alt="Ultimate logo" crossorigin="anonymous">
        </header>
        <section class="db-outstanding-report-content db-financial-report-content">
          <div class="db-financial-report-meta">
            <div><strong>Period:</strong> ${escapeHtml(snapshot.rangeDescription)}</div>
            <div><strong>Dates:</strong> ${escapeHtml(snapshot.periodDates || '-')}</div>
            <div><strong>Generated:</strong> ${escapeHtml(formatDate(snapshot.generatedAt, 'full'))}</div>
            <div><strong>Page:</strong> ${escapeHtml(`${pageIndex + 1} of ${pageCount}`)}</div>
          </div>
          ${pageIndex === 0 ? renderFinancialReportSummary(snapshot.summary) : ''}
          ${isOrderPage
            ? renderFinancialReportOrders(page.rows, snapshot.orders.length)
            : `
              <section class="db-financial-report-breakdown">
                <h2>Profit &amp; loss by ${escapeHtml(financialReportGrainLabel(snapshot.grain))}</h2>
                ${renderFinancialReportTable(page.rows, snapshot.grain)}
              </section>
            `}
        </section>
        <img class="db-order-ack-footer" src="${escapeAttr(orderDocumentFooterUrl('delivery-note'))}" alt="Ultimate letterhead footer" crossorigin="anonymous">
      </section>
    `;
  }

  function renderFinancialReportSummary(summary) {
    const values = [
      ['Gross sales', formatCurrency(summary.grossSales)],
      ['VAT', formatCurrency(summary.vat)],
      ['Net sales', formatCurrency(summary.netSales)],
      ['Cost of goods', formatCurrency(summary.costOfGoods)],
      ['Gross profit', formatCurrency(summary.grossProfit)],
      ['Gross margin', formatReportPercent(summary.grossMarginPercent)],
    ];
    return `
      <section class="db-financial-report-summary" aria-label="Profit and loss summary">
        ${values.map(([label, value]) => `
          <div class="db-financial-report-summary-item">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
          </div>
        `).join('')}
      </section>
    `;
  }

  function renderFinancialReportTable(rows, grain) {
    return `
      <table class="db-financial-report-table">
        <thead>
          <tr>
            <th>Period</th>
            <th>Gross sales</th>
            <th>VAT</th>
            <th>Net sales</th>
            <th>Cost of goods</th>
            <th>Gross profit</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length ? rows.map((row) => `
            <tr>
              <td>${escapeHtml(formatReportBucketLabel(row.bucketStart, grain, true))}</td>
              <td>${escapeHtml(formatCurrency(row.grossSales))}</td>
              <td>${escapeHtml(formatCurrency(row.vat))}</td>
              <td>${escapeHtml(formatCurrency(row.netSales))}</td>
              <td>${escapeHtml(formatCurrency(row.costOfGoods))}</td>
              <td>${escapeHtml(formatCurrency(row.grossProfit))}</td>
            </tr>
          `).join('') : '<tr><td colspan="6">No financial activity in this period</td></tr>'}
        </tbody>
      </table>
    `;
  }

  function renderFinancialReportOrders(orders, totalOrders) {
    return `
      <section class="db-financial-report-breakdown db-financial-report-orders">
        <h2 class="db-financial-report-order-heading">
          <span>Orders in selected period</span>
          <strong>${escapeHtml(formatNumber(totalOrders))} orders</strong>
        </h2>
        <table class="db-financial-report-order-table">
          <thead>
            <tr>
              <th>Order no.</th>
              <th>Customer</th>
              <th>Job title</th>
              <th>Gross sales</th>
              <th>Net sales</th>
              <th>COGS</th>
              <th>Gross profit</th>
            </tr>
          </thead>
          <tbody>
            ${orders.length ? orders.map((order) => `
              <tr>
                <td>${escapeHtml(order.orderNo || order.sourceOrderId || '')}</td>
                <td>${escapeHtml(order.customerName || 'Unknown customer')}</td>
                <td>${escapeHtml(order.jobTitle || '')}</td>
                <td>${escapeHtml(formatCurrency(order.grossSales))}</td>
                <td>${escapeHtml(formatCurrency(order.netSales))}</td>
                <td>${escapeHtml(formatCurrency(order.costOfGoods))}</td>
                <td>${escapeHtml(formatCurrency(order.grossProfit))}</td>
              </tr>
            `).join('') : '<tr><td colspan="7">No orders in this period</td></tr>'}
          </tbody>
        </table>
      </section>
    `;
  }

  function financialReportGrainLabel(grain) {
    if (grain === 'hour') return 'hour';
    if (grain === 'month') return 'month';
    return 'day';
  }

  function buildStockOrderingPages(jobs) {
    const pages = [];
    let page = emptyStockOrderingPage();
    let usedMm = 0;

    const pushPage = () => {
      if (page.entries.length) pages.push(page);
      page = emptyStockOrderingPage();
      usedMm = 0;
    };

    for (const job of jobs || []) {
      const lines = stockOrderingLineItems(job);
      if (!lines.length) continue;
      const firstLineHeight = stockOrderingReportLineHeight(lines[0]);
      if (usedMm > 0 && usedMm + STOCK_ORDERING_REPORT_JOB_MM + firstLineHeight > OUTSTANDING_REPORT_PAGE_CONTENT_MAX_MM) {
        pushPage();
      }

      page.entries.push({ type: 'job', job, continued: false });
      usedMm += STOCK_ORDERING_REPORT_JOB_MM;

      for (const line of lines) {
        const rowHeight = stockOrderingReportLineHeight(line);
        if (usedMm > STOCK_ORDERING_REPORT_JOB_MM && usedMm + rowHeight > OUTSTANDING_REPORT_PAGE_CONTENT_MAX_MM) {
          pushPage();
          page.entries.push({ type: 'job', job, continued: true });
          usedMm += STOCK_ORDERING_REPORT_JOB_MM;
        }
        page.entries.push({ type: 'line', job, item: line });
        usedMm += rowHeight;
      }
    }

    if (page.entries.length) pages.push(page);
    return pages.length ? pages : [emptyStockOrderingPage()];
  }

  function emptyStockOrderingPage() {
    return { entries: [] };
  }

  function stockOrderingReportLineHeight(item) {
    const description = orderDocumentItemDescription(item);
    const lines = Math.max(1, Math.ceil(description.length / STOCK_ORDERING_REPORT_DESCRIPTION_CHARS_PER_LINE));
    return STOCK_ORDERING_REPORT_ROW_BASE_MM + ((lines - 1) * STOCK_ORDERING_REPORT_ROW_EXTRA_LINE_MM);
  }

  function renderStockOrderingPage(snapshot, page, pageIndex) {
    return `
      <section class="db-order-ack-page db-outstanding-report-page db-stock-ordering-report-page" aria-label="${escapeAttr(snapshot.title)} page ${pageIndex + 1}">
        <header class="db-outstanding-report-header">
          <h1>${escapeHtml(snapshot.title.toUpperCase())}</h1>
          <img class="db-order-ack-logo" src="${escapeAttr(ORDER_ACK_LOGO_URL)}" alt="Ultimate logo" crossorigin="anonymous">
        </header>
        <section class="db-outstanding-report-content db-stock-ordering-report-content">
          ${renderStockOrderingReportTable(page.entries)}
        </section>
        <img class="db-order-ack-footer" src="${escapeAttr(orderDocumentFooterUrl('delivery-note'))}" alt="Ultimate letterhead footer" crossorigin="anonymous">
      </section>
    `;
  }

  function renderStockOrderingReportTable(entries) {
    return `
      <table class="db-stock-ordering-report-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Description</th>
            <th>Colour</th>
            <th>Size</th>
            <th>Qty</th>
            <th>Supplier</th>
          </tr>
        </thead>
        <tbody>
          ${entries.length ? entries.map(renderStockOrderingReportEntry).join('') : '<tr><td colspan="6">No stock ordering line items</td></tr>'}
        </tbody>
      </table>
    `;
  }

  function renderStockOrderingReportEntry(entry) {
    if (entry.type === 'job') return renderStockOrderingReportJobRow(entry.job, entry.continued);
    return renderStockOrderingReportLineRow(entry.item);
  }

  function renderStockOrderingReportJobRow(job, continued = false) {
    const title = [
      job.order_no || job.source_order_id || '',
      job.customer_name || '',
      job.job_title || '',
    ].filter(Boolean).join(' - ');
    return `
      <tr class="db-stock-ordering-report-job-row">
        <td colspan="6">${escapeHtml(title)}${continued ? ' continued' : ''}</td>
      </tr>
    `;
  }

  function renderStockOrderingReportLineRow(item) {
    return `
      <tr>
        <td>${escapeHtml(orderDocumentItemCode(item))}</td>
        <td>${escapeHtml(orderDocumentItemDescription(item))}</td>
        <td>${escapeHtml(item.colour || '')}</td>
        <td>${escapeHtml(item.size || '')}</td>
        <td>${escapeHtml(formatNumber(orderAckQuantity(item)))}</td>
        <td>${escapeHtml(item.supplier_name || '')}</td>
      </tr>
    `;
  }

  function buildOutstandingReportPages(groups) {
    const pages = [];
    let page = emptyOutstandingReportPage();
    let usedMm = 0;

    const pushPage = () => {
      if (page.sections.length) pages.push(page);
      page = emptyOutstandingReportPage();
      usedMm = 0;
    };

    for (const group of groups || []) {
      const jobs = group.jobs || [];
      if (!jobs.length) continue;

      let index = 0;
      let sectionIndex = 0;
      while (index < jobs.length) {
        const sectionHeaderMm = OUTSTANDING_REPORT_GROUP_HEADER_MM + OUTSTANDING_REPORT_TABLE_HEADER_MM;
        if (usedMm > 0 && usedMm + sectionHeaderMm + OUTSTANDING_REPORT_ROW_BASE_MM > OUTSTANDING_REPORT_PAGE_CONTENT_MAX_MM) {
          pushPage();
        }

        const section = {
          key: group.key,
          label: group.label,
          total: jobs.length,
          continued: sectionIndex > 0,
          jobs: [],
        };
        page.sections.push(section);
        usedMm += sectionHeaderMm;

        while (index < jobs.length) {
          const rowHeightMm = outstandingReportRowHeight(jobs[index]);
          if (section.jobs.length && usedMm + rowHeightMm > OUTSTANDING_REPORT_PAGE_CONTENT_MAX_MM) break;
          section.jobs.push(jobs[index]);
          usedMm += rowHeightMm;
          index += 1;
          if (usedMm >= OUTSTANDING_REPORT_PAGE_CONTENT_MAX_MM) break;
        }

        if (index < jobs.length) pushPage();
        sectionIndex += 1;
      }
    }

    if (page.sections.length) pages.push(page);
    return pages;
  }

  function emptyOutstandingReportPage() {
    return { sections: [] };
  }

  function outstandingReportRowHeight(job) {
    const titleLines = Math.max(
      1,
      Math.ceil(String(job?.job_title || '').length / OUTSTANDING_REPORT_TITLE_CHARS_PER_LINE)
    );
    const customerLines = Math.max(
      1,
      Math.ceil(String(job?.customer_name || '').length / OUTSTANDING_REPORT_CUSTOMER_CHARS_PER_LINE)
    );
    const lines = Math.max(titleLines, customerLines);
    return OUTSTANDING_REPORT_ROW_BASE_MM + ((lines - 1) * OUTSTANDING_REPORT_ROW_EXTRA_LINE_MM);
  }

  function renderOutstandingReportPage(snapshot, page, pageIndex) {
    return `
      <section class="db-order-ack-page db-outstanding-report-page" aria-label="${escapeAttr(snapshot.title)} page ${pageIndex + 1}">
        <header class="db-outstanding-report-header">
          <h1>${escapeHtml(snapshot.title.toUpperCase())}</h1>
          <img class="db-order-ack-logo" src="${escapeAttr(ORDER_ACK_LOGO_URL)}" alt="Ultimate logo" crossorigin="anonymous">
        </header>
        <section class="db-outstanding-report-content">
          ${page.sections.map(renderOutstandingReportSection).join('')}
        </section>
        <img class="db-order-ack-footer" src="${escapeAttr(orderDocumentFooterUrl('delivery-note'))}" alt="Ultimate letterhead footer" crossorigin="anonymous">
      </section>
    `;
  }

  function renderOutstandingReportSection(section) {
    return `
      <section class="db-outstanding-report-section db-outstanding-report-section-${escapeAttr(section.key)}">
        <h2>
          <span>${escapeHtml(section.label)}${section.continued ? ' continued' : ''}</span>
          <strong>${escapeHtml(formatNumber(section.total))} orders</strong>
        </h2>
        ${renderOutstandingReportTable(section.jobs)}
      </section>
    `;
  }

  function renderOutstandingReportTable(jobs) {
    return `
      <table class="db-outstanding-report-table">
        <thead>
          <tr>
            <th>Order no:</th>
            <th>Customer:</th>
            <th>Type</th>
            <th>Job title:</th>
            <th>Taken by:</th>
            <th>Order date:</th>
            <th>Delivery:</th>
          </tr>
        </thead>
        <tbody>
          ${jobs.map(renderOutstandingReportRow).join('')}
        </tbody>
      </table>
    `;
  }

  function renderOutstandingReportRow(job) {
    return `
      <tr>
        <td>${escapeHtml(job.order_no || '')}</td>
        <td>${escapeHtml(job.customer_name || '')}</td>
        <td>${escapeHtml(typeAbbr(job))}</td>
        <td>${escapeHtml(job.job_title || '')}</td>
        <td>${escapeHtml(outstandingTakenByFirstName(job))}</td>
        <td>${escapeHtml(formatDate(job.order_date, 'long'))}</td>
        <td>${escapeHtml(outstandingDeliveryLabel(job))}</td>
      </tr>
    `;
  }

  function outstandingReportGroupLabel(key, fallback = '') {
    if (key === 'print') return 'Printing';
    if (key === 'print_embroidery') return 'Print + Embroidery';
    if (key === 'embroidery') return 'Embroidery';
    if (key === 'gifts') return 'Business Gifts';
    if (key === 'other') return 'Other';
    return fallback || key || '';
  }

  function outstandingFilterLabel(key) {
    if (key === 'all') return 'All outstanding';
    if (key === 'ready') return 'Approved';
    if (key === 'not-ready') return 'Not approved';
    return outstandingReportGroupLabel(key);
  }

  function applyGeneratedDocumentDateToOrderUi(documentType, generatedAt) {
    if (!state.selectedJob || (documentType !== 'invoice' && documentType !== 'delivery-note')) return;

    const displayDate = formatDate(generatedAt, 'full');
    if (documentType === 'invoice') {
      const input = els.detailsPanel?.querySelector('.db-invoice-date-field');
      if (input) input.value = displayDate;
    }

    if (documentType === 'delivery-note') {
      state.selectedJob.delivery_date = displayDate;
      const input = els.detailsPanel?.querySelector('.db-delivery-date-field');
      if (input) input.value = displayDate;
    }
  }

  async function markSelectedJobInvoiced() {
    if (!state.selectedJob?.source_order_id) return state.selectedJob;

    const sourceOrderId = Number(state.selectedJob.source_order_id);
    const payload = { mark_invoiced: true };
    const manualInvoiceDate = selectedManualInvoiceDate();
    if (manualInvoiceDate) {
      payload.manual_invoice_date = true;
      payload.invoice_date = manualInvoiceDate;
    }

    const data = await fetchJson(`/api/database/jobs/${encodeURIComponent(sourceOrderId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    state.selectedJob = { ...state.selectedJob, ...data.job };

    if (state.orderMode === 'all') {
      updateOutstandingJob(state.selectedJob);
    } else if (shouldRemoveFromOpenOrders(state.selectedJob)) {
      state.outstandingJobs = state.outstandingJobs.filter((job) => (
        Number(job.source_order_id) !== sourceOrderId
      ));
    } else {
      updateOutstandingJob(state.selectedJob);
    }
    state.toInvoiceJobs = state.toInvoiceJobs.filter((job) => (
      Number(job.source_order_id) !== sourceOrderId
    ));

    renderOrderHeaderStats();
    renderDetailsPanel();
    renderOutstandingOrders();
    renderToInvoiceJobs();
    hydrateOrderSelectors();
    syncOrderDocumentButtons(state.selectedJob);
    loadHomeMetrics();
    return state.selectedJob;
  }

  function shouldRemoveFromOpenOrders(job) {
    if (!job) return false;
    if (truthy(job.is_complete)) return true;
    const status = normalizeDashboardStatusLabel(job.dashboard_status);
    return status === 'COMPLETED' && Boolean(
      job.invoice_printed
      || job.pf_invoice_printed
      || (invoiceNotRequired(job) && truthy(job.closed_without_invoice))
    );
  }

  function selectedManualInvoiceDate() {
    const checkbox = els.detailsPanel?.querySelector('[data-db-manual-invoice-date]');
    if (!checkbox?.checked) return '';

    const input = els.detailsPanel?.querySelector('.db-manual-invoice-date-field');
    const value = String(input?.value || '').trim();
    if (!value) throw new Error('Manual invoice date is required');
    return legacyInputDateToIso(value);
  }

  function ensureOrderAckModal() {
    let modal = document.getElementById('db-order-ack-modal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'db-order-ack-modal';
    modal.className = 'db-order-ack-modal';
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="db-order-ack-shell" role="dialog" aria-modal="true" aria-label="Order acknowledgement PDF preview">
        <div class="db-order-ack-toolbar">
          <div class="db-order-ack-toolbar-title">Order acknowledgement</div>
          <div class="db-order-ack-toolbar-actions">
            <button class="db-order-ack-action" type="button" data-db-ack-print="true">Print</button>
            <button class="db-order-ack-action" type="button" data-db-ack-download="true">Download PDF</button>
            <button class="db-order-ack-close" type="button" data-db-ack-close="true" aria-label="Close">Close</button>
          </div>
        </div>
        <div class="db-order-ack-scroll">
          <article class="db-order-ack-pages" role="document"></article>
        </div>
      </div>
    `;
    modal.addEventListener('click', handleOrderAckModalClick);
    document.body.appendChild(modal);
    return modal;
  }

  function fitDatabaseDocumentPreviewToViewport() {
    const modal = document.getElementById('db-order-ack-modal');
    const pages = modal?.querySelector('.db-order-ack-pages');
    if (!pages) return;

    pages.style.removeProperty('zoom');
    if (modal.hidden || !isDatabaseMobileLayout()) return;

    const scroll = modal.querySelector('.db-order-ack-scroll');
    const page = pages.querySelector('.db-order-ack-page');
    if (!scroll || !page) return;
    const availableWidth = Math.max(240, scroll.clientWidth - 16);
    const pageWidth = page.getBoundingClientRect().width;
    if (!pageWidth) return;
    pages.style.zoom = String(Math.min(1, availableWidth / pageWidth));
  }

  async function handleOrderAckModalClick(event) {
    const modal = document.getElementById('db-order-ack-modal');
    if (!modal || modal.hidden) return;

    if (event.target === modal) {
      closeOrderAcknowledgement();
      return;
    }

    const button = event.target.closest('button');
    if (!button || !modal.contains(button)) return;
    if (button.disabled) return;

    if (button.dataset.dbAckClose) {
      closeOrderAcknowledgement();
      return;
    }

    if (button.dataset.dbAckPrint || button.dataset.dbAckDownload) {
      await printDatabaseDocument();
    }
  }

  function handleOrderAckKeydown(event) {
    if (event.key !== 'Escape') return;
    const noInvoiceCloseModal = document.getElementById('db-no-invoice-close-modal');
    if (noInvoiceCloseModal && !noInvoiceCloseModal.hidden) {
      closeNoInvoiceCloseConfirmation();
      return;
    }
    const repeatOrderModal = document.getElementById('db-repeat-order-modal');
    if (repeatOrderModal && !repeatOrderModal.hidden) {
      closeRepeatOrderConfirmation();
      return;
    }
    if (els.visualModal && !els.visualModal.hidden) {
      closeDatabaseVisualModal();
      return;
    }
    if (els.stylesImageModal && !els.stylesImageModal.hidden) {
      closeProductStyleImageModal();
      return;
    }
    const deleteModal = document.getElementById('db-line-delete-modal');
    if (deleteModal && !deleteModal.hidden) {
      closeLineDeleteConfirmation();
      return;
    }
    const modal = document.getElementById('db-order-ack-modal');
    if (modal && !modal.hidden) closeOrderAcknowledgement();
  }

  function closeOrderAcknowledgement() {
    const modal = document.getElementById('db-order-ack-modal');
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open', 'db-order-ack-open', 'db-order-ack-printing');
  }

  function openLineDeleteConfirmation(lineItemId) {
    const id = Number.parseInt(lineItemId, 10);
    if (!Number.isFinite(id) || !state.selectedJob?.source_order_id) return;

    const item = state.selectedLineItems.find((line) => Number(line.source_order_item_id) === id);
    state.lineDeleteTarget = { lineItemId: id, label: lineDeleteLabel(item) };
    state.designDeleteTarget = null;
    state.contactDeleteTarget = null;
    state.closeOrderTarget = null;
    state.userDeleteTarget = null;
    state.lineDeleteSaving = false;
    state.designDeleteSaving = false;
    state.contactDeleteSaving = false;
    state.closeOrderSaving = false;
    state.userDeleteSaving = false;

    const modal = ensureLineDeleteModal();
    const message = modal.querySelector('.db-line-delete-message');
    const error = modal.querySelector('.db-line-delete-error');
    if (message) {
      message.textContent = state.lineDeleteTarget.label
        ? `Delete ${state.lineDeleteTarget.label}?`
        : 'Delete this line item?';
    }
    if (error) error.textContent = '';
    setLineDeleteModalSaving(false);
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open', 'db-line-delete-open');

    window.requestAnimationFrame(() => {
      modal.querySelector('[data-db-line-delete-cancel]')?.focus();
    });
  }

  function ensureLineDeleteModal() {
    let modal = document.getElementById('db-line-delete-modal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'db-line-delete-modal';
    modal.className = 'db-line-delete-modal';
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="db-line-delete-shell" role="dialog" aria-modal="true" aria-labelledby="db-line-delete-title">
        <div class="db-line-delete-title" id="db-line-delete-title">Are you sure?</div>
        <div class="db-line-delete-message">Delete this line item?</div>
        <div class="db-line-delete-error" aria-live="polite"></div>
        <div class="db-line-delete-actions">
          <button class="db-line-delete-confirm" type="button" data-db-line-delete-confirm="true">Confirm</button>
          <button class="db-line-delete-cancel" type="button" data-db-line-delete-cancel="true">No</button>
        </div>
      </div>
    `;
    modal.addEventListener('click', handleLineDeleteModalClick);
    document.body.appendChild(modal);
    return modal;
  }

  function handleLineDeleteModalClick(event) {
    const modal = document.getElementById('db-line-delete-modal');
    if (!modal || modal.hidden) return;

    if (event.target === modal) {
      closeLineDeleteConfirmation();
      return;
    }

    const button = event.target.closest('button');
    if (!button || !modal.contains(button)) return;

    if (button.dataset.dbLineDeleteCancel) {
      closeLineDeleteConfirmation();
      return;
    }

    if (button.dataset.dbLineDeleteConfirm) {
      if (state.closeOrderTarget) {
        confirmCloseOrder();
      } else if (state.userDeleteTarget) {
        confirmDeleteUser();
      } else if (state.contactDeleteTarget) {
        confirmDeleteContact();
      } else if (state.designDeleteTarget) {
        confirmDeleteDesignPosition();
      } else {
        confirmDeleteLineItem();
      }
    }
  }

  function closeLineDeleteConfirmation() {
    if (state.lineDeleteSaving || state.designDeleteSaving || state.contactDeleteSaving || state.closeOrderSaving || state.userDeleteSaving) return;
    const modal = document.getElementById('db-line-delete-modal');
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open', 'db-line-delete-open');
    state.lineDeleteTarget = null;
    state.designDeleteTarget = null;
    state.contactDeleteTarget = null;
    state.closeOrderTarget = null;
    state.userDeleteTarget = null;
  }

  async function confirmDeleteLineItem() {
    const target = state.lineDeleteTarget;
    if (!target || state.lineDeleteSaving || !state.selectedJob?.source_order_id) return;

    state.lineDeleteSaving = true;
    setLineDeleteModalSaving(true);

    try {
      await flushLineOrderAutosave();
      const data = await fetchJson(
        `/api/database/jobs/${encodeURIComponent(state.selectedJob.source_order_id)}/line-items/${encodeURIComponent(target.lineItemId)}`,
        { method: 'DELETE' }
      );
      state.selectedLineItems = data.lineItems || state.selectedLineItems.filter((line) => (
        Number(line.source_order_item_id) !== Number(target.lineItemId)
      ));
      syncSelectedJobLineSummary();
      resetLineOrderAutosaveState();
      state.lineDeleteSaving = false;
      closeLineDeleteConfirmation();
      renderItemsPanel();
      renderOutstandingOrders();
    } catch (err) {
      state.lineDeleteSaving = false;
      setLineDeleteModalSaving(false, err.message || 'Failed to delete line item');
      console.error('Line item delete failed', err);
    }
  }

  function setLineDeleteModalSaving(saving, errorMessage = '') {
    const modal = document.getElementById('db-line-delete-modal');
    if (!modal) return;
    const confirm = modal.querySelector('[data-db-line-delete-confirm]');
    const cancel = modal.querySelector('[data-db-line-delete-cancel]');
    const error = modal.querySelector('.db-line-delete-error');
    if (confirm) {
      confirm.disabled = saving;
      confirm.textContent = saving ? lineDeleteSavingLabel() : 'Confirm';
    }
    if (cancel) cancel.disabled = saving;
    if (error) error.textContent = errorMessage;
  }

  function lineDeleteLabel(item) {
    if (!item) return '';
    const description = item.line_description || item.style_name || item.style_code || '';
    return String(description || '').trim();
  }

  function openDesignDeleteConfirmation(designKey) {
    const row = findDesignRowByKey(designKey);
    if (!row || !state.selectedJob?.source_order_id) return;

    state.designDeleteTarget = { designKey, label: designDeleteLabel(row) };
    state.lineDeleteTarget = null;
    state.contactDeleteTarget = null;
    state.closeOrderTarget = null;
    state.userDeleteTarget = null;
    state.designDeleteSaving = false;
    state.lineDeleteSaving = false;
    state.contactDeleteSaving = false;
    state.closeOrderSaving = false;
    state.userDeleteSaving = false;

    const modal = ensureLineDeleteModal();
    const message = modal.querySelector('.db-line-delete-message');
    const error = modal.querySelector('.db-line-delete-error');
    if (message) {
      message.textContent = state.designDeleteTarget.label
        ? `Delete ${state.designDeleteTarget.label}?`
        : 'Delete this design row?';
    }
    if (error) error.textContent = '';
    setLineDeleteModalSaving(false);
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open', 'db-line-delete-open');

    window.requestAnimationFrame(() => {
      modal.querySelector('[data-db-line-delete-cancel]')?.focus();
    });
  }

  async function confirmDeleteDesignPosition() {
    const target = state.designDeleteTarget;
    if (!target || state.designDeleteSaving || !state.selectedJob?.source_order_id) return;

    const row = findDesignRowByKey(target.designKey);
    if (!row) {
      closeLineDeleteConfirmation();
      return;
    }

    state.designDeleteSaving = true;
    setLineDeleteModalSaving(true);

    const tbody = row.parentElement;
    const nextSibling = row.nextSibling;
    row.remove();
    ensureDesignTableHasEntryRow();
    state.designDirty = true;

    const saved = await saveDesignPositions();
    state.designDeleteSaving = false;

    if (saved) {
      closeLineDeleteConfirmation();
      renderDesignPanel();
      return;
    }

    if (tbody) {
      Array.from(tbody.querySelectorAll('.db-design-row')).forEach((candidate) => {
        const sourceId = Number.parseInt(candidate.dataset.positionId, 10);
        if (!Number.isFinite(sourceId) && !designRowHasValue(candidate)) candidate.remove();
      });
      if (nextSibling && nextSibling.parentNode === tbody) {
        tbody.insertBefore(row, nextSibling);
      } else {
        tbody.appendChild(row);
      }
      state.designDirty = designSignature(collectDesignPositions()) !== state.designLastSavedSignature;
    }
    setLineDeleteModalSaving(false, 'Failed to delete design row');
  }

  function findDesignRowByKey(designKey) {
    return Array.from(els.designPanel?.querySelectorAll('.db-design-row') || [])
      .find((row) => row.dataset.designKey === String(designKey));
  }

  function designDeleteLabel(row) {
    const label = designFieldValue(row, 'position_name')
      || designFieldValue(row, 'colour_notes')
      || designFieldValue(row, 'design_ref');
    return String(label || '').trim();
  }

  function openContactDeleteConfirmation(contactKey) {
    const contact = findContactByKey(contactKey);
    if (!contact) return;

    const rowId = contact.contact_row_id || contact.manual_contact_id;
    state.contactDeleteTarget = {
      contactKey,
      rowId,
      label: contactDeleteLabel(contact),
    };
    state.lineDeleteTarget = null;
    state.designDeleteTarget = null;
    state.closeOrderTarget = null;
    state.userDeleteTarget = null;
    state.contactDeleteSaving = false;
    state.lineDeleteSaving = false;
    state.designDeleteSaving = false;
    state.closeOrderSaving = false;
    state.userDeleteSaving = false;

    const modal = ensureLineDeleteModal();
    const message = modal.querySelector('.db-line-delete-message');
    const error = modal.querySelector('.db-line-delete-error');
    if (message) {
      message.textContent = state.contactDeleteTarget.label
        ? `Delete ${state.contactDeleteTarget.label}?`
        : 'Delete this contact?';
    }
    setLineDeleteModalSaving(false);
    if (error) error.textContent = rowId ? '' : 'This contact has not been stored yet.';
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open', 'db-line-delete-open');

    window.requestAnimationFrame(() => {
      modal.querySelector('[data-db-line-delete-cancel]')?.focus();
    });
  }

  async function confirmDeleteContact() {
    const target = state.contactDeleteTarget;
    const customerKey = state.selectedCustomerDetail?.customer_key;
    if (!target || state.contactDeleteSaving || !customerKey) return;

    if (!target.rowId) {
      setLineDeleteModalSaving(false, 'This contact cannot be deleted until it has been saved.');
      return;
    }

    state.contactDeleteSaving = true;
    setLineDeleteModalSaving(true);

    try {
      await fetchJson(`/api/database/customers/${encodeURIComponent(customerKey)}/contacts/${encodeURIComponent(target.rowId)}`, {
        method: 'DELETE',
      });
      state.selectedCustomerContacts = (state.selectedCustomerContacts || []).filter((contact, index) => (
        contactCardKey(contact, index) !== target.contactKey
      ));
      state.contactDirtyKeys.delete(target.contactKey);
      delete state.contactLastSavedSignatures[target.contactKey];
      state.contactDeleteSaving = false;
      closeLineDeleteConfirmation();
      renderCustomerContacts();
    } catch (err) {
      state.contactDeleteSaving = false;
      setLineDeleteModalSaving(false, err.message || 'Failed to delete contact');
      console.error('Contact delete failed', err);
    }
  }

  function lineDeleteSavingLabel() {
    if (state.closeOrderTarget) return 'Closing...';
    if (state.userDeleteTarget) return 'Removing...';
    return 'Deleting...';
  }

  function openUserDeleteConfirmation(userId) {
    const user = findRegisteredUser(userId);
    if (!user) return;

    state.userDeleteTarget = {
      userId: Number(user.id),
      label: user.full_name || [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email || 'this user',
    };
    state.lineDeleteTarget = null;
    state.designDeleteTarget = null;
    state.contactDeleteTarget = null;
    state.closeOrderTarget = null;
    state.userDeleteSaving = false;
    state.lineDeleteSaving = false;
    state.designDeleteSaving = false;
    state.contactDeleteSaving = false;
    state.closeOrderSaving = false;

    const modal = ensureLineDeleteModal();
    const message = modal.querySelector('.db-line-delete-message');
    const error = modal.querySelector('.db-line-delete-error');
    if (message) message.textContent = `Remove ${state.userDeleteTarget.label}?`;
    if (error) error.textContent = '';
    setLineDeleteModalSaving(false);
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open', 'db-line-delete-open');

    window.requestAnimationFrame(() => {
      modal.querySelector('[data-db-line-delete-cancel]')?.focus();
    });
  }

  async function confirmDeleteUser() {
    const target = state.userDeleteTarget;
    if (!target || state.userDeleteSaving) return;

    state.userDeleteSaving = true;
    setLineDeleteModalSaving(true);

    try {
      await fetchJson(`/api/database/users/${encodeURIComponent(target.userId)}`, {
        method: 'DELETE',
      });
      state.registeredUsers = (state.registeredUsers || []).filter((user) => (
        Number(user.id) !== Number(target.userId)
      ));
      state.customerUsers = (state.customerUsers || []).filter((user) => (
        Number(user.id) !== Number(target.userId)
      ));
      state.userDeleteSaving = false;
      closeLineDeleteConfirmation();
      renderRegisteredUsers();
      populateNewCustomerAccountManagers();
    } catch (err) {
      state.userDeleteSaving = false;
      setLineDeleteModalSaving(false, err.message || 'Failed to remove user');
      console.error('User delete failed', err);
    }
  }

  function findRegisteredUser(userId) {
    return (state.registeredUsers || []).find((user) => Number(user.id) === Number(userId));
  }

  function contactDeleteLabel(contact) {
    const parts = contactNameParts(contact);
    return [parts.firstName, parts.lastName].filter(Boolean).join(' ')
      || contact.contact_email
      || contact.contact_phone
      || 'this contact';
  }

  function openCloseOrderConfirmation() {
    if (!state.selectedJob?.source_order_id || truthy(state.selectedJob.is_complete)) return;

    state.closeOrderTarget = {
      sourceOrderId: Number(state.selectedJob.source_order_id),
      label: state.selectedJob.order_no || state.selectedJob.job_title || 'this order',
    };
    state.lineDeleteTarget = null;
    state.designDeleteTarget = null;
    state.contactDeleteTarget = null;
    state.userDeleteTarget = null;
    state.lineDeleteSaving = false;
    state.designDeleteSaving = false;
    state.contactDeleteSaving = false;
    state.closeOrderSaving = false;
    state.userDeleteSaving = false;

    const modal = ensureLineDeleteModal();
    const message = modal.querySelector('.db-line-delete-message');
    const error = modal.querySelector('.db-line-delete-error');
    if (message) message.textContent = `Close order ${state.closeOrderTarget.label}?`;
    if (error) error.textContent = '';
    setLineDeleteModalSaving(false);
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open', 'db-line-delete-open');

    window.requestAnimationFrame(() => {
      modal.querySelector('[data-db-line-delete-cancel]')?.focus();
    });
  }

  async function confirmCloseOrder() {
    const target = state.closeOrderTarget;
    if (!target || state.closeOrderSaving || !state.selectedJob?.source_order_id) return;

    state.closeOrderSaving = true;
    setLineDeleteModalSaving(true);

    try {
      const data = await fetchJson(`/api/database/jobs/${encodeURIComponent(target.sourceOrderId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_complete: true }),
      });
      state.selectedJob = { ...state.selectedJob, ...data.job };
      if (state.orderMode === 'all') {
        updateOutstandingJob(state.selectedJob);
      } else {
        state.outstandingJobs = state.outstandingJobs.filter((job) => (
          Number(job.source_order_id) !== Number(target.sourceOrderId)
        ));
      }
      state.closeOrderSaving = false;
      closeLineDeleteConfirmation();
      renderDetailsPanel();
      renderOutstandingOrders();
      hydrateOrderSelectors();
      await loadHomeMetrics();
    } catch (err) {
      state.closeOrderSaving = false;
      setLineDeleteModalSaving(false, err.message || 'Failed to close order');
      console.error('Close order failed', err);
    }
  }

  async function printOrderAcknowledgement() {
    await printDatabaseDocument();
  }

  async function printDatabaseDocument() {
    const modal = document.getElementById('db-order-ack-modal');
    if (!modal || modal.hidden) return;
    if (state.activeDocumentType === 'stock-ordering') {
      const updated = await markStockOrderingSnapshotOrdered();
      if (!updated) return;
    }

    const previousTitle = document.title;
    document.title = databaseDocumentPdfFilename();
    document.body.classList.add('db-order-ack-printing');
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      document.title = previousTitle;
      document.body.classList.remove('db-order-ack-printing');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.setTimeout(() => {
      window.print();
      window.setTimeout(cleanup, 1500);
    }, 50);
  }

  function setOrderAckActionSaving(saving) {
    const modal = document.getElementById('db-order-ack-modal');
    if (!modal) return;
    modal.querySelectorAll('[data-db-ack-print], [data-db-ack-download]').forEach((button) => {
      button.disabled = Boolean(saving);
    });
  }

  function orderAckPdfFilename() {
    return databaseDocumentPdfFilename('order-ack');
  }

  function databaseDocumentPdfFilename(type = state.activeDocumentType) {
    const job = state.selectedJob || {};
    const documentType = databaseDocumentType(type);
    if (documentType === 'outstanding-orders') return outstandingReportPdfFilename();
    if (documentType === 'stock-ordering') return stockOrderingPdfFilename();
    if (documentType === 'financial-report') return financialReportPdfFilename();
    const documentNo = databaseDocumentNumber(job, documentType);
    const orderNo = String(documentNo || job.source_order_id || '').trim();
    const config = databaseDocumentConfig(type);
    return `${orderNo ? `${orderNo} - ` : ''}${config.filenameTitle}`;
  }

  function outstandingReportPdfFilename() {
    return state.outstandingReportSnapshot?.filenameTitle
      || DATABASE_DOCUMENTS['outstanding-orders'].filenameTitle;
  }

  function stockOrderingPdfFilename() {
    return state.stockOrderingSnapshot?.filenameTitle
      || DATABASE_DOCUMENTS['stock-ordering'].filenameTitle;
  }

  function financialReportPdfFilename() {
    return state.financialReportSnapshot?.filenameTitle
      || DATABASE_DOCUMENTS['financial-report'].filenameTitle;
  }

  function syncOrderDocumentButtons(job = state.selectedJob) {
    document.querySelectorAll('[data-db-document]').forEach((button) => {
      const documentType = databaseDocumentType(button.dataset.dbDocument);
      const noSelectedJob = !job || (!job.source_order_id && !job.order_no);
      const invoiceDisabled = documentType === 'invoice' && invoiceNotRequired(job);
      button.disabled = noSelectedJob || invoiceDisabled;
      if (invoiceDisabled) {
        button.title = 'Invoice not required for this job';
      } else {
        button.removeAttribute('title');
      }
    });

    const closeOrderButton = document.querySelector('[data-db-no-invoice-close]');
    if (closeOrderButton) {
      const noSelectedJob = !job || (!job.source_order_id && !job.order_no);
      const alreadyClosed = truthy(job?.closed_without_invoice) || truthy(job?.is_complete);
      closeOrderButton.hidden = noSelectedJob || !invoiceNotRequired(job) || alreadyClosed;
      closeOrderButton.disabled = noSelectedJob || state.noInvoiceCloseSaving;
      closeOrderButton.closest('.db-document-buttons')?.classList.toggle(
        'has-no-invoice-close',
        !closeOrderButton.hidden
      );
    }
  }

  function invoiceNotRequired(job) {
    const value = job?.invoice_required;
    const clean = String(value ?? '').trim().toLowerCase();
    return value === false || value === 0 || clean === 'false' || clean === '0' || clean === 'no';
  }

  function invoiceGenerated(job) {
    return truthy(job?.invoice_printed) || String(job?.invoice_no ?? '').trim() !== '';
  }

  function invoiceDocumentNo(job) {
    if (invoiceNotRequired(job)) return '';
    return job?.invoice_no || '';
  }

  function proFormaDocumentNo(job) {
    const jobNumber = orderDocumentUltRef(job);
    return jobNumber ? `PRO${jobNumber}` : '';
  }

  function orderDocumentUltRef(job) {
    return job?.order_no || job?.source_order_id || '';
  }

  function databaseDocumentNumber(job, documentType) {
    if (documentType === 'invoice') return invoiceDocumentNo(job);
    if (documentType === 'pro-forma') return proFormaDocumentNo(job);
    return job?.order_no || job?.source_order_id || '';
  }

  function databaseDocumentType(type) {
    return Object.prototype.hasOwnProperty.call(DATABASE_DOCUMENTS, type) ? type : 'order-ack';
  }

  function databaseDocumentConfig(type) {
    return DATABASE_DOCUMENTS[databaseDocumentType(type)] || DATABASE_DOCUMENTS['order-ack'];
  }

  function renderDatabaseDocument(type) {
    const documentType = databaseDocumentType(type);
    if (documentType === 'outstanding-orders') return renderOutstandingReportDocument();
    if (documentType === 'stock-ordering') return renderStockOrderingDocument();
    if (documentType === 'financial-report') return renderFinancialReportDocument();
    if (isInvoiceLikeDocumentType(documentType)) return renderInvoiceDocument(documentType);
    if (documentType === 'delivery-note') return renderDeliveryNoteDocument();
    return renderOrderAcknowledgementPage();
  }

  function renderOrderAcknowledgementPage() {
    const job = state.selectedJob || {};
    const items = orderAckLineItems();
    const totals = orderAckTotals(items);
    const invoiceLines = orderAckAddressLines(job.invoice_address, job.customer_name);
    const deliveryLines = String(job.delivery_address || '').trim()
      ? orderAckAddressLines(job.delivery_address, job.customer_name)
      : [];
    const deliverySameAsInvoice = !deliveryLines.length || sameOrderAckAddress(invoiceLines, deliveryLines);
    const deliveryDisplay = deliverySameAsInvoice ? ['(as above)'] : deliveryLines;
    const yourRef = job.client_order_no || contactFirstName(job.contact_name) || job.contact_name || '';
    const salutation = contactFirstName(job.contact_name)
      || (/^[a-z]+$/i.test(String(yourRef).trim()) ? titleCaseName(yourRef) : '')
      || 'Customer';
    const context = {
      job,
      items,
      totals,
      invoiceLines,
      deliveryDisplay,
      yourRef,
      salutation,
    };
    const pages = buildOrderAckPages({ items, totals, comments: job.comments });

    return pages.map((pageContent, index) => renderOrderAckPage(context, pageContent, index)).join('');
  }

  function renderOrderAckPage(context, pageContent, pageIndex) {
    const isFirstPage = pageIndex === 0;
    return `
      <section class="db-order-ack-page ${isFirstPage ? 'db-order-ack-page-first' : 'db-order-ack-page-continued'}" aria-label="Order acknowledgement page ${pageIndex + 1}">
        ${isFirstPage ? renderOrderAckPageHeader(context) : ''}
        <section class="db-order-ack-page-content">
          ${renderOrderAckPageContent(pageContent, context)}
        </section>
        <img class="db-order-ack-footer" src="${escapeAttr(orderDocumentFooterUrl('order-ack'))}" alt="Ultimate letterhead footer" crossorigin="anonymous">
      </section>
    `;
  }

  function renderOrderAckPageHeader(context) {
    const { job, totals, invoiceLines, deliveryDisplay, yourRef, salutation } = context;
    return `
      <header class="db-order-ack-header">
        <h1>ORDER<br>ACKNOWLEDGEMENT</h1>
        <img class="db-order-ack-logo" src="${escapeAttr(ORDER_ACK_LOGO_URL)}" alt="Ultimate logo" crossorigin="anonymous">
      </header>
      <section class="db-order-ack-address">
        ${renderOrderDocumentStackedAddress(invoiceLines)}
      </section>
      <section class="db-order-ack-meta" aria-label="Order acknowledgement details">
        ${orderAckMetaRow('ULT ref:', job.order_no)}
        ${orderAckMetaRow('Your ref:', yourRef)}
        ${orderAckMetaRow('Order date:', formatDate(job.order_date, 'full'))}
        ${orderAckMetaRow('Order taken by:', takenByLabel(job))}
        ${orderAckMetaRow('Order value:', formatCurrency(totals.gross))}
        ${orderAckMetaRow('Delivery address:', renderOrderDocumentStackedAddressValue(deliveryDisplay), { html: true, stacked: true })}
      </section>

      <section class="db-order-ack-letter">
        <p>Dear ${escapeHtml(salutation)}</p>
        <p>Thank you for your order. To ensure we have understood your requirements fully, could you please check the details below and inform us immediately of any discrepancies.</p>
      </section>

      <section class="db-order-ack-job">
        <span>Job title:</span>
        <strong>${escapeHtml(job.job_title || '')}</strong>
      </section>
    `;
  }

  function renderOrderAckPageContent(pageContent, context) {
    return `
      ${pageContent.itemEntries.length || pageContent.showEmptyItems
        ? renderOrderAckItemsTable(pageContent.itemEntries, context.items, { empty: pageContent.showEmptyItems })
        : ''}
      ${pageContent.showSummary ? renderOrderAckSummaryRows(context.totals) : ''}
      ${pageContent.comments ? renderOrderAckComments(pageContent.comments) : ''}
    `;
  }

  function renderInvoiceDocument(documentType = 'invoice') {
    const job = state.selectedJob || {};
    const isProForma = documentType === 'pro-forma';
    const businessGift = isBusinessGiftOrder(job);
    const items = orderDocumentLineItems(documentType);
    const totals = orderAckTotals(items);
    const generatedAt = currentDatabaseDocumentDate();
    const invoiceLines = orderAckAddressLines(job.invoice_address, job.customer_name);
    const deliveryLines = String(job.delivery_address || '').trim()
      ? orderAckAddressLines(job.delivery_address, job.customer_name)
      : [];
    const deliverySameAsInvoice = !deliveryLines.length || sameOrderAckAddress(invoiceLines, deliveryLines);
    const deliveryDisplay = deliverySameAsInvoice ? ['(as above)'] : deliveryLines;
    const context = {
      type: documentType,
      title: isProForma ? 'PRO-FORMA INVOICE' : 'INVOICE',
      showVatDisclaimer: isProForma,
      job,
      items,
      totals,
      addressLines: invoiceLines,
      stackedAddress: true,
      metaRows: [
        { label: 'Invoice No.', value: isProForma ? proFormaDocumentNo(job) : invoiceDocumentNo(job) },
        { label: 'Cust ref:', value: job.client_order_no || '' },
        { label: 'ULT Ref:', value: orderDocumentUltRef(job) },
        { label: 'VAT No.:', value: ULTIMATE_VAT_NUMBER },
        { label: 'Invoice date:', value: formatDate(generatedAt, 'full') },
        { label: 'Payment terms:', value: job.payment_terms || '' },
        { label: 'Delivery address:', value: renderOrderDocumentStackedAddressValue(deliveryDisplay), html: true, stacked: true },
      ],
    };
    const pages = buildOrderDocumentPages({
      items,
      documentType,
      businessGift,
      summaryHeightMm: isProForma ? PRO_FORMA_SUMMARY_MM : INVOICE_SUMMARY_MM,
    });
    return pages.map((pageContent, index) => renderOrderDocumentPage(context, pageContent, index)).join('');
  }

  function renderDeliveryNoteDocument() {
    const job = state.selectedJob || {};
    const items = orderDocumentLineItems('delivery-note');
    const generatedAt = currentDatabaseDocumentDate();
    const addressLines = orderAckAddressLines(job.delivery_address || job.invoice_address, job.customer_name);
    const context = {
      type: 'delivery-note',
      title: 'DELIVERY NOTE',
      job,
      items,
      addressLines,
      stackedAddress: true,
      showSignature: true,
      metaRows: [
        { label: 'Invoice No', value: invoiceDocumentNo(job) },
        { label: 'Your ref:', value: deliveryNoteYourRef(job) },
        { label: 'Order date:', value: formatDate(job.order_date || job.created_at_source, 'full') },
        { label: 'Delivery date:', value: formatDate(generatedAt, 'full') },
        { label: 'Order taken by:', value: jobOwnerLabel(job) },
      ],
    };
    const pages = buildOrderDocumentPages({
      items,
      documentType: 'delivery-note',
      businessGift: isBusinessGiftOrder(job),
    });
    return pages.map((pageContent, index) => renderOrderDocumentPage(context, pageContent, index)).join('');
  }

  function renderOrderDocumentPage(context, pageContent, pageIndex) {
    return `
      <section class="db-order-ack-page db-order-doc-page db-order-doc-page-${escapeAttr(context.type)}" aria-label="${escapeAttr(context.title)} page ${pageIndex + 1}">
        ${renderOrderDocumentPageHeader(context)}
        <section class="db-order-doc-page-content">
          ${renderOrderDocumentPageContent(context, pageContent)}
        </section>
        <img class="db-order-ack-footer" src="${escapeAttr(orderDocumentFooterUrl(context.type))}" alt="Ultimate letterhead footer" crossorigin="anonymous">
      </section>
    `;
  }

  function orderDocumentFooterUrl(type) {
    return isInvoiceLikeDocumentType(type) ? ORDER_ACK_FOOTER_URL : ORDER_ACK_NO_BANK_FOOTER_URL;
  }

  function renderOrderDocumentPageHeader(context) {
    return `
      <header class="db-order-ack-header db-order-doc-header">
        <h1>${escapeHtml(context.title)}</h1>
        <img class="db-order-ack-logo" src="${escapeAttr(ORDER_ACK_LOGO_URL)}" alt="Ultimate logo" crossorigin="anonymous">
      </header>
      <section class="db-order-doc-address">
        ${context.stackedAddress
          ? renderOrderDocumentStackedAddress(context.addressLines || [])
          : `<div>${escapeHtml(orderDocumentAddressText(context.addressLines || []))}</div>`}
      </section>
      <section class="db-order-doc-meta-wrap ${context.showSignature ? 'has-signature' : ''}" aria-label="${escapeAttr(context.title)} details">
        <section class="db-order-doc-meta">
          ${(context.metaRows || []).map(orderDocumentMetaRow).join('')}
        </section>
        ${context.showSignature ? renderDeliveryNoteSignatureFields() : ''}
      </section>
      <section class="db-order-ack-job db-order-doc-job">
        <span>Job title:</span>
        <strong>${escapeHtml(context.job?.job_title || '')}</strong>
      </section>
    `;
  }

  function renderOrderDocumentPageContent(context, pageContent) {
    if (isInvoiceLikeDocumentType(context.type)) {
      const businessGift = isBusinessGiftOrder(context.job);
      return `
        ${pageContent.itemEntries.length || pageContent.showEmptyItems
          ? renderInvoiceItemsTable(pageContent.itemEntries, { empty: pageContent.showEmptyItems, businessGift })
          : ''}
        ${pageContent.showSummary ? renderInvoiceSummary(context.items, context.totals) : ''}
        ${pageContent.showSummary && context.showVatDisclaimer ? renderProFormaVatDisclaimer() : ''}
      `;
    }

    const businessGift = isBusinessGiftOrder(context.job);
    return pageContent.itemEntries.length || pageContent.showEmptyItems
      ? renderDeliveryNoteItemsTable(pageContent.itemEntries, { empty: pageContent.showEmptyItems, businessGift })
      : '';
  }

  function orderDocumentMetaRow(row) {
    const content = row.html ? (row.value || '') : escapeHtml(row.value || row.value === 0 ? row.value : '');
    return `
      <div class="db-order-ack-meta-row ${row.stacked ? 'has-stacked-address' : ''}">
        <span>${escapeHtml(row.label)}</span>
        <strong>${content}</strong>
      </div>
    `;
  }

  function renderDeliveryNoteSignatureFields() {
    return `
      <section class="db-order-doc-signature" aria-label="Delivery recipient signature">
        ${deliveryNoteSignatureRow('Signed by')}
        ${deliveryNoteSignatureRow('Print Name')}
        ${deliveryNoteSignatureRow('Date')}
      </section>
    `;
  }

  function deliveryNoteSignatureRow(label) {
    return `
      <div class="db-order-doc-signature-row">
        <span>${escapeHtml(label)}:</span>
        <i></i>
      </div>
    `;
  }

  function renderInvoiceItemsTable(entries, options = {}) {
    const businessGift = Boolean(options.businessGift);
    const columns = invoiceItemColumns(businessGift);
    const tableClass = `db-order-doc-items db-invoice-items${businessGift ? ' db-invoice-items-business-gift' : ''}`;
    return `
      <table class="${tableClass}">
        <thead>
          <tr>
            ${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${options.empty ? `<tr><td colspan="${columns.length}" class="db-order-ack-empty">No invoice line items</td></tr>` : ''}
          ${entries.map((entry) => renderInvoiceItemEntry(entry, { businessGift })).join('')}
        </tbody>
      </table>
    `;
  }

  function renderInvoiceItemEntry(entry, options = {}) {
    const colspan = options.businessGift ? 6 : 9;
    if (entry.type === 'gap') return `<tr class="db-order-ack-item-gap"><td colspan="${colspan}"></td></tr>`;
    return renderInvoiceItemRow(entry.item, options);
  }

  function renderInvoiceItemRow(item, options = {}) {
    const quantity = orderAckQuantity(item);
    const price = orderAckNumber(item.unit_price);
    const net = orderAckLineNet(item);
    const vat = orderAckLineVat(item);
    const moneyCells = `
        <td>${escapeHtml(formatNumber(quantity))}</td>
        <td>${Number.isFinite(price) ? escapeHtml(formatCurrency(price)) : ''}</td>
        <td>${Number.isFinite(price) ? escapeHtml(formatCurrency(net)) : ''}</td>
        <td>${Number.isFinite(price) ? escapeHtml(formatCurrency(vat)) : ''}</td>
        <td>${escapeHtml(formatVat(effectiveLineVatRate(item)))}</td>
    `;
    if (options.businessGift) {
      return `
        <tr class="db-order-ack-item-row">
          <td>${escapeHtml(orderDocumentItemDescription(item))}</td>
          ${moneyCells}
        </tr>
      `;
    }
    return `
      <tr class="db-order-ack-item-row">
        <td>${escapeHtml(orderDocumentItemCode(item))}</td>
        <td>${escapeHtml(orderDocumentItemDescription(item))}</td>
        <td>${escapeHtml(item.size || '')}</td>
        <td>${escapeHtml(item.colour || '')}</td>
        ${moneyCells}
      </tr>
    `;
  }

  function renderDeliveryNoteItemsTable(entries, options = {}) {
    const businessGift = Boolean(options.businessGift);
    const columns = deliveryNoteItemColumns(businessGift);
    const tableClass = `db-order-doc-items db-delivery-note-items${businessGift ? ' db-delivery-note-items-business-gift' : ''}`;
    return `
      <table class="${tableClass}">
        <thead>
          <tr>
            ${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${options.empty ? `<tr><td colspan="${columns.length}" class="db-order-ack-empty">No delivery note line items</td></tr>` : ''}
          ${entries.map((entry) => renderDeliveryNoteItemEntry(entry, { businessGift })).join('')}
        </tbody>
      </table>
    `;
  }

  function renderDeliveryNoteItemEntry(entry, options = {}) {
    const colspan = options.businessGift ? 2 : 5;
    if (entry.type === 'gap') return `<tr class="db-order-ack-item-gap"><td colspan="${colspan}"></td></tr>`;
    return renderDeliveryNoteItemRow(entry.item, options);
  }

  function renderDeliveryNoteItemRow(item, options = {}) {
    if (options.businessGift) {
      return `
        <tr class="db-order-ack-item-row">
          <td>${escapeHtml(orderDocumentItemDescription(item))}</td>
          <td>${escapeHtml(formatNumber(orderAckQuantity(item)))}</td>
        </tr>
      `;
    }
    return `
      <tr class="db-order-ack-item-row">
        <td>${escapeHtml(orderDocumentItemCode(item))}</td>
        <td>${escapeHtml(orderDocumentItemDescription(item))}</td>
        <td>${escapeHtml(item.size || '')}</td>
        <td>${escapeHtml(item.colour || '')}</td>
        <td>${escapeHtml(formatNumber(orderAckQuantity(item)))}</td>
      </tr>
    `;
  }

  function invoiceItemColumns(businessGift = false) {
    return businessGift
      ? ['Description', 'Qty', 'Price', 'Total', 'VAT', 'Rate']
      : ['Stock item #', 'Description', 'Size', 'Colour', 'Qty', 'Price', 'Total', 'VAT', 'Rate'];
  }

  function deliveryNoteItemColumns(businessGift = false) {
    return businessGift
      ? ['Description', 'Qty']
      : ['Stock item #', 'Description', 'Size', 'Colour', 'Qty'];
  }

  function renderInvoiceSummary(items, totals) {
    return `
      <section class="db-invoice-summary" aria-label="Invoice totals">
        <section class="db-invoice-tax-analysis" aria-label="Tax analysis">
          <strong>Tax analysis</strong>
          <table>
            <tbody>
              ${invoiceTaxAnalysisRows(items).map((row) => `
                <tr>
                  <td>${escapeHtml(row.label)}</td>
                  <td>${escapeHtml(formatCurrency(row.net))}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </section>
        <section class="db-invoice-total-lines" aria-label="Invoice total values">
          ${invoiceTotalRow('TOTAL EXCLUDING VAT', totals.net)}
          ${invoiceTotalRow('VAT', totals.vat)}
          ${invoiceTotalRow('TOTAL', totals.gross)}
        </section>
      </section>
    `;
  }

  function renderProFormaVatDisclaimer() {
    return '<section class="db-pro-forma-vat-warning">THIS IS NOT A VAT INVOICE</section>';
  }

  function invoiceTotalRow(label, value) {
    return `
      <div class="db-invoice-total-row">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(formatCurrency(value))}</strong>
      </div>
    `;
  }

  function buildOrderDocumentPages({ items, documentType = 'invoice', businessGift = false, summaryHeightMm = 0 }) {
    const pages = [];
    let page = emptyOrderDocumentPageContent();
    let usedMm = 0;
    const contentMaxMm = ORDER_DOC_PAGE_CONTENT_MAX_MM - ORDER_DOC_PAGE_SPLIT_BUFFER_MM;

    const pushPage = () => {
      pages.push(page);
      page = emptyOrderDocumentPageContent();
      usedMm = 0;
    };
    const ensureSpace = (heightMm) => {
      if (usedMm > 0 && usedMm + heightMm > contentMaxMm) pushPage();
    };

    const itemEntries = orderDocumentItemEntries(items, { documentType, businessGift });
    if (!itemEntries.length) {
      const emptyTableHeight = ORDER_DOC_TABLE_TOP_MM + ORDER_DOC_TABLE_HEADER_MM + ORDER_DOC_EMPTY_ROW_MM;
      ensureSpace(emptyTableHeight);
      page.showEmptyItems = true;
      usedMm += emptyTableHeight;
    } else {
      for (const entry of itemEntries) {
        if (entry.type === 'gap' && !page.itemEntries.length) continue;
        let tableOverhead = page.itemEntries.length ? 0 : ORDER_DOC_TABLE_TOP_MM + ORDER_DOC_TABLE_HEADER_MM;
        ensureSpace(tableOverhead + entry.heightMm);
        if (entry.type === 'gap' && !page.itemEntries.length) continue;
        tableOverhead = page.itemEntries.length ? 0 : ORDER_DOC_TABLE_TOP_MM + ORDER_DOC_TABLE_HEADER_MM;
        page.itemEntries.push(entry);
        usedMm += (page.itemEntries.length === 1 ? tableOverhead : 0) + entry.heightMm;
      }
    }

    if (summaryHeightMm) {
      ensureSpace(summaryHeightMm);
      page.showSummary = true;
      usedMm += summaryHeightMm;
    }

    if (pageHasOrderDocumentContent(page) || !pages.length) pushPage();
    return pages;
  }

  function emptyOrderDocumentPageContent() {
    return {
      itemEntries: [],
      showEmptyItems: false,
      showSummary: false,
    };
  }

  function pageHasOrderDocumentContent(page) {
    return Boolean(page.itemEntries.length || page.showEmptyItems || page.showSummary);
  }

  function orderDocumentItemEntries(items, options = {}) {
    const entries = [];
    let hasPreviousRows = false;

    for (const group of groupedOrderAckLineItems(items)) {
      if (!group.items.length) continue;
      if (group.type === 'nondelivery' && hasPreviousRows) {
        entries.push({ type: 'gap', heightMm: ORDER_DOC_GAP_ROW_MM });
      }
      for (const item of group.items) {
        entries.push({
          type: 'item',
          item,
          heightMm: orderDocumentItemRowHeight(item, options),
        });
      }
      hasPreviousRows = true;
    }

    return measureOrderDocumentItemEntries(entries, options);
  }

  function orderDocumentItemRowHeight(item, options = {}) {
    const description = orderDocumentItemDescription(item);
    const documentType = databaseDocumentType(options.documentType);
    const businessGift = Boolean(options.businessGift);
    const lineCount = estimatedOrderDocumentRowLineCount(item, documentType, businessGift, description);
    return ORDER_DOC_ITEM_ROW_BASE_MM + ((lineCount - 1) * ORDER_DOC_ITEM_ROW_EXTRA_LINE_MM);
  }

  function estimatedOrderDocumentRowLineCount(item, documentType, businessGift, description) {
    if (isInvoiceLikeDocumentType(documentType)) {
      const price = orderAckNumber(item.unit_price);
      const moneyValues = Number.isFinite(price)
        ? [formatCurrency(price), formatCurrency(orderAckLineNet(item)), formatCurrency(orderAckLineVat(item))]
        : ['', '', ''];
      if (businessGift) {
        return maxWrappedLineCount([
          [description, 58],
          [formatNumber(orderAckQuantity(item)), 8],
          [moneyValues[0], 10],
          [moneyValues[1], 11],
          [moneyValues[2], 10],
          [formatVat(effectiveLineVatRate(item)), 8],
        ]);
      }
      return maxWrappedLineCount([
        [orderDocumentItemCode(item), 14],
        [description, 27],
        [item.size || '', 9],
        [item.colour || '', 14],
        [formatNumber(orderAckQuantity(item)), 8],
        [moneyValues[0], 10],
        [moneyValues[1], 11],
        [moneyValues[2], 10],
        [formatVat(effectiveLineVatRate(item)), 8],
      ]);
    }

    if (businessGift) {
      return maxWrappedLineCount([
        [description, 82],
        [formatNumber(orderAckQuantity(item)), 8],
      ]);
    }

    return maxWrappedLineCount([
      [orderDocumentItemCode(item), 18],
      [description, ORDER_DOC_ITEM_CHARS_PER_LINE],
      [item.size || '', 18],
      [item.colour || '', 24],
      [formatNumber(orderAckQuantity(item)), 8],
    ]);
  }

  function maxWrappedLineCount(values) {
    return values.reduce((max, pair) => {
      const [value, charsPerLine] = pair;
      const text = String(value || '');
      const cleanCharsPerLine = Math.max(1, Number(charsPerLine) || 1);
      const explicitLines = text.split(/\r?\n/).reduce((count, line) => (
        count + Math.max(1, Math.ceil(line.length / cleanCharsPerLine))
      ), 0);
      return Math.max(max, explicitLines || 1);
    }, 1);
  }

  function canMeasureDocumentRows() {
    return typeof document !== 'undefined' && Boolean(document.body);
  }

  function pxToMm(px) {
    return (Number(px) || 0) * 25.4 / 96;
  }

  function measureOrderDocumentItemEntries(entries, options = {}) {
    if (!entries.length || !canMeasureDocumentRows()) return entries;

    const documentType = databaseDocumentType(options.documentType);
    const businessGift = Boolean(options.businessGift);
    const isDeliveryNote = documentType === 'delivery-note';
    const tableClass = isDeliveryNote
      ? `db-order-doc-items db-delivery-note-items${businessGift ? ' db-delivery-note-items-business-gift' : ''}`
      : `db-order-doc-items db-invoice-items${businessGift ? ' db-invoice-items-business-gift' : ''}`;
    const columns = isDeliveryNote
      ? deliveryNoteItemColumns(businessGift)
      : invoiceItemColumns(businessGift);
    const rowHtml = entries.map((entry) => (
      isDeliveryNote
        ? renderDeliveryNoteItemEntry(entry, { businessGift })
        : renderInvoiceItemEntry(entry, { businessGift })
    )).join('');
    const probe = document.createElement('div');
    probe.className = 'db-document-measure-probe';
    probe.setAttribute('aria-hidden', 'true');
    Object.assign(probe.style, {
      position: 'absolute',
      left: '-10000px',
      top: '0',
      visibility: 'hidden',
      pointerEvents: 'none',
    });
    probe.innerHTML = `
      <section class="db-order-ack-page db-order-doc-page db-order-doc-page-${escapeAttr(documentType)}">
        <section class="db-order-doc-page-content">
          <table class="${tableClass}">
            <thead>
              <tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}</tr>
            </thead>
            <tbody>${rowHtml}</tbody>
          </table>
        </section>
      </section>
    `;

    try {
      document.body.appendChild(probe);
      const rows = Array.from(probe.querySelectorAll('tbody tr'));
      return entries.map((entry, index) => {
        const row = rows[index];
        if (!row) return entry;
        const measuredMm = pxToMm(row.getBoundingClientRect().height) + ORDER_DOC_ROW_MEASURE_BUFFER_MM;
        if (!Number.isFinite(measuredMm) || measuredMm <= 0) return entry;
        return {
          ...entry,
          heightMm: Math.max(entry.heightMm || 0, measuredMm),
        };
      });
    } finally {
      probe.remove();
    }
  }

  function orderDocumentLineItems(type) {
    const items = orderAckLineItems();
    if (isInvoiceLikeDocumentType(type)) return items.filter((item) => !truthy(item.is_internal));
    if (type === 'delivery-note') {
      return items.filter((item) => (
        !truthy(item.is_internal)
        && !truthy(item.is_non_deliverable)
      ));
    }
    return items;
  }

  function isInvoiceLikeDocumentType(type) {
    return type === 'invoice' || type === 'pro-forma';
  }

  function orderDocumentItemCode(item) {
    if (isStockItem(item)) return item.style_code || item.alt_style_code || '';
    if (isNonStockItem(item)) return 'Non-stock';
    if (truthy(item.is_internal)) return 'Internal';
    if (truthy(item.is_non_deliverable)) return 'Non-del';
    return item.style_code || item.alt_style_code || '';
  }

  function orderDocumentItemDescription(item) {
    return item.line_description || item.style_name || item.product_type || item.style_code || item.alt_style_code || '';
  }

  function invoiceTaxAnalysisRows(items) {
    const rowsByRate = new Map();
    for (const item of items || []) {
      const rate = effectiveLineVatPercent(item);
      const key = Number.isFinite(rate) ? rate.toFixed(2) : '0.00';
      const current = rowsByRate.get(key) || { rate: Number(key), net: 0 };
      current.net += orderAckLineNet(item);
      rowsByRate.set(key, current);
    }

    if (!rowsByRate.size) {
      return [{ label: 'This amount at Standard rate', net: 0 }];
    }

    return Array.from(rowsByRate.values())
      .sort((left, right) => right.rate - left.rate)
      .map((row) => ({
        label: invoiceTaxAnalysisLabel(row.rate),
        net: row.net,
      }));
  }

  function invoiceTaxAnalysisLabel(rate) {
    if (Math.abs(rate - 20) < 0.01) return 'This amount at Standard rate';
    if (Math.abs(rate) < 0.01) return 'This amount at Zero rate';
    return `This amount at ${rate.toFixed(2)}%`;
  }

  function deliveryNoteYourRef(job) {
    return job.client_order_no || contactFirstName(job.contact_name) || job.contact_name || '';
  }

  function currentDatabaseDocumentDate() {
    return state.documentGeneratedAt || new Date();
  }

  function orderAckMetaRow(label, value, options = {}) {
    const content = options.html ? (value || '') : escapeHtml(value || value === 0 ? value : '');
    return `
      <div class="db-order-ack-meta-row ${options.stacked ? 'has-stacked-address' : ''}">
        <span>${escapeHtml(label)}</span>
        <strong>${content}</strong>
      </div>
    `;
  }

  function renderOrderAckItemsTable(entries, allItems, options = {}) {
    return `
      <table class="db-order-ack-items">
        <thead>
          <tr>
            <th>${escapeHtml(orderAckItemsLabel(allItems))}</th>
            <th>Qty</th>
            <th>Price</th>
            <th>Total</th>
            <th>VAT</th>
            <th>Rate</th>
          </tr>
        </thead>
        <tbody class="db-order-ack-item-group">
          ${options.empty ? '<tr><td colspan="6" class="db-order-ack-empty">No order line items</td></tr>' : ''}
          ${entries.map(renderOrderAckItemEntry).join('')}
        </tbody>
      </table>
    `;
  }

  function renderOrderAckItemEntry(entry) {
    if (entry.type === 'gap') return '<tr class="db-order-ack-item-gap"><td colspan="6"></td></tr>';
    return renderOrderAckItemRow(entry.item);
  }

  function buildOrderAckPages({ items, totals, comments }) {
    const pages = [];
    let page = emptyOrderAckPageContent();
    let usedMm = 0;

    const currentPageContentMaxMm = () => (
      (pages.length === 0 ? ORDER_ACK_FIRST_PAGE_CONTENT_MAX_MM : ORDER_ACK_CONTINUATION_PAGE_CONTENT_MAX_MM)
      - ORDER_ACK_PAGE_SPLIT_BUFFER_MM
    );
    const pushPage = () => {
      pages.push(page);
      page = emptyOrderAckPageContent();
      usedMm = 0;
    };
    const ensureSpace = (heightMm) => {
      if (usedMm > 0 && usedMm + heightMm > currentPageContentMaxMm()) pushPage();
    };

    const itemEntries = orderAckItemEntries(items);
    if (!itemEntries.length) {
      const emptyTableHeight = ORDER_ACK_TABLE_TOP_MM + ORDER_ACK_TABLE_HEADER_MM + ORDER_ACK_EMPTY_ROW_MM;
      ensureSpace(emptyTableHeight);
      page.showEmptyItems = true;
      usedMm += emptyTableHeight;
    } else {
      for (const entry of itemEntries) {
        if (entry.type === 'gap' && !page.itemEntries.length) continue;
        let tableOverhead = page.itemEntries.length ? 0 : ORDER_ACK_TABLE_TOP_MM + ORDER_ACK_TABLE_HEADER_MM;
        ensureSpace(tableOverhead + entry.heightMm);
        if (entry.type === 'gap' && !page.itemEntries.length) continue;
        tableOverhead = page.itemEntries.length ? 0 : ORDER_ACK_TABLE_TOP_MM + ORDER_ACK_TABLE_HEADER_MM;
        page.itemEntries.push(entry);
        usedMm += (page.itemEntries.length === 1 ? tableOverhead : 0) + entry.heightMm;
      }
    }

    ensureSpace(ORDER_ACK_SUMMARY_MM);
    page.showSummary = true;
    usedMm += ORDER_ACK_SUMMARY_MM;

    if (comments) {
      const commentsHeight = orderAckCommentsHeight(comments);
      ensureSpace(commentsHeight);
      page.comments = comments;
      usedMm += commentsHeight;
    }

    if (pageHasOrderAckContent(page) || !pages.length) pushPage();
    return pages;
  }

  function emptyOrderAckPageContent() {
    return {
      itemEntries: [],
      showEmptyItems: false,
      showSummary: false,
      comments: '',
    };
  }

  function pageHasOrderAckContent(page) {
    return Boolean(
      page.itemEntries.length
      || page.showEmptyItems
      || page.showSummary
      || page.comments
    );
  }

  function orderAckItemEntries(items) {
    const entries = [];
    let hasPreviousRows = false;

    for (const group of groupedOrderAckLineItems(items)) {
      if (!group.items.length) continue;
      if (group.type === 'nondelivery' && hasPreviousRows) {
        entries.push({ type: 'gap', heightMm: ORDER_ACK_GAP_ROW_MM });
      }
      for (const item of group.items) {
        entries.push({
          type: 'item',
          item,
          heightMm: orderAckItemRowHeight(item),
        });
      }
      hasPreviousRows = true;
    }

    return measureOrderAckItemEntries(entries);
  }

  function orderAckItemRowHeight(item) {
    const description = orderAckItemDescription(item);
    const price = orderAckNumber(item.unit_price);
    const lineCount = maxWrappedLineCount([
      [description, ORDER_ACK_ITEM_CHARS_PER_LINE],
      [formatNumber(orderAckQuantity(item)), 10],
      [Number.isFinite(price) ? formatCurrency(price) : '', 15],
      [formatCurrency(orderAckLineNet(item)), 15],
      [formatCurrency(orderAckLineVat(item)), 15],
      [formatVat(effectiveLineVatRate(item)), 10],
    ]);
    return ORDER_ACK_ITEM_ROW_BASE_MM + ((lineCount - 1) * ORDER_ACK_ITEM_ROW_EXTRA_LINE_MM);
  }

  function measureOrderAckItemEntries(entries) {
    if (!entries.length || !canMeasureDocumentRows()) return entries;

    const probe = document.createElement('div');
    probe.className = 'db-document-measure-probe';
    probe.setAttribute('aria-hidden', 'true');
    Object.assign(probe.style, {
      position: 'absolute',
      left: '-10000px',
      top: '0',
      visibility: 'hidden',
      pointerEvents: 'none',
    });
    probe.innerHTML = `
      <section class="db-order-ack-page db-order-ack-page-first">
        <section class="db-order-ack-page-content">
          <table class="db-order-ack-items">
            <thead>
              <tr>
                <th>Items</th>
                <th>Qty</th>
                <th>Price</th>
                <th>Total</th>
                <th>VAT</th>
                <th>Rate</th>
              </tr>
            </thead>
            <tbody class="db-order-ack-item-group">${entries.map(renderOrderAckItemEntry).join('')}</tbody>
          </table>
        </section>
      </section>
    `;

    try {
      document.body.appendChild(probe);
      const rows = Array.from(probe.querySelectorAll('tbody tr'));
      return entries.map((entry, index) => {
        const row = rows[index];
        if (!row) return entry;
        const measuredMm = pxToMm(row.getBoundingClientRect().height) + ORDER_ACK_ROW_MEASURE_BUFFER_MM;
        if (!Number.isFinite(measuredMm) || measuredMm <= 0) return entry;
        return {
          ...entry,
          heightMm: Math.max(entry.heightMm || 0, measuredMm),
        };
      });
    } finally {
      probe.remove();
    }
  }

  function orderAckCommentsHeight(comments) {
    const text = String(comments || '');
    const explicitLines = text.split(/\r?\n/).reduce((count, line) => (
      count + Math.max(1, Math.ceil(line.length / ORDER_ACK_COMMENTS_CHARS_PER_LINE))
    ), 0);
    return ORDER_ACK_COMMENTS_TOP_MM + ORDER_ACK_COMMENTS_BASE_MM + (explicitLines * ORDER_ACK_COMMENTS_LINE_MM);
  }

  function renderOrderAckItemRow(item) {
    const quantity = orderAckQuantity(item);
    const price = orderAckNumber(item.unit_price);
    const net = orderAckLineNet(item);
    const vat = orderAckLineVat(item);
    return `
      <tr class="db-order-ack-item-row">
        <td>${escapeHtml(orderAckItemDescription(item))}</td>
        <td>${escapeHtml(formatNumber(quantity))}</td>
        <td>${Number.isFinite(price) ? escapeHtml(formatCurrency(price)) : ''}</td>
        <td>${escapeHtml(formatCurrency(net))}</td>
        <td>${escapeHtml(formatCurrency(vat))}</td>
        <td>${escapeHtml(formatVat(effectiveLineVatRate(item)))}</td>
      </tr>
    `;
  }

  function renderOrderAckSummaryRows(totals) {
    return `
      <section class="db-order-ack-summary" aria-label="Order totals">
        <div class="db-order-ack-summary-row">
          <span class="db-order-ack-summary-label">Sub total</span>
          <span class="db-order-ack-summary-amount">${escapeHtml(formatCurrency(totals.net))}</span>
        </div>
        <div class="db-order-ack-summary-row">
          <span class="db-order-ack-summary-label">VAT</span>
          <span class="db-order-ack-summary-amount">${escapeHtml(formatCurrency(totals.vat))}</span>
        </div>
        <div class="db-order-ack-summary-row">
          <span class="db-order-ack-summary-label">Total</span>
          <span class="db-order-ack-summary-amount">${escapeHtml(formatCurrency(totals.gross))}</span>
        </div>
      </section>
    `;
  }

  function renderOrderAckComments(comments) {
    return `
      <section class="db-order-ack-comments">
        <strong>Comments</strong>
        <p>${escapeHtml(comments)}</p>
      </section>
    `;
  }

  function orderAckLineItems() {
    const items = state.selectedLineItems || [];
    return groupedOrderAckLineItems(items).flatMap((group) => group.items);
  }

  function groupedOrderAckLineItems(items) {
    const groups = {
      stock: [],
      nonstock: [],
      nondelivery: [],
      internal: [],
    };

    for (const item of items || []) {
      if (truthy(item.is_internal)) {
        groups.internal.push(item);
      } else if (truthy(item.is_non_deliverable)) {
        groups.nondelivery.push(item);
      } else if (isStockItem(item)) {
        groups.stock.push(item);
      } else {
        groups.nonstock.push(item);
      }
    }

    return [
      { type: 'stock', items: groups.stock },
      { type: 'nonstock', items: groups.nonstock },
      { type: 'nondelivery', items: groups.nondelivery },
      { type: 'internal', items: groups.internal },
    ];
  }

  function orderAckItemsLabel(items) {
    if (!items.length) return 'Items';
    if (items.every(isStockItem)) return 'Stock items';
    if (items.every(isNonStockItem)) return 'Non-stock items';
    if (items.every((item) => truthy(item.is_non_deliverable))) return 'Non-deliverable items';
    return 'Items';
  }

  function orderAckItemDescription(item) {
    const description = item.line_description || item.style_name || '';
    const code = item.style_code || item.alt_style_code || '';
    const variant = [item.colour, item.size].filter(Boolean).join(' ');
    return [code, description, variant].filter(Boolean).join(' - ');
  }

  function orderAckTotals(items) {
    return (items || []).reduce((totals, item) => {
      const net = orderAckLineNet(item);
      const vat = orderAckLineVat(item);
      totals.net += net;
      totals.vat += vat;
      totals.gross += net + vat;
      return totals;
    }, { net: 0, vat: 0, gross: 0 });
  }

  function orderAckLineNet(item) {
    const price = orderAckNumber(item.unit_price);
    if (!Number.isFinite(price)) return 0;
    return price * orderAckQuantity(item);
  }

  function orderAckLineVat(item) {
    const rate = effectiveLineVatPercent(item);
    return orderAckLineNet(item) * (rate / 100);
  }

  function effectiveLineVatRate(item) {
    return effectiveLineVatPercent(item) / 100;
  }

  function effectiveLineVatPercent(item) {
    if (isChildrensClothingLineItem(item)) return 0;
    return orderAckVatPercent(item?.vat_rate);
  }

  function isChildrensClothingLineItem(item) {
    if (!item) return false;
    const size = normalizeChildProductText(item.size);
    if (
      CHILD_AGE_RANGE_SIZE_PATTERN.test(size)
      || CHILD_YOUTH_SIZE_PATTERN.test(size)
      || CHILD_TODDLER_SIZE_PATTERN.test(size)
    ) {
      return true;
    }

    const titleText = normalizeChildProductText([
      item.line_description,
      item.style_name,
      item.product_type,
      item.style_code,
      item.alt_style_code,
    ].filter(Boolean).join(' '));
    return CHILD_PRODUCT_TITLE_PATTERN.test(titleText);
  }

  function normalizeChildProductText(value) {
    return String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[\u2010-\u2015]/g, '-')
      .trim();
  }

  function orderAckQuantity(item) {
    const quantity = orderAckNumber(item.quantity);
    return Number.isFinite(quantity) ? quantity : 0;
  }

  function orderAckVatPercent(value) {
    const number = orderAckNumber(value);
    if (!Number.isFinite(number)) return 0;
    return number > 0 && number <= 1 ? number * 100 : number;
  }

  function orderAckNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : NaN;
  }

  function orderAckAddressLines(address, customerName) {
    const customer = String(customerName || '').trim();
    const lines = splitOrderAckAddress(address);
    if (customer && !lines.length) return [customer];
    if (customer && normalizeOrderAckText(lines[0]) !== normalizeOrderAckText(customer)) {
      return [customer, ...lines];
    }
    return lines;
  }

  function orderDocumentAddressText(lines) {
    return (lines || [])
      .map((line) => String(line || '').trim())
      .filter(Boolean)
      .join(', ');
  }

  function renderOrderDocumentStackedAddress(lines) {
    return (lines || [])
      .map((line) => String(line || '').trim())
      .filter(Boolean)
      .map((line) => `<div>${escapeHtml(line)}</div>`)
      .join('');
  }

  function renderOrderDocumentStackedAddressValue(lines) {
    return (lines || [])
      .map((line) => String(line || '').trim())
      .filter(Boolean)
      .map(escapeHtml)
      .join('<br>');
  }

  function splitOrderAckAddress(value) {
    return String(value || '')
      .replace(/\r/g, '\n')
      .split(/\n|,/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function sameOrderAckAddress(left, right) {
    return normalizeOrderAckText((left || []).join(' ')) === normalizeOrderAckText((right || []).join(' '));
  }

  function normalizeOrderAckText(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  function contactFirstName(value) {
    const clean = String(value || '').trim();
    if (!clean) return '';
    return titleCaseName(clean.split(/\s+/)[0]);
  }

  function titleCaseName(value) {
    const clean = String(value || '').trim().toLowerCase();
    return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : '';
  }

  function renderStockRow(item, index) {
    const lineId = item.source_order_item_id || '';
    return `
      <tr class="db-line-row db-stock-line-row" data-line-id="${escapeAttr(lineId)}" data-stock-index="${escapeAttr(index)}">
        ${renderLineDeleteCell(lineId)}
        <td class="db-row-selector">
          <button class="db-line-drag-handle" type="button" data-db-line-drag="true" aria-label="Reorder line item">&#9654;</button>
        </td>
        <td>${renderLineItemInput(item, 'style_code')}</td>
        <td>${renderLineItemInput(item, 'style_name')}</td>
        <td>${renderStockVariantSelect(item, 'colour')}</td>
        <td>${renderStockVariantSelect(item, 'size')}</td>
        <td>${renderLineItemInput(item, 'unit_cost', 'db-line-money')}</td>
        <td>${renderLineItemInput(item, 'unit_price', 'db-line-money')}</td>
        <td>${renderLineItemInput(item, 'quantity', 'db-line-qty')}</td>
        <td>${renderLineItemInput(item, 'vatPercent', 'db-line-vat')}</td>
      </tr>
    `;
  }

  function renderLineDeleteCell(lineId) {
    return `
      <td class="db-row-selector db-line-delete-cell">
        <button class="db-line-delete-button" type="button" data-db-line-delete="${escapeAttr(lineId)}" aria-label="Delete line item" title="Delete line item">X</button>
      </td>
    `;
  }

  function renderLineItemInput(item, field, className = '') {
    const value = lineItemEditDisplayValue(item, field);
    const canonicalReadonly = Boolean(item?.ralawise_catalog_variant_id)
      && ['style_code', 'style_name'].includes(field);
    return `
      <input
        class="db-line-item-input ${escapeAttr(className)}"
        data-line-item-field="${escapeAttr(field)}"
        data-line-item-original="${escapeAttr(value)}"
        value="${escapeAttr(value)}"
        ${canonicalReadonly ? 'readonly' : ''}
      >
    `;
  }

  function renderStockVariantSelect(item, field) {
    const lineId = item?.source_order_item_id || '';
    const styleId = Number.parseInt(item?.ralawise_catalog_style_id, 10);
    if (!lineId || !Number.isFinite(styleId)) return renderLineItemInput(item, field);

    const variants = getCachedStyleVariants(styleId);
    const saving = state.stockVariantSavingIds.has(String(lineId));
    const currentText = lineItemEditDisplayValue(item, field);

    if (!variants.length) {
      return `
        <select
          class="db-line-select db-stock-variant-select db-stock-variant-select-loading"
          data-stock-variant-select="${escapeAttr(field)}"
          data-line-id="${escapeAttr(lineId)}"
          data-style-id="${escapeAttr(styleId)}"
          aria-label="${escapeAttr(field === 'colour' ? 'Colour' : 'Size')}"
        >
          <option value="">${escapeHtml(currentText)}</option>
        </select>
      `;
    }

    const options = stockVariantOptionsForLine(item, variants, field);
    const selectedValue = stockVariantSelectedValue(item, variants, field);
    const optionHtml = options.length
      ? options.map((option) => (
        `<option value="${escapeAttr(option.value)}" ${option.value === selectedValue ? 'selected' : ''}>${escapeHtml(option.label)}</option>`
      )).join('')
      : `<option value="">${escapeHtml(currentText)}</option>`;

    return `
      <select
        class="db-line-select db-stock-variant-select"
        data-stock-variant-select="${escapeAttr(field)}"
        data-line-id="${escapeAttr(lineId)}"
        data-style-id="${escapeAttr(styleId)}"
        aria-label="${escapeAttr(field === 'colour' ? 'Colour' : 'Size')}"
        ${saving ? 'disabled' : ''}
      >
        ${optionHtml}
      </select>
    `;
  }

  function lineItemEditDisplayValue(item, field) {
    if (!item) return '';
    if (field === 'vatPercent') return formatVatInput(effectiveLineVatRate(item));
    if (field === 'quantity') {
      return item.quantity === null || item.quantity === undefined || item.quantity === ''
        ? ''
        : formatNumber(item.quantity);
    }
    if (field === 'unit_cost' || field === 'unit_price') return formatMoneyInput(item[field]);
    if (field === 'style_name') return item.style_name || item.line_description || '';
    return item[field] || '';
  }

  function renderAddLineButtonRow() {
    return `
      <tr class="db-add-line-button-row">
        <td colspan="10">
          <button class="db-add-line-button" type="button" data-db-line-action="add">Add line</button>
        </td>
      </tr>
    `;
  }

  function renderLineDraftRow() {
    const draft = state.lineDraft || createLineDraft();
    const product = selectedDraftProduct(draft);
    const status = draft.error || (draft.loadingVariants ? 'Loading variants' : '');

    return `
      <tr class="db-add-line-edit-row">
        <td class="db-row-selector db-line-delete-cell">
          <button class="db-line-delete-button" type="button" data-db-line-action="cancel" aria-label="Delete unsaved line item" title="Delete unsaved line item">X</button>
        </td>
        <td class="db-row-selector"></td>
        <td>${renderLineSearchInput('code', draft.codeQuery)}</td>
        <td>${renderLineSearchInput('style', draft.styleQuery)}</td>
        <td>${renderVariantSelect('colour', draft)}</td>
        <td>${renderVariantSelect('size', draft)}</td>
        <td><input class="db-line-input db-line-money" readonly value="${escapeAttr(product ? formatCurrency(product.unit_cost) : '')}"></td>
        <td><input class="db-line-input db-line-money" data-line-input="unitPrice" value="${escapeAttr(draft.unitPrice)}"></td>
        <td><input class="db-line-input db-line-qty" data-line-input="quantity" inputmode="numeric" value="${escapeAttr(draft.quantity)}"></td>
        <td><input class="db-line-input db-line-vat" data-line-input="vatPercent" inputmode="decimal" value="${escapeAttr(draft.vatPercent)}"></td>
      </tr>
      ${status ? `<tr class="db-add-line-status-row"><td colspan="10">${escapeHtml(status)}</td></tr>` : ''}
    `;
  }

  function renderLineSearchInput(field, value) {
    return `
      <input
        class="db-line-input db-line-search-input"
        data-line-search="${escapeAttr(field)}"
        autocomplete="off"
        value="${escapeAttr(value || '')}"
      >
    `;
  }

  function renderVariantSelect(field, draft) {
    const options = field === 'colour' ? draftColourOptions(draft) : draftSizeOptions(draft);
    const selected = field === 'colour' ? draft.colourValue : draft.sizeValue;
    const disabled = options.length ? '' : ' disabled';
    return `
      <select class="db-line-select" data-line-select="${escapeAttr(field)}"${disabled}>
        ${options.length ? options.map((option) => (
          `<option value="${escapeAttr(option.value)}" ${option.value === selected ? 'selected' : ''}>${escapeHtml(option.label)}</option>`
        )).join('') : '<option></option>'}
      </select>
    `;
  }

  function startLineDraft() {
    resetCustomLineDraftState();
    state.lineDraft = createLineDraft({
      preferredStyleId: lastStockCatalogueStyleId(),
    });
    state.productResults = [];
    state.productSearchOpen = false;
    renderItemsPanel();
    window.requestAnimationFrame(() => {
      const input = els.itemsPanel.querySelector('[data-line-search="style"]');
      if (input) input.focus();
    });
  }

  function cancelLineDraft() {
    resetLineDraftState();
    renderItemsPanel();
  }

  function resetLineDraftState() {
    clearTimeout(productSearchTimer);
    productSearchRequest += 1;
    state.lineDraft = null;
    state.productResults = [];
    state.productSearchOpen = false;
    state.productSearchQuery = '';
    state.productSearchField = 'style';
  }

  function createLineDraft(options = {}) {
    return {
      codeQuery: '',
      styleQuery: '',
      preferredStyleId: options.preferredStyleId || null,
      selectedStyleId: null,
      variants: [],
      productId: null,
      variantId: null,
      colourValue: '',
      sizeValue: '',
      unitPrice: '',
      quantity: '1',
      vatPercent: '20.00',
      loadingVariants: false,
      saving: false,
      error: '',
    };
  }

  function lastStockCatalogueStyleId() {
    const stockItems = (state.selectedLineItems || []).filter(isStockItem);
    for (let index = stockItems.length - 1; index >= 0; index -= 1) {
      const styleId = Number.parseInt(stockItems[index]?.ralawise_catalog_style_id, 10);
      if (Number.isFinite(styleId) && styleId > 0) return styleId;
    }
    return null;
  }

  function handleLineDraftMouseDown(event) {
    if (event.target.closest('.db-product-results')) event.preventDefault();
  }

  function handleLineDraftFocus(event) {
    const field = event.target.dataset.lineSearch;
    if (!field || !state.lineDraft) return;
    state.productSearchField = field;
    state.productSearchQuery = event.target.value.trim();
    state.productSearchOpen = true;
    searchProducts(field, state.productSearchQuery);
  }

  function handleLineDraftInput(event) {
    if (!state.lineDraft) return;

    const searchField = event.target.dataset.lineSearch;
    if (searchField) {
      updateDraftSearchValue(searchField, event.target.value);
      state.productSearchField = searchField;
      state.productSearchQuery = event.target.value.trim();
      state.productSearchOpen = true;
      clearTimeout(productSearchTimer);
      productSearchTimer = window.setTimeout(() => {
        searchProducts(searchField, state.productSearchQuery);
      }, PRODUCT_SEARCH_DELAY);
      return;
    }

    const inputField = event.target.dataset.lineInput;
    if (inputField) {
      state.lineDraft[inputField] = event.target.value;
      state.lineDraft.error = '';
    }
  }

  function updateDraftSearchValue(field, value) {
    const draft = state.lineDraft;
    if (!draft) return;
    if (field === 'code') {
      draft.codeQuery = value;
      draft.styleQuery = '';
    }
    if (field === 'style') {
      draft.styleQuery = value;
      draft.codeQuery = '';
    }
    draft.selectedStyleId = null;
    draft.variants = [];
    draft.productId = null;
    draft.variantId = null;
    draft.colourValue = '';
    draft.sizeValue = '';
    draft.error = '';
    clearDraftProductCells();
  }

  function clearDraftProductCells() {
    const cost = els.itemsPanel.querySelector('.db-add-line-edit-row td:nth-child(7) input');
    if (cost) cost.value = '';
  }

  function handleLineDraftKeydown(event) {
    if (!state.lineDraft) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      if (state.productSearchOpen) {
        closeProductResults();
      } else {
        cancelLineDraft();
      }
      return;
    }

    if (event.key !== 'Enter') return;
    event.preventDefault();

    if (event.target.dataset.lineSearch && state.productSearchOpen && state.productResults.length) {
      selectProductResult(state.productResults[0]);
      return;
    }

    saveLineDraft();
  }

  function handleLineDraftFocusOut(event) {
    if (!state.lineDraft) return;
    const row = event.target.closest('.db-add-line-edit-row');
    if (!row) return;
    const nextTarget = event.relatedTarget;
    if (nextTarget && (row.contains(nextTarget) || nextTarget.closest?.('.db-product-results'))) return;

    window.setTimeout(() => {
      if (!state.lineDraft || els.itemsPanel.querySelector('.db-add-line-edit-row:focus-within')) return;
      syncDraftVariantSelection();
      if (isBlankLineDraft(state.lineDraft)) {
        cancelLineDraft();
        return;
      }
      if (selectedDraftProduct(state.lineDraft)) saveLineDraft();
    }, 0);
  }

  function isBlankLineDraft(draft) {
    if (!draft) return true;
    return !String(draft.codeQuery || '').trim()
      && !String(draft.styleQuery || '').trim()
      && !draft.selectedStyleId
      && !draft.productId
      && !draft.variants?.length
      && !String(draft.unitPrice || '').trim()
      && isDefaultDraftValue(draft.quantity, '1')
      && isDefaultDraftValue(draft.vatPercent, '20.00');
  }

  function isDefaultDraftValue(value, defaultValue) {
    const clean = String(value ?? '').trim();
    return clean === '' || clean === defaultValue;
  }

  function handleLineDraftChange(event) {
    if (!state.lineDraft) return;
    const field = event.target.dataset.lineSelect;
    if (!field) return;

    if (field === 'colour') {
      state.lineDraft.colourValue = event.target.value;
      syncDraftVariantSelection({ preserveSize: true });
    } else if (field === 'size') {
      state.lineDraft.sizeValue = event.target.value;
      syncDraftVariantSelection();
    }

    state.lineDraft.error = '';
    renderItemsPanel();
  }

  async function handleStockVariantChange(event) {
    const field = event.target.dataset.stockVariantSelect;
    if (field !== 'colour' && field !== 'size') return;

    const select = event.target;
    const row = select.closest('[data-line-id]');
    const lineItemId = Number.parseInt(row?.dataset.lineId, 10);
    const styleId = Number.parseInt(select.dataset.styleId, 10);
    if (!Number.isFinite(lineItemId) || !Number.isFinite(styleId) || !state.selectedJob?.source_order_id) return;

    const item = (state.selectedLineItems || []).find((line) => Number(line.source_order_item_id) === lineItemId);
    if (!item) return;

    const variants = await loadStyleVariants(styleId);
    if (!variants.length) {
      renderItemsPanel();
      return;
    }

    const product = selectLineItemVariantProduct(item, variants, field, select.value);
    if (!product?.ralawise_catalog_variant_id) {
      renderItemsPanel();
      return;
    }

    if (
      String(product.ralawise_catalog_variant_id)
      === String(item.ralawise_catalog_variant_id || '')
    ) return;
    await saveStockVariantSelection(select, lineItemId, product);
  }

  async function saveStockVariantSelection(select, lineItemId, product) {
    if (!select || !Number.isFinite(lineItemId) || !product?.ralawise_catalog_variant_id) return;
    const savingKey = String(lineItemId);
    if (state.stockVariantSavingIds.has(savingKey)) return;

    state.stockVariantSavingIds.add(savingKey);
    select.disabled = true;
    select.classList.remove('db-line-item-error');

    let shouldRender = false;
    try {
      const data = await fetchJson(
        `/api/database/jobs/${encodeURIComponent(state.selectedJob.source_order_id)}/line-items/${encodeURIComponent(lineItemId)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ralawise_catalog_variant_id: product.ralawise_catalog_variant_id,
          }),
        }
      );

      state.selectedLineItems = data.lineItems || state.selectedLineItems;
      syncSelectedJobLineSummary();
      renderOutstandingOrders();
      shouldRender = true;
    } catch (err) {
      select.classList.add('db-line-item-error');
      console.error('Stock variant update failed', err);
      window.alert(`Failed to update ${select.dataset.stockVariantSelect || 'variant'}: ${err.message || 'Unknown error'}`);
      shouldRender = true;
    } finally {
      state.stockVariantSavingIds.delete(savingKey);
      if (select.isConnected) select.disabled = false;
      if (shouldRender) renderItemsPanel();
    }
  }

  function preloadStockItemVariants() {
    const styleIds = unique((state.selectedLineItems || [])
      .filter(isStockItem)
      .map((item) => Number.parseInt(item.ralawise_catalog_style_id, 10))
      .filter(Number.isFinite));
    const missing = styleIds.filter((styleId) => {
      const key = styleVariantCacheKey(styleId);
      return key && !state.productVariantCache.has(key) && !state.productVariantLoading.has(key);
    });
    if (!missing.length) return;

    const sourceOrderId = state.selectedJob?.source_order_id;
    Promise.all(missing.map((styleId) => loadStyleVariants(styleId))).then(() => {
      if (sourceOrderId !== state.selectedJob?.source_order_id || state.activeOrderTab !== 'items') return;
      renderItemsPanel();
    }).catch((err) => {
      console.warn('Stock variant preload failed', err);
    });
  }

  async function loadStyleVariants(styleId) {
    const key = styleVariantCacheKey(styleId);
    if (!key) return [];
    if (state.productVariantCache.has(key)) return getCachedStyleVariants(styleId);
    if (state.productVariantLoading.has(key)) return state.productVariantLoading.get(key);

    const promise = fetchJson(`/api/database/products/styles/${encodeURIComponent(styleId)}/variants`)
      .then((data) => {
        const variants = Array.isArray(data.products) ? data.products : [];
        state.productVariantCache.set(key, variants);
        return variants;
      })
      .catch((err) => {
        console.warn(`Product variant load failed for style ${styleId}`, err);
        state.productVariantCache.set(key, []);
        return [];
      })
      .finally(() => {
        state.productVariantLoading.delete(key);
      });
    state.productVariantLoading.set(key, promise);
    return promise;
  }

  function getCachedStyleVariants(styleId) {
    return state.productVariantCache.get(styleVariantCacheKey(styleId)) || [];
  }

  function styleVariantCacheKey(styleId) {
    const numeric = Number.parseInt(styleId, 10);
    return Number.isFinite(numeric) ? String(numeric) : '';
  }

  async function searchProducts(field, query) {
    const requestId = ++productSearchRequest;
    const cleanQuery = String(query || '').trim();
    const params = new URLSearchParams({ field, q: cleanQuery });
    const preferredStyleId = Number.parseInt(state.lineDraft?.preferredStyleId, 10);
    if (!cleanQuery && Number.isFinite(preferredStyleId) && preferredStyleId > 0) {
      params.set('preferredStyleId', String(preferredStyleId));
    }

    try {
      const data = await fetchJson(`/api/database/products/search?${params.toString()}`);
      if (requestId !== productSearchRequest || !state.lineDraft) return;
      state.productResults = Array.isArray(data.products) ? data.products : [];
      state.productSearchOpen = true;
      paintProductResults();
    } catch {
      if (requestId !== productSearchRequest || !state.lineDraft) return;
      state.productResults = [];
      state.productSearchOpen = true;
      paintProductResults('Product search failed');
    }
  }

  function paintProductResults(errorMessage = '') {
    const box = els.itemsPanel?.querySelector('.db-product-results');
    if (!box) return;

    if (!state.lineDraft || !state.productSearchOpen) {
      box.classList.remove('open');
      box.innerHTML = '';
      return;
    }

    const input = els.itemsPanel.querySelector(`[data-line-search="${state.productSearchField}"]`);
    if (!input) {
      box.classList.remove('open');
      box.innerHTML = '';
      return;
    }

    const rect = input.getBoundingClientRect();
    const layout = box.closest('.db-items-layout');
    const layoutRect = layout.getBoundingClientRect();
    const desiredWidth = Math.max(340, Math.round(rect.width));
    const maxWidth = Math.max(220, layout.clientWidth - 2);
    const width = Math.min(desiredWidth, maxWidth);
    const left = Math.max(0, Math.min(Math.round(rect.left - layoutRect.left), layout.clientWidth - width));
    const top = Math.max(0, Math.round(rect.bottom - layoutRect.top + 2));
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
    box.style.width = `${width}px`;
    box.innerHTML = renderProductResults(errorMessage);
    box.classList.add('open');
  }

  function renderProductResults(errorMessage) {
    const query = state.productSearchQuery || '';
    if (errorMessage) return `<div class="db-product-result-empty">${escapeHtml(errorMessage)}</div>`;
    if (!state.productResults.length) return '<div class="db-product-result-empty">No matching products</div>';

    return state.productResults.map((product, index) => {
      const code = product.style_code || product.alt_style_code || '';
      const name = product.style_name || '';
      const meta = [
        product.colour_count ? `${product.colour_count} colours` : '',
        product.size_count ? `${product.size_count} sizes` : '',
      ].filter(Boolean).join(' | ');

      return `
        <button class="db-product-result ${index === 0 ? 'active' : ''}" type="button" role="option" data-db-product-index="${index}">
          <span class="db-product-result-code">${highlightMatch(code, query)}</span>
          <span class="db-product-result-name">${highlightMatch(name, query)}</span>
          ${meta ? `<span class="db-product-result-meta">${escapeHtml(meta)}</span>` : ''}
        </button>
      `;
    }).join('');
  }

  function closeProductResults() {
    productSearchRequest += 1;
    state.productSearchOpen = false;
    const box = els.itemsPanel?.querySelector('.db-product-results');
    if (!box) return;
    box.classList.remove('open');
    box.innerHTML = '';
  }

  async function selectProductResult(product) {
    if (!state.lineDraft) return;

    const draft = state.lineDraft;
    draft.selectedStyleId = Number.parseInt(
      product.ralawise_catalog_style_id || product.style_id,
      10
    );
    draft.codeQuery = product.style_code || '';
    draft.styleQuery = product.style_name || '';
    draft.variants = [];
    draft.productId = null;
    draft.variantId = null;
    draft.colourValue = '';
    draft.sizeValue = '';
    draft.loadingVariants = true;
    draft.error = '';
    closeProductResults();
    renderItemsPanel();

    try {
      const data = await fetchJson(`/api/database/products/styles/${encodeURIComponent(draft.selectedStyleId)}/variants`);
      if (!state.lineDraft || state.lineDraft.selectedStyleId !== draft.selectedStyleId) return;
      draft.variants = Array.isArray(data.products) ? data.products : [];
      state.productVariantCache.set(styleVariantCacheKey(draft.selectedStyleId), draft.variants);
      draft.loadingVariants = false;
      syncDraftVariantSelection();
      renderItemsPanel();
      window.requestAnimationFrame(() => {
        els.itemsPanel.querySelector('[data-line-select="colour"]')?.focus();
      });
    } catch (err) {
      if (!state.lineDraft) return;
      draft.loadingVariants = false;
      draft.error = err.message || 'Failed to load product variants';
      renderItemsPanel();
    }
  }

  function syncDraftVariantSelection(options = {}) {
    const draft = state.lineDraft;
    if (!draft || !draft.variants.length) return;

    if (!draft.colourValue) draft.colourValue = variantColourValue(draft.variants[0]);

    const availableSizes = draftSizeOptions(draft);
    if (!draft.sizeValue || !availableSizes.some((option) => option.value === draft.sizeValue)) {
      draft.sizeValue = availableSizes[0]?.value || '';
    }

    let product = selectedDraftProduct(draft);
    if (!product && options.preserveSize) {
      draft.sizeValue = '';
      const sizes = draftSizeOptions(draft);
      draft.sizeValue = sizes[0]?.value || '';
      product = selectedDraftProduct(draft);
    }

    draft.productId = product?.source_product_id || null;
    draft.variantId = product?.ralawise_catalog_variant_id || null;
    if (product) {
      draft.colourValue = variantColourValue(product);
      draft.sizeValue = variantSizeValue(product);
      syncDraftVatForProduct(draft, product);
    }
  }

  function syncDraftVatForProduct(draft, product) {
    if (!draft || !product) return;
    if (isChildrensClothingLineItem(product)) {
      draft.vatPercent = '0.00';
    }
  }

  function selectedDraftProduct(draft) {
    if (!draft?.variants?.length) return null;
    const byColourAndSize = draft.variants.find((product) => (
      variantColourValue(product) === draft.colourValue
      && variantSizeValue(product) === draft.sizeValue
    ));
    if (byColourAndSize) return byColourAndSize;

    const byVariantId = draft.variants.find((product) => (
      String(product.ralawise_catalog_variant_id)
      === String(draft.variantId || '')
    ));
    if (byVariantId) return byVariantId;

    const byId = draft.variants.find((product) => String(product.source_product_id) === String(draft.productId));
    if (byId) return byId;

    return draft.variants.find((product) => variantColourValue(product) === draft.colourValue)
      || draft.variants[0]
      || null;
  }

  function draftColourOptions(draft) {
    return uniqueVariantOptions(draft?.variants || [], variantColourValue, 'colour');
  }

  function draftSizeOptions(draft) {
    const products = (draft?.variants || []).filter((product) => (
      !draft.colourValue || variantColourValue(product) === draft.colourValue
    ));
    return sortVariantSizeOptions(uniqueVariantOptions(
      products.length ? products : (draft?.variants || []),
      variantSizeValue,
      'size'
    ));
  }

  function stockVariantOptionsForLine(item, variants, field) {
    const products = Array.isArray(variants) ? variants : [];
    const selectedValue = stockVariantSelectedValue(item, products, field);
    const selectedProduct = findLineItemVariantProduct(item, products);
    const selectedColourValue = selectedProduct
      ? variantColourValue(selectedProduct)
      : variantValueFromText(item?.colour);
    const sourceProducts = field === 'size'
      ? products.filter((product) => !selectedColourValue || variantColourValue(product) === selectedColourValue)
      : products;
    const options = uniqueVariantOptions(
      sourceProducts.length ? sourceProducts : products,
      field === 'colour' ? variantColourValue : variantSizeValue,
      field
    );

    if (field === 'size') sortVariantSizeOptions(options, { inPlace: true });

    if (selectedValue && !options.some((option) => option.value === selectedValue)) {
      options.unshift({ value: selectedValue, label: item?.[field] || '' });
    }
    return options;
  }

  function stockVariantSelectedValue(item, variants, field) {
    const product = findLineItemVariantProduct(item, variants);
    if (product) return field === 'colour' ? variantColourValue(product) : variantSizeValue(product);
    return variantValueFromText(item?.[field]);
  }

  function findLineItemVariantProduct(item, variants) {
    const products = Array.isArray(variants) ? variants : [];
    if (!item || !products.length) return null;

    const productId = item.source_product_id == null ? '' : String(item.source_product_id);
    const variantId = item.ralawise_catalog_variant_id == null
      ? ''
      : String(item.ralawise_catalog_variant_id);
    if (variantId) {
      const byVariantId = products.find((product) => (
        String(product.ralawise_catalog_variant_id) === variantId
      ));
      if (byVariantId) return byVariantId;
    }
    const ralawiseSku = String(item.ralawise_sku || '').trim().toUpperCase();
    if (ralawiseSku) {
      const bySku = products.find((product) => (
        String(product.ralawise_sku || '').trim().toUpperCase() === ralawiseSku
      ));
      if (bySku) return bySku;
    }
    if (productId) {
      const byId = products.find((product) => String(product.source_product_id) === productId);
      if (byId) return byId;
    }

    const itemColour = normalizeVariantText(item.colour);
    const itemSize = normalizeVariantText(item.size);
    const exact = products.find((product) => (
      normalizeVariantText(product.colour) === itemColour &&
      normalizeVariantText(product.size) === itemSize
    ));
    if (exact) return exact;

    return products.find((product) => normalizeVariantText(product.colour) === itemColour)
      || products.find((product) => normalizeVariantText(product.size) === itemSize)
      || null;
  }

  function selectLineItemVariantProduct(item, variants, field, selectedValue) {
    const products = Array.isArray(variants) ? variants : [];
    if (!products.length) return null;

    const current = findLineItemVariantProduct(item, products);
    const currentColourValue = current ? variantColourValue(current) : variantValueFromText(item?.colour);
    const currentSizeValue = current ? variantSizeValue(current) : variantValueFromText(item?.size);
    const nextColourValue = field === 'colour' ? selectedValue : currentColourValue;
    const nextSizeValue = field === 'size' ? selectedValue : currentSizeValue;

    return products.find((product) => (
      variantColourValue(product) === nextColourValue &&
      variantSizeValue(product) === nextSizeValue
    )) || (
      field === 'colour'
        ? products.find((product) => variantColourValue(product) === nextColourValue)
        : products.find((product) => variantSizeValue(product) === nextSizeValue)
    ) || null;
  }

  function variantValueFromText(value) {
    const clean = String(value || '').trim();
    return clean ? `name:${clean}` : '';
  }

  function normalizeVariantText(value) {
    return String(value || '').trim().toLowerCase();
  }

  function uniqueVariantOptions(products, valueFn, labelKey) {
    const seen = new Set();
    const options = [];
    for (const product of products) {
      const value = valueFn(product);
      if (!value || seen.has(value)) continue;
      seen.add(value);
      options.push({ value, label: product[labelKey] || '' });
    }
    return options;
  }

  function sortVariantSizeOptions(options, { inPlace = false } = {}) {
    const sorted = inPlace ? options : options.slice();
    return sorted.sort((left, right) => compareProductSizes(left?.label, right?.label));
  }

  function variantColourValue(product) {
    if (!product) return '';
    if (product.supplier_colour_code) return `code:${product.supplier_colour_code}`;
    if (product.colour_id !== null && product.colour_id !== undefined) return `id:${product.colour_id}`;
    return product.colour ? `name:${product.colour}` : '';
  }

  function variantSizeValue(product) {
    if (!product) return '';
    if (product.supplier_size_code) return `code:${product.supplier_size_code}`;
    if (product.size_id !== null && product.size_id !== undefined) return `id:${product.size_id}`;
    return product.size ? `name:${product.size}` : '';
  }

  async function saveLineDraft() {
    const draft = state.lineDraft;
    if (!draft || draft.saving) return;
    syncDraftVariantSelection();
    const product = selectedDraftProduct(draft);

    if (!product) {
      draft.error = 'Select a product, colour, and size before adding the line';
      renderItemsPanel();
      return;
    }

    draft.saving = true;
    draft.error = '';
    renderItemsPanel();

    try {
      const data = await fetchJson(`/api/database/jobs/${encodeURIComponent(state.selectedJob.source_order_id)}/line-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ralawise_catalog_variant_id: product.ralawise_catalog_variant_id,
          quantity: lineInteger(draft.quantity, 1),
          unit_price: lineNumber(draft.unitPrice),
          vat_rate: lineVatRate(draft.vatPercent),
        }),
      });

      state.selectedLineItems = data.lineItems || state.selectedLineItems;
      if (state.selectedJob) {
        state.selectedJob.line_item_count = state.selectedLineItems.length;
        state.selectedJob.total_quantity = state.selectedLineItems.reduce((total, item) => total + Number(item.quantity || 0), 0);
      }
      resetLineOrderAutosaveState();
      resetLineDraftState();
      renderItemsPanel();
      renderOutstandingOrders();
    } catch (err) {
      if (!state.lineDraft) return;
      state.lineDraft.saving = false;
      state.lineDraft.error = err.message || 'Failed to add line item';
      renderItemsPanel();
    }
  }

  function lineInteger(value, fallback) {
    const parsed = Number.parseInt(String(value || '').replace(/[^\d-]/g, ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  function lineNumber(value) {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const parsed = Number.parseFloat(String(value).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function lineVatRate(value) {
    const parsed = lineNumber(value);
    if (parsed === null) return null;
    return parsed > 1 ? parsed / 100 : parsed;
  }

  function handleLineItemEditKeydown(event) {
    if (!event.target.dataset.lineItemField) return;
    if (event.key !== 'Enter') return;
    event.preventDefault();
    saveLineItemEdit(event.target);
  }

  function handleLineItemEditFocusOut(event) {
    if (!event.target.dataset.lineItemField) return;
    saveLineItemEdit(event.target);
  }

  async function saveLineItemEdit(input) {
    if (!input || input.dataset.lineItemSaving === 'true') return;

    const row = input.closest('[data-line-id]');
    const lineItemId = Number.parseInt(row?.dataset.lineId, 10);
    const field = input.dataset.lineItemField;
    if (!Number.isFinite(lineItemId) || !field || !state.selectedJob?.source_order_id) return;

    const original = input.dataset.lineItemOriginal || '';
    const current = input.value || '';
    if (current.trim() === original.trim()) return;

    const payload = lineItemEditPayload(field, current);
    if (!payload) return;

    input.dataset.lineItemSaving = 'true';
    input.classList.remove('db-line-item-error');

    try {
      const data = await fetchJson(
        `/api/database/jobs/${encodeURIComponent(state.selectedJob.source_order_id)}/line-items/${encodeURIComponent(lineItemId)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      state.selectedLineItems = data.lineItems || state.selectedLineItems;
      syncSelectedJobLineSummary();
      renderOutstandingOrders();

      const updatedItem = state.selectedLineItems.find((item) => Number(item.source_order_item_id) === lineItemId);
      const displayValue = lineItemEditDisplayValue(updatedItem, field);
      input.value = displayValue;
      input.dataset.lineItemOriginal = displayValue;
      window.requestAnimationFrame(applyNonStockTableLayout);
    } catch (err) {
      input.classList.add('db-line-item-error');
      console.error('Line item autosave failed', err);
    } finally {
      delete input.dataset.lineItemSaving;
    }
  }

  function lineItemEditPayload(field, value) {
    if (field === 'vatPercent') return { vat_rate: lineVatRate(value) };
    if (field === 'quantity') return { quantity: lineInteger(value, 1) };
    if (field === 'unit_cost' || field === 'unit_price') return { [field]: lineNumber(value) };
    if (['style_code', 'alt_style_code', 'style_name', 'colour', 'size', 'line_description', 'supplier_name'].includes(field)) {
      return { [field]: String(value || '').trim() };
    }
    return null;
  }

  function handleLineTextFocusIn(event) {
    const input = event.target;
    if (!isLineTextHoverInput(input)) return;
    stopLineTextHoverScroll(input);
  }

  function handleLineTextHoverIn(event) {
    const input = event.target;
    if (!isLineTextHoverInput(input) || document.activeElement === input) return;
    startLineTextHoverScroll(input);
  }

  function handleLineTextHoverOut(event) {
    const input = event.target;
    if (!isLineTextHoverInput(input)) return;
    if (event.relatedTarget === input) return;
    stopLineTextHoverScroll(input);
  }

  function isLineTextHoverInput(input) {
    if (!input?.matches?.('input')) return false;
    if (!input.closest('.db-nonstock-table')) return false;
    const field = input.dataset.lineItemField || input.dataset.customLineField;
    return field === 'line_description' || field === 'supplier_name';
  }

  function startLineTextHoverScroll(input) {
    stopLineTextHoverScroll(input);
    const maxScroll = input.scrollWidth - input.clientWidth;
    if (maxScroll <= 1) return;

    input.classList.add('db-line-text-scrolling');
    input.scrollLeft = 0;

    const delayMs = 250;
    const durationMs = Math.max(900, Math.min(2600, maxScroll * 34));
    const startAt = window.performance.now() + delayMs;
    const animation = { frame: 0 };

    const tick = (now) => {
      if (now < startAt) {
        animation.frame = window.requestAnimationFrame(tick);
        return;
      }

      const progress = Math.min((now - startAt) / durationMs, 1);
      input.scrollLeft = Math.round(maxScroll * progress);
      if (progress < 1) animation.frame = window.requestAnimationFrame(tick);
    };

    animation.frame = window.requestAnimationFrame(tick);
    lineTextScrollAnimations.set(input, animation);
  }

  function stopLineTextHoverScroll(input) {
    const animation = lineTextScrollAnimations.get(input);
    if (animation) window.cancelAnimationFrame(animation.frame);
    lineTextScrollAnimations.delete(input);
    input.classList.remove('db-line-text-scrolling');
    input.scrollLeft = 0;
  }

  function syncSelectedJobLineSummary() {
    if (!state.selectedJob) return;
    state.selectedJob.line_item_count = state.selectedLineItems.length;
    state.selectedJob.total_quantity = state.selectedLineItems.reduce((total, item) => total + Number(item.quantity || 0), 0);
  }

  function handleLineDragPointerDown(event) {
    const designHandle = event.target.closest('[data-db-design-drag]');
    if (designHandle) {
      startDesignDrag(event, designHandle);
      return;
    }

    const handle = event.target.closest('[data-db-line-drag]');
    if (!handle || event.button !== 0 || state.lineDraft || state.customLineDraft) return;

    const row = handle.closest('.db-line-row');
    const tbody = row?.parentElement;
    if (!row || !tbody || !row.dataset.lineId) return;

    event.preventDefault();
    closeProductResults();

    const rect = row.getBoundingClientRect();
    lineDrag = {
      pointerId: event.pointerId,
      row,
      tbody,
      mode: 'line',
      rowSelector: '.db-line-row',
      offsetY: event.clientY - rect.top,
      startOrder: currentDomLineIds(tbody),
      ghost: createLineDragGhost(row, rect),
    };

    row.classList.add('db-line-row-dragging');
    document.body.classList.add('db-line-drag-active');
    handle.setPointerCapture?.(event.pointerId);
    updateLineDragGhost(event.clientY);
  }

  function startDesignDrag(event, handle) {
    if (event.button !== 0) return;

    const row = handle.closest('.db-design-row');
    const tbody = row?.parentElement;
    if (!row || !tbody || !designRowHasValue(row)) return;

    event.preventDefault();

    const rect = row.getBoundingClientRect();
    lineDrag = {
      pointerId: event.pointerId,
      row,
      tbody,
      mode: 'design',
      rowSelector: '.db-design-row',
      offsetY: event.clientY - rect.top,
      startOrder: currentDomDesignKeys(tbody),
      ghost: createLineDragGhost(row, rect),
    };

    row.classList.add('db-line-row-dragging');
    document.body.classList.add('db-line-drag-active');
    handle.setPointerCapture?.(event.pointerId);
    updateLineDragGhost(event.clientY);
  }

  function handleLineDragPointerMove(event) {
    if (!lineDrag || event.pointerId !== lineDrag.pointerId) return;
    event.preventDefault();
    updateLineDragGhost(event.clientY);
    moveDraggedLineRow(event.clientY);
  }

  function handleLineDragPointerUp(event) {
    if (!lineDrag || event.pointerId !== lineDrag.pointerId) return;
    event.preventDefault();

    const drag = lineDrag;
    const before = drag.startOrder.join('|');
    cleanupLineDrag();

    if (drag.mode === 'design') {
      const afterKeys = currentDomDesignKeys(drag.tbody);
      const after = afterKeys.join('|');
      if (after && after !== before) markDesignOrderDirty();
      return;
    }

    const afterIds = currentDomLineIds(drag.tbody);
    const after = afterIds.join('|');
    if (after && after !== before) {
      applyLineOrder(afterIds);
      markLineOrderDirty(afterIds);
    }
  }

  function createLineDragGhost(row, rect) {
    const ghost = document.createElement('div');
    ghost.className = 'db-line-drag-ghost';
    ghost.style.left = `${Math.round(rect.left)}px`;
    ghost.style.width = `${Math.round(rect.width)}px`;

    const table = document.createElement('table');
    table.className = row.closest('table')?.className || 'db-legacy-table';
    const tbody = document.createElement('tbody');
    const clone = row.cloneNode(true);
    clone.classList.remove('db-line-row-dragging');
    clone.classList.add('db-line-drag-ghost-row');
    tbody.appendChild(clone);
    table.appendChild(tbody);
    ghost.appendChild(table);
    document.body.appendChild(ghost);
    return ghost;
  }

  function updateLineDragGhost(clientY) {
    if (!lineDrag?.ghost) return;
    lineDrag.ghost.style.top = `${Math.round(clientY - lineDrag.offsetY)}px`;
  }

  function moveDraggedLineRow(clientY) {
    if (!lineDrag) return;

    const rowSelector = lineDrag.rowSelector || '.db-line-row';
    const rows = Array.from(lineDrag.tbody.children)
      .filter((row) => row.matches(rowSelector))
      .filter((row) => row !== lineDrag.row);
    let beforeRow = null;

    for (const row of rows) {
      const rect = row.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        beforeRow = row;
        break;
      }
    }

    if (beforeRow) {
      lineDrag.tbody.insertBefore(lineDrag.row, beforeRow);
      return;
    }

    const firstNonLineRow = Array.from(lineDrag.tbody.children)
      .find((row) => !row.matches(rowSelector));
    lineDrag.tbody.insertBefore(lineDrag.row, firstNonLineRow || null);
  }

  function cleanupLineDrag() {
    if (!lineDrag) return;
    lineDrag.row.classList.remove('db-line-row-dragging');
    lineDrag.ghost?.remove();
    document.body.classList.remove('db-line-drag-active');
    lineDrag = null;
  }

  function currentDomLineIds(tbody) {
    const rows = Array.from(tbody?.children || [])
      .filter((row) => row.classList.contains('db-line-row'));
    return rows
      .map((row) => Number.parseInt(row.dataset.lineId, 10))
      .filter((id) => Number.isFinite(id));
  }

  function currentDomDesignKeys(tbody) {
    const rows = Array.from(tbody?.children || [])
      .filter((row) => row.classList.contains('db-design-row'))
      .filter((row) => designRowHasValue(row));
    return rows
      .map((row) => row.dataset.designKey || '')
      .filter(Boolean);
  }

  function applyLineOrder(lineIds) {
    const lineIdSet = new Set(lineIds.map((lineId) => Number(lineId)));
    const lineById = new Map((state.selectedLineItems || []).map((item) => [Number(item.source_order_item_id), item]));
    const orderedLines = lineIds
      .map((lineId) => lineById.get(Number(lineId)))
      .filter(Boolean);

    if (orderedLines.length !== lineIdSet.size) return;

    let orderedIndex = 0;
    state.selectedLineItems = state.selectedLineItems.map((item) => {
      if (!lineIdSet.has(Number(item.source_order_item_id))) return item;
      const orderedItem = orderedLines[orderedIndex] || item;
      orderedIndex += 1;
      return {
        ...orderedItem,
        line_sort_order: orderedIndex,
      };
    });
  }

  function markLineOrderDirty(lineIds) {
    const normalizedIds = lineIds
      .map((lineId) => Number.parseInt(lineId, 10))
      .filter((lineId) => Number.isFinite(lineId));
    if (!normalizedIds.length) return;

    const idSet = new Set(normalizedIds);
    state.lineOrderPendingGroups = [
      ...state.lineOrderPendingGroups.filter((group) => !group.some((lineId) => idSet.has(Number(lineId)))),
      normalizedIds,
    ];
    state.lineOrderDirty = true;
    scheduleLineOrderAutosave();
  }

  function handleJobTitleInput() {
    if (!state.selectedJob?.source_order_id) return;
    state.selectedJob.job_title = els.orderTitle.value;
    updateOutstandingJob(state.selectedJob);
    renderOutstandingOrders();
    state.jobDirty = true;
    scheduleJobAutosave();
  }

  function scheduleJobAutosave() {
    clearTimeout(jobAutosaveTimer);
    jobAutosaveTimer = window.setTimeout(() => {
      flushJobAutosave();
    }, JOB_AUTOSAVE_MS);
  }

  async function flushJobAutosave(options = {}) {
    clearTimeout(jobAutosaveTimer);
    if (!state.jobDirty || !state.selectedJob?.source_order_id) return;
    await saveJobFields(options);
  }

  async function saveJobFields(options = {}) {
    const commentsInput = els.detailsPanel?.querySelector('[data-db-job-field="comments"]');
    const clientOrderNoInput = els.detailsPanel?.querySelector('[data-db-job-field="client_order_no"]');
    const orderTypeSelect = els.detailsPanel?.querySelector('[data-db-job-field="order_type"]');
    const orderType = normalizeOrderTypeOption(orderTypeSelect?.value)
      || normalizeOrderTypeOption(state.selectedJob?.order_type)
      || normalizeOrderTypeOption(typeLabel(state.selectedJob));
    const payload = {
      job_title: els.orderTitle.value.trim(),
      comments: commentsInput ? commentsInput.value : (state.selectedJob?.comments || ''),
      client_order_no: clientOrderNoInput
        ? clientOrderNoInput.value.trim()
        : (state.selectedJob?.client_order_no || ''),
    };
    if (orderType) payload.order_type = orderType;
    const signature = jobSignature(payload);
    const lastSavedSignature = parseJobSignature(state.jobLastSavedSignature);
    const orderTypeChanged = Boolean(payload.order_type) && lastSavedSignature.order_type !== payload.order_type;

    if (signature === state.jobLastSavedSignature) {
      state.jobDirty = false;
      return;
    }

    if (state.jobSaving) {
      state.jobSaveQueued = true;
      return;
    }

    state.jobSaving = true;

    try {
      const response = await fetch(`/api/database/jobs/${encodeURIComponent(state.selectedJob.source_order_id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: Boolean(options.keepalive),
        cache: 'no-store',
        credentials: 'include',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) {
          window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search + window.location.hash)}`);
          return;
        }
        throw new Error(data.error || `Request failed: ${response.status}`);
      }

      state.selectedJob = { ...state.selectedJob, ...data.job };
      state.jobDirty = false;
      state.jobLastSavedSignature = jobSignature(state.selectedJob);
      renderOrderHeaderStats();
      updateOutstandingJob(state.selectedJob);
      renderOutstandingOrders();
      hydrateOrderSelectors();
      if (orderTypeChanged) refreshDashboardAfterOrderTypeChange();
    } catch (err) {
      state.jobDirty = true;
      console.error('Job title autosave failed', err);
    } finally {
      state.jobSaving = false;
      if (state.jobSaveQueued) {
        state.jobSaveQueued = false;
        scheduleJobAutosave();
      }
    }
  }

  function resetJobAutosaveState() {
    clearTimeout(jobAutosaveTimer);
    state.jobDirty = false;
    state.jobSaving = false;
    state.jobSaveQueued = false;
    state.jobLastSavedSignature = '{}';
  }

  function jobSignature(job) {
    return JSON.stringify({
      job_title: job?.job_title || '',
      order_type: normalizeOrderTypeOption(job?.order_type) || '',
      comments: job?.comments || '',
      client_order_no: job?.client_order_no || '',
    });
  }

  function parseJobSignature(signature) {
    try {
      const parsed = JSON.parse(signature || '{}');
      return parsed && typeof parsed === 'object'
        ? {
          job_title: parsed.job_title || '',
          order_type: normalizeOrderTypeOption(parsed.order_type) || '',
          comments: parsed.comments || '',
          client_order_no: parsed.client_order_no || '',
        }
        : { job_title: '', order_type: '', comments: '', client_order_no: '' };
    } catch {
      return { job_title: '', order_type: '', comments: '', client_order_no: '' };
    }
  }

  function refreshDashboardAfterOrderTypeChange() {
    if (!window.__latestTestBoardPayload || typeof window.loadTestBoard !== 'function') return;
    window.loadTestBoard({ forceRefresh: true }).catch((err) => {
      console.warn('Tuesday Dashboard refresh after order type change failed', err);
    });
  }

  function updateOutstandingJob(job) {
    if (!job?.source_order_id) return;
    const index = state.outstandingJobs.findIndex((item) => (
      Number(item.source_order_id) === Number(job.source_order_id)
    ));
    if (index >= 0) {
      state.outstandingJobs[index] = { ...state.outstandingJobs[index], ...job };
    }
  }

  function scheduleLineOrderAutosave() {
    clearTimeout(lineOrderAutosaveTimer);
    lineOrderAutosaveTimer = window.setTimeout(() => {
      flushLineOrderAutosave();
    }, LINE_ORDER_AUTOSAVE_MS);
  }

  async function flushOrderAutosaves(options = {}) {
    await Promise.all([
      flushJobAutosave(options),
      flushDesignAutosave(options),
      flushLineOrderAutosave(options),
      flushContactAutosaves(options),
      flushCustomerAddressAutosave(options),
    ]);
  }

  async function flushLineOrderAutosave(options = {}) {
    clearTimeout(lineOrderAutosaveTimer);
    if (!state.lineOrderDirty || !state.selectedJob?.source_order_id) return;
    await saveLineOrder(options);
  }

  async function saveLineOrder(options = {}) {
    if (!state.lineOrderPendingGroups.length) {
      state.lineOrderDirty = false;
      return;
    }

    if (state.lineOrderSaving) {
      state.lineOrderSaveQueued = true;
      return;
    }

    state.lineOrderSaving = true;
    const groups = state.lineOrderPendingGroups.map((group) => [...group]);
    state.lineOrderPendingGroups = [];

    try {
      for (const lineItemIds of groups) {
        const response = await fetch(`/api/database/jobs/${encodeURIComponent(state.selectedJob.source_order_id)}/line-items/order`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ line_item_ids: lineItemIds }),
          keepalive: Boolean(options.keepalive),
          cache: 'no-store',
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (response.status === 401) {
            window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search + window.location.hash)}`);
            return;
          }
          throw new Error(data.error || `Request failed: ${response.status}`);
        }
        state.selectedLineItems = data.lineItems || state.selectedLineItems;
        state.lineOrderLastSavedSignature = lineOrderSignature(lineItemIds);
      }

      state.lineOrderDirty = state.lineOrderPendingGroups.length > 0;
      if (!options.keepalive && state.activeOrderTab === 'items') renderItemsPanel();
    } catch (err) {
      state.lineOrderPendingGroups = [...groups, ...state.lineOrderPendingGroups];
      state.lineOrderDirty = true;
      console.error('Line item order autosave failed', err);
    } finally {
      state.lineOrderSaving = false;
      if (state.lineOrderSaveQueued || state.lineOrderPendingGroups.length) {
        state.lineOrderSaveQueued = false;
        scheduleLineOrderAutosave();
      }
    }
  }

  function resetLineOrderAutosaveState() {
    clearTimeout(lineOrderAutosaveTimer);
    state.lineOrderDirty = false;
    state.lineOrderSaving = false;
    state.lineOrderSaveQueued = false;
    state.lineOrderPendingGroups = [];
    state.lineOrderLastSavedSignature = '[]';
  }

  function lineOrderSignature(value) {
    const ids = Array.isArray(value) ? value : [];
    return JSON.stringify(ids.map((item) => (
      typeof item === 'object' ? Number(item.source_order_item_id) : Number(item)
    )));
  }

  function renderNonStockRow(item, index, options = {}) {
    const lineId = item.source_order_item_id || '';
    return `
      <tr class="db-line-row db-custom-line-row" data-line-id="${escapeAttr(lineId)}">
        ${renderLineDeleteCell(lineId)}
        <td class="db-row-selector">
          <button class="db-line-drag-handle" type="button" data-db-line-drag="true" aria-label="Reorder line item">&#9654;</button>
        </td>
        <td>${renderLineItemInput(item, 'line_description')}</td>
        ${options.showSupplier ? `<td>${renderLineItemInput(item, 'supplier_name')}</td>` : ''}
        <td>${renderLineItemInput(item, 'unit_cost', 'db-line-money')}</td>
        <td>${renderLineItemInput(item, 'unit_price', 'db-line-money')}</td>
        <td>${renderLineItemInput(item, 'quantity', 'db-line-qty')}</td>
        <td>${renderLineItemInput(item, 'vatPercent', 'db-line-vat')}</td>
      </tr>
    `;
  }

  function renderCustomAddLineButtonRow(type, colspan) {
    return `
      <tr class="db-add-line-button-row">
        <td colspan="${colspan}">
          <button class="db-add-line-button" type="button" data-db-custom-line-action="add" data-db-line-type="${escapeAttr(type)}">Add line</button>
        </td>
      </tr>
    `;
  }

  function renderCustomSectionRows(items, type, colspan, renderRow) {
    const lineType = normalizeCustomLineType(type);
    const itemRows = items.map(renderRow).join('');
    const isEditing = state.customLineDraft?.type === lineType;

    if (isEditing) {
      return [
        itemRows,
        renderCustomLineDraftRow(lineType, colspan),
      ].join('');
    }

    return [
      itemRows,
      renderCustomAddLineButtonRow(lineType, colspan),
    ].join('');
  }

  function renderCustomLineDraftRow(type, colspan) {
    const draft = state.customLineDraft || createCustomLineDraft(type);
    const status = draft.error || '';
    const showSupplier = customLineShowsSupplier(type);

    return `
      <tr class="db-custom-line-edit-row" data-custom-line-type="${escapeAttr(type)}">
        <td class="db-row-selector db-line-delete-cell">
          <button class="db-line-delete-button" type="button" data-db-custom-line-action="cancel" data-db-line-type="${escapeAttr(type)}" aria-label="Delete unsaved line item" title="Delete unsaved line item">X</button>
        </td>
        <td class="db-row-selector"></td>
        <td><input class="db-custom-line-input" data-custom-line-field="line_description" value="${escapeAttr(draft.line_description)}"></td>
        ${showSupplier ? `<td><input class="db-custom-line-input" data-custom-line-field="supplier_name" value="${escapeAttr(draft.supplier_name)}"></td>` : ''}
        <td><input class="db-custom-line-input db-line-money" data-custom-line-field="unit_cost" value="${escapeAttr(draft.unit_cost)}"></td>
        <td><input class="db-custom-line-input db-line-money" data-custom-line-field="unit_price" value="${escapeAttr(draft.unit_price)}"></td>
        <td><input class="db-custom-line-input db-line-qty" data-custom-line-field="quantity" inputmode="numeric" value="${escapeAttr(draft.quantity)}"></td>
        <td><input class="db-custom-line-input db-line-vat" data-custom-line-field="vatPercent" inputmode="decimal" value="${escapeAttr(draft.vatPercent)}"></td>
      </tr>
      ${status ? `<tr class="db-add-line-status-row"><td colspan="${colspan}">${escapeHtml(status)}</td></tr>` : ''}
    `;
  }

  function startCustomLineDraft(type) {
    const lineType = normalizeCustomLineType(type);
    if (!lineType) return;
    resetLineDraftState();
    state.customLineDraft = createCustomLineDraft(lineType);
    renderItemsPanel();
    window.requestAnimationFrame(() => {
      const input = els.itemsPanel.querySelector(`[data-custom-line-type="${lineType}"] [data-custom-line-field="line_description"]`);
      input?.focus();
    });
  }

  function cancelCustomLineDraft() {
    resetCustomLineDraftState();
    renderItemsPanel();
  }

  function resetCustomLineDraftState() {
    state.customLineDraft = null;
  }

  function createCustomLineDraft(type) {
    return {
      type: normalizeCustomLineType(type) || 'nonstock',
      line_description: '',
      supplier_name: '',
      unit_cost: '',
      unit_price: '',
      quantity: '1',
      vatPercent: '20.00',
      saving: false,
      error: '',
    };
  }

  function handleCustomLineDraftInput(event) {
    const field = event.target.dataset.customLineField;
    if (!field || !state.customLineDraft) return;
    const row = event.target.closest('[data-custom-line-type]');
    if (!row || row.dataset.customLineType !== state.customLineDraft.type) return;
    state.customLineDraft[field] = event.target.value;
    if (isChildrensClothingLineItem(state.customLineDraft)) {
      state.customLineDraft.vatPercent = '0.00';
    }
    state.customLineDraft.error = '';
    window.requestAnimationFrame(applyNonStockTableLayout);
  }

  function handleCustomLineDraftKeydown(event) {
    if (!state.customLineDraft || !event.target.dataset.customLineField) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelCustomLineDraft();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      saveCustomLineDraft();
    }
  }

  function handleCustomLineDraftFocusOut(event) {
    if (!state.customLineDraft) return;
    const row = event.target.closest('[data-custom-line-type]');
    if (!row || row.dataset.customLineType !== state.customLineDraft.type) return;
    const nextTarget = event.relatedTarget;
    if (nextTarget && row.contains(nextTarget)) return;

    window.setTimeout(() => {
      if (!state.customLineDraft || els.itemsPanel.querySelector('[data-custom-line-type]:focus-within')) return;
      if (isBlankCustomLineDraft(state.customLineDraft)) {
        cancelCustomLineDraft();
        return;
      }
      saveCustomLineDraft();
    }, 0);
  }

  function isBlankCustomLineDraft(draft) {
    if (!draft) return true;
    return !String(draft.line_description || '').trim()
      && !String(draft.supplier_name || '').trim()
      && !String(draft.unit_cost || '').trim()
      && !String(draft.unit_price || '').trim()
      && isDefaultDraftValue(draft.quantity, '1')
      && isDefaultDraftValue(draft.vatPercent, '20.00');
  }

  async function saveCustomLineDraft() {
    const draft = state.customLineDraft;
    if (!draft || draft.saving) return;

    if (!draft.line_description.trim()) {
      draft.error = 'Line description is required';
      renderItemsPanel();
      return;
    }

    draft.saving = true;
    draft.error = '';
    renderItemsPanel();

    try {
      const data = await fetchJson(`/api/database/jobs/${encodeURIComponent(state.selectedJob.source_order_id)}/line-items/custom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          line_type: draft.type,
          line_description: draft.line_description,
          supplier_name: draft.supplier_name,
          unit_cost: lineNumber(draft.unit_cost),
          unit_price: lineNumber(draft.unit_price),
          quantity: lineInteger(draft.quantity, 1),
          vat_rate: lineVatRate(draft.vatPercent),
        }),
      });

      state.selectedLineItems = data.lineItems || state.selectedLineItems;
      if (state.selectedJob) {
        state.selectedJob.line_item_count = state.selectedLineItems.length;
        state.selectedJob.total_quantity = state.selectedLineItems.reduce((total, item) => total + Number(item.quantity || 0), 0);
      }
      resetCustomLineDraftState();
      renderItemsPanel();
      renderOutstandingOrders();
    } catch (err) {
      if (!state.customLineDraft) return;
      state.customLineDraft.saving = false;
      state.customLineDraft.error = err.message || 'Failed to add line item';
      renderItemsPanel();
    }
  }

  function renderPositionRow(position, index) {
    const sourceId = position.source_order_position_id || '';
    const designKey = sourceId ? `id:${sourceId}` : `new:${index}`;
    const hasValue = designPositionHasValue(position);
    return `
      <tr class="db-design-row" data-position-id="${escapeAttr(sourceId)}" data-design-key="${escapeAttr(designKey)}">
        <td class="db-row-selector db-design-delete-cell">${hasValue ? renderDesignDeleteButton(designKey) : ''}</td>
        <td class="db-row-selector db-design-drag-cell">${hasValue ? renderDesignDragButton() : ''}</td>
        <td><textarea class="db-design-edit" data-design-field="position_name">${escapeHtml(position.position_name || '')}</textarea></td>
        <td><textarea class="db-design-edit" data-design-field="colour_notes">${escapeHtml(position.colour_notes || '')}</textarea></td>
        <td><textarea class="db-design-edit" data-design-field="design_ref">${escapeHtml(position.design_ref || '')}</textarea></td>
      </tr>
    `;
  }

  function renderDesignDeleteButton(designKey) {
    return `<button class="db-line-delete-button" type="button" data-db-design-delete="${escapeAttr(designKey)}" aria-label="Delete design row" title="Delete design row">X</button>`;
  }

  function renderDesignDragButton() {
    return '<button class="db-line-drag-handle" type="button" data-db-design-drag="true" aria-label="Reorder design row">&#9654;</button>';
  }

  function designPositionHasValue(position) {
    return Boolean(
      String(position?.position_name || '').trim()
      || String(position?.colour_notes || '').trim()
      || String(position?.design_ref || '').trim()
    );
  }

  function handleDesignInput(event) {
    const row = event.target.closest('.db-design-row');
    if (!row || !event.target.closest('.db-design-edit')) return;
    syncDesignRowControls(row);
    ensureTrailingBlankDesignRow();
    state.designDirty = true;
    scheduleDesignAutosave();
  }

  function handleDesignFocusOut(event) {
    const row = event.target.closest('.db-design-row');
    if (!row || !event.target.closest('.db-design-edit')) return;
    const nextTarget = event.relatedTarget;
    if (nextTarget && row.contains(nextTarget)) return;

    window.setTimeout(() => {
      if (!row.isConnected || row.matches(':focus-within')) return;
      removeBlankUnsavedDesignRow(row);
    }, 0);
  }

  function ensureTrailingBlankDesignRow() {
    const rows = Array.from(els.designPanel.querySelectorAll('.db-design-row'));
    const last = rows[rows.length - 1];
    if (!last || !designRowHasValue(last)) return;
    const tbody = last.parentElement;
    tbody.insertAdjacentHTML('beforeend', renderPositionRow({}, rows.length));
  }

  function ensureDesignTableHasEntryRow() {
    const tbody = els.designPanel.querySelector('.db-design-table tbody');
    if (!tbody) return;
    const rows = Array.from(tbody.querySelectorAll('.db-design-row'));
    if (rows.length) return;
    tbody.insertAdjacentHTML('beforeend', renderPositionRow({}, 0));
  }

  function designRowHasValue(row) {
    return ['position_name', 'colour_notes', 'design_ref'].some((field) => {
      const input = row.querySelector(`[data-design-field="${field}"]`);
      return input && input.value.trim();
    });
  }

  function syncDesignRowControls(row) {
    const hasValue = designRowHasValue(row);
    const deleteCell = row.querySelector('.db-design-delete-cell');
    const dragCell = row.querySelector('.db-design-drag-cell');
    if (deleteCell) deleteCell.innerHTML = hasValue ? renderDesignDeleteButton(row.dataset.designKey || '') : '';
    if (dragCell) dragCell.innerHTML = hasValue ? renderDesignDragButton() : '';
  }

  function removeBlankUnsavedDesignRow(row) {
    const sourceId = Number.parseInt(row.dataset.positionId, 10);
    if (Number.isFinite(sourceId) || designRowHasValue(row)) return;

    const tbody = row.parentElement;
    const rows = Array.from(tbody?.querySelectorAll('.db-design-row') || []);
    if (rows.length <= 1) return;
    row.remove();
  }

  function collectDesignPositions() {
    return Array.from(els.designPanel.querySelectorAll('.db-design-row'))
      .map((row, index) => {
        const sourceId = Number.parseInt(row.dataset.positionId, 10);
        return {
          source_order_position_id: Number.isFinite(sourceId) ? sourceId : null,
          position_sort_order: index + 1,
          position_name: designFieldValue(row, 'position_name'),
          colour_notes: designFieldValue(row, 'colour_notes'),
          design_ref: designFieldValue(row, 'design_ref'),
        };
      })
      .filter((position) => position.position_name || position.colour_notes || position.design_ref);
  }

  function designFieldValue(row, field) {
    return row.querySelector(`[data-design-field="${field}"]`)?.value.trim() || '';
  }

  function designSignature(positions) {
    return JSON.stringify(positions.map((position) => ({
      source_order_position_id: position.source_order_position_id || null,
      position_sort_order: position.position_sort_order || null,
      position_name: position.position_name || '',
      colour_notes: position.colour_notes || '',
      design_ref: position.design_ref || '',
    })));
  }

  function markDesignOrderDirty() {
    state.designDirty = true;
    scheduleDesignAutosave();
  }

  function scheduleDesignAutosave() {
    clearTimeout(designAutosaveTimer);
    designAutosaveTimer = window.setTimeout(() => {
      flushOrderAutosaves();
    }, DESIGN_AUTOSAVE_MS);
  }

  async function flushDesignAutosave(options = {}) {
    clearTimeout(designAutosaveTimer);
    if (!state.designDirty || !state.selectedJob?.source_order_id) return;
    await saveDesignPositions(options);
  }

  async function saveDesignPositions(options = {}) {
    const positions = collectDesignPositions();
    const signature = designSignature(positions);
    if (signature === state.designLastSavedSignature) {
      state.designDirty = false;
      return true;
    }

    if (state.designSaving) {
      state.designSaveQueued = true;
      return false;
    }

    state.designSaving = true;
    const endpoint = `/api/database/jobs/${encodeURIComponent(state.selectedJob.source_order_id)}/positions`;
    const body = JSON.stringify({ positions });

    try {
      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: Boolean(options.keepalive),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) {
          window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search + window.location.hash)}`);
          return;
        }
        throw new Error(data.error || `Request failed: ${response.status}`);
      }

      const hadNewRows = positions.some((position) => !position.source_order_position_id);
      state.selectedPositions = data.positions || positions;
      state.designDirty = false;
      state.designLastSavedSignature = designSignature(state.selectedPositions);
      if (hadNewRows) renderDesignPanel();
      return true;
    } catch (err) {
      state.designDirty = true;
      console.error('Design autosave failed', err);
      return false;
    } finally {
      state.designSaving = false;
      if (state.designSaveQueued) {
        state.designSaveQueued = false;
        scheduleDesignAutosave();
      }
    }
  }

  function resetDesignAutosaveState() {
    clearTimeout(designAutosaveTimer);
    state.designDirty = false;
    state.designSaving = false;
    state.designSaveQueued = false;
    state.designLastSavedSignature = '[]';
  }

  function renderSmallItemBox(title, items, type) {
    const lineType = normalizeCustomLineType(type);
    return `
      <div class="db-small-item-box">
        <div class="db-custom-table-scroll" data-db-item-scroll>
          <table class="db-legacy-table db-mobile-card-table">
            <thead>
              <tr>
                <th class="db-row-selector"></th>
                <th class="db-row-selector"></th>
                <th>${escapeHtml(title)}</th>
                <th>Cost:</th>
                <th>Price:</th>
                <th>Qty:</th>
                <th>VAT:</th>
              </tr>
            </thead>
            <tbody>
              ${renderCustomSectionRows(items, lineType, 7, (item) => `
                <tr class="db-line-row db-custom-line-row" data-line-id="${escapeAttr(item.source_order_item_id || '')}">
                  ${renderLineDeleteCell(item.source_order_item_id || '')}
                  <td class="db-row-selector">
                    <button class="db-line-drag-handle" type="button" data-db-line-drag="true" aria-label="Reorder line item">&#9654;</button>
                  </td>
                  <td>${renderLineItemInput(item, 'line_description')}</td>
                  <td>${renderLineItemInput(item, 'unit_cost', 'db-line-money')}</td>
                  <td>${renderLineItemInput(item, 'unit_price', 'db-line-money')}</td>
                  <td>${renderLineItemInput(item, 'quantity', 'db-line-qty')}</td>
                  <td>${renderLineItemInput(item, 'vatPercent', 'db-line-vat')}</td>
                </tr>
              `)}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function showView(name, options = {}) {
    const previousView = state.activeView;
    if (!options.skipHistory && state.activeView && state.activeView !== name) {
      state.viewHistory.push(state.activeView);
      if (state.viewHistory.length > 20) state.viewHistory.shift();
    }
    state.activeView = name;

    els.views.forEach((view) => {
      view.classList.toggle('active', view.id === `db-${name}-view`);
    });
    els.stage?.classList.toggle('db-view-home', name === 'home');
    els.stage?.classList.toggle('db-view-order', name === 'order');
    els.stage?.classList.toggle('db-reports-active', name === 'reports');
    els.stage?.classList.toggle('db-visuals-active', name === 'visuals');
    els.stage?.classList.toggle('db-new-customer-active', name === 'new-customer');
    els.root?.classList.toggle('db-reports-expanded', name === 'reports');
    els.root?.classList.toggle('db-visuals-expanded', name === 'visuals');
    els.databaseTab?.classList.toggle('db-tall-view-active', name === 'reports' || name === 'visuals');
    els.root?.classList.toggle('db-new-customer-expanded', name === 'new-customer');
    if (name !== 'visuals') closeDatabaseVisualModal();
    if (name !== 'order') {
      els.stage?.classList.remove('db-order-items-active');
      els.root?.classList.remove('db-order-items-expanded');
    }

    els.mainTabs.forEach((tab) => {
      const active = (name === 'home' || name === 'new-order' || name === 'new-customer' || name === 'new-contact' || name === 'customers' || name === 'customer' || name === 'styles' || name === 'visuals' || name === 'to-invoice' || name === 'stock-ordering' || name === 'users' || name === 'reports' || name === 'dtf-admin')
        ? tab.dataset.dbGo === 'home'
        : tab.dataset.dbGo === 'outstanding';
      tab.classList.toggle('active', active);
    });
    syncOrderItemsExpansion();
    if (name === 'reports' && previousView !== name && els.databaseTab) {
      els.databaseTab.scrollTop = 0;
    }
    if (!options.skipPersistence) persistDatabaseRoute();
  }

  function goBackDatabaseView() {
    const previous = state.viewHistory.pop();
    if (!previous || previous === state.activeView) {
      showHome({ skipHistory: true });
      return;
    }

    if (previous === 'home') {
      showHome({ skipHistory: true });
      return;
    }

    showView(previous, { skipHistory: true });
    setFooterTitle(titleForView(previous));
  }

  function titleForView(name) {
    if (name === 'new-order') return 'New Order';
    if (name === 'new-customer') return 'New Customer';
    if (name === 'new-contact') return 'Add Contact';
    if (name === 'customers') return 'Customers';
    if (name === 'customer') return 'Customer';
    if (name === 'styles') return 'Styles';
    if (name === 'visuals') return 'Visuals';
    if (name === 'users') return 'Users';
    if (name === 'dtf-admin') return 'Lami DTF';
    if (name === 'reports') return 'Analytics & Reports';
    if (name === 'to-invoice') return 'To Invoice';
    if (name === 'stock-ordering') return 'Stock Ordering';
    if (name === 'outstanding') return state.orderMode === 'all' ? 'All Orders' : 'Open Orders';
    if (name === 'order') return 'Open Orders';
    return 'Main Menu';
  }

  function setFooterTitle(title) {
    if (els.footerTitle) els.footerTitle.textContent = title;
  }

  function syncOrderItemsExpansion() {
    const expanded = state.activeView === 'order' && state.activeOrderTab === 'items';
    els.stage?.classList.toggle('db-order-items-active', expanded);
    els.root?.classList.toggle('db-order-items-expanded', expanded);
  }

  function clampNumber(value, min, max) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return min;
    return Math.min(max, Math.max(min, numeric));
  }

  function detailRow(label, controlHtml) {
    return `
      <div class="db-form-row">
        <label>${escapeHtml(label)}</label>
        <div class="db-form-control">${controlHtml}</div>
      </div>
    `;
  }

  function inputBox(value, className = '') {
    return `<input class="db-legacy-input ${className}" readonly value="${escapeAttr(value || '')}">`;
  }

  function editableJobInput(field, value, className = '') {
    return `<input class="db-legacy-input ${className}" data-db-job-field="${escapeAttr(field)}" autocomplete="off" value="${escapeAttr(value || '')}">`;
  }

  function orderAddressSelect(role, currentValue) {
    const addresses = customerAddressChoicesForRole(state.orderCustomerDetail, role, currentValue);
    const selectedAddress = String(currentValue || addresses[0]?.address || '').trim();
    const options = addresses.length ? [] : ['<option value=""></option>'];
    addresses.forEach((address, index) => {
      const selected = normalizeOrderAckText(address.address) === normalizeOrderAckText(selectedAddress);
      options.push(`
        <option
          value="${escapeAttr(address.address || '')}"
          data-address-index="${escapeAttr(index)}"
          ${selected ? 'selected' : ''}
        >${escapeHtml(addressOptionLabel(address))}</option>
      `);
    });
    return `
      <select
        class="db-address-select"
        data-db-address-select="${escapeAttr(role)}"
        data-address-choices="${escapeAttr(JSON.stringify(addresses))}"
      >${options.join('')}</select>
    `;
  }

  function selectBox(value, className = '') {
    return `<select class="${className}" disabled><option>${escapeHtml(value || '')}</option></select>`;
  }

  async function saveOrderAddressSelection(select) {
    if (!select || select.dataset.addressSaving === 'true') return;
    const role = select.dataset.dbAddressSelect === 'delivery' ? 'delivery' : 'invoice';
    const sourceOrderId = state.selectedJob?.source_order_id;
    if (!sourceOrderId) return;

    const address = selectedAddressFromSelect(select) || { address: select.value, source_address_id: null };
    const payload = role === 'delivery'
      ? {
        delivery_address: address.address || '',
        delivery_address_id: address.source_address_id || null,
      }
      : {
        invoice_address: address.address || '',
        invoice_address_id: address.source_address_id || null,
      };

    select.dataset.addressSaving = 'true';
    select.disabled = true;
    select.classList.remove('db-line-item-error');

    try {
      const data = await fetchJson(`/api/database/jobs/${encodeURIComponent(sourceOrderId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      state.selectedJob = { ...state.selectedJob, ...data.job };
      updateOutstandingJob(state.selectedJob);
      renderOutstandingOrders();
      state.jobLastSavedSignature = jobSignature(state.selectedJob);
    } catch (err) {
      select.classList.add('db-line-item-error');
      window.alert(`Failed to update ${role === 'delivery' ? 'delivery' : 'invoice'} address: ${err.message || 'Unknown error'}`);
      renderDetailsPanel();
    } finally {
      delete select.dataset.addressSaving;
      if (select.isConnected) select.disabled = false;
    }
  }

  function customerOpenButton(job) {
    const key = customerKeyForRecord({
      customer_id: job.customer_id,
      business_name: job.customer_name,
    });
    const disabled = key ? '' : ' disabled';
    return `<button class="db-customer-open-button db-control-link" type="button" data-db-customer-open="${escapeAttr(key)}"${disabled}>${escapeHtml(job.customer_name || '')}</button>`;
  }

  function customerKeyForRecord(customer) {
    const explicitKey = String(customer?.customer_key || '').trim();
    if (explicitKey) return explicitKey;
    const id = Number.parseInt(customer?.customer_id, 10);
    if (Number.isFinite(id)) return String(id);
    const name = String(customer?.business_name || '').trim();
    return name ? `name:${name}` : '';
  }

  function setSelectValue(select, value) {
    if (!select) return;
    select.innerHTML = `<option>${escapeHtml(value || '')}</option>`;
  }

  function renderStatusRow(message, colspan = OUTSTANDING_TABLE_COLUMN_COUNT) {
    return `<tr><td colspan="${colspan}" class="db-empty-cell">${escapeHtml(message)}</td></tr>`;
  }

  function renderItemEmptyRow(colspan) {
    return `<tr class="db-gray-fill"><td colspan="${colspan}"></td></tr>`;
  }

  function renderCheck(value) {
    return `<input class="db-tiny-check" type="checkbox" disabled ${truthy(value) ? 'checked' : ''}>`;
  }

  function isBusinessGiftOrder(job) {
    return categoryForJob(job || {}) === 'gifts';
  }

  function customLineShowsSupplier(type) {
    return normalizeCustomLineType(type) === 'nonstock' && isBusinessGiftOrder(state.selectedJob);
  }

  function categoryForJob(job) {
    const type = `${job.order_type || ''} ${job.order_type_abbr || ''}`.toLowerCase();
    const abbr = String(job.order_type_abbr || '').trim().toLowerCase();
    const isPrint = type.includes('print') || abbr === 'p' || abbr === 'pe' || abbr === 'ep';
    const isEmbroidery = type.includes('embro') || /\bemb\b/.test(type) || abbr === 'e' || abbr === 'pe' || abbr === 'ep';
    if (type.includes('gift') || abbr === 'g') return 'gifts';
    if (isPrint && isEmbroidery) return 'print_embroidery';
    if (isEmbroidery) return 'embroidery';
    if (isPrint) return 'print';
    return 'other';
  }

  function typeAbbr(job) {
    if (job.order_type_abbr) return job.order_type_abbr;
    const category = categoryForJob(job);
    if (category === 'gifts') return 'G';
    if (category === 'print_embroidery') return 'PE';
    if (category === 'embroidery') return 'E';
    if (category === 'print') return 'P';
    return '';
  }

  function typeLabel(job) {
    const category = categoryForJob(job);
    if (category === 'gifts') return 'Business gifts';
    if (category === 'print_embroidery') return 'Print + Emb';
    if (category === 'embroidery') return 'Embroidery';
    if (category === 'print') return 'Printing';
    return '';
  }

  function normalizeOrderTypeOption(value) {
    const clean = String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!clean) return '';
    if (clean.includes('gift')) return 'Business Gifts';
    const isPrint = clean.includes('print');
    const isEmbroidery = clean.includes('embro') || /\bemb\b/.test(clean);
    if (isPrint && isEmbroidery) return 'Print + Emb';
    if (isEmbroidery) return 'Embroidery';
    if (isPrint) return 'Printing';
    return '';
  }

  function orderTypeAbbreviation(orderType) {
    const normalized = normalizeOrderTypeOption(orderType);
    if (normalized === 'Business Gifts') return 'G';
    if (normalized === 'Print + Emb') return 'PE';
    if (normalized === 'Embroidery') return 'E';
    if (normalized === 'Printing') return 'P';
    return '';
  }

  function isReady(job) {
    return truthy(job.has_artwork)
      || truthy(job.has_screens)
      || Boolean(job.screen_numbers)
      || truthy(job.has_shirts)
      || truthy(job.is_printed);
  }

  function isStockItem(item) {
    return !truthy(item.is_non_deliverable)
      && !truthy(item.is_internal)
      && Boolean(item.source_product_id || item.style_code || item.style_name);
  }

  function isNonStockItem(item) {
    return !truthy(item.is_non_deliverable) && !truthy(item.is_internal) && !isStockItem(item);
  }

  function normalizeCustomLineType(value) {
    const clean = String(value || '').trim().toLowerCase();
    if (clean === 'nonstock' || clean === 'non-stock') return 'nonstock';
    if (clean === 'nondelivery' || clean === 'non-delivery' || clean === 'non-deliverable') return 'nondelivery';
    if (clean === 'internal') return 'internal';
    return '';
  }

  function staffShort(value) {
    if (!value) return '';
    const clean = String(value).trim();
    if (/^\d+$/.test(clean)) return clean.slice(0, 2);
    const initials = clean.split(/\s+/).map((part) => part[0]).join('');
    return initials.slice(0, 2).toUpperCase();
  }

  function staffLabel(value) {
    if (!value) return '';
    const clean = String(value).trim();
    return /^\d+$/.test(clean) ? `Staff ${clean}` : clean;
  }

  function outstandingTakenByFirstName(job) {
    if (!job) return '';
    return accountManagerFirstNameById(job.order_owner_user_id)
      || accountManagerFirstNameFromText(job.order_owner_name)
      || accountManagerFirstNameFromText(job.order_taken_by);
  }

  function accountManagerUsers() {
    if (Array.isArray(state.customerUsers) && state.customerUsers.length) return state.customerUsers;
    return Array.isArray(state.registeredUsers) ? state.registeredUsers : [];
  }

  function accountManagerFirstNameById(userId) {
    const numericId = Number(userId);
    if (!Number.isFinite(numericId)) return '';
    const user = accountManagerUsers().find((item) => Number(item?.id) === numericId);
    return accountManagerUserFirstName(user);
  }

  function accountManagerFirstNameFromText(value) {
    const clean = String(value || '').trim();
    if (!clean || /^\d+$/.test(clean)) return '';

    const firstName = clean.split(/\s+/)[0] || '';
    const normalizedFirstName = normalizeAccountManagerName(firstName);
    if (!normalizedFirstName) return '';

    const user = accountManagerUsers().find((item) => (
      normalizeAccountManagerName(accountManagerUserFirstName(item)) === normalizedFirstName
    ));
    return accountManagerUserFirstName(user);
  }

  function accountManagerUserFirstName(user) {
    const firstName = String(user?.first_name || '').trim();
    if (firstName) return firstName.split(/\s+/)[0] || '';

    const fullName = String(user?.full_name || '').trim();
    return fullName ? (fullName.split(/\s+/)[0] || '') : '';
  }

  function normalizeAccountManagerName(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  function takenByLabel(job) {
    return staffLabel(job?.order_taken_by || job?.order_owner_name || job?.trace_staff_id);
  }

  function jobOwnerLabel(job) {
    return staffLabel(job?.order_owner_name || job?.order_taken_by || job?.trace_staff_id);
  }

  function orderByLabel(job) {
    const owner = staffLabel(job?.order_owner_name);
    const takenBy = takenByLabel(job);
    if (owner && takenBy && owner !== takenBy) return `${owner} / ${takenBy}`;
    return owner || takenBy;
  }

  function formatDate(value, style) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = style === 'short'
      ? String(date.getFullYear()).slice(-2)
      : String(date.getFullYear());
    return `${day}/${month}/${year}`;
  }

  function validDateOrNow(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? new Date() : date;
  }

  function formatDateTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    const datePart = formatDate(value, 'short');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${datePart} ${hours}:${minutes}`;
  }

  function formatLegacyInputDate(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    return `${day}/${month}/${year}`;
  }

  function legacyInputDateToIso(value) {
    const clean = String(value || '').trim();
    const legacy = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
    if (!legacy) return clean;
    const day = legacy[1].padStart(2, '0');
    const month = legacy[2].padStart(2, '0');
    let year = Number.parseInt(legacy[3], 10);
    if (year < 100) year += 2000;
    return `${String(year).padStart(4, '0')}-${month}-${day}`;
  }

  function addDays(date, days) {
    const copy = new Date(date.getTime());
    copy.setDate(copy.getDate() + days);
    return copy;
  }

  function dateTime(value) {
    if (!value) return Number.MAX_SAFE_INTEGER;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? Number.MAX_SAFE_INTEGER : date.getTime();
  }

  function formatCurrency(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '';
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
    }).format(number);
  }

  function formatMoneyInput(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '';
    return number.toFixed(2);
  }

  function formatVat(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '';
    const percent = number > 0 && number <= 1 ? number * 100 : number;
    return `${percent.toFixed(2)}%`;
  }

  function formatVatInput(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '';
    const percent = number > 0 && number <= 1 ? number * 100 : number;
    return percent.toFixed(2);
  }

  function formatNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return String(value || '0');
    return new Intl.NumberFormat('en-GB').format(number);
  }

  function truthy(value) {
    return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
  }

  function unique(values) {
    return Array.from(new Set(values));
  }

  async function fetchJson(url, options = {}) {
    const response = await fetch(url, { cache: 'no-store', credentials: 'include', ...options });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) {
        window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search + window.location.hash)}`);
      }
      throw new Error(payload.error || `Request failed: ${response.status}`);
    }
    return payload;
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#096;');
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
})();
