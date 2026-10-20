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
    section('async function openDatabaseDocument', 'async function openOutstandingReportDocument'),
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
    state, window: { confirm: () => true },
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
    section('function filterDatabaseDuplicateUploads', 'async function uploadDatabaseOrderFiles'),
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

test('Download all saves one ZIP, prevents duplicate clicks and restores the button after errors', async () => {
  const button = { disabled: false, textContent: 'Download all' };
  const message = { textContent: '' };
  let requests = 0, downloads = 0, resolveFetch;
  const link = { click() { downloads++; }, remove() {} };
  const context = vm.createContext({
    state: { selectedJob: { source_order_id: 50593, order_no: 51346 } },
    els: { proofPanel: { querySelector: () => message } },
    fetch: async url => { assert.equal(url, '/api/database/jobs/50593/visuals/download'); requests++; return new Promise(resolve => { resolveFetch = resolve; }); },
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
    document: { createElement: () => link, body: { appendChild() {} } },
    setTimeout() {},
  });
  vm.runInContext(section('async function downloadAllDatabaseVisuals', 'function orderVisualFromFile'), context);
  const pending = context.downloadAllDatabaseVisuals(button);
  await context.downloadAllDatabaseVisuals(button);
  assert.equal(requests, 1);
  assert.equal(button.disabled, true);
  resolveFetch({ ok: true, headers: { get: () => 'application/zip' }, blob: async () => ({}) });
  await pending;
  assert.equal(downloads, 1);
  assert.equal(link.download, 'order-51346-visuals.zip');
  assert.equal(button.disabled, false);
  context.fetch = async () => ({ ok: false, json: async () => ({ error: 'File unavailable' }) });
  await context.downloadAllDatabaseVisuals(button);
  assert.equal(downloads, 1);
  assert.equal(message.textContent, 'File unavailable');
  assert.equal(button.textContent, 'Download all');
});

function filesUi(uploadFile) {
  const destinations = [];
  const state = { selectedJob: { source_order_id: 51356 }, selectedFiles: [], selectedProofFiles: [{ name: 'proof.pdf' }], proofUploads: new Map() };
  const context = vm.createContext({ state, els: {}, window: { confirm: () => true }, renderFilesPanel() {}, async uploadDatabaseAttachmentFile(jobId, file, destination) {
    destinations.push({ jobId, file, destination });
    return uploadFile ? uploadFile(jobId, file) : file;
  }});
  vm.runInContext([
    section('function filterDatabaseDuplicateUploads', 'async function uploadDatabaseOrderFiles'),
    section('function databaseProofUploadForJob', 'function openDatabaseProofUploadPicker'),
    section('async function uploadDatabaseOrderFiles', 'function renderProofPanel'),
  ].join('\n'), context);
  return { context, state, destinations };
}

test('Files uploads accept spreadsheets and retain their destination while switching tabs', async () => {
  let finish;
  const ui = filesUi((_job, file) => new Promise(resolve => { finish = () => resolve(file); }));
  const pending = ui.context.uploadDatabaseOrderFiles([{ name: 'Hawks Netball - 2026.xlsx' }]);
  ui.state.activeOrderTab = 'proof';
  await ui.context.uploadDatabaseOrderFiles([{ name: 'duplicate.xlsx' }]);
  finish(); await pending;
  assert.equal(ui.destinations.length, 1);
  assert.equal(ui.destinations[0].destination.columnId, 'files_1');
  assert.equal(ui.destinations[0].jobId, 51356);
  assert.equal(ui.state.selectedFiles[0].name, 'Hawks Netball - 2026.xlsx');
  assert.equal(ui.state.selectedProofFiles[0].name, 'proof.pdf');
});

test('Files uploads cannot populate a different order after navigation and report partial failures', async () => {
  let finish;
  const ui = filesUi((_job, file) => new Promise(resolve => { finish = () => resolve(file); }));
  const pending = ui.context.uploadDatabaseOrderFiles([{ name: 'original.xlsx' }]);
  ui.state.selectedJob = { source_order_id: 51357 };
  finish(); await pending;
  assert.equal(ui.state.selectedFiles.length, 0);
  const partial = filesUi(async (_job, file) => { if (file.name === 'bad.xlsx') throw Error('Rejected'); return file; });
  await partial.context.uploadDatabaseOrderFiles([{ name: 'good.xlsx' }, { name: 'bad.xlsx' }]);
  assert.equal(partial.state.selectedFiles.length, 1);
  assert.match(partial.state.proofUploads.get('files:51356').error, /bad.xlsx: Rejected/);
});

