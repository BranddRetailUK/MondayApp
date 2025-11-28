const path = require('path');
const { JOB_FILES_COLUMN_ID, FINISHED_VISUAL_COLUMN_ID } = require('../config/env');
const { COLS } = require('../config/mondayFields');
const { postUpdate, getItemWithColumns } = require('./mondayClient');
const { parseFileColumn, downloadAsset } = require('./mondayAssets');
const { bufferToDataUrl, runVisionCompare } = require('./openAiVision');

const SIDE_FRONT = 'front';
const SIDE_BACK = 'back';

function pickProofFiles(item, side) {
  const columnValues = item?.column_values || [];
  const byId = {};
  for (const c of columnValues) byId[c.id] = c;

  const finishedId = FINISHED_VISUAL_COLUMN_ID || COLS.FINISHED_VISUAL;
  const finishedFiles = parseFileColumn(byId[finishedId]?.value);
  const frontFiles = parseFileColumn(byId[COLS.FRONT_ART]?.value);
  const backFiles = parseFileColumn(byId[COLS.BACK_ART]?.value);

  if (finishedFiles.length) {
    // Assume page 1 = front, page 2 = back when PDFs are used
    if (side === SIDE_BACK && finishedFiles[1]) return finishedFiles[1];
    return finishedFiles[0];
  }
  if (side === SIDE_BACK && backFiles.length) return backFiles[0];
  if (side === SIDE_FRONT && frontFiles.length) return frontFiles[0];
  // Fallback to any file
  return finishedFiles[0] || frontFiles[0] || backFiles[0] || null;
}

function pickLatestJobFile(item, uploadedFilename) {
  if (!JOB_FILES_COLUMN_ID) return null;
  const columnValues = item?.column_values || [];
  const files = parseFileColumn(columnValues.find(c => c.id === JOB_FILES_COLUMN_ID)?.value);
  if (!files.length) return null;
  if (uploadedFilename) {
    const match = files.find(f => f.name === uploadedFilename);
    if (match) return match;
  }
  return files[files.length - 1];
}

function inferMimeType(filename) {
  const ext = String(path.extname(filename || '')).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.pdf') return 'application/pdf';
  return 'application/octet-stream';
}

async function prepareDataUrls({ capturedFile, proofFile }) {
  const capturedBuf = await downloadAsset(capturedFile.assetId);
  const proofBuf = await downloadAsset(proofFile.assetId);

  const capturedMime = inferMimeType(capturedFile.name);
  const proofMime = inferMimeType(proofFile.name);

  const capturedDataUrl = bufferToDataUrl(capturedBuf, capturedMime);
  const proofDataUrl = bufferToDataUrl(proofBuf, proofMime);

  return { capturedDataUrl, proofDataUrl };
}

async function analyzeItemSide({ itemId, side = SIDE_FRONT, uploadedFilename = null }) {
  const item = await getItemWithColumns(itemId);
  if (!item) throw new Error('Item not found for analysis');

  const proofFile = pickProofFiles(item, side);
  if (!proofFile?.assetId) throw new Error('No proof/visual found for analysis');

  const capturedFile = pickLatestJobFile(item, uploadedFilename);
  if (!capturedFile?.assetId) throw new Error('No captured file found to compare');

  const { capturedDataUrl, proofDataUrl } = await prepareDataUrls({ capturedFile, proofFile });

  const context = {
    side,
    jobTitle: item.name || '',
    jobNo: (item.column_values || []).find(c => c.id === COLS.JOB_NO)?.text || '',
    garmentColour: (item.column_values || []).find(c => c.id === COLS.GARMENT_COLOR)?.text || ''
  };

  const { parsed } = await runVisionCompare({ capturedDataUrl, proofDataUrl, context });

  const summaryLines = [
    parsed.ok ? '✅ Visual matches' : '⚠️ Differences found',
    `Confidence: ${Math.round(parsed.confidence || 0)}%`,
    parsed.summary || ''
  ].filter(Boolean);

  if (parsed.findings?.length) {
    summaryLines.push('Findings:');
    for (const f of parsed.findings) summaryLines.push(`• ${f}`);
  }

  const body = summaryLines.join('<br>');
  await postUpdate(itemId, body);

  return parsed;
}

module.exports = {
  analyzeItemSide,
  SIDE_FRONT,
  SIDE_BACK,
};
