// seed-garment-colours.js
require('dotenv').config();

const garmentColours = require('./visual generator/VisualJobs/garment-colors.json');

const MONDAY_API_URL = 'https://api.monday.com/v2';
const MONDAY_API_TOKEN = process.env.MONDAY_API_TOKEN;

async function main() {
  if (!MONDAY_API_TOKEN) {
    throw new Error('Missing MONDAY_API_TOKEN');
  }

  const boardId = process.env.BOARD_ID_VISUAL;
  const itemId = process.env.GARMENT_COLOUR_SEED_ITEM_ID;
  const columnId =
    process.env.GARMENT_COLOUR_COLUMN_ID || process.env.GARMENT_COLOR_COLUMN_ID;

  if (!boardId || !itemId || !columnId) {
    throw new Error(
      'Missing BOARD_ID_VISUAL, GARMENT_COLOUR_SEED_ITEM_ID or GARMENT_COLOUR_COLUMN_ID/GARMENT_COLOR_COLUMN_ID'
    );
  }

  const labels = Object.keys(garmentColours);
  const valueString = labels.join(',');

  const query = `
    mutation SeedGarmentColours(
      $boardId: ID!,
      $itemId: ID!,
      $columnId: String!,
      $value: String!
    ) {
      change_simple_column_value(
        board_id: $boardId,
        item_id: $itemId,
        column_id: $columnId,
        value: $value,
        create_labels_if_missing: true
      ) {
        id
      }
    }
  `;

  const variables = {
    boardId,
    itemId,
    columnId,
    value: valueString
  };

  // Use Node 20+ global fetch
  const res = await fetch(MONDAY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: MONDAY_API_TOKEN
    },
    body: JSON.stringify({ query, variables })
  });

  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));

  if (data.errors) {
    throw new Error('Monday API error');
  }

  console.log(`Seeded ${labels.length} garment colours into dropdown '${columnId}'.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
