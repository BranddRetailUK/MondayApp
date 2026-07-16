class StockOrderingRalawiseError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'StockOrderingRalawiseError';
    Object.assign(this, details);
  }
}

function trimText(value) {
  return String(value ?? '').trim();
}

function positiveQuantity(value) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function isProductLine(line) {
  return Boolean(
    line?.source_product_id
    || trimText(line?.style_code)
    || trimText(line?.alt_style_code)
    || trimText(line?.style_name)
  );
}

function normalizedCatalogStatus(line) {
  return trimText(
    line?.ralawise_catalog_status
    || line?.catalogue_status
    || line?.catalog_status
    || line?.supplier_status
  ).toLowerCase();
}

function exactRalawiseSku(line) {
  const sku = trimText(
    line?.ralawise_sku
    || line?.supplier_sku
    || line?.catalog_sku
  ).toUpperCase();
  return /^[A-Z0-9._/-]{1,30}$/.test(sku) ? sku : '';
}

function buildJobBasketPlan(job, lineItems) {
  const reference = trimText(job?.order_no || job?.source_order_id).slice(0, 15);
  const productLines = (Array.isArray(lineItems) ? lineItems : []).filter(isProductLine);
  const unresolved = [];
  const resolvedLines = [];
  const grouped = new Map();

  productLines.forEach((line) => {
    const sku = exactRalawiseSku(line);
    const quantity = positiveQuantity(line?.quantity);
    const status = normalizedCatalogStatus(line);
    let reason = '';
    if (!sku) reason = 'Exact Ralawise colour/size SKU is missing';
    else if (status === 'discontinued' || status === 'inactive') reason = 'Ralawise SKU is not live';
    else if (!quantity) reason = 'Quantity must be greater than zero';
    if (reason) {
      unresolved.push({
        source_order_item_id: line?.source_order_item_id || null,
        style_code: trimText(line?.style_code || line?.alt_style_code),
        colour: trimText(line?.colour),
        size: trimText(line?.size),
        reason,
      });
      return;
    }

    resolvedLines.push({
      source_order_item_id: Number(line.source_order_item_id),
      source_order_id: Number(job?.source_order_id || line?.source_order_id),
      order_no: trimText(job?.order_no),
      ralawise_sku: sku,
      quantity,
    });
    const current = grouped.get(sku) || { code: sku, quantity: 0, reference };
    current.quantity += quantity;
    grouped.set(sku, current);
  });

  if (!productLines.length) {
    unresolved.push({ reason: 'Job has no product line items to add' });
  }

  return {
    reference,
    product_line_count: productLines.length,
    resolved_line_count: resolvedLines.length,
    unresolved,
    lines: resolvedLines,
    items: Array.from(grouped.values()),
    total_quantity: resolvedLines.reduce((sum, line) => sum + line.quantity, 0),
    eligible: productLines.length > 0 && unresolved.length === 0,
  };
}

function basketContainsPlan(basketItems, plan) {
  const quantities = new Map();
  (Array.isArray(basketItems) ? basketItems : []).forEach((item) => {
    const code = trimText(item?.code || item?.Code).toUpperCase();
    const reference = trimText(
      item?.reference || item?.OLRef || item?.OrderLineRef
    ).slice(0, 15);
    const quantity = positiveQuantity(item?.quantity ?? item?.Qty);
    if (!code || !reference || !quantity) return;
    const key = `${code}\n${reference}`;
    quantities.set(key, (quantities.get(key) || 0) + quantity);
  });
  return plan.items.every((item) => (
    (quantities.get(`${item.code}\n${plan.reference}`) || 0) >= item.quantity
  ));
}

function normalizedRemoteReference(value) {
  const reference = trimText(value);
  if (!reference || reference === '.' || /^(?:-|\u2013|\u2014)$/.test(reference)) return '';
  return reference.slice(0, 80).toUpperCase();
}

