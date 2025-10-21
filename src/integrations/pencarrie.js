// src/integrations/pencarrie.js
// PenCarrie XML gateway client (spec-exact + pragmatic WAF-safe fallbacks)

const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
const { parseStringPromise } = require('xml2js');
const dns = require('node:dns').promises;
const { URLSearchParams } = require('node:url');

const {
  // REQUIRED
  PENCARRIE_GATEWAY_URL,            // e.g. https://pencarrie.com/gateway or https://sandbox.pencarrie.com/gateway
  PENCARRIE_CUSTOMER_CODE,          // e.g. ULMP

  // Diagnostics / tuning
  PENCARRIE_ENV = 'live',           // 'sandbox' | 'live'
  PENCARRIE_HTTP_TIMEOUT_MS = '20000',

  // Host checks & overrides
  // If not set, we assert a sane default based on PENCARRIE_ENV
  PENCARRIE_EXPECT_HOST_REGEX,      // e.g. ^pencarrie\.com$  (override/disable by setting to empty)
  PENCARRIE_FORCE_HOST_HEADER,      // if set, send Host: <value> (leave UNSET for sandbox)

  // Fallback/compat controls
  PENCARRIE_RETRY_GET_ON_403 = 'true',     // default: true (helps with strict WAFs — one GET retry)
  PENCARRIE_METHOD,                        // optional hard override: 'POST' or 'GET'

  // Headers
  PENCARRIE_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
  PENCARRIE_ACCEPT_HEADER = 'application/xml,text/xml;q=0.9,*/*;q=0.1',
} = process.env;

if (!PENCARRIE_GATEWAY_URL) console.warn('[PenCarrie] Missing PENCARRIE_GATEWAY_URL in env');
if (!PENCARRIE_CUSTOMER_CODE) console.warn('[PenCarrie] Missing PENCARRIE_CUSTOMER_CODE in env');

function defaultExpectHostRegex() {
  if (typeof PENCARRIE_EXPECT_HOST_REGEX === 'string') return PENCARRIE_EXPECT_HOST_REGEX;
  return PENCARRIE_ENV === 'sandbox'
    ? '^sandbox\\.pencarrie\\.com$'
    : '^pencarrie\\.com$';
}

function buildForm(fn, params = {}) {
  const form = new URLSearchParams();
  form.set('function', fn);
  form.set('code', PENCARRIE_CUSTOMER_CODE);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) form.set(k, String(v));
  }
  return form;
}

function looksLikeHtml(s = '') {
  return /<!DOCTYPE\s+html>|<html[\s>]/i.test(s);
}
function looksLikeXml(s = '') {
  return /^<\?xml|^\s*<\w+/i.test(s);
}
function short(s = '', n = 600) {
  if (!s) return s;
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length > n ? `${one.slice(0, n)}…` : one;
}

async function resolveHostDiagnostics(urlStr) {
  try {
    const u = new URL(urlStr);
    const addrs = await dns.resolve4(u.hostname);
    return { host: u.hostname, addresses: addrs };
  } catch (e) {
    return { error: `DNS resolve failed: ${e.message}` };
  }
}

function makeHeaders(method) {
  const headers = {
    Accept: PENCARRIE_ACCEPT_HEADER,
    'User-Agent': PENCARRIE_USER_AGENT,
    'Accept-Language': 'en-GB,en;q=0.9',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
  };
  if (method === 'POST') {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }
  // IMPORTANT: Do NOT force Host for sandbox unless explicitly set
  if (PENCARRIE_FORCE_HOST_HEADER) headers['Host'] = PENCARRIE_FORCE_HOST_HEADER;
  return headers;
}

