// src/routes/files.js
const express = require('express');
const multer = require('multer');
const router = express.Router();

const upload = multer({ limits: { fileSize: 25 * 1024 * 1024 } }); // 25MB cap for webcam shots

const { JOB_FILES_COLUMN_ID } = require('../config/env');
const { getAccessToken, addFileToColumn } = require('../services/monday');

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

    return res.json({ ok: true, asset: result });
  } catch (err) {
    console.error('[files] upload error:', err?.message || err);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

module.exports = router;
