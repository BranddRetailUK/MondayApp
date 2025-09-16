const express = require("express");
const axios = require("axios");
const path = require("path");
const dotenv = require("dotenv");
const crypto = require("crypto");
const QRCode = require("qrcode");
const { Pool } = require("pg");

dotenv.config();

const app = express();
app.set("trust proxy", 1);
app.use(express.json());

const PORT = parseInt(process.env.PORT || "3000", 10);

const CLIENT_ID = (process.env.MONDAY_CLIENT_ID || "").trim();
const CLIENT_SECRET = (process.env.MONDAY_CLIENT_SECRET || "").trim();
const REDIRECT_URI = (process.env.MONDAY_REDIRECT_URI || "http://localhost:3000/callback").trim();
const BOARD_ID = (process.env.BOARD_ID || "").trim();
const SCOPES = (process.env.MONDAY_SCOPES || "").trim();

const MONDAY_API_TOKEN = (process.env.MONDAY_API_TOKEN || "").trim();

const SCAN_SECRET = (process.env.SCAN_SECRET || "change-me").trim();
const STATUS_COLUMN_ID = (process.env.STATUS_COLUMN_ID || "").trim();
const CHECKED_IN_COLUMN_ID = (process.env.CHECKED_IN_COLUMN_ID || "").trim();

const STEP1_STATUS_LABEL = (process.env.STEP1_STATUS_LABEL || "Checked In").trim();
const STEP2_STATUS_LABEL = (process.env.STEP2_STATUS_LABEL || "In Production").trim();
const STEP3_STATUS_LABEL = (process.env.STEP3_STATUS_LABEL || "Completed").trim();

const BOARD_PAGE_LIMIT = parseInt(process.env.BOARD_PAGE_LIMIT || "50", 10);
const BOARD_MAX_PAGES = parseInt(process.env.BOARD_MAX_PAGES || "2", 10);
const BOARD_CACHE_MS = parseInt(process.env.BOARD_CACHE_MS || "300000", 10);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false }
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_scans (
      id SERIAL PRIMARY KEY,
      item_id VARCHAR(64) NOT NULL UNIQUE,
      job_title TEXT,
      customer_name TEXT,
      order_number TEXT,
      scan_count INT NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Pending',
      last_scanned_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_scan_events (
      id SERIAL PRIMARY KEY,
      item_id VARCHAR(64) NOT NULL,
      scan_number INT NOT NULL,
      new_status TEXT NOT NULL,
      scanned_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
}

let mondayAccessToken = MONDAY_API_TOKEN || null;
let boardCache = { data: null, expires: 0, inFlight: null };

app.use(express.static(path.join(__dirname, "public")));

function buildAuthorizeUrl() {
  const u = new URL("https://auth.monday.com/oauth2/authorize");
  u.searchParams.set("client_id", CLIENT_ID);
  u.searchParams.set("redirect_uri", REDIRECT_URI);
  u.searchParams.set("response_type", "code");
  if (SCOPES) u.searchParams.set("scope", SCOPES);
  u.searchParams.set("state", "monday-demo");
  return u.toString();
}

function signPayload(itemId, ts) {
  return crypto.createHmac("sha256", SCAN_SECRET).update(`${itemId}.${ts}`).digest("hex");
}

app.get("/auth", (req, res) => {
  res.redirect(buildAuthorizeUrl());
});

app.get("/callback", async (req, res) => {
  const { code, error, error_description } = req.query;
  if (error) return res.status(400).send(`OAuth error: ${error_description || error}`);
  if (!code) return res.status(400).send("No code received");
  try {
    const response = await axios.post("https://auth.monday.com/oauth2/token", {
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI
    });
    mondayAccessToken = response.data.access_token;
    res.redirect("/");
  } catch {
    res.status(500).send("Failed to authenticate");
  }
});

app.get("/api/board", async (req, res) => {
  if (!mondayAccessToken) return res.status(401).json({ error: "Not authenticated. Visit /auth first." });
  if (!BOARD_ID) return res.status(400).json({ error: "BOARD_ID is not set." });

  const now = Date.now();
  if (boardCache.data && boardCache.expires > now) return res.json(boardCache.data);
  if (boardCache.inFlight) {
    try { const data = await boardCache.inFlight; return res.json(data); }
    catch { boardCache.inFlight = null; }
  }

  boardCache.inFlight = fetchBoardLitePaged();
  try {
    const data = await boardCache.inFlight;
    boardCache.data = data;
    boardCache.expires = Date.now() + BOARD_CACHE_MS;
    return res.json(data);
  } catch {
    return res.status(500).json({ error: "Failed to fetch board" });
  } finally {
    boardCache.inFlight = null;
  }
});

async function fetchBoardLitePaged() {
  let limit = BOARD_PAGE_LIMIT;
  let cursor = null;
  let items = [];
  let pages = 0;

  while (pages < BOARD_MAX_PAGES) {
    const query = `
      query($boardId: [ID!], $limit: Int!, $cursor: String) {
        boards(ids: $boardId) {
          items_page(limit: $limit, cursor: $cursor) {
            cursor
            items {
              id
              name
              group { title }
              subitems {
                id
                name
                column_values(ids: ["dropdown_mkr73m5s", "text_mkr31cjs"]) {
                  id
                  text
                }
              }
            }
          }
        }
      }
    `;
    const variables = { boardId: [BOARD_ID], limit, cursor };
    const resp = await axios.post(
      "https://api.monday.com/v2",
      { query, variables },
      { headers: { Authorization: mondayAccessToken, "Content-Type": "application/json" } }
    );

    if (resp.data?.errors?.length) break;

    const pageObj = resp.data?.data?.boards?.[0]?.items_page;
    if (!pageObj) break;

    items = items.concat(pageObj.items || []);
    cursor = pageObj.cursor || null;
    pages++;

    if (!cursor) break;
  }

  const grouped = {};
  for (const it of items) {
    const title = it?.group?.title || "Ungrouped";
    if (!grouped[title]) grouped[title] = [];
    grouped[title].push({
      id: it.id,
      name: it.name,
      subitems: it.subitems || []
    });
  }

  const groups = Object.entries(grouped).map(([title, arr]) => ({
    title,
    items_page: { items: arr }
  }));

  return { boards: [{ groups }] };
}

app.get('/launch', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'launch.html'));
});

