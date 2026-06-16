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
const IMPORT_YEARS = new Set([2025, 2026]);
const INSERT_BATCH_SIZE = 250;
const MDB_EXPORT_BIN = resolveMdbExportBin();
const ADDRESS_SOURCE_TABLES = ['tblOrder', 'tblCustomer', 'tblAddress', 'tblContact'];

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

const LINE_COLUMNS = [
  'source_order_item_id', 'source_order_id', 'source_product_id',
  'supplier_order_id', 'line_description', 'quantity', 'unit_price',
  'unit_cost', 'vat_rate', 'is_non_deliverable', 'is_internal',
  'supplier_name', 'style_id', 'style_code', 'alt_style_code',
  'style_name', 'colour', 'size', 'product_type', 'stock',
  'is_product_active', 'trace_staff_id', 'created_at_source',
  'updated_at_source',
];

const POSITION_COLUMNS = [
  'source_order_position_id', 'source_order_id', 'position_name',
  'colour_notes', 'design_ref', 'trace_staff_id', 'created_at_source',
  'updated_at_source',
];

const ADDRESS_COLUMNS = [
  'source_address_id', 'customer_id', 'address_type', 'address_line1',
  'address_line2', 'address_line3', 'address_line4', 'address_line5',
  'postcode', 'phone', 'fax', 'mobile', 'trace_staff_id',
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
  const addressesOnly = args.includes('--addresses-only');
  const fileArg = args.find((arg) => !arg.startsWith('--')) || 'PS_XP_tab.mdb';
  const mdbPath = path.resolve(process.cwd(), fileArg);

  if (!fs.existsSync(mdbPath)) {
    throw new Error(`MDB file not found: ${mdbPath}`);
  }

  console.log(`[database-import] Reading ${mdbPath}`);
  const data = readSourceData(mdbPath, addressesOnly ? ADDRESS_SOURCE_TABLES : Object.keys(TABLE_COLUMNS));
  const snapshot = addressesOnly ? buildAddressSnapshot(data) : buildSnapshot(data);

  console.log(
    `[database-import] Snapshot: ${snapshot.jobs.length} jobs, ` +
    `${snapshot.lineItems.length} line items, ${snapshot.positions.length} positions, ` +
    `${snapshot.addresses.length} customer addresses`
  );
  if (addressesOnly) {
    console.log(`[database-import] Address-only mode: ${snapshot.jobAddressUpdates.length} existing job address rows prepared`);
  }
  console.log(`[database-import] Years: ${[...IMPORT_YEARS].join(', ')}`);

  if (dryRun) {
    printDryRun(snapshot);
    return;
  }

  await importSnapshot(snapshot, {
    sourceFile: mdbPath,
    replaceExisting: !append,
    addressesOnly,
  });
}