function matchBasketedJobToPlacedOrders(job, auditLines, placedOrders) {
  const reference = normalizedRemoteReference(job?.order_no || job?.source_order_id);
  const remoteLines = [];
  (Array.isArray(placedOrders) ? placedOrders : []).forEach((order) => {
    (Array.isArray(order?.lines) ? order.lines : []).forEach((line) => {
      const lineReference = normalizedRemoteReference(line?.line_reference);
      const orderReference = normalizedRemoteReference(order?.customer_order_number);
      if (!reference || (lineReference !== reference && orderReference !== reference)) return;
      const quantity = positiveQuantity(line?.quantity);
      const code = exactRalawiseSku({ ralawise_sku: line?.code || line?.variant_code || line?.product_code });
      if (!code || !quantity) return;
      remoteLines.push({
        order,
        line,
        code,
        available_quantity: quantity,
      });
    });
  });

  const assignments = [];
  const missingLineIds = [];
  for (const auditLine of (Array.isArray(auditLines) ? auditLines : [])) {
    const sourceOrderItemId = Number(auditLine?.source_order_item_id);
    const code = exactRalawiseSku({ ralawise_sku: auditLine?.ralawise_sku });
    const quantity = positiveQuantity(auditLine?.quantity);
    let remaining = quantity;
    const portions = [];
    for (const remote of remoteLines) {
      if (remaining < 1) break;
      if (remote.code !== code || remote.available_quantity < 1) continue;
      const consumed = Math.min(remaining, remote.available_quantity);
      remote.available_quantity -= consumed;
      remaining -= consumed;
      portions.push({ ...remote, consumed_quantity: consumed });
    }
    if (!code || !quantity || remaining > 0) {
      missingLineIds.push(Number.isFinite(sourceOrderItemId) ? sourceOrderItemId : null);
      continue;
    }

    const pricedPortions = portions.filter((portion) => (
      portion.line?.unit_price != null
      && trimText(portion.line.unit_price) !== ''
      && Number.isFinite(Number(portion.line.unit_price))
    ));
    const allPortionsPriced = pricedPortions.length === portions.length;
    const supplierLineTotal = allPortionsPriced
      ? pricedPortions.reduce(
        (sum, portion) => sum + (Number(portion.line.unit_price) * portion.consumed_quantity),
        0
      )
      : null;
    const orderNumbers = Array.from(new Set(portions.map((portion) => (
      trimText(portion.order?.ralawise_order_number || portion.order?.sage_order_number)
    )).filter(Boolean)));
    assignments.push({
      source_order_item_id: sourceOrderItemId,
      ralawise_sku: code,
      quantity,
      ralawise_order_number: orderNumbers.join(', '),
      supplier_order_line: trimText(portions[0]?.line?.order_line),
      supplier_unit_price: supplierLineTotal == null
        ? null
        : Number((supplierLineTotal / quantity).toFixed(2)),
      supplier_line_total: supplierLineTotal == null ? null : Number(supplierLineTotal.toFixed(2)),
      ordered_at: portions.map((portion) => portion.order?.ordered_at).find(Boolean) || null,
      order_url: portions.map((portion) => trimText(portion.order?.order_url)).find(Boolean) || '',
    });
  }

  return {
    matched: Boolean(assignments.length) && missingLineIds.length === 0
      && assignments.length === (Array.isArray(auditLines) ? auditLines.length : 0),
    reference,
    assignments,
    missing_line_ids: missingLineIds,
  };
}

function publicBasketError(error) {
  if (error instanceof StockOrderingRalawiseError) return error.message;
  const upstream = trimText(error?.upstreamMessage);
  if (upstream) return upstream;
  return trimText(error?.message) || 'Failed to add the job to the Ralawise basket';
}

module.exports = {
  StockOrderingRalawiseError,
  basketContainsPlan,
  buildJobBasketPlan,
  exactRalawiseSku,
  isProductLine,
  matchBasketedJobToPlacedOrders,
  publicBasketError,
};
