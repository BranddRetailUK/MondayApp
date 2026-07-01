#!/usr/bin/env node
require('dotenv').config();

if (
  process.env.DATABASE_PUBLIC_URL &&
  (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('.internal'))
) {
  process.env.DATABASE_URL = process.env.DATABASE_PUBLIC_URL;
  console.log('[database-import] Using DATABASE_PUBLIC_URL for local import');
}

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { ensureDatabaseTables } = require('../src/db/databaseSchema');

const FIELD_DELIMITER = '\t';
const RECORD_DELIMITER = '\x1e';
const NULL_TOKEN = '__NULL__';
const ALL_YEARS_LABEL = 'all';
const INSERT_BATCH_SIZE = 250;
const MDB_EXPORT_BIN = resolveMdbExportBin();
const ADDRESS_SOURCE_TABLES = ['tblOrder', 'tblCustomer', 'tblAddress', 'tblContact'];
const PRODUCT_SOURCE_TABLES = [
  'tblProduct',
  'tblStyle',
  'tblStyleColour',
  'tblColour',
  'tblStyleSize',
  'tblSize',
  'tblProductType',
  'tblSupplier',
];

const TABLE_COLUMNS = {
  tblOrder: [
    'orderid', 'ordertypeid', 'customerid', 'contactid', 'takenbystaffid',
    'deliveryid', 'paymenttermsid', 'invaddressid', 'deladdressid',
    'lngorderno', 'sclientorderno', 'sjobtitle', 'dtorder',
    'yncustomerdate', 'dtcomplete', 'yncomplete', 'dtdelivery',
    'ynreorder', 'ynbagged', 'ynautomatic', 'sscreennumbers', 'scomments',
    'ynartwork', 'ynscreens', 'ynshirts', 'ynprinted', 'yncustomersupplied',
    'dtdeliverynote', 'lnginvoiceno', 'tracestaffid', 'dtcreate', 'dtedit',
    'yninvoicerequired', 'yninvoiceprinted', 'ynpfinvoiceprinted',
    'dtpfinvoice',
  ],
  tblCustomer: [
    'customerid', 'invaddressid', 'deladdressid', 'sectorid',
    'sectortypeid', 'accountmanagerstaffid', 'scustomer', 'scustomercode',
    'tracestaffid', 'dtcreate', 'dtedit',
  ],
  tblAddress: [
    'addressid', 'customerid', 'saddress1', 'saddress2', 'saddress3',
    'saddress4', 'saddress5', 'spostcode', 'stel', 'sfax', 'smobile',
    'tracestaffid', 'dtcreate', 'dtedit',
  ],
  tblContact: [
    'contactid', 'customerid', 'addressid', 'ynmailout', 'slastname',
    'sfirstname', 'stitle', 'stel', 'sfax', 'smobile', 'semail',
    'tracestaffid', 'dtcreate', 'dtedit',
  ],
  tblOrderType: [
    'ordertypeid', 'sordertype', 'sordertypeabbr', 'ynprinting',
    'ynembroidery', 'ynbusinessgift', 'sprocess', 'tracestaffid',
    'dtcreate', 'dtedit',
  ],
  tblOrderItem: [
    'orderitemid', 'orderid', 'productid', 'supplierorderid',
    'sdescription', 'lngqty', 'curprice', 'curcost', 'sngvat',
    'ynnondeliverable', 'yninternal', 'ssupplier', 'tracestaffid',
    'dtcreate', 'dtedit',
  ],
  tblProduct: [
    'productid', 'styleid', 'stylecolourid', 'stylesizeid', 'curcost',
    'lngstock', 'ynactive', 'tracestaffid', 'dtcreate', 'dtedit',
  ],
  tblStyle: [
    'styleid', 'supplierid', 'producttypeid', 'vatid', 'sstylecode',
    'saltstylecode', 'sstyle', 'tracestaffid', 'dtcreate', 'dtedit',
  ],
  tblStyleColour: [
    'stylecolourid', 'styleid', 'colourid', 'tracestaffid', 'dtcreate',
    'dtedit',
  ],
  tblColour: ['colourid', 'scolour', 'tracestaffid', 'dtcreate', 'dtedit'],
  tblStyleSize: [
    'stylesizeid', 'styleid', 'sizeid', 'tracestaffid', 'dtcreate', 'dtedit',
  ],
  tblSize: ['sizeid', 'ssize', 'tracestaffid', 'dtcreate', 'dtedit'],
  tblProductType: [
    'producttypeid', 'sproducttype', 'tracestaffid', 'dtcreate', 'dtedit',
  ],
  tblOrderPosition: [
    'orderpositionid', 'orderid', 'sposition', 'memcolour', 'sdesign',
    'tracestaffid', 'dtcreate', 'dtedit',
  ],
  tblSupplier: [
    'supplierid', 'ssupplier', 'ssuppliercode', 'saddress1', 'saddress2',
    'saddress3', 'saddress4', 'saddress5', 'spostcode', 'stel', 'sfax',
    'smobile', 'tracestaffid', 'dtcreate', 'dtedit',
  ],
};

const JOB_COLUMNS = [
  'source_order_id', 'order_no', 'source_year', 'order_type_id',
  'order_type', 'order_type_abbr', 'customer_id', 'customer_name',
  'customer_code', 'contact_id', 'job_title', 'client_order_no',
  'contact_name', 'contact_phone', 'contact_mobile', 'contact_email',
  'invoice_address_id', 'delivery_address_id', 'invoice_address',
  'delivery_address', 'order_date', 'customer_date_required',
  'complete_date', 'is_complete', 'delivery_date', 'is_reorder', 'is_bagged', 'is_automatic',
  'screen_numbers', 'comments', 'has_artwork', 'has_screens', 'has_shirts',
  'is_printed', 'customer_supplied', 'delivery_note_date', 'invoice_no',
  'trace_staff_id', 'created_at_source', 'updated_at_source',
  'invoice_required', 'invoice_printed', 'pf_invoice_printed',
  'pf_invoice_date',
];

const DASHBOARD_JOB_FIELD_COLUMNS = [
  'dashboard_status',
  'dashboard_priority',
  'dashboard_type',
  'proof_approved',
  'proof_approved_at',
  'dashboard_status_updated_at',
];

