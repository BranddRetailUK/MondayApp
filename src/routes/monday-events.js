// src/routes/monday-events.js
const express = require('express');
const router = express.Router();
const { BOARD_ID, COLS, CUSTOMER_IS_ITEM_NAME } = require('../config/mondayFields');
const { getItemWithColumns, setStatusLabel, postUpdate } = require('../services/mondayClient');

/**
 * Monday → webhook receiver
 * Expecting: { boardId, itemId, columnId, newLabel }
 * Only reacts when: boardId == BOARD_ID && columnId == COLS.STATUS && newLabel == 'START'
 */
router.post('/events', async (req, res) => {
  try {
    const { boardId, itemId, columnId, newLabel } = req.body || {};
    if (!boardId || !itemId) return res.status(400).json({ ok: false, error: 'Missing boardId or itemId' });

    // Ignore events from other boards
    if (String(boardId) !== String(BOARD_ID)) {
      return res.status(200).json({ ok: true, ignored: 'different board' });
    }

    // Only react to Status → START (column match optional: some recipes omit it)
    if (columnId && columnId !== COLS.STATUS) {
      return res.status(200).json({ ok: true, ignored: 'not status column' });
    }
    if ((newLabel || '').toUpperCase() !== 'START') {
      return res.status(200).json({ ok: true, ignored: 'status not START' });
    }

    // Fetch the full item so we can validate required fields
    const item = await getItemWithColumns(itemId);

    // Build a lookup by column id
    const cv = {};
    for (const c of item.column_values) cv[c.id] = c;

    // Extract fields
    const customer = CUSTOMER_IS_ITEM_NAME ? (item.name || '').trim() : (cv[COLS.CUSTOMER]?.text || '').trim();
    const jobTitle = (cv[COLS.JOB_TITLE]?.text || '').trim();
    const jobNo    = (cv[COLS.JOB_NO]?.text || '').trim();
    const frontPos = (cv[COLS.FRONT_POS]?.text || '').trim();
    const backPos  = (cv[COLS.BACK_POS]?.text || '').trim();
    const hasFrontArt = !!(cv[COLS.FRONT_ART]?.value && cv[COLS.FRONT_ART].value !== 'null' && cv[COLS.FRONT_ART].value !== '');
    const hasBackArt  = !!(cv[COLS.BACK_ART]?.value && cv[COLS.BACK_ART].value !== 'null' && cv[COLS.BACK_ART].value !== '');

    // Validate minimal requirements
    const missing = [];
    if (!customer) missing.push('Customer (item title)');
    if (!jobTitle) missing.push('JOB TITLE');
    if (!jobNo)    missing.push('JOB NO');
    if (!hasFrontArt && !hasBackArt) missing.push('FRONT ARTWORK or BACK ARTWORK');

    if (missing.length) {
      await postUpdate(itemId, `❌ Cannot start – missing fields: <br>• ${missing.join('<br>• ')}`);
      // Optionally revert/clear the status instead of ignoring
      return res.status(200).json({ ok: true, blocked: missing });
    }

    // Placeholder run:
    // 1) flip to IN PROGRESS
    await setStatusLabel(itemId, COLS.STATUS, 'IN PROGRESS');

    // 2) leave an update so we can see it responded
    await postUpdate(itemId, `⏳ Job queued for processing.<br>Customer: **${customer}**<br>Title: **${jobTitle}**<br>No: **${jobNo}**`);

    // Note: We are NOT attaching a file yet. This is just the trigger & ack.
    // When we hook the runner, this endpoint will enqueue a job and return immediately.

    return res.json({ ok: true, action: 'queued_placeholder', itemId });
  } catch (err) {
    console.error('[monday-events] error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
