const { v2: cloudinary } = require('cloudinary');
const stream = require('stream');
const { columnSlug } = require('./testDashboardDefaults');

const CLOUD_NAME = (process.env.CLOUDINARY_CLOUD_NAME || '').trim();
const API_KEY = (process.env.CLOUDINARY_API_KEY || '').trim();
const API_SECRET = (process.env.CLOUDINARY_API_SECRET || '').trim();
const ROOT_FOLDER = (process.env.CLOUDINARY_TEST_DASHBOARD_ROOT || 'ultimate-hub/test-dashboard').trim();

let configured = false;

function configureCloudinary() {
  if (configured) return;
  if (!CLOUD_NAME || !API_KEY || !API_SECRET) return;
  cloudinary.config({
    cloud_name: CLOUD_NAME,
    api_key: API_KEY,
    api_secret: API_SECRET,
    secure: true,
  });
  configured = true;
}

function hasCloudinaryConfig() {
  return Boolean(CLOUD_NAME && API_KEY && API_SECRET);
}

function requireCloudinaryConfig() {
  if (!hasCloudinaryConfig()) {
    throw new Error('Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.');
  }
  configureCloudinary();
}

function cloudinaryPublicConfig() {
  requireCloudinaryConfig();
  return {
    cloudName: CLOUD_NAME,
    apiKey: API_KEY,
  };
}

function safePathPart(value, fallback = 'file') {
  const clean = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return clean || fallback;
}

function folderForColumn(column, orderNo) {
  const slug = columnSlug(column);
  return `${ROOT_FOLDER}/${slug}/${safePathPart(orderNo, 'unknown-order')}`;
}

function publicIdForUpload({ filename, source = 'upload' } = {}) {
  const baseName = String(filename || 'file').replace(/\.[^.]+$/, '');
  const safeName = safePathPart(baseName, 'file');
  const prefix = safePathPart(source, 'upload');
  return `${prefix}-${Date.now()}-${safeName}`;
}

function signUpload({ folder, publicId, format = '' }) {
  requireCloudinaryConfig();
  const timestamp = Math.floor(Date.now() / 1000);
  const params = {
    folder,
    public_id: publicId,
    timestamp,
  };
  if (format) params.format = format;
  const signature = cloudinary.utils.api_sign_request(params, API_SECRET);
  return {
    ...cloudinaryPublicConfig(),
    signature,
    timestamp,
    folder,
    publicId,
    format: format || '',
    uploadUrl: `https://api.cloudinary.com/v1_1/${encodeURIComponent(CLOUD_NAME)}/auto/upload`,
  };
}

async function uploadBuffer(buffer, { folder, publicId, filename, resourceType = 'auto', context = {} } = {}) {
  requireCloudinaryConfig();
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('No file buffer supplied for Cloudinary upload');

  return new Promise((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: resourceType,
        use_filename: false,
        unique_filename: false,
        overwrite: true,
        context: {
          original_filename: filename || '',
          ...context,
        },
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );

    stream.Readable.from(buffer).pipe(upload);
  });
}

async function destroyAsset(publicId, resourceType = 'image') {
  requireCloudinaryConfig();
  if (!publicId) return null;
  const type = resourceType || 'image';
  try {
    return await cloudinary.uploader.destroy(publicId, { resource_type: type });
  } catch (err) {
    if (type !== 'raw') {
      return cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
    }
    throw err;
  }
}

function cloudinaryResultToFile(result, fallback = {}) {
  return {
    public_id: result?.public_id || fallback.public_id || '',
    secure_url: result?.secure_url || fallback.secure_url || '',
    resource_type: result?.resource_type || fallback.resource_type || null,
    format: result?.format || fallback.format || null,
    original_filename: fallback.original_filename || result?.original_filename || null,
    bytes: Number.isFinite(result?.bytes) ? result.bytes : fallback.bytes || null,
    width: Number.isFinite(result?.width) ? result.width : fallback.width || null,
    height: Number.isFinite(result?.height) ? result.height : fallback.height || null,
    metadata: fallback.metadata || {},
  };
}

module.exports = {
  hasCloudinaryConfig,
  requireCloudinaryConfig,
  cloudinaryPublicConfig,
  folderForColumn,
  publicIdForUpload,
  signUpload,
  uploadBuffer,
  destroyAsset,
  cloudinaryResultToFile,
};
