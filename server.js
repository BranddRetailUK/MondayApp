const express = require("express");
const axios = require("axios");
const path = require("path");
const dotenv = require("dotenv");
const crypto = require("crypto");
const QRCode = require("qrcode");
const { Pool } = require("pg");
const multer = require("multer");
const fs = require("fs");


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

const uploadRoot = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadRoot)) fs.mkdirSync(uploadRoot, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadRoot),
  filename: (_req, file, cb) => {
    const ts = Date.now();
    const safe = file.originalname.replace(/[^\w.\-]+/g, "_");
    cb(null, `${ts}_${safe}`);
  }
});
const upload = multer({ storage });




async function initDb() {
  // --- Scanner tables (existing) ---
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

  // --- Customers table ---
  await pool.query(`
    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      business_name TEXT NOT NULL,
      contact_name TEXT,
      email TEXT NOT NULL,
      phone TEXT,
      mobile TEXT,

      inv_line1 TEXT, inv_line2 TEXT, inv_city TEXT, inv_region TEXT, inv_postcode TEXT, inv_country TEXT,
      ship_line1 TEXT, ship_line2 TEXT, ship_city TEXT, ship_region TEXT, ship_postcode TEXT, ship_country TEXT,

      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  // Touch updated_at on UPDATE
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'customers_touch_updated_at') THEN
        CREATE OR REPLACE FUNCTION customers_touch_updated_at()
        RETURNS TRIGGER AS $BODY$
        BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
        END; $BODY$ LANGUAGE plpgsql;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'customers_set_updated_at') THEN
        CREATE TRIGGER customers_set_updated_at
        BEFORE UPDATE ON customers
        FOR EACH ROW
        EXECUTE FUNCTION customers_touch_updated_at();
      END IF;
    END $$;
  `);

  // --- Orders table (robust; idempotent) ---
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      product_code TEXT,
      garment_type TEXT,
      product_title TEXT,
      colour TEXT,
      size TEXT,
      status TEXT DEFAULT 'Draft',
      notes TEXT,
      total TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  // Ensure columns exist if an older minimal "orders" table was present
  const maybeAdd = async (col, type, defaultSql = "") => {
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='orders' AND column_name='${col}'
        ) THEN
          EXECUTE 'ALTER TABLE orders ADD COLUMN ${col} ${type} ${defaultSql}';
        END IF;
      END $$;
    `);
  };
  await maybeAdd("product_code", "TEXT");
  await maybeAdd("garment_type", "TEXT");
  await maybeAdd("product_title", "TEXT");
  await maybeAdd("colour", "TEXT");
  await maybeAdd("size", "TEXT");
  await maybeAdd("status", "TEXT", "DEFAULT ''");
  await maybeAdd("notes", "TEXT");
  await maybeAdd("total", "TEXT");

  // --- Order line items (AFTER orders) ---
  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_items (
      id SERIAL PRIMARY KEY,
      order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
      line_no INTEGER,
      product_code TEXT,
      garment_type TEXT,
      product_title TEXT,
      colour TEXT,
      size TEXT,
      quantity INTEGER DEFAULT 1
    );
  `);

  // --- Files attached to orders ---
  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_files (
      id SERIAL PRIMARY KEY,
      order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mimetype TEXT,
      size INTEGER,
      path TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
}








let mondayAccessToken = MONDAY_API_TOKEN || null;
let boardCache = { data: null, expires: 0, inFlight: null };

app.use(express.static(path.join(__dirname, "public")));

app.use("/uploads", express.static(uploadRoot));


// Simple status endpoint
app.get("/api/status", (req, res) => {
  res.json({ ok: true, mondayAuthenticated: Boolean(mondayAccessToken), boardId: BOARD_ID || null });
});

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

