// Runs inside the deployed container; never imports app.js or starts Hub jobs.
const assert = require('node:assert/strict');
const { proofRuntimeStatus } = require('../src/services/proofRuntime');

(async () => {
  const readiness = await proofRuntimeStatus();
  assert.equal(readiness.ready, true, 'AI key, native renderer and bundled template must be available');
  if (!process.argv.includes('--live')) {
    console.log(JSON.stringify({ ...readiness, node: process.version, platform: process.platform }));
    return;
  }
  const { parseProofBrief } = require('../src/services/proofBriefParser');
  const { prepareBrief, recoverProductCodes } = require('../src/services/proofLayout');
  const { enrichProofProducts } = require('../src/services/proofProductVisuals');
  const { buildProof } = require('../src/services/proofPdfGenerator');
  const { ensureGeneratedViews } = require('../src/services/proofGeneratedViews');
  const { PDFDocument } = require('pdf-lib');
  const sharp = require('sharp');
  const input = {
    requestText: 'Customer: Deployment QA. RX350 hoodie, Navy. Print logo.png on left breast 100 mm wide and back 250 mm wide. Red print.',
    artworks: [{ id: 'qa-logo', fileName: 'logo.png', assignment: 'left breast and back' }],
  };
  const parsed = await parseProofBrief(input);
  recoverProductCodes(parsed, input);
  await enrichProofProducts(parsed);
  const brief = prepareBrief(parsed, input);
  await ensureGeneratedViews(brief, { allowGenerate: true });
  assert.equal(brief.products.length, 1);
  assert.equal(brief.products[0].code.toUpperCase(), 'RX350');
  const buffer = await sharp({ create: { width: 200, height: 100, channels: 4, background: '#f33' } }).png().toBuffer();
  const result = await buildProof(brief, [{ id: 'qa-logo', backgroundMode: 'keep', file: { originalname: 'logo.png', buffer } }], { strict: true });
  assert.equal((await PDFDocument.load(result.bytes)).getPageCount(), 1);
  assert.deepEqual(result.pages.map(page => page.view).sort(), ['back', 'front']);
  assert.deepEqual(result.pages.flatMap(page => page.placements.map(placement => placement.size.width)).sort((a,b) => a-b), [100, 250]);
  console.log(JSON.stringify({ ...readiness, node: process.version, platform: process.platform, liveAI: true, supplier: brief.products[0].visual.source, pages: result.pages.length, pdfBytes: result.bytes.length, blockingIssues: result.issues.filter(issue => issue.blocking).length }));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
