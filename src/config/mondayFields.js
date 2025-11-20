// src/config/mondayFields.js
require('dotenv').config();

/**
 * BOARD IDS
 * - Keep your legacy/main board for existing flows (label printer, etc.)
 * - Use a separate board id for the VISUAL REQUESTS flow we’re wiring now.
 */
const BOARD_ID_MAIN   = process.env.BOARD_ID_MAIN   || process.env.BOARD_ID || '';   // legacy fallback
const BOARD_ID_VISUAL = process.env.BOARD_ID_VISUAL || '5082950705';                 // <— set in Railway

// Optional group gate for VISUAL; leave blank to accept all groups.
const GROUP_ID = process.env.GROUP_ID || '';
const DEFAULT_LINEITEM_GROUP_ID =
  process.env.LINEITEM_GROUP_ID ||
  GROUP_ID ||
  '';

/**
 * STATUS COLUMNS
 * - Legacy flow keeps using STATUS_COLUMN_ID (checkbox__1).
 * - VISUAL flow uses STATUS_COLUMN_ID_VISUAL (status / status_1).
 */
const STATUS_COLUMN_ID_LABELPRINTER =
  process.env.STATUS_COLUMN_ID || process.env.STATUS_COLUMN_ID_LABELPRINTER || 'checkbox__1';

const STATUS_COLUMN_ID_VISUAL =
  process.env.STATUS_COLUMN_ID_VISUAL || 'status'; // <— set in Railway if your column id is different

// VISUAL flow columns (ids you provided)
const CUSTOMER_IS_ITEM_NAME = (process.env.CUSTOMER_IS_ITEM_NAME || 'true').toLowerCase() === 'true';

const COLS = {
  STATUS_VISUAL: STATUS_COLUMN_ID_VISUAL,
  CUSTOMER: process.env.CUSTOMER_COLUMN_ID || '', // item name used if blank
  JOB_TITLE: process.env.JOB_TITLE_COLUMN_ID || 'text_mkxe8d9e',
  JOB_NO: process.env.JOB_NO_COLUMN_ID || 'text_mkxj7461',
  JOB_TYPE_STATUS: process.env.JOB_TYPE_STATUS_COLUMN_ID || 'project_status',
  FRONT_POS: process.env.FRONT_POS_COLUMN_ID || 'dropdown_mkxjdz5d',
  BACK_POS: process.env.BACK_POS_COLUMN_ID || 'dropdown_mkxjv15t',
  GARMENT_COLOR: process.env.GARMENT_COLOR_COLUMN_ID || 'dropdown_mkxjed3a',
  FRONT_ART: process.env.FRONT_ART_COLUMN_ID || 'file_mkxjg8eh',
  BACK_ART: process.env.BACK_ART_COLUMN_ID || 'file_mkxj6djb',
  FINISHED_VISUAL: process.env.FINISHED_VISUAL_COLUMN_ID || 'file_mkxjpxfp',

  // keep legacy id available for other routes
  STATUS_LABELPRINTER: STATUS_COLUMN_ID_LABELPRINTER,
};

const SUBITEM_COLS = {
  CODE: process.env.SUBITEM_CODE_COLUMN_ID || '',
  SIZE: process.env.SUBITEM_SIZE_COLUMN_ID || '',
  COLOUR: process.env.SUBITEM_COLOUR_COLUMN_ID || '',
  QTY: process.env.SUBITEM_QTY_COLUMN_ID || '',
};

module.exports = {
  // board ids
  BOARD_ID_MAIN,
  BOARD_ID_VISUAL,

  // group & columns
  GROUP_ID,
  DEFAULT_LINEITEM_GROUP_ID,
  COLS,
  SUBITEM_COLS,
  CUSTOMER_IS_ITEM_NAME,

  // explicit status ids
  STATUS_COLUMN_ID_LABELPRINTER,
  STATUS_COLUMN_ID_VISUAL,
};
