// src/routes/monday-events.js
const express = require('express');
const router = express.Router();

const axios = require('axios');
const { PORT } = require('../config/env');

const {
  BOARD_ID_VISUAL,
  GROUP_ID,
  COLS,
  CUSTOMER_IS_ITEM_NAME,
  STATUS_COLUMN_ID_VISUAL,
} = require('../config/mondayFields');
const lineItemImporter = require('../services/dropboxLineItemImporter');
const { processJobNumber } = lineItemImporter;
const LINEITEM_BOARD_ID = lineItemImporter.BOARD_ID;
const LINEITEM_JOB_NO_COLUMN_ID = lineItemImporter.JOB_NO_COLUMN_ID;

// ✅ Use the index-based setter
const { getItemWithColumns, setStatusByLabel, postUpdate } = require('../services/mondayClient');

const STATUS_INPROGRESS_LABEL = process.env.STATUS_INPROGRESS_LABEL || 'In progress';
const CREATE_ITEM_EVENTS = new Set(['create_pulse', 'create_item']);

// Simple health/echo route so you can test from curl / browser
router.post('/echo', (req, res) => {
  console.log('[monday-events] /echo body:', req.body);
  res.json({ ok: true, body: req.body });
});

// Real webhook handler
router.post('/events', async (req, res) => {
  try {
    // Normalize Monday payloads
    let { boardId, itemId, columnId, newLabel } = req.body || {};
    let eventType = '';
    if (req.body && req.body.event) {
      const ev = req.body.event;
      boardId  = boardId  || ev.boardId || ev.board_id;
      itemId   = itemId   || ev.pulseId || ev.itemId || ev.pulse_id || ev.item_id;
      columnId = columnId || ev.columnId || ev.column_id;
      eventType = String(ev.type || '').toLowerCase();
      if (!newLabel && ev.value) {
        try {
          const parsed = typeof ev.value === 'string' ? JSON.parse(ev.value) : ev.value;
          if (parsed && parsed.label && parsed.label.text) {
            newLabel = parsed.label.text;
          } else if (parsed && parsed.label) {
            newLabel = parsed.label;
          }
        } catch (e) {
          // ignore parse error
        }
      }
    }

    console.log('[monday-events] normalized', {
      newLabel,
      boardId: String(boardId || ''),
      itemId: String(itemId || ''),
      columnId,
      STATUS_COLUMN_ID_VISUAL,
      BOARD_ID_VISUAL,
      eventType,
    });

    if (!boardId || !itemId) {
      return res.status(400).json({ ok: false, error: 'Missing boardId or itemId' });
    }

    if (CREATE_ITEM_EVENTS.has(eventType)) {
      return await handleLineItemWebhook(boardId, itemId, res);
    }

    // Only react to the VISUAL board
    if (BOARD_ID_VISUAL && String(boardId) !== String(BOARD_ID_VISUAL)) {
      return res
        .status(200)
        .json({ ok: true, ignored: `not the visual board (${BOARD_ID_VISUAL})` });
    }

    // Only react to the VISUAL status column
    if (columnId && columnId !== STATUS_COLUMN_ID_VISUAL) {
      return res
        .status(200)
        .json({
          ok: true,
          ignored: `not the visual status column (${STATUS_COLUMN_ID_VISUAL})`,
        });
    }

    if ((String(newLabel) || '').toUpperCase() !== 'START') {
      return res.status(200).json({ ok: true, ignored: 'status not START' });
    }

    // Fetch item + columns (also gives us board.id for mutation)
    const item = await getItemWithColumns(itemId);

    // Optional group gate
    if (GROUP_ID && String(item.group?.id) !== String(GROUP_ID)) {
      await postUpdate(
        itemId,
        `ℹ️ Ignored: item is in group **${item.group?.title || item.group?.id}**, not the configured group.`
      );
      return res
        .status(200)
        .json({ ok: true, ignored: 'wrong group', group: item.group?.id });
    }

    const cv = {};
    for (const c of item.column_values) cv[c.id] = c;

    const customer = CUSTOMER_IS_ITEM_NAME
      ? (item.name || '').trim()
      : (cv[COLS.CUSTOMER]?.text || '').trim();
    const jobTitle = (cv[COLS.JOB_TITLE]?.text || '').trim();
    const jobNo = (cv[COLS.JOB_NO]?.text || '').trim();
    const frontPos = (cv[COLS.FRONT_POS]?.text || '').trim();
    const backPos = (cv[COLS.BACK_POS]?.text || '').trim();
    const garmentCol = (cv[COLS.GARMENT_COLOR]?.text || '').trim();

    const hasFrontArt =
      !!(cv[COLS.FRONT_ART]?.value &&
        cv[COLS.FRONT_ART].value !== 'null' &&
        cv[COLS.FRONT_ART].value !== '');
    const hasBackArt =
      !!(cv[COLS.BACK_ART]?.value &&
        cv[COLS.BACK_ART].value !== 'null' &&
        cv[COLS.BACK_ART].value !== '');

    const missing = [];
    if (!customer) missing.push('Customer (item title)');
    if (!jobTitle) missing.push('JOB TITLE');
    if (!jobNo) missing.push('JOB NO');
    if (!hasFrontArt && !hasBackArt)
      missing.push('FRONT ARTWORK or BACK ARTWORK');

    if (missing.length) {
      await postUpdate(
        itemId,
        `❌ Cannot start – missing fields:<br>• ${missing.join('<br>• ')}`
      );
      return res.status(200).json({ ok: true, blocked: missing });
    }

    // Flip to IN PROGRESS on the visual status column (by index via label)
    const boardIdForMutation = item.board?.id || boardId;
    await setStatusByLabel(
      boardIdForMutation,
      itemId,
      STATUS_COLUMN_ID_VISUAL,
      STATUS_INPROGRESS_LABEL
    );

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

    // Enqueue a visual job for the local Illustrator runner
    const enqueuePayload = {
      boardId: Number(boardIdForMutation || boardId),
      itemId: Number(itemId),
      groupId: item.group?.id || null,
      jobTitle,
      jobNo,
      customer,
      frontPos,
      backPos,
      garmentColour: garmentCol,
      frontArtUrl: hasFrontArt ? cv[COLS.FRONT_ART]?.value || null : null,
      backArtUrl: hasBackArt ? cv[COLS.BACK_ART]?.value || null : null,
      metadata: {
        rawColumns: cv,
      },
    };

const baseUrl =
  process.env.INTERNAL_ENQUEUE_URL ||
  'https://mondayapp-refactor-production.up.railway.app';
await axios.post(`${baseUrl}/api/visual-jobs/enqueue`, enqueuePayload);


    return res.json({
      ok: true,
      action: 'queued_visual_job',
      itemId: String(itemId),
    });
  } catch (err) {
    console.error('[monday-events] error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;

function extractJobNumberFromText(text) {
  const match = String(text || '').match(/\b(\d{5})\b/);
  return match ? match[1] : null;
}

async function handleLineItemWebhook(boardId, itemId, res) {
  if (!LINEITEM_BOARD_ID) {
    return res.status(200).json({ ok: true, ignored: 'line-item importer disabled' });
  }

  if (String(boardId) !== String(LINEITEM_BOARD_ID)) {
    return res.status(200).json({ ok: true, ignored: 'not a tracked board' });
  }

  const item = await getItemWithColumns(itemId);
  const cv = {};
  for (const c of item.column_values) cv[c.id] = c;

  let jobNumber = null;
  if (LINEITEM_JOB_NO_COLUMN_ID && cv[LINEITEM_JOB_NO_COLUMN_ID]?.text) {
    jobNumber = (cv[LINEITEM_JOB_NO_COLUMN_ID].text || '').trim();
  }
  if (!jobNumber) {
    jobNumber = extractJobNumberFromText(item.name);
  }

  if (!jobNumber) {
    return res.status(200).json({ ok: true, ignored: 'job number missing' });
  }

  if (item.subitems && item.subitems.length > 0) {
    return res.status(200).json({ ok: true, ignored: 'subitems already exist' });
  }

  const result = await processJobNumber(jobNumber, { targetItemId: itemId });
  if (!result.ok && result.reason === 'job_in_progress') {
    return res.status(200).json({ ok: true, ignored: 'job already processing' });
  }
  if (!result.ok && result.reason === 'file_not_found') {
    return res.status(200).json({ ok: true, ignored: 'no matching Dropbox file' });
  }
  if (!result.ok) {
    throw new Error(result.reason || 'line-item import failed');
  }

  await postUpdate(
    itemId,
    `📥 Imported ${result.lineItems} line items from Dropbox file **${result.file}**.`
  );

  return res.json({
    ok: true,
    action: 'lineitems_imported',
    jobNumber,
    lineItems: result.lineItems,
  });
}
