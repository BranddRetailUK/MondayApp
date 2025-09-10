const express = require("express");
const axios = require("axios");
const path = require("path");
const dotenv = require("dotenv");
const crypto = require("crypto");
const QRCode = require("qrcode");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const CLIENT_ID = (process.env.MONDAY_CLIENT_ID || "").trim();
const CLIENT_SECRET = (process.env.MONDAY_CLIENT_SECRET || "").trim();
const REDIRECT_URI = (process.env.MONDAY_REDIRECT_URI || "http://localhost:3000/callback").trim();
const BOARD_ID = (process.env.BOARD_ID || "").trim();
const SCOPES = (process.env.MONDAY_SCOPES || "").trim();

const SCAN_SECRET = (process.env.SCAN_SECRET || "change-me").trim();
const STATUS_COLUMN_ID = (process.env.STATUS_COLUMN_ID || "").trim();
const STATUS_INDEX = process.env.STATUS_INDEX !== undefined ? parseInt(process.env.STATUS_INDEX, 10) : null;
const STATUS_LABEL = (process.env.STATUS_LABEL || "Done").trim();

const BOARD_PAGE_LIMIT = parseInt(process.env.BOARD_PAGE_LIMIT || '200', 10);
const BOARD_MAX_PAGES = parseInt(process.env.BOARD_MAX_PAGES || '3', 10);
const BOARD_CACHE_MS = parseInt(process.env.BOARD_CACHE_MS || '60000', 10);

let mondayAccessToken = null;

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
      redirect_uri: REDIRECT_URI,
    });
    mondayAccessToken = response.data.access_token;
    res.send("Authentication successful! <a href='/'>Go to Dashboard</a>");
  } catch (err) {
    res.status(500).send("Failed to authenticate (see logs).");
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
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch board" });
  } finally {
    boardCache.inFlight = null;
  }
});

async function fetchBoardLitePaged() {
  let limit = BOARD_PAGE_LIMIT;
  let cursor = null;
  let items = [];
  for (let page = 0; page < BOARD_MAX_PAGES; page++) {
    const query = `
      query($boardId: [Int!], $limit: Int!, $cursor: String) {
        boards(ids: $boardId) {
          items_page(limit: $limit, cursor: $cursor) {
            cursor
            items { id name group { title } }
          }
        }
      }
    `;
    const variables = { boardId: parseInt(BOARD_ID, 10), limit, cursor };
    const resp = await axios.post(
      "https://api.monday.com/v2",
      { query, variables },
      { headers: { Authorization: mondayAccessToken, "Content-Type": "application/json" } }
    );

    if (resp.data?.errors?.length) {
      const msg = String(resp.data.errors[0]?.message || "");
      if (msg.includes("Complexity budget exhausted")) {
        await new Promise(r => setTimeout(r, 3000));
        limit = Math.max(50, Math.floor(limit / 2));
        page--;
        continue;
      }
      throw new Error(msg);
    }

    const pageObj = resp.data?.data?.boards?.[0]?.items_page;
    if (!pageObj) break;
    items = items.concat(pageObj.items || []);
    cursor = pageObj.cursor || null;
    if (!cursor) break;
  }

  const grouped = {};
  for (const it of items) {
    const title = it?.group?.title || "Ungrouped";
    if (!grouped[title]) grouped[title] = [];
    grouped[title].push({ id: it.id, name: it.name });
  }

  const groups = Object.entries(grouped).map(([title, arr]) => ({
    title,
    items_page: { items: arr }
  }));

  return { boards: [{ groups }] };
}

app.get("/api/scan-url", (req, res) => {
  const { itemId, status } = req.query;
  if (!itemId) return res.status(400).json({ error: "itemId required" });
  const ts = Date.now().toString();
  const sig = signPayload(itemId, ts);
  const s = status || STATUS_LABEL;
  const base = `${req.protocol}://${req.get("host")}`;
  const url = `${base}/scan?i=${encodeURIComponent(itemId)}&s=${encodeURIComponent(s)}&ts=${ts}&sig=${sig}`;
  res.json({ url });
});

app.get("/scan", async (req, res) => {
  const { i, s, ts, sig } = req.query;
  if (!i || !ts || !sig) return res.status(400).send("Invalid scan URL");
  if (sig !== signPayload(i, ts)) return res.status(403).send("Signature check failed");
  if (!mondayAccessToken) return res.status(401).send("Not authenticated");
  if (!STATUS_COLUMN_ID) return res.status(400).send("STATUS_COLUMN_ID not configured");

  try {
    const value = STATUS_INDEX !== null ? JSON.stringify({ index: STATUS_INDEX }) : JSON.stringify({ label: s || STATUS_LABEL });
    const mutation = `
      mutation ChangeStatus($board:Int!,$item:Int!,$col:String!,$val:JSON!) {
        change_column_value(board_id:$board,item_id:$item,column_id:$col,value:$val){ id }
      }
    `;
    const variables = { board: parseInt(BOARD_ID, 10), item: parseInt(i, 10), col: STATUS_COLUMN_ID, val: value };
    await axios.post(
      "https://api.monday.com/v2",
      { query: mutation, variables },
      { headers: { Authorization: mondayAccessToken, "Content-Type": "application/json" } }
    );
    res.send("<html><body style='font-family:Arial;padding:20px'>Status updated. You can close this tab.</body></html>");
  } catch (e) {
    res.status(500).send("Failed to update status");
  }
});

app.get("/api/qr", async (req, res) => {
  const data = req.query.data || "";
  try {
    const buf = await QRCode.toBuffer(data, { width: 384, margin: 0 });
    res.set("Content-Type", "image/png");
    res.send(buf);
  } catch (e) {
    res.status(400).send("Invalid QR data");
  }
});

app.listen(PORT, () => {});