const LINE_COLUMNS = [
  'source_order_item_id', 'source_order_id', 'line_sort_order',
  'source_product_id', 'supplier_order_id', 'line_description',
  'quantity', 'unit_price', 'unit_cost', 'vat_rate',
  'is_non_deliverable', 'is_internal', 'supplier_name',
  'style_id', 'style_code', 'alt_style_code',
  'style_name', 'colour', 'size', 'product_type', 'stock',
  'is_product_active', 'trace_staff_id', 'created_at_source',
  'updated_at_source',
];

const PRODUCT_COLUMNS = [
  'source_product_id', 'style_id', 'style_colour_id', 'style_size_id',
  'supplier_id', 'supplier_name', 'supplier_code', 'product_type_id',
  'product_type', 'style_code', 'alt_style_code', 'style_name',
  'colour_id', 'colour', 'size_id', 'size', 'unit_cost', 'stock',
  'is_product_active', 'trace_staff_id', 'created_at_source',
  'updated_at_source',
];

const POSITION_COLUMNS = [
  'source_order_position_id', 'source_order_id', 'position_sort_order',
  'position_name', 'colour_notes', 'design_ref', 'trace_staff_id',
  'created_at_source', 'updated_at_source',
];

const ADDRESS_COLUMNS = [
  'source_address_id', 'customer_id', 'address_type', 'address_line1',
  'address_line2', 'address_line3', 'address_line4', 'address_line5',
  'postcode', 'phone', 'fax', 'mobile', 'trace_staff_id',
  'created_at_source', 'updated_at_source',
];

const CONTACT_COLUMNS = [
  'source_contact_id', 'customer_id', 'profile_id', 'customer_name',
  'address_id', 'contact_title', 'contact_first_name', 'contact_last_name',
  'contact_name', 'contact_phone', 'contact_fax', 'contact_mobile',
  'contact_email', 'contact_address', 'trace_staff_id',
  'created_at_source', 'updated_at_source',
];

main().catch((err) => {
  console.error('[database-import] Fatal error:', err);
  process.exit(1);
});

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    printHelp();
    return;
  }

  const dryRun = args.includes('--dry-run');
  const append = args.includes('--append');
  const insertOnly = args.includes('--insert-only');
  const addressesOnly = args.includes('--addresses-only');
  const productsOnly = args.includes('--products-only');
  const productsFromExistingOrders = args.includes('--products-from-existing-orders');
  const yearFilter = parseYearFilter(args);
  const sourceYearsLabel = formatYearFilter(yearFilter);
  const fileArg = args.find((arg) => !arg.startsWith('--')) || 'PS_XP_tab.mdb';
  const mdbPath = path.resolve(process.cwd(), fileArg);

  if (addressesOnly && (productsOnly || productsFromExistingOrders)) {
    throw new Error('--addresses-only cannot be used with product-only import modes');
  }
  if (productsOnly && productsFromExistingOrders) {
    throw new Error('--products-only and --products-from-existing-orders cannot be used together');
  }
  if (append && insertOnly) {
    throw new Error('--append and --insert-only cannot be used together; --append updates existing rows');
  }
  if (addressesOnly && insertOnly) {
    throw new Error('--insert-only cannot be used with --addresses-only because address-only mode updates existing job address fields');
  }

  if (!fs.existsSync(mdbPath)) {
    throw new Error(`MDB file not found: ${mdbPath}`);
  }

  console.log(`[database-import] Reading ${mdbPath}`);
  const sourceTables = addressesOnly
    ? ADDRESS_SOURCE_TABLES
    : (productsOnly || productsFromExistingOrders)
      ? PRODUCT_SOURCE_TABLES
      : Object.keys(TABLE_COLUMNS);
  const data = readSourceData(mdbPath, sourceTables);

  if (productsOnly) {
    const productRows = buildAllProductRows(data);
    await importProductRows(productRows, {
      sourceFile: mdbPath,
      dryRun,
      replaceExisting: !append && !insertOnly,
      insertOnly,
      sourceYearsLabel,
      modeLabel: 'Full product import',
      replaceMessage: 'Full product catalogue replaced',
      appendMessage: 'Full product catalogue appended/upserted',
      insertOnlyMessage: 'Full product catalogue insert-only complete',
    });
    return;
  }

  if (productsFromExistingOrders) {
    await importProductsFromExistingOrders(data, {
      sourceFile: mdbPath,
      dryRun,
      replaceExisting: !append && !insertOnly,
      insertOnly,
      sourceYearsLabel,
    });
    return;
  }

  const snapshot = addressesOnly ? buildAddressSnapshot(data, yearFilter) : buildSnapshot(data, yearFilter);

  console.log(
    `[database-import] Snapshot: ${snapshot.jobs.length} jobs, ` +
    `${snapshot.lineItems.length} line items, ${snapshot.positions.length} positions, ` +
    `${snapshot.addresses.length} customer addresses, ${snapshot.contacts.length} contacts, ` +
    `${snapshot.products.length} products`
  );
  if (addressesOnly) {
    console.log(`[database-import] Address-only mode: ${snapshot.jobAddressUpdates.length} existing job address rows prepared`);
  }
  console.log(`[database-import] Years: ${sourceYearsLabel}`);

  if (dryRun) {
    printDryRun(snapshot);
    return;
  }

  await importSnapshot(snapshot, {
    sourceFile: mdbPath,
    replaceExisting: !append && !insertOnly,
    insertOnly,
    addressesOnly,
    sourceYearsLabel,
  });
}

function printHelp() {
  console.log(`Usage: node scripts/import-database-mdb.js [PS_XP_tab.mdb] [--dry-run] [--append] [--insert-only] [--years=2025,2026]

Imports Access jobs into Railway/Postgres tables:
  database_jobs
  database_job_line_items
  database_job_positions
  database_customer_addresses
  database_products
  database_customer_contacts

Options:
  --years=...                    Optional comma-separated year filter for diagnostics.
  --append                       Skip deletes and upsert source rows into existing rows.
  --insert-only                  Skip deletes and insert only source rows that do not already exist.
  --addresses-only               Import only customer addresses and job address fields.
  --products-only                Import only the full product catalogue.
  --products-from-existing-orders Import only products referenced by existing database_job_line_items.

Run against Railway with:
  railway run --service DB node scripts/import-database-mdb.js PS_XP_tab.mdb
`);
}

