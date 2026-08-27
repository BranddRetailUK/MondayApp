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

test('order acknowledgements exclude internal lines from items and totals', () => {
  const acknowledgementRenderer = sourceFunction(
    database,
    'function renderOrderAcknowledgementPage',
    'function renderOrderAckPage'
  );
  const documentLineFilter = sourceFunction(
    database,
    'function orderDocumentLineItems',
    'function isInvoiceLikeDocumentType'
  );

  assert.match(
    acknowledgementRenderer,
    /const items = orderDocumentLineItems\('order-ack'\);[\s\S]*const totals = orderAckTotals\(items\);/
  );
  assert.match(
    documentLineFilter,
    /const items = orderAckLineItems\(\)\.filter\(\(item\) => !truthy\(item\.is_internal\)\);/
  );
});

test('order acknowledgement totals align their value boxes below the Total column', () => {
  assert.match(
    styles,
    /\.db-order-ack-summary-row\{\s*display:grid;\s*grid-template-columns:1fr 22mm 37mm;/
  );
  assert.match(styles, /\.db-order-ack-items th:nth-child\(4\)/);
});

test('delivery note recipient addresses use stacked lines without changing invoice delivery metadata', () => {
  const deliveryNoteRenderer = sourceFunction(
    database,
    'function renderDeliveryNoteDocument',
    'function renderOrderDocumentPage'
  );

  assert.match(deliveryNoteRenderer, /stackedAddress: true/);
  assert.doesNotMatch(deliveryNoteRenderer, /stackedAddress: false/);
});

test('multi-page order PDFs render full details once and use logo-only continuation headers', () => {
  const acknowledgementPage = sourceFunction(
    database,
    'function renderOrderAckPage',
    'function renderOrderAckPageHeader'
  );
  const documentPage = sourceFunction(
    database,
    'function renderOrderDocumentPage',
    'function orderDocumentFooterUrl'
  );
  const continuationHeader = sourceFunction(
    database,
    'function renderDocumentContinuationHeader',
    'function renderOrderDocumentPageContent'
  );

  assert.match(
    acknowledgementPage,
    /isFirstPage \? renderOrderAckPageHeader\(context\) : renderDocumentContinuationHeader\(\)/
  );
  assert.match(
    documentPage,
    /isFirstPage[\s\S]*renderOrderDocumentPageHeader\(context\)[\s\S]*renderDocumentContinuationHeader\('db-order-doc-header'\)/
  );
  assert.match(documentPage, /db-order-doc-page-first/);
  assert.match(documentPage, /db-order-doc-page-continued/);
  assert.match(continuationHeader, /db-order-ack-logo/);
  assert.doesNotMatch(continuationHeader, /context\.title|context\.metaRows|Job title/);
  assert.match(
    styles,
    /\.db-order-doc-page-continued \.db-order-doc-page-content\{\s*height:220mm;/
  );
});

test('order PDF pagination uses the reclaimed continuation-page content area', () => {
  const paginator = sourceFunction(
    database,
    'function buildOrderDocumentPages',
    'function emptyOrderDocumentPageContent'
  );

  assert.match(database, /const ORDER_DOC_CONTINUATION_PAGE_CONTENT_MAX_MM = 220;/);
  assert.match(
    paginator,
    /pages\.length === 0[\s\S]*ORDER_DOC_PAGE_CONTENT_MAX_MM[\s\S]*ORDER_DOC_CONTINUATION_PAGE_CONTENT_MAX_MM/
  );
  assert.match(paginator, /usedMm \+ heightMm > currentPageContentMaxMm\(\)/);
});

test('multi-page reports retain only the logo in continuation headers', () => {
  const financialPage = sourceFunction(
    database,
    'function renderFinancialReportPage',
    'function renderFinancialReportSummary'
  );
  const stockPage = sourceFunction(
    database,
    'function renderStockOrderingPage',
    'function renderStockOrderingReportTable'
  );
  const outstandingPage = sourceFunction(
    database,
    'function renderOutstandingReportPage',
    'function renderOutstandingReportSection'
  );

  assert.match(financialPage, /continued \? '' : `<div><h1>/);
  assert.match(financialPage, /continued \? '' : `[\s\S]*db-financial-report-meta/);
  assert.match(stockPage, /continued \? '' : `<h1>/);
  assert.match(outstandingPage, /continued \? '' : `<h1>/);
  for (const renderer of [financialPage, stockPage, outstandingPage]) {
    assert.match(renderer, /db-document-continuation-header/);
    assert.match(renderer, /db-order-ack-logo/);
    assert.match(renderer, /db-order-ack-footer/);
  }
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
