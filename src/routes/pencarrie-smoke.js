const express = require('express');
const axios = require('axios');

const router = express.Router();

const PC_BASE_SANDBOX = 'https://sandbox.pencarrie.com/gateway';
const PC_BASE_MAIN = 'https://pencarrie.com/gateway';
const PC_CUSTOMER_CODE = process.env.PENCARRIE_CUSTOMER_CODE || 'ULPR';

function pickBaseUrlFromEnv() {
  const v = (process.env.PENCARRIE_ENV || '').toLowerCase();
  if (['live', 'prod', 'production', 'main'].includes(v)) return PC_BASE_MAIN;
  return PC_BASE_SANDBOX;
}

async function postForm({ baseUrl, params }) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) body.append(k, v);

  const resp = await axios.post(baseUrl, body.toString(), {
    headers: {
      Accept: 'application/xml,text/xml;q=0.9,*/*;q=0.1',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    timeout: 15000,
    maxRedirects: 5,
    validateStatus: () => true
  });

  return {
    status: resp.status,
    headers: resp.headers,
    text: typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data)
  };
}

router.get('/whoami', async (_req, res) => {
  try {
    let egressIp = null;
    try {
      const ip = await axios.get('https://api.ipify.org', { timeout: 5000 });
      egressIp = typeof ip.data === 'string' ? ip.data : null;
    } catch {}
    res.json({
      ok: true,
      env: process.env.PENCARRIE_ENV || 'sandbox (default)',
      baseUrl: pickBaseUrlFromEnv(),
      egressIp
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

router.get('/smoke', async (req, res) => {
  try {
    const sku = String(req.query['args[0]'] || req.query.sku || 'SS11').trim();
    const env = (req.query.env || '').toLowerCase();

    let baseUrl;
    if (env === 'sandbox') baseUrl = PC_BASE_SANDBOX;
    else if (env === 'main' || env === 'live' || env === 'production' || env === 'prod') baseUrl = PC_BASE_MAIN;
    else baseUrl = pickBaseUrlFromEnv();

    const params = {
      function: 'pcgetstock',
      code: PC_CUSTOMER_CODE,
      'args[0]': sku
    };
    const formString = new URLSearchParams(params).toString();

    const out = await postForm({ baseUrl, params });

    const preview = out.text.length > 1200 ? out.text.slice(0, 1200) + '…(truncated)' : out.text;

    res.status(200).json({
      ok: true,
      env: baseUrl.includes('sandbox') ? 'sandbox' : 'main',
      baseUrl,
      payload: { params, body: formString },
      sku,
      status: out.status,
      headers: {
        'content-type': out.headers['content-type'] || null,
        'cf-ray': out.headers['cf-ray'] || null
      },
      bodyPreview: preview
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

module.exports = router;
