// src/config/mondayFields.js
require('dotenv').config();

module.exports = {
  BOARD_ID: process.env.BOARD_ID,
  GROUP_ID: process.env.GROUP_ID || null, // if set, only process this group
  COLS: {
    STATUS: process.env.STATUS_COLUMN_ID,
    JOB_TITLE: process.env.JOB_TITLE_COLUMN_ID,
    JOB_NO: process.env.JOB_NO_COLUMN_ID,
    FRONT_POS: process.env.FRONT_POS_COLUMN_ID,
    BACK_POS: process.env.BACK_POS_COLUMN_ID,
    FRONT_ART: process.env.FRONT_ART_COLUMN_ID,
    BACK_ART: process.env.BACK_ART_COLUMN_ID,
    FINISHED_VISUAL: process.env.FINISHED_VISUAL_COLUMN_ID,
    GARMENT_COLOR: process.env.GARMENT_COLOR_COLUMN_ID, // new
  },
  CUSTOMER_IS_ITEM_NAME: true,
};
