// src/routes/monday-events.js
const express = require('express');
const router = express.Router();

const {
  BOARD_ID_VISUAL,
  GROUP_ID,
  COLS,
  CUSTOMER_IS_ITEM_NAME,
  STATUS_COLUMN_ID_VISUAL,
} = require('../config/mondayFields');

// ✅ Use the index-based setter
const { getItemWithColumns, setStatusByLabel, postUpdate } = require('../services/mondayClient');

const STATUS_INPROGRESS_LABEL = process.env.STATUS_INPROGRESS_LABEL || 'In progress';

// Parsers
router.use(express.json({ limit: '1mb' }));
router.use(express.urlencoded({ extended: true }));

// Global challenge catcher (GET/POST, json/form/query)
router.use((req, res, next) => {
  const c =
    (req.body && (req.body.challenge || req.body['challenge'])) ||
    (req.query && (req.query.challenge || req.query['challenge'])) ||
    null;
  if (typeof c === 'string' && c.length) return res.json({ challenge: c });
  return next();
});

// Health / debug
router.get('/ping', (_req, res) =>
  res.json({
    ok: true,
    where: 'monday-events',
    boardIdVisual: String(BOARD_ID_VISUAL || ''),
    usingStatusId: STATUS_COLUMN_ID_VISUAL,
    inProgressLabel: STATUS_INPROGRESS_LABEL,
  })
);

router.post('/echo', (req, res) => {
  console.log('[monday-events] /echo body:', req.body);
  res.json({ ok: true, body: req.body });
});

// Real webhook handler
router.post('/events', async (req, res) => {
  try {
    // Normalize Monday payloads
    let { boardId, itemId, columnId, newLabel } = req.body || {};
    if (req.body && req.body.event) {
      const ev = req.body.event;
      boardId  = boardId  || ev.boardId || ev.board_id;
      itemId   = itemId   || ev.pulseId || ev.itemId || ev.pulse_id || ev.item_id;
      columnId = columnId || ev.columnId || ev.column_id;
      if (!newLabel && ev.value) {
        try {
          const v = typeof ev.value === 'string' ? JSON.parse(ev.value) : ev.value;
          const lab = v && v.label;
          newLabel = (typeof lab === 'string' ? lab : (lab && lab.text)) || v.text || v.title || '';
        } catch {}
      }
    }

    console.log('[monday-events] normalized', {
      boardId, itemId, columnId, newLabel,
      expectBoard: String(BOARD_ID_VISUAL), expectStatus: STATUS_COLUMN_ID_VISUAL
    });

    if (!boardId || !itemId) return res.status(400).json({ ok: false, error: 'Missing boardId or itemId' });

    // Only react for the VISUAL board
    if (String(boardId) !== String(BOARD_ID_VISUAL)) {
      return res.status(200).json({ ok: true, ignored: 'different board' });
    }

    // Only react to the VISUAL status column
    if (columnId && columnId !== STATUS_COLUMN_ID_VISUAL) {
      return res.status(200).json({ ok: true, ignored: `not the visual status column (${STATUS_COLUMN_ID_VISUAL})` });
    }

    if ((String(newLabel) || '').toUpperCase() !== 'START') {
      return res.status(200).json({ ok: true, ignored: 'status not START' });
    }

    // Fetch item + columns (also gives us board.id for mutation)
    const item = await getItemWithColumns(itemId);

    // Optional group gate
    if (GROUP_ID && String(item.group?.id) !== String(GROUP_ID)) {
      await postUpdate(itemId, `ℹ️ Ignored: item is in group **${item.group?.title || item.group?.id}**, not the configured group.`);
      return res.status(200).json({ ok: true, ignored: 'wrong group', group: item.group?.id });
    }

    const cv = {}; for (const c of item.column_values) cv[c.id] = c;

    const customer   = CUSTOMER_IS_ITEM_NAME ? (item.name || '').trim() : (cv[COLS.CUSTOMER]?.text || '').trim();
    const jobTitle   = (cv[COLS.JOB_TITLE]?.text || '').trim();
    const jobNo      = (cv[COLS.JOB_NO]?.text || '').trim();
    const frontPos   = (cv[COLS.FRONT_POS]?.text || '').trim();
    const backPos    = (cv[COLS.BACK_POS]?.text || '').trim();
    const garmentCol = (cv[COLS.GARMENT_COLOR]?.text || '').trim();

    const hasFrontArt = !!(cv[COLS.FRONT_ART]?.value && cv[COLS.FRONT_ART].value !== 'null' && cv[COLS.FRONT_ART].value !== '');
    const hasBackArt  = !!(cv[COLS.BACK_ART]?.value && cv[COLS.BACK_ART].value !== 'null' && cv[COLS.BACK_ART].value !== '');

    const missing = [];
    if (!customer) missing.push('Customer (item title)');
    if (!jobTitle) missing.push('JOB TITLE');
    if (!jobNo)    missing.push('JOB NO');
    if (!hasFrontArt && !hasBackArt) missing.push('FRONT ARTWORK or BACK ARTWORK');

    if (missing.length) {
      await postUpdate(itemId, `❌ Cannot start – missing fields:<br>• ${missing.join('<br>• ')}`);
      return res.status(200).json({ ok: true, blocked: missing });
    }

    // Flip to IN PROGRESS on the visual status column (by index via label)
    const boardIdForMutation = item.board?.id || boardId;
    await setStatusByLabel(boardIdForMutation, itemId, STATUS_COLUMN_ID_VISUAL, STATUS_INPROGRESS_LABEL);

    await postUpdate(
      itemId,
      `⏳ Job queued.<br>` +
      `Customer: **${customer}**<br>` +
      `Title: **${jobTitle}**<br>` +
      `No: **${jobNo}**<br>` +
      (garmentCol ? `Colour: **${garmentCol}**<br>` : '') +
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
