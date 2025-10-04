const express = require('express');
const router = express.Router();
const { buildAuthorizeUrl, exchangeCodeForToken } = require('../services/monday');

router.get('/auth', (_req, res) => res.redirect(buildAuthorizeUrl()));

router.get('/callback', async (req, res) => {
  const { code, error, error_description } = req.query;
  if (error) return res.status(400).send(`OAuth error: ${error_description || error}`);
  if (!code) return res.status(400).send('No code received');
  try {
    await exchangeCodeForToken(code);
    res.redirect('/');
  } catch (e) {
    console.error('OAuth exchange failed:', e.message);
    res.status(500).send('Failed to authenticate');
  }
});

module.exports = router;