async function callOnce(method, urlStr, form) {
  const dnsInfo = await resolveHostDiagnostics(urlStr);

  const headers = makeHeaders(method);
  const opts = {
    method,
    headers,
    body: method === 'POST' ? form.toString() : undefined,
    redirect: 'follow',
    signal: AbortSignal.timeout(Number(PENCARRIE_HTTP_TIMEOUT_MS)),
  };

  console.log('[PenCarrie][REQ]', {
    env: PENCARRIE_ENV,
    url: urlStr,
    host: dnsInfo.host,
    hostAddrs: dnsInfo.addresses,
    method,
    headers: Object.keys(headers),
    bodyBytes: opts.body ? opts.body.length : 0,
  });

  let res;
  try {
    res = await fetch(urlStr, opts);
  } catch (err) {
    throw new Error(`[PenCarrie] fetch failed: ${err.message}`);
  }

  const cfRay = res.headers.get('cf-ray') || null;
  const contentType = res.headers.get('content-type') || '';
  const location = res.headers.get('location') || null;
  let raw = '';
  try { raw = await res.text(); } catch {}

  console.log('[PenCarrie][RES]', {
    status: res.status,
    contentType,
    location,
    cfRay,
    html: looksLikeHtml(raw),
    xml: looksLikeXml(raw),
    snippet: short(raw, 300),
  });

  return { res, contentType, location, cfRay, raw };
}

async function parseXmlOrThrow(raw) {
  try {
    return await parseStringPromise(raw, { explicitArray: false, attrkey: '$' });
  } catch (e) {
    throw new Error(`[PenCarrie] Failed to parse XML: ${e.message}`);
  }
}

async function callGateway(fn, params = {}) {
  if (!PENCARRIE_GATEWAY_URL) throw new Error('[PenCarrie] PENCARRIE_GATEWAY_URL is not set');

  const u = new URL(PENCARRIE_GATEWAY_URL);
  const expectRx = defaultExpectHostRegex();
  if (expectRx) {
    const re = new RegExp(expectRx);
    if (!re.test(u.hostname)) {
      throw new Error(
        `[PenCarrie] Host assertion failed. URL host '${u.hostname}' does not match '${expectRx}'.`
      );
    }
  }

  const form = buildForm(fn, params);

  // Primary method (POST by default)
  const primaryMethod = (PENCARRIE_METHOD || 'POST').toUpperCase();

  let attempt;
  if (primaryMethod === 'GET') {
    const urlWithQs = new URL(PENCARRIE_GATEWAY_URL);
    for (const [k, v] of form) urlWithQs.searchParams.set(k, v);
    attempt = await callOnce('GET', urlWithQs.toString(), form);
  } else {
    attempt = await callOnce('POST', PENCARRIE_GATEWAY_URL, form);
  }

  // WAF front-door pattern: HTML 403 — try GET once if enabled and we haven’t already used GET
  if (
    attempt.res.status === 403 &&
    looksLikeHtml(attempt.raw) &&
    PENCARRIE_RETRY_GET_ON_403 === 'true' &&
    primaryMethod !== 'GET'
  ) {
    console.warn('[PenCarrie] 403 HTML on POST — retrying once with GET & query params.');
    const urlWithQs = new URL(PENCARRIE_GATEWAY_URL);
    for (const [k, v] of form) urlWithQs.searchParams.set(k, v);
    attempt = await callOnce('GET', urlWithQs.toString(), form);
  }

  if (!attempt.res.ok) {
    const wafHint = attempt.cfRay ? ` cf-ray=${attempt.cfRay};` : '';
    if (looksLikeHtml(attempt.raw)) {
      throw new Error(
        `[PenCarrie] HTTP ${attempt.res.status} HTML body — likely Cloudflare/WAF front door.${wafHint} ` +
        `Check IP allow-listing and CF exception for ${u.hostname}. Snippet: ${short(attempt.raw, 300)}`
      );
    }
    if (/json/i.test(attempt.contentType)) {
      try {
        const j = JSON.parse(attempt.raw);
        throw new Error(`[PenCarrie] HTTP ${attempt.res.status}:${wafHint} ${JSON.stringify(j)}`);
      } catch {}
    }
    if (/xml|text\/xml/i.test(attempt.contentType) || looksLikeXml(attempt.raw)) {
      const xml = await parseXmlOrThrow(attempt.raw);
      throw new Error(`[PenCarrie] HTTP ${attempt.res.status}:${wafHint} ${JSON.stringify(xml)}`);
    }
    throw new Error(`[PenCarrie] HTTP ${attempt.res.status}:${wafHint} ${short(attempt.raw, 200) || 'No body'}`);
  }

  if (/xml|text\/xml/i.test(attempt.contentType) || looksLikeXml(attempt.raw)) {
    return parseXmlOrThrow(attempt.raw);
  }
  if (/json/i.test(attempt.contentType)) {
    try { return JSON.parse(attempt.raw); }
    catch (e) { throw new Error(`[PenCarrie] Failed to parse JSON: ${e.message}`); }
  }

  throw new Error(
    `[PenCarrie] Unexpected response type (status ${attempt.res.status}, content-type '${attempt.contentType}'). Body starts: ${short(attempt.raw, 200)}`
  );
}

