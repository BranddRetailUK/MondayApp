const TEST_DASHBOARD_BOARD_ID = 'test-dashboard';

const TEST_DASHBOARD_GROUPS = [
  { id: 'group_mkv26kq5', title: 'HOLD', color: '#bb3354', position: 16224, sort_order: 1 },
  { id: 'group_mktt87mj', title: 'TO SAMPLE', color: '#9cd326', position: 24336, sort_order: 2 },
  { id: 'new_group_mkmdezbp', title: 'OFFICE', color: '#df2f4a', position: 39234.625, sort_order: 3 },
  { id: 'new_group56764__1', title: 'PRE-PRODUCTION', color: '#00c875', position: 46021.25, sort_order: 4 },
  { id: 'new_group_mkn87dd6', title: 'PRINT', color: '#ffcb00', position: 59482.5, sort_order: 5 },
  { id: 'new_group_mkn8fssp', title: 'EMBROIDERY', color: '#ff642e', position: 104348, sort_order: 6 },
  { id: 'new_group43041', title: 'COMPLETED', color: '#00c875', position: 114592, sort_order: 7 },
];

const TEST_DASHBOARD_GROUP_IDS = Object.freeze({
  HOLD: 'group_mkv26kq5',
  TO_SAMPLE: 'group_mktt87mj',
  OFFICE: 'new_group_mkmdezbp',
  PRE_PRODUCTION: 'new_group56764__1',
  PRINT: 'new_group_mkn87dd6',
  EMBROIDERY: 'new_group_mkn8fssp',
  COMPLETED: 'new_group43041',
});

const STATUS_SETTINGS = {
  labels: {
    0: 'NO STOCK',
    1: 'HOLD',
    2: 'IN PRODUCTION',
    3: 'INVOICED',
    4: 'PRE-PRODUCTION',
    5: 'AWAITING APPROVAL',
    6: 'TO SAMPLE',
    7: 'SAMPLED',
    8: 'READY TO PRINT',
    9: 'TRANSFER PRINTING',
    10: 'STOCK ORDERED',
    11: 'PART-STOCK',
    12: 'COMPLETED',
    13: 'CHECKED IN',
    14: 'SUPPLIED CLOTHING',
    15: 'STOCK IN',
  },
  labels_colors: {
    0: { color: '#ff6d3b', border: '#e05828', var_name: 'dark-orange' },
    1: { color: '#bb3354', border: '#a42d4a', var_name: 'dark-red' },
    2: { color: '#cab641', border: '#c0ab31', var_name: 'mustered' },
    3: { color: '#ff007f', border: '#e01279', var_name: 'dark-pink' },
    4: { color: '#401694', border: '#401694', var_name: 'dark_indigo' },
    5: { color: '#c4c4c4', border: '#b0b0b0', var_name: 'grey' },
    6: { color: '#9cd326', border: '#89b921', var_name: 'lime-green' },
    7: { color: '#579bfc', border: '#4387e8', var_name: 'bright-blue' },
    8: { color: '#037f4c', border: '#006b38', var_name: 'grass-green' },
    9: { color: '#5559df', border: '#5559df', var_name: 'indigo' },
    10: { color: '#216edf', border: '#216edf', var_name: 'sky' },
    11: { color: '#df2f4a', border: '#ce3048', var_name: 'red-shadow' },
    12: { color: '#00c875', border: '#00b461', var_name: 'green-shadow' },
    13: { color: '#ff5ac4', border: '#e04fac', var_name: 'light-pink' },
    14: { color: '#007eb5', border: '#3db0df', var_name: 'blue-links' },
    15: { color: '#4eccc6', border: '#4eccc6', var_name: 'australia' },
  },
};

const PRIORITY_SETTINGS = {
  labels: {
    0: 'Medium',
    2: 'Low',
    3: 'Critical',
    4: 'High',
  },
  labels_colors: {
    0: { color: '#ffcb00', border: '#c0ab1b', var_name: 'yellow' },
    2: { color: '#00c875', border: '#00b461', var_name: 'green-shadow' },
    3: { color: '#bb3354', border: '#a42d4a', var_name: 'dark-red' },
    4: { color: '#df2f4a', border: '#ce3048', var_name: 'red-shadow' },
  },
};

const TYPE_SETTINGS = {
  labels: {
    0: 'EMB',
    1: 'EMB / PRINT',
    2: 'HOLD',
    3: 'PRINT',
    4: 'PRINTED TRANSFER',
    5: '',
    6: 'UV PRINT',
  },
  labels_colors: {
    0: { color: '#ff7575', border: '#ff7575', var_name: 'sunset' },
    1: { color: '#9d50dd', border: '#9238af', var_name: 'purple' },
    2: { color: '#df2f4a', border: '#ce3048', var_name: 'red-shadow' },
    3: { color: '#fdab3d', border: '#e99729', var_name: 'orange' },
    4: { color: '#4eccc6', border: '#4eccc6', var_name: 'australia' },
    5: { color: '#c4c4c4', border: '#b0b0b0', var_name: 'grey' },
    6: { color: '#ff007f', border: '#e01279', var_name: 'dark-pink' },
  },
};

