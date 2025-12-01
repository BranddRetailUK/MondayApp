// src/routes/dropbox-webhook.js
const express = require('express');
const router = express.Router();

const { syncOpenOrdersFromDropbox } = require('../services/openOrdersSync');

let syncInFlight = false;

router.get('/webhook', (req, res) => {
  const challenge = req.query.challenge;
  if (challenge) {
    return res.status(200).send(challenge);
  }
  return res.status(400).send('Missing challenge');
});

router.post('/webhook', async (req, res) => {
  console.log(
    `[dropbox-webhook] POST received at ${new Date().toISOString()} from ${
      req.ip || 'unknown'
    }`
  );
  if (syncInFlight) {
    console.log('[dropbox-webhook] sync already running; ignoring duplicate webhook');
    return res.status(200).json({ ok: true, ignored: 'sync_in_progress' });
  }

  res.status(200).json({ ok: true });
  syncInFlight = true;
  try {
    await syncOpenOrdersFromDropbox();
    console.log('[dropbox-webhook] sync finished');
  } catch (err) {
    console.error('[dropbox-webhook] sync failed:', err);
  } finally {
    syncInFlight = false;
  }
});

module.exports = router;
