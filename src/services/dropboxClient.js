// src/services/dropboxClient.js
require('dotenv').config();
const path = require('path');
const { Dropbox } = require('dropbox');

const fetch = (...args) =>
  import('node-fetch').then(({ default: fetchFn }) => fetchFn(...args));

const ACCESS_TOKEN = process.env.DROPBOX_ACCESS_TOKEN;
if (!ACCESS_TOKEN) {
  throw new Error('DROPBOX_ACCESS_TOKEN is required for Dropbox integration');
}

const IMPORT_FOLDER = process.env.DROPBOX_IMPORT_FOLDER || '/MONDAY';
const ARCHIVE_FOLDER = process.env.DROPBOX_ARCHIVE_FOLDER || '/MONDAY/archive';
const ERROR_FOLDER = process.env.DROPBOX_ERROR_FOLDER || '/MONDAY/errors';

const dropbox = new Dropbox({ accessToken: ACCESS_TOKEN, fetch });

function normalizePath(folderPath) {
  if (!folderPath.startsWith('/')) return `/${folderPath}`;
  return folderPath;
}

async function ensureFolder(folderPath) {
  const target = normalizePath(folderPath);
  try {
    await dropbox.filesGetMetadata({ path: target });
  } catch (err) {
    if (err?.status === 409) {
      await dropbox.filesCreateFolderV2({ path: target, autorename: false });
      return;
    }
    throw err;
  }
}

async function listProcessableFiles() {
  const files = [];
  let cursor = null;
  do {
    const response = cursor
      ? await dropbox.filesListFolderContinue({ cursor })
      : await dropbox.filesListFolder({ path: normalizePath(IMPORT_FOLDER), recursive: false });

    response.result.entries
      .filter(entry => entry['.tag'] === 'file')
      .forEach(entry => files.push(entry));

    cursor = response.result.has_more ? response.result.cursor : null;
  } while (cursor);

  files.sort((a, b) => new Date(a.client_modified) - new Date(b.client_modified));
  return files;
}

async function downloadFile(entryPath) {
  const { result } = await dropbox.filesDownload({ path: entryPath });
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

  await dropbox.filesMoveV2({
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

  const { result } = await dropbox.filesSearchV2({
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
