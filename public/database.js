(function () {
  const state = {
    loaded: false,
    loading: false,
    selectedId: null,
    limit: 50,
    offset: 0,
    total: 0,
  };

  let els = {};
  let debounceTimer = null;

  document.addEventListener('DOMContentLoaded', initDatabaseTab);

  function initDatabaseTab() {
    els = {
      tab: document.querySelector('.nav-tabs li[data-tab="database"]'),
      refresh: document.getElementById('db-refresh'),
      searchBtn: document.getElementById('db-search-btn'),
      clearBtn: document.getElementById('db-clear-btn'),
      prevBtn: document.getElementById('db-prev'),
      nextBtn: document.getElementById('db-next'),
      search: document.getElementById('db-search'),
      customer: document.getElementById('db-customer'),
      type: document.getElementById('db-type'),
      year: document.getElementById('db-year'),
      statusFilter: document.getElementById('db-status-filter'),
      status: document.getElementById('db-status'),
      summaryJobs: document.getElementById('db-summary-jobs'),
      summaryLines: document.getElementById('db-summary-lines'),
      summaryPositions: document.getElementById('db-summary-positions'),
      summaryImport: document.getElementById('db-summary-import'),
      resultsCount: document.getElementById('db-results-count'),
      page: document.getElementById('db-page'),
      jobsBody: document.querySelector('#db-jobs-table tbody'),
      detailTitle: document.getElementById('db-detail-title'),
      detailSubtitle: document.getElementById('db-detail-subtitle'),
      detailEmpty: document.getElementById('db-detail-empty'),
      detailContent: document.getElementById('db-detail-content'),
      detailFacts: document.getElementById('db-detail-facts'),
      detailComments: document.getElementById('db-detail-comments'),
      linesBody: document.querySelector('#db-lines-table tbody'),
      positionsBody: document.querySelector('#db-positions-table tbody'),
    };

    if (!els.tab) return;

    els.tab.addEventListener('click', () => {
      if (!state.loaded) loadDatabase();
    });
    els.refresh.addEventListener('click', () => loadDatabase({ reset: true }));
    els.searchBtn.addEventListener('click', () => loadJobs({ reset: true }));
    els.clearBtn.addEventListener('click', clearFilters);
    els.prevBtn.addEventListener('click', () => movePage(-1));
    els.nextBtn.addEventListener('click', () => movePage(1));

    [els.search, els.customer].forEach((input) => {
      input.addEventListener('input', () => {
        window.clearTimeout(debounceTimer);
        debounceTimer = window.setTimeout(() => loadJobs({ reset: true }), 350);
      });
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') loadJobs({ reset: true });
      });
    });

    [els.type, els.year, els.statusFilter].forEach((input) => {
      input.addEventListener('change', () => loadJobs({ reset: true }));
    });
  }

  async function loadDatabase(options = {}) {
    await Promise.all([
      loadSummary(),
      loadJobs(options),
    ]);
    state.loaded = true;
  }

  async function loadSummary() {
    try {
      const summary = await fetchJson('/api/database/summary');
      els.summaryJobs.textContent = formatNumber(summary.jobs);
      els.summaryLines.textContent = formatNumber(summary.lineItems);
      els.summaryPositions.textContent = formatNumber(summary.positions);
      els.summaryImport.textContent = summary.latestRun
        ? formatDate(summary.latestRun.finished_at || summary.latestRun.started_at)
        : '-';
    } catch (err) {
      setStatus(err.message, 'error');
    }
  }

  async function loadJobs(options = {}) {
    if (state.loading) return;
    if (options.reset) state.offset = 0;

    state.loading = true;
    setStatus('Loading jobs...');
    setPagingDisabled(true);

    try {
      const params = new URLSearchParams({
        limit: String(state.limit),
        offset: String(state.offset),
      });

      addParam(params, 'q', els.search.value);
      addParam(params, 'customer', els.customer.value);
      addParam(params, 'type', els.type.value);
      addParam(params, 'year', els.year.value);
      addParam(params, 'status', els.statusFilter.value);

      const data = await fetchJson(`/api/database/jobs?${params.toString()}`);
      state.total = data.total || 0;
      renderJobs(data.jobs || []);
      renderPaging();
      setStatus(`${formatNumber(state.total)} matching jobs`);
    } catch (err) {
      els.jobsBody.innerHTML = renderEmptyRow('Failed to load jobs', 8);
      setStatus(err.message, 'error');
    } finally {
      state.loading = false;
      setPagingDisabled(false);
    }
  }

  function renderJobs(jobs) {
    if (!jobs.length) {
      els.jobsBody.innerHTML = renderEmptyRow('No jobs found', 8);
      return;
    }

    els.jobsBody.innerHTML = jobs.map((job) => `
      <tr class="db-job-row ${state.selectedId === job.source_order_id ? 'selected' : ''}"
          data-id="${job.source_order_id}" tabindex="0">
        <td><strong>${escapeHtml(job.order_no)}</strong></td>
        <td>${escapeHtml(job.customer_name || '-')}</td>
        <td>
          <div class="db-job-title">${escapeHtml(job.job_title || '-')}</div>
          <div class="small muted">${escapeHtml(job.client_order_no || '')}</div>
        </td>
        <td>${escapeHtml(job.order_type || '-')}</td>
        <td>${escapeHtml(formatDate(job.order_date))}</td>
        <td>${escapeHtml(formatNumber(job.total_quantity || 0))}</td>
        <td>${escapeHtml(formatNumber(job.line_item_count || 0))}</td>
        <td>${renderStatus(job.is_complete)}</td>
      </tr>
    `).join('');

    els.jobsBody.querySelectorAll('.db-job-row').forEach((row) => {
      row.addEventListener('click', () => loadJobDetail(row.dataset.id));
      row.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') loadJobDetail(row.dataset.id);
      });
    });
  }

  async function loadJobDetail(id) {
    const sourceOrderId = Number.parseInt(id, 10);
    if (!Number.isFinite(sourceOrderId)) return;

    state.selectedId = sourceOrderId;
    markSelectedRow();
    els.detailTitle.textContent = 'Loading...';
    els.detailSubtitle.textContent = '';
    els.detailEmpty.classList.add('hidden');
    els.detailContent.classList.add('hidden');

    try {
      const data = await fetchJson(`/api/database/jobs/${sourceOrderId}`);
      renderJobDetail(data);
    } catch (err) {
      els.detailTitle.textContent = 'Job unavailable';
      els.detailSubtitle.textContent = err.message;
      els.detailEmpty.classList.remove('hidden');
      els.detailContent.classList.add('hidden');
    }
  }

  function renderJobDetail(data) {
    const job = data.job || {};
    const lineItems = data.lineItems || [];
    const positions = data.positions || [];

    els.detailTitle.textContent = `${job.order_no || '-'} - ${job.customer_name || 'Unknown customer'}`;
    els.detailSubtitle.textContent = job.job_title || job.order_type || '';
    els.detailEmpty.classList.add('hidden');
    els.detailContent.classList.remove('hidden');

    const facts = [
      ['Customer', job.customer_name],
      ['Customer code', job.customer_code],
      ['Job type', job.order_type],
      ['Order date', formatDate(job.order_date)],
      ['Delivery date', formatDate(job.delivery_date)],
      ['Status', job.is_complete ? 'Complete' : 'Open'],
      ['Client order', job.client_order_no],
      ['Invoice', job.invoice_no],
      ['Line items', lineItems.length],
      ['Positions', positions.length],
    ];

    els.detailFacts.innerHTML = facts.map(([label, value]) => `
      <div class="db-fact">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value || '-')}</strong>
      </div>
    `).join('');

    if (job.comments) {
      els.detailComments.textContent = job.comments;
      els.detailComments.classList.remove('hidden');
    } else {
      els.detailComments.textContent = '';
      els.detailComments.classList.add('hidden');
    }

    renderLineItems(lineItems);
    renderPositions(positions);
  }

  function renderLineItems(lineItems) {
    if (!lineItems.length) {
      els.linesBody.innerHTML = renderEmptyRow('No line items', 7);
      return;
    }

    els.linesBody.innerHTML = lineItems.map((item) => `
      <tr>
        <td>${escapeHtml(item.line_description || item.style_name || '-')}</td>
        <td>${escapeHtml(item.style_code || item.alt_style_code || '-')}</td>
        <td>
          <div>${escapeHtml(item.style_name || '-')}</div>
          <div class="small muted">${escapeHtml(item.product_type || '')}</div>
        </td>
        <td>${escapeHtml(item.colour || '-')}</td>
        <td>${escapeHtml(item.size || '-')}</td>
        <td><strong>${escapeHtml(formatNumber(item.quantity || 0))}</strong></td>
        <td>${escapeHtml(item.supplier_name || '-')}</td>
      </tr>
    `).join('');
  }

  function renderPositions(positions) {
    if (!positions.length) {
      els.positionsBody.innerHTML = renderEmptyRow('No positions', 3);
      return;
    }

    els.positionsBody.innerHTML = positions.map((position) => `
      <tr>
        <td>${escapeHtml(position.position_name || '-')}</td>
        <td>${escapeHtml(position.colour_notes || '-')}</td>
        <td>${escapeHtml(position.design_ref || '-')}</td>
      </tr>
    `).join('');
  }

  function movePage(direction) {
    const nextOffset = state.offset + (direction * state.limit);
    if (nextOffset < 0 || nextOffset >= state.total) return;
    state.offset = nextOffset;
    loadJobs();
  }

  function clearFilters() {
    els.search.value = '';
    els.customer.value = '';
    els.type.value = '';
    els.year.value = '';
    els.statusFilter.value = '';
    loadJobs({ reset: true });
  }

  function markSelectedRow() {
    els.jobsBody.querySelectorAll('.db-job-row').forEach((row) => {
      row.classList.toggle('selected', Number(row.dataset.id) === state.selectedId);
    });
  }

  function renderPaging() {
    const start = state.total ? state.offset + 1 : 0;
    const end = Math.min(state.offset + state.limit, state.total);
    els.page.textContent = `${formatNumber(start)}-${formatNumber(end)}`;
    els.resultsCount.textContent = `${formatNumber(state.total)} results`;
    els.prevBtn.disabled = state.offset <= 0;
    els.nextBtn.disabled = state.offset + state.limit >= state.total;
  }

  function setPagingDisabled(disabled) {
    els.prevBtn.disabled = disabled || state.offset <= 0;
    els.nextBtn.disabled = disabled || state.offset + state.limit >= state.total;
  }

  function setStatus(message, tone = 'info') {
    els.status.textContent = message || '';
    els.status.dataset.tone = tone;
  }

  function addParam(params, key, value) {
    const clean = String(value || '').trim();
    if (clean) params.set(key, clean);
  }

  async function fetchJson(url) {
    const response = await fetch(url);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `Request failed: ${response.status}`);
    }
    return payload;
  }

  function renderStatus(isComplete) {
    const label = isComplete ? 'Complete' : 'Open';
    const cls = isComplete ? 'db-status-complete' : 'db-status-open';
    return `<span class="badge ${cls}">${label}</span>`;
  }

  function renderEmptyRow(message, colspan) {
    return `<tr><td colspan="${colspan}" class="db-empty-cell">${escapeHtml(message)}</td></tr>`;
  }

  function formatNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return String(value || '0');
    return new Intl.NumberFormat('en-GB').format(number);
  }

  function formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
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
