const express = require('express');
const router = express.Router();

const { getAssetPublicUrl } = require('../services/mondayAssets');
const { analyzeItemSide, resolveFilesForSide, SIDE_FRONT } = require('../services/visualAnalysis');

function bool(v) {
  const s = String(v || '').toLowerCase();
  return s === '1' || s === 'true' || s === 'yes';
}

router.get('/api/visual-approvals/:itemId', async (req, res) => {
  try {
    const { itemId } = req.params;
    const side = (req.query.side || SIDE_FRONT).toString();
    const analyze = bool(req.query.analyze);

    const { proofFile, capturedFile } = await resolveFilesForSide({ itemId, side });
    if (!proofFile?.assetId) return res.status(400).json({ ok: false, error: 'No proof/visual found' });
    if (!capturedFile?.assetId) return res.status(400).json({ ok: false, error: 'No captured file found' });

    console.log('[visual-approvals] resolve', {
      itemId,
      side,
      proofFile,
      capturedFile,
      analyze
    });

    const proofMeta = await getAssetPublicUrl(proofFile.assetId);
    const capturedMeta = await getAssetPublicUrl(capturedFile.assetId);
    const proofUrl = proofMeta.publicUrl || proofMeta.signedUrl;
    const capturedUrl = capturedMeta.publicUrl || capturedMeta.signedUrl;

    if (!proofUrl || !capturedUrl) {
      console.warn('[visual-approvals] missing urls', { proofUrl, capturedUrl, proofMeta, capturedMeta });
    }

    let analysis = null;
    if (analyze) {
      const { parsed } = await analyzeItemSide({ itemId, side, uploadedFilename: capturedFile.name, skipUpdate: true });
      analysis = parsed;
    }

    return res.json({
      ok: true,
      side,
      proof: { name: proofFile.name, url: proofUrl },
      captured: { name: capturedFile.name, url: capturedUrl },
      analysis
    });
  } catch (err) {
    console.error('[visual-approvals] error:', err?.message || err);
    return res.status(500).json({ ok: false, error: err.message || 'internal_error' });
  }
});

module.exports = router;
