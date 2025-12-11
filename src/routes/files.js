// src/routes/files.js
const express = require('express');
const multer = require('multer');
const router = express.Router();

const upload = multer({ limits: { fileSize: 25 * 1024 * 1024 } }); // 25MB cap for webcam shots

const { JOB_FILES_COLUMN_ID } = require('../config/env');
const { getAccessToken, addFileToColumn } = require('../services/monday');
const { enqueue } = require('../services/imageAnalysisQueue');
const { downloadAsset } = require('../services/mondayAssets');
const { inferMimeType } = require('../services/visualAnalysis');

router.post('/api/items/:itemId/file', upload.single('file'), async (req, res) => {
  try {
    if (!getAccessToken()) return res.status(401).json({ error: 'Not authenticated with Monday' });
    if (!JOB_FILES_COLUMN_ID) return res.status(500).json({ error: 'Files column not configured' });

    const { itemId } = req.params;
    if (!itemId) return res.status(400).json({ error: 'Missing itemId' });

    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Missing file' });
    if (file.mimetype && !file.mimetype.startsWith('image/')) {
      return res.status(400).json({ error: 'Only image uploads are supported' });
    }

    const filename = file.originalname || `capture-${Date.now()}.jpg`;
    const result = await addFileToColumn(itemId, JOB_FILES_COLUMN_ID, file.buffer, filename);

    // Fire-and-forget visual analysis; does not affect response
    try {
      const side = req.body?.side || req.query?.side || null;
      enqueue({ itemId, side, filename });
    } catch (err) {
      console.warn('[files] enqueue analysis failed:', err?.message || err);
    }

    return res.json({ ok: true, asset: result });
  } catch (err) {
    console.error('[files] upload error:', err?.message || err);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// Inline asset proxy to bypass Monday's frame restrictions (e.g., PDFs)
router.get('/api/assets/:assetId/inline', async (req, res) => {
  try {
    const { assetId } = req.params;
    if (!assetId) return res.status(400).json({ error: 'Missing assetId' });

    const name = String(req.query.name || 'file');
    const buffer = await downloadAsset(assetId);
    const mime = inferMimeType(name);
    const safeName = name.replace(/["\r\n]/g, '');

    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
    res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate');
    return res.send(buffer);
  } catch (err) {
    console.error('[files] inline asset error:', err?.message || err);
    return res.status(500).json({ error: 'Failed to load asset' });
  }
});

module.exports = router;
