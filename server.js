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

const BOARD_PAGE_LIMIT = parseInt(process.env.BOARD_PAGE_LIMIT || "50", 10);
const BOARD_MAX_PAGES = parseInt(process.env.BOARD_MAX_PAGES || "2", 10);
const BOARD_CACHE_MS = parseInt(process.env.BOARD_CACHE_MS || "300000", 10);

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
      redirect_uri: REDIRECT_URI
    });
    mondayAccessToken = response.data.access_token;
    console.log("Got Monday access token");
    res.send("Authentication successful! <a href='/'>Go to Dashboard</a>");
  } catch (err) {
    console.error("OAuth token exchange error:", err.response?.data || err.message || err);
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
    console.error("Error in /api/board:", err.response?.data || err.message || err);
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

    if (resp.data?.errors?.length) {
      const msg = String(resp.data.errors[0]?.message || "");
      if (msg.includes("Complexity budget exhausted")) {
        console.warn("Complexity exhausted — returning partial data");
        break;
      }
      throw new Error(msg);
    }

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

  console.log(`Fetched ${items.length} items across ${pages} page(s)`);
  return { boards: [{ groups }] };
}


app.get("/api/scan-url", (req, res) => {
  const { itemId } = req.query;
  if (!itemId) return res.status(400).json({ error: "itemId required" });
  const ts = Date.now().toString();
  const sig = signPayload(itemId, ts);
  const base = `${req.protocol}://${req.get("host")}`;
  const url = `${base}/scan?i=${encodeURIComponent(itemId)}&ts=${ts}&sig=${sig}`;
  res.json({ url });
});

app.get("/scan", async (req, res) => {
  const { i, ts, sig } = req.query;
  if (!i || !ts || !sig) return res.status(400).send("Invalid scan URL");
  if (sig !== signPayload(i, ts)) return res.status(403).send("Signature check failed");
  if (!mondayAccessToken) return res.status(401).send("Not authenticated");
  if (!STATUS_COLUMN_ID) return res.status(400).send("STATUS_COLUMN_ID not configured");

  try {
    let value;

    if (STATUS_COLUMN_ID.startsWith("checkbox")) {
      // fetch current checkbox value
      const q = `
        query($boardId: [ID!], $itemId: [ID!]) {
          boards(ids: $boardId) {
            items(ids: $itemId) {
              column_values(ids: ["${STATUS_COLUMN_ID}"]) {
                id
                value
              }
            }
          }
        }
      `;
      const vars = { boardId: [BOARD_ID], itemId: [i] };
      const resp = await axios.post(
        "https://api.monday.com/v2",
        { query: q, variables: vars },
        { headers: { Authorization: mondayAccessToken, "Content-Type": "application/json" } }
      );

      let currentVal = false;
      try {
        const valObj = JSON.parse(resp.data.data.boards[0].items[0].column_values[0].value || "{}");
        currentVal = valObj.checked === "true";
      } catch {}

      value = JSON.stringify({ checked: currentVal ? "false" : "true" });
    } else {
      // fallback: status column
      value = Number.isInteger(STATUS_INDEX)
        ? JSON.stringify({ index: STATUS_INDEX })
        : JSON.stringify({ label: STATUS_LABEL });
    }

    const mutation = `
      mutation ChangeValue($board: ID!, $item: ID!, $col: String!, $val: JSON!) {
        change_column_value(board_id: $board, item_id: $item, column_id: $col, value: $val) { id }
      }
    `;
    const variables2 = {
      board: String(BOARD_ID),
      item: String(i),
      col: STATUS_COLUMN_ID,
      val: value
    };

    const updateResp = await axios.post(
      "https://api.monday.com/v2",
      { query: mutation, variables: variables2 },
      { headers: { Authorization: mondayAccessToken, "Content-Type": "application/json" } }
    );

    if (updateResp.data?.errors?.length) {
      console.error("Scan update error:", updateResp.data.errors);
      return res.status(500).send("Failed to update column (see logs).");
    }

    console.log(`Scan OK → item ${i} column ${STATUS_COLUMN_ID} updated`);
    res.send("<html><body style='font-family:Arial;padding:20px'>Checkbox toggled ✔️</body></html>");
  } catch (e) {
    console.error("Scan update failed:", e.response?.data || e.message || e);
    res.status(500).send("Failed to update column");
  }
});

app.get("/api/qr", async (req, res) => {
  const data = req.query.data || "";
  try {
    const buf = await QRCode.toBuffer(data, { width: 384, margin: 0 });
    res.set("Content-Type", "image/png");
    res.send(buf);
  } catch (e) {
    console.error("QR generation error:", e.message || e);
    res.status(400).send("Invalid QR data");
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
