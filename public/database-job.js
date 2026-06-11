(function () {
  document.addEventListener('DOMContentLoaded', initDatabaseJobPage);

  async function initDatabaseJobPage() {
    const els = {
      heading: document.getElementById('db-job-heading'),
      subtitle: document.getElementById('db-job-subtitle'),
      status: document.getElementById('db-job-status'),
      facts: document.getElementById('db-job-facts'),
      comments: document.getElementById('db-job-comments'),
      lineCount: document.getElementById('db-job-line-count'),
      positionCount: document.getElementById('db-job-position-count'),
      linesBody: document.querySelector('#db-job-lines-table tbody'),
      positionsBody: document.querySelector('#db-job-positions-table tbody'),
    };

    const id = new URLSearchParams(window.location.search).get('id');
    if (!id) {
      showError(els, 'No job selected');
      return;
    }

    try {
      setStatus(els, 'Loading job...');
      const data = await fetchJson(`/api/database/jobs/${encodeURIComponent(id)}`);
      renderJob(els, data);
    } catch (err) {
      showError(els, err.message);
    }
  }

  function renderJob(els, data) {
    const job = data.job || {};
    const lineItems = data.lineItems || [];
    const positions = data.positions || [];

    els.heading.textContent = `${job.order_no || '-'} - ${job.customer_name || 'Unknown customer'}`;
    els.subtitle.textContent = job.job_title || '';
    setStatus(els, '');

    const facts = [
      ['Customer', job.customer_name],
      ['Contact', job.contact_name],
      ['Email', job.contact_email],
      ['Phone', job.contact_phone],
      ['Mobile', job.contact_mobile],
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

    els.facts.innerHTML = facts.map(([label, value]) => `
      <div class="db-fact">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value || '-')}</strong>
      </div>
    `).join('');

    if (job.comments) {
      els.comments.textContent = job.comments;
      els.comments.classList.remove('hidden');
    } else {
      els.comments.textContent = '';
      els.comments.classList.add('hidden');
    }

    renderLineItems(els, lineItems);
    renderPositions(els, positions);
  }

  function renderLineItems(els, lineItems) {
    els.lineCount.textContent = `${formatNumber(lineItems.length)} lines`;

    if (!lineItems.length) {
      els.linesBody.innerHTML = renderEmptyRow('No line items', 10);
      return;
    }

    els.linesBody.innerHTML = lineItems.map((item) => `
      <tr>
        <td class="db-line-description">${escapeHtml(item.line_description || item.style_name || '-')}</td>
        <td>${escapeHtml(item.style_code || item.alt_style_code || '-')}</td>
        <td>${escapeHtml(item.style_name || '-')}</td>
        <td>${escapeHtml(item.product_type || '-')}</td>
        <td>${escapeHtml(item.colour || '-')}</td>
        <td>${escapeHtml(item.size || '-')}</td>
        <td><strong>${escapeHtml(formatNumber(item.quantity || 0))}</strong></td>
        <td>${escapeHtml(item.supplier_name || '-')}</td>
        <td>${escapeHtml(formatCurrency(item.unit_price))}</td>
        <td>${escapeHtml(formatCurrency(item.unit_cost))}</td>
      </tr>
    `).join('');
  }

  function renderPositions(els, positions) {
    els.positionCount.textContent = `${formatNumber(positions.length)} positions`;

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

  function setStatus(els, message) {
    els.status.textContent = message || '';
  }

  function showError(els, message) {
    els.heading.textContent = 'Job unavailable';
    els.subtitle.textContent = '';
    setStatus(els, message);
    els.facts.innerHTML = '';
    els.linesBody.innerHTML = renderEmptyRow('No line items', 10);
    els.positionsBody.innerHTML = renderEmptyRow('No positions', 3);
  }

  async function fetchJson(url) {
    const response = await fetch(url);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `Request failed: ${response.status}`);
    }
    return payload;
  }

  function renderEmptyRow(message, colspan) {
    return `<tr><td colspan="${colspan}" class="db-empty-cell">${escapeHtml(message)}</td></tr>`;
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

  function formatCurrency(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '-';
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
    }).format(number);
  }

  function formatNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return String(value || '0');
    return new Intl.NumberFormat('en-GB').format(number);
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
