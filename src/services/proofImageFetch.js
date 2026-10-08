const { isRalawiseImageUrl } = require('./proofRalawiseVisuals');

async function fetchGarment(url, source, fetchImpl = fetch) {
  if (/^proof-generated:[a-f0-9]{64}$/.test(url)) {
    const cached = await require('./proofGeneratedViews').readCachedView(url.slice(16));
    if (!cached) throw new Error('The generated garment view has expired. Create the proof again.');
    return cached;
  }
  const parsed = new URL(url);
  const pencarrie = (parsed.hostname === 'pencarrie.com' || parsed.hostname.endsWith('.pencarrie.com')) && parsed.pathname.startsWith('/storage/');
  const ralawise = source === 'Ralawise catalog' && isRalawiseImageUrl(url);
  if (parsed.protocol !== 'https:' || !(pencarrie || ralawise)) {
    throw new Error('No safe garment image is available for this product.');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, redirect: 'error' });
    if (!response.ok) throw new Error(`Garment image download failed (${response.status}).`);
    const data = Buffer.from(await response.arrayBuffer());
    if (data.length > 12 * 1024 * 1024) throw new Error('Garment image is too large.');
    return data;
  } finally { clearTimeout(timer); }
}

module.exports = { fetchGarment };
