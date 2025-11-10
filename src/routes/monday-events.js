// src/routes/monday-events.js
const express = require('express');
const router = express.Router();
const { BOARD_ID, GROUP_ID, COLS, CUSTOMER_IS_ITEM_NAME } = require('../config/mondayFields');
const { getItemWithColumns, setStatusLabel, postUpdate } = require('../services/mondayClient');

router.post('/events', async (req, res) => {
  try {
    const { boardId, itemId, columnId, newLabel } = req.body || {};
    if (!boardId || !itemId) return res.status(400).json({ ok: false, error: 'Missing boardId or itemId' });

    if (String(boardId) !== String(BOARD_ID)) {
      return res.status(200).json({ ok: true, ignored: 'different board' });
    }
    if (columnId && columnId !== COLS.STATUS) {
      return res.status(200).json({ ok: true, ignored: 'not status column' });
    }
    if ((newLabel || '').toUpperCase() !== 'START') {
      return res.status(200).json({ ok: true, ignored: 'status not START' });
    }

    const item = await getItemWithColumns(itemId);

    // Optional group filter
    if (GROUP_ID && String(item.group?.id) !== String(GROUP_ID)) {
      await postUpdate(itemId, `ℹ️ Ignored: item is in group **${item.group?.title || item.group?.id}**, not the configured group.`);
      return res.status(200).json({ ok: true, ignored: 'wrong group', group: item.group?.id });
    }

    // Build a lookup by column id
    const cv = {};
    for (const c of item.column_values) cv[c.id] = c;

    // Extract fields
    const customer = CUSTOMER_IS_ITEM_NAME ? (item.name || '').trim() : (cv[COLS.CUSTOMER]?.text || '').trim();
    const jobTitle = (cv[COLS.JOB_TITLE]?.text || '').trim();
    const jobNo    = (cv[COLS.JOB_NO]?.text || '').trim();
    const frontPos = (cv[COLS.FRONT_POS]?.text || '').trim();
    const backPos  = (cv[COLS.BACK_POS]?.text || '').trim();
    const garmentColor = (cv[COLS.GARMENT_COLOR]?.text || '').trim(); // new
    const hasFrontArt = !!(cv[COLS.FRONT_ART]?.value && cv[COLS.FRONT_ART].value !== 'null' && cv[COLS.FRONT_ART].value !== '');
    const hasBackArt  = !!(cv[COLS.BACK_ART]?.value && cv[COLS.BACK_ART].value !== 'null' && cv[COLS.BACK_ART].value !== '');

    // Validate minimal requirements
    const missing = [];
    if (!customer) missing.push('Customer (item title)');
    if (!jobTitle) missing.push('JOB TITLE');
    if (!jobNo)    missing.push('JOB NO');
    if (!hasFrontArt && !hasBackArt) missing.push('FRONT ARTWORK or BACK ARTWORK');

    if (missing.length) {
      await postUpdate(itemId, `❌ Cannot start – missing fields:<br>• ${missing.join('<br>• ')}`);
      return res.status(200).json({ ok: true, blocked: missing });
    }

    // Placeholder: mark in progress and echo the key fields
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

    return res.json({ ok: true, action: 'queued_placeholder', itemId });
  } catch (err) {
    console.error('[monday-events] error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
