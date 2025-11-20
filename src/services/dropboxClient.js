// src/services/dropboxClient.js
require('dotenv').config();
const path = require('path');
const { Dropbox } = require('dropbox');
const axios = require('axios');
const fetch = (...args) => import('node-fetch').then(({ default: fetchFn }) => fetchFn(...args));

const APP_KEY = process.env.DROPBOX_APP_KEY;
const APP_SECRET = process.env.DROPBOX_APP_SECRET;
const REFRESH_TOKEN = process.env.DROPBOX_REFRESH_TOKEN;
let ACCESS_TOKEN = process.env.DROPBOX_ACCESS_TOKEN || null;

async function refreshAccessToken() {
  if (!REFRESH_TOKEN) {
    if (!ACCESS_TOKEN) {
      throw new Error('DROPBOX_ACCESS_TOKEN or DROPBOX_REFRESH_TOKEN required');
    }
    return ACCESS_TOKEN;
  }
  const params = new URLSearchParams();
  params.append('grant_type', 'refresh_token');
  params.append('refresh_token', REFRESH_TOKEN);
  const auth = Buffer.from(`${APP_KEY}:${APP_SECRET}`).toString('base64');
  const { data } = await axios.post('https://api.dropboxapi.com/oauth2/token', params, {
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });
  ACCESS_TOKEN = data.access_token;
  return ACCESS_TOKEN;
}

async function getDropboxClient() {
  const token = await refreshAccessToken();
  return new Dropbox({ accessToken: token, fetch });
}

const IMPORT_FOLDER = process.env.DROPBOX_IMPORT_FOLDER || '/MONDAY';
const ARCHIVE_FOLDER = process.env.DROPBOX_ARCHIVE_FOLDER || '/MONDAY/archive';
const ERROR_FOLDER = process.env.DROPBOX_ERROR_FOLDER || '/MONDAY/errors';

function normalizePath(folderPath) {
  if (!folderPath.startsWith('/')) return `/${folderPath}`;
  return folderPath;
}

async function ensureFolder(folderPath) {
  const target = normalizePath(folderPath);
  try {
    const dbx = await getDropboxClient();
    await dbx.filesGetMetadata({ path: target });
  } catch (err) {
    if (err?.status === 409) {
      const dbx = await getDropboxClient();
      await dbx.filesCreateFolderV2({ path: target, autorename: false });
      return;
    }
    throw err;
  }
}

async function listProcessableFiles() {
  const files = [];
  let cursor = null;
  do {
    const dbx = await getDropboxClient();
    const response = cursor
      ? await dbx.filesListFolderContinue({ cursor })
      : await dbx.filesListFolder({ path: normalizePath(IMPORT_FOLDER), recursive: false });

    response.result.entries
      .filter(entry => entry['.tag'] === 'file')
      .forEach(entry => files.push(entry));

    cursor = response.result.has_more ? response.result.cursor : null;
  } while (cursor);

  files.sort((a, b) => new Date(a.client_modified) - new Date(b.client_modified));
  return files;
}

async function downloadFile(entryPath) {
  const dbx = await getDropboxClient();
  const { result } = await dbx.filesDownload({ path: entryPath });
  const buffer = Buffer.from(result.fileBinary);
  return { buffer, metadata: result };
}

async function moveFile(entryPath, destinationFolder) {
  const baseFolder = normalizePath(destinationFolder);
  await ensureFolder(baseFolder);

  const dateFolder = path.posix.join(baseFolder, new Date().toISOString().slice(0, 10));
  await ensureFolder(dateFolder);

  const fileName = path.posix.basename(entryPath);
  const destinationPath = path.posix.join(dateFolder, fileName);

  const dbx = await getDropboxClient();
  await dbx.filesMoveV2({
    from_path: entryPath,
    to_path: destinationPath,
    autorename: true,
  });

  return destinationPath;
}

async function moveToArchive(entryPath) {
  return moveFile(entryPath, ARCHIVE_FOLDER);
}

async function moveToError(entryPath) {
  return moveFile(entryPath, ERROR_FOLDER);
}

async function findFileByJobNumber(jobNumber) {
  const query = String(jobNumber || '').trim();
  if (!query) return null;

  const dbx = await getDropboxClient();
  const { result } = await dbx.filesSearchV2({
    query,
    options: {
      path: normalizePath(IMPORT_FOLDER),
      filename_only: true,
      max_results: 20,
    },
  });

  for (const match of result.matches || []) {
    const metadata = match.metadata?.metadata || match.metadata;
    if (metadata && metadata['.tag'] === 'file') {
      if (metadata.name && metadata.name.includes(query)) {
        return metadata;
      }
    }
  }

  return null;
}

module.exports = {
  IMPORT_FOLDER: normalizePath(IMPORT_FOLDER),
  ARCHIVE_FOLDER: normalizePath(ARCHIVE_FOLDER),
  ERROR_FOLDER: normalizePath(ERROR_FOLDER),
  listProcessableFiles,
  downloadFile,
  moveToArchive,
  moveToError,
  findFileByJobNumber,
};