test('shared uploader signs and saves to its explicit tab column, preserving general files', async () => {
  const calls = [];
  const context = vm.createContext({
    DATABASE_VISUAL_PROOF_COLUMN_ID: 'file_mky43tg9',
    FormData: class { append() {} },
    updateDatabaseAttachmentProgress() {},
    XMLHttpRequest: class {
      upload = {}; status = 200;
      responseText = JSON.stringify({ public_id: 'asset', secure_url: 'https://res.cloudinary.com/test/raw/upload/v1/asset.xlsx', resource_type: 'raw', format: 'xlsx' });
      open() {} send() { this.onload(); }
    },
    normalizeDatabaseProofFiles: files => files,
    isDatabasePdfFile: () => false,
    fetch: async () => ({ ok: true, json: async () => ({ public_id: 'asset', secure_url: 'https://res.cloudinary.com/test/raw/upload/v1/asset.xlsx', resource_type: 'raw', format: 'xlsx' }) }),
    async fetchJson(url, options) {
      const payload = JSON.parse(options.body); calls.push({ url, payload });
      return url.endsWith('/signature') ? { uploadUrl: 'https://api.cloudinary.com/upload', signature: 'test', apiKey: 'test' } : { file: payload };
    },
  });
  vm.runInContext(section('async function uploadDatabaseProofFile(sourceOrderId, file)', 'function databaseCloudinaryUploadError'), context);
  await context.uploadDatabaseAttachmentFile(51356, { name: 'Hawks Netball - 2026.xlsx' }, { columnId: 'files_1', columnTitle: 'FILES', upload_source: 'database_order_files_tab' });
  assert.equal(calls[0].payload.columnId, 'files_1');
  assert.equal(calls[1].payload.columnId, 'files_1');
  assert.equal(calls[1].payload.metadata.column_title, 'FILES');
  assert.equal(calls[1].payload.resourceType, 'raw');
  await context.uploadDatabaseProofFile(51356, { name: 'proof.png' });
  assert.equal(calls[2].payload.columnId, 'file_mky43tg9');
  assert.equal(calls[3].payload.columnId, 'file_mky43tg9');
  assert.equal(calls[3].payload.metadata.column_title, 'PROOF');
});

test('duplicate warning checks both tabs and the batch; cancel keeps only new names', () => {
  let prompt, accepted = false;
  const context = vm.createContext({
    state: { selectedProofFiles: [{ name: 'Proof.PDF' }], selectedFiles: [{ name: 'kit.xlsx' }] },
    window: { confirm(message) { prompt = message; return accepted; } },
  });
  vm.runInContext(section('function filterDatabaseDuplicateUploads', 'function renderDatabaseUploadProgress'), context);
  const files = [{ name: 'proof.pdf' }, { name: ' KIT.xlsx ' }, { name: 'new.png' }, { name: 'NEW.png' }];
  assert.deepEqual(Array.from(context.filterDatabaseDuplicateUploads(files), file => file.name), ['new.png']);
  assert.match(prompt, /already attached/);
  accepted = true;
  assert.equal(context.filterDatabaseDuplicateUploads(files), files);
});

test('upload progress reports transferred bytes and handles failed, malformed and timed-out uploads', async () => {
  let request;
  const events = [];
  const context = vm.createContext({ XMLHttpRequest: class {
    upload = {}; open(method, url) { this.method = method; this.url = url; } send() { request = this; }
  } });
  vm.runInContext(section('function uploadDatabaseCloudinaryFile', 'function syncDatabaseProofUploadUi'), context);
  const pending = context.uploadDatabaseCloudinaryFile('https://api.cloudinary.com/upload', {}, progress => events.push(progress));
  request.upload.onprogress({ lengthComputable: true, loaded: 25, total: 100 });
  assert.equal(events.at(-1).percent, 25);
  request.upload.onprogress({ lengthComputable: false });
  assert.equal(events.at(-1).percent, null);
  request.status = 200;
  request.responseText = JSON.stringify({ public_id: 'asset', secure_url: 'https://res.cloudinary.com/test/raw/upload/asset' });
  request.onload(); await pending;
  for (const scenario of ['network', 'timeout', 'invalid', 'rejected']) {
    const failure = context.uploadDatabaseCloudinaryFile('https://api.cloudinary.com/upload', {});
    if (scenario === 'network') request.onerror();
    if (scenario === 'timeout') request.ontimeout();
    if (scenario === 'invalid') { request.responseText = 'not json'; request.onload(); }
    if (scenario === 'rejected') { request.status = 400; request.responseText = '{"error":{"message":"Too large"}}'; request.onload(); }
    await assert.rejects(failure, /Upload|Too large/);
  }
});

