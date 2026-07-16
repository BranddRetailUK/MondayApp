const env = require('../config/env');

const DEFAULT_SHOP_BASE_URL = 'https://shop.ralawise.com';
const DEFAULT_TIMEOUT_MS = 20000;

class RalawiseBasketError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'RalawiseBasketError';
    Object.assign(this, details);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code || null,
      status: this.status || null,
      upstreamMessage: this.upstreamMessage || null,
    };
  }
}

function trimText(value) {
  return String(value ?? '').trim();
}

function positiveInt(value, fallback, maximum = 120000) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number) || number < 1) return fallback;
  return Math.min(number, maximum);
}

function normalizeBaseUrl(value) {
  const raw = trimText(value) || DEFAULT_SHOP_BASE_URL;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new RalawiseBasketError('Ralawise shop base URL is invalid.', {
      code: 'invalid_configuration',
    });
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.search || url.hash) {
    throw new RalawiseBasketError('Ralawise shop base URL is invalid.', {
      code: 'invalid_configuration',
    });
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

function splitSetCookieHeader(value) {
  const source = trimText(value);
  if (!source) return [];
  const cookies = [];
  let start = 0;
  let inExpires = false;
  for (let index = 0; index < source.length; index += 1) {
    const remainder = source.slice(index).toLowerCase();
    if (remainder.startsWith('expires=')) inExpires = true;
    if (inExpires && source[index] === ';') inExpires = false;
    if (
      source[index] === ','
      && !inExpires
      && /^\s*[a-z0-9_.-]+=/.test(source.slice(index + 1, index + 64))
    ) {
      cookies.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  cookies.push(source.slice(start).trim());
  return cookies.filter(Boolean);
}

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  capture(headers) {
    if (!headers) return;
    let rawCookies = [];
    if (typeof headers.getSetCookie === 'function') {
      rawCookies = headers.getSetCookie();
    } else if (typeof headers.raw === 'function') {
      rawCookies = headers.raw()?.['set-cookie'] || [];
    } else if (typeof headers.get === 'function') {
      rawCookies = splitSetCookieHeader(headers.get('set-cookie'));
    }
    rawCookies.forEach((cookieText) => {
      const pair = trimText(cookieText).split(';')[0];
      const separator = pair.indexOf('=');
      if (separator <= 0) return;
      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      if (!name) return;
      if (!value) this.cookies.delete(name);
      else this.cookies.set(name, value);
    });
  }

  header() {
    return Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }
}

function decodeHtml(value) {
  return trimText(value)
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function extractRequestVerificationToken(html) {
  const inputs = String(html || '').match(/<input\b[^>]*>/gi) || [];
  for (const input of inputs) {
    if (!/\bname=["']__RequestVerificationToken["']/i.test(input)) continue;
    const value = /\bvalue=["']([^"']*)["']/i.exec(input)?.[1];
    if (value) return decodeHtml(value);
  }
  return '';
}

async function responseText(response) {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

async function responseJson(response, fallbackMessage) {
  const text = await responseText(response);
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {}
  }
  if (!response.ok) {
    throw new RalawiseBasketError(fallbackMessage, {
      code: 'http_error',
      status: response.status,
      upstreamMessage: trimText(data?.Message || data?.message || data?.Reason),
    });
  }
  if (!data) {
    throw new RalawiseBasketError(fallbackMessage, {
      code: 'invalid_response',
      status: response.status,
    });
  }
  return data;
}

function basketCode(item) {
  return trimText(
    item?.Code
    || item?.code
    || item?.VariantCode
    || item?.variantCode
    || item?.EntryCode
    || item?.entryCode
  ).toUpperCase();
}

function basketReference(item) {
  return trimText(
    item?.OLRef
    || item?.olRef
    || item?.OrderLineRef
    || item?.orderLineRef
    || item?.reference
  ).slice(0, 15);
}

function numericValue(...values) {
  for (const value of values) {
    if (value == null || trimText(value) === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function basketQuantity(item) {
  const quantity = numericValue(
    item?.Qty,
    item?.qty,
    item?.Quantity,
    item?.quantity,
    item?.AllocatedQuantity,
    item?.allocatedQuantity
  );
  return Math.max(0, Math.floor(quantity || 0));
}

function normalizeBasketItems(items) {
  const grouped = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const code = basketCode(item);
    const quantity = Math.max(0, Math.floor(Number(item?.quantity ?? item?.Qty ?? 0) || 0));
    const reference = trimText(
      item?.reference
      || item?.OrderLineRef
      || item?.orderLineRef
      || item?.lineReference
    ).slice(0, 15);
    if (!code || quantity < 1) return;
    const key = `${code}\n${reference}`;
    const groupedItem = grouped.get(key) || { Code: code, Qty: 0, SetQuantity: false };
    groupedItem.Qty += quantity;
    if (reference) groupedItem.OrderLineRef = reference;
    grouped.set(key, groupedItem);
  });
  return Array.from(grouped.values());
}

function responseItems(data) {
  return [
    data?.Items,
    data?.items,
    data?.Data?.Items,
    data?.Data?.items,
    data?.data?.Items,
    data?.data?.items,
  ].find(Array.isArray) || [];
}

function buildStockWarnings(data) {
  return responseItems(data).map((item) => {
    const requested = numericValue(
      item?.Quantity,
      item?.quantity,
      item?.Qty,
      item?.qty,
      item?.RequestedQuantity,
      item?.requestedQuantity
    );
    const allocated = numericValue(
      item?.AllocatedQuantity,
      item?.allocatedQuantity,
      item?.AllocatedQty,
      item?.allocatedQty,
      item?.AvailableQuantity,
      item?.availableQuantity
    );
    if (requested == null || allocated == null || allocated >= requested) return null;
    return {
      code: basketCode(item),
      requested_quantity: requested,
      allocated_quantity: allocated,
      out_of_stock: allocated <= 0,
      message: trimText(item?.Message || item?.message || item?.Reason || item?.reason),
    };
  }).filter(Boolean);
}

function applyReferences(cartItems, payload, existingCartItems = []) {
  const protectedCodes = new Set(
    (Array.isArray(existingCartItems) ? existingCartItems : [])
      .filter((item) => !basketReference(item))
      .map(basketCode)
      .filter(Boolean)
  );
  const queues = new Map();
  payload.forEach((item) => {
    const code = basketCode(item);
    const reference = basketReference(item);
    if (!code || !reference) return;
    const queue = queues.get(code) || [];
    queue.push(reference);
    queues.set(code, queue);
  });

  let updated = 0;
  let skippedExisting = 0;
  let protectedUnreferenced = 0;
  (Array.isArray(cartItems) ? cartItems : []).forEach((item) => {
    const code = basketCode(item);
    const reference = basketReference(item);
    const queue = queues.get(code);
    if (!queue?.length) return;
    if (!reference && protectedCodes.has(code)) {
      protectedUnreferenced += 1;
      return;
    }
    const nextReference = queue[0];
    if (reference && reference !== nextReference) {
      skippedExisting += 1;
      return;
    }
    queue.shift();
    if (reference !== nextReference) {
      item.OLRef = nextReference;
      updated += 1;
    }
  });

  return {
    updated_count: updated,
    missing_reference_count: Array.from(queues.values()).reduce((sum, queue) => sum + queue.length, 0),
    skipped_existing_count: skippedExisting,
    protected_unreferenced_count: protectedUnreferenced,
  };
}

function createRalawiseBasketClient(options = {}) {
  const config = options.config || env;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const baseUrl = normalizeBaseUrl(config.RALAWISE_SHOP_BASE_URL || DEFAULT_SHOP_BASE_URL);
  const timeoutMs = positiveInt(
    config.RALAWISE_REQUEST_TIMEOUT_MS || config.RALAWISE_HTTP_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS
  );
  const user = trimText(config.RALAWISE_USER);
  const password = String(config.RALAWISE_PASSWORD || '');

  if (typeof fetchImpl !== 'function') {
    throw new RalawiseBasketError('This Node runtime does not provide fetch.', {
      code: 'runtime_configuration',
    });
  }

  async function request(context, path, requestOptions = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const cookie = context.jar.header();
      const response = await fetchImpl(new URL(path, `${baseUrl}/`).toString(), {
        ...requestOptions,
        signal: controller.signal,
        headers: {
          Accept: 'application/json, text/html;q=0.9, */*;q=0.8',
          'User-Agent': 'MondayApp/1.0',
          ...(cookie ? { Cookie: cookie } : {}),
          ...(requestOptions.headers || {}),
        },
      });
      context.jar.capture(response.headers);
      return response;
    } catch (error) {
      if (error instanceof RalawiseBasketError) throw error;
      throw new RalawiseBasketError(
        error?.name === 'AbortError' ? 'Ralawise request timed out.' : 'Failed to reach Ralawise.',
        { code: error?.name === 'AbortError' ? 'timeout' : 'network_error', cause: error }
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async function loadPageToken(context) {
    const response = await request(context, '/', {
      method: 'GET',
      headers: { Referer: `${baseUrl}/` },
    });
    if (!response.ok) {
      throw new RalawiseBasketError('Failed to prepare the Ralawise website session.', {
        code: 'page_failed',
        status: response.status,
      });
    }
    const token = extractRequestVerificationToken(await responseText(response));
    if (!token) {
      throw new RalawiseBasketError('Ralawise did not return a request verification token.', {
        code: 'missing_token',
      });
    }
    return token;
  }

  async function login(context, token) {
    if (!user || !password) {
      throw new RalawiseBasketError('Ralawise credentials are not configured.', {
        code: 'missing_credentials',
      });
    }
    const body = new URLSearchParams({
      __RequestVerificationToken: token,
      EmailAddress: user,
      Password: password,
    });
    const response = await request(context, '/Services/Authentication/SignIn', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-XSRF-Token': token,
        epilanguage: 'en-GB',
        Referer: `${baseUrl}/`,
      },
      body: body.toString(),
    });
    const data = await responseJson(response, 'Failed to sign in to Ralawise.');
    if (!data?.Success) {
      throw new RalawiseBasketError('Failed to sign in to Ralawise.', {
        code: 'login_failed',
        upstreamMessage: trimText(data?.Reason || data?.Message),
      });
    }
  }

  async function loadCart(context) {
    const response = await request(context, '/services/cart/get', {
      method: 'GET',
      headers: {
        Referer: `${baseUrl}/basket-page/`,
        epilanguage: 'en-GB',
      },
    });
    const data = await responseJson(response, 'Failed to load the Ralawise basket.');
    if (data?.Success === false) {
      throw new RalawiseBasketError('Failed to load the Ralawise basket.', {
        code: 'basket_load_failed',
        upstreamMessage: trimText(data?.Message || data?.Reason),
      });
    }
    return data?.Data || data?.data || data || {};
  }

  async function authenticatedContext() {
    const context = { jar: new CookieJar() };
    const token = await loadPageToken(context);
    await login(context, token);
    return context;
  }

  async function getSnapshot() {
    const context = await authenticatedContext();
    const cart = await loadCart(context);
    return {
      success: true,
      basket_url: `${baseUrl}/basket-page/`,
      order_reference: trimText(cart?.OrderRef || cart?.orderRef),
      items: (Array.isArray(cart?.Items) ? cart.Items : []).map((item) => ({
        code: basketCode(item),
        quantity: basketQuantity(item),
        reference: basketReference(item),
      })).filter((item) => item.code && item.quantity > 0),
    };
  }

  async function addItems(items) {
    const payload = normalizeBasketItems(items);
    if (!payload.length) {
      throw new RalawiseBasketError('No valid Ralawise items were supplied.', {
        code: 'no_items',
      });
    }
    const context = await authenticatedContext();
    const token = await loadPageToken(context);
    const existingCart = await loadCart(context);
    const existingItems = Array.isArray(existingCart?.Items) ? existingCart.Items : [];
    const response = await request(context, '/services/cart/AddMultiItemsToCart', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'X-XSRF-Token': token,
        RequestVerificationToken: token,
        epilanguage: 'en-GB',
        Referer: `${baseUrl}/`,
      },
      body: JSON.stringify(payload),
    });
    const data = await responseJson(response, 'Failed to add products to the Ralawise basket.');
    if (!data?.Success) {
      throw new RalawiseBasketError('Failed to add products to the Ralawise basket.', {
        code: 'basket_failed',
        upstreamMessage: trimText(data?.Message || data?.ErrorMessage || data?.Reason),
      });
    }

    const updatedCart = await loadCart(context);
    const updatedItems = Array.isArray(updatedCart?.Items) ? updatedCart.Items : [];
    const references = applyReferences(updatedItems, payload, existingItems);
    if (references.updated_count > 0) {
      const updateResponse = await request(context, '/services/cart/updateBasket', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'X-XSRF-Token': token,
          RequestVerificationToken: token,
          epilanguage: 'en-GB',
          Referer: `${baseUrl}/basket-page/`,
        },
        body: JSON.stringify({
          OrderReference: trimText(updatedCart?.OrderRef || updatedCart?.orderRef),
          UpdateCartDtos: updatedItems,
        }),
      });
      const updateData = await responseJson(
        updateResponse,
        'Failed to update the Ralawise basket line references.'
      );
      if (updateData?.Success === false) {
        throw new RalawiseBasketError('Failed to update the Ralawise basket line references.', {
          code: 'reference_failed',
          upstreamMessage: trimText(updateData?.Message || updateData?.Reason),
        });
      }
    }

    const stockWarnings = buildStockWarnings(data);
    return {
      success: true,
      item_count: payload.length,
      total_quantity: payload.reduce((sum, item) => sum + item.Qty, 0),
      items: payload.map((item) => ({
        code: item.Code,
        quantity: item.Qty,
        reference: item.OrderLineRef || '',
      })),
      basket_url: `${baseUrl}/basket-page/`,
      updated_reference_count: references.updated_count,
      missing_reference_count: references.missing_reference_count,
      protected_unreferenced_count: references.protected_unreferenced_count,
      stock_warnings: stockWarnings,
      out_of_stock_count: stockWarnings.filter((warning) => warning.out_of_stock).length,
    };
  }

  return { addItems, getSnapshot };
}

module.exports = {
  CookieJar,
  DEFAULT_SHOP_BASE_URL,
  RalawiseBasketError,
  applyReferences,
  buildStockWarnings,
  createRalawiseBasketClient,
  extractRequestVerificationToken,
  normalizeBasketItems,
  splitSetCookieHeader,
};