// ===== High-level helpers (XML gateway functions) =====

async function listOrders() {
  const data = await callGateway('pclist');
  const ordersNode = data?.orders?.order;
  const orders = ordersNode ? (Array.isArray(ordersNode) ? ordersNode : [ordersNode]) : [];
  return orders.map((o) => ({
    ordcode: o.$?.ordcode || o.ordcode || '',
    ordno: o.ordno || '',
    status: o.status || o.ordstat || '',
    trackntrace: o.trackntrace || '',
    delcarrier: o.delcarrier || '',
    del_tid: o.del_tid || '',
    eta_min: o.minimum_delivery_date || '',
    eta_max: o.maximum_delivery_date || '',
    created: o.created || o.orderdate || '',
    canedit: o.canedit === 'true' || o.canedit === true,
    cancancel: o.cancancel === 'true' || o.cancancel === true,
  }));
}

async function getOrder(ordcode) {
  if (!ordcode) throw new Error('[PenCarrie] getOrder requires ordcode');
  const data = await callGateway('pcget', { ordcode });
  const order = data?.order || {};
  const itemsNode = order?.items?.item;
  const items = itemsNode ? (Array.isArray(itemsNode) ? itemsNode : [itemsNode]) : [];
  return {
    header: {
      ordcode: order.$?.ordcode || order.ordcode || ordcode,
      ordno: order.ordno || '',
      status: order.status || order.ordstat || '',
      trackntrace: order.trackntrace || '',
      delcarrier: order.delcarrier || '',
      del_tid: order.del_tid || '',
      eta_min: order.minimum_delivery_date || '',
      eta_max: order.maximum_delivery_date || '',
      created: order.created || order.orderdate || '',
    },
    items: items.map((it) => ({
      sku: it.sku || it.code || '',
      descr: it.description || '',
      qty: Number(it.qty || it.quantity || 0),
      cref: it.cref || it.ref || '',
    })),
  };
}

async function getStock(sku) {
  if (!sku) throw new Error('[PenCarrie] getStock requires sku');
  // Function name per PenCarrie docs
  return callGateway('pcgetstock', { sku });
}

// ===== Diagnostics =====

async function checkIpAndHost() {
  const info = { baseUrl: PENCARRIE_GATEWAY_URL || '(unset)', env: PENCARRIE_ENV, egressIp: 'unknown' };
  try {
    const r = await fetch('https://api.ipify.org?format=json', {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });
    const j = await r.json();
    info.egressIp = j?.ip || 'unknown';
  } catch {}
  try {
    const u = new URL(PENCARRIE_GATEWAY_URL);
    info.host = u.hostname;
    info.resolved = await dns.resolve4(u.hostname);
  } catch (e) {
    info.resolveError = e.message;
  }
  return info;
}

module.exports = { listOrders, getOrder, getStock, callGateway, checkIpAndHost };
