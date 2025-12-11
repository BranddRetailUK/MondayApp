const path = require('path');
const { JOB_FILES_COLUMN_ID, FINISHED_VISUAL_COLUMN_ID } = require('../config/env');
const { COLS } = require('../config/mondayFields');
const { postUpdate, getItemWithColumns } = require('./mondayClient');
const { parseFileColumn, downloadAsset } = require('./mondayAssets');
const { bufferToDataUrl, runVisionCompare } = require('./openAiVision');

const SIDE_FRONT = 'front';
const SIDE_BACK = 'back';

function pickProofFiles(item, side, jobFiles = [], finishedFilesOverride = null) {
  const columnValues = item?.column_values || [];
  const byId = {};
  for (const c of columnValues) byId[c.id] = c;

  const finishedId = FINISHED_VISUAL_COLUMN_ID || COLS.FINISHED_VISUAL;
  const finishedFiles = finishedFilesOverride ?? parseFileColumn(byId[finishedId]?.value);
  const frontFiles = parseFileColumn(byId[COLS.FRONT_ART]?.value);
  const backFiles = parseFileColumn(byId[COLS.BACK_ART]?.value);

  // Preferred: finished visual column
  if (finishedFiles.length) {
    // Assume page 1 = front, page 2 = back when PDFs are used
    if (side === SIDE_BACK && finishedFiles[1]) return finishedFiles[1];
    return finishedFiles[0];
  }

  // Next: side-specific art columns
  if (side === SIDE_BACK && backFiles.length) return backFiles[0];
  if (side === SIDE_FRONT && frontFiles.length) return frontFiles[0];

  // Fallback: any art
  if (frontFiles.length) return frontFiles[0];
  if (backFiles.length) return backFiles[0];

  // Last resort: a job file (oldest) if nothing else exists
  if (jobFiles.length) return jobFiles[0];

  return null;
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

async function resolveFilesForSide({ itemId, side = SIDE_FRONT, uploadedFilename = null }) {
  const item = await getItemWithColumns(itemId);
  if (!item) throw new Error('Item not found for analysis');

  const columnValues = item?.column_values || [];
  const byId = {};
  for (const c of columnValues) byId[c.id] = c;

  const finishedId = FINISHED_VISUAL_COLUMN_ID || COLS.FINISHED_VISUAL;
  const finishedFiles = parseFileColumn(byId[finishedId]?.value);
  const jobFiles = JOB_FILES_COLUMN_ID
    ? parseFileColumn(byId[JOB_FILES_COLUMN_ID]?.value)
    : [];

  const proofFile = pickProofFiles(item, side, jobFiles, finishedFiles);
  const capturedFile = pickLatestJobFile({ column_values: columnValues }, uploadedFilename) || (jobFiles.length ? jobFiles[jobFiles.length - 1] : null);
  return { item, proofFile, capturedFile, finishedFiles, jobFiles };
}

async function analyzeItemSide({ itemId, side = SIDE_FRONT, uploadedFilename = null, skipUpdate = false }) {
  const { item, proofFile, capturedFile } = await resolveFilesForSide({ itemId, side, uploadedFilename });
  if (!proofFile?.assetId) throw new Error('No proof/visual found for analysis');
  if (!capturedFile?.assetId) throw new Error('No captured file found to compare');

  const { capturedDataUrl, proofDataUrl } = await prepareDataUrls({ capturedFile, proofFile });
  console.log('[visualAnalysis] running vision', {
    itemId,
    side,
    proof: { name: proofFile.name, assetId: proofFile.assetId },
    captured: { name: capturedFile.name, assetId: capturedFile.assetId }
  });

  const context = {
    side,
    jobTitle: item.name || '',
    jobNo: (item.column_values || []).find(c => c.id === COLS.JOB_NO)?.text || '',
    garmentColour: (item.column_values || []).find(c => c.id === COLS.GARMENT_COLOR)?.text || ''
  };

  const { parsed } = await runVisionCompare({ capturedDataUrl, proofDataUrl, context });
  // Confidence tuning: keep high scores on clean matches; penalize mismatches proportionally.
  if (parsed) {
    const hasFindings = Array.isArray(parsed.findings) && parsed.findings.length > 0;
    if (parsed.ok && !hasFindings) {
      const base = Number.isFinite(parsed.confidence) ? parsed.confidence : 90;
      parsed.confidence = Math.max(base, 95);
    } else if (!parsed.ok && hasFindings) {
      const penalty = Math.min(60, parsed.findings.length * 15);
      const base = Number.isFinite(parsed.confidence) ? parsed.confidence : 70;
      parsed.confidence = Math.max(5, Math.min(100, base - penalty));
    }
  }
  console.log('[visualAnalysis] vision result', { itemId, side, parsed });

  if (!skipUpdate) {
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
  }

  return { parsed, proofFile, capturedFile };
}

module.exports = {
  analyzeItemSide,
  resolveFilesForSide,
  SIDE_FRONT,
  SIDE_BACK,
  inferMimeType,
};
