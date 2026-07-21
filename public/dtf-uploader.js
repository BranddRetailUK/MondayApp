(function () {
  const WIDTH_MM = 550;
  const HEIGHT_MM = 1000;
  const MM_TO_POINTS = 72 / 25.4;
  const PAGE_TOLERANCE_POINTS = 3;
  const MAX_FILES = 40;
  const MAX_BYTES = 250 * 1024 * 1024;
  const MAX_QUANTITY = 99;
  const MAX_LAYOUT_ITEMS = 80;
  const CHUNK_UPLOAD_THRESHOLD_BYTES = 100 * 1024 * 1024;
  const CHUNK_UPLOAD_BYTES = 20 * 1024 * 1024;
  const UNIT_PRICE_PENCE = 1400;
  const VAT_RATE = 0.2;
  const DB_NAME = 'ultimateHubDtf';
  const DB_STORE = 'drafts';
  const backgrounds = { LIGHT: '#ffffff', GREY: '#808080', DARK: '#111111' };
  let els = {};
  let user = null;
  let saveTimer = 0;
  let dragState = null;
  let state = freshState();

  document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('dtf-app')) return;
    cacheElements();
    attachEvents();
    Promise.resolve(window.ultimateHubUserPromise).then(async (nextUser) => {
      if (!nextUser) return;
      user = nextUser;
      await restoreDrafts();
      renderAll();
    });
  });

  function freshState() {
    return {
      sheets: [],
      selectedSheetId: '',
      mode: 'upload',
      gapMm: 10,
      background: 'LIGHT',
      artworks: [],
      selectedArtworkId: '',
      nextZ: 1,
      busy: false,
    };
  }

  function cacheElements() {
    els = {
      app: document.getElementById('dtf-app'),
      modeButtons: Array.from(document.querySelectorAll('[data-dtf-mode]')),
      uploadView: document.getElementById('dtf-upload-view'),
      layoutView: document.getElementById('dtf-layout-view'),
      sheetInput: document.getElementById('dtf-sheet-input'),
      chooseSheets: document.getElementById('dtf-choose-sheets'),
      sheetList: document.getElementById('dtf-sheet-list'),
      pdfPreview: document.getElementById('dtf-pdf-preview'),
      pdfCanvas: document.getElementById('dtf-pdf-canvas'),
      previewEmpty: document.getElementById('dtf-preview-empty'),
      previewTitle: document.getElementById('dtf-preview-title'),
      sheetCount: document.getElementById('dtf-sheet-count'),
      subtotal: document.getElementById('dtf-subtotal'),
      vat: document.getElementById('dtf-vat'),
      total: document.getElementById('dtf-total'),
      totalLarge: document.getElementById('dtf-total-large'),
      send: document.getElementById('dtf-send-sheets'),
      uploadFeedback: document.getElementById('dtf-upload-feedback'),
      gap: document.getElementById('dtf-layout-gap'),
      backgroundButtons: Array.from(document.querySelectorAll('[data-dtf-background]')),
      artworkInput: document.getElementById('dtf-artwork-input'),
      addArtwork: document.getElementById('dtf-add-artwork'),
      artworkList: document.getElementById('dtf-artwork-list'),
      layoutCanvas: document.getElementById('dtf-layout-canvas'),
      layoutEmpty: document.getElementById('dtf-layout-empty'),
      layoutFeedback: document.getElementById('dtf-layout-feedback'),
      addToOrder: document.getElementById('dtf-add-to-order'),
      adminBody: document.getElementById('db-dtf-jobs-body'),
      adminFilter: document.getElementById('db-dtf-status-filter'),
      adminRefresh: document.getElementById('db-dtf-refresh'),
      adminLoadMore: document.getElementById('db-dtf-load-more'),
      adminDetail: document.getElementById('db-dtf-detail'),
      adminDetailNumber: document.getElementById('db-dtf-detail-number'),
      adminDetailCustomer: document.getElementById('db-dtf-detail-customer'),
      adminDetailStatus: document.getElementById('db-dtf-detail-status'),
      adminDetailPricing: document.getElementById('db-dtf-detail-pricing'),
      adminFilesBody: document.getElementById('db-dtf-files-body'),
    };
  }

  function attachEvents() {
    els.modeButtons.forEach((button) => button.addEventListener('click', () => setMode(button.dataset.dtfMode)));
    els.chooseSheets.addEventListener('click', () => els.sheetInput.click());
    els.sheetInput.addEventListener('change', () => addSheets(els.sheetInput.files));
    attachDropTarget(els.pdfPreview, (files) => addSheets(files));
    els.sheetList.addEventListener('click', handleSheetClick);
    els.sheetList.addEventListener('change', handleSheetChange);
    els.send.addEventListener('click', submitSheets);
    document.querySelectorAll('[data-dtf-gap]').forEach((button) => {
      button.addEventListener('click', () => updateGap(state.gapMm + Number(button.dataset.dtfGap)));
    });
    els.gap.addEventListener('change', () => updateGap(Number(els.gap.value)));
    els.backgroundButtons.forEach((button) => button.addEventListener('click', () => {
      state.background = button.dataset.dtfBackground;
      renderLayout();
      scheduleSave();
    }));
    els.addArtwork.addEventListener('click', () => els.artworkInput.click());
    els.layoutEmpty.addEventListener('click', () => els.artworkInput.click());
    els.artworkInput.addEventListener('change', () => addArtworkFiles(els.artworkInput.files));
    attachDropTarget(els.layoutCanvas, (files) => addArtworkFiles(files));
    els.artworkList.addEventListener('click', handleArtworkClick);
    els.artworkList.addEventListener('change', handleArtworkChange);
    els.layoutCanvas.addEventListener('pointerdown', startPieceDrag);
    els.addToOrder.addEventListener('click', addLayoutToOrder);
    els.adminRefresh?.addEventListener('click', () => loadAdminJobs(true));
    els.adminFilter?.addEventListener('change', () => loadAdminJobs(true));
    els.adminLoadMore?.addEventListener('click', () => loadAdminJobs(false));
    els.adminBody?.addEventListener('click', (event) => {
      const row = event.target.closest('[data-dtf-admin-job]');
      if (row) loadAdminDetail(row.dataset.dtfAdminJob);
    });
    els.adminDetailStatus?.addEventListener('change', updateAdminStatus);
    window.addEventListener('pagehide', () => saveDrafts());
  }

  function attachDropTarget(element, callback) {
    ['dragenter', 'dragover'].forEach((name) => element.addEventListener(name, (event) => {
      event.preventDefault();
      element.classList.add('dragover');
    }));
    ['dragleave', 'drop'].forEach((name) => element.addEventListener(name, (event) => {
      event.preventDefault();
      element.classList.remove('dragover');
    }));
    element.addEventListener('drop', (event) => callback(event.dataTransfer?.files));
  }

  function setMode(mode) {
    state.mode = mode === 'layout' ? 'layout' : 'upload';
    els.modeButtons.forEach((button) => button.classList.toggle('active', button.dataset.dtfMode === state.mode));
    els.uploadView.classList.toggle('active', state.mode === 'upload');
    els.layoutView.classList.toggle('active', state.mode === 'layout');
    scheduleSave();
  }

  async function addSheets(fileList) {
    const files = Array.from(fileList || []);
    els.sheetInput.value = '';
    if (!files.length) return;
    if (state.sheets.length + files.length > MAX_FILES) {
      return setFeedback(els.uploadFeedback, `A job can contain no more than ${MAX_FILES} PDFs.`, 'error');
    }
    for (const file of files) {
      const entry = {
        clientId: crypto.randomUUID(),
        file,
        quantity: 1,
        validation: 'checking',
        error: '',
      };
      state.sheets.push(entry);
      if (!state.selectedSheetId) state.selectedSheetId = entry.clientId;
      renderSheets();
      await validateSheet(entry);
    }
    renderSheets();
    renderPricing();
    await renderSelectedSheet();
    scheduleSave();
  }

  async function validateSheet(entry) {
    if (!/\.pdf$/i.test(entry.file.name) || (entry.file.type && entry.file.type !== 'application/pdf')) {
      entry.validation = 'error';
      entry.error = 'Only PDF files are accepted.';
      return;
    }
    if (entry.file.size < 1 || entry.file.size > MAX_BYTES) {
      entry.validation = 'error';
      entry.error = 'PDF must be between 1 byte and 250MB.';
      return;
    }
    try {
      const pdf = await loadPdf(entry.file);
      if (pdf.numPages !== 1) throw new Error('PDF must contain exactly one page.');
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1 });
      const widthOk = Math.abs(viewport.width - WIDTH_MM * MM_TO_POINTS) <= PAGE_TOLERANCE_POINTS;
      const heightOk = Math.abs(viewport.height - HEIGHT_MM * MM_TO_POINTS) <= PAGE_TOLERANCE_POINTS;
      if (!widthOk || !heightOk) throw new Error('PDF page must be 550 × 1000mm portrait.');
      entry.validation = 'valid';
      entry.error = '';
    } catch (error) {
      entry.validation = 'error';
      entry.error = error.message || 'PDF could not be validated.';
    }
  }

  function handleSheetClick(event) {
    const row = event.target.closest('[data-sheet-id]');
    if (!row) return;
    const id = row.dataset.sheetId;
    const entry = state.sheets.find((sheet) => sheet.clientId === id);
    if (!entry) return;
    const action = event.target.closest('[data-sheet-action]')?.dataset.sheetAction;
    if (action === 'remove') {
      state.sheets = state.sheets.filter((sheet) => sheet !== entry);
      if (state.selectedSheetId === id) state.selectedSheetId = state.sheets[0]?.clientId || '';
    } else if (action === 'minus' || action === 'plus') {
      entry.quantity = clamp(entry.quantity + (action === 'plus' ? 1 : -1), 1, MAX_QUANTITY);
    } else {
      state.selectedSheetId = id;
    }
    renderSheets();
    renderPricing();
    renderSelectedSheet();
    scheduleSave();
  }

  function handleSheetChange(event) {
    const input = event.target.closest('[data-sheet-quantity]');
    if (!input) return;
    const entry = state.sheets.find((sheet) => sheet.clientId === input.dataset.sheetQuantity);
    if (!entry) return;
    entry.quantity = clamp(Number.parseInt(input.value, 10) || 1, 1, MAX_QUANTITY);
    renderSheets();
    renderPricing();
    scheduleSave();
  }

  function renderSheets() {
    if (!state.sheets.length) {
      els.sheetList.innerHTML = '<div class="dtf-empty-list">No gang sheets added yet.</div>';
    } else {
      els.sheetList.innerHTML = state.sheets.map((entry) => `
        <div class="dtf-sheet-row ${entry.clientId === state.selectedSheetId ? 'active' : ''}" data-sheet-id="${escapeAttr(entry.clientId)}">
          <div><div class="dtf-sheet-name">${escapeHtml(entry.file.name)}</div><div class="dtf-sheet-meta">${formatBytes(entry.file.size)}</div></div>
          <div class="dtf-sheet-actions">
            <button class="dtf-mini-button" type="button" data-sheet-action="minus" aria-label="Decrease quantity">−</button>
            <input class="dtf-sheet-qty" type="number" min="1" max="99" value="${entry.quantity}" data-sheet-quantity="${escapeAttr(entry.clientId)}" aria-label="Quantity">
            <button class="dtf-mini-button" type="button" data-sheet-action="plus" aria-label="Increase quantity">+</button>
            <button class="dtf-mini-button dtf-remove-button" type="button" data-sheet-action="remove" aria-label="Remove PDF">×</button>
          </div>
          <div class="dtf-validation ${entry.validation}">${entry.validation === 'checking' ? 'Checking page size…' : entry.validation === 'valid' ? 'One 550 × 1000mm page' : escapeHtml(entry.error)}</div>
        </div>`).join('');
    }
    els.send.disabled = state.busy || !state.sheets.length || state.sheets.some((entry) => entry.validation !== 'valid');
  }

  async function renderSelectedSheet() {
    const entry = state.sheets.find((sheet) => sheet.clientId === state.selectedSheetId);
    if (!entry || entry.validation !== 'valid') {
      els.pdfCanvas.hidden = true;
      els.previewEmpty.hidden = false;
      els.previewTitle.textContent = entry?.file?.name || 'Select a gang sheet to preview';
      return;
    }
    els.previewTitle.textContent = entry.file.name;
    try {
      const pdf = await loadPdf(entry.file);
      const page = await pdf.getPage(1);
      const available = Math.max(260, Math.min(760, els.pdfPreview.clientWidth - 32));
      const viewportBase = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: available / viewportBase.width });
      const context = els.pdfCanvas.getContext('2d');
      els.pdfCanvas.width = Math.ceil(viewport.width);
      els.pdfCanvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: context, viewport }).promise;
      els.previewEmpty.hidden = true;
      els.pdfCanvas.hidden = false;
    } catch {
      els.pdfCanvas.hidden = true;
      els.previewEmpty.hidden = false;
    }
  }

  function renderPricing() {
    const count = state.sheets.reduce((sum, entry) => sum + entry.quantity, 0);
    const subtotal = count * UNIT_PRICE_PENCE;
    const vat = Math.round(subtotal * VAT_RATE);
    els.sheetCount.textContent = String(count);
    els.subtotal.textContent = money(subtotal);
    els.vat.textContent = money(vat);
    els.total.textContent = money(subtotal + vat);
    els.totalLarge.textContent = money(subtotal + vat);
  }

  async function submitSheets() {
    if (state.busy || !state.sheets.length || state.sheets.some((entry) => entry.validation !== 'valid')) return;
    state.busy = true;
    renderSheets();
    setFeedback(els.uploadFeedback, 'Creating DTF job…');
    try {
      const created = await api('/api/dtf/jobs', {
        method: 'POST',
        body: JSON.stringify({
          files: state.sheets.map((entry) => ({
            clientId: entry.clientId,
            name: entry.file.name,
            size: entry.file.size,
            type: 'application/pdf',
            quantity: entry.quantity,
          })),
        }),
      });
      const serverFiles = new Map(created.files.map((file) => [file.clientId, file]));
      let failed = 0;
      for (let index = 0; index < state.sheets.length; index += 1) {
        const entry = state.sheets[index];
        const serverFile = serverFiles.get(entry.clientId);
        setFeedback(els.uploadFeedback, `Uploading ${index + 1} of ${state.sheets.length}: ${entry.file.name}`);
        try {
          const signed = await api('/api/dtf/uploads/sign', {
            method: 'POST',
            body: JSON.stringify({ jobId: created.job.id, fileId: serverFile.id }),
          });
          const uploadData = await uploadSignedPdf(entry.file, signed, (percent) => {
            setFeedback(els.uploadFeedback, `Uploading ${index + 1} of ${state.sheets.length}: ${entry.file.name} (${percent}%)`);
          });
          await api('/api/dtf/uploads/finalize', {
            method: 'POST',
            body: JSON.stringify({ jobId: created.job.id, fileId: serverFile.id, success: true, publicId: uploadData.public_id }),
          });
        } catch (error) {
          failed += 1;
          await api('/api/dtf/uploads/finalize', {
            method: 'POST',
            body: JSON.stringify({ jobId: created.job.id, fileId: serverFile.id, success: false, errorMessage: error.message || 'Upload failed.' }),
          }).catch(() => undefined);
        }
      }
      if (failed) throw new Error(`${failed} PDF${failed === 1 ? '' : 's'} failed to upload. Submit a new job to retry.`);
      state.sheets = [];
      state.selectedSheetId = '';
      await deleteDraft('upload');
      renderAll();
      setFeedback(els.uploadFeedback, `${created.job.jobNumber} received successfully.`, 'success');
      window.DtfAdmin?.refresh?.();
    } catch (error) {
      setFeedback(els.uploadFeedback, error.message || 'The DTF job could not be sent.', 'error');
    } finally {
      state.busy = false;
      renderSheets();
    }
  }

  async function uploadSignedPdf(file, signed, onProgress) {
    const chunked = file.size > CHUNK_UPLOAD_THRESHOLD_BYTES;
    const ranges = chunked
      ? window.DtfLayout.uploadRanges(file.size, CHUNK_UPLOAD_BYTES)
      : [{ start: 0, endExclusive: file.size, end: file.size - 1 }];
    const uploadId = chunked ? crypto.randomUUID() : '';
    let completed;
    for (const range of ranges) {
      const form = new FormData();
      form.append('file', file.slice(range.start, range.endExclusive, 'application/pdf'), file.name);
      form.append('api_key', signed.apiKey);
      form.append('timestamp', String(signed.timestamp));
      form.append('signature', signed.signature);
      form.append('public_id', signed.publicId);
      form.append('type', signed.type);
      form.append('overwrite', 'false');
      const headers = chunked ? {
        'X-Unique-Upload-Id': uploadId,
        'Content-Range': `bytes ${range.start}-${range.end}/${file.size}`,
      } : undefined;
      const response = await fetch(signed.uploadUrl, { method: 'POST', body: form, headers });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || `Cloudinary upload failed (${response.status}).`);
      completed = data;
      onProgress?.(Math.round((range.endExclusive / file.size) * 100));
    }
    if (!completed?.public_id) throw new Error('Cloudinary did not confirm the completed upload.');
    return completed;
  }

  async function addArtworkFiles(fileList) {
    const files = Array.from(fileList || []);
    els.artworkInput.value = '';
    for (const file of files) {
      if (state.artworks.length >= MAX_LAYOUT_ITEMS) {
        setFeedback(els.layoutFeedback, `Layouts are limited to ${MAX_LAYOUT_ITEMS} pieces.`, 'error');
        break;
      }
      try {
        setFeedback(els.layoutFeedback, `Reading ${file.name}…`);
        const source = await readArtwork(file);
        const size = defaultArtworkSize(source.widthPx, source.heightPx);
        const id = crypto.randomUUID();
        const item = {
          id,
          groupId: id,
          name: file.name,
          sourceType: source.sourceType,
          file,
          renderFile: source.renderFile,
          previewUrl: source.previewUrl,
          widthPx: source.widthPx,
          heightPx: source.heightPx,
          widthMm: size.widthMm,
          heightMm: size.heightMm,
          xMm: 0,
          yMm: 0,
          rotationDeg: 0,
          zIndex: state.nextZ++,
        };
        const next = repack([...state.artworks, item], state.gapMm);
        if (!next) throw new Error(`${file.name} does not fit on the sheet.`);
        state.artworks = next;
        state.selectedArtworkId = id;
        setFeedback(els.layoutFeedback, '');
      } catch (error) {
        setFeedback(els.layoutFeedback, error.message || `Could not add ${file.name}.`, 'error');
      }
    }
    renderLayout();
    scheduleSave();
  }

  async function readArtwork(file) {
    if (/\.png$/i.test(file.name) || file.type === 'image/png') {
      const dimensions = await imageDimensions(file);
      return { sourceType: 'png', renderFile: file, previewUrl: URL.createObjectURL(file), ...dimensions };
    }
    if (/\.eps$/i.test(file.name) || file.type === 'application/postscript') {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch('/api/dtf/layouts/eps-preview', { method: 'POST', credentials: 'include', body: form });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'EPS conversion failed.');
      }
      const blob = await response.blob();
      const renderFile = new File([blob], `${file.name.replace(/\.eps$/i, '')}-300dpi.png`, { type: 'image/png' });
      const dimensions = await imageDimensions(renderFile);
      return { sourceType: 'eps', renderFile, previewUrl: URL.createObjectURL(renderFile), ...dimensions };
    }
    if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
      const pdf = await loadPdf(file);
      if (pdf.numPages !== 1) throw new Error('PDF artwork must contain exactly one page.');
      const page = await pdf.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(2, 900 / base.width) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('PDF preview failed.')), 'image/png'));
      const renderFile = new File([blob], `${file.name.replace(/\.pdf$/i, '')}-preview.png`, { type: 'image/png' });
      return { sourceType: 'pdf', renderFile, previewUrl: URL.createObjectURL(renderFile), widthPx: base.width, heightPx: base.height };
    }
    throw new Error('Artwork must be PNG, EPS, or a one-page PDF.');
  }

  function handleArtworkClick(event) {
    const actionButton = event.target.closest('[data-art-action]');
    const id = actionButton?.dataset.artId || event.target.closest('[data-art-card]')?.dataset.artCard;
    if (!id) return;
    const item = state.artworks.find((entry) => entry.id === id);
    if (!item) return;
    const action = actionButton?.dataset.artAction;
    if (!action) {
      selectArtwork(id);
      return;
    }
    if (action === 'remove') removeArtwork(id);
    if (action === 'rotate-group') rotateArtwork(id, true);
    if (action === 'rotate-one') rotateArtwork(id, false);
    if (action === 'remove-copy') removeArtwork(id);
  }

  function handleArtworkChange(event) {
    const input = event.target;
    const groupId = input.dataset.artGroup;
    if (!groupId) return;
    if (input.dataset.artDimension) updateArtworkDimension(groupId, input.dataset.artDimension, Number(input.value));
    if (input.dataset.artCopies !== undefined) updateCopies(groupId, Number.parseInt(input.value, 10) || 0);
  }

  function selectArtwork(id) {
    const item = state.artworks.find((entry) => entry.id === id);
    if (!item) return;
    item.zIndex = state.nextZ++;
    state.selectedArtworkId = id;
    renderLayout();
    scheduleSave();
  }

  function removeArtwork(id) {
    const item = state.artworks.find((entry) => entry.id === id);
    if (!item) return;
    if (item.id === item.groupId) {
      const source = item;
      URL.revokeObjectURL(source.previewUrl);
      state.artworks = state.artworks.filter((entry) => entry.groupId !== item.groupId);
    } else {
      state.artworks = state.artworks.filter((entry) => entry.id !== id);
    }
    state.selectedArtworkId = state.artworks[0]?.id || '';
    state.artworks = repack(state.artworks, state.gapMm) || state.artworks;
    renderLayout();
    scheduleSave();
  }

  function updateArtworkDimension(groupId, dimension, value) {
    const parent = state.artworks.find((entry) => entry.id === groupId);
    if (!parent || !Number.isFinite(value) || value <= 0) return renderLayout();
    const requested = window.DtfLayout.proportionalArtworkSize(
      parent.widthPx,
      parent.heightPx,
      parent.rotationDeg,
      dimension,
      value
    );
    const requestedWidth = requested.widthMm;
    const requestedHeight = requested.heightMm;
    if (requestedWidth > WIDTH_MM || requestedHeight > HEIGHT_MM) {
      setFeedback(els.layoutFeedback, 'Artwork dimensions exceed the sheet.', 'error');
      return renderLayout();
    }
    const changed = state.artworks.map((entry) => {
      if (entry.groupId !== groupId) return entry;
      const differs = entry.rotationDeg % 180 !== parent.rotationDeg % 180;
      return { ...entry, widthMm: differs ? requestedHeight : requestedWidth, heightMm: differs ? requestedWidth : requestedHeight };
    });
    const packed = repack(changed, state.gapMm);
    if (!packed) return setFeedback(els.layoutFeedback, 'That size does not fit with the current copies and gap.', 'error');
    state.artworks = packed;
    setFeedback(els.layoutFeedback, '');
    renderLayout();
    scheduleSave();
  }

  function updateCopies(groupId, requested) {
    const parent = state.artworks.find((entry) => entry.id === groupId);
    if (!parent) return;
    const current = state.artworks.filter((entry) => entry.groupId === groupId && entry.id !== groupId);
    const target = clamp(Math.floor(requested), 0, MAX_LAYOUT_ITEMS - (state.artworks.length - current.length));
    let next = state.artworks.filter((entry) => entry.groupId !== groupId || entry.id === groupId);
    for (let index = 0; index < target; index += 1) {
      const existing = current[index];
      next.push(existing || {
        ...parent,
        id: crypto.randomUUID(),
        name: `${parent.name} copy ${index + 1}`,
        zIndex: state.nextZ++,
      });
    }
    const packed = repack(next, state.gapMm);
    if (!packed) return setFeedback(els.layoutFeedback, 'Those copies do not fit on the sheet.', 'error');
    state.artworks = packed;
    setFeedback(els.layoutFeedback, '');
    renderLayout();
    scheduleSave();
  }

  function rotateArtwork(id, group) {
    const target = state.artworks.find((entry) => entry.id === id);
    if (!target) return;
    const changed = state.artworks.map((entry) => {
      if ((group && entry.groupId === target.groupId) || (!group && entry.id === id)) {
        return { ...entry, widthMm: entry.heightMm, heightMm: entry.widthMm, rotationDeg: (entry.rotationDeg + 90) % 360 };
      }
      return entry;
    });
    const packed = repack(changed, state.gapMm);
    if (!packed) return setFeedback(els.layoutFeedback, 'The rotated artwork does not fit.', 'error');
    state.artworks = packed;
    state.selectedArtworkId = id;
    setFeedback(els.layoutFeedback, '');
    renderLayout();
    scheduleSave();
  }

  function updateGap(value) {
    const nextGap = clamp(Number.isFinite(value) ? Math.round(value) : 10, 0, 250);
    const packed = repack(state.artworks, nextGap);
    if (!packed && state.artworks.length) {
      els.gap.value = String(state.gapMm);
      return setFeedback(els.layoutFeedback, 'That gap leaves insufficient room for the current layout.', 'error');
    }
    state.gapMm = nextGap;
    state.artworks = packed || [];
    setFeedback(els.layoutFeedback, '');
    renderLayout();
    scheduleSave();
  }

  function repack(items, gap) {
    return window.DtfLayout.repack(items, gap, WIDTH_MM, HEIGHT_MM);
  }

  function findOpenPosition(placed, width, height, gap) {
    if (width <= 0 || height <= 0 || width > WIDTH_MM || height > HEIGHT_MM) return null;
    const xs = uniqueSorted([0, ...placed.map((item) => item.xMm + item.widthMm + gap)]).filter((x) => x + width <= WIDTH_MM + .001);
    const ys = uniqueSorted([0, ...placed.map((item) => item.yMm + item.heightMm + gap)]).filter((y) => y + height <= HEIGHT_MM + .001);
    for (const yMm of ys) for (const xMm of xs) {
      const candidate = { xMm, yMm, widthMm: width, heightMm: height };
      if (placed.every((item) => !intersects(candidate, item, gap))) return { xMm, yMm };
    }
    return null;
  }

  function startPieceDrag(event) {
    const piece = event.target.closest('[data-layout-piece]');
    if (!piece) return;
    const item = state.artworks.find((entry) => entry.id === piece.dataset.layoutPiece);
    if (!item) return;
    event.preventDefault();
    piece.setPointerCapture(event.pointerId);
    item.zIndex = state.nextZ++;
    state.selectedArtworkId = item.id;
    piece.classList.add('selected');
    piece.style.zIndex = String(item.zIndex + 2);
    renderArtworkList();
    dragState = { pointerId: event.pointerId, itemId: item.id, startX: event.clientX, startY: event.clientY, xMm: item.xMm, yMm: item.yMm };
    piece.addEventListener('pointermove', movePieceDrag);
    piece.addEventListener('pointerup', endPieceDrag, { once: true });
    piece.addEventListener('pointercancel', endPieceDrag, { once: true });
  }

  function movePieceDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const item = state.artworks.find((entry) => entry.id === dragState.itemId);
    const rect = els.layoutCanvas.getBoundingClientRect();
    if (!item || !rect.width || !rect.height) return;
    item.xMm = clamp(dragState.xMm + ((event.clientX - dragState.startX) / rect.width) * WIDTH_MM, 0, WIDTH_MM - item.widthMm);
    item.yMm = clamp(dragState.yMm + ((event.clientY - dragState.startY) / rect.height) * HEIGHT_MM, 0, HEIGHT_MM - item.heightMm);
    event.currentTarget.style.left = `${(item.xMm / WIDTH_MM) * 100}%`;
    event.currentTarget.style.top = `${(item.yMm / HEIGHT_MM) * 100}%`;
  }

  function endPieceDrag(event) {
    event.currentTarget.removeEventListener('pointermove', movePieceDrag);
    if (!dragState) return;
    const item = state.artworks.find((entry) => entry.id === dragState.itemId);
    const others = state.artworks.filter((entry) => entry.id !== dragState.itemId);
    if (item && others.some((entry) => intersects(item, entry, state.gapMm))) {
      item.xMm = dragState.xMm;
      item.yMm = dragState.yMm;
      setFeedback(els.layoutFeedback, 'Artwork cannot overlap another item or its gap.', 'error');
    }
    dragState = null;
    renderLayout();
    scheduleSave();
  }

  function renderLayout() {
    els.gap.value = String(state.gapMm);
    els.backgroundButtons.forEach((button) => button.classList.toggle('active', button.dataset.dtfBackground === state.background));
    els.layoutCanvas.classList.remove('dtf-background-light', 'dtf-background-grey', 'dtf-background-dark');
    els.layoutCanvas.classList.add(`dtf-background-${state.background.toLowerCase()}`);
    renderArtworkList();
    renderLayoutCanvas();
    els.addToOrder.disabled = state.busy || !state.artworks.length;
  }

  function renderArtworkList() {
    const groups = Array.from(new Set(state.artworks.map((item) => item.groupId))).map((groupId) => ({
      groupId,
      parent: state.artworks.find((item) => item.id === groupId) || state.artworks.find((item) => item.groupId === groupId),
      children: state.artworks.filter((item) => item.groupId === groupId && item.id !== groupId),
    }));
    els.artworkList.innerHTML = groups.map((group) => `
      <div class="dtf-art-card ${[group.parent, ...group.children].some((item) => item.id === state.selectedArtworkId) ? 'selected' : ''}" data-art-card="${escapeAttr(group.parent.id)}">
        <div class="dtf-art-card-head">
          <img class="dtf-art-thumb" src="${escapeAttr(group.parent.previewUrl)}" alt="">
          <div class="dtf-art-info"><div class="dtf-art-name">${escapeHtml(group.parent.name)}</div><div class="dtf-art-sub">${escapeHtml(group.parent.sourceType.toUpperCase())} · ${group.children.length ? `${group.children.length} copies` : 'Original'}</div></div>
          <button class="dtf-art-remove" type="button" data-art-action="remove" data-art-id="${escapeAttr(group.parent.id)}" aria-label="Remove artwork">×</button>
        </div>
        <div class="dtf-art-controls">
          <label>W <input type="number" min="1" max="550" value="${Math.round(group.parent.widthMm)}" data-art-group="${escapeAttr(group.groupId)}" data-art-dimension="width"> mm</label>
          <label>H <input type="number" min="1" max="1000" value="${Math.round(group.parent.heightMm)}" data-art-group="${escapeAttr(group.groupId)}" data-art-dimension="height"> mm</label>
          <label>Copies <input type="number" min="0" max="79" value="${group.children.length}" data-art-group="${escapeAttr(group.groupId)}" data-art-copies></label>
          <button type="button" data-art-action="rotate-group" data-art-id="${escapeAttr(group.parent.id)}">Rotate all 90°</button>
        </div>
        ${group.children.length ? `<div class="dtf-duplicate-list">${group.children.map((child, index) => `<button class="${child.id === state.selectedArtworkId ? 'selected' : ''}" type="button" data-art-action="rotate-one" data-art-id="${escapeAttr(child.id)}">Copy ${index + 1} ↻</button><button type="button" data-art-action="remove-copy" data-art-id="${escapeAttr(child.id)}" aria-label="Remove copy ${index + 1}">×</button>`).join('')}</div>` : ''}
      </div>`).join('');
  }

  function renderLayoutCanvas() {
    els.layoutEmpty.hidden = state.artworks.length > 0;
    els.layoutCanvas.querySelectorAll('.dtf-layout-piece').forEach((piece) => piece.remove());
    [...state.artworks].sort((a, b) => a.zIndex - b.zIndex).forEach((item) => {
      const piece = document.createElement('div');
      piece.className = `dtf-layout-piece ${item.id === state.selectedArtworkId ? 'selected' : ''}`;
      piece.dataset.layoutPiece = item.id;
      piece.style.left = `${(item.xMm / WIDTH_MM) * 100}%`;
      piece.style.top = `${(item.yMm / HEIGHT_MM) * 100}%`;
      piece.style.width = `${(item.widthMm / WIDTH_MM) * 100}%`;
      piece.style.height = `${(item.heightMm / HEIGHT_MM) * 100}%`;
      piece.style.zIndex = String(item.zIndex + 2);
      const img = document.createElement('img');
      img.src = item.previewUrl;
      img.alt = item.name;
      img.draggable = false;
      img.style.transform = `rotate(${item.rotationDeg}deg)`;
      if (item.rotationDeg % 180) {
        img.style.width = `${(item.heightMm / Math.max(item.widthMm, .001)) * 100}%`;
        img.style.height = `${(item.widthMm / Math.max(item.heightMm, .001)) * 100}%`;
        img.style.maxWidth = 'none';
      }
      piece.appendChild(img);
      els.layoutCanvas.appendChild(piece);
    });
  }

  async function addLayoutToOrder() {
    if (state.busy || !state.artworks.length) return;
    state.busy = true;
    renderLayout();
    setFeedback(els.layoutFeedback, 'Preparing high-quality PDF…');
    try {
      const file = await createLayoutPdf();
      setMode('upload');
      await addSheets([file]);
      setFeedback(els.uploadFeedback, `${file.name} was added to this order.`, 'success');
      setFeedback(els.layoutFeedback, '');
    } catch (error) {
      setFeedback(els.layoutFeedback, error.message || 'Could not create the layout PDF.', 'error');
    } finally {
      state.busy = false;
      renderAll();
    }
  }

  async function createLayoutPdf() {
    if (!window.PDFLib) throw new Error('The PDF composer did not load. Refresh and try again.');
    const { PDFDocument, degrees, rgb } = window.PDFLib;
    const document = await PDFDocument.create();
    const pageWidth = WIDTH_MM * MM_TO_POINTS;
    const pageHeight = HEIGHT_MM * MM_TO_POINTS;
    const page = document.addPage([pageWidth, pageHeight]);
    const color = hexRgb(backgrounds[state.background]);
    page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: rgb(color.r, color.g, color.b) });
    const sourceCache = new Map();
    const parents = new Map(state.artworks.filter((item) => item.id === item.groupId).map((item) => [item.groupId, item]));
    for (const item of [...state.artworks].sort((a, b) => a.zIndex - b.zIndex)) {
      const source = parents.get(item.groupId) || item;
      let embedded = sourceCache.get(source.groupId);
      if (!embedded) {
        if (source.sourceType === 'pdf') {
          const sourcePdf = await PDFDocument.load(await source.file.arrayBuffer());
          [embedded] = await document.embedPdf(sourcePdf, [0]);
        } else {
          embedded = await document.embedPng(await source.renderFile.arrayBuffer());
        }
        sourceCache.set(source.groupId, embedded);
      }
      drawEmbeddedArtwork(page, embedded, item, degrees, source.sourceType === 'pdf');
    }
    const bytes = await document.save({ useObjectStreams: true, addDefaultPage: false });
    const stamp = new Date().toISOString().slice(0, 10);
    return new File([bytes], `Template ${stamp}.pdf`, { type: 'application/pdf', lastModified: Date.now() });
  }

  function drawEmbeddedArtwork(page, embedded, item, degrees, isPdfPage) {
    const x = item.xMm * MM_TO_POINTS;
    const y = (HEIGHT_MM - item.yMm - item.heightMm) * MM_TO_POINTS;
    const width = item.widthMm * MM_TO_POINTS;
    const height = item.heightMm * MM_TO_POINTS;
    const rotation = ((item.rotationDeg % 360) + 360) % 360;
    const options = rotation % 180
      ? { width: height, height: width }
      : { width, height };
    if (rotation === 0) Object.assign(options, { x, y });
    if (rotation === 90) Object.assign(options, { x: x + width, y, rotate: degrees(90) });
    if (rotation === 180) Object.assign(options, { x: x + width, y: y + height, rotate: degrees(180) });
    if (rotation === 270) Object.assign(options, { x, y: y + height, rotate: degrees(270) });
    if (isPdfPage) page.drawPage(embedded, options);
    else page.drawImage(embedded, options);
  }

  function renderAll() {
    setMode(state.mode);
    renderSheets();
    renderPricing();
    renderSelectedSheet();
    renderLayout();
  }

  async function restoreDrafts() {
    try {
      const upload = await readDraft('upload');
      if (upload?.sheets) {
        state.sheets = upload.sheets.map((entry) => ({ ...entry, validation: 'checking', error: '' }));
        state.selectedSheetId = upload.selectedSheetId || state.sheets[0]?.clientId || '';
        for (const entry of state.sheets) await validateSheet(entry);
      }
      const layout = await readDraft('layout');
      if (layout?.sources && layout?.items) {
        state.gapMm = clamp(Number(layout.gapMm) || 10, 0, 250);
        state.background = backgrounds[layout.background] ? layout.background : 'LIGHT';
        state.mode = layout.mode === 'layout' ? 'layout' : 'upload';
        const sources = new Map(layout.sources.map((source) => [source.groupId, {
          ...source,
          previewUrl: URL.createObjectURL(source.renderFile),
        }]));
        state.artworks = layout.items.map((item) => ({ ...sources.get(item.groupId), ...item }));
        state.selectedArtworkId = layout.selectedArtworkId || state.artworks[0]?.id || '';
        state.nextZ = Math.max(1, ...state.artworks.map((item) => item.zIndex + 1));
      }
    } catch (error) {
      console.warn('Could not restore DTF drafts', error);
    }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveDrafts, 180);
  }

  async function saveDrafts() {
    if (!user) return;
    try {
      await writeDraft('upload', {
        selectedSheetId: state.selectedSheetId,
        sheets: state.sheets.map(({ clientId, file, quantity }) => ({ clientId, file, quantity })),
      });
      const parents = state.artworks.filter((item) => item.id === item.groupId);
      await writeDraft('layout', {
        mode: state.mode,
        gapMm: state.gapMm,
        background: state.background,
        selectedArtworkId: state.selectedArtworkId,
        sources: parents.map((item) => ({
          groupId: item.groupId,
          name: item.name,
          sourceType: item.sourceType,
          file: item.file,
          renderFile: item.renderFile,
          widthPx: item.widthPx,
          heightPx: item.heightPx,
        })),
        items: state.artworks.map(({ id, groupId, name, widthMm, heightMm, xMm, yMm, rotationDeg, zIndex }) => ({ id, groupId, name, widthMm, heightMm, xMm, yMm, rotationDeg, zIndex })),
      });
    } catch (error) {
      console.warn('Could not save DTF draft', error);
    }
  }

  function openDraftDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(DB_STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function readDraft(kind) {
    const db = await openDraftDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DB_STORE, 'readonly');
      const request = transaction.objectStore(DB_STORE).get(`${kind}:${user.id}`);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => db.close();
    });
  }

  async function writeDraft(kind, value) {
    const db = await openDraftDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DB_STORE, 'readwrite');
      transaction.objectStore(DB_STORE).put(value, `${kind}:${user.id}`);
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
    });
  }

  async function deleteDraft(kind) {
    const db = await openDraftDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DB_STORE, 'readwrite');
      transaction.objectStore(DB_STORE).delete(`${kind}:${user.id}`);
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
    });
  }

  const adminState = { jobs: [], total: 0, offset: 0, selectedId: '', loading: false };
  window.DtfAdmin = {
    open: () => loadAdminJobs(true),
    refresh: () => {
      if (document.getElementById('db-dtf-admin-view')?.classList.contains('active')) loadAdminJobs(true);
    },
  };

  async function loadAdminJobs(reset) {
    if (!els.adminBody || adminState.loading) return;
    adminState.loading = true;
    if (reset) {
      adminState.offset = 0;
      adminState.jobs = [];
      els.adminBody.innerHTML = '<tr><td colspan="10" class="db-empty-cell">Loading DTF jobs</td></tr>';
    }
    try {
      const query = new URLSearchParams({ limit: '50', offset: String(adminState.offset) });
      if (els.adminFilter.value) query.set('status', els.adminFilter.value);
      const data = await api(`/api/dtf/admin/jobs?${query}`);
      adminState.jobs = reset ? data.jobs : [...adminState.jobs, ...data.jobs];
      adminState.total = data.total;
      adminState.offset = adminState.jobs.length;
      renderAdminJobs();
      if (reset) {
        els.adminDetail.hidden = true;
        adminState.selectedId = '';
      }
    } catch (error) {
      els.adminBody.innerHTML = `<tr><td colspan="10" class="db-empty-cell">${escapeHtml(error.message || 'Failed to load DTF jobs')}</td></tr>`;
    } finally {
      adminState.loading = false;
    }
  }

  function renderAdminJobs() {
    if (!adminState.jobs.length) {
      els.adminBody.innerHTML = '<tr><td colspan="10" class="db-empty-cell">No DTF jobs</td></tr>';
    } else {
      els.adminBody.innerHTML = adminState.jobs.map((job) => `
        <tr class="db-dtf-jobs-row ${String(job.id) === String(adminState.selectedId) ? 'active' : ''}" data-dtf-admin-job="${escapeAttr(job.id)}">
          <td>${escapeHtml(job.jobNumber)}</td><td>${escapeHtml(formatDateTime(job.createdAt))}</td><td>${escapeHtml(job.customerName)}</td><td>${escapeHtml(job.customerEmail)}</td><td>${job.uniqueFileCount}</td><td>${job.sheetQuantity}</td><td>${money(job.subtotalPence)}</td><td>${money(job.vatPence)}</td><td>${money(job.totalPence)}</td><td class="db-dtf-status">${escapeHtml(statusLabel(job.status))}</td>
        </tr>`).join('');
    }
    els.adminLoadMore.hidden = adminState.jobs.length >= adminState.total;
    els.adminLoadMore.disabled = adminState.loading;
  }

  async function loadAdminDetail(id) {
    adminState.selectedId = String(id);
    renderAdminJobs();
    try {
      const data = await api(`/api/dtf/admin/jobs/${encodeURIComponent(id)}`);
      els.adminDetail.hidden = false;
      els.adminDetail.dataset.jobId = data.job.id;
      els.adminDetailNumber.textContent = data.job.jobNumber;
      els.adminDetailCustomer.textContent = `${data.job.customerName} · ${data.job.customerEmail}`;
      els.adminDetailStatus.value = data.job.status === 'UPLOADING' ? 'RECEIVED' : data.job.status;
      els.adminDetailStatus.disabled = data.job.status === 'UPLOADING';
      els.adminDetailPricing.innerHTML = `<span>${data.job.uniqueFileCount} files</span><span>${data.job.sheetQuantity} sheets</span><span>Subtotal ${money(data.job.subtotalPence)}</span><span>VAT ${money(data.job.vatPence)}</span><strong>Total ${money(data.job.totalPence)}</strong>`;
      els.adminFilesBody.innerHTML = data.files.map((file) => `
        <tr><td>${escapeHtml(file.originalName)}</td><td>${file.quantity}</td><td>${formatBytes(file.verifiedBytes ?? file.declaredBytes)}</td><td>${escapeHtml(statusLabel(file.uploadStatus))}</td><td>${escapeHtml(file.errorMessage || '')}</td><td>${file.uploadStatus === 'UPLOADED' ? `<a class="db-blue-link" href="/api/dtf/files/${encodeURIComponent(file.id)}" target="_blank" rel="noopener">Open PDF</a>` : '—'}</td></tr>`).join('') || '<tr><td colspan="6" class="db-empty-cell">No files</td></tr>';
    } catch (error) {
      window.alert(error.message || 'Failed to load DTF job');
    }
  }

  async function updateAdminStatus() {
    const jobId = els.adminDetail.dataset.jobId;
    if (!jobId) return;
    els.adminDetailStatus.disabled = true;
    try {
      const data = await api(`/api/dtf/admin/jobs/${encodeURIComponent(jobId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: els.adminDetailStatus.value }),
      });
      const index = adminState.jobs.findIndex((job) => String(job.id) === String(jobId));
      if (index !== -1) adminState.jobs[index] = data.job;
      renderAdminJobs();
      await loadAdminDetail(jobId);
    } catch (error) {
      window.alert(error.message || 'Failed to update DTF status');
    } finally {
      els.adminDetailStatus.disabled = false;
    }
  }

  async function loadPdf(file) {
    const library = typeof window.ensurePdfJs === 'function' ? await window.ensurePdfJs() : await fallbackPdfJs();
    const data = new Uint8Array(await file.arrayBuffer());
    return library.getDocument({ data }).promise;
  }

  let pdfJsPromise;
  function fallbackPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (pdfJsPromise) return pdfJsPromise;
    pdfJsPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        resolve(window.pdfjsLib);
      };
      script.onerror = () => reject(new Error('PDF tools could not load.'));
      document.head.appendChild(script);
    });
    return pdfJsPromise;
  }

  async function imageDimensions(file) {
    const url = URL.createObjectURL(file);
    try {
      return await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve({ widthPx: image.naturalWidth || 1, heightPx: image.naturalHeight || 1 });
        image.onerror = () => reject(new Error('Image could not be read.'));
        image.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function defaultArtworkSize(widthPx, heightPx) {
    return window.DtfLayout.defaultArtworkSize(widthPx, heightPx);
  }

  function intersects(a, b, gap) {
    return window.DtfLayout.intersects(a, b, gap);
  }

  function uniqueSorted(values) {
    return Array.from(new Set(values.map((value) => Number(value.toFixed(4))))).sort((a, b) => a - b);
  }

  async function api(url, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body && typeof options.body === 'string') headers.set('Content-Type', 'application/json');
    const response = await fetch(url, { credentials: 'include', cache: 'no-store', ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  }

  function money(pence) { return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format((Number(pence) || 0) / 100); }
  function formatBytes(bytes) { const value = Number(bytes) || 0; if (value < 1024) return `${value} B`; if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`; return `${(value / 1024 ** 2).toFixed(1)} MB`; }
  function formatDateTime(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en-GB', { dateStyle: 'short', timeStyle: 'short' }).format(date); }
  function statusLabel(value) { return String(value || '').toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }
  function clamp(value, min, max) { return Math.min(max, Math.max(min, Number(value) || 0)); }
  function setFeedback(element, message, type = '') { element.textContent = message || ''; element.classList.toggle('error', type === 'error'); element.classList.toggle('success', type === 'success'); }
  function hexRgb(value) { const hex = String(value).replace('#', ''); return { r: Number.parseInt(hex.slice(0, 2), 16) / 255, g: Number.parseInt(hex.slice(2, 4), 16) / 255, b: Number.parseInt(hex.slice(4, 6), 16) / 255 }; }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])); }
  function escapeAttr(value) { return escapeHtml(value); }
})();
