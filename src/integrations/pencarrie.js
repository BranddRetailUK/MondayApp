// src/integrations/pencarrie.js
// XML gateway client with strict redirect handling, richer diagnostics, DNS/egress checks,
// optional Host header pinning, and a one-time GET fallback if POST gets a 403 HTML/WAF block.

const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
const { parseStringPromise } = require('xml2js');
const dns = require('node:dns').promises;
const { URLSearchParams } = require('node:url');

const {
  PENCARRIE_ENV = 'live',
  // Example: https://gateway.pencarrie.com/xml (confirm exact API URL with PenCarrie)
  PENCARRIE_GATEWAY_URL,
  PENCARRIE_CUSTOMER_CODE,
  PENCARRIE_HTTP_TIMEOUT_MS = '20000',

  // Optional hard assertions / tweaks
  PENCARRIE_EXPECT_HOST_REGEX, // e.g. ^gateway\.pencarrie\.com$
  PENCARRIE_FORCE_HOST_HEADER, // if set, we send `Host: <value>`
  PENCARRIE_SEND_REFERER = 'true', // some WAFs want a referer/origin
  PENCARRIE_RETRY_GET_ON_403 = 'true', // try GET once if POST gets 403 HTML
} = process.env;

if (!PENCARRIE_GATEWAY_URL) {
  console.warn('[PenCarrie] Missing PENCARRIE_GATEWAY_URL in env');
}
if (!PENCARRIE_CUSTOMER_CODE) {
  console.warn('[PenCarrie] Missing PENCARRIE_CUSTOMER_CODE in env');
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

async function callOnce(method, urlStr, form, noteHeaders = {}) {
  const u = new URL(urlStr);

  const headers = {
    // Many legacy XML gateways prefer very tight Accepts:
    'Accept': 'application/xml,text/xml;q=0.9,*/*;q=0.1',
    'Content-Type': method === 'POST' ? 'application/x-www-form-urlencoded' : 'application/xml',
    'User-Agent': 'GGApparel-PenCarrie/1.0 (+support@ggapparel.co.uk)',
    ...noteHeaders,
  };

  if (PENCARRIE_FORCE_HOST_HEADER) {
    headers['Host'] = PENCARRIE_FORCE_HOST_HEADER;
  }
  if (PENCARRIE_SEND_REFERER !== 'false') {
    headers['Origin'] = `${u.protocol}//${u.host}`;
    headers['Referer'] = `${u.protocol}//${u.host}/`;
  }

  const opts = {
    method,
    headers,
    body: method === 'POST' ? form.toString() : undefined,
    redirect: 'manual', // do not silently follow to the public site
    signal: AbortSignal.timeout(Number(PENCARRIE_HTTP_TIMEOUT_MS)),
  };

  const dnsInfo = await resolveHostDiagnostics(urlStr);
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

  const contentType = res.headers.get('content-type') || '';
  const location = res.headers.get('location') || null;
  const raw = await res.text().catch(() => '');

  console.log('[PenCarrie][RES]', {
    status: res.status,
    contentType,
    location,
    html: looksLikeHtml(raw),
    xml: looksLikeXml(raw),
    snippet: short(raw, 300),
  });

  return { res, contentType, location, raw };
}

async function parseXmlOrThrow(raw) {
  try {
    return await parseStringPromise(raw, { explicitArray: false, attrkey: '$' });
  } catch (e) {
    throw new Error(`[PenCarrie] Failed to parse XML: ${e.message}`);
  }
}

async function callGateway(fn, params = {}) {
  if (!PENCARRIE_GATEWAY_URL) {
    throw new Error('[PenCarrie] PENCARRIE_GATEWAY_URL is not set');
  }

  const u = new URL(PENCARRIE_GATEWAY_URL);
  if (PENCARRIE_EXPECT_HOST_REGEX) {
    const re = new RegExp(PENCARRIE_EXPECT_HOST_REGEX);
    if (!re.test(u.hostname)) {
      throw new Error(
        `[PenCarrie] Host assertion failed. URL host is '${u.hostname}' which does not match '${PENCARRIE_EXPECT_HOST_REGEX}'.`
      );
    }
  }

  const form = buildForm(fn, params);

  // Primary attempt: POST (typical for these gateways)
  let attempt = await callOnce('POST', PENCARRIE_GATEWAY_URL, form);

  // Manual redirect diagnostics (bounced to website or wrong path)
  if (attempt.res.status >= 300 && attempt.res.status < 400) {
    const { location } = attempt;
    throw new Error(
      `[PenCarrie] ${attempt.res.status} Redirect received${location ? ` -> ${location}` : ''}. This usually means wrong host/path or the gateway is bouncing you to the public site.`
    );
  }

  // 403 handling
  if (attempt.res.status === 403) {
    if (looksLikeHtml(attempt.raw)) {
      // Optional one-time GET retry (some gateways want GET for read-only functions)
      if (PENCARRIE_RETRY_GET_ON_403 !== 'false') {
        console.warn('[PenCarrie] 403 HTML on POST — retrying once with GET and query params.');
        const urlWithQs = new URL(PENCARRIE_GATEWAY_URL);
        for (const [k, v] of form) urlWithQs.searchParams.set(k, v);
        attempt = await callOnce('GET', urlWithQs.toString(), form, {});
      }
      // If still 403 + HTML, throw a specific error.
      if (attempt.res.status === 403 && looksLikeHtml(attempt.raw)) {
        throw new Error(
          '[PenCarrie] 403 HTML response — likely the public website / WAF block. Confirm API gateway URL and that your current egress IP is whitelisted.'
        );
      }
    } else {
      throw new Error('[PenCarrie] 403 Forbidden from gateway.');
    }
  }

  // Non-OK handling
  if (!attempt.res.ok) {
    if (looksLikeHtml(attempt.raw)) {
      throw new Error(
        `[PenCarrie] HTTP ${attempt.res.status} HTML body — likely wrong host/path or blocked by WAF. Snippet: ${short(attempt.raw, 300)}`
      );
    }
    // Try to parse XML/JSON for details
    if (/json/i.test(attempt.contentType)) {
      try {
        const j = JSON.parse(attempt.raw);
        throw new Error(`[PenCarrie] HTTP ${attempt.res.status}: ${JSON.stringify(j)}`);
      } catch {
        // fallthrough
      }
    }
    if (/xml|text\/xml/i.test(attempt.contentType) || looksLikeXml(attempt.raw)) {
      const xml = await parseXmlOrThrow(attempt.raw);
      throw new Error(`[PenCarrie] HTTP ${attempt.res.status}: ${JSON.stringify(xml)}`);
    }
    throw new Error(`[PenCarrie] HTTP ${attempt.res.status}: ${short(attempt.raw, 200) || 'No body'}`);
  }

  // OK path: parse XML first
  if (/xml|text\/xml/i.test(attempt.contentType) || looksLikeXml(attempt.raw)) {
    return parseXmlOrThrow(attempt.raw);
  }
  // Some endpoints might return JSON on error/special cases
  if (/json/i.test(attempt.contentType)) {
    try {
      return JSON.parse(attempt.raw);
    } catch (e) {
      throw new Error(`[PenCarrie] Failed to parse JSON: ${e.message}`);
    }
  }

  // Unexpected content-type
  throw new Error(
    `[PenCarrie] Unexpected response type (status ${attempt.res.status}, content-type '${attempt.contentType}'). Body starts: ${short(attempt.raw, 200)}`
  );
}

// --- High-level helpers (XML gateway functions) ---

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

// --- Diagnostics ---

async function checkIpAndHost() {
  const info = { baseUrl: PENCARRIE_GATEWAY_URL || '(unset)', env: PENCARRIE_ENV, egressIp: 'unknown' };
  try {
    const r = await fetch('https://api.ipify.org?format=json', {
      method: 'GET',
      redirect: 'manual',
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

module.exports = { listOrders, getOrder, callGateway, checkIpAndHost };
