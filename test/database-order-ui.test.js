const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'database.js'), 'utf8');

function section(start, end) {
  return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
}

function invoiceUi() {
  const requests = [];
  const alerts = [];
  const checkbox = { checked: true };
  const input = { value: '25/09/26' };
  const pages = { innerHTML: '' };
  const modal = { hidden: true, dataset: {}, setAttribute() {}, querySelector: selector => selector === '.db-order-ack-pages' ? pages : null };
  const state = {
    selectedJob: { source_order_id: 8001, order_no: 8101, invoice_no: 52001, invoice_date: '2026-08-01', dashboard_status: '' },
    orderMode: 'all', toInvoiceJobs: [],
  };
  const context = vm.createContext({
    state, alerts,
    els: { detailsPanel: { querySelector: selector => selector === '[data-db-manual-invoice-date]' ? checkbox : input } },
    databaseDocumentType: type => type,
    invoiceNotRequired: () => false,
    isJobInvoiceStatusEligible: () => false,
    openInvoiceCompletionModal: () => assert.fail('existing invoices do not require dashboard completion'),
    async fetchJson(url, options) {
      requests.push({ url, payload: JSON.parse(options.body) });
      return { job: { invoice_date: requests.at(-1).payload.invoice_date } };
    },
    renderDetailsPanel() { checkbox.checked = false; input.value = state.selectedJob.invoice_date; },
    validDateOrNow: value => new Date(value),
    formatDate: value => new Date(value).toISOString().slice(0, 10),
    ensureOrderAckModal: () => modal,
    databaseDocumentConfig: () => ({}),
    renderDatabaseDocument: () => state.documentGeneratedAt.toISOString().slice(0, 10),
    document: { body: { classList: { add() {} } } },
    window: { requestAnimationFrame() {} },
    alert: message => alerts.push(message),
    console: { error() {} },
  });
  for (const name of ['updateOutstandingJob', 'renderOrderHeaderStats', 'renderOutstandingOrders', 'renderToInvoiceJobs', 'hydrateOrderSelectors', 'syncOrderDocumentButtons', 'loadHomeMetrics']) context[name] = () => {};
  vm.runInContext([
    section('async function openDatabaseDocument', 'function openOutstandingReportDocument'),
    section('function applyGeneratedDocumentDateToOrderUi', 'function shouldRemoveFromOpenOrders'),
    section('function selectedManualInvoiceDate', 'function isJobInvoiceStatusEligible'),
    section('function legacyInputDateToIso', 'function addDays'),
  ].join('\n'), context);
  return { context, state, requests, alerts, input, checkbox, modal, pages };
}

test('editing a previously generated invoice saves its manual date before rendering and retains it on reopen', async () => {
  const ui = invoiceUi();
  await ui.context.openDatabaseDocument('invoice');
  assert.deepEqual(ui.requests[0], {
    url: '/api/database/jobs/8001',
    payload: { mark_invoiced: true, manual_invoice_date: true, invoice_date: '2026-09-25' },
  });
  assert.equal(ui.state.selectedJob.invoice_no, 52001);
  assert.equal(ui.state.selectedJob.invoice_date, '2026-09-25');
  assert.equal(ui.input.value, '2026-09-25');
  assert.equal(ui.pages.innerHTML, '2026-09-25');
  assert.equal(ui.modal.hidden, false);
  await ui.context.openDatabaseDocument('invoice');
  assert.equal(ui.requests.length, 1, 'ordinary reopen should not mutate the saved invoice');
  assert.equal(ui.pages.innerHTML, '2026-09-25');
});

test('a missing manual date or failed save keeps the PDF closed and preserves the stored date', async () => {
  for (const failure of ['missing', 'save']) {
    const ui = invoiceUi();
    if (failure === 'missing') ui.input.value = '';
    else ui.context.fetchJson = async () => { throw new Error('Save failed'); };
    await ui.context.openDatabaseDocument('invoice');
    assert.equal(ui.modal.hidden, true);
    assert.equal(ui.state.selectedJob.invoice_date, '2026-08-01');
    assert.equal(ui.alerts.length, 1);
    assert.equal(ui.checkbox.checked, true);
  }
});

