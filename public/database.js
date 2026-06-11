(function () {
  const state = {
    loaded: false,
    loading: false,
    limit: 100,
    offset: 0,
    total: 0,
  };

  let els = {};
  let debounceTimer = null;

  document.addEventListener('DOMContentLoaded', initDatabaseTab);

  function initDatabaseTab() {
    els = {
      tab: document.querySelector('.nav-tabs li[data-tab="database"]'),
      searchBtn: document.getElementById('db-search-btn'),
      clearBtn: document.getElementById('db-clear-btn'),
      prevBtn: document.getElementById('db-prev'),
      nextBtn: document.getElementById('db-next'),
      pages: document.getElementById('db-pages'),
      search: document.getElementById('db-search'),
      customer: document.getElementById('db-customer'),
      type: document.getElementById('db-type'),
      year: document.getElementById('db-year'),
      statusFilter: document.getElementById('db-status-filter'),
      status: document.getElementById('db-status'),
      resultsCount: document.getElementById('db-results-count'),
      page: document.getElementById('db-page'),
      jobsBody: document.querySelector('#db-jobs-table tbody'),
    };

    if (!els.tab) return;

    els.tab.addEventListener('click', () => {
      if (!state.loaded) loadDatabase();
    });
    if (els.searchBtn) els.searchBtn.addEventListener('click', () => loadJobs({ reset: true }));
    els.clearBtn.addEventListener('click', clearFilters);
    els.prevBtn.addEventListener('click', () => movePage(-1));
    els.nextBtn.addEventListener('click', () => movePage(1));
    els.pages.addEventListener('click', (event) => {
      const btn = event.target.closest('button[data-page]');
      if (!btn) return;
      goToPage(Number(btn.dataset.page));
    });

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

    const params = new URLSearchParams(window.location.search);
    if (params.get('tab') === 'database' || window.location.hash === '#database') {
      els.tab.click();
    } else if (document.getElementById('tab-database')?.classList.contains('active')) {
      loadDatabase();
    }
  }

  async function loadDatabase(options = {}) {
    await loadJobs(options);
    state.loaded = true;
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
      <tr class="db-job-row" data-id="${job.source_order_id}" tabindex="0">
        <td><strong>${escapeHtml(job.order_no)}</strong></td>
        <td>${escapeHtml(job.customer_name || '-')}</td>
        <td><div class="db-job-title">${escapeHtml(job.job_title || '-')}</div></td>
        <td>${escapeHtml(job.order_type || '-')}</td>
        <td>${escapeHtml(formatDate(job.order_date))}</td>
        <td>${escapeHtml(formatNumber(job.total_quantity || 0))}</td>
        <td>${escapeHtml(formatNumber(job.line_item_count || 0))}</td>
        <td>${renderStatus(job.is_complete)}</td>
      </tr>
    `).join('');

    els.jobsBody.querySelectorAll('.db-job-row').forEach((row) => {
      row.addEventListener('click', () => openJob(row.dataset.id));
      row.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') openJob(row.dataset.id);
      });
    });
  }

  function openJob(id) {
    const sourceOrderId = Number.parseInt(id, 10);
    if (!Number.isFinite(sourceOrderId)) return;
    window.location.href = `/database-job.html?id=${sourceOrderId}`;
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

  function renderPaging() {
    const start = state.total ? state.offset + 1 : 0;
    const end = Math.min(state.offset + state.limit, state.total);
    const pageCount = Math.max(1, Math.ceil(state.total / state.limit));
    const currentPage = Math.floor(state.offset / state.limit) + 1;
    els.page.textContent = `${formatNumber(start)}-${formatNumber(end)}`;
    els.resultsCount.textContent = `${formatNumber(state.total)} results`;
    els.pages.innerHTML = renderPageButtons(currentPage, pageCount);
    els.prevBtn.disabled = state.offset <= 0;
    els.nextBtn.disabled = state.offset + state.limit >= state.total;
  }

  function setPagingDisabled(disabled) {
    els.prevBtn.disabled = disabled || state.offset <= 0;
    els.nextBtn.disabled = disabled || state.offset + state.limit >= state.total;
  }

  function goToPage(page) {
    const pageCount = Math.max(1, Math.ceil(state.total / state.limit));
    if (!Number.isFinite(page) || page < 1 || page > pageCount) return;
    state.offset = (page - 1) * state.limit;
    loadJobs();
  }

  function renderPageButtons(currentPage, pageCount) {
    const pages = visiblePages(currentPage, pageCount);
    return pages.map((page) => {
      if (page === 'gap') return '<span class="db-page-gap">...</span>';
      return `
        <button class="btn outline small db-page-btn ${page === currentPage ? 'active' : ''}"
                data-page="${page}"
                ${page === currentPage ? 'aria-current="page"' : ''}>
          ${page}
        </button>
      `;
    }).join('');
  }

  function visiblePages(currentPage, pageCount) {
    if (pageCount <= 7) {
      return Array.from({ length: pageCount }, (_, index) => index + 1);
    }

    const pages = [1];
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(pageCount - 1, currentPage + 1);

    if (start > 2) pages.push('gap');
    for (let page = start; page <= end; page += 1) pages.push(page);
    if (end < pageCount - 1) pages.push('gap');
    pages.push(pageCount);

    return pages;
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
