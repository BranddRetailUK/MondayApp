const test = require('node:test');
const assert = require('node:assert/strict');
const { buildVisualArchive } = require('../src/services/databaseVisualDownload');

function entries(zip) {
  const result = [];
  let offset = 0;
  while (zip.readUInt32LE(offset) === 0x04034b50) {
    const size = zip.readUInt32LE(offset + 18);
    const nameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);
    const start = offset + 30 + nameLength + extraLength;
    result.push({ name: zip.toString('utf8', offset + 30, offset + 30 + nameLength), data: zip.subarray(start, start + size).toString() });
    offset = start + size;
  }
  assert.equal(zip.readUInt32LE(offset), 0x02014b50);
  return result;
}
const file = name => ({ original_filename: name, secure_url: 'https://res.cloudinary.com/example/image/upload/proof.pdf' });

test('ZIP preserves all original bytes and disambiguates duplicate filenames safely', async () => {
  let n = 0;
  const result = await buildVisualArchive([file('../proof.pdf'), file('../proof.pdf'), file('other.png')], {
    fetchImpl: async (_url, options) => {
      assert.equal(options.redirect, 'error');
      return new Response(`original-${++n}`);
    },
  });
  assert.deepEqual(entries(result), [
    { name: '__proof.pdf', data: 'original-1' },
    { name: '__proof (2).pdf', data: 'original-2' },
    { name: 'other.png', data: 'original-3' },
  ]);
});

test('empty, unsafe, oversized and failed downloads do not produce a partial archive', async () => {
  await assert.rejects(buildVisualArchive([]), { status: 404 });
  await assert.rejects(buildVisualArchive([{ secure_url: 'http://127.0.0.1/private' }]), /unsupported/);
  await assert.rejects(buildVisualArchive([file('proof.pdf')], { maxBytes: 2, fetchImpl: async () => new Response('123') }), { status: 413 });
  await assert.rejects(buildVisualArchive([file('proof.pdf')], { fetchImpl: async () => new Response('', { status: 404 }) }), /could not be downloaded/);
});
