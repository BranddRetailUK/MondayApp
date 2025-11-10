// src/config/mondayFields.js
require('dotenv').config();

module.exports = {
  BOARD_ID: process.env.BOARD_ID,
  COLS: {
    STATUS: process.env.STATUS_COLUMN_ID,
    JOB_TITLE: process.env.JOB_TITLE_COLUMN_ID,
    JOB_NO: process.env.JOB_NO_COLUMN_ID,
    FRONT_POS: process.env.FRONT_POS_COLUMN_ID,
    BACK_POS: process.env.BACK_POS_COLUMN_ID,
    FRONT_ART: process.env.FRONT_ART_COLUMN_ID,
    BACK_ART: process.env.BACK_ART_COLUMN_ID,
    FINISHED_VISUAL: process.env.FINISHED_VISUAL_COLUMN_ID,
  },
  CUSTOMER_IS_ITEM_NAME: true,
};
