const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadRoot = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadRoot)) fs.mkdirSync(uploadRoot, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadRoot),
  filename: (_req, file, cb) => {
    const ts = Date.now();
    const safe = file.originalname.replace(/[^\w.\-]+/g, '_');
    cb(null, `${ts}_${safe}`);
  }
});

module.exports = multer({ storage });