app.get("/api/scan-url", (req, res) => {
  const { itemId } = req.query;
  if (!itemId) return res.status(400).json({ error: "itemId required" });
  const ts = Date.now().toString();
  const sig = signPayload(itemId, ts);
  const base = `https://${req.get("host")}`;
  const url = `${base}/scan?i=${encodeURIComponent(itemId)}&ts=${ts}&sig=${sig}`;
  res.json({ url });
});

async function advanceScan(itemId) {
  const row = await pool.query("SELECT scan_count FROM job_scans WHERE item_id = $1", [itemId]);
  if (row.rowCount === 0) {
    await pool.query("INSERT INTO job_scans (item_id, scan_count, status) VALUES ($1, 0, 'Pending')", [itemId]);
  }
  const cur = await pool.query("SELECT scan_count FROM job_scans WHERE item_id = $1", [itemId]);
  const prev = cur.rows[0].scan_count || 0;
  const nextCount = prev >= 3 ? 3 : prev + 1;
  const newStatus = nextCount === 1 ? STEP1_STATUS_LABEL : nextCount === 2 ? STEP2_STATUS_LABEL : STEP3_STATUS_LABEL;
  await pool.query("UPDATE job_scans SET scan_count = $2, status = $3, last_scanned_at = NOW() WHERE item_id = $1", [itemId, nextCount, newStatus]);
  await pool.query("INSERT INTO job_scan_events (item_id, scan_number, new_status) VALUES ($1,$2,$3)", [itemId, nextCount, newStatus]);
  return { scan_count: nextCount, status: newStatus };
}

app.get("/scan", async (req, res) => {
  const { i, ts, sig, json } = req.query;
  if (!i || !ts || !sig) return res.status(400).send("Invalid scan URL");
  if (sig !== signPayload(i, ts)) return res.status(403).send("Signature check failed");
  if (!mondayAccessToken) return res.status(401).send("Not authenticated");

  try {
    const { scan_count, status } = await advanceScan(String(i));

    const mutation = `
      mutation ChangeValue($board: ID!, $item: ID!, $col: String!, $val: JSON!) {
        change_column_value(board_id: $board, item_id: $item, column_id: $col, value: $val) { id }
      }
    `;
    async function setCol(colId, val) {
      const variables = { board: String(BOARD_ID), item: String(i), col: colId, val };
      await axios.post(
        "https://api.monday.com/v2",
        { query: mutation, variables },
        { headers: { Authorization: mondayAccessToken, "Content-Type": "application/json" } }
      );
    }

    if (scan_count === 1 && CHECKED_IN_COLUMN_ID) {
      await setCol(CHECKED_IN_COLUMN_ID, JSON.stringify({ checked: "true" }));
    }

    if (scan_count >= 2 && STATUS_COLUMN_ID) {
      let val;
      if (scan_count === 2) {
        val = JSON.stringify({ label: STEP2_STATUS_LABEL });
      } else {
        val = JSON.stringify({ label: STEP3_STATUS_LABEL });
      }
      await setCol(STATUS_COLUMN_ID, val);
    }

    if (json) return res.json({ ok: true, scan_count, status });

    res.send(`
      <html><body style="font-family:Arial;padding:20px">
        <div>Scan recorded</div>
        <div>Count: ${scan_count} — Status: <b>${status}</b></div>
        <script>setTimeout(()=>{ try{window.close()}catch(e){} }, 1200)</script>
      </body></html>
    `);
  } catch {
    if (json) return res.status(500).json({ ok:false, error:"Failed to update" });
    res.status(500).send("Failed to update");
  }
});

app.get("/api/qr", async (req, res) => {
  const data = req.query.data || "";
  try {
    const buf = await QRCode.toBuffer(data, { width: 384, margin: 0 });
    res.set("Content-Type", "image/png");
    res.send(buf);
  } catch {
    res.status(400).send("Invalid QR data");
  }
});

app.listen(PORT, async () => {
  try { await initDb(); } catch {}
  console.log(`Server running on port ${PORT}`);
});
