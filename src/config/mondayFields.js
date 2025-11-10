// src/config/mondayFields.js
require('dotenv').config();

const BOARD_ID = process.env.BOARD_ID || '5082950705';
const GROUP_ID = process.env.GROUP_ID || ''; // optional gate

// Two distinct status columns so you don't stomp the label-printer flow
const STATUS_COLUMN_ID_LABELPRINTER = process.env.STATUS_COLUMN_ID || process.env.STATUS_COLUMN_ID_LABELPRINTER || 'checkbox__1';
const STATUS_COLUMN_ID_VISUAL       = process.env.STATUS_COLUMN_ID_VISUAL || 'status'; // <-- set this in Railway

// Other columns for the VISUAL flow
const CUSTOMER_IS_ITEM_NAME = (process.env.CUSTOMER_IS_ITEM_NAME || 'true').toLowerCase() === 'true';

// IDs you gave me
const COLS = {
  // VISUAL flow columns
  STATUS_VISUAL: process.env.STATUS_COLUMN_ID_VISUAL || 'status',
  CUSTOMER: process.env.CUSTOMER_COLUMN_ID || '', // item name is used if empty
  JOB_TITLE: process.env.JOB_TITLE_COLUMN_ID || 'text_mkxe8d9e',
  JOB_NO: process.env.JOB_NO_COLUMN_ID || 'text_mkxj7461',
  FRONT_POS: process.env.FRONT_POS_COLUMN_ID || 'dropdown_mkxjdz5d',
  BACK_POS: process.env.BACK_POS_COLUMN_ID || 'dropdown_mkxjv15t',
  GARMENT_COLOR: process.env.GARMENT_COLOR_COLUMN_ID || 'dropdown_mkxjed3a',
  FRONT_ART: process.env.FRONT_ART_COLUMN_ID || 'file_mkxjg8eh',
  BACK_ART: process.env.BACK_ART_COLUMN_ID || 'file_mkxj6djb',
  FINISHED_VISUAL: process.env.FINISHED_VISUAL_COLUMN_ID || 'file_mkxjpxfp',

  // Keep the legacy/label-printer status id available (not used by this route)
  STATUS_LABELPRINTER: STATUS_COLUMN_ID_LABELPRINTER,
};

module.exports = {
  BOARD_ID,
  GROUP_ID,
  COLS,
  CUSTOMER_IS_ITEM_NAME,
  STATUS_COLUMN_ID_LABELPRINTER,
  STATUS_COLUMN_ID_VISUAL,
};
