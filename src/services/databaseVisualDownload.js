const { ZipFile } = require('yazl');

const MAX_BYTES = 100 * 1024 * 1024;

function downloadError(message, status = 502) {
  return Object.assign(new Error(message), { status });
}

async function buildVisualArchive(files, { fetchImpl = fetch, maxBytes = MAX_BYTES } = {}) {
  if (!files.length) throw downloadError('There are no visuals to download.', 404);
  if (files.length > 200) throw downloadError('This order has too many visuals for one download.', 413);
  const entries = [];
  const names = new Set();
  let total = 0;
  for (const file of files) {
    let url;
    try { url = new URL(file.secure_url); } catch { /* handled below */ }
    if (!url || url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com' || url.username || url.password || url.port) {
      throw downloadError('A visual has an unsupported download URL.');
    }
    const response = await fetchImpl(url.href, { redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!response.ok || !response.body) throw downloadError('A visual could not be downloaded. Please try again.');
    const chunks = [];
    for await (const chunk of response.body) {
      total += chunk.length;
      if (total > maxBytes) throw downloadError('The visuals exceed the 100 MB download limit.', 413);
      chunks.push(Buffer.from(chunk));
    }
    const base = String(file.original_filename || `visual-${file.id}.${file.format || 'bin'}`)
      .replace(/[\\/\x00-\x1f\x7f:]/g, '_').replace(/^\.+/, '_').slice(0, 180) || 'visual';
    let name = base;
    let suffix = 2;
    while (names.has(name.toLowerCase())) {
      const dot = base.lastIndexOf('.');
      name = dot > 0 ? `${base.slice(0, dot)} (${suffix++})${base.slice(dot)}` : `${base} (${suffix++})`;
    }
    names.add(name.toLowerCase());
    entries.push({ name, data: Buffer.concat(chunks) });
  }
  const zip = new ZipFile();
  const result = new Promise((resolve, reject) => {
    const chunks = [];
    zip.on('error', reject);
    zip.outputStream.on('error', reject);
    zip.outputStream.on('data', chunk => chunks.push(chunk));
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
  });
  for (const entry of entries) zip.addBuffer(entry.data, entry.name, { compress: false });
  zip.end();
  return result;
}

module.exports = { buildVisualArchive };
