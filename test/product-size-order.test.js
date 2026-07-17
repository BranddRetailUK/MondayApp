const test = require('node:test');
const assert = require('node:assert/strict');

const { compareSizes, sortSizes } = require('../public/product-size-order');

test('orders adult garment sizes from extra small through numbered XL sizes', () => {
  const sizes = ['4XL', '5XL', 'L', 'M', 'S', 'XL', 'XS', '3XL', '2XL'];
  assert.deepEqual(
    sortSizes(sizes),
    ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL']
  );
});

test('orders youth garment sizes in their natural sequence', () => {
  assert.deepEqual(
    sortSizes(['YXL', 'YM', 'YS', 'YL', 'YXS']),
    ['YXS', 'YS', 'YM', 'YL', 'YXL']
  );
});

test('recognizes equivalent and combined labels without changing their text', () => {
  const sizes = ['2XL/3XL', 'XXL', 'Large', 'X Large', 'Small/Medium', 'Small'];
  assert.deepEqual(
    sortSizes(sizes),
    ['Small', 'Small/Medium', 'Large', 'X Large', 'XXL', '2XL/3XL']
  );
  assert.equal(compareSizes('4XL', '12XL') < 0, true);
});

test('sorts copies and preserves original size values', () => {
  const sizes = [{ label: 'YL' }, { label: 'YS' }, { label: 'YM' }];
  const sorted = sortSizes(sizes, (size) => size.label);
  assert.deepEqual(sorted.map((size) => size.label), ['YS', 'YM', 'YL']);
  assert.deepEqual(sizes.map((size) => size.label), ['YL', 'YS', 'YM']);
});
