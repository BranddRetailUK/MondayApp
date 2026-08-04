const env = require('../config/env');

const DEFAULT_SHOP_BASE_URL = 'https://shop.ralawise.com';
const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_ORDER_HISTORY_SIZE = 50;
const DEFAULT_ORDER_HISTORY_MAX_PAGES = 3;

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
    .replace(/&#163;|&pound;/g, '£')
    .replace(/&euro;/g, '€')
    .replace(/&nbsp;/g, ' ')
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

function extractHtmlAttribute(html, attributeName) {
  const safeName = String(attributeName || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`\\b${safeName}=["']([^"']*)["']`, 'i').exec(String(html || ''));
  return match?.[1] ? decodeHtml(match[1]) : '';
}

function stripHtmlText(html) {
  return decodeHtml(
    String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
  ).trim();
}

function parseRalawiseMoney(value) {
  const normalized = trimText(value)
    .replace(/,/g, '')
    .replace(/[^\d.-]/g, '');
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? Number(number.toFixed(2)) : null;
}

function parseRalawiseDate(value) {
  const text = trimText(value);
  if (!text) return null;
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);
  if (match) {
    const parsed = new Date(Date.UTC(
      Number(match[3]),
      Number(match[2]) - 1,
      Number(match[1]),
      Number(match[4] || 0),
      Number(match[5] || 0),
      Number(match[6] || 0)
    ));
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function orderDetailPath(record, baseUrl = DEFAULT_SHOP_BASE_URL) {
  const href = extractHtmlAttribute(record?.ViewDetails || record?.viewDetails, 'href');
  if (href) {
    try {
      const url = new URL(href, `${baseUrl}/`);
      return `${url.pathname}${url.search}`;
    } catch {}
  }
  const webOrderReference = trimText(record?.WebOrderNo || record?.webOrderNo);
  const sageOrderReference = trimText(record?.SageOrderNo || record?.sageOrderNo);
  if (!webOrderReference || !sageOrderReference) return '';
  const params = new URLSearchParams({ webOrderReference, sageOrderReference });
  return `/my-account/order-history/order-detail-page/?${params.toString()}`;
}

function normalizePlacedOrderRecord(record = {}, baseUrl = DEFAULT_SHOP_BASE_URL) {
  const sageOrderNumber = trimText(record?.SageOrderNo || record?.sageOrderNo);
  const webOrderNumber = trimText(record?.WebOrderNo || record?.webOrderNo);
  const formattedTotal = trimText(record?.FormattedTotalAmount || record?.formattedTotalAmount);
  const detailPath = orderDetailPath(record, baseUrl);
  return {
    ralawise_order_number: sageOrderNumber || webOrderNumber,
    sage_order_number: sageOrderNumber,
    web_order_number: webOrderNumber,
    customer_order_number: trimText(record?.CustomerOrderNo || record?.customerOrderNo),
    status: trimText(record?.FormattedOrderStatus || record?.formattedOrderStatus),
    supplier_total: parseRalawiseMoney(formattedTotal),
    ordered_at: parseRalawiseDate(record?.FormattedDateCreated || record?.formattedDateCreated),
    formatted_total: formattedTotal,
    formatted_date: trimText(record?.FormattedDateCreated || record?.formattedDateCreated),
    detail_path: detailPath,
    order_url: detailPath ? new URL(detailPath, `${baseUrl}/`).toString() : '',
    lines: [],
  };
}

function extractInputValue(block, className) {
  const safeClass = String(className || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const input = new RegExp(`<input\\b[^>]*class=["'][^"']*${safeClass}[^"']*["'][^>]*>`, 'i')
    .exec(String(block || ''))?.[0];
  return input ? extractHtmlAttribute(input, 'value') : '';
}

function parseOrderLineReference(block) {
  const match = /\bOL\s+Ref\s*(.*?)\s*Qty\s+Alloc\b/i.exec(stripHtmlText(block));
  const reference = trimText(match?.[1]);
  return !reference || /^(?:-|\u2013|\u2014)$/.test(reference) ? '' : reference.slice(0, 80);
}

function parseRalawiseOrderDetailLines(html) {
  const blocks = String(html || '').match(
    /<div class=["']card-body order-summary-item[\s\S]*?(?=<div class=["']card-body order-summary-item|<div class=["']modal|<\/section>|$)/gi
  ) || [];
  return blocks.map((block, index) => {
    const variantCode = trimText(extractInputValue(block, 'product-variantcode')).toUpperCase();
    const productCode = trimText(extractInputValue(block, 'product-productcode')).toUpperCase();
    const quantity = Math.max(0, Math.floor(Number(extractInputValue(block, 'product-orderqty')) || 0));
    const unitPrice = parseRalawiseMoney(extractInputValue(block, 'product-unitprice'));
    const lineTotalMatch = /\bLine\s+Total\s+([\u00a3\u20ac$]?\s*[\d,.]+)/i.exec(stripHtmlText(block));
    const explicitLineTotal = parseRalawiseMoney(lineTotalMatch?.[1]);
    return {
      line_index: index,
      product_code: productCode,
      variant_code: variantCode,
      code: variantCode || productCode,
      colour: trimText(extractInputValue(block, 'product-productcolour')),
      size: trimText(extractInputValue(block, 'product-productsize')),
      quantity,
      order_line: trimText(extractInputValue(block, 'product-orderline')),
      sage_order_number: trimText(extractInputValue(block, 'product-sageorder')),
      unit_price: unitPrice,
      line_total: explicitLineTotal == null && unitPrice != null && quantity > 0
        ? Number((unitPrice * quantity).toFixed(2))
        : explicitLineTotal,
      line_reference: parseOrderLineReference(block),
    };
  }).filter((line) => line.code && line.quantity > 0);
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
      || item?.OLRef
      || item?.olRef
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

function normalizedBasketSnapshot(items, reference = '') {
  const normalizedReference = trimText(reference).slice(0, 15);
  return normalizeBasketItems(items)
    .map((item) => ({
      code: basketCode(item),
      quantity: basketQuantity(item),
      reference: basketReference(item),
    }))
    .filter((item) => item.code && item.quantity > 0 && (
      !normalizedReference || item.reference === normalizedReference
    ))
    .sort((left, right) => (
      left.reference.localeCompare(right.reference)
      || left.code.localeCompare(right.code)
      || left.quantity - right.quantity
    ));
}

function basketSnapshotsMatch(left, right, reference = '') {
  const normalizedLeft = normalizedBasketSnapshot(left, reference);
  const normalizedRight = normalizedBasketSnapshot(right, reference);
  return normalizedLeft.length === normalizedRight.length
    && normalizedLeft.every((item, index) => (
      item.code === normalizedRight[index].code
      && item.quantity === normalizedRight[index].quantity
      && item.reference === normalizedRight[index].reference
    ));
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

  async function postBasketUpdate(context, token, cart, items, failureMessage) {
    const response = await request(context, '/services/cart/updateBasket', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'X-XSRF-Token': token,
        RequestVerificationToken: token,
        epilanguage: 'en-GB',
        Referer: `${baseUrl}/basket-page/`,
      },
      body: JSON.stringify({
        OrderReference: trimText(cart?.OrderRef || cart?.orderRef),
        UpdateCartDtos: items,
      }),
    });
    const data = await responseJson(response, failureMessage);
    if (data?.Success === false) {
      throw new RalawiseBasketError(failureMessage, {
        code: 'basket_update_failed',
        upstreamMessage: trimText(data?.Message || data?.Reason),
      });
    }
    return data;
  }

  async function updateItems(expectedItems, desiredItems, options = {}) {
    const reference = trimText(options.reference).slice(0, 15);
    if (!reference) {
      throw new RalawiseBasketError('A Ralawise basket line reference is required.', {
        code: 'missing_reference',
        status: 400,
      });
    }
    const expected = normalizedBasketSnapshot(expectedItems, reference);
    const desired = normalizedBasketSnapshot(desiredItems, reference);
    const context = await authenticatedContext();
    const token = await loadPageToken(context);
    let cart = await loadCart(context);
    let cartItems = Array.isArray(cart?.Items) ? cart.Items : [];
    const actual = normalizedBasketSnapshot(cartItems, reference);
    if (!basketSnapshotsMatch(actual, expected, reference)) {
      throw new RalawiseBasketError(
        'The Ralawise basket no longer matches what UltimateHub added. It may have been changed or ordered, so no update was made.',
        {
          code: 'basket_drift',
          status: 409,
          expectedItems: expected,
          actualItems: actual,
        }
      );
    }

    let mutationAttempted = false;
    try {
      const desiredByCode = new Map(desired.map((item) => [item.code, item.quantity]));
      const assignedCodes = new Set();
      let changedExisting = false;
      for (const item of cartItems) {
        if (basketReference(item) !== reference) continue;
        const code = basketCode(item);
        const quantity = assignedCodes.has(code) ? 0 : (desiredByCode.get(code) || 0);
        assignedCodes.add(code);
        if (basketQuantity(item) !== quantity) changedExisting = true;
        item.Qty = quantity;
      }
      if (changedExisting) {
        mutationAttempted = true;
        await postBasketUpdate(
          context,
          token,
          cart,
          cartItems,
          'Failed to update the Ralawise basket quantities.'
        );
        cart = await loadCart(context);
        cartItems = Array.isArray(cart?.Items) ? cart.Items : [];
      }

      const currentAfterUpdate = normalizedBasketSnapshot(cartItems, reference);
      const currentByCode = new Map(currentAfterUpdate.map((item) => [item.code, item.quantity]));
      const hasUnexpectedQuantity = currentAfterUpdate.some((item) => (
        item.quantity > (desiredByCode.get(item.code) || 0)
      ));
      if (hasUnexpectedQuantity) {
        throw new RalawiseBasketError('Ralawise did not accept the requested basket quantity changes.', {
          code: 'basket_update_unverified',
        });
      }

      const missingItems = desired
        .map((item) => ({
          code: item.code,
          quantity: item.quantity - (currentByCode.get(item.code) || 0),
          reference,
        }))
        .filter((item) => item.quantity > 0);
      let stockWarnings = [];
      if (missingItems.length) {
        const payload = normalizeBasketItems(missingItems);
        mutationAttempted = true;
        const addResponse = await request(context, '/services/cart/AddMultiItemsToCart', {
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
        const addData = await responseJson(addResponse, 'Failed to add replacement products to the Ralawise basket.');
        if (!addData?.Success) {
          throw new RalawiseBasketError('Failed to add replacement products to the Ralawise basket.', {
            code: 'basket_update_failed',
            upstreamMessage: trimText(addData?.Message || addData?.ErrorMessage || addData?.Reason),
          });
        }
        stockWarnings = buildStockWarnings(addData);
        const beforeAddItems = cartItems;
        cart = await loadCart(context);
        cartItems = Array.isArray(cart?.Items) ? cart.Items : [];
        const references = applyReferences(cartItems, payload, beforeAddItems);
        if (references.updated_count > 0) {
          mutationAttempted = true;
          await postBasketUpdate(
            context,
            token,
            cart,
            cartItems,
            'Failed to update the replacement-product references in the Ralawise basket.'
          );
          cart = await loadCart(context);
          cartItems = Array.isArray(cart?.Items) ? cart.Items : [];
        }
      }

      const verifiedItems = normalizedBasketSnapshot(cartItems, reference);
      if (!basketSnapshotsMatch(verifiedItems, desired, reference)) {
        throw new RalawiseBasketError('Ralawise did not return the expected basket after the update.', {
          code: 'basket_update_unverified',
        });
      }
      return {
        success: true,
        basket_url: `${baseUrl}/basket-page/`,
        reference,
        previous_items: expected,
        items: verifiedItems,
        item_count: verifiedItems.length,
        total_quantity: verifiedItems.reduce((sum, item) => sum + item.quantity, 0),
        stock_warnings: stockWarnings,
      };
    } catch (error) {
      if (!mutationAttempted) throw error;
      throw new RalawiseBasketError(
        'Ralawise may have partially updated this basket but did not return a verified final result. Review this job in Ralawise before checkout.',
        {
          code: 'basket_update_partial',
          status: 409,
          cause: error,
        }
      );
    }
  }

  async function fetchOrderHistoryPage(context, options = {}) {
    const page = positiveInt(options.page, 1, 1000);
    const size = positiveInt(options.size, DEFAULT_ORDER_HISTORY_SIZE, 100);
    const body = new URLSearchParams({
      page: String(page),
      size: String(size),
      keyword: trimText(options.keyword),
      strFromDate: trimText(options.fromDate),
      strToDate: trimText(options.toDate),
      allCompanyOrders: 'true',
    });
    const response = await request(context, '/services/orderhistoryservice/searchorders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        epilanguage: 'en-GB',
        Referer: `${baseUrl}/my-account/order-history/order-history/`,
      },
      body: body.toString(),
    });
    const data = await responseJson(response, 'Failed to load Ralawise order history.');
    if (data?.Success === false) {
      throw new RalawiseBasketError('Failed to load Ralawise order history.', {
        code: 'order_history_failed',
        upstreamMessage: trimText(data?.Message || data?.ErrorMessage || data?.Reason),
      });
    }
    const payload = data?.Data || data?.data || {};
    return {
      records: Array.isArray(payload?.records)
        ? payload.records
        : (Array.isArray(payload?.Records) ? payload.Records : []),
      total: Math.max(0, Math.floor(Number(payload?.TotalRecord || payload?.totalRecord || 0) || 0)),
    };
  }

  async function loadOrderDetail(context, order) {
    if (!order?.detail_path) return [];
    const response = await request(context, order.detail_path, {
      method: 'GET',
      headers: {
        epilanguage: 'en-GB',
        Referer: `${baseUrl}/my-account/order-history/order-history/`,
      },
    });
    if (!response.ok) {
      throw new RalawiseBasketError('Failed to load Ralawise order details.', {
        code: 'order_detail_failed',
        status: response.status,
      });
    }
    return parseRalawiseOrderDetailLines(await responseText(response));
  }

  async function getPlacedOrders(options = {}) {
    const context = await authenticatedContext();
    const size = positiveInt(options.size, DEFAULT_ORDER_HISTORY_SIZE, 100);
    const maxPages = positiveInt(options.maxPages, DEFAULT_ORDER_HISTORY_MAX_PAGES, 10);
    const keywords = Array.from(new Set(
      (Array.isArray(options.keywords) && options.keywords.length
        ? options.keywords
        : [options.keyword || ''])
        .map(trimText)
    ));
    const ordersByKey = new Map();
    for (const keyword of keywords) {
      for (let page = 1; page <= maxPages; page += 1) {
        const result = await fetchOrderHistoryPage(context, {
          page,
          size,
          keyword,
          fromDate: options.fromDate,
          toDate: options.toDate,
        });
        result.records.map((record) => normalizePlacedOrderRecord(record, baseUrl))
          .filter((order) => order.ralawise_order_number)
          .forEach((order) => {
            const key = `${order.sage_order_number || order.ralawise_order_number}\n${order.web_order_number}`;
            if (!ordersByKey.has(key)) ordersByKey.set(key, order);
          });
        if (result.records.length < size || page * size >= result.total) break;
      }
    }
    const orders = Array.from(ordersByKey.values());
    if (options.includeDetails !== false) {
      for (const order of orders) {
        try {
          order.lines = await loadOrderDetail(context, order);
        } catch (error) {
          order.detail_error = trimText(error?.upstreamMessage || error?.message);
          order.lines = [];
        }
      }
    }
    return { success: true, orders };
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

  return { addItems, getPlacedOrders, getSnapshot, updateItems };
}

module.exports = {
  CookieJar,
  DEFAULT_SHOP_BASE_URL,
  RalawiseBasketError,
  applyReferences,
  basketSnapshotsMatch,
  buildStockWarnings,
  createRalawiseBasketClient,
  extractRequestVerificationToken,
  normalizeBasketItems,
  normalizedBasketSnapshot,
  normalizePlacedOrderRecord,
  parseRalawiseOrderDetailLines,
  splitSetCookieHeader,
};
