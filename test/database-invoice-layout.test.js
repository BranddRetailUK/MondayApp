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

test('order acknowledgement delivery addresses use the widened comma-separated row', () => {
  const acknowledgementHeader = sourceFunction(
    database,
    'function renderOrderAckPageHeader',
    'function renderOrderAckPageContent'
  );

  assert.match(
    acknowledgementHeader,
    /orderAckMetaRow\('Delivery address:', orderDocumentAddressText\(deliveryDisplay\)\)/
  );
  assert.doesNotMatch(
    acknowledgementHeader,
    /renderOrderDocumentStackedAddressValue\(deliveryDisplay\)/
  );
  assert.match(
    styles,
    /\.db-order-ack-meta\{\s*margin-left:13\.5mm;\s*width:147mm;\s*\}/
  );
  assert.match(
    styles,
    /\.db-order-ack-letter\{\s*width:153mm;\s*margin:7mm 0 0 7\.5mm;/
  );
});

test('delivery note recipient addresses use comma-separated text', () => {
  const deliveryNoteRenderer = sourceFunction(
    database,
    'function renderDeliveryNoteDocument',
    'function renderOrderDocumentPage'
  );

  assert.match(deliveryNoteRenderer, /stackedAddress: false/);
  assert.doesNotMatch(deliveryNoteRenderer, /stackedAddress: true/);
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
  assert.match(
    styles,
    /\.db-order-doc-page-invoice \.db-invoice-summary\{\s*grid-template-columns:62mm 46mm 15mm 1fr;\s*\}/
  );
  assert.match(
    styles,
    /\.db-order-doc-page-invoice \.db-invoice-total-lines\{\s*grid-column:2 \/ -1;\s*grid-template-columns:46mm minmax\(15mm, max-content\);\s*justify-content:start;\s*\}/
  );
  assert.match(
    styles,
    /\.db-order-doc-page-invoice \.db-invoice-total-row\{\s*display:contents;\s*\}/
  );
  assert.match(
    styles,
    /\.db-invoice-total-row strong\{[\s\S]*min-width:15mm;[\s\S]*justify-content:flex-end;[\s\S]*text-align:right;[\s\S]*white-space:nowrap;/
  );
});

function sourceFunction(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(start, -1, `missing ${startMarker}`);
  assert.notEqual(end, -1, `missing ${endMarker}`);
  return source.slice(start, end);
}
