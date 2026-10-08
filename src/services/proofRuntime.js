const fs = require('fs/promises');
const path = require('path');

// No credentials or customer data leave the server in this readiness response.
async function proofRuntimeStatus() {
  let rendererReady = false;
  try {
    await fs.access(path.join(__dirname, '../../assets/proof-generator/template.pdf'));
    require.resolve('pdfjs-dist/build/pdf.mjs');
    require.resolve('pdfjs-dist/build/pdf.worker.mjs');
    await require('sharp')({ create: { width: 1, height: 1, channels: 4, background: '#fff' } }).png().toBuffer();
    require('@napi-rs/canvas').createCanvas(1, 1).getContext('2d');
    rendererReady = true;
  } catch (error) {
    console.error('Proof renderer readiness failed:', error.message);
  }
  const aiReady = Boolean(process.env.OPENAI_API_KEY?.trim());
  return { ready: aiReady && rendererReady, aiReady, rendererReady };
}

module.exports = { proofRuntimeStatus };
