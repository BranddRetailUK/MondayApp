(function () {
  const PAGE_LIMIT = 100;
  const MAX_JOBS = 2500;
  const CUSTOMER_SEARCH_DELAY = 180;
  const PRODUCT_SEARCH_DELAY = 180;
  const DESIGN_AUTOSAVE_MS = 5000;
  const LINE_ORDER_AUTOSAVE_MS = 3500;
  const ORDER_ACK_LOGO_URL = 'https://res.cloudinary.com/dhlqooyuk/image/upload/v1781699668/ultimate_logo_imyxvr.png';

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
    selectedCustomer: null,
    customerResults: [],
    selectedCustomerDetail: null,
    selectedCustomerOrders: [],
    selectedCustomerContacts: [],
    selectedCustomerAddresses: [],
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
    lineOrderLastSavedSignature: '[]',
    designDirty: false,
    designSaving: false,
    designSaveQueued: false,
    designLastSavedSignature: '[]',
  };

  let els = {};
  let customerSearchTimer = 0;
  let databaseCustomerSearchTimer = 0;
  let productSearchTimer = 0;
  let customerSearchRequest = 0;
  let databaseCustomerRequest = 0;
  let productSearchRequest = 0;
  let designAutosaveTimer = 0;
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
      customerMetaName: document.getElementById('db-customer-meta-name'),
      customerMetaCode: document.getElementById('db-customer-meta-code'),
      customerTabs: Array.from(document.querySelectorAll('.db-customer-tab')),
      customerPanels: Array.from(document.querySelectorAll('.db-customer-panel')),
      customerOrdersBody: document.getElementById('db-customer-orders-body'),
      customerContactsBody: document.getElementById('db-customer-contacts-body'),
      customerAddressesBody: document.getElementById('db-customer-addresses-body'),
      outstandingBody: document.getElementById('db-outstanding-body'),
      refreshOrders: document.getElementById('db-refresh-orders'),
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
    els.customersSearch.addEventListener('input', handleDatabaseCustomerSearchInput);
    els.refreshOrders.addEventListener('click', () => loadOutstandingOrders({ force: true }));
    els.selectOrder.addEventListener('change', () => openSelectedOrder(els.selectOrder.value));
    els.headerJobSelect.addEventListener('change', () => openSelectedOrder(els.headerJobSelect.value));
    els.headerOrderSelect.addEventListener('change', () => openSelectedOrder(els.headerOrderSelect.value));
    els.newOrderForm.addEventListener('submit', submitNewOrder);
    els.newOrderForm.addEventListener('input', validateNewOrderForm);
    els.newOrderForm.addEventListener('change', validateNewOrderForm);
    els.newOrderCancel.addEventListener('click', showHome);
    els.newCustomerInput.addEventListener('input', handleNewCustomerInput);
    els.newCustomerInput.addEventListener('focus', showExistingCustomerResults);
    els.newCustomerInput.addEventListener('keydown', handleCustomerSearchKeydown);
    els.newCustomerResults.addEventListener('mousedown', (event) => event.preventDefault());
    els.newCustomerResults.addEventListener('click', handleCustomerResultClick);
    els.itemsPanel.addEventListener('input', handleLineDraftInput);
    els.itemsPanel.addEventListener('focusin', handleLineDraftFocus);
    els.itemsPanel.addEventListener('keydown', handleLineDraftKeydown);
    els.itemsPanel.addEventListener('change', handleLineDraftChange);
    els.itemsPanel.addEventListener('mousedown', handleLineDraftMouseDown);
    els.itemsPanel.addEventListener('pointerdown', handleLineDragPointerDown);
    els.designPanel.addEventListener('input', handleDesignInput);
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

  function showCustomers() {
    showView('customers');
    setFooterTitle('Customers');
    loadDatabaseCustomers({ force: false });
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
    document.getElementById('db-new-order-taken-by').value = 'Melvyn Harris';
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
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
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
      const data = await fetchJson(`/api/database/customers/${encodeURIComponent(customerKey)}`);
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
    state.selectedCustomerDetail = null;
    state.selectedCustomerOrders = [];
    state.selectedCustomerContacts = [];
    state.selectedCustomerAddresses = [];
    els.customerName.value = 'Loading...';
    els.customerCode.value = '';
    setSelectValue(els.customerAccountManager, '');
    els.customerCreatedAt.textContent = '-';
    els.customerUpdatedAt.textContent = '-';
    els.customerUpdatedBy.textContent = '-';
    setSelectValue(els.customerMetaName, '');
    setSelectValue(els.customerMetaCode, '');
    els.customerOrdersBody.innerHTML = renderStatusRow('Loading customer orders', 14);
    els.customerContactsBody.innerHTML = renderStatusRow('Loading contacts', 7);
    els.customerAddressesBody.innerHTML = renderStatusRow('Loading addresses', 6);
  }

  function renderCustomerError(message) {
    els.customerName.value = 'Customer unavailable';
    els.customerCode.value = '';
    setSelectValue(els.customerAccountManager, '');
    els.customerCreatedAt.textContent = '-';
    els.customerUpdatedAt.textContent = '-';
    els.customerUpdatedBy.textContent = '-';
    setSelectValue(els.customerMetaName, '');
    setSelectValue(els.customerMetaCode, '');
    els.customerOrdersBody.innerHTML = renderStatusRow(message, 14);
    els.customerContactsBody.innerHTML = renderStatusRow(message, 7);
    els.customerAddressesBody.innerHTML = renderStatusRow(message, 6);
  }

  function renderCustomerPage() {
    const customer = state.selectedCustomerDetail || {};
    els.customerName.value = customer.business_name || '';
    els.customerCode.value = customer.customer_code || '';
    setSelectValue(els.customerAccountManager, staffLabel(customer.account_manager));
    els.customerCreatedAt.textContent = formatDateTime(customer.created_at_source);
    els.customerUpdatedAt.textContent = formatDateTime(customer.updated_at_source);
    els.customerUpdatedBy.textContent = staffLabel(customer.updated_by) || '-';
    setSelectValue(els.customerMetaName, customer.business_name || '');
    setSelectValue(els.customerMetaCode, customer.customer_code || '');

    renderCustomerOrders();
    renderCustomerContacts();
    renderCustomerAddresses();
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
    if (!contacts.length) {
      els.customerContactsBody.innerHTML = renderStatusRow('No contact information recorded for this customer', 7);
      return;
    }

    els.customerContactsBody.innerHTML = contacts.map((contact, index) => `
      <tr>
        <td class="db-row-selector">${index === 0 ? '&#9654;' : ''}</td>
        <td>${escapeHtml(contact.contact_name || '')}</td>
        <td>${escapeHtml(contact.contact_phone || '')}</td>
        <td>${escapeHtml(contact.contact_mobile || '')}</td>
        <td class="db-customer-email-cell">${escapeHtml(contact.contact_email || '')}</td>
        <td>${escapeHtml(formatNumber(contact.order_count || 0))}</td>
        <td class="db-order-link">${escapeHtml(contact.latest_order_no || '')}</td>
      </tr>
    `).join('');
  }

  function renderCustomerAddresses() {
    const addresses = state.selectedCustomerAddresses || [];
    if (!addresses.length) {
      els.customerAddressesBody.innerHTML = renderStatusRow('No addresses recorded for this customer', 6);
      return;
    }

    els.customerAddressesBody.innerHTML = addresses.map((address, index) => `
      <tr>
        <td class="db-row-selector">${index === 0 ? '&#9654;' : ''}</td>
        <td>${escapeHtml(address.address_type || '')}</td>
        <td>${escapeHtml(address.address || '')}</td>
        <td>${escapeHtml(formatNumber(address.order_count || 0))}</td>
        <td class="db-order-link">${escapeHtml(address.latest_order_no || '')}</td>
        <td>${escapeHtml(formatDate(address.last_seen_at, 'long'))}</td>
      </tr>
    `).join('');
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
      resetLineOrderAutosaveState();
      state.lineOrderLastSavedSignature = lineOrderSignature(stockLineItems());
      renderOrder();
      renderOutstandingOrders();
      showOrderTab(state.activeOrderTab);
    } catch (err) {
      renderOrderError(err.message);
    }
  }

  function setOrderLoading() {
    resetDesignAutosaveState();
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
    els.updatedBy.textContent = staffLabel(job.order_taken_by || job.trace_staff_id);

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

    [els.selectOrder, els.headerJobSelect, els.headerOrderSelect].forEach((select) => {
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
  }

  function renderDetailsPanel() {
    const job = state.selectedJob || {};
    els.detailsPanel.innerHTML = `
      <div class="db-details-layout">
        <div class="db-detail-box db-customer-box">
          ${detailRow('Customer:', `${customerOpenButton(job)}<input class="db-legacy-input db-code-input" readonly value="${escapeAttr(job.customer_code || '')}">`)}
          ${detailRow('Contact:', selectBox(job.contact_name))}
          ${detailRow('Order type:', selectBox(job.order_type || typeLabel(job)))}
          ${detailRow('Taken by:', selectBox(staffLabel(job.order_taken_by || job.trace_staff_id)))}
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
        <div class="db-items-stock-frame">
          <table class="db-legacy-table db-items-table">
            <thead>
              <tr>
                <th class="db-row-selector"></th>
                <th>Code:</th>
                <th>Alt code:</th>
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
            ${renderSmallItemBox('Non-deliverable item:', nonDeliverableItems)}
            ${renderSmallItemBox('Internal item:', internalItems)}
          </div>
          <div class="db-edit-spine">E<br>D<br>I<br>T</div>
          <div class="db-nonstock-box">
            <table class="db-legacy-table db-nonstock-table">
              <thead>
                <tr>
                  <th class="db-row-selector"></th>
                  <th>Non-stock item:</th>
                  <th>Cost:</th>
                  <th>Price:</th>
                  <th>Qty:</th>
                  <th>VAT:</th>
                </tr>
              </thead>
              <tbody>${nonStockItems.length ? nonStockItems.map(renderNonStockRow).join('') : renderItemEmptyRow(6)}</tbody>
            </table>
            <div class="db-supplier-row"><span>Supplier:</span><input readonly value="${escapeAttr(suppliers)}"></div>
          </div>
        </div>
        <div class="db-product-results" role="listbox"></div>
      </div>
    `;
    window.requestAnimationFrame(() => paintProductResults());
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
    const page = modal.querySelector('.db-order-ack-page');
    page.innerHTML = renderOrderAcknowledgementPage();
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
          <article class="db-order-ack-page" role="document"></article>
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
        ${orderAckMetaRow('Order taken by:', staffLabel(job.order_taken_by || job.trace_staff_id))}
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

      ${renderOrderAckItemsTable(items, totals)}
      ${renderOrderAckPositionsTable(positions)}
      ${job.comments ? renderOrderAckComments(job.comments) : ''}
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

  function renderOrderAckItemsTable(items, totals) {
    const rows = items.length ? items.map(renderOrderAckItemRow).join('') : `
      <tr>
        <td colspan="6" class="db-order-ack-empty">No order line items</td>
      </tr>
    `;

    return `
      <table class="db-order-ack-items">
        <thead>
          <tr>
            <th>${escapeHtml(orderAckItemsLabel(items))}</th>
            <th>Qty</th>
            <th>Price</th>
            <th>Total</th>
            <th>VAT</th>
            <th>Rate</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr>
            <td colspan="3"></td>
            <td>${escapeHtml(formatCurrency(totals.net))}</td>
            <td>${escapeHtml(formatCurrency(totals.vat))}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    `;
  }

  function renderOrderAckItemRow(item) {
    const quantity = orderAckQuantity(item);
    const price = orderAckNumber(item.unit_price);
    const net = orderAckLineNet(item);
    const vat = orderAckLineVat(item);
    return `
      <tr>
        <td>${escapeHtml(orderAckItemDescription(item))}</td>
        <td>${escapeHtml(formatNumber(quantity))}</td>
        <td>${Number.isFinite(price) ? escapeHtml(formatCurrency(price)) : ''}</td>
        <td>${escapeHtml(formatCurrency(net))}</td>
        <td>${escapeHtml(formatCurrency(vat))}</td>
        <td>${escapeHtml(formatVat(item.vat_rate))}</td>
      </tr>
    `;
  }

  function renderOrderAckPositionsTable(positions) {
    const visiblePositions = (positions || []).filter((position) => (
      position.position_name || position.colour_notes || position.design_ref
    ));
    if (!visiblePositions.length) return '';

    const hasDesign = visiblePositions.some((position) => position.design_ref);
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
    const customerFacing = items.filter((item) => !truthy(item.is_internal));
    return customerFacing.length ? customerFacing : items;
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
      <tr class="db-stock-line-row" data-line-id="${escapeAttr(lineId)}" data-stock-index="${escapeAttr(index)}">
        <td class="db-row-selector">
          <button class="db-line-drag-handle" type="button" data-db-line-drag="true" aria-label="Reorder line item">&#9654;</button>
        </td>
        <td>${escapeHtml(item.style_code || '')}</td>
        <td>${escapeHtml(item.alt_style_code || '')}</td>
        <td>${escapeHtml(item.style_name || item.line_description || '')}</td>
        <td>${escapeHtml(item.colour || '')}</td>
        <td>${escapeHtml(item.size || '')}</td>
        <td>${escapeHtml(formatCurrency(item.unit_cost))}</td>
        <td>${escapeHtml(formatCurrency(item.unit_price))}</td>
        <td>${escapeHtml(formatNumber(item.quantity || 0))}</td>
        <td>${escapeHtml(formatVat(item.vat_rate))}</td>
      </tr>
    `;
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
    const saveDisabled = product && !draft.saving ? '' : ' disabled';
    const status = draft.error || (draft.loadingVariants ? 'Loading variants' : '');

    return `
      <tr class="db-add-line-edit-row">
        <td class="db-row-selector">
          <button class="db-line-save-button" type="button" data-db-line-action="save"${saveDisabled}>+</button>
        </td>
        <td>${renderLineSearchInput('code', draft.codeQuery)}</td>
        <td><input class="db-line-input" readonly value="${escapeAttr(draft.altCode || product?.alt_style_code || '')}"></td>
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
      altCode: '',
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
    draft.altCode = '';
    draft.error = '';
    clearDraftProductCells();
  }

  function clearDraftProductCells() {
    const alt = els.itemsPanel.querySelector('.db-add-line-edit-row td:nth-child(3) input');
    const cost = els.itemsPanel.querySelector('.db-add-line-edit-row td:nth-child(7) input');
    if (alt) alt.value = '';
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
    draft.altCode = product.alt_style_code || '';
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
      state.lineOrderLastSavedSignature = lineOrderSignature(stockLineItems());
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

  function handleLineDragPointerDown(event) {
    const handle = event.target.closest('[data-db-line-drag]');
    if (!handle || event.button !== 0 || state.lineDraft) return;

    const row = handle.closest('.db-stock-line-row');
    const tbody = row?.parentElement;
    if (!row || !tbody || !row.dataset.lineId) return;

    event.preventDefault();
    closeProductResults();

    const rect = row.getBoundingClientRect();
    lineDrag = {
      pointerId: event.pointerId,
      row,
      tbody,
      offsetY: event.clientY - rect.top,
      startOrder: currentDomStockLineIds(),
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

    const afterIds = currentDomStockLineIds();
    const after = afterIds.join('|');
    if (after && after !== before) {
      applyStockLineOrder(afterIds);
      markLineOrderDirty();
    }
  }

  function createLineDragGhost(row, rect) {
    const ghost = document.createElement('div');
    ghost.className = 'db-line-drag-ghost';
    ghost.style.left = `${Math.round(rect.left)}px`;
    ghost.style.width = `${Math.round(rect.width)}px`;

    const table = document.createElement('table');
    table.className = 'db-legacy-table db-items-table';
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

    const rows = Array.from(lineDrag.tbody.querySelectorAll('.db-stock-line-row'))
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

    const firstNonStockRow = Array.from(lineDrag.tbody.children)
      .find((row) => !row.classList.contains('db-stock-line-row'));
    lineDrag.tbody.insertBefore(lineDrag.row, firstNonStockRow || null);
  }

  function cleanupLineDrag() {
    if (!lineDrag) return;
    lineDrag.row.classList.remove('db-line-row-dragging');
    lineDrag.ghost?.remove();
    document.body.classList.remove('db-line-drag-active');
    lineDrag = null;
  }

  function currentDomStockLineIds() {
    const rows = Array.from(els.itemsPanel.querySelectorAll('.db-stock-line-row'));
    return rows
      .map((row) => Number.parseInt(row.dataset.lineId, 10))
      .filter((id) => Number.isFinite(id));
  }

  function applyStockLineOrder(lineIds) {
    const stockById = new Map(stockLineItems().map((item) => [Number(item.source_order_item_id), item]));
    const orderedStock = lineIds
      .map((lineId) => stockById.get(Number(lineId)))
      .filter(Boolean);

    if (orderedStock.length !== stockById.size) return;

    let stockIndex = 0;
    state.selectedLineItems = state.selectedLineItems.map((item) => {
      if (!isStockItem(item)) return item;
      const orderedItem = orderedStock[stockIndex] || item;
      stockIndex += 1;
      return {
        ...orderedItem,
        line_sort_order: stockIndex,
      };
    });
  }

  function markLineOrderDirty() {
    state.lineOrderDirty = true;
    scheduleLineOrderAutosave();
  }

  function scheduleLineOrderAutosave() {
    clearTimeout(lineOrderAutosaveTimer);
    lineOrderAutosaveTimer = window.setTimeout(() => {
      flushLineOrderAutosave();
    }, LINE_ORDER_AUTOSAVE_MS);
  }

  async function flushOrderAutosaves(options = {}) {
    await Promise.all([
      flushDesignAutosave(options),
      flushLineOrderAutosave(options),
    ]);
  }

  async function flushLineOrderAutosave(options = {}) {
    clearTimeout(lineOrderAutosaveTimer);
    if (!state.lineOrderDirty || !state.selectedJob?.source_order_id) return;
    await saveLineOrder(options);
  }

  async function saveLineOrder(options = {}) {
    const lineItemIds = stockLineItems()
      .map((item) => Number.parseInt(item.source_order_item_id, 10))
      .filter((id) => Number.isFinite(id));
    const signature = lineOrderSignature(lineItemIds);

    if (signature === state.lineOrderLastSavedSignature) {
      state.lineOrderDirty = false;
      return;
    }

    if (state.lineOrderSaving) {
      state.lineOrderSaveQueued = true;
      return;
    }

    state.lineOrderSaving = true;

    try {
      const response = await fetch(`/api/database/jobs/${encodeURIComponent(state.selectedJob.source_order_id)}/line-items/order`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ line_item_ids: lineItemIds }),
        keepalive: Boolean(options.keepalive),
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || `Request failed: ${response.status}`);
      }

      state.selectedLineItems = data.lineItems || state.selectedLineItems;
      state.lineOrderDirty = false;
      state.lineOrderLastSavedSignature = lineOrderSignature(stockLineItems());
      if (!options.keepalive && state.activeOrderTab === 'items') renderItemsPanel();
    } catch (err) {
      state.lineOrderDirty = true;
      console.error('Line item order autosave failed', err);
    } finally {
      state.lineOrderSaving = false;
      if (state.lineOrderSaveQueued) {
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
    state.lineOrderLastSavedSignature = '[]';
  }

  function stockLineItems() {
    return (state.selectedLineItems || []).filter(isStockItem);
  }

  function lineOrderSignature(value) {
    const ids = Array.isArray(value) ? value : [];
    return JSON.stringify(ids.map((item) => (
      typeof item === 'object' ? Number(item.source_order_item_id) : Number(item)
    )));
  }

  function renderNonStockRow(item, index) {
    return `
      <tr>
        <td class="db-row-selector">${index === 0 ? '&#9654;' : ''}</td>
        <td>${escapeHtml(item.line_description || item.style_name || '')}</td>
        <td>${escapeHtml(formatCurrency(item.unit_cost))}</td>
        <td>${escapeHtml(formatCurrency(item.unit_price))}</td>
        <td>${escapeHtml(formatNumber(item.quantity || 0))}</td>
        <td>${escapeHtml(formatVat(item.vat_rate))}</td>
      </tr>
    `;
  }

  function renderPositionRow(position, index) {
    const sourceId = position.source_order_position_id || '';
    return `
      <tr class="db-design-row" data-position-id="${escapeAttr(sourceId)}">
        <td class="db-row-selector">${index === 0 ? '&#9654;' : ''}</td>
        <td><textarea class="db-design-edit" data-design-field="position_name">${escapeHtml(position.position_name || '')}</textarea></td>
        <td><textarea class="db-design-edit" data-design-field="colour_notes">${escapeHtml(position.colour_notes || '')}</textarea></td>
        <td><textarea class="db-design-edit" data-design-field="design_ref">${escapeHtml(position.design_ref || '')}</textarea></td>
      </tr>
    `;
  }

  function handleDesignInput(event) {
    if (!event.target.closest('.db-design-edit')) return;
    ensureTrailingBlankDesignRow();
    state.designDirty = true;
    scheduleDesignAutosave();
  }

  function ensureTrailingBlankDesignRow() {
    const rows = Array.from(els.designPanel.querySelectorAll('.db-design-row'));
    const last = rows[rows.length - 1];
    if (!last || !designRowHasValue(last)) return;
    const tbody = last.parentElement;
    tbody.insertAdjacentHTML('beforeend', renderPositionRow({}, rows.length));
  }

  function designRowHasValue(row) {
    return ['position_name', 'colour_notes', 'design_ref'].some((field) => {
      const input = row.querySelector(`[data-design-field="${field}"]`);
      return input && input.value.trim();
    });
  }

  function collectDesignPositions() {
    return Array.from(els.designPanel.querySelectorAll('.db-design-row'))
      .map((row) => {
        const sourceId = Number.parseInt(row.dataset.positionId, 10);
        return {
          source_order_position_id: Number.isFinite(sourceId) ? sourceId : null,
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
      position_name: position.position_name || '',
      colour_notes: position.colour_notes || '',
      design_ref: position.design_ref || '',
    })));
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
      return;
    }

    if (state.designSaving) {
      state.designSaveQueued = true;
      return;
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
        throw new Error(data.error || `Request failed: ${response.status}`);
      }

      const hadNewRows = positions.some((position) => !position.source_order_position_id);
      state.selectedPositions = data.positions || positions;
      state.designDirty = false;
      state.designLastSavedSignature = designSignature(state.selectedPositions);
      if (hadNewRows) renderDesignPanel();
    } catch (err) {
      state.designDirty = true;
      console.error('Design autosave failed', err);
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

  function renderSmallItemBox(title, items) {
    return `
      <div class="db-small-item-box">
        <table class="db-legacy-table">
          <thead>
            <tr>
              <th>${escapeHtml(title)}</th>
              <th>Cost:</th>
              <th>Price:</th>
              <th>Qty:</th>
              <th>VAT:</th>
            </tr>
          </thead>
          <tbody>
            ${items.length ? items.map((item) => `
              <tr>
                <td>${escapeHtml(item.line_description || item.style_name || '')}</td>
                <td>${escapeHtml(formatCurrency(item.unit_cost))}</td>
                <td>${escapeHtml(formatCurrency(item.unit_price))}</td>
                <td>${escapeHtml(formatNumber(item.quantity || 0))}</td>
                <td>${escapeHtml(formatVat(item.vat_rate))}</td>
              </tr>
            `).join('') : '<tr class="db-gray-fill"><td colspan="5"></td></tr>'}
          </tbody>
        </table>
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

    els.mainTabs.forEach((tab) => {
      const active = (name === 'home' || name === 'new-order' || name === 'customers' || name === 'customer')
        ? tab.dataset.dbGo === 'home'
        : tab.dataset.dbGo === 'outstanding';
      tab.classList.toggle('active', active);
    });
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
    if (name === 'customers') return 'Customers';
    if (name === 'customer') return 'Customer';
    if (name === 'outstanding') return state.orderMode === 'all' ? 'All Orders' : 'Open Orders';
    if (name === 'order') return 'Open Orders';
    return 'Main Menu';
  }

  function setFooterTitle(title) {
    if (els.footerTitle) els.footerTitle.textContent = title;
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

  function formatVat(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '';
    const percent = number > 0 && number <= 1 ? number * 100 : number;
    return `${percent.toFixed(2)}%`;
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
    const response = await fetch(url, { cache: 'no-store', ...options });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
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
