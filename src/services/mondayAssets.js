const axios = require('axios');
const { MONDAY_API_TOKEN, FINISHED_VISUAL_COLUMN_ID } = require('../config/env');
const { getItemWithColumns } = require('./mondayClient');

const MONDAY_API_URL = 'https://api.monday.com/v2';

function parseFileColumn(value) {
  if (!value) return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    const files = parsed?.files || [];
    return Array.isArray(files) ? files : [];
  } catch (_) {
    return [];
  }
}

async function getAssetPublicUrl(assetId) {
  const query = `
    query ($ids: [ID!]!) {
      assets (ids: $ids) { id public_url url }
    }
  `;
  const { data } = await axios.post(
    MONDAY_API_URL,
    { query, variables: { ids: [assetId] } },
    {
      headers: {
        Authorization: MONDAY_API_TOKEN,
        'Content-Type': 'application/json'
      }
    }
  );
  if (data?.errors) {
    const msg = data.errors.map(e => e.message || e).join('; ');
    throw new Error(`Failed to fetch asset url: ${msg}`);
  }
  const asset = data?.data?.assets?.[0];
  if (!asset?.public_url && !asset?.url) {
    console.warn('[mondayAssets] asset has no url/public_url', { assetId });
  }
  return {
    publicUrl: asset?.public_url || null,
    signedUrl: asset?.url || null
  };
}

async function downloadAsset(assetId) {
  const { publicUrl, signedUrl } = await getAssetPublicUrl(assetId);
  const url = publicUrl || signedUrl;
  if (!url) throw new Error('Asset URL missing');

  const headers = {};
  if (!publicUrl && MONDAY_API_TOKEN && /monday\.com/i.test(url)) {
    headers.Authorization = MONDAY_API_TOKEN;
    console.log('[mondayAssets] downloading with auth header for asset', assetId);
  } else {
    console.log('[mondayAssets] downloading asset', { assetId, public: Boolean(publicUrl) });
  }

  const { data } = await axios.get(url, { responseType: 'arraybuffer', headers });
  return Buffer.from(data);
}

async function fetchItemWithFiles(itemId) {
  return getItemWithColumns(itemId);
}

function pickFinishedVisualColumnId(fallbackId) {
  return FINISHED_VISUAL_COLUMN_ID || fallbackId;
}

module.exports = {
  parseFileColumn,
  getAssetPublicUrl,
  downloadAsset,
  fetchItemWithFiles,
  pickFinishedVisualColumnId
};
