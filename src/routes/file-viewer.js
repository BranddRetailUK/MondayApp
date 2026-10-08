const express = require('express');
const path = require('node:path');
const { requireHubFullApiAccess } = require('../middleware/hubAuth');

const router = express.Router();
const rendererAssets = new Set(['pdf.mjs', 'pdf.worker.mjs']);
router.get('/file-viewer-renderer/:asset', requireHubFullApiAccess, (req, res) => {
  if (!rendererAssets.has(req.params.asset)) return res.sendStatus(404);
  res.set('Cache-Control', 'private, no-store');
  return res.sendFile(path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'build', req.params.asset));
});
module.exports = router;