function uploadUi(uploadFile) {
  const uploaded = [];
  const highlights = new Set();
  const state = { selectedJob: { source_order_id: 8001 }, selectedProofFiles: [], proofUploads: new Map(), proofViewer: { renderToken: 0 } };
  const context = vm.createContext({
    state,
    els: { proofPanel: {
      classList: { remove: name => highlights.delete(name), toggle: (name, enabled) => enabled ? highlights.add(name) : highlights.delete(name) },
      contains: target => target === 'child',
    } },
    DATABASE_VISUAL_UPLOAD_ERROR: 'Only PDF, JPEG and PNG',
    syncDatabaseProofUploadUi() {}, renderProofPanel() {},
    console: { warn() {} },
    async uploadDatabaseProofFile(jobId, file) {
      uploaded.push({ jobId, name: file.name });
      return uploadFile ? uploadFile(jobId, file) : file;
    },
  });
  vm.runInContext([
    section('function currentDatabaseProofUpload', 'function openDatabaseProofUploadPicker'),
    section('async function handleDatabaseProofUploadSelection', 'async function uploadDatabaseProofFile(sourceOrderId, file)'),
  ].join('\n'), context);
  return { context, state, uploaded, highlights };
}

function dropEvent(files) {
  return { prevented: false, preventDefault() { this.prevented = true; }, dataTransfer: { files, types: ['Files'] } };
}

test('the VISUAL panel highlights file drags and uploads multiple dropped files to the selected order', async () => {
  const ui = uploadUi();
  const event = dropEvent([{ name: 'proof.pdf' }, { name: 'design.png' }]);
  ui.context.handleDatabaseProofDragOver(event);
  assert.equal(event.prevented, true);
  assert.equal(event.dataTransfer.dropEffect, 'copy');
  assert.equal(ui.highlights.has('is-file-dragover'), true);
  ui.context.handleDatabaseProofDragLeave({ relatedTarget: 'child' });
  assert.equal(ui.highlights.has('is-file-dragover'), true);
  await ui.context.handleDatabaseProofDrop(event);
  assert.equal(ui.highlights.size, 0);
  assert.deepEqual(ui.uploaded, [{ jobId: 8001, name: 'proof.pdf' }, { jobId: 8001, name: 'design.png' }]);
  assert.equal(ui.state.selectedProofFiles.length, 2);
});

test('dropped files use picker validation and cannot start a second upload while one is running', async () => {
  let completeUpload;
  const ui = uploadUi(() => new Promise(resolve => { completeUpload = resolve; }));
  await ui.context.handleDatabaseProofDrop(dropEvent([{ name: 'unsupported.svg' }]));
  assert.equal(ui.uploaded.length, 0);
  assert.equal(ui.state.proofUploads.get('8001').error, 'Only PDF, JPEG and PNG');
  const first = ui.context.handleDatabaseProofDrop(dropEvent([{ name: 'proof.jpg' }]));
  await ui.context.handleDatabaseProofDrop(dropEvent([{ name: 'extra.png' }]));
  assert.equal(ui.uploaded.length, 1);
  const event = dropEvent([]);
  ui.context.handleDatabaseProofDragOver(event);
  assert.equal(event.dataTransfer.dropEffect, 'none');
  completeUpload({ name: 'proof.jpg' });
  await first;
  assert.equal(ui.state.proofUploads.get('8001').inFlight, false);
});

test('finishing an upload after navigating to another order does not attach it to that order UI', async () => {
  let completeUpload;
  const ui = uploadUi(() => new Promise(resolve => { completeUpload = resolve; }));
  const uploading = ui.context.handleDatabaseProofDrop(dropEvent([{ name: 'proof.pdf' }]));
  ui.state.selectedJob = { source_order_id: 8002 };
  completeUpload({ name: 'proof.pdf' });
  await uploading;
  assert.equal(ui.uploaded[0].jobId, 8001);
  assert.equal(ui.state.selectedProofFiles.length, 0);
});