function resolveMdbExportBin() {
  if (process.env.MDB_EXPORT_BIN) return process.env.MDB_EXPORT_BIN;

  const candidates = [
    '/opt/homebrew/bin/mdb-export',
    '/usr/local/bin/mdb-export',
    '/usr/bin/mdb-export',
  ];

  const installedPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (installedPath) return installedPath;

  return 'mdb-export';
}

function readSourceData(mdbPath, tables = Object.keys(TABLE_COLUMNS)) {
  return tables.reduce((acc, table) => {
    console.log(`[database-import] Exporting ${table}`);
    acc[table] = exportTable(mdbPath, table);
    return acc;
  }, {});
}

function exportTable(mdbPath, table) {
  const result = spawnSync(MDB_EXPORT_BIN, [
    '-H',
    '-D', '%Y-%m-%d',
    '-T', '%Y-%m-%d %H:%M:%S',
    '-B',
    '-0', NULL_TOKEN,
    '-d', FIELD_DELIMITER,
    '-R', RECORD_DELIMITER,
    '-e',
    '-Q',
    mdbPath,
    table,
  ], {
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${table} export failed: ${result.stderr || result.stdout}`);
  }

  return parseExport(table, result.stdout, TABLE_COLUMNS[table]);
}

function parseExport(table, output, columns) {
  if (!output) return [];

  return output
    .split(RECORD_DELIMITER)
    .filter((record) => record.length > 0)
    .map((record, index) => {
      const cleanRecord = record.replace(/^\n/, '').replace(/\n$/, '');
      const fields = cleanRecord.split(FIELD_DELIMITER);
      if (fields.length !== columns.length) {
        throw new Error(
          `${table} record ${index + 1} has ${fields.length} fields; expected ${columns.length}`
        );
      }

      return columns.reduce((row, column, fieldIndex) => {
        row[column] = decodeField(fields[fieldIndex]);
        return row;
      }, {});
    });
}

function decodeField(value) {
  if (value === NULL_TOKEN) return null;
  return String(value)
    .replace(/\\r/g, '\r')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\\\/g, '\\');
}

function buildSnapshot(data, yearFilter = null) {
  const customers = mapByInt(data.tblCustomer, 'customerid');
  const addresses = mapByInt(data.tblAddress, 'addressid');
  const contacts = mapByInt(data.tblContact, 'contactid');
  const orderTypes = mapByInt(data.tblOrderType, 'ordertypeid');
  const products = mapByInt(data.tblProduct, 'productid');
  const styles = mapByInt(data.tblStyle, 'styleid');
  const styleColours = mapByInt(data.tblStyleColour, 'stylecolourid');
  const colours = mapByInt(data.tblColour, 'colourid');
  const styleSizes = mapByInt(data.tblStyleSize, 'stylesizeid');
  const sizes = mapByInt(data.tblSize, 'sizeid');
  const productTypes = mapByInt(data.tblProductType, 'producttypeid');
  const suppliers = mapByInt(data.tblSupplier, 'supplierid');

  const selectedOrderIds = new Set();
  const selectedCustomerIds = new Set();
  const selectedAddressIds = new Set();
  const jobs = [];

  for (const order of data.tblOrder) {
    const sourceYear = sourceYearForOrder(order);
    if (yearFilter && !yearFilter.has(sourceYear)) continue;

    const sourceOrderId = toInt(order.orderid);
    if (!sourceOrderId) continue;

    const customer = customers.get(toInt(order.customerid)) || {};
    const contact = contacts.get(toInt(order.contactid)) || {};
    const orderType = orderTypes.get(toInt(order.ordertypeid)) || {};
    const invoiceAddressId = toInt(order.invaddressid) || toInt(customer.invaddressid);
    const deliveryAddressId = toInt(order.deladdressid) || toInt(customer.deladdressid);
    const invoiceAddress = addresses.get(invoiceAddressId) || {};
    const deliveryAddress = addresses.get(deliveryAddressId) || {};
    const customerId = toInt(order.customerid);

    selectedOrderIds.add(sourceOrderId);
    if (customerId) selectedCustomerIds.add(customerId);
    if (invoiceAddressId) selectedAddressIds.add(invoiceAddressId);
    if (deliveryAddressId) selectedAddressIds.add(deliveryAddressId);
    const contactAddressId = toInt(contact.addressid);
    if (contactAddressId) selectedAddressIds.add(contactAddressId);

    jobs.push({
      source_order_id: sourceOrderId,
      order_no: toInt(order.lngorderno),
      source_year: sourceYear,
      order_type_id: toInt(order.ordertypeid),
      order_type: cleanText(orderType.sordertype),
      order_type_abbr: cleanText(orderType.sordertypeabbr),
      customer_id: customerId,
      customer_name: cleanText(customer.scustomer),
      customer_code: cleanText(customer.scustomercode),
      contact_id: toInt(order.contactid),
      contact_name: contactName(contact),
      contact_phone: cleanText(contact.stel),
      contact_mobile: cleanText(contact.smobile),
      contact_email: cleanText(contact.semail),
      invoice_address_id: invoiceAddressId,
      delivery_address_id: deliveryAddressId,
      invoice_address: formatAddress(invoiceAddress),
      delivery_address: formatAddress(deliveryAddress),
      job_title: cleanText(order.sjobtitle),
      client_order_no: cleanText(order.sclientorderno),
      order_date: toTimestamp(order.dtorder),
      customer_date_required: toBool(order.yncustomerdate),
      complete_date: toTimestamp(order.dtcomplete),
      is_complete: toBool(order.yncomplete),
      delivery_date: toTimestamp(order.dtdelivery),
      is_reorder: toBool(order.ynreorder),
      is_bagged: toBool(order.ynbagged),
      is_automatic: toBool(order.ynautomatic),
      screen_numbers: cleanText(order.sscreennumbers),
      comments: cleanText(order.scomments),
      has_artwork: toBool(order.ynartwork),
      has_screens: toBool(order.ynscreens),
      has_shirts: toBool(order.ynshirts),
      is_printed: toBool(order.ynprinted),
      customer_supplied: toBool(order.yncustomersupplied),
      delivery_note_date: toTimestamp(order.dtdeliverynote),
      invoice_no: toInt(order.lnginvoiceno),
      trace_staff_id: toInt(order.tracestaffid),
      created_at_source: toTimestamp(order.dtcreate),
      updated_at_source: toTimestamp(order.dtedit),
      invoice_required: toBool(order.yninvoicerequired),
      invoice_printed: toBool(order.yninvoiceprinted),
      pf_invoice_printed: toBool(order.ynpfinvoiceprinted),
      pf_invoice_date: toTimestamp(order.dtpfinvoice),
    });
  }

  const lineSortByOrder = new Map();
  const lineItems = data.tblOrderItem
    .filter((item) => selectedOrderIds.has(toInt(item.orderid)))
    .map((item) => {
      const sourceOrderId = toInt(item.orderid);
      const lineSortOrder = (lineSortByOrder.get(sourceOrderId) || 0) + 1;
      lineSortByOrder.set(sourceOrderId, lineSortOrder);
      const product = products.get(toInt(item.productid)) || {};
      const style = styles.get(toInt(product.styleid)) || {};
      const styleColour = styleColours.get(toInt(product.stylecolourid)) || {};
      const colour = colours.get(toInt(styleColour.colourid)) || {};
      const styleSize = styleSizes.get(toInt(product.stylesizeid)) || {};
      const size = sizes.get(toInt(styleSize.sizeid)) || {};
      const productType = productTypes.get(toInt(style.producttypeid)) || {};
      const supplier = suppliers.get(toInt(style.supplierid)) || {};

      return {
        source_order_item_id: toInt(item.orderitemid),
        source_order_id: sourceOrderId,
        line_sort_order: lineSortOrder,
        source_product_id: toInt(item.productid),
        supplier_order_id: toInt(item.supplierorderid),
        line_description: cleanText(item.sdescription),
        quantity: toInt(item.lngqty),
        unit_price: toNumber(item.curprice),
        unit_cost: toNumber(item.curcost),
        vat_rate: toNumber(item.sngvat),
        is_non_deliverable: toBool(item.ynnondeliverable),
        is_internal: toBool(item.yninternal),
        supplier_name: cleanText(item.ssupplier) || cleanText(supplier.ssupplier),
        style_id: toInt(style.styleid),
        style_code: cleanText(style.sstylecode),
        alt_style_code: cleanText(style.saltstylecode),
        style_name: cleanText(style.sstyle),
        colour: cleanText(colour.scolour),
        size: cleanText(size.ssize),
        product_type: cleanText(productType.sproducttype),
        stock: toInt(product.lngstock),
        is_product_active: toBool(product.ynactive),
        trace_staff_id: toInt(item.tracestaffid),
        created_at_source: toTimestamp(item.dtcreate),
        updated_at_source: toTimestamp(item.dtedit),
      };
    });

  const positionSortByOrder = new Map();
  const positions = data.tblOrderPosition
    .filter((position) => selectedOrderIds.has(toInt(position.orderid)))
    .map((position) => {
      const sourceOrderId = toInt(position.orderid);
      const positionSortOrder = (positionSortByOrder.get(sourceOrderId) || 0) + 1;
      positionSortByOrder.set(sourceOrderId, positionSortOrder);
      return {
        source_order_position_id: toInt(position.orderpositionid),
        source_order_id: sourceOrderId,
        position_sort_order: positionSortOrder,
        position_name: cleanText(position.sposition),
        colour_notes: cleanText(position.memcolour),
        design_ref: cleanText(position.sdesign),
        trace_staff_id: toInt(position.tracestaffid),
        created_at_source: toTimestamp(position.dtcreate),
        updated_at_source: toTimestamp(position.dtedit),
      };
    });

  const addressRoles = buildAddressRoleMap(data, selectedOrderIds, selectedCustomerIds);
  const customerAddresses = buildCustomerAddressRows(
    data.tblAddress,
    selectedCustomerIds,
    selectedAddressIds,
    addressRoles
  );
  const customerContacts = buildCustomerContactRows(data.tblContact, customers, addresses, selectedCustomerIds);
  const productRows = buildAllProductRows(data);

  jobs.sort((a, b) => {
    const dateA = a.order_date || a.created_at_source || '';
    const dateB = b.order_date || b.created_at_source || '';
    return dateA < dateB ? 1 : dateA > dateB ? -1 : b.order_no - a.order_no;
  });

  return {
    jobs,
    lineItems,
    positions,
    addresses: customerAddresses,
    contacts: customerContacts,
    products: productRows,
  };
}

function buildAllProductRows(data) {
  return buildProductRows(data, allProductIds(data));
}

function allProductIds(data) {
  return new Set(
    (data.tblProduct || [])
      .map((product) => toInt(product.productid))
      .filter((productId) => productId !== null)
  );
}

function buildProductRows(data, selectedProductIds) {
  const styles = mapByInt(data.tblStyle, 'styleid');
  const styleColours = mapByInt(data.tblStyleColour, 'stylecolourid');
  const colours = mapByInt(data.tblColour, 'colourid');
  const styleSizes = mapByInt(data.tblStyleSize, 'stylesizeid');
  const sizes = mapByInt(data.tblSize, 'sizeid');
  const productTypes = mapByInt(data.tblProductType, 'producttypeid');
  const suppliers = mapByInt(data.tblSupplier, 'supplierid');

  return (data.tblProduct || [])
    .filter((product) => selectedProductIds.has(toInt(product.productid)))
    .map((product) => {
      const style = styles.get(toInt(product.styleid)) || {};
      const styleColour = styleColours.get(toInt(product.stylecolourid)) || {};
      const colour = colours.get(toInt(styleColour.colourid)) || {};
      const styleSize = styleSizes.get(toInt(product.stylesizeid)) || {};
      const size = sizes.get(toInt(styleSize.sizeid)) || {};
      const productType = productTypes.get(toInt(style.producttypeid)) || {};
      const supplier = suppliers.get(toInt(style.supplierid)) || {};

      return {
        source_product_id: toInt(product.productid),
        style_id: toInt(product.styleid),
        style_colour_id: toInt(product.stylecolourid),
        style_size_id: toInt(product.stylesizeid),
        supplier_id: toInt(style.supplierid),
        supplier_name: cleanText(supplier.ssupplier),
        supplier_code: cleanText(supplier.ssuppliercode),
        product_type_id: toInt(style.producttypeid),
        product_type: cleanText(productType.sproducttype),
        style_code: cleanText(style.sstylecode),
        alt_style_code: cleanText(style.saltstylecode),
        style_name: cleanText(style.sstyle),
        colour_id: toInt(styleColour.colourid),
        colour: cleanText(colour.scolour),
        size_id: toInt(styleSize.sizeid),
        size: cleanText(size.ssize),
        unit_cost: toNumber(product.curcost),
        stock: toInt(product.lngstock),
        is_product_active: toBool(product.ynactive),
        trace_staff_id: toInt(product.tracestaffid),
        created_at_source: toTimestamp(product.dtcreate),
        updated_at_source: toTimestamp(product.dtedit),
      };
    })
    .filter((product) => product.source_product_id)
    .sort((a, b) => a.source_product_id - b.source_product_id);
}

function buildAddressSnapshot(data, yearFilter = null) {
  const customers = mapByInt(data.tblCustomer, 'customerid');
  const addresses = mapByInt(data.tblAddress, 'addressid');
  const contacts = mapByInt(data.tblContact, 'contactid');
  const selectedOrderIds = new Set();
  const selectedCustomerIds = new Set();
  const selectedAddressIds = new Set();
  const jobAddressUpdates = [];

  for (const order of data.tblOrder) {
    const sourceYear = sourceYearForOrder(order);
    if (yearFilter && !yearFilter.has(sourceYear)) continue;

    const sourceOrderId = toInt(order.orderid);
    if (!sourceOrderId) continue;

    const customer = customers.get(toInt(order.customerid)) || {};
    const contact = contacts.get(toInt(order.contactid)) || {};
    const invoiceAddressId = toInt(order.invaddressid) || toInt(customer.invaddressid);
    const deliveryAddressId = toInt(order.deladdressid) || toInt(customer.deladdressid);
    const invoiceAddress = addresses.get(invoiceAddressId) || {};
    const deliveryAddress = addresses.get(deliveryAddressId) || {};
    const customerId = toInt(order.customerid);

    selectedOrderIds.add(sourceOrderId);
    if (customerId) selectedCustomerIds.add(customerId);
    if (invoiceAddressId) selectedAddressIds.add(invoiceAddressId);
    if (deliveryAddressId) selectedAddressIds.add(deliveryAddressId);
    const contactAddressId = toInt(contact.addressid);
    if (contactAddressId) selectedAddressIds.add(contactAddressId);

    jobAddressUpdates.push({
      source_order_id: sourceOrderId,
      invoice_address_id: invoiceAddressId,
      delivery_address_id: deliveryAddressId,
      invoice_address: formatAddress(invoiceAddress),
      delivery_address: formatAddress(deliveryAddress),
    });
  }

  const addressRoles = buildAddressRoleMap(data, selectedOrderIds, selectedCustomerIds);
  const customerAddresses = buildCustomerAddressRows(
    data.tblAddress,
    selectedCustomerIds,
    selectedAddressIds,
    addressRoles
  );

  return {
    jobs: [],
    lineItems: [],
    positions: [],
    addresses: customerAddresses,
    contacts: [],
    products: [],
    jobAddressUpdates,
  };
}

function sourceYearForOrder(order) {
  const sourceDate = order.dtorder || order.dtcreate;
  if (!sourceDate || sourceDate.length < 4) return null;
  const year = Number.parseInt(sourceDate.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
}

function mapByInt(rows, column) {
  const map = new Map();
  for (const row of rows) {
    const id = toInt(row[column]);
    if (id !== null) map.set(id, row);
  }
  return map;
}

function cleanText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function contactName(contact) {
  const parts = [
    cleanText(contact.sfirstname),
    cleanText(contact.slastname),
  ].filter(Boolean);
  return parts.length ? parts.join(' ') : null;
}

function buildCustomerContactRows(contactRows, customers, addresses, selectedCustomerIds) {
  return (contactRows || [])
    .filter((contact) => selectedCustomerIds.has(toInt(contact.customerid)))
    .map((contact) => {
      const address = addresses.get(toInt(contact.addressid)) || {};
      const customer = customers.get(toInt(contact.customerid)) || {};
      return {
        source_contact_id: toInt(contact.contactid),
        customer_id: toInt(contact.customerid),
        profile_id: null,
        customer_name: cleanText(customer.scustomer),
        address_id: toInt(contact.addressid),
        contact_title: cleanText(contact.stitle),
        contact_first_name: cleanText(contact.sfirstname),
        contact_last_name: cleanText(contact.slastname),
        contact_name: contactName(contact),
        contact_phone: cleanText(contact.stel),
        contact_fax: cleanText(contact.sfax),
        contact_mobile: cleanText(contact.smobile),
        contact_email: cleanText(contact.semail),
        contact_address: formatAddress(address),
        trace_staff_id: toInt(contact.tracestaffid),
        created_at_source: toTimestamp(contact.dtcreate),
        updated_at_source: toTimestamp(contact.dtedit),
      };
    })
    .filter((contact) => contact.source_contact_id && contact.customer_name);
}

function buildAddressRoleMap(data, selectedOrderIds, selectedCustomerIds) {
  const roles = new Map();

  for (const customer of data.tblCustomer || []) {
    if (!selectedCustomerIds.has(toInt(customer.customerid))) continue;
    addAddressRole(roles, customer.invaddressid, 'Invoice');
    addAddressRole(roles, customer.deladdressid, 'Delivery');
  }

  for (const order of data.tblOrder || []) {
    if (!selectedOrderIds.has(toInt(order.orderid))) continue;
    addAddressRole(roles, order.invaddressid, 'Invoice');
    addAddressRole(roles, order.deladdressid, 'Delivery');
  }

  for (const contact of data.tblContact || []) {
    if (!selectedCustomerIds.has(toInt(contact.customerid))) continue;
    addAddressRole(roles, contact.addressid, 'Contact');
  }

  return roles;
}

function buildCustomerAddressRows(addressRows, selectedCustomerIds, selectedAddressIds, addressRoles) {
  return (addressRows || [])
    .filter((address) => {
      const customerId = toInt(address.customerid);
      const addressId = toInt(address.addressid);
      return (customerId && selectedCustomerIds.has(customerId))
        || (addressId && selectedAddressIds.has(addressId));
    })
    .map((address) => ({
      source_address_id: toInt(address.addressid),
      customer_id: toInt(address.customerid),
      address_type: addressTypeForAddress(address, addressRoles),
      address_line1: cleanText(address.saddress1),
      address_line2: cleanText(address.saddress2),
      address_line3: cleanText(address.saddress3),
      address_line4: cleanText(address.saddress4),
      address_line5: cleanText(address.saddress5),
      postcode: cleanText(address.spostcode),
      phone: cleanText(address.stel),
      fax: cleanText(address.sfax),
      mobile: cleanText(address.smobile),
      trace_staff_id: toInt(address.tracestaffid),
      created_at_source: toTimestamp(address.dtcreate),
      updated_at_source: toTimestamp(address.dtedit),
    }))
    .filter((address) => address.source_address_id);
}

function addAddressRole(roles, addressId, role) {
  const id = toInt(addressId);
  if (!id) return;
  if (!roles.has(id)) roles.set(id, new Set());
  roles.get(id).add(role);
}

function addressTypeForAddress(address, addressRoles) {
  const roles = addressRoles.get(toInt(address.addressid));
  if (!roles || !roles.size) return 'Address';
  return Array.from(roles).join(' / ');
}

function formatAddress(address) {
  const parts = [
    cleanText(address.saddress1),
    cleanText(address.saddress2),
    cleanText(address.saddress3),
    cleanText(address.saddress4),
    cleanText(address.saddress5),
    cleanText(address.spostcode),
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

function toInt(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function toBool(value) {
  if (value === null || value === undefined || value === '') return null;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return null;
}

function toTimestamp(value) {
  if (!value) return null;
  return value;
}

function parseYearFilter(args) {
  const option = args.find((arg) => arg.startsWith('--years='));
  if (!option) return null;

  const years = option
    .slice('--years='.length)
    .split(',')
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((year) => Number.isFinite(year));

  if (!years.length) {
    throw new Error('--years must include at least one numeric year, for example --years=2025,2026');
  }

  return new Set(years);
}

function formatYearFilter(yearFilter) {
  return yearFilter ? [...yearFilter].sort((a, b) => a - b).join(',') : ALL_YEARS_LABEL;
}

function printDryRun(snapshot) {
  const byYear = snapshot.jobs.reduce((acc, job) => {
    const key = job.source_year || 'Unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const byType = snapshot.jobs.reduce((acc, job) => {
    const key = job.order_type || 'Unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  console.log('[database-import] Dry run only. No database writes performed.');
  console.log(`[database-import] Jobs by year: ${JSON.stringify(byYear)}`);
  console.log(`[database-import] Jobs by type: ${JSON.stringify(byType)}`);
  console.log(`[database-import] Customer addresses: ${snapshot.addresses.length}`);
  console.log(`[database-import] Contacts: ${snapshot.contacts.length}`);
  console.log(`[database-import] Products: ${snapshot.products.length}`);
  console.log('[database-import] Latest jobs:');
  snapshot.jobs.slice(0, 10).forEach((job) => {
    console.log(
      `  - ${job.order_no} | ${job.customer_name || 'Unknown customer'} | ` +
      `${job.job_title || 'Untitled'} | ${job.order_date || job.created_at_source || 'No date'}`
    );
  });
}

async function importSnapshot(snapshot, options) {
  const pool = require('../src/db/pool');
  const client = await pool.connect();
  let runId = null;

  try {
    await ensureDatabaseTables(client);

    const run = await client.query(
      `INSERT INTO database_import_runs (source_file, source_years, status)
       VALUES ($1, $2, 'running')
       RETURNING id`,
      [options.sourceFile, options.sourceYearsLabel || ALL_YEARS_LABEL]
    );
    runId = run.rows[0].id;

    await client.query('BEGIN');

    if (options.addressesOnly) {
      console.log('[database-import] Address-only import: replacing customer address rows');
      await client.query('DELETE FROM database_customer_addresses');

      console.log(`[database-import] Writing ${snapshot.addresses.length} customer addresses`);
      await writeRows(
        client,
        'database_customer_addresses',
        ADDRESS_COLUMNS,
        'source_address_id',
        snapshot.addresses
      );

      console.log(`[database-import] Updating ${snapshot.jobAddressUpdates.length} job address fields`);
      await updateJobAddressRows(client, snapshot.jobAddressUpdates);

      await client.query('COMMIT');

      await client.query(
        `UPDATE database_import_runs
         SET job_count = $1,
             line_item_count = 0,
             position_count = 0,
             address_count = $2,
             contact_count = 0,
             finished_at = NOW(),
             status = 'complete',
             message = $3
         WHERE id = $4`,
        [
          snapshot.jobAddressUpdates.length,
          snapshot.addresses.length,
          'Address data imported only',
          runId,
        ]
      );

      console.log('[database-import] Address-only import complete');
      return;
    }

    let preservedDashboardJobFields = [];
    if (options.replaceExisting) {
      console.log('[database-import] Replacing existing database snapshot');
      preservedDashboardJobFields = await fetchDashboardJobFieldSnapshot(client);
      await client.query('DELETE FROM database_job_positions');
      await client.query('DELETE FROM database_job_line_items');
      await client.query('DELETE FROM database_jobs');
      await client.query('DELETE FROM database_customer_addresses');
      await client.query('DELETE FROM database_products');
      await client.query('DELETE FROM database_customer_contacts WHERE source_contact_id IS NOT NULL');
    }

    const conflictAction = options.insertOnly ? 'ignore' : 'update';

    console.log(`[database-import] Writing ${snapshot.addresses.length} customer addresses`);
    const addressWrite = await writeRows(
      client,
      'database_customer_addresses',
      ADDRESS_COLUMNS,
      'source_address_id',
      snapshot.addresses,
      { conflictAction }
    );

    console.log(`[database-import] Writing ${snapshot.contacts.length} contacts`);
    const contactWrite = await writeRows(
      client,
      'database_customer_contacts',
      CONTACT_COLUMNS,
      'source_contact_id',
      snapshot.contacts,
      { conflictAction }
    );

    console.log(`[database-import] Writing ${snapshot.products.length} products`);
    const productWrite = await writeRows(
      client,
      'database_products',
      PRODUCT_COLUMNS,
      'source_product_id',
      snapshot.products,
      { conflictAction }
    );

    console.log(`[database-import] Writing ${snapshot.jobs.length} jobs`);
    const jobWrite = await writeRows(
      client,
      'database_jobs',
      JOB_COLUMNS,
      'source_order_id',
      snapshot.jobs,
      { conflictAction }
    );
    if (preservedDashboardJobFields.length) {
      console.log(`[database-import] Restoring ${preservedDashboardJobFields.length} dashboard job status rows`);
      await restoreDashboardJobFieldSnapshot(client, preservedDashboardJobFields);
    }

    console.log(`[database-import] Writing ${snapshot.lineItems.length} line items`);
    const lineItemWrite = await writeRows(
      client,
      'database_job_line_items',
      LINE_COLUMNS,
      'source_order_item_id',
      snapshot.lineItems,
      { conflictAction }
    );

    console.log(`[database-import] Writing ${snapshot.positions.length} positions`);
    const positionWrite = await writeRows(
      client,
      'database_job_positions',
      POSITION_COLUMNS,
      'source_order_position_id',
      snapshot.positions,
      { conflictAction }
    );

    await client.query('COMMIT');

    await client.query(
      `UPDATE database_import_runs
       SET job_count = $1,
           line_item_count = $2,
           position_count = $3,
           address_count = $4,
           contact_count = $5,
           product_count = $6,
           finished_at = NOW(),
           status = 'complete',
           message = $7
       WHERE id = $8`,
      [
        options.insertOnly ? jobWrite.affected : snapshot.jobs.length,
        options.insertOnly ? lineItemWrite.affected : snapshot.lineItems.length,
        options.insertOnly ? positionWrite.affected : snapshot.positions.length,
        options.insertOnly ? addressWrite.affected : snapshot.addresses.length,
        options.insertOnly ? contactWrite.affected : snapshot.contacts.length,
        options.insertOnly ? productWrite.affected : snapshot.products.length,
        options.insertOnly
          ? 'Snapshot insert-only complete'
          : options.replaceExisting
            ? 'Snapshot replaced'
            : 'Snapshot appended/upserted',
        runId,
      ]
    );

    console.log('[database-import] Import complete');
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Ignore rollback errors after a pre-transaction failure.
    }

    if (runId) {
      await client.query(
        `UPDATE database_import_runs
         SET finished_at = NOW(), status = 'failed', message = $1
         WHERE id = $2`,
        [err.message, runId]
      );
    }

    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

async function importProductsFromExistingOrders(data, options) {
  const pool = require('../src/db/pool');
  const client = await pool.connect();

  try {
    await ensureDatabaseTables(client);
    const selectedProductIds = await fetchExistingOrderProductIds(client);
    const selectedProductIdSet = new Set(selectedProductIds);
    const productRows = buildProductRows(data, selectedProductIdSet);
    const missingCount = selectedProductIds.length - productRows.length;

    console.log(`[database-import] Existing order product ids: ${selectedProductIds.length}`);
    console.log(
      `[database-import] Product rows prepared: ${productRows.length}` +
      (missingCount ? ` (${missingCount} product ids were not found in the MDB)` : '')
    );

    await importProductRows(productRows, {
      ...options,
      modeLabel: 'Referenced product import',
      replaceMessage: 'Referenced product rows replaced',
      appendMessage: 'Referenced product rows appended/upserted',
      insertOnlyMessage: 'Referenced product rows insert-only complete',
      client,
    });
  } finally {
    client.release();
    await pool.end();
  }
}

async function importProductRows(productRows, options) {
  console.log(`[database-import] Product rows prepared: ${productRows.length}`);

  if (options.dryRun) {
    console.log('[database-import] Dry run only. No database writes performed.');
    console.log('[database-import] Sample products:');
    productRows.slice(0, 10).forEach((product) => {
      console.log(
        `  - ${product.source_product_id} | ${product.style_code || 'No code'} | ` +
        `${product.style_name || 'No style'} | ${product.colour || 'No colour'} | ` +
        `${product.size || 'No size'} | stock ${product.stock ?? 'n/a'}`
      );
    });
    return;
  }

  const pool = require('../src/db/pool');
  const client = options.client || await pool.connect();
  let runId = null;
  let transactionStarted = false;

  try {
    await ensureDatabaseTables(client);

    const run = await client.query(
      `INSERT INTO database_import_runs (source_file, source_years, status, message)
       VALUES ($1, $2, 'running', $3)
       RETURNING id`,
      [
        options.sourceFile,
        options.sourceYearsLabel || ALL_YEARS_LABEL,
        `${options.modeLabel || 'Product import'} started`,
      ]
    );
    runId = run.rows[0].id;

    await client.query('BEGIN');
    transactionStarted = true;

    if (options.replaceExisting) {
      console.log('[database-import] Replacing existing product rows');
      await client.query('DELETE FROM database_products');
    }

    console.log(`[database-import] Writing ${productRows.length} products`);
    const productWrite = await writeRows(
      client,
      'database_products',
      PRODUCT_COLUMNS,
      'source_product_id',
      productRows,
      { conflictAction: options.insertOnly ? 'ignore' : 'update' }
    );

    await client.query('COMMIT');

    await client.query(
      `UPDATE database_import_runs
       SET product_count = $1,
           finished_at = NOW(),
           status = 'complete',
           message = $2
       WHERE id = $3`,
      [
        options.insertOnly ? productWrite.affected : productRows.length,
        options.insertOnly
          ? options.insertOnlyMessage
          : options.replaceExisting
            ? options.replaceMessage
            : options.appendMessage,
        runId,
      ]
    );

    console.log('[database-import] Product import complete');
  } catch (err) {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Ignore rollback errors after a pre-transaction failure.
      }
    }

    if (runId) {
      await client.query(
        `UPDATE database_import_runs
         SET finished_at = NOW(), status = 'failed', message = $1
         WHERE id = $2`,
        [err.message, runId]
      );
    }

    throw err;
  } finally {
    if (!options.client) {
      client.release();
      await pool.end();
    }
  }
}

async function fetchExistingOrderProductIds(client) {
  const result = await client.query(`
    SELECT DISTINCT source_product_id
    FROM database_job_line_items
    WHERE source_product_id IS NOT NULL
    ORDER BY source_product_id
  `);

  return result.rows
    .map((row) => toInt(row.source_product_id))
    .filter((productId) => productId !== null);
}

async function writeRows(client, table, columns, conflictColumn, rows, options = {}) {
  if (!rows.length) return { attempted: 0, affected: 0 };

  const conflictAction = options.conflictAction || 'update';

  const updates = columns
    .filter((column) => column !== conflictColumn)
    .map((column) => `${column} = EXCLUDED.${column}`);
  updates.push('imported_at = NOW()');

  let affected = 0;

  for (let start = 0; start < rows.length; start += INSERT_BATCH_SIZE) {
    const batch = rows.slice(start, start + INSERT_BATCH_SIZE);
    const values = [];
    const rowPlaceholders = batch.map((row, rowIndex) => {
      const fields = columns.map((column, columnIndex) => {
        values.push(row[column]);
        return `$${(rowIndex * columns.length) + columnIndex + 1}`;
      });
      return `(${fields.join(', ')})`;
    });

    const conflictSql = conflictAction === 'ignore'
      ? `ON CONFLICT (${conflictColumn}) DO NOTHING`
      : `ON CONFLICT (${conflictColumn}) DO UPDATE
      SET ${updates.join(', ')}`;

    const sql = `
      INSERT INTO ${table} (${columns.join(', ')})
      VALUES ${rowPlaceholders.join(', ')}
      ${conflictSql}
    `;

    const result = await client.query(sql, values);
    affected += result.rowCount;

    const count = Math.min(start + batch.length, rows.length);
    const inserted = conflictAction === 'ignore' ? ` (${affected} inserted)` : '';
    console.log(`[database-import] ${table}: ${count}/${rows.length}${inserted}`);
  }

  return { attempted: rows.length, affected };
}

async function fetchDashboardJobFieldSnapshot(client) {
  const result = await client.query(`
    SELECT source_order_id, ${DASHBOARD_JOB_FIELD_COLUMNS.join(', ')}
    FROM database_jobs
    WHERE dashboard_status IS NOT NULL
       OR dashboard_priority IS NOT NULL
       OR dashboard_type IS NOT NULL
       OR proof_approved IS NOT NULL
       OR proof_approved_at IS NOT NULL
       OR dashboard_status_updated_at IS NOT NULL
  `);
  return result.rows;
}

async function restoreDashboardJobFieldSnapshot(client, rows) {
  if (!rows.length) return;

  const columns = ['source_order_id', ...DASHBOARD_JOB_FIELD_COLUMNS];
  const casts = {
    source_order_id: '::int',
    dashboard_status: '::text',
    dashboard_priority: '::text',
    dashboard_type: '::text',
    proof_approved: '::boolean',
    proof_approved_at: '::timestamp',
    dashboard_status_updated_at: '::timestamp',
  };

  for (let start = 0; start < rows.length; start += INSERT_BATCH_SIZE) {
    const batch = rows.slice(start, start + INSERT_BATCH_SIZE);
    const values = [];
    const rowPlaceholders = batch.map((row, rowIndex) => {
      const fields = columns.map((column, columnIndex) => {
        values.push(row[column]);
        return `$${(rowIndex * columns.length) + columnIndex + 1}${casts[column] || ''}`;
      });
      return `(${fields.join(', ')})`;
    });

    const setSql = DASHBOARD_JOB_FIELD_COLUMNS
      .map((column) => `${column} = updates.${column}`)
      .join(', ');

    await client.query(
      `UPDATE database_jobs AS jobs
       SET ${setSql}
       FROM (VALUES ${rowPlaceholders.join(', ')})
         AS updates(${columns.join(', ')})
       WHERE jobs.source_order_id = updates.source_order_id`,
      values
    );
  }
}

async function updateJobAddressRows(client, rows) {
  if (!rows.length) return;

  const columns = [
    'source_order_id',
    'invoice_address_id',
    'delivery_address_id',
    'invoice_address',
    'delivery_address',
  ];
  const casts = {
    source_order_id: '::int',
    invoice_address_id: '::int',
    delivery_address_id: '::int',
    invoice_address: '::text',
    delivery_address: '::text',
  };

  for (let start = 0; start < rows.length; start += INSERT_BATCH_SIZE) {
    const batch = rows.slice(start, start + INSERT_BATCH_SIZE);
    const values = [];
    const rowPlaceholders = batch.map((row, rowIndex) => {
      const fields = columns.map((column, columnIndex) => {
        values.push(row[column]);
        return `$${(rowIndex * columns.length) + columnIndex + 1}${casts[column]}`;
      });
      return `(${fields.join(', ')})`;
    });

    const sql = `
      UPDATE database_jobs AS jobs
      SET invoice_address_id = updates.invoice_address_id,
          delivery_address_id = updates.delivery_address_id,
          invoice_address = updates.invoice_address,
          delivery_address = updates.delivery_address
      FROM (VALUES ${rowPlaceholders.join(', ')})
        AS updates(source_order_id, invoice_address_id, delivery_address_id, invoice_address, delivery_address)
      WHERE jobs.source_order_id = updates.source_order_id
    `;

    await client.query(sql, values);

    const count = Math.min(start + batch.length, rows.length);
    console.log(`[database-import] database_jobs address fields: ${count}/${rows.length}`);
  }
}
