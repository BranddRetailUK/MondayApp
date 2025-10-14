// src/integrations/pencarrie.js
// Hardened XML gateway client with strict redirects, UA, JSON/XML sniffing, and rich diagnostics.

const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
const { parseStringPromise } = require('xml2js');

const {
  PENCARRIE_ENV = 'live',
  PENCARRIE_GATEWAY_URL = 'https://pencarrie.com/gateway', // confirm exact API URL with PenCarrie
  PENCARRIE_CUSTOMER_CODE,
  PENCARRIE_HTTP_TIMEOUT_MS = '20000',
} = process.env;

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
  return /^<\?xml|\s*<\w+/i.test(s);
}

async function callGateway(fn, params = {}) {
  if (!PENCARRIE_GATEWAY_URL) {
    throw new Error('[PenCarrie] PENCARRIE_GATEWAY_URL is not set');
  }

  const form = buildForm(fn, params);
  const url = PENCARRIE_GATEWAY_URL;

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Accept': 'application/xml, text/xml;q=0.9, application/json;q=0.1, */*;q=0.1',
    'User-Agent': 'GGApparel-PenCarrie/1.0 (+support@ggapparel.co.uk)',
  };

  const opts = {
    method: 'POST',
    headers,
    body: form.toString(),
    redirect: 'manual', // do not silently follow to the public website
    signal: AbortSignal.timeout(Number(PENCARRIE_HTTP_TIMEOUT_MS)),
  };

  console.log('[PenCarrie][REQ]', {
    url,
    fn,
    env: PENCARRIE_ENV,
    headers: Object.keys(headers),
    paramsKeys: Object.keys(params || {}),
  });

  let res;
  try {
    res = await fetch(url, opts);
  } catch (err) {
    throw new Error(`[PenCarrie] fetch failed: ${err.message}`);
  }

  const contentType = res.headers.get('content-type') || '';
  const location = res.headers.get('location') || null;
  let bodyText = '';
  try {
    bodyText = await res.text();
  } catch {
    // ignore
  }

  // Trim for logs
  const snippet = bodyText.length > 600 ? `${bodyText.slice(0, 600)}…` : bodyText;
  console.log('[PenCarrie][RES]', {
    status: res.status,
    contentType,
    location,
    snippet: snippet.replace(/\s+/g, ' ').slice(0, 600),
  });

  // Manual redirect diagnostics
  if (res.status >= 300 && res.status < 400) {
    throw new Error(`[PenCarrie] ${res.status} Redirect received${location ? ` -> ${location}` : ''}. This typically means wrong host/path or gateway bouncing you to the public site.`);
  }

  if (res.status === 403) {
    if (looksLikeHtml(bodyText)) {
      throw new Error('[PenCarrie] 403 HTML response — likely the public website / WAF block. Confirm you are calling the API gateway URL and that your egress IP is whitelisted.');
    }
    throw new Error('[PenCarrie] 403 Forbidden from gateway.');
  }

  if (!res.ok) {
    // Try to surface something useful
    if (looksLikeHtml(bodyText)) {
      throw new Error(`[PenCarrie] HTTP ${res.status} HTML body from server — likely wrong host or blocked. Snippet: ${snippet.slice(0, 200)}`);
    }
    // Allow XML/JSON fallthrough to parsing error below with clearer message
  }

  // Parse XML first (the gateway is XML-based)
  if (looksLikeXml(bodyText) || /xml/i.test(contentType)) {
    try {
      const json = await parseStringPromise(bodyText, { explicitArray: false, attrkey: '$' });
      return json;
    } catch (e) {
      throw new Error(`[PenCarrie] Failed to parse XML: ${e.message}`);
    }
  }

  // Some endpoints might return JSON on error
  if (/json/i.test(contentType)) {
    try {
      return JSON.parse(bodyText);
    } catch (e) {
      throw new Error(`[PenCarrie] Failed to parse JSON: ${e.message}`);
    }
  }

  // Unexpected content-type / empty body
  throw new Error(
    `[PenCarrie] Unexpected response type (status ${res.status}, content-type '${contentType}'). Body starts: ${snippet.slice(0, 200)}`
  );
}

// --- High-level helpers (XML gateway functions) ---

// Returns normalized list of orders from the 'pclist' function
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

// Returns normalized order header + items from the 'pcget' function
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
  const info = { baseUrl: PENCARRIE_GATEWAY_URL, env: PENCARRIE_ENV, egressIp: 'unknown' };
  try {
    const r = await fetch('https://api.ipify.org?format=json', {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
    });
    const j = await r.json();
    info.egressIp = j?.ip || 'unknown';
  } catch {
    // ignore
  }
  return info;
}

module.exports = { listOrders, getOrder, callGateway, checkIpAndHost };
