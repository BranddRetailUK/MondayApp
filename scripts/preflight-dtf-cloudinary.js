#!/usr/bin/env node

require('dotenv').config();

const crypto = require('crypto');
const { v2: cloudinary } = require('cloudinary');
const { PDFDocument } = require('pdf-lib');
const {
  TARGET_HEIGHT_POINTS,
  TARGET_WIDTH_POINTS,
} = require('../src/services/dtf');
const {
  createEpsPng,
  destroyDtfAsset,
  signDtfUpload,
  signedDtfDownloadUrl,
  verifyDtfUpload,
} = require('../src/services/dtfCloudinary');

async function createTestPdf() {
  const pdf = await PDFDocument.create();
  pdf.addPage([TARGET_WIDTH_POINTS, TARGET_HEIGHT_POINTS]);
  return Buffer.from(await pdf.save());
}

async function uploadSignedPdf(signing, bytes) {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'application/pdf' }), 'dtf-cloudinary-preflight.pdf');
  form.append('api_key', signing.apiKey);
  form.append('timestamp', String(signing.timestamp));
  form.append('signature', signing.signature);
  form.append('public_id', signing.publicId);
  form.append('type', signing.type);
  form.append('overwrite', String(signing.overwrite));

  const response = await fetch(signing.uploadUrl, { method: 'POST', body: form });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.public_id !== signing.publicId) {
    throw new Error(result.error?.message || `Cloudinary upload failed (${response.status}).`);
  }
  return result;
}

async function main() {
  const nonce = crypto.randomInt(100000, 999999);
  const identity = { userId: 999999, jobId: nonce, fileId: nonce };
  const signing = signDtfUpload(identity);
  let uploaded = false;

  try {
    const bytes = await createTestPdf();
    await uploadSignedPdf(signing, bytes);
    uploaded = true;

    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
    const observed = await cloudinary.api.resource(signing.publicId, {
      resource_type: 'image',
      type: 'authenticated',
      image_metadata: true,
      pages: true,
    });

    const verification = await verifyDtfUpload({
      ...identity,
      reportedPublicId: signing.publicId,
    });
    if (!verification.ok) {
      const metadata = {
        format: observed.format,
        pages: observed.pages,
        width: observed.width,
        height: observed.height,
        pageCount: observed.page_count,
        pageSizes: observed.page_sizes,
        imageMetadata: observed.image_metadata,
      };
      throw new Error(`${verification.error} Observed metadata: ${JSON.stringify(metadata)}`);
    }

    const downloadUrl = signedDtfDownloadUrl(signing.publicId, 'dtf-cloudinary-preflight.pdf');
    const download = await fetch(downloadUrl, { redirect: 'follow' });
    if (!download.ok || !String(download.headers.get('content-type') || '').toLowerCase().includes('pdf')) {
      throw new Error(`Authenticated PDF delivery failed (${download.status}).`);
    }
    await download.arrayBuffer();

    const eps = Buffer.from([
      '%!PS-Adobe-3.0 EPSF-3.0',
      '%%BoundingBox: 0 0 72 72',
      '1 0 0 setrgbcolor',
      'newpath 0 0 moveto 72 0 lineto 72 72 lineto 0 72 lineto closepath fill',
      'showpage',
      '%%EOF',
    ].join('\n'));
    const epsPng = await createEpsPng(eps, identity.userId);
    const validPng = epsPng.length > 8 && epsPng.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (!validPng) throw new Error('The 300-DPI EPS conversion did not return a PNG.');

    const cleanup = await destroyDtfAsset(signing.publicId);
    if (!['ok', 'not found'].includes(cleanup?.result)) throw new Error('The preflight PDF asset could not be cleaned up.');
    uploaded = false;

    console.log(JSON.stringify({
      ok: true,
      cloudName: signing.cloudName,
      format: 'pdf',
      type: 'authenticated',
      pages: verification.pages,
      width: verification.width,
      height: verification.height,
      signedDelivery: true,
      eps300DpiPng: true,
      cleanedUp: true,
    }, null, 2));
  } finally {
    if (uploaded) await destroyDtfAsset(signing.publicId);
  }
}

main().catch((error) => {
  console.error(`DTF Cloudinary preflight failed: ${error.message}`);
  process.exitCode = 1;
});
