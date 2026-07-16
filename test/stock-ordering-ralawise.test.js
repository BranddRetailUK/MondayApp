const test = require('node:test');
const assert = require('node:assert/strict');

const {
  basketContainsPlan,
  buildJobBasketPlan,
} = require('../src/services/stockOrderingRalawise');

test('buildJobBasketPlan groups exact variant SKUs and keeps line-level quantities', () => {
  const plan = buildJobBasketPlan({ source_order_id: 10, order_no: 56789 }, [
    {
      source_order_item_id: 1,
      source_product_id: 100,
      ralawise_sku: 'gd001blacl',
      ralawise_catalog_status: 'Live',
      quantity: 2,
    },
    {
      source_order_item_id: 2,
      source_product_id: 101,
      ralawise_sku: 'GD001BLACL',
      ralawise_catalog_status: 'Live',
      quantity: 3,
    },
    {
      source_order_item_id: 3,
      source_product_id: null,
      style_code: '',
      line_description: 'Embroidery',
      quantity: 1,
    },
  ]);

  assert.equal(plan.eligible, true);
  assert.equal(plan.product_line_count, 2);
  assert.equal(plan.total_quantity, 5);
  assert.deepEqual(plan.items, [
    { code: 'GD001BLACL', quantity: 5, reference: '56789' },
  ]);
  assert.equal(plan.lines.length, 2);
});

test('buildJobBasketPlan rejects the entire job when a product line is unresolved', () => {
  const plan = buildJobBasketPlan({ source_order_id: 10, order_no: 56789 }, [
    {
      source_order_item_id: 1,
      source_product_id: 100,
      style_code: 'GD001',
      colour: 'Black',
      size: 'L',
      quantity: 2,
    },
    {
      source_order_item_id: 2,
      source_product_id: 101,
      ralawise_sku: 'GD001BLACXL',
      ralawise_catalog_status: 'Live',
      quantity: 1,
    },
  ]);

  assert.equal(plan.eligible, false);
  assert.equal(plan.unresolved.length, 1);
  assert.match(plan.unresolved[0].reason, /SKU is missing/);
});

test('buildJobBasketPlan rejects discontinued SKUs', () => {
  const plan = buildJobBasketPlan({ source_order_id: 10, order_no: 56789 }, [
    {
      source_order_item_id: 1,
      source_product_id: 100,
      ralawise_sku: 'OLD001',
      ralawise_catalog_status: 'Discontinued',
      quantity: 1,
    },
  ]);

  assert.equal(plan.eligible, false);
  assert.match(plan.unresolved[0].reason, /not live/);
});

test('buildJobBasketPlan accepts decimal Ralawise child SKUs', () => {
  const plan = buildJobBasketPlan(
    { source_order_id: 50416, order_no: 51169 },
    [{
      source_order_item_id: 209580,
      source_product_id: 39555,
      ralawise_sku: 'KK350BLAC15.5',
      ralawise_catalog_status: 'Live',
      quantity: 2,
    }]
  );

  assert.equal(plan.eligible, true);
  assert.deepEqual(plan.items, [{
    code: 'KK350BLAC15.5',
    quantity: 2,
    reference: '51169',
  }]);
});

test('basketContainsPlan requires the exact SKU, reference, and requested quantity', () => {
  const plan = {
    reference: '56789',
    items: [
      { code: 'ONE', quantity: 2 },
      { code: 'TWO', quantity: 1 },
    ],
  };

  assert.equal(basketContainsPlan([
    { code: 'ONE', reference: '56789', quantity: 2 },
    { code: 'TWO', reference: '56789', quantity: 1 },
  ], plan), true);
  assert.equal(basketContainsPlan([
    { code: 'ONE', reference: 'OTHER', quantity: 2 },
    { code: 'TWO', reference: '56789', quantity: 1 },
  ], plan), false);
  assert.equal(basketContainsPlan([
    { code: 'ONE', reference: '56789', quantity: 1 },
    { code: 'TWO', reference: '56789', quantity: 1 },
  ], plan), false);
});