function printHelp() {
  console.log(`Usage: node scripts/import-database-mdb.js [PS_XP_tab.mdb] [--dry-run] [--append]

Imports Access jobs dated 2025 or 2026 into Railway/Postgres tables:
  database_jobs
  database_job_line_items
  database_job_positions
  database_customer_addresses

Options:
  --addresses-only  Import only customer addresses and job address fields.

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

function buildSnapshot(data) {
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
    if (!sourceYear) continue;

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

  const lineItems = data.tblOrderItem
    .filter((item) => selectedOrderIds.has(toInt(item.orderid)))
    .map((item) => {
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
        source_order_id: toInt(item.orderid),
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

  const positions = data.tblOrderPosition
    .filter((position) => selectedOrderIds.has(toInt(position.orderid)))
    .map((position) => ({
      source_order_position_id: toInt(position.orderpositionid),
      source_order_id: toInt(position.orderid),
      position_name: cleanText(position.sposition),
      colour_notes: cleanText(position.memcolour),
      design_ref: cleanText(position.sdesign),
      trace_staff_id: toInt(position.tracestaffid),
      created_at_source: toTimestamp(position.dtcreate),
      updated_at_source: toTimestamp(position.dtedit),
    }));

  const addressRoles = buildAddressRoleMap(data, selectedOrderIds, selectedCustomerIds);
  const customerAddresses = buildCustomerAddressRows(
    data.tblAddress,
    selectedCustomerIds,
    selectedAddressIds,
    addressRoles
  );

  jobs.sort((a, b) => {
    const dateA = a.order_date || a.created_at_source || '';
    const dateB = b.order_date || b.created_at_source || '';
    return dateA < dateB ? 1 : dateA > dateB ? -1 : b.order_no - a.order_no;
  });

  return { jobs, lineItems, positions, addresses: customerAddresses };
}

function buildAddressSnapshot(data) {
  const customers = mapByInt(data.tblCustomer, 'customerid');
  const addresses = mapByInt(data.tblAddress, 'addressid');
  const contacts = mapByInt(data.tblContact, 'contactid');
  const selectedOrderIds = new Set();
  const selectedCustomerIds = new Set();
  const selectedAddressIds = new Set();
  const jobAddressUpdates = [];

  for (const order of data.tblOrder) {
    const sourceYear = sourceYearForOrder(order);
    if (!sourceYear) continue;

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
    jobAddressUpdates,
  };
}

function sourceYearForOrder(order) {
  const sourceDate = order.dtorder || order.dtcreate;
  if (!sourceDate || sourceDate.length < 4) return null;
  const year = Number.parseInt(sourceDate.slice(0, 4), 10);
  return IMPORT_YEARS.has(year) ? year : null;
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

function printDryRun(snapshot) {
  const byYear = snapshot.jobs.reduce((acc, job) => {
    acc[job.source_year] = (acc[job.source_year] || 0) + 1;
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
      [options.sourceFile, [...IMPORT_YEARS].join(',')]
    );
    runId = run.rows[0].id;

    await client.query('BEGIN');

    if (options.addressesOnly) {
      console.log('[database-import] Address-only import: replacing customer address rows');
      await client.query('DELETE FROM database_customer_addresses');

      console.log(`[database-import] Writing ${snapshot.addresses.length} customer addresses`);
      await upsertRows(
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

    if (options.replaceExisting) {
      console.log('[database-import] Replacing existing database snapshot');
      await client.query('DELETE FROM database_job_positions');
      await client.query('DELETE FROM database_job_line_items');
      await client.query('DELETE FROM database_jobs');
      await client.query('DELETE FROM database_customer_addresses');
    }

    console.log(`[database-import] Writing ${snapshot.addresses.length} customer addresses`);
    await upsertRows(
      client,
      'database_customer_addresses',
      ADDRESS_COLUMNS,
      'source_address_id',
      snapshot.addresses
    );

    console.log(`[database-import] Writing ${snapshot.jobs.length} jobs`);
    await upsertRows(client, 'database_jobs', JOB_COLUMNS, 'source_order_id', snapshot.jobs);

    console.log(`[database-import] Writing ${snapshot.lineItems.length} line items`);
    await upsertRows(
      client,
      'database_job_line_items',
      LINE_COLUMNS,
      'source_order_item_id',
      snapshot.lineItems
    );

    console.log(`[database-import] Writing ${snapshot.positions.length} positions`);
    await upsertRows(
      client,
      'database_job_positions',
      POSITION_COLUMNS,
      'source_order_position_id',
      snapshot.positions
    );

    await client.query('COMMIT');

    await client.query(
      `UPDATE database_import_runs
       SET job_count = $1,
           line_item_count = $2,
           position_count = $3,
           address_count = $4,
           finished_at = NOW(),
           status = 'complete',
           message = $5
       WHERE id = $6`,
      [
        snapshot.jobs.length,
        snapshot.lineItems.length,
        snapshot.positions.length,
        snapshot.addresses.length,
        options.replaceExisting ? 'Snapshot replaced' : 'Snapshot appended/upserted',
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

async function upsertRows(client, table, columns, conflictColumn, rows) {
  if (!rows.length) return;

  const updates = columns
    .filter((column) => column !== conflictColumn)
    .map((column) => `${column} = EXCLUDED.${column}`);
  updates.push('imported_at = NOW()');

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

    const sql = `
      INSERT INTO ${table} (${columns.join(', ')})
      VALUES ${rowPlaceholders.join(', ')}
      ON CONFLICT (${conflictColumn}) DO UPDATE
      SET ${updates.join(', ')}
    `;

    await client.query(sql, values);

    const count = Math.min(start + batch.length, rows.length);
    console.log(`[database-import] ${table}: ${count}/${rows.length}`);
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
