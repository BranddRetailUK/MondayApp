const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const multer = require("multer");

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// ----- Match Illustrator's ROOT_PATH (same as ai-visual.jsx) -----
const HOME = process.env.HOME || process.env.USERPROFILE || "";
const ILLUSTRATOR_ROOT = process.env.VIS_ROOT
  ? path.resolve(process.env.VIS_ROOT)
  : path.resolve(HOME, "Documents", "MondayApp", "visual generator");

const JOBS_DIR = path.join(ILLUSTRATOR_ROOT, "VisualJobs");
const JOB_PATH = path.join(JOBS_DIR, "current-job.json");
const COLORS_PATH = path.join(JOBS_DIR, "garment-colors.json");
const ARTWORK_DIR = path.join(ILLUSTRATOR_ROOT, "VisualArtwork");

// ensure dirs
for (const p of [JOBS_DIR, ARTWORK_DIR]) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

// ----- Multer (write directly into VisualArtwork) -----
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, ARTWORK_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^\w.-]+/g, "_");
    cb(null, `${base}__${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 30 * 1024 * 1024 }, // 30MB
});

// ----- Routes -----
app.get("/health", (_req, res) => res.json({ ok: true, root: ILLUSTRATOR_ROOT }));

app.get("/garment-colors", (_req, res) => {
  try {
    const raw = fs.readFileSync(COLORS_PATH, "utf8");
    res.type("application/json").send(raw);
  } catch (err) {
    res.status(500).json({ error: "Cannot read garment-colors.json", detail: String(err) });
  }
});

app.post("/upload", (req, res, next) => upload.single("artwork")(req, res, (err) => {
  if (err) {
    // Always JSON
    return res.status(400).json({ error: err.message || "Upload failed" });
  }
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const saved = req.file.filename;
  return res.json({
    filename: saved,                 // <-- put this into job.placements[*].artworkFile
    absPath: path.join(ARTWORK_DIR, saved),
  });
}));

app.post("/save-job", (req, res) => {
  try {
    fs.writeFileSync(JOB_PATH, JSON.stringify(req.body, null, 2));
    res.sendStatus(200);
  } catch (err) {
    res.status(500).json({ error: "Save failed", detail: String(err) });
  }
});

// static (useful for debugging)
app.use("/VisualArtwork", express.static(ARTWORK_DIR));
app.use("/VisualJobs", express.static(JOBS_DIR));

// final JSON error handler (no HTML)
app.use((err, _req, res, _next) => {
  res.status(500).json({ error: "Server error", detail: String(err) });
});

const PORT = process.env.PORT || 5050;
app.listen(PORT, () => {
  console.log(`Mock server http://localhost:${PORT}`);
  console.log(`Illustrator root: ${ILLUSTRATOR_ROOT}`);
});
