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
  const OUTSTANDING_TABLE_COLUMN_COUNT = 9;
  const OUTSTANDING_ALL_TABLE_COLUMN_COUNT = 10;
  const OUTSTANDING_INVOICE_COLUMN_WIDTH = 98;
  const TO_INVOICE_TABLE_COLUMN_COUNT = 7;
  const OUTSTANDING_STATUS_COLUMN_WIDTH = 128;
  const OUTSTANDING_TABLE_FIXED_WIDTH = 19 + 68 + 198 + 36 + 65 + 88 + 82 + OUTSTANDING_STATUS_COLUMN_WIDTH;
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
  const INVOICE_SUMMARY_MM = 32;
  const OUTSTANDING_REPORT_PAGE_CONTENT_MAX_MM = 220;
  const OUTSTANDING_REPORT_GROUP_HEADER_MM = 7;
  const OUTSTANDING_REPORT_TABLE_HEADER_MM = 7;
  const OUTSTANDING_REPORT_ROW_BASE_MM = 6.2;
  const OUTSTANDING_REPORT_ROW_EXTRA_LINE_MM = 3.4;
  const OUTSTANDING_REPORT_TITLE_CHARS_PER_LINE = 36;
  const OUTSTANDING_REPORT_CUSTOMER_CHARS_PER_LINE = 31;
  const CHILD_PRODUCT_TITLE_PATTERN = /\b(kids?|children'?s?|childrens?|child|youth|junior|juniors?|boys?|girls?)\b/i;
  const CHILD_YOUTH_SIZE_PATTERN = /\bY(?:XS|S|M|L|XL|XXL)\b/i;
  const CHILD_AGE_RANGE_SIZE_PATTERN = /\b(?:[1-9]|1[0-8])\s*[-\u2010-\u2015]\s*(?:[1-9]|1[0-8])\b/;
  const CHILD_TODDLER_SIZE_PATTERN = /\b[2-5]T\b/i;
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
    orderLoadToken: 0,
    orderLoadComplete: false,
    orderSearchQuery: '',
    visibleOrderLimit: PAGE_LIMIT,
    loadingCustomers: false,
    loadedCustomers: false,
    databaseCustomers: [],
    databaseCustomerQuery: '',
    activeGroup: 'all',
    activeSort: 'order',
    activeView: 'home',
    viewHistory: [],
    activeOrderTab: 'details',
    activeCustomerTab: 'orders',
    newOrderSubmitting: false,
    newCustomerSubmitting: false,
    newContactSubmitting: false,
    selectedCustomer: null,
    newOrderCustomerDetail: null,
    customerResults: [],
    selectedCustomerDetail: null,
    orderCustomerDetail: null,
    selectedCustomerOrders: [],
    selectedCustomerContacts: [],
    selectedCustomerAddresses: [],
    selectedCustomerDesignNumbers: [],
    customerUsers: [],
    loadedCustomerUsers: false,
    registeredUsers: [],
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
    customLineDraft: null,
    lineDeleteTarget: null,
    lineDeleteSaving: false,
    designDeleteTarget: null,
    designDeleteSaving: false,
    closeOrderTarget: null,
    closeOrderSaving: false,
    currentUser: null,
    activeDocumentType: 'order-ack',
    documentGeneratedAt: null,
    outstandingReportSnapshot: null,
    dashboardStatusColors: {},
  };

  let els = {};
  let customerSearchTimer = 0;
  let databaseCustomerSearchTimer = 0;
  let productSearchTimer = 0;
  let customerSearchRequest = 0;
  let databaseCustomerRequest = 0;
  let productSearchRequest = 0;
  let designAutosaveTimer = 0;
  let jobAutosaveTimer = 0;
  let contactAutosaveTimer = 0;
  let lineOrderAutosaveTimer = 0;
  let orderSearchTimer = 0;
  let outstandingScrollFrame = 0;
  let outstandingLayoutFrame = 0;
  let outstandingTitleMeasureCanvas = null;
  let lineItemMeasureCanvas = null;
  let lineDrag = null;
  const lineTextScrollAnimations = new WeakMap();

  document.addEventListener('DOMContentLoaded', initDatabaseHub);

  function initDatabaseHub() {
    els = {
      root: document.getElementById('db-legacy-app'),
      stage: document.querySelector('#db-legacy-app .db-legacy-stage'),
      sideTab: document.querySelector('.nav-tabs li[data-tab="database"]'),
      homeButton: document.getElementById('db-home-button'),
      mainTabs: Array.from(document.querySelectorAll('.db-main-tab')),
      views: Array.from(document.querySelectorAll('#db-legacy-app .db-view')),
      homeCountPrinting: document.getElementById('db-count-printing'),
      homeCountEmbroidery: document.getElementById('db-count-embroidery'),
      homeCountGifts: document.getElementById('db-count-gifts'),
      customersSearch: document.getElementById('db-customers-search'),
      customersBody: document.getElementById('db-customers-body'),
      customerName: document.getElementById('db-customer-name'),
      customerCode: document.getElementById('db-customer-code'),
      customerAccountManager: document.getElementById('db-customer-account-manager'),
      customerCreatedAt: document.getElementById('db-customer-created-at'),
      customerUpdatedAt: document.getElementById('db-customer-updated-at'),
      customerUpdatedBy: document.getElementById('db-customer-updated-by'),
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
      usersTable: document.getElementById('db-users-table'),
      usersBody: document.getElementById('db-users-body'),
      orderSearch: document.getElementById('db-order-search'),
      selectOrder: document.getElementById('db-select-order'),
      footerTitle: document.getElementById('db-footer-title'),
      orderTitle: document.getElementById('db-order-job-title'),
      orderNumber: document.getElementById('db-order-number'),
      createdAt: document.getElementById('db-created-at'),
      updatedAt: document.getElementById('db-updated-at'),
      updatedBy: document.getElementById('db-updated-by'),
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

    els.root.addEventListener('click', handleRootClick);
    els.outstandingBody.addEventListener('click', handleOutstandingRowClick);
    els.outstandingBody.addEventListener('keydown', handleOutstandingRowKeydown);
    els.toInvoiceBody?.addEventListener('click', handleToInvoiceRowClick);
    els.toInvoiceBody?.addEventListener('keydown', handleToInvoiceRowKeydown);
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
    els.customersSearch.addEventListener('input', handleDatabaseCustomerSearchInput);
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
    document.addEventListener('pointermove', handleLineDragPointerMove);
    document.addEventListener('pointerup', handleLineDragPointerUp);
    document.addEventListener('pointercancel', handleLineDragPointerUp);
    document.addEventListener('keydown', handleOrderAckKeydown);
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
        if (!state.loadedHome) loadHomeMetrics();
      });
    }
    window.ultimateHubOpenDatabaseOrder = openDatabaseOrderFromDashboard;
    document.addEventListener('ultimatehub:user', (event) => setCurrentUser(event.detail));
    if (window.ultimateHubUser) setCurrentUser(window.ultimateHubUser);
    window.ultimateHubUserPromise?.then((user) => {
      if (user) setCurrentUser(user);
    });

    const params = new URLSearchParams(window.location.search);
    if (params.get('tab') === 'database' || window.location.hash === '#database') {
      els.sideTab?.click();
    } else if (document.getElementById('tab-database')?.classList.contains('active')) {
      loadHomeMetrics();
    }
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
    if (action === 'users') {
      await flushOrderAutosaves();
      showUsers();
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
        loadOutstandingOrders({ force: false });
        return;
      }
      renderOutstandingOrders();
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

    const distanceFromBottom = els.outstandingFrame.scrollHeight
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

  function showNewOrder() {
    showView('new-order');
    setFooterTitle('New Order');
    resetNewOrderForm();
  }

  function showNewCustomer() {
    showView('new-customer');
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

  function showCustomers() {
    showView('customers');
    setFooterTitle('Customers');
    loadDatabaseCustomers({ force: false });
  }

  function showToInvoice() {
    showView('to-invoice');
    setFooterTitle('To Invoice');
    loadToInvoiceJobs({ force: true });
  }

  function showUsers() {
    showView('users');
    setFooterTitle('Users');
    loadRegisteredUsers({ force: true });
  }

  function setCurrentUser(user) {
    state.currentUser = user || null;
    updateNewOrderTakenBy();
    populateNewCustomerAccountManagers();
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
    const form = els.newOrderForm;
    const fields = form.elements;
    const valid = Boolean(
      fields.customer_name.value.trim()
      && fields.order_type.value.trim()
      && fields.job_title.value.trim()
      && fields.order_date.value.trim()
      && fields.delivery_date.value.trim()
      && fields.invoice_required.value.trim()
    );
    els.newOrderAccept.disabled = !valid || state.newOrderSubmitting;
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

    const invoiceAddress = formatCustomerAddress(customer, 'inv') || customer.business_name || '';
    const deliveryAddress = formatCustomerAddress(customer, 'ship') || invoiceAddress;
    populateNewOrderCustomerChoices({
      contactName: customer.contact_name || '',
      deliveryAddress: deliveryAddress || '',
      invoiceAddress: invoiceAddress || deliveryAddress || '',
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
    const addresses = customerAddressChoices(state.newOrderCustomerDetail, fallbackAddress);
    if (addresses.length) {
      return sortAddressChoicesForRole(addresses, role);
    }

    const selected = state.selectedCustomer || {};
    const directAddress = role === 'invoice'
      ? (fallbackAddress || selected.invoice_address)
      : (fallbackAddress || selected.delivery_address);
    return directAddress ? [normalizeCustomerAddress({ address: directAddress, address_type: role })] : [];
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
    const options = ['<option value=""></option>'];
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

  function sortAddressChoicesForRole(addresses, role) {
    const wanted = role === 'invoice' ? 'invoice' : 'delivery';
    return [...addresses].sort((a, b) => {
      const aScore = addressRoleScore(a, wanted);
      const bScore = addressRoleScore(b, wanted);
      if (aScore !== bScore) return aScore - bScore;
      return String(a.address || '').localeCompare(String(b.address || ''), 'en', { sensitivity: 'base' });
    });
  }

  function addressRoleScore(address, wanted) {
    const type = String(address?.address_type || '').toLowerCase();
    if (wanted === 'invoice' && type.includes('invoice')) return 0;
    if (wanted === 'delivery' && type.includes('delivery')) return 0;
    if (type.includes('address')) return 1;
    return 2;
  }

  function addressOptionLabel(address) {
    const label = String(address.address || '').replace(/\s*,\s*/g, ', ');
    return address.address_type ? `${address.address_type}: ${label}` : label;
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
    if (els.newOrderAccept.disabled) return;

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
    clearTimeout(databaseCustomerSearchTimer);
    databaseCustomerSearchTimer = window.setTimeout(() => {
      loadDatabaseCustomers({ force: true });
    }, CUSTOMER_SEARCH_DELAY);
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
    const row = event.target.closest('tr[data-job-id]');
    if (!row) return;
    await flushOrderAutosaves();
    openOrder(row.dataset.jobId, 'details');
  }

  async function handleCustomerOrderRowKeydown(event) {
    if (event.key !== 'Enter') return;
    const row = event.target.closest('tr[data-job-id]');
    if (!row) return;
    await flushOrderAutosaves();
    openOrder(row.dataset.jobId, 'details');
  }

  async function loadDatabaseCustomers(options = {}) {
    const query = els.customersSearch.value.trim();
    state.databaseCustomerQuery = query;

    if (state.loadedCustomers && !options.force && state.databaseCustomers.length) {
      renderDatabaseCustomers();
      return;
    }

    const requestId = ++databaseCustomerRequest;
    state.loadingCustomers = true;
    els.customersBody.innerHTML = renderStatusRow('Loading customers', 8);

    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      const suffix = params.toString() ? `?${params.toString()}` : '';
      const data = await fetchJson(`/api/database/customers${suffix}`);
      if (requestId !== databaseCustomerRequest) return;
      state.databaseCustomers = data.customers || [];
      state.loadedCustomers = true;
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

  async function openCustomer(customerKey, tab) {
    if (!customerKey) return;
    state.activeCustomerTab = tab || 'orders';
    showView('customer');
    setFooterTitle('Customer');
    setCustomerLoading();
    showCustomerTab(state.activeCustomerTab);

    try {
      const [data] = await Promise.all([
        fetchJson(`/api/database/customers/${encodeURIComponent(customerKey)}`),
        ensureCustomerUsers(),
      ]);
      state.selectedCustomerDetail = data.customer || {};
      state.selectedCustomerOrders = data.orders || [];
      state.selectedCustomerContacts = data.contacts || [];
      state.selectedCustomerAddresses = data.addresses || [];
      state.selectedCustomerDesignNumbers = data.designNumbers || [];
      renderCustomerPage();
      showCustomerTab(state.activeCustomerTab);
    } catch (err) {
      renderCustomerError(err.message);
    }
  }

  function setCustomerLoading() {
    resetContactAutosaveState();
    state.selectedCustomerDetail = null;
    state.selectedCustomerOrders = [];
    state.selectedCustomerContacts = [];
    state.selectedCustomerAddresses = [];
    state.selectedCustomerDesignNumbers = [];
    els.customerName.value = 'Loading...';
    els.customerCode.value = '';
    setCustomerAccountManagerOptions(null, true);
    els.customerCreatedAt.textContent = '-';
    els.customerUpdatedAt.textContent = '-';
    els.customerUpdatedBy.textContent = '-';
    els.customerOrdersBody.innerHTML = renderStatusRow('Loading customer orders', 14);
    els.customerContactsBody.innerHTML = '<div class="db-panel-message">Loading contacts</div>';
    els.customerAddressesBody.innerHTML = '<div class="db-panel-message">Loading addresses</div>';
    if (els.customerDesignNumbersBody) els.customerDesignNumbersBody.innerHTML = renderStatusRow('Loading design numbers', 6);
  }

  function renderCustomerError(message) {
    resetContactAutosaveState();
    els.customerName.value = 'Customer unavailable';
    els.customerCode.value = '';
    setCustomerAccountManagerOptions(null, true);
    els.customerCreatedAt.textContent = '-';
    els.customerUpdatedAt.textContent = '-';
    els.customerUpdatedBy.textContent = '-';
    els.customerOrdersBody.innerHTML = renderStatusRow(message, 14);
    els.customerContactsBody.innerHTML = `<div class="db-panel-message">${escapeHtml(message)}</div>`;
    els.customerAddressesBody.innerHTML = `<div class="db-panel-message">${escapeHtml(message)}</div>`;
    if (els.customerDesignNumbersBody) els.customerDesignNumbersBody.innerHTML = renderStatusRow(message, 6);
  }

  function renderCustomerPage() {
    const customer = state.selectedCustomerDetail || {};
    els.customerName.value = customer.business_name || '';
    els.customerCode.value = customer.customer_code || '';
    setCustomerAccountManagerOptions(customer, false);
    els.customerCreatedAt.textContent = formatDateTime(customer.created_at_source);
    els.customerUpdatedAt.textContent = formatDateTime(customer.updated_at_source);
    els.customerUpdatedBy.textContent = staffLabel(customer.updated_by) || '-';
    renderCustomerOrders();
    renderCustomerContacts();
    renderCustomerAddresses();
    renderCustomerDesignNumbers();
  }

  async function ensureCustomerUsers() {
    if (state.loadedCustomerUsers) return state.customerUsers;

    try {
      const data = await fetchJson('/api/database/users');
      state.customerUsers = Array.isArray(data.users) ? data.users : [];
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
      els.usersBody.innerHTML = renderStatusRow('Loading users', 4);
    }

    try {
      const data = await fetchJson('/api/database/users');
      const users = Array.isArray(data.users) ? data.users : [];
      state.registeredUsers = users;
      state.customerUsers = users;
      state.loadedCustomerUsers = true;
      state.usersLoaded = true;
      renderRegisteredUsers();
    } catch (err) {
      state.usersLoaded = false;
      if (els.usersBody) {
        els.usersBody.innerHTML = renderStatusRow(err.message || 'Failed to load users', 4);
      }
    } finally {
      state.usersLoading = false;
    }
  }

  function renderRegisteredUsers() {
    if (!els.usersBody) return;
    const users = state.registeredUsers || [];
    if (!users.length) {
      els.usersBody.innerHTML = renderStatusRow('No registered users', 4);
      return;
    }
    els.usersBody.innerHTML = users.map(renderRegisteredUserRow).join('');
  }

  function renderRegisteredUserRow(user) {
    return `
      <tr>
        <td>${escapeHtml(user.full_name || [user.first_name, user.last_name].filter(Boolean).join(' ') || '-')}</td>
        <td>${escapeHtml(user.email || '')}</td>
        <td>${escapeHtml(formatDate(user.created_at, 'long'))}</td>
        <td><button class="db-user-remove-button" type="button" data-db-user-remove="${escapeAttr(user.id || '')}">Remove</button></td>
      </tr>
    `;
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
      els.customerOrdersBody.innerHTML = renderStatusRow('No orders recorded for this customer', 14);
      return;
    }

    els.customerOrdersBody.innerHTML = orders.map(renderCustomerOrderRow).join('');
  }

  function renderCustomerOrderRow(order, index) {
    return `
      <tr class="db-customer-order-row" data-job-id="${escapeAttr(order.source_order_id || '')}" tabindex="0">
        <td class="db-row-selector">${index === 0 ? '&#9654;' : ''}</td>
        <td class="db-order-link">${escapeHtml(order.order_no || '')}</td>
        <td>${escapeHtml(order.client_order_no || '')}</td>
        <td class="db-type-cell db-type-${categoryForJob(order)}">${escapeHtml(typeAbbr(order))}</td>
        <td>${escapeHtml(order.contact_name || '')}</td>
        <td>${escapeHtml(order.job_title || '')}</td>
        <td>${escapeHtml(staffShort(order.order_taken_by || order.trace_staff_id))}</td>
        <td>${escapeHtml(formatDate(order.order_date, 'long'))}</td>
        <td>${escapeHtml(formatDate(order.complete_date, 'long'))}</td>
        <td>${renderCheck(order.has_artwork)}</td>
        <td>${renderCheck(truthy(order.has_screens) || Boolean(order.screen_numbers))}</td>
        <td>${renderCheck(order.has_shirts)}</td>
        <td>${renderCheck(order.is_reorder)}</td>
        <td>${renderCheck(order.customer_supplied)}</td>
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
        ${renderCustomerAddressBox('Invoice address (default):', invoiceAddress)}
        ${renderCustomerAddressBox('Delivery address (default):', deliveryAddress)}
      </div>
    `;
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

  function renderCustomerAddressBox(title, address) {
    const fields = customerAddressFields(address || blankCustomerAddress(''));
    return `
      <section class="db-customer-address-box">
        <h3>${escapeHtml(title)}</h3>
        <div class="db-customer-address-inner">
          ${customerAddressInputRow('Address 1:', fields.address_line1)}
          ${customerAddressInputRow('Address 2:', fields.address_line2)}
          ${customerAddressInputRow('Address 3:', fields.address_line3)}
          ${customerAddressInputRow('Address 4:', fields.address_line4)}
          ${customerAddressInputRow('Address 5:', fields.address_line5)}
          ${customerAddressInputRow('Postcode:', fields.postcode, 'postcode')}
          ${customerAddressInputRow('Tel:', fields.phone, 'tel')}
          ${customerAddressInputRow('Fax:', fields.fax, 'tel')}
        </div>
      </section>
    `;
  }

  function customerAddressInputRow(label, value, size = '') {
    return `
      <label class="db-customer-address-row ${size ? `db-customer-address-row-${escapeAttr(size)}` : ''}">
        <span>${escapeHtml(label)}</span>
        <input readonly value="${escapeAttr(value || '')}">
      </label>
    `;
  }

  function customerAddressFields(address) {
    const fallback = splitCustomerAddress(address?.address || '');
    return {
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
    };
  }

  function splitCustomerAddress(value) {
    return String(value || '')
      .split(/\r?\n|,\s*/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 6);
  }

  function showCustomerTab(tab) {
    state.activeCustomerTab = tab || 'orders';
    els.customerTabs.forEach((button) => {
      button.classList.toggle('active', button.dataset.dbCustomerTab === state.activeCustomerTab);
    });
    els.customerPanels.forEach((panel) => {
      panel.classList.toggle('active', panel.id === `db-customer-${state.activeCustomerTab}-panel`);
    });
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
      renderToInvoiceJobs();
      return;
    }

    state.toInvoiceLoading = true;
    state.toInvoiceLoaded = false;
    state.toInvoiceJobs = [];
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
        <td>${escapeHtml(job.invoice_no || '')}</td>
      </tr>
    `;
  }

  async function loadOutstandingOrders(options = {}) {
    const mode = state.orderMode;
    if (state.loadingOrders && state.loadedOrderMode === mode && !options.force) {
      renderOutstandingOrders();
      return;
    }
    if (state.outstandingJobs.length && state.loadedOrderMode === mode && !options.force) {
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
      const result = await fetchJobsPage(mode, 0, { includeTotal: true });
      if (!isCurrentOrderLoad(token, mode)) return;

      state.outstandingJobs = result.jobs;
      state.outstandingTotal = result.total;
      renderOutstandingOrders();
      hydrateOrderSelectors();
      if (result.hasMore) {
        loadRemainingJobs(mode, result.nextOffset, token);
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

  async function loadRemainingJobs(mode, offset, token) {
    let nextOffset = offset;

    try {
      while (isCurrentOrderLoad(token, mode) && nextOffset < state.outstandingTotal) {
        const result = await fetchJobsPage(mode, nextOffset, { includeTotal: false });
        if (!isCurrentOrderLoad(token, mode)) return;
        if (!result.jobs.length) break;

        state.outstandingJobs.push(...result.jobs);
        nextOffset = result.nextOffset;
        await yieldOrderLoad(BACKGROUND_LOAD_DELAY_MS);
      }
    } catch (err) {
      if (isCurrentOrderLoad(token, mode)) {
        console.error('Background order load failed', err);
      }
    } finally {
      if (!isCurrentOrderLoad(token, mode)) return;
      state.loadingOrders = false;
      state.orderLoadComplete = true;
    }
  }

  async function fetchJobsPage(mode, offset, options = {}) {
    const includeTotal = options.includeTotal !== false;
    const params = new URLSearchParams({
      limit: String(PAGE_LIMIT),
      offset: String(offset),
    });
    if (!includeTotal) params.set('includeTotal', 'false');
    if (mode !== 'all') params.set('status', 'open');
    if (mode === 'all' && state.orderSearchQuery) params.set('q', state.orderSearchQuery);

    const data = await fetchJson(`/api/database/jobs?${params.toString()}`);
    storeDashboardStatusColors(data.dashboardStatusColors);
    const jobs = data.jobs || [];
    const limit = data.limit || PAGE_LIMIT;
    const nextOffset = offset + limit;
    const total = Number.isFinite(Number(data.total))
      ? Number(data.total)
      : Math.max(state.outstandingTotal || 0, offset + jobs.length);
    return {
      jobs,
      total,
      nextOffset,
      hasMore: jobs.length > 0 && nextOffset < total,
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

    const frameWidth = els.outstandingFrame?.clientWidth || 0;
    const measuredTitleWidth = measureOutstandingTitleWidth(table, jobs);
    const desiredTitleWidth = Math.ceil(Math.max(
      OUTSTANDING_TITLE_COLUMN_MIN_WIDTH,
      measuredTitleWidth + OUTSTANDING_TITLE_CELL_EXTRA_WIDTH
    ));
    const fixedWidth = outstandingTableFixedWidth();
    const maxTitleWidth = frameWidth > fixedWidth
      ? Math.max(OUTSTANDING_TITLE_COLUMN_MIN_WIDTH, frameWidth - fixedWidth - 2)
      : desiredTitleWidth;
    const titleWidth = Math.min(desiredTitleWidth, maxTitleWidth);
    const tableWidth = fixedWidth + titleWidth;

    table.style.setProperty('--db-outstanding-title-width', `${titleWidth}px`);
    table.style.setProperty('--db-outstanding-table-width', `${tableWidth}px`);
  }

  function syncOutstandingTableMode() {
    els.outstandingTable?.classList.toggle('db-all-orders-mode', state.orderMode === 'all');
  }

  function outstandingTableColumnCount() {
    return state.orderMode === 'all' ? OUTSTANDING_ALL_TABLE_COLUMN_COUNT : OUTSTANDING_TABLE_COLUMN_COUNT;
  }

  function outstandingTableFixedWidth() {
    return OUTSTANDING_TABLE_FIXED_WIDTH + (state.orderMode === 'all' ? OUTSTANDING_INVOICE_COLUMN_WIDTH : 0);
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
        <td>${escapeHtml(staffShort(job.order_taken_by || job.trace_staff_id))}</td>
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

  async function openOrder(id, tab) {
    state.activeOrderTab = tab || 'details';
    const sourceView = state.activeView;
    showView('order');
    setFooterTitle(sourceView === 'to-invoice' ? 'To Invoice' : 'Open Orders');
    setOrderLoading();

    try {
      const data = await fetchJson(`/api/database/jobs/${encodeURIComponent(id)}`);
      state.selectedJob = data.job || {};
      state.selectedLineItems = data.lineItems || [];
      state.selectedPositions = data.positions || [];
      state.selectedProofFiles = normalizeDatabaseProofFiles(data.proofFiles || []);
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
    }
  }

  async function loadOrderForDocument(id) {
    const data = await fetchJson(`/api/database/jobs/${encodeURIComponent(id)}`);
    state.selectedJob = data.job || {};
    state.selectedLineItems = data.lineItems || [];
    state.selectedPositions = data.positions || [];
    state.selectedProofFiles = normalizeDatabaseProofFiles(data.proofFiles || []);
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
    syncOrderDocumentButtons(null);
    els.orderTitle.value = 'Loading...';
    els.orderNumber.value = '';
    els.createdAt.textContent = '-';
    els.updatedAt.textContent = '-';
    els.updatedBy.textContent = '-';
    els.detailsPanel.innerHTML = '<div class="db-panel-message">Loading order details</div>';
    els.itemsPanel.innerHTML = '';
    els.designPanel.innerHTML = '';
    if (els.proofPanel) els.proofPanel.innerHTML = '';
  }

  function renderOrderError(message) {
    resetDesignAutosaveState();
    resetJobAutosaveState();
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
    els.createdAt.textContent = formatDateTime(job.created_at_source);
    els.updatedAt.textContent = formatDateTime(job.updated_at_source);
    els.updatedBy.textContent = orderByLabel(job);

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

  function showOrderTab(tab) {
    state.activeOrderTab = tab;
    els.orderTabs.forEach((button) => {
      button.classList.toggle('active', button.dataset.dbOrderTab === tab);
    });
    [
      ['details', els.detailsPanel],
      ['items', els.itemsPanel],
      ['design', els.designPanel],
      ['proof', els.proofPanel],
    ].forEach(([key, panel]) => {
      panel?.classList.toggle('active', key === tab);
    });
    syncOrderItemsExpansion();
    if (tab === 'proof') queueRenderDatabaseProofFile();
  }

  function renderDetailsPanel() {
    const job = state.selectedJob || {};
    els.detailsPanel.innerHTML = `
      <div class="db-details-layout">
        <div class="db-detail-box db-customer-box">
          ${detailRow('Customer:', `${customerOpenButton(job)}<input class="db-legacy-input db-code-input" readonly value="${escapeAttr(job.customer_code || '')}">`)}
          ${detailRow('Contact:', inputBox(job.contact_name))}
          ${detailRow('Order type:', inputBox(job.order_type || typeLabel(job)))}
          ${detailRow('Taken by:', inputBox(takenByLabel(job)))}
          ${detailRow('Delivery:', inputBox(job.delivery_method))}
          ${detailRow('Order date:', inputBox(formatDate(job.order_date, 'short')))}
          ${detailRow('Delivery:', `${inputBox(formatDate(job.delivery_date, 'short'), 'db-delivery-date-field')}<label class="db-inline-check">${renderCheck(job.customer_date_required)} Customer date</label>`)}
          ${detailRow('Invoice date:', manualInvoiceDateControl(job))}
          ${detailRow('Completion', inputBox(formatDate(job.complete_date, 'short'), 'db-completion-date-field'))}
        </div>
        ${renderOrderApprovedMark(job)}

        <div class="db-detail-box db-address-box">
          ${detailRow('Invoice to:', orderAddressSelect('invoice', job.invoice_address || job.customer_name))}
          ${detailRow('Deliver to:', orderAddressSelect('delivery', job.delivery_address || job.customer_name))}
        </div>

        <div class="db-detail-box db-payment-box">
          ${detailRow('Payment:', selectBox(job.payment_terms))}
          ${detailRow('Client ref:', inputBox(job.client_order_no || job.contact_name || ''))}
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

  function handleDetailsPanelChange(event) {
    if (event.target?.matches?.('[data-db-manual-invoice-date]')) {
      syncManualInvoiceDateInput(event.target.checked);
      return;
    }
    if (event.target?.matches?.('[data-db-address-select]')) {
      saveOrderAddressSelection(event.target);
    }
  }

  function handleDetailsPanelInput(event) {
    if (!event.target?.matches?.('[data-db-job-field="comments"]')) return;
    if (!state.selectedJob?.source_order_id) return;
    state.selectedJob.comments = event.target.value;
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
          <table class="db-legacy-table db-items-table">
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
              <table class="db-legacy-table db-nonstock-table ${showNonStockSupplier ? 'has-supplier' : ''}">
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
          <table class="db-legacy-table db-design-table">
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
            <span>Proof:</span>
            <input class="db-legacy-input db-proof-name-field" readonly value="${escapeAttr(currentFile?.name || '')}">
            <span class="db-proof-file-count">${escapeHtml(fileCount)}</span>
          </div>
          <div class="db-proof-viewer" data-db-proof-viewer>
            <div class="db-panel-message">${files.length ? 'Loading proof file' : 'No proof PDFs attached in the Test Dashboard proof column'}</div>
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
    updateDatabaseProofControls(true);

    if (!file) {
      setDatabaseProofViewerMessage('No proof PDFs attached in the Test Dashboard proof column');
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
    setDatabaseProofViewerMessage('Rendering page...');
    updateDatabaseProofControls(true);

    const page = await viewer.pdf.getPage(viewer.pageNumber);
    if (token !== viewer.renderToken) return;
    const baseViewport = page.getViewport({ scale: 1 });
    const availableWidth = Math.max(300, (body.clientWidth || 860) - 26);
    const scale = Math.min(1.75, Math.max(0.65, availableWidth / baseViewport.width));
    const viewport = page.getViewport({ scale });
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

    if (nameField) nameField.value = file?.name || '';
    if (fileCount) fileCount.textContent = files.length ? `${viewer.fileIndex + 1} of ${files.length}` : '';
    if (pageStatus) pageStatus.textContent = `Page ${viewer.pageNumber || 1} / ${viewer.pageCount || 1}`;
    if (pageControls) pageControls.hidden = !isDatabasePdfFile(file);
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

  function renderOutstandingReportDocument() {
    const snapshot = state.outstandingReportSnapshot || buildOutstandingReportSnapshot();
    const pages = buildOutstandingReportPages(snapshot.groups);
    return pages.map((page, index) => (
      renderOutstandingReportPage(snapshot, page, index)
    )).join('');
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
        <td>${escapeHtml(staffShort(job.order_taken_by || job.trace_staff_id))}</td>
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
    } else {
      state.outstandingJobs = state.outstandingJobs.filter((job) => (
        Number(job.source_order_id) !== sourceOrderId
      ));
    }
    state.toInvoiceJobs = state.toInvoiceJobs.filter((job) => (
      Number(job.source_order_id) !== sourceOrderId
    ));

    els.updatedAt.textContent = formatDateTime(state.selectedJob.updated_at_source);
    els.updatedBy.textContent = orderByLabel(state.selectedJob);
    renderDetailsPanel();
    renderOutstandingOrders();
    renderToInvoiceJobs();
    hydrateOrderSelectors();
    syncOrderDocumentButtons(state.selectedJob);
    loadHomeMetrics();
    return state.selectedJob;
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

  function handleOrderAckModalClick(event) {
    const modal = document.getElementById('db-order-ack-modal');
    if (!modal || modal.hidden) return;

    if (event.target === modal) {
      closeOrderAcknowledgement();
      return;
    }

    const button = event.target.closest('button');
    if (!button || !modal.contains(button)) return;

    if (button.dataset.dbAckClose) {
      closeOrderAcknowledgement();
      return;
    }

    if (button.dataset.dbAckPrint || button.dataset.dbAckDownload) {
      printDatabaseDocument();
    }
  }

  function handleOrderAckKeydown(event) {
    if (event.key !== 'Escape') return;
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

  function printOrderAcknowledgement() {
    printDatabaseDocument();
  }

  function printDatabaseDocument() {
    const modal = document.getElementById('db-order-ack-modal');
    if (!modal || modal.hidden) return;

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

  function orderAckPdfFilename() {
    return databaseDocumentPdfFilename('order-ack');
  }

  function databaseDocumentPdfFilename(type = state.activeDocumentType) {
    const job = state.selectedJob || {};
    const documentType = databaseDocumentType(type);
    if (documentType === 'outstanding-orders') return outstandingReportPdfFilename();
    const documentNo = documentType === 'invoice' ? invoiceDocumentNo(job) : job.order_no;
    const orderNo = String(documentNo || job.source_order_id || '').trim();
    const config = databaseDocumentConfig(type);
    return `${orderNo ? `${orderNo} - ` : ''}${config.filenameTitle}`;
  }

  function outstandingReportPdfFilename() {
    return state.outstandingReportSnapshot?.filenameTitle
      || DATABASE_DOCUMENTS['outstanding-orders'].filenameTitle;
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
  }

  function invoiceNotRequired(job) {
    const value = job?.invoice_required;
    const clean = String(value ?? '').trim().toLowerCase();
    return value === false || value === 0 || clean === 'false' || clean === '0' || clean === 'no';
  }

  function invoiceDocumentNo(job) {
    if (invoiceNotRequired(job)) return '';
    return job?.invoice_no || '';
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
    if (documentType === 'invoice') return renderInvoiceDocument();
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
        ${invoiceLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}
      </section>
      <section class="db-order-ack-meta" aria-label="Order acknowledgement details">
        ${orderAckMetaRow('ULT ref:', job.order_no)}
        ${orderAckMetaRow('Your ref:', yourRef)}
        ${orderAckMetaRow('Order date:', formatDate(job.order_date, 'full'))}
        ${orderAckMetaRow('Order taken by:', takenByLabel(job))}
        ${orderAckMetaRow('Order value:', formatCurrency(totals.gross))}
        ${orderAckMetaRow('Delivery address:', deliveryDisplay.map((line) => escapeHtml(line)).join('<br>'), { html: true })}
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

  function renderInvoiceDocument() {
    const job = state.selectedJob || {};
    const items = orderDocumentLineItems('invoice');
    const totals = orderAckTotals(items);
    const generatedAt = currentDatabaseDocumentDate();
    const invoiceLines = orderAckAddressLines(job.invoice_address, job.customer_name);
    const deliveryLines = String(job.delivery_address || '').trim()
      ? orderAckAddressLines(job.delivery_address, job.customer_name)
      : [];
    const deliverySameAsInvoice = !deliveryLines.length || sameOrderAckAddress(invoiceLines, deliveryLines);
    const deliveryDisplay = deliverySameAsInvoice ? ['(as above)'] : deliveryLines;
    const context = {
      type: 'invoice',
      title: 'INVOICE',
      job,
      items,
      totals,
      addressLines: invoiceLines,
      metaRows: [
        { label: 'Invoice No.', value: invoiceDocumentNo(job) },
        { label: 'Cust ref:', value: job.client_order_no || '' },
        { label: 'ULT Ref:', value: job.order_no || job.source_order_id || '' },
        { label: 'VAT No.:', value: ULTIMATE_VAT_NUMBER },
        { label: 'Invoice date:', value: formatDate(generatedAt, 'full') },
        { label: 'Payment terms:', value: job.payment_terms || '' },
        { label: 'Delivery address:', value: deliveryDisplay.map((line) => escapeHtml(line)).join('<br>'), html: true },
      ],
    };
    const pages = buildOrderDocumentPages({ items, summaryHeightMm: INVOICE_SUMMARY_MM });
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
      showSignature: true,
      metaRows: [
        { label: 'Invoice No', value: invoiceDocumentNo(job) },
        { label: 'Your ref:', value: deliveryNoteYourRef(job) },
        { label: 'Order date:', value: formatDate(job.order_date || job.created_at_source, 'full') },
        { label: 'Delivery date:', value: formatDate(generatedAt, 'full') },
        { label: 'Order taken by:', value: jobOwnerLabel(job) },
      ],
    };
    const pages = buildOrderDocumentPages({ items });
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
    return type === 'invoice' ? ORDER_ACK_FOOTER_URL : ORDER_ACK_NO_BANK_FOOTER_URL;
  }

  function renderOrderDocumentPageHeader(context) {
    return `
      <header class="db-order-ack-header db-order-doc-header">
        <h1>${escapeHtml(context.title)}</h1>
        <img class="db-order-ack-logo" src="${escapeAttr(ORDER_ACK_LOGO_URL)}" alt="Ultimate logo" crossorigin="anonymous">
      </header>
      <section class="db-order-doc-address">
        ${(context.addressLines || []).map((line) => `<div>${escapeHtml(line)}</div>`).join('')}
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
    if (context.type === 'invoice') {
      return `
        ${pageContent.itemEntries.length || pageContent.showEmptyItems
          ? renderInvoiceItemsTable(pageContent.itemEntries, { empty: pageContent.showEmptyItems })
          : ''}
        ${pageContent.showSummary ? renderInvoiceSummary(context.items, context.totals) : ''}
      `;
    }

    return pageContent.itemEntries.length || pageContent.showEmptyItems
      ? renderDeliveryNoteItemsTable(pageContent.itemEntries, { empty: pageContent.showEmptyItems })
      : '';
  }

  function orderDocumentMetaRow(row) {
    const content = row.html ? (row.value || '') : escapeHtml(row.value || row.value === 0 ? row.value : '');
    return `
      <div class="db-order-ack-meta-row">
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
    return `
      <table class="db-order-doc-items db-invoice-items">
        <thead>
          <tr>
            <th>Stock item #</th>
            <th>Description</th>
            <th>Size</th>
            <th>Colour</th>
            <th>Qty</th>
            <th>Price</th>
            <th>Total</th>
            <th>VAT</th>
            <th>Rate</th>
          </tr>
        </thead>
        <tbody>
          ${options.empty ? '<tr><td colspan="9" class="db-order-ack-empty">No invoice line items</td></tr>' : ''}
          ${entries.map(renderInvoiceItemEntry).join('')}
        </tbody>
      </table>
    `;
  }

  function renderInvoiceItemEntry(entry) {
    if (entry.type === 'gap') return '<tr class="db-order-ack-item-gap"><td colspan="9"></td></tr>';
    return renderInvoiceItemRow(entry.item);
  }

  function renderInvoiceItemRow(item) {
    const quantity = orderAckQuantity(item);
    const price = orderAckNumber(item.unit_price);
    const net = orderAckLineNet(item);
    const vat = orderAckLineVat(item);
    return `
      <tr class="db-order-ack-item-row">
        <td>${escapeHtml(orderDocumentItemCode(item))}</td>
        <td>${escapeHtml(orderDocumentItemDescription(item))}</td>
        <td>${escapeHtml(item.size || '')}</td>
        <td>${escapeHtml(item.colour || '')}</td>
        <td>${escapeHtml(formatNumber(quantity))}</td>
        <td>${Number.isFinite(price) ? escapeHtml(formatCurrency(price)) : ''}</td>
        <td>${Number.isFinite(price) ? escapeHtml(formatCurrency(net)) : ''}</td>
        <td>${Number.isFinite(price) ? escapeHtml(formatCurrency(vat)) : ''}</td>
        <td>${escapeHtml(formatVat(effectiveLineVatRate(item)))}</td>
      </tr>
    `;
  }

  function renderDeliveryNoteItemsTable(entries, options = {}) {
    return `
      <table class="db-order-doc-items db-delivery-note-items">
        <thead>
          <tr>
            <th>Stock item #</th>
            <th>Description</th>
            <th>Size</th>
            <th>Colour</th>
            <th>Qty</th>
          </tr>
        </thead>
        <tbody>
          ${options.empty ? '<tr><td colspan="5" class="db-order-ack-empty">No delivery note line items</td></tr>' : ''}
          ${entries.map(renderDeliveryNoteItemEntry).join('')}
        </tbody>
      </table>
    `;
  }

  function renderDeliveryNoteItemEntry(entry) {
    if (entry.type === 'gap') return '<tr class="db-order-ack-item-gap"><td colspan="5"></td></tr>';
    return renderDeliveryNoteItemRow(entry.item);
  }

  function renderDeliveryNoteItemRow(item) {
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

  function invoiceTotalRow(label, value) {
    return `
      <div class="db-invoice-total-row">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(formatCurrency(value))}</strong>
      </div>
    `;
  }

  function buildOrderDocumentPages({ items, summaryHeightMm = 0 }) {
    const pages = [];
    let page = emptyOrderDocumentPageContent();
    let usedMm = 0;

    const pushPage = () => {
      pages.push(page);
      page = emptyOrderDocumentPageContent();
      usedMm = 0;
    };
    const ensureSpace = (heightMm) => {
      if (usedMm > 0 && usedMm + heightMm > ORDER_DOC_PAGE_CONTENT_MAX_MM) pushPage();
    };

    const itemEntries = orderDocumentItemEntries(items);
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

  function orderDocumentItemEntries(items) {
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
          heightMm: orderDocumentItemRowHeight(item),
        });
      }
      hasPreviousRows = true;
    }

    return entries;
  }

  function orderDocumentItemRowHeight(item) {
    const description = orderDocumentItemDescription(item);
    const lineCount = Math.max(1, Math.ceil(description.length / ORDER_DOC_ITEM_CHARS_PER_LINE));
    return ORDER_DOC_ITEM_ROW_BASE_MM + ((lineCount - 1) * ORDER_DOC_ITEM_ROW_EXTRA_LINE_MM);
  }

  function orderDocumentLineItems(type) {
    const items = orderAckLineItems();
    if (type === 'invoice') return items.filter((item) => !truthy(item.is_internal));
    if (type === 'delivery-note') {
      return items.filter((item) => (
        !truthy(item.is_internal)
        && !truthy(item.is_non_deliverable)
      ));
    }
    return items;
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
      <div class="db-order-ack-meta-row">
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
      pages.length === 0 ? ORDER_ACK_FIRST_PAGE_CONTENT_MAX_MM : ORDER_ACK_CONTINUATION_PAGE_CONTENT_MAX_MM
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

    return entries;
  }

  function orderAckItemRowHeight(item) {
    const description = orderAckItemDescription(item);
    const lineCount = Math.max(1, Math.ceil(description.length / ORDER_ACK_ITEM_CHARS_PER_LINE));
    return ORDER_ACK_ITEM_ROW_BASE_MM + ((lineCount - 1) * ORDER_ACK_ITEM_ROW_EXTRA_LINE_MM);
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
    return `
      <input
        class="db-line-item-input ${escapeAttr(className)}"
        data-line-item-field="${escapeAttr(field)}"
        data-line-item-original="${escapeAttr(value)}"
        value="${escapeAttr(value)}"
      >
    `;
  }

  function renderStockVariantSelect(item, field) {
    const lineId = item?.source_order_item_id || '';
    const styleId = Number.parseInt(item?.style_id, 10);
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
    if (field === 'quantity') return formatNumber(item.quantity || 0);
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
        <td class="db-row-selector db-line-delete-cell"></td>
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
    state.lineDraft = createLineDraft();
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

  function createLineDraft() {
    return {
      codeQuery: '',
      styleQuery: '',
      selectedStyleId: null,
      variants: [],
      productId: null,
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
    if (!product?.source_product_id) {
      renderItemsPanel();
      return;
    }

    if (String(product.source_product_id) === String(item.source_product_id || '')) return;
    await saveStockVariantSelection(select, lineItemId, product);
  }

  async function saveStockVariantSelection(select, lineItemId, product) {
    if (!select || !Number.isFinite(lineItemId) || !product?.source_product_id) return;
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
          body: JSON.stringify({ source_product_id: product.source_product_id }),
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
      .map((item) => Number.parseInt(item.style_id, 10))
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
    const cached = getCachedStyleVariants(styleId);
    if (cached.length) return cached;
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
    const params = new URLSearchParams({ field, q: query || '' });

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
    draft.selectedStyleId = Number.parseInt(product.style_id, 10);
    draft.codeQuery = product.style_code || '';
    draft.styleQuery = product.style_name || '';
    draft.variants = [];
    draft.productId = null;
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
    return uniqueVariantOptions(products.length ? products : (draft?.variants || []), variantSizeValue, 'size');
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

  function variantColourValue(product) {
    if (!product) return '';
    if (product.colour_id !== null && product.colour_id !== undefined) return `id:${product.colour_id}`;
    return product.colour ? `name:${product.colour}` : '';
  }

  function variantSizeValue(product) {
    if (!product) return '';
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
          source_product_id: product.source_product_id,
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
    const payload = {
      job_title: els.orderTitle.value.trim(),
      comments: commentsInput ? commentsInput.value : (state.selectedJob?.comments || ''),
    };
    const signature = jobSignature(payload);

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
      els.updatedAt.textContent = formatDateTime(state.selectedJob.updated_at_source);
      els.updatedBy.textContent = orderByLabel(state.selectedJob);
      updateOutstandingJob(state.selectedJob);
      renderOutstandingOrders();
      hydrateOrderSelectors();
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
      comments: job?.comments || '',
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
        <td class="db-row-selector db-line-delete-cell"></td>
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
          <table class="db-legacy-table">
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
    els.stage?.classList.toggle('db-new-customer-active', name === 'new-customer');
    els.root?.classList.toggle('db-new-customer-expanded', name === 'new-customer');
    if (name !== 'order') {
      els.stage?.classList.remove('db-order-items-active');
      els.root?.classList.remove('db-order-items-expanded');
    }

    els.mainTabs.forEach((tab) => {
      const active = (name === 'home' || name === 'new-order' || name === 'new-customer' || name === 'new-contact' || name === 'customers' || name === 'customer' || name === 'to-invoice' || name === 'users')
        ? tab.dataset.dbGo === 'home'
        : tab.dataset.dbGo === 'outstanding';
      tab.classList.toggle('active', active);
    });
    syncOrderItemsExpansion();
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
    if (name === 'users') return 'Users';
    if (name === 'to-invoice') return 'To Invoice';
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

  function orderAddressSelect(role, currentValue) {
    const addresses = sortAddressChoicesForRole(
      customerAddressChoices(state.orderCustomerDetail, currentValue),
      role
    );
    const selectedAddress = String(currentValue || '').trim();
    const options = ['<option value=""></option>'];
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
    if (selectedAddress && !addresses.some((address) => normalizeOrderAckText(address.address) === normalizeOrderAckText(selectedAddress))) {
      options.push(`<option value="${escapeAttr(selectedAddress)}" selected>${escapeHtml(selectedAddress)}</option>`);
    }
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
