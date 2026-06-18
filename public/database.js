(function () {
  const PAGE_LIMIT = 100;
  const MAX_JOBS = 2500;
  const CUSTOMER_SEARCH_DELAY = 180;
  const PRODUCT_SEARCH_DELAY = 180;
  const DESIGN_AUTOSAVE_MS = 5000;
  const JOB_AUTOSAVE_MS = DESIGN_AUTOSAVE_MS;
  const CONTACT_AUTOSAVE_MS = DESIGN_AUTOSAVE_MS;
  const LINE_ORDER_AUTOSAVE_MS = 3500;
  const ORDER_ACK_LOGO_URL = 'https://res.cloudinary.com/dhlqooyuk/image/upload/v1781699668/ultimate_logo_imyxvr.png';
  const ORDER_ACK_FOOTER_URL = 'https://res.cloudinary.com/dhlqooyuk/image/upload/v1781779546/LETTERHEAD_INFO_pxmlak.png';
  const ORDER_ACK_PAGE_CONTENT_MAX_MM = 96;
  const ORDER_ACK_TABLE_TOP_MM = 6;
  const ORDER_ACK_TABLE_HEADER_MM = 5.5;
  const ORDER_ACK_EMPTY_ROW_MM = 12;
  const ORDER_ACK_GAP_ROW_MM = 3;
  const ORDER_ACK_ITEM_ROW_BASE_MM = 6.8;
  const ORDER_ACK_ITEM_ROW_EXTRA_LINE_MM = 3.4;
  const ORDER_ACK_ITEM_CHARS_PER_LINE = 48;
  const ORDER_ACK_SUMMARY_MM = 22;
  const ORDER_ACK_POSITIONS_TOP_MM = 6;
  const ORDER_ACK_POSITIONS_HEADER_MM = 7;
  const ORDER_ACK_POSITION_ROW_MM = 7;
  const ORDER_ACK_COMMENTS_TOP_MM = 6;
  const ORDER_ACK_COMMENTS_BASE_MM = 11;
  const ORDER_ACK_COMMENTS_LINE_MM = 4.2;
  const ORDER_ACK_COMMENTS_CHARS_PER_LINE = 95;

  const state = {
    loadedHome: false,
    loadingOrders: false,
    orderMode: 'open',
    loadedOrderMode: '',
    outstandingJobs: [],
    outstandingTotal: 0,
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
    customerResults: [],
    selectedCustomerDetail: null,
    selectedCustomerOrders: [],
    selectedCustomerContacts: [],
    selectedCustomerAddresses: [],
    customerUsers: [],
    loadedCustomerUsers: false,
    customerAccountManagerSaving: false,
    selectedJob: null,
    selectedLineItems: [],
    selectedPositions: [],
    lineDraft: null,
    productResults: [],
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
    currentUser: null,
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
  let lineDrag = null;

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
      outstandingBody: document.getElementById('db-outstanding-body'),
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
    els.customersBody.addEventListener('click', handleDatabaseCustomerRowClick);
    els.customersBody.addEventListener('keydown', handleDatabaseCustomerRowKeydown);
    els.customerOrdersBody.addEventListener('click', handleCustomerOrderRowClick);
    els.customerOrdersBody.addEventListener('keydown', handleCustomerOrderRowKeydown);
    els.customerContactsBody.addEventListener('input', handleCustomerContactInput);
    els.customerContactsBody.addEventListener('focusout', handleCustomerContactFocusOut);
    els.customersSearch.addEventListener('input', handleDatabaseCustomerSearchInput);
    els.customerAccountManager?.addEventListener('change', handleCustomerAccountManagerChange);
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
    els.itemsPanel.addEventListener('keydown', handleLineDraftKeydown);
    els.itemsPanel.addEventListener('keydown', handleCustomLineDraftKeydown);
    els.itemsPanel.addEventListener('keydown', handleLineItemEditKeydown);
    els.itemsPanel.addEventListener('focusout', handleLineDraftFocusOut);
    els.itemsPanel.addEventListener('focusout', handleCustomLineDraftFocusOut);
    els.itemsPanel.addEventListener('focusout', handleLineItemEditFocusOut);
    els.itemsPanel.addEventListener('change', handleLineDraftChange);
    els.itemsPanel.addEventListener('mousedown', handleLineDraftMouseDown);
    els.itemsPanel.addEventListener('pointerdown', handleLineDragPointerDown);
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
        renderOutstandingOrders();
      });
    });

    if (els.sideTab) {
      els.sideTab.addEventListener('click', () => {
        if (!state.loadedHome) loadHomeMetrics();
      });
    }
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

    if (button.dataset.dbOrderAck) {
      await flushOrderAutosaves();
      openOrderAcknowledgement();
      return;
    }

    const group = button.dataset.dbGroup;
    if (group) {
      state.activeGroup = group;
      document.querySelectorAll('[data-db-group]').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.dbGroup === group);
      });
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
    const row = event.target.closest('tr[data-job-id]');
    if (!row) return;
    await flushOrderAutosaves();
    openOrder(row.dataset.jobId, 'details');
  }

  async function handleOutstandingRowKeydown(event) {
    if (event.key !== 'Enter') return;
    const row = event.target.closest('tr[data-job-id]');
    if (!row) return;
    await flushOrderAutosaves();
    openOrder(row.dataset.jobId, 'details');
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
    state.customerResults = [];
    closeCustomerResults();
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
    els.newCustomerInput.value = customer.business_name || '';
    els.newContactInput.value = customer.contact_name || '';

    const invoiceAddress = formatCustomerAddress(customer, 'inv') || customer.business_name || '';
    const deliveryAddress = formatCustomerAddress(customer, 'ship') || invoiceAddress;
    els.newDeliveryAddress.value = deliveryAddress || '';
    els.newInvoiceAddress.value = invoiceAddress || deliveryAddress || '';

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
    return {
      customer_id: selectedCustomer?.customer_id,
      customer_name: fields.customer_name.value,
      customer_code: selectedCustomer?.customer_code,
      contact_id: selectedCustomer?.contact_id,
      contact_name: fields.contact_name.value,
      contact_phone: selectedCustomer?.contact_phone,
      contact_mobile: selectedCustomer?.contact_mobile,
      contact_email: selectedCustomer?.contact_email || selectedCustomer?.email,
      order_type: fields.order_type.value,
      job_title: fields.job_title.value,
      order_date: legacyInputDateToIso(fields.order_date.value),
      delivery_date: legacyInputDateToIso(fields.delivery_date.value),
      customer_date_required: false,
      delivery_method: fields.delivery_method.value,
      payment_terms: fields.payment_terms.value,
      order_taken_by: fields.order_taken_by.value,
      delivery_address: fields.delivery_address.value,
      invoice_address: fields.invoice_address.value,
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
    els.customerName.value = 'Loading...';
    els.customerCode.value = '';
    setCustomerAccountManagerOptions(null, true);
    els.customerCreatedAt.textContent = '-';
    els.customerUpdatedAt.textContent = '-';
    els.customerUpdatedBy.textContent = '-';
    els.customerOrdersBody.innerHTML = renderStatusRow('Loading customer orders', 14);
    els.customerContactsBody.innerHTML = '<div class="db-panel-message">Loading contacts</div>';
    els.customerAddressesBody.innerHTML = '<div class="db-panel-message">Loading addresses</div>';
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
    loadOutstandingOrders({ force: false });
  }

  async function loadOutstandingOrders(options = {}) {
    if (state.loadingOrders) return;
    if (state.outstandingJobs.length && state.loadedOrderMode === state.orderMode && !options.force) {
      renderOutstandingOrders();
      return;
    }

    state.loadingOrders = true;
    els.outstandingBody.innerHTML = renderStatusRow('Loading outstanding orders');

    try {
      const result = await fetchJobs(state.orderMode);
      state.outstandingJobs = result.jobs;
      state.outstandingTotal = result.total;
      state.loadedOrderMode = state.orderMode;
      renderOutstandingOrders();
      hydrateOrderSelectors();
    } catch (err) {
      els.outstandingBody.innerHTML = renderStatusRow(err.message);
    } finally {
      state.loadingOrders = false;
    }
  }

  async function fetchJobs(mode) {
    const jobs = [];
    let offset = 0;
    let total = 0;

    while (jobs.length < MAX_JOBS) {
      const params = new URLSearchParams({
        limit: String(PAGE_LIMIT),
        offset: String(offset),
      });
      if (mode !== 'all') params.set('status', 'open');

      const data = await fetchJson(`/api/database/jobs?${params.toString()}`);
      const batch = data.jobs || [];
      total = data.total || batch.length;
      jobs.push(...batch);

      offset += data.limit || PAGE_LIMIT;
      if (!batch.length || offset >= total) break;
    }

    return { jobs, total };
  }

  function renderOutstandingOrders() {
    const rows = groupedOutstandingRows();
    const jobs = rows.flatMap((group) => group.jobs);
    if (!jobs.length) {
      els.outstandingBody.innerHTML = renderStatusRow('No matching orders');
      hydrateOrderSelectors();
      return;
    }

    els.outstandingBody.innerHTML = jobs.map(renderOutstandingRow).join('');
    hydrateOrderSelectors();
  }

  function groupedOutstandingRows() {
    const groups = [
      { key: 'print', label: 'Print', jobs: [] },
      { key: 'embroidery', label: 'Embroidery', jobs: [] },
      { key: 'gifts', label: 'Gifts', jobs: [] },
      { key: 'other', label: 'Other', jobs: [] },
    ];
    const groupMap = new Map(groups.map((group) => [group.key, group]));

    for (const job of filteredOutstandingJobs()) {
      const category = categoryForJob(job);
      (groupMap.get(category) || groupMap.get('other')).jobs.push(job);
    }

    groups.forEach((group) => group.jobs.sort(compareJobs));
    return groups.filter((group) => group.jobs.length);
  }

  function filteredOutstandingJobs() {
    const active = state.activeGroup;
    return state.outstandingJobs.filter((job) => {
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
    const delivery = `${formatDate(job.delivery_date, 'long')}${truthy(job.customer_date_required) ? ' *' : ''}`;
    return `
      <tr class="db-outstanding-row ${selected ? 'selected' : ''}" data-job-id="${escapeAttr(job.source_order_id)}" tabindex="0">
        <td class="db-row-selector">${selected ? '&#9654;' : ''}</td>
        <td class="db-order-link">${escapeHtml(job.order_no || '')}</td>
        <td class="db-customer-link">${escapeHtml(job.customer_name || '')}</td>
        <td class="db-type-cell db-type-${categoryForJob(job)}">${escapeHtml(typeAbbr(job))}</td>
        <td>${escapeHtml(job.job_title || '')}</td>
        <td>${escapeHtml(staffShort(job.order_taken_by || job.trace_staff_id))}</td>
        <td>${escapeHtml(formatDate(job.order_date, 'long'))}</td>
        <td>${escapeHtml(delivery)}</td>
        <td>${renderCheck(job.has_artwork)}</td>
        <td>${renderCheck(truthy(job.has_screens) || Boolean(job.screen_numbers))}</td>
        <td>${renderCheck(job.has_shirts)}</td>
        <td>${renderCheck(job.is_printed)}</td>
        <td>${renderCheck(job.customer_supplied)}</td>
      </tr>
    `;
  }

  async function openSelectedOrder(value) {
    const id = Number.parseInt(value, 10);
    if (!Number.isFinite(id)) return;
    await flushOrderAutosaves();
    await openOrder(id, state.activeOrderTab || 'details');
  }

  async function openOrder(id, tab) {
    state.activeOrderTab = tab || 'details';
    showView('order');
    setFooterTitle('Open Orders');
    setOrderLoading();

    try {
      const data = await fetchJson(`/api/database/jobs/${encodeURIComponent(id)}`);
      state.selectedJob = data.job || {};
      state.selectedLineItems = data.lineItems || [];
      state.selectedPositions = data.positions || [];
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

  function setOrderLoading() {
    resetDesignAutosaveState();
    resetJobAutosaveState();
    els.orderTitle.value = 'Loading...';
    els.orderNumber.value = '';
    els.createdAt.textContent = '-';
    els.updatedAt.textContent = '-';
    els.updatedBy.textContent = '-';
    els.detailsPanel.innerHTML = '<div class="db-panel-message">Loading order details</div>';
    els.itemsPanel.innerHTML = '';
    els.designPanel.innerHTML = '';
  }

  function renderOrderError(message) {
    resetDesignAutosaveState();
    resetJobAutosaveState();
    els.orderTitle.value = 'Order unavailable';
    els.orderNumber.value = '';
    els.detailsPanel.innerHTML = `<div class="db-panel-message">${escapeHtml(message)}</div>`;
    els.itemsPanel.innerHTML = '';
    els.designPanel.innerHTML = '';
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
    const jobs = [...state.outstandingJobs];
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
    ].forEach(([key, panel]) => {
      panel.classList.toggle('active', key === tab);
    });
    syncOrderItemsExpansion();
  }

  function renderDetailsPanel() {
    const job = state.selectedJob || {};
    els.detailsPanel.innerHTML = `
      <div class="db-details-layout">
        <div class="db-detail-box db-customer-box">
          ${detailRow('Customer:', `${customerOpenButton(job)}<input class="db-legacy-input db-code-input" readonly value="${escapeAttr(job.customer_code || '')}">`)}
          ${detailRow('Contact:', selectBox(job.contact_name))}
          ${detailRow('Order type:', selectBox(job.order_type || typeLabel(job)))}
          ${detailRow('Taken by:', selectBox(takenByLabel(job)))}
          ${detailRow('Delivery:', selectBox(job.delivery_method))}
          ${detailRow('Order date:', inputBox(formatDate(job.order_date, 'short')))}
          ${detailRow('Delivery:', `${inputBox(formatDate(job.delivery_date, 'short'))}<label class="db-inline-check">${renderCheck(job.customer_date_required)} Customer date</label>`)}
          ${detailRow('Completion', `${inputBox(formatDate(job.complete_date, 'short'))}${renderCheck(job.is_complete)}`)}
        </div>

        <div class="db-detail-box db-address-box">
          ${detailRow('Invoice to:', selectBox(job.invoice_address || job.customer_name))}
          ${detailRow('Deliver to:', selectBox(job.delivery_address || job.customer_name))}
        </div>

        <div class="db-detail-box db-payment-box">
          ${detailRow('Payment:', selectBox(job.payment_terms))}
          ${detailRow('Client ref:', inputBox(job.client_order_no || job.contact_name || ''))}
          <div class="db-form-row db-comments-row">
            <label>Comments:</label>
            <textarea readonly>${escapeHtml(job.comments || '')}</textarea>
          </div>
        </div>

        <div class="db-detail-box db-print-box">
          ${detailRow('Delivery note:', inputBox(formatDate(job.delivery_note_date, 'short'), 'db-green-input'))}
          ${detailRow('Invoice no:', inputBox(job.invoice_no || '', 'db-green-input'))}
          ${detailRow('Pro-forma:', inputBox(formatDate(job.pf_invoice_date, 'short'), 'db-green-input'))}
        </div>

        <div class="db-detail-box db-invoice-checks">
          <label>${renderCheck(job.invoice_required)} Invoice required</label>
          <label>${renderCheck(job.invoice_printed)} Invoice printed</label>
          <label>${renderCheck(job.pf_invoice_printed)} Pro-forma printed</label>
        </div>

        <div class="db-detail-box db-flags-box">
          <div>
            <label>${renderCheck(job.has_artwork)} Artwork</label>
            <label>${renderCheck(false)} Jacquard</label>
            <label>${renderCheck(job.has_shirts)} Shirts</label>
            <label>${renderCheck(job.is_reorder)} Re-order</label>
            <label>${renderCheck(job.customer_supplied)} Customer supplied</label>
          </div>
          <div>
            <label>${renderCheck(job.is_printed)} Printed</label>
            <label>${renderCheck(job.is_bagged)} Bagged</label>
            <label>${renderCheck(job.is_automatic)} Automatic</label>
          </div>
        </div>
      </div>
    `;
  }

  function renderItemsPanel() {
    const items = state.selectedLineItems || [];
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
              <table class="db-legacy-table db-nonstock-table">
                <thead>
                  <tr>
                    <th class="db-row-selector"></th>
                    <th class="db-row-selector"></th>
                    <th>Non-stock item:</th>
                    <th>Cost:</th>
                    <th>Price:</th>
                    <th>Qty:</th>
                    <th>VAT:</th>
                  </tr>
                </thead>
                <tbody>
                  ${renderCustomSectionRows(nonStockItems, 'nonstock', 7, renderNonStockRow)}
                </tbody>
              </table>
            </div>
            <div class="db-supplier-row"><span>Supplier:</span><input readonly value="${escapeAttr(suppliers)}"></div>
          </div>
        </div>
        <div class="db-product-results" role="listbox"></div>
      </div>
    `;
    window.requestAnimationFrame(() => {
      scrollItemSectionsToAddLine();
      paintProductResults();
    });
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

  function openOrderAcknowledgement() {
    if (!state.selectedJob?.source_order_id && !state.selectedJob?.order_no) return;

    const modal = ensureOrderAckModal();
    const pages = modal.querySelector('.db-order-ack-pages');
    pages.innerHTML = renderOrderAcknowledgementPage();
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open', 'db-order-ack-open');

    window.requestAnimationFrame(() => {
      const printButton = modal.querySelector('[data-db-ack-print]');
      if (printButton) printButton.focus();
    });
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
      printOrderAcknowledgement();
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
    state.lineDeleteSaving = false;
    state.designDeleteSaving = false;
    state.contactDeleteSaving = false;

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
      if (state.contactDeleteTarget) {
        confirmDeleteContact();
      } else if (state.designDeleteTarget) {
        confirmDeleteDesignPosition();
      } else {
        confirmDeleteLineItem();
      }
    }
  }

  function closeLineDeleteConfirmation() {
    if (state.lineDeleteSaving || state.designDeleteSaving || state.contactDeleteSaving) return;
    const modal = document.getElementById('db-line-delete-modal');
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open', 'db-line-delete-open');
    state.lineDeleteTarget = null;
    state.designDeleteTarget = null;
    state.contactDeleteTarget = null;
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
      confirm.textContent = saving ? 'Deleting...' : 'Confirm';
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
    state.designDeleteSaving = false;
    state.lineDeleteSaving = false;
    state.contactDeleteSaving = false;

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
    state.contactDeleteSaving = false;
    state.lineDeleteSaving = false;
    state.designDeleteSaving = false;

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

  function contactDeleteLabel(contact) {
    const parts = contactNameParts(contact);
    return [parts.firstName, parts.lastName].filter(Boolean).join(' ')
      || contact.contact_email
      || contact.contact_phone
      || 'this contact';
  }

  function printOrderAcknowledgement() {
    const modal = document.getElementById('db-order-ack-modal');
    if (!modal || modal.hidden) return;

    document.body.classList.add('db-order-ack-printing');
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      document.body.classList.remove('db-order-ack-printing');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.setTimeout(() => {
      window.print();
      window.setTimeout(cleanup, 1500);
    }, 50);
  }

  function renderOrderAcknowledgementPage() {
    const job = state.selectedJob || {};
    const items = orderAckLineItems();
    const positions = state.selectedPositions || [];
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
    const pages = buildOrderAckPages({ items, totals, positions, comments: job.comments });

    return pages.map((pageContent, index) => renderOrderAckPage(context, pageContent, index)).join('');
  }

  function renderOrderAckPage(context, pageContent, pageIndex) {
    return `
      <section class="db-order-ack-page" aria-label="Order acknowledgement page ${pageIndex + 1}">
        ${renderOrderAckPageHeader(context)}
        <section class="db-order-ack-page-content">
          ${renderOrderAckPageContent(pageContent, context)}
        </section>
        <img class="db-order-ack-footer" src="${escapeAttr(ORDER_ACK_FOOTER_URL)}" alt="Ultimate letterhead footer" crossorigin="anonymous">
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
      ${pageContent.positions.length ? renderOrderAckPositionsTable(pageContent.positions, pageContent.hasDesign) : ''}
      ${pageContent.comments ? renderOrderAckComments(pageContent.comments) : ''}
    `;
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

  function buildOrderAckPages({ items, totals, positions, comments }) {
    const visiblePositions = (positions || []).filter((position) => (
      position.position_name || position.colour_notes || position.design_ref
    ));
    const hasDesign = visiblePositions.some((position) => position.design_ref);
    const pages = [];
    let page = emptyOrderAckPageContent();
    let usedMm = 0;

    const pushPage = () => {
      pages.push(page);
      page = emptyOrderAckPageContent();
      usedMm = 0;
    };
    const ensureSpace = (heightMm) => {
      if (usedMm > 0 && usedMm + heightMm > ORDER_ACK_PAGE_CONTENT_MAX_MM) pushPage();
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

    for (const position of visiblePositions) {
      let tableOverhead = page.positions.length ? 0 : ORDER_ACK_POSITIONS_TOP_MM + ORDER_ACK_POSITIONS_HEADER_MM;
      ensureSpace(tableOverhead + ORDER_ACK_POSITION_ROW_MM);
      tableOverhead = page.positions.length ? 0 : ORDER_ACK_POSITIONS_TOP_MM + ORDER_ACK_POSITIONS_HEADER_MM;
      page.positions.push(position);
      page.hasDesign = hasDesign;
      usedMm += (page.positions.length === 1 ? tableOverhead : 0) + ORDER_ACK_POSITION_ROW_MM;
    }

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
      positions: [],
      hasDesign: false,
      comments: '',
    };
  }

  function pageHasOrderAckContent(page) {
    return Boolean(
      page.itemEntries.length
      || page.showEmptyItems
      || page.showSummary
      || page.positions.length
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
        <td>${escapeHtml(formatVat(item.vat_rate))}</td>
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

  function renderOrderAckPositionsTable(positions, forceHasDesign = false) {
    const visiblePositions = (positions || []).filter((position) => (
      position.position_name || position.colour_notes || position.design_ref
    ));
    if (!visiblePositions.length) return '';

    const hasDesign = forceHasDesign || visiblePositions.some((position) => position.design_ref);
    return `
      <table class="db-order-ack-positions ${hasDesign ? 'has-design' : ''}">
        <thead>
          <tr>
            <th>Positions</th>
            <th>Colours</th>
            ${hasDesign ? '<th>Design</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${visiblePositions.map((position) => `
            <tr>
              <td>${escapeHtml(position.position_name || '')}</td>
              <td>${escapeHtml(position.colour_notes || '')}</td>
              ${hasDesign ? `<td>${escapeHtml(position.design_ref || '')}</td>` : ''}
            </tr>
          `).join('')}
        </tbody>
      </table>
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
    const rate = orderAckVatPercent(item.vat_rate);
    return orderAckLineNet(item) * (rate / 100);
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
        <td>${renderLineItemInput(item, 'colour')}</td>
        <td>${renderLineItemInput(item, 'size')}</td>
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

  function lineItemEditDisplayValue(item, field) {
    if (!item) return '';
    if (field === 'vatPercent') return formatVatInput(item.vat_rate);
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
    if (['style_code', 'alt_style_code', 'style_name', 'colour', 'size', 'line_description'].includes(field)) {
      return { [field]: String(value || '').trim() };
    }
    return null;
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
    const payload = {
      job_title: els.orderTitle.value.trim(),
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
    });
  }

  function updateOutstandingJob(job) {
    if (!job?.source_order_id) return;
    state.outstandingJobs = state.outstandingJobs.map((item) => (
      Number(item.source_order_id) === Number(job.source_order_id)
        ? { ...item, ...job }
        : item
    ));
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

  function renderNonStockRow(item, index) {
    const lineId = item.source_order_item_id || '';
    return `
      <tr class="db-line-row db-custom-line-row" data-line-id="${escapeAttr(lineId)}">
        ${renderLineDeleteCell(lineId)}
        <td class="db-row-selector">
          <button class="db-line-drag-handle" type="button" data-db-line-drag="true" aria-label="Reorder line item">&#9654;</button>
        </td>
        <td>${renderLineItemInput(item, 'line_description')}</td>
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

    return `
      <tr class="db-custom-line-edit-row" data-custom-line-type="${escapeAttr(type)}">
        <td class="db-row-selector db-line-delete-cell"></td>
        <td class="db-row-selector"></td>
        <td><textarea class="db-custom-line-input" data-custom-line-field="line_description">${escapeHtml(draft.line_description)}</textarea></td>
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
    state.customLineDraft.error = '';
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
      const active = (name === 'home' || name === 'new-order' || name === 'new-customer' || name === 'new-contact' || name === 'customers' || name === 'customer')
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

  function selectBox(value, className = '') {
    return `<select class="${className}" disabled><option>${escapeHtml(value || '')}</option></select>`;
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

  function renderStatusRow(message, colspan = 13) {
    return `<tr><td colspan="${colspan}" class="db-empty-cell">${escapeHtml(message)}</td></tr>`;
  }

  function renderItemEmptyRow(colspan) {
    return `<tr class="db-gray-fill"><td colspan="${colspan}"></td></tr>`;
  }

  function renderCheck(value) {
    return `<input class="db-tiny-check" type="checkbox" disabled ${truthy(value) ? 'checked' : ''}>`;
  }

  function categoryForJob(job) {
    const type = `${job.order_type || ''} ${job.order_type_abbr || ''}`.toLowerCase();
    const abbr = String(job.order_type_abbr || '').trim().toLowerCase();
    if (type.includes('gift') || abbr === 'g') return 'gifts';
    if (type.includes('embro') || abbr === 'e') return 'embroidery';
    if (type.includes('print') || abbr === 'p') return 'print';
    return 'other';
  }

  function typeAbbr(job) {
    if (job.order_type_abbr) return job.order_type_abbr;
    const category = categoryForJob(job);
    if (category === 'gifts') return 'G';
    if (category === 'embroidery') return 'E';
    if (category === 'print') return 'P';
    return '';
  }

  function typeLabel(job) {
    const category = categoryForJob(job);
    if (category === 'gifts') return 'Business gifts';
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