test('late progress updates remain scoped to the starting order and tab', () => {
  const progress = { innerHTML: '' }, state = { selectedJob: { source_order_id: 1 }, proofUploads: new Map() };
  state.proofUploads.set('files:1', { inFlight: true, current: 1, total: 2 });
  const context = vm.createContext({ state, els: { filesPanel: { querySelector: () => progress } },
    escapeHtml: text => text, escapeAttr: text => text });
  vm.runInContext(section('function renderDatabaseUploadProgress', 'async function uploadDatabaseOrderFiles')
    + section('function databaseProofUploadForJob', 'function openDatabaseProofUploadPicker'), context);
  context.updateDatabaseAttachmentProgress(1, 'files', { percent: 42, phase: 'Uploading' });
  assert.match(progress.innerHTML, /value="42"/);
  assert.match(progress.innerHTML, /1 of 2/);
  state.selectedJob.source_order_id = 2;
  context.updateDatabaseAttachmentProgress(1, 'files', { percent: 75, phase: 'Uploading' });
  assert.match(progress.innerHTML, /value="42"/);
  assert.equal(state.proofUploads.get('files:1').percent, 75);
});

test('single attachment downloads capture the file identity and filename before navigation', async () => {
  let resolveFetch, downloads = 0, requested;
  const status = { textContent: '' }, button = { disabled: false, dataset: { dbAttachmentDownload: '0', dbAttachmentKind: 'files' }, closest: () => ({ querySelector: () => status }) };
  const link = { click() { downloads++; }, remove() {} };
  const state = { selectedJob: { source_order_id: 1 }, selectedFiles: [{ id: 44, name: 'kit.xlsx', source_order_id: 1 }] };
  const context = vm.createContext({ state, databaseVisualFileId: file => file.id,
    fetch: async url => { requested = url; return new Promise(resolve => { resolveFetch = resolve; }); },
    URL: { createObjectURL: () => 'blob:file', revokeObjectURL() {} },
    document: { createElement: () => link, body: { appendChild() {} } }, setTimeout() {},
  });
  vm.runInContext(section('async function downloadDatabaseAttachment', 'async function downloadAllDatabaseVisuals'), context);
  const pending = context.downloadDatabaseAttachment(button);
  await context.downloadDatabaseAttachment(button);
  state.selectedJob = { source_order_id: 2 }; state.selectedFiles = [];
  resolveFetch({ ok: true, headers: { get: () => 'attachment; filename="kit.xlsx"' }, blob: async () => ({}) });
  await pending;
  assert.equal(requested, '/api/database/jobs/1/files/44/download');
  assert.equal(downloads, 1); assert.equal(link.download, 'kit.xlsx'); assert.equal(button.disabled, false);
});

test('order loading uses the shared circle in every tab and errors replace every spinner', () => {
  const panel = () => ({ innerHTML: '' });
  const els = { detailsPanel: panel(), itemsPanel: panel(), designPanel: panel(), proofPanel: panel(), filesPanel: panel(), orderTitle: {}, orderNumber: {} };
  const context = vm.createContext({ els, state: {}, escapeAttr: text => text, escapeHtml: text => text,
    resetDesignAutosaveState() {}, resetJobAutosaveState() {}, syncOrderDocumentButtons() {}, renderOrderHeaderStats() {} });
  vm.runInContext(section('function renderDatabaseLoading', 'function renderStatusRow')
    + section('function setOrderLoading', 'function renderOrder()'), context);
  context.setOrderLoading();
  for (const name of ['detailsPanel', 'itemsPanel', 'designPanel', 'proofPanel', 'filesPanel']) assert.match(els[name].innerHTML, /board-loading-spinner/);
  assert.equal(els.orderTitle.value, '');
  context.renderOrderError('Request failed');
  for (const name of ['detailsPanel', 'itemsPanel', 'designPanel', 'proofPanel', 'filesPanel']) {
    assert.match(els[name].innerHTML, /Request failed/);
    assert.doesNotMatch(els[name].innerHTML, /board-loading-spinner/);
  }
});
