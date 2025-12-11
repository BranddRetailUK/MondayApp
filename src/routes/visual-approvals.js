const express = require('express');
const router = express.Router();

const { getAssetPublicUrl } = require('../services/mondayAssets');
const { analyzeItemSide, resolveFilesForSide, SIDE_FRONT, inferMimeType } = require('../services/visualAnalysis');
const { getItemWithColumns, setCheckboxColumn, moveItemToGroup } = require('../services/mondayClient');
const { PROOF_APPROVED_COLUMN_ID, PRE_PRODUCTION_GROUP_ID, BOARD_ID } = require('../config/env');
const visualNotifications = require('../services/visualNotifications');

function bool(v) {
  const s = String(v || '').toLowerCase();
  return s === '1' || s === 'true' || s === 'yes';
}

// Notification count endpoint (must come before param routes)
router.get('/api/visual-approvals/notifications', (_req, res) => {
  try {
    return res.json({ ok: true, count: visualNotifications.count(), items: visualNotifications.list() });
  } catch (err) {
    console.error('[visual-approvals] notifications error:', err?.message || err);
    return res.status(500).json({ ok: false, error: 'failed_notifications' });
  }
});

router.get('/api/visual-approvals/:itemId', async (req, res) => {
  try {
    const { itemId } = req.params;
    const side = SIDE_FRONT;
    const analyze = bool(req.query.analyze);

    const { proofFile, capturedFile, finishedFiles = [], jobFiles = [] } = await resolveFilesForSide({ itemId, side });
    if (!proofFile?.assetId) return res.status(400).json({ ok: false, error: 'No proof/visual found' });
    if (!capturedFile?.assetId) return res.status(400).json({ ok: false, error: 'No captured file found' });

    console.log('[visual-approvals] resolve', {
      itemId,
      side,
      proofFile,
      capturedFile,
      analyze
    });

    const proofTargetsRaw = (Array.isArray(finishedFiles) && finishedFiles.length ? finishedFiles : [proofFile]).filter(Boolean);
    const seen = new Set();
    const proofTargets = [];
    for (const f of proofTargetsRaw) {
      const key = f.assetId || f.id || f.name;
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      proofTargets.push(f);
      if (proofTargets.length >= 4) break;
    }

    const proofs = await Promise.all(proofTargets.map(async (file) => {
      const meta = await getAssetPublicUrl(file.assetId);
      const url = meta.publicUrl || meta.signedUrl;
      return url ? {
        name: file.name,
        url,
        mime: inferMimeType(file.name),
        assetId: file.assetId
      } : null;
    }));

    const proofMeta = proofs.find(Boolean);
    const capturedMeta = await getAssetPublicUrl(capturedFile.assetId);
    const capturedUrl = capturedMeta.publicUrl || capturedMeta.signedUrl;
    const capturedMime = inferMimeType(capturedFile.name);

    if (!proofMeta?.url || !capturedUrl) {
      console.warn('[visual-approvals] missing urls', { proofMeta, capturedUrl, capturedMeta });
    }

    let analysis = null;
    if (analyze) {
      const { parsed } = await analyzeItemSide({ itemId, side, uploadedFilename: capturedFile.name, skipUpdate: true });
      analysis = parsed;
    }

    return res.json({
      ok: true,
      side,
      proof: proofMeta || { name: proofFile.name, url: proofMeta?.url || null, mime: inferMimeType(proofFile.name), assetId: proofFile.assetId },
      proofs: proofs.filter(Boolean),
      captured: { name: capturedFile.name, url: capturedUrl, mime: capturedMime, assetId: capturedFile.assetId },
      capturedFiles: Array.isArray(jobFiles) ? jobFiles.map(f => ({ name: f.name, assetId: f.assetId, url: null, mime: inferMimeType(f.name) })) : [],
      analysis
    });
  } catch (err) {
    console.error('[visual-approvals] error:', err?.message || err);
    return res.status(500).json({ ok: false, error: err.message || 'internal_error' });
  }
});

router.post('/api/visual-approvals/:itemId/approve', async (req, res) => {
  try {
    const { itemId } = req.params;
    if (!PROOF_APPROVED_COLUMN_ID) throw new Error('PROOF_APPROVED_COLUMN_ID not configured');
    const item = await getItemWithColumns(itemId);
    const boardId = item?.board?.id || BOARD_ID;
    if (!boardId) throw new Error('Board id not available for approval');

    await setCheckboxColumn(boardId, itemId, PROOF_APPROVED_COLUMN_ID, true);
    visualNotifications.remove(itemId);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[visual-approvals] approve error:', err?.message || err);
    return res.status(500).json({ ok: false, error: err.message || 'internal_error' });
  }
});

router.post('/api/visual-approvals/:itemId/reject', async (req, res) => {
  try {
    const { itemId } = req.params;
    if (!PRE_PRODUCTION_GROUP_ID) throw new Error('PRE_PRODUCTION_GROUP_ID not configured');
    const item = await getItemWithColumns(itemId);
    const subitems = Array.isArray(item?.subitems) ? item.subitems : [];

    await moveItemToGroup(itemId, PRE_PRODUCTION_GROUP_ID);
    let movedSubitems = 0;
    const failedSubitems = [];
    for (const sub of subitems) {
      try {
        await moveItemToGroup(sub.id, PRE_PRODUCTION_GROUP_ID);
        movedSubitems++;
      } catch (err) {
        console.warn('[visual-approvals] subitem move failed', { subId: sub.id, message: err?.message || err });
        failedSubitems.push({ id: sub.id, name: sub.name, error: err?.message || 'move_failed' });
      }
    }

    visualNotifications.remove(itemId);
    return res.json({ ok: true, movedSubitems, failedSubitems });
  } catch (err) {
    console.error('[visual-approvals] reject error:', err?.message || err);
    return res.status(500).json({ ok: false, error: err.message || 'internal_error' });
  }
});

router.get('/api/visual-approvals/notifications', (_req, res) => {
  return res.json({ ok: true, count: visualNotifications.count(), items: visualNotifications.list() });
});

module.exports = router;
