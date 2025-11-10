// routes/monday-events.js
const express = require('express');
const router = express.Router();

const { BOARD_ID, GROUP_ID, COLS, CUSTOMER_IS_ITEM_NAME } = require('../config/mondayFields');
const { getItemWithColumns, setStatusLabel, postUpdate } = require('../services/mondayClient');

// Accept JSON + form-encoded bodies on this router
router.use(express.json({ limit: '1mb' }));
router.use(express.urlencoded({ extended: true }));

// --- Health / debug
router.get('/ping', (_req, res) => res.json({ ok: true, where: 'monday-events' }));
router.post('/echo', (req, res) => {
  console.log('[monday-events] /echo body:', req.body);
  res.json({ ok: true, body: req.body });
});

// --- Challenge responder (handles GET/POST, json/form/query)
router.all('/events', (req, res, next) => {
  const challenge =
    (req.body && (req.body.challenge || req.body['challenge'])) ||
    (req.query && (req.query.challenge || req.query['challenge'])) ||
    null;

  if (typeof challenge === 'string' && challenge.length) {
    return res.json({ challenge });
  }
  return next();
});

// --- Real webhook handler
router.post('/events', async (req, res) => {
  try {
    // Normalize Monday payloads:
    // - Our custom JSON: { boardId, itemId, columnId, newLabel }
    // - Webhooks app: { event: { boardId, pulseId/itemId, columnId, value:{label} } }
    let { boardId, itemId, columnId, newLabel } = req.body || {};
    if (req.body && req.body.event) {
      const ev = req.body.event;
      boardId  = boardId  || ev.boardId || ev.board_id;
      itemId   = itemId   || ev.pulseId || ev.itemId || ev.pulse_id || ev.item_id;
      columnId = columnId || ev.columnId || ev.column_id;
      if (!newLabel && ev.value) {
        try {
          // value might be an object or a JSON string
          const v = typeof ev.value === 'string' ? JSON.parse(ev.value) : ev.value;
          newLabel = v && (v.label || v.text || v.title);
        } catch {
          // ignore parse issues; label may not exist for non-status changes
        }
      }
    }

    if (!boardId || !itemId) {
      return res.status(400).json({ ok: false, error: 'Missing boardId or itemId' });
    }

    if (String(boardId) !== String(BOARD_ID)) {
      return res.status(200).json({ ok: true, ignored: 'different board' });
    }

    if (columnId && columnId !== COLS.STATUS) {
      return res.status(200).json({ ok: true, ignored: 'not status column' });
    }

    const labelUpper = (newLabel || '').toString().toUpperCase();
    if (labelUpper !== 'START') {
      return res.status(200).json({ ok: true, ignored: 'status not START' });
    }

    // Fetch item + columns
    const item = await getItemWithColumns(itemId);

    // Optional group gate
    if (GROUP_ID && String(item.group?.id) !== String(GROUP_ID)) {
      await postUpdate(
        itemId,
        `ℹ️ Ignored: item is in group **${item.group?.title || item.group?.id}**, not the configured group.`
      );
      return res.status(200).json({ ok: true, ignored: 'wrong group', group: item.group?.id });
    }

    // Build column lookup
    const cv = {};
    for (const c of item.column_values) cv[c.id] = c;

    // Extract fields
    const customer = CUSTOMER_IS_ITEM_NAME
      ? (item.name || '').trim()
      : (cv[COLS.CUSTOMER]?.text || '').trim();

    const jobTitle = (cv[COLS.JOB_TITLE]?.text || '').trim();
    const jobNo    = (cv[COLS.JOB_NO]?.text || '').trim();
    const frontPos = (cv[COLS.FRONT_POS]?.text || '').trim();
    const backPos  = (cv[COLS.BACK_POS]?.text || '').trim();
    const garmentColor = (cv[COLS.GARMENT_COLOR]?.text || '').trim();

    const hasFrontArt = !!(cv[COLS.FRONT_ART]?.value && cv[COLS.FRONT_ART].value !== 'null' && cv[COLS.FRONT_ART].value !== '');
    const hasBackArt  = !!(cv[COLS.BACK_ART]?.value && cv[COLS.BACK_ART].value !== 'null' && cv[COLS.BACK_ART].value !== '');

    // Validation
    const missing = [];
    if (!customer) missing.push('Customer (item title)');
    if (!jobTitle) missing.push('JOB TITLE');
    if (!jobNo)    missing.push('JOB NO');
    if (!hasFrontArt && !hasBackArt) missing.push('FRONT ARTWORK or BACK ARTWORK');

    if (missing.length) {
      await postUpdate(itemId, `❌ Cannot start – missing fields:<br>• ${missing.join('<br>• ')}`);
      return res.status(200).json({ ok: true, blocked: missing });
    }

    // Placeholder action
    await setStatusLabel(itemId, COLS.STATUS, 'IN PROGRESS');
    await postUpdate(
      itemId,
      `⏳ Job queued.<br>` +
      `Customer: **${customer}**<br>` +
      `Title: **${jobTitle}**<br>` +
      `No: **${jobNo}**<br>` +
      (garmentColor ? `Colour: **${garmentColor}**<br>` : '') +
      (frontPos ? `Front pos: **${frontPos}**<br>` : '') +
      (backPos ? `Back pos: **${backPos}**<br>` : '')
    );

    return res.json({ ok: true, action: 'queued_placeholder', itemId: String(itemId) });
  } catch (err) {
    console.error('[monday-events] error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
