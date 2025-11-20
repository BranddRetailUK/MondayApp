// src/routes/dropbox-webhook.js
const express = require('express');
const router = express.Router();

const { syncOpenOrdersFromDropbox } = require('../services/openOrdersSync');

router.get('/webhook', (req, res) => {
  const challenge = req.query.challenge;
  if (challenge) {
    return res.status(200).send(challenge);
  }
  return res.status(400).send('Missing challenge');
});

router.post('/webhook', async (req, res) => {
  res.status(200).json({ ok: true });
  try {
    await syncOpenOrdersFromDropbox();
  } catch (err) {
    console.error('[dropbox-webhook] sync failed:', err);
  }
});

module.exports = router;
