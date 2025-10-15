// test-pencarrie.js
const fetch = (...a) => import('node-fetch').then(({ default: f }) => f(...a));
const { URLSearchParams } = require('node:url');
const dns = require('node:dns').promises;

const {
  GATEWAY_URL = 'https://pencarrie.com/gateway',
  CUSTOMER_CODE = process.env.PENCARRIE_CUSTOMER_CODE || 'ULMP',
  USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
  ACCEPT = 'application/xml,text/xml;q=0.9,*/*;q=0.1',
  METHOD = 'POST', // 'POST' or 'GET'
  RETRY_GET_ON_403 = 'true',
  TIMEOUT_MS = '20000',
  FORCE_HOST = '', // set to 'pencarrie.com' only if you really need to
} = process.env;

function looksLikeHtml(s = '') { return /<!DOCTYPE\s+html>|<html[\s>]/i.test(s); }
function looksLikeXml(s = '') { return /^<\?xml|^\s*<\w+/i.test(s); }
function short(s = '', n = 800) { s = String(s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; }

async function resolveHost(urlStr) {
  try {
    const u = new URL(urlStr);
    const addrs = await dns.resolve4(u.hostname);
    return { host: u.hostname, addrs };
  } catch (e) {
    return { error: e.message };
  }
}

async function call(method, urlStr, form) {
  const headers = { Accept: ACCEPT, 'User-Agent': USER_AGENT };
  if (FORCE_HOST) headers.Host = FORCE_HOST;
  const body = method === 'POST' ? form.toString() : undefined;
  if (method === 'POST') headers['Content-Type'] = 'application/x-www-form-urlencoded';

  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), Number(TIMEOUT_MS));

  const res = await fetch(urlStr, { method, headers, body, signal: ctrl.signal }).catch((e) => { throw e; });
  clearTimeout(to);

  const text = await res.text().catch(() => '');
  const ray = res.headers.get('cf-ray') || null;
  const ct = res.headers.get('content-type') || '';

  console.log('\n=== PenCarrie RESPONSE ===');
  console.log('URL:', urlStr);
  console.log('Method:', method);
  console.log('Status:', res.status);
  console.log('Content-Type:', ct);
  console.log('cf-ray:', ray);
  console.log('Looks like HTML?', looksLikeHtml(text));
  console.log('Looks like XML?', looksLikeXml(text));
  console.log('Body (short):', short(text), '\n');

  return { res, text, ct };
}

async function main() {
  const form = new URLSearchParams();
  form.set('function', 'pclist');
  form.set('code', CUSTOMER_CODE);

  const dnsInfo = await resolveHost(GATEWAY_URL);
  console.log('Gateway:', GATEWAY_URL);
  console.log('Customer code:', CUSTOMER_CODE);
  console.log('DNS:', dnsInfo, '\n');

  // Primary attempt
  let primaryMethod = (METHOD || 'POST').toUpperCase();
  let url = new URL(GATEWAY_URL);

  if (primaryMethod === 'GET') {
    for (const [k, v] of form) url.searchParams.set(k, v);
  }

  let attempt = await call(primaryMethod, url.toString(), form);

  // If POST hit an HTML 403 (WAF), try GET once
  if (
    primaryMethod !== 'GET' &&
    attempt.res.status === 403 &&
    looksLikeHtml(attempt.text) &&
    RETRY_GET_ON_403 === 'true'
  ) {
    console.warn('POST returned HTML 403 — retrying once with GET…\n');
    const getUrl = new URL(GATEWAY_URL);
    for (const [k, v] of form) getUrl.searchParams.set(k, v);
    attempt = await call('GET', getUrl.toString(), form);
  }

  if (!attempt.res.ok) {
    console.error('Non-OK response:', attempt.res.status);
    process.exit(1);
  }

  // Success path (likely XML). Print a little more if XML.
  if (/xml/i.test(attempt.ct) || looksLikeXml(attempt.text)) {
    console.log('XML received (truncated):\n', short(attempt.text, 1200));
  } else {
    console.log('Non-XML success body (truncated):\n', short(attempt.text, 1200));
  }
}

main().catch((e) => {
  console.error('Error:', e.message || e);
  process.exit(1);
});
