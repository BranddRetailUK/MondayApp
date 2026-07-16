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
  return /^[A-Z0-9/_-]{1,30}$/.test(sku) ? sku : '';
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
  publicBasketError,
};
