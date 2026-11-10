const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const products = require('../web/hamper-collection/products.json');
(async () => {
  const out = path.join(__dirname, '../public/assets/hamper-thumbnails');
  await fs.mkdir(out, { recursive: true });
  for (const page of new Set(products.map(p => p.page))) {
    await sharp(path.join(__dirname, `../web/hamper-collection/assets/product-${page}.jpg`))
      .resize(160, 160, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 72 })
      .toFile(path.join(out, `product-${page}.webp`));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
