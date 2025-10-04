// src/integrations/pencarrie.js
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const { parseStringPromise } = require('xml2js');

const {
  PENCARRIE_ENV = 'live',
  PENCARRIE_GATEWAY_URL = 'https://pencarrie.com/gateway',
  PENCARRIE_CUSTOMER_CODE,
  PENCARRIE_HTTP_TIMEOUT_MS = '20000'
} = process.env;

if (!PENCARRIE_CUSTOMER_CODE) {
  console.warn('[PenCarrie] Missing PENCARRIE_CUSTOMER_CODE in env');
}

async function callGateway(fn, params = {}) {
  const form = new URLSearchParams();
  form.set('function', fn);
  form.set('code', PENCARRIE_CUSTOMER_CODE);

  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) form.set(k, String(v));
  }

  const res = await fetch(PENCARRIE_GATEWAY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
    // basic timeout
    signal: AbortSignal.timeout(Number(PENCARRIE_HTTP_TIMEOUT_MS))
  });

  if (!res.ok) {
    const text = await res.text().catch(()=>'');
    throw new Error(`[PenCarrie] HTTP ${res.status} ${res.statusText}: ${text.slice(0,250)}`);
  }

  const xml = await res.text();
  // PenCarrie returns XML — convert to a simple JS object
  const json = await parseStringPromise(xml, { explicitArray: false, attrkey: '$' });
  return json;
}

// --- High-level helpers ---
async function listOrders() {
  // pclist -> returns <orders><order .../></orders>
  const data = await callGateway('pclist');
  const orders = data?.orders?.order
    ? Array.isArray(data.orders.order) ? data.orders.order : [data.orders.order]
    : [];

  // Normalise key fields for frontend
  return orders.map(o => ({
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
    cancancel: o.cancancel === 'true' || o.cancancel === true
  }));
}

async function getOrder(ordcode) {
  const data = await callGateway('pcget', { ordcode });
  const order = data?.order || {};
  const items = order?.items?.item
    ? (Array.isArray(order.items.item) ? order.items.item : [order.items.item])
    : [];

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
      created: order.created || order.orderdate || ''
    },
    items: items.map(it => ({
      sku: it.sku || it.code || '',
      descr: it.description || '',
      qty: Number(it.qty || it.quantity || 0),
      cref: it.cref || it.ref || '' // your per-line client reference
    }))
  };
}

module.exports = { listOrders, getOrder };