const TEST_DASHBOARD_COLUMNS = [
  { id: 'name', title: 'Name', type: 'name', settings_str: '', position: 1 },
  { id: 'subitems__1', title: 'Subitems', type: 'subtasks', settings_str: '', position: 2 },
  { id: 'priority_mkn8p46c', title: 'PRIORITY', type: 'status', settings_str: JSON.stringify(PRIORITY_SETTINGS), position: 3 },
  { id: 'checkbox1__1', title: 'JOB ✔', type: 'checkbox', settings_str: '', position: 4 },
  { id: 'date_mksx422k', title: 'DATE', type: 'date', settings_str: '', position: 5 },
  { id: 'checkbox_mkm9ah5x', title: 'TRANS', type: 'checkbox', settings_str: '', position: 6 },
  { id: 'checkbox_mkm99bjn', title: 'JAQ', type: 'checkbox', settings_str: '', position: 7 },
  { id: 'file_mky43tg9', title: 'PROOF', type: 'file', settings_str: '', position: 8 },
  { id: 'label__1', title: 'STATUS', type: 'status', settings_str: JSON.stringify(STATUS_SETTINGS), position: 9 },
  { id: 'project_status', title: 'TYPE', type: 'status', settings_str: JSON.stringify(TYPE_SETTINGS), position: 10 },
  { id: 'text_mkmesygk', title: 'DES/PSG', type: 'text', settings_str: '', position: 11 },
  { id: 'text9', title: 'NOTES', type: 'text', settings_str: '', position: 12 },
  { id: 'files_1', title: 'FILES', type: 'file', settings_str: '', position: 13 },
  { id: 'file_mky4xna4', title: 'IMAGE', type: 'file', settings_str: '', position: 14 },
  { id: 'checkbox__1', title: 'CHECKED IN', type: 'checkbox', settings_str: '', position: 15 },
  { id: 'project_owner', title: 'JOB OWNER', type: 'people', settings_str: '', position: 16 },
  { id: 'timerange_mm3taege', title: 'START/END', type: 'timeline', settings_str: '', position: 17 },
];

const TEST_DASHBOARD_SUBITEM_COLUMNS = [
  { id: 'name', title: 'Name', type: 'name', settings_str: '', position: 1 },
  { id: 'text_mkxewsew', title: 'SIZE', type: 'text', settings_str: '', position: 2 },
  { id: 'text_mkr31cjs', title: 'QTY', type: 'text', settings_str: '', position: 3 },
  { id: 'text_mkvdj3cd', title: 'CODE', type: 'text', settings_str: '', position: 4 },
  { id: 'text_mkxdv9nk', title: 'COLOUR', type: 'text', settings_str: '', position: 5 },
  { id: 'boolean_mkxwf1e1', title: 'CHECK IN', type: 'checkbox', settings_str: '', position: 6 },
  { id: 'text_mky2xarj', title: 'Text', type: 'text', settings_str: '', position: 7 },
];

const TEST_DASHBOARD_COLUMN_IDS = Object.freeze({
  PRIORITY: 'priority_mkn8p46c',
  JOB: 'checkbox1__1',
  DATE: 'date_mksx422k',
  TRANS: 'checkbox_mkm9ah5x',
  JAQ: 'checkbox_mkm99bjn',
  PROOF: 'file_mky43tg9',
  STATUS: 'label__1',
  TYPE: 'project_status',
  DESIGN: 'text_mkmesygk',
  NOTES: 'text9',
  FILES: 'files_1',
  IMAGE: 'file_mky4xna4',
  CHECKED_IN: 'checkbox__1',
  JOB_OWNER: 'project_owner',
});

function normalizeColumnTitle(title) {
  return String(title || '').trim().replace(/\s+/g, ' ').toUpperCase();
}

function columnSlug(column) {
  const title = normalizeColumnTitle(column?.title || column?.column_title || column?.id || 'file').toLowerCase();
  if (title === 'proof') return 'proof';
  if (title === 'files' || title === 'file') return 'files';
  if (title === 'image' || title === 'images') return 'image';
  return title.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'file';
}

module.exports = {
  TEST_DASHBOARD_BOARD_ID,
  TEST_DASHBOARD_GROUPS,
  TEST_DASHBOARD_GROUP_IDS,
  TEST_DASHBOARD_COLUMNS,
  TEST_DASHBOARD_SUBITEM_COLUMNS,
  TEST_DASHBOARD_COLUMN_IDS,
  STATUS_SETTINGS,
  PRIORITY_SETTINGS,
  TYPE_SETTINGS,
  normalizeColumnTitle,
  columnSlug,
};
