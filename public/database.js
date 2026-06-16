(function () {
  const PAGE_LIMIT = 100;
  const MAX_JOBS = 2500;
  const CUSTOMER_SEARCH_DELAY = 180;
  const DESIGN_AUTOSAVE_MS = 5000;

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
    activeOrderTab: 'details',
    newOrderSubmitting: false,
    selectedCustomer: null,
    customerResults: [],
    selectedJob: null,
    selectedLineItems: [],
    selectedPositions: [],
    designDirty: false,
    designSaving: false,
    designSaveQueued: false,
    designLastSavedSignature: '[]',
  };

  let els = {};
  let customerSearchTimer = 0;
  let databaseCustomerSearchTimer = 0;
  let customerSearchRequest = 0;
  let databaseCustomerRequest = 0;
  let designAutosaveTimer = 0;

  document.addEventListener('DOMContentLoaded', initDatabaseHub);

  function initDatabaseHub() {
    els = {
      root: document.getElementById('db-legacy-app'),
      sideTab: document.querySelector('.nav-tabs li[data-tab="database"]'),
      homeButton: document.getElementById('db-home-button'),
      mainTabs: Array.from(document.querySelectorAll('.db-main-tab')),
      views: Array.from(document.querySelectorAll('#db-legacy-app .db-view')),
      homeCountPrinting: document.getElementById('db-count-printing'),
      homeCountEmbroidery: document.getElementById('db-count-embroidery'),
      homeCountGifts: document.getElementById('db-count-gifts'),
      customersSearch: document.getElementById('db-customers-search'),
      customersBody: document.getElementById('db-customers-body'),
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

    els.root.addEventListener('click', handleRootClick);
    els.outstandingBody.addEventListener('click', handleOutstandingRowClick);
    els.outstandingBody.addEventListener('keydown', handleOutstandingRowKeydown);
    els.customersBody.addEventListener('click', handleDatabaseCustomerRowClick);
    els.customersBody.addEventListener('keydown', handleDatabaseCustomerRowKeydown);
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
    els.designPanel.addEventListener('input', handleDesignInput);
    window.addEventListener('pagehide', () => flushDesignAutosave({ keepalive: true }));
    window.addEventListener('beforeunload', () => flushDesignAutosave({ keepalive: true }));
    document.querySelectorAll('.nav-tabs li').forEach((tab) => {
      tab.addEventListener('click', () => {
        if (tab.dataset.tab !== 'database') flushDesignAutosave();
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

    if (button.id === 'db-home-button') {
      await flushDesignAutosave();
      showHome();
      return;
    }

    const go = button.dataset.dbGo;
    if (go === 'home') {
      await flushDesignAutosave();
      showHome();
      return;
    }
    if (go === 'outstanding') {
      await flushDesignAutosave();
      openOutstandingOrders('open');
      return;
    }

    const action = button.dataset.dbAction;
    if (action === 'new-order') {
      await flushDesignAutosave();
      showNewOrder();
      return;
    }
    if (action === 'open-orders') {
      await flushDesignAutosave();
      openOutstandingOrders('open');
      return;
    }
    if (action === 'all-orders') {
      await flushDesignAutosave();
      openOutstandingOrders('all');
      return;
    }
    if (action === 'customers') {
      await flushDesignAutosave();
      showCustomers();
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
        await flushDesignAutosave();
      }
      showOrderTab(orderTab);
    }
  }

  async function handleOutstandingRowClick(event) {
    const row = event.target.closest('tr[data-job-id]');
    if (!row) return;
    await flushDesignAutosave();
    openOrder(row.dataset.jobId, 'details');
  }

  async function handleOutstandingRowKeydown(event) {
    if (event.key !== 'Enter') return;
    const row = event.target.closest('tr[data-job-id]');
    if (!row) return;
    await flushDesignAutosave();
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

  function showHome() {
    showView('home');
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
    if (!els.newCustomerResults || !els.newCustomerInput) return;
    if (event.target === els.newCustomerInput || els.newCustomerResults.contains(event.target)) return;
    closeCustomerResults();
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
    const row = event.target.closest('tr[data-job-id]');
    if (!row) return;
    await flushDesignAutosave();
    openOrder(row.dataset.jobId, 'details');
  }

  async function handleDatabaseCustomerRowKeydown(event) {
    if (event.key !== 'Enter') return;
    const row = event.target.closest('tr[data-job-id]');
    if (!row) return;
    await flushDesignAutosave();
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
    const jobId = customer.latest_source_order_id || '';
    return `
      <tr class="db-customer-row" data-job-id="${escapeAttr(jobId)}" tabindex="0">
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
    await flushDesignAutosave();
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
          ${detailRow('Customer:', `${selectBox(job.customer_name, 'db-control-link')}<input class="db-legacy-input db-code-input" readonly value="${escapeAttr(job.customer_code || '')}">`)}
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

    els.itemsPanel.innerHTML = `
      <div class="db-items-layout">
        <div class="db-items-stock-frame">
          <table class="db-legacy-table db-items-table">
            <thead>
              <tr>
                <th class="db-row-selector"></th>
                <th>Stock code:</th>
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
            <tbody>${stockItems.length ? stockItems.map(renderStockRow).join('') : renderItemEmptyRow(11)}</tbody>
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
      </div>
    `;
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

  function renderStockRow(item, index) {
    return `
      <tr>
        <td class="db-row-selector">${index === 0 ? '&#9654;' : ''}</td>
        <td class="db-order-link">${escapeHtml(stockCode(item))}</td>
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
      flushDesignAutosave();
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

  function showView(name) {
    els.views.forEach((view) => {
      view.classList.toggle('active', view.id === `db-${name}-view`);
    });

    els.mainTabs.forEach((tab) => {
      const active = (name === 'home' || name === 'new-order' || name === 'customers')
        ? tab.dataset.dbGo === 'home'
        : tab.dataset.dbGo === 'outstanding';
      tab.classList.toggle('active', active);
    });
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

  function stockCode(item) {
    if (!item.source_product_id) return '';
    const raw = String(item.source_product_id);
    return /^\d+$/.test(raw) ? raw.padStart(8, '0') : raw;
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

  async function fetchJson(url) {
    const response = await fetch(url, { cache: 'no-store' });
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