// --- Update Monday helper (existing)
async function updateMondayItem(itemId, columnId, value) {
  const mutation = `
    mutation ChangeValue($board: ID!, $item: ID!, $col: String!, $val: JSON!) {
      change_column_value(board_id: $board, item_id: $item, column_id: $col, value: $val) { id }
    }
  `;
  const variables = { board: String(BOARD_ID), item: String(itemId), col: columnId, val: value };

  try {
    const resp = await axios.post(
      "https://api.monday.com/v2",
      { query: mutation, variables },
      { headers: { Authorization: mondayAccessToken, "Content-Type": "application/json" } }
    );
    if (resp.data?.errors) {
      console.error("❌ Monday API error:", resp.data.errors);
    } else {
      console.log(`✅ Monday updated: item ${itemId}, col ${columnId}, value ${value}`);
    }
  } catch (err) {
    console.error("❌ Failed to update Monday:", err.response?.data || err.message);
  }
}

app.get("/auth", (req, res) => res.redirect(buildAuthorizeUrl()));

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

// --- Board data (existing)
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

// --- NEW: compact scan-state map (existing)
app.get("/api/scan-states", async (_req, res) => {
  try {
    const q = await pool.query("SELECT item_id, scan_count, status FROM job_scans");
    const map = {};
    for (const r of q.rows) map[r.item_id] = { scan_count: r.scan_count, status: r.status };
    res.json({ ok: true, map });
  } catch (e) {
    console.error("scan-states error:", e);
    res.status(500).json({ ok: false, error: "failed" });
  }
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
  if (json) res.set("Access-Control-Allow-Origin", "*");
  if (!i || !ts || !sig) return res.status(400).send("Invalid scan URL");
  if (sig !== signPayload(i, ts)) return res.status(403).send("Signature check failed");
  if (!mondayAccessToken) return res.status(401).send("Not authenticated");

  try {
    const { scan_count, status } = await advanceScan(String(i));

    console.log(`[SCAN] item=${i} -> count=${scan_count}, status=${status}`);

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

app.post("/api/scanner", async (req, res) => {
  try {
    const { scan } = req.body;
    if (!scan || typeof scan !== "string") {
      return res.status(400).json({ error: "No scan data" });
    }

    console.log("📥 Raw scanner input:", scan);

    let url;
    try {
      url = new URL(scan.trim()); // full URL
    } catch {
      const host = req.get("host") || "localhost";
      url = new URL(`/scan?${scan.trim()}`, `http://${host}`);
    }

    const i = url.searchParams.get("i");
    let ts = url.searchParams.get("ts");
    let sig = url.searchParams.get("sig");
    if (!i) return res.status(400).json({ error: "Invalid scan string - no item id" });

    if (!ts) ts = Date.now().toString();
    if (!sig) sig = signPayload(i, ts);

    if (!mondayAccessToken) {
      return res.status(401).json({ error: "Not authenticated with Monday" });
    }

    // Increment scan state in your DB
    const { scan_count, status } = await advanceScan(String(i));
    console.log(`[API/SCANNER] item=${i} -> count=${scan_count}, status=${status}`);

    // 🔑 Call Monday updater
    if (scan_count === 1 && CHECKED_IN_COLUMN_ID) {
      await updateMondayItem(i, CHECKED_IN_COLUMN_ID, JSON.stringify({ checked: "true" }));
    }
    if (scan_count >= 2 && STATUS_COLUMN_ID) {
      const label = scan_count === 2 ? STEP2_STATUS_LABEL : STEP3_STATUS_LABEL;
      await updateMondayItem(i, STATUS_COLUMN_ID, JSON.stringify({ label }));
    }

    res.json({ ok: true, item: i, scan_count, status });
  } catch (err) {
    console.error("❌ Error in /api/scanner:", err);
    res.status(500).json({ error: "Failed to process scan" });
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

/** ---------------------------
 *       CUSTOMERS + ORDERS API
 *  ---------------------------
 */

// List customers
app.get("/api/customers", async (_req, res) => {
  try {
    const q = await pool.query(
      `SELECT id, business_name, contact_name, email, phone, mobile
       FROM customers
       ORDER BY created_at DESC`
    );
    res.json(q.rows);
  } catch (e) {
    console.error("GET /api/customers error", e);
    res.status(500).json({ error: "Failed to fetch customers" });
  }
});

// Get single customer
app.get("/api/customers/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const q = await pool.query(`SELECT * FROM customers WHERE id = $1`, [id]);
    if (!q.rowCount) return res.status(404).json({ error: "Not found" });
    res.json(q.rows[0]);
  } catch (e) {
    console.error("GET /api/customers/:id error", e);
    res.status(500).json({ error: "Failed to fetch customer" });
  }
});

// Create customer
app.post("/api/customers", async (req, res) => {
  const b = req.body || {};
  if (!b.business_name || !b.email) {
    return res.status(400).json({ error: "business_name and email are required" });
  }
  try {
    const q = await pool.query(
      `INSERT INTO customers
       (business_name, contact_name, email, phone, mobile,
        inv_line1, inv_line2, inv_city, inv_region, inv_postcode, inv_country,
        ship_line1, ship_line2, ship_city, ship_region, ship_postcode, ship_country)
       VALUES
       ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING id`,
      [
        b.business_name, b.contact_name || null, b.email,
        b.phone || null, b.mobile || null,
        b.inv_line1 || null, b.inv_line2 || null, b.inv_city || null,
        b.inv_region || null, b.inv_postcode || null, b.inv_country || null,
        b.ship_line1 || null, b.ship_line2 || null, b.ship_city || null,
        b.ship_region || null, b.ship_postcode || null, b.ship_country || null
      ]
    );
    res.status(201).json({ id: q.rows[0].id });
  } catch (e) {
    console.error("POST /api/customers error", e);
    res.status(500).json({ error: "Failed to create customer" });
  }
});

// Update customer
app.put("/api/customers/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const b = req.body || {};
  try {
    await pool.query(
      `UPDATE customers SET
        business_name = COALESCE($1, business_name),
        contact_name  = COALESCE($2, contact_name),
        email         = COALESCE($3, email),
        phone         = COALESCE($4, phone),
        mobile        = COALESCE($5, mobile),
        inv_line1=$6, inv_line2=$7, inv_city=$8, inv_region=$9, inv_postcode=$10, inv_country=$11,
        ship_line1=$12, ship_line2=$13, ship_city=$14, ship_region=$15, ship_postcode=$16, ship_country=$17,
        updated_at = NOW()
       WHERE id = $18`,
      [
        b.business_name || null, b.contact_name || null, b.email || null,
        b.phone || null, b.mobile || null,
        b.inv_line1 || null, b.inv_line2 || null, b.inv_city || null,
        b.inv_region || null, b.inv_postcode || null, b.inv_country || null,
        b.ship_line1 || null, b.ship_line2 || null, b.ship_city || null,
        b.ship_region || null, b.ship_postcode || null, b.ship_country || null,
        id
      ]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("PUT /api/customers/:id error", e);
    res.status(500).json({ error: "Failed to update customer" });
  }
});

// List orders with preview of first line item
app.get("/api/orders", async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
  try {
    const q = await pool.query(
      `WITH first_items AS (
         SELECT DISTINCT ON (oi.order_id)
           oi.order_id, oi.product_code, oi.product_title, oi.colour, oi.size
         FROM order_items oi
         ORDER BY oi.order_id, COALESCE(oi.line_no, 999999)
       )
       SELECT o.*,
              c.business_name AS customer_name,
              fi.product_code AS fi_code,
              fi.product_title AS fi_title,
              fi.colour AS fi_colour,
              fi.size AS fi_size
       FROM orders o
       LEFT JOIN customers c ON c.id = o.customer_id
       LEFT JOIN first_items fi ON fi.order_id = o.id
       ORDER BY o.created_at DESC
       LIMIT $1`,
      [limit]
    );

    const rows = q.rows.map(r => ({
      ...r,
      first_item: {
        product_code: r.fi_code,
        product_title: r.fi_title,
        colour: r.fi_colour,
        size: r.fi_size
      }
    }));
    res.json(rows);
  } catch (e) {
    console.error("GET /api/orders error", e);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

// Create order (multipart/form-data) + file uploads
app.post("/api/orders", upload.array("files", 20), async (req, res) => {
  try {
    const { customer_id, status, notes } = req.body;
    if (!customer_id) return res.status(400).json({ error: "customer_id is required" });

    let items = [];
    try {
      items = JSON.parse(req.body.items || "[]");
      if (!Array.isArray(items)) items = [];
    } catch { items = []; }

    if (!items.length && (req.body.product_code || req.body.product_title || req.body.colour || req.body.size)) {
      items = [{
        line_no: 1,
        product_code: req.body.product_code || null,
        garment_type: req.body.garment_type || null,
        product_title: req.body.product_title || null,
        colour: req.body.colour || null,
        size: req.body.size || null,
        quantity: 1
      }];
    }

    if (!items.length) return res.status(400).json({ error: "At least one order item is required" });

    const first = items[0] || {};
    const q = await pool.query(
      `INSERT INTO orders
       (customer_id, product_code, garment_type, product_title, colour, size, status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id`,
      [
        parseInt(customer_id,10),
        first.product_code || null,
        first.garment_type || null,
        first.product_title || null,
        first.colour || null,
        first.size || null,
        status || 'Draft',
        notes || null
      ]
    );
    const orderId = q.rows[0].id;

    for (const it of items) {
      await pool.query(
        `INSERT INTO order_items
          (order_id, line_no, product_code, garment_type, product_title, colour, size, quantity)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          orderId,
          it.line_no || null,
          it.product_code || null,
          it.garment_type || null,
          it.product_title || null,
          it.colour || null,
          it.size || null,
          parseInt(it.quantity || 1, 10)
        ]
      );
    }

    const files = req.files || [];
    for (const f of files) {
      await pool.query(
        `INSERT INTO order_files (order_id, filename, mimetype, size, path)
         VALUES ($1,$2,$3,$4,$5)`,
        [orderId, f.filename, f.mimetype || null, f.size || null, `/uploads/${f.filename}`]
      );
    }

    res.status(201).json({ id: orderId });
  } catch (e) {
    console.error("POST /api/orders failed:", e);
    res.status(500).json({ error: "Failed to create order" });
  }
});

// Previous orders for a specific customer
app.get("/api/customers/:id/orders", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });

  try {
    const q = await pool.query(
      `SELECT id AS order_number, status, total, created_at
       FROM orders
       WHERE customer_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [id]
    );
    res.json(q.rows);
  } catch (e) {
    console.error("GET /api/customers/:id/orders error", e);
    res.status(500).json({ error: "Failed to fetch customer orders" });
  }
});

// Get single order (with items and files)
app.get("/api/orders/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const o = await pool.query(
      `SELECT o.*, c.business_name AS customer_name
       FROM orders o
       LEFT JOIN customers c ON c.id = o.customer_id
       WHERE o.id=$1`,
      [id]
    );
    if (!o.rowCount) return res.status(404).json({ error: "Not found" });

    const items = await pool.query(
      `SELECT id, line_no, product_code, garment_type, product_title, colour, size, quantity
       FROM order_items
       WHERE order_id=$1
       ORDER BY COALESCE(line_no, 999999), id`,
      [id]
    );
    const files = await pool.query(
      `SELECT id, filename, mimetype, size, path, created_at
       FROM order_files
       WHERE order_id=$1
       ORDER BY created_at ASC`,
      [id]
    );

    res.json({ order: o.rows[0], items: items.rows, files: files.rows });
  } catch (e) {
    console.error("GET /api/orders/:id error", e);
    res.status(500).json({ error: "Failed to fetch order" });
  }
});


app.get("/api/customers/search", async (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) return res.json([]);
  try {
    const r = await pool.query(
      `SELECT id, business_name, contact_name, email
       FROM customers
       WHERE business_name ILIKE $1 OR contact_name ILIKE $1 OR email ILIKE $1
       ORDER BY business_name ASC
       LIMIT 20`,
      [`%${q}%`]
    );
    res.json(r.rows);
  } catch {
    res.json([]);
  }
});


app.listen(PORT, async () => {
  try { await initDb(); } catch (e) { console.error("DB init error", e); }
  console.log(`Server running on port ${PORT}`);
});
