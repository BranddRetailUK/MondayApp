const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const database = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'database.js'),
  'utf8'
);
const styles = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'styles.css'),
  'utf8'
);

test('invoice delivery addresses use comma-separated text instead of stacked lines', () => {
  const invoiceRenderer = sourceFunction(
    database,
    'function renderInvoiceDocument',
    'function renderDeliveryNoteDocument'
  );

  assert.match(
    invoiceRenderer,
    /\{ label: 'Delivery address:', value: orderDocumentAddressText\(deliveryDisplay\) \}/
  );
  assert.doesNotMatch(
    invoiceRenderer,
    /Delivery address:[\s\S]*renderOrderDocumentStackedAddressValue\(deliveryDisplay\)/
  );
  assert.match(
    styles,
    /\.db-order-doc-page-invoice \.db-order-doc-meta-wrap:not\(\.has-signature\),\s*\.db-order-doc-page-pro-forma \.db-order-doc-meta-wrap:not\(\.has-signature\)\{\s*grid-template-columns:153mm;\s*\}/
  );
});

test('invoice tables reserve 15mm for numeric columns and widen descriptions', () => {
  assert.match(
    styles,
    /\.db-invoice-items:not\(\.db-invoice-items-business-gift\) th:nth-child\(2\)\{width:42mm\}/
  );
  assert.match(
    styles,
    /\.db-invoice-items:not\(\.db-invoice-items-business-gift\) th:nth-child\(n\+5\)\{width:15mm\}/
  );
  assert.match(
    styles,
    /\.db-invoice-items-business-gift th:nth-child\(1\)\{width:78mm\}/
  );
  assert.match(
    styles,
    /\.db-invoice-items-business-gift th:nth-child\(n\+2\)\{width:15mm\}/
  );
});

function sourceFunction(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(start, -1, `missing ${startMarker}`);
  assert.notEqual(end, -1, `missing ${endMarker}`);
  return source.slice(start, end);
}
