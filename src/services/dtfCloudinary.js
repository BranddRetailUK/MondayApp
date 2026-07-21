const crypto = require('crypto');
const stream = require('stream');
const { v2: cloudinary } = require('cloudinary');
const { MAX_FILE_BYTES, isExpectedPdfPage } = require('./dtf');

const CLOUD_NAME = String(process.env.CLOUDINARY_CLOUD_NAME || '').trim();
const API_KEY = String(process.env.CLOUDINARY_API_KEY || '').trim();
const API_SECRET = String(process.env.CLOUDINARY_API_SECRET || '').trim();
const ROOT_FOLDER = String(process.env.CLOUDINARY_DTF_ROOT || 'ultimate-hub/dtf').trim().replace(/^\/+|\/+$/g, '');
let configured = false;

function configure() {
  if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
    throw new Error('Cloudinary is not configured for DTF uploads.');
  }
  if (!configured) {
    cloudinary.config({ cloud_name: CLOUD_NAME, api_key: API_KEY, api_secret: API_SECRET, secure: true });
    configured = true;
  }
}

function expectedPublicId({ userId, jobId, fileId }) {
  return `${ROOT_FOLDER}/${Number(userId)}/${Number(jobId)}/${Number(fileId)}`;
}

function signDtfUpload(input) {
  configure();
  const publicId = expectedPublicId(input);
  const timestamp = Math.floor(Date.now() / 1000);
  const params = {
    overwrite: false,
    public_id: publicId,
    timestamp,
    type: 'authenticated',
  };
  return {
    apiKey: API_KEY,
    cloudName: CLOUD_NAME,
    publicId,
    timestamp,
    type: 'authenticated',
    overwrite: false,
    signature: cloudinary.utils.api_sign_request(params, API_SECRET),
    uploadUrl: `https://api.cloudinary.com/v1_1/${encodeURIComponent(CLOUD_NAME)}/image/upload`,
  };
}

async function destroyDtfAsset(publicId) {
  if (!publicId) return;
  configure();
  return cloudinary.uploader.destroy(publicId, {
    resource_type: 'image',
    type: 'authenticated',
    invalidate: true,
  }).catch(() => undefined);
}

async function verifyDtfUpload(input) {
  configure();
  const publicId = expectedPublicId(input);
  if (String(input.reportedPublicId || '') !== publicId) {
    await destroyDtfAsset(publicId);
    return { ok: false, publicId, error: 'Uploaded file could not be verified.' };
  }

  try {
    const resource = await cloudinary.api.resource(publicId, {
      resource_type: 'image',
      type: 'authenticated',
      pages: true,
    });
    const validIdentity = resource?.public_id === publicId
      && resource?.resource_type === 'image'
      && resource?.type === 'authenticated'
      && String(resource?.format || '').toLowerCase() === 'pdf';
    const bytes = Number(resource?.bytes);
    if (!validIdentity || !Number.isFinite(bytes) || bytes < 1 || bytes > MAX_FILE_BYTES) {
      await destroyDtfAsset(publicId);
      return { ok: false, publicId, error: 'The uploaded asset is not a supported PDF.' };
    }
    if (!isExpectedPdfPage(resource)) {
      await destroyDtfAsset(publicId);
      return { ok: false, publicId, error: 'PDFs must contain one 550 × 1000mm portrait page.' };
    }
    return {
      ok: true,
      publicId,
      assetId: resource.asset_id || null,
      version: Number(resource.version) || null,
      bytes,
      pages: Number(resource.pages),
      width: Number(resource.width),
      height: Number(resource.height),
    };
  } catch {
    await destroyDtfAsset(publicId);
    return { ok: false, publicId, error: 'Uploaded file could not be verified.' };
  }
}

function signedDtfDownloadUrl(publicId, filename, options = {}) {
  configure();
  return cloudinary.utils.private_download_url(publicId, 'pdf', {
    resource_type: 'image',
    type: 'authenticated',
    expires_at: Math.floor(Date.now() / 1000) + 5 * 60,
    attachment: options.attachment === true,
    filename: String(filename || 'gang-sheet.pdf').replace(/\.pdf$/i, ''),
  });
}

async function createEpsPng(buffer, userId) {
  configure();
  const publicId = `${ROOT_FOLDER}/eps-preview/${Number(userId)}/${crypto.randomUUID()}`;
  let uploaded = false;
  try {
    const result = await new Promise((resolve, reject) => {
      const upload = cloudinary.uploader.upload_stream({
        resource_type: 'image',
        public_id: publicId,
        overwrite: false,
        type: 'upload',
      }, (error, response) => {
        if (error || !response?.public_id) reject(error || new Error('EPS conversion failed.'));
        else resolve(response);
      });
      stream.Readable.from(buffer).pipe(upload);
    });
    uploaded = true;
    const pngUrl = cloudinary.url(result.public_id, {
      resource_type: 'image',
      type: 'upload',
      secure: true,
      format: 'png',
      transformation: [{ density: 300, quality: 100 }],
    });
    const response = await fetch(pngUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error('EPS conversion failed.');
    return Buffer.from(await response.arrayBuffer());
  } finally {
    if (uploaded) {
      await cloudinary.uploader.destroy(publicId, {
        resource_type: 'image',
        type: 'upload',
        invalidate: true,
      }).catch(() => undefined);
    }
  }
}

module.exports = {
  createEpsPng,
  destroyDtfAsset,
  expectedPublicId,
  signDtfUpload,
  signedDtfDownloadUrl,
  verifyDtfUpload,
};
