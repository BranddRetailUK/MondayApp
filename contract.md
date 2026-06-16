# MondayApp Service Contract

Last reviewed: 2026-06-16

## Purpose

MondayApp is a legacy Node/Express service that connects Monday.com, Dropbox CSV/XLSX files, a local dashboard, scanner/QR flows, PenCarrie stock/order APIs, and visual proof workflows.

The most important production path is the Dropbox/Open Orders import:

1. Legacy server writes job details to an open-orders CSV.
2. Dropbox webhook calls this service.
3. Service downloads the CSV and parses jobs/line items.
4. Service creates or updates Monday parent items and Monday subitems.
5. Local JSON state records job signatures so unchanged jobs are skipped.

## Entry Points

- Runtime entry: `server.js`, which loads `server.modular.js`.
- App composition: `src/app.js`.
- Static frontend: `public/`.
- DB bootstrap: `src/db/migrate.js`.
- Config: `src/config/env.js` and `src/config/mondayFields.js`.

## Key Files

- `src/services/openOrdersSync.js`: imports `open_orders.csv` into Monday parent items and subitems.
- `src/services/openOrdersParser.js`: parses the legacy open-orders CSV format.
- `src/services/openOrdersState.js`: stores per-job state in `data/open-orders-state.json` by default.
- `src/routes/dropbox-webhook.js`: Dropbox webhook handler that triggers open-orders sync.
- `src/services/mondayClient.js`: token-based Monday GraphQL helper for item, subitem, status, file, and update mutations.
- `src/services/monday.js`: older OAuth/session Monday helper used by dashboard/scanner file upload flows.
- `src/routes/monday-events.js`: Monday webhook handler for visual status changes, file notifications, and create-item line-item imports.
- `src/services/dropboxLineItemImporter.js`: imports per-job XLSX/CSV line-item files from Dropbox into an existing Monday item.
- `src/routes/visual-jobs.js`: worker queue API for local visual generation.
- `visual-runner.js` and `visual generator/`: local visual generation runner/assets.

## Webhooks

### Dropbox Open Orders Webhook

- Mounted path: `GET /api/dropbox/webhook`
- Purpose: Dropbox challenge verification.
- Query: `challenge`
- Response: raw challenge string.

- Mounted path: `POST /api/dropbox/webhook`
- Purpose: starts background sync from Dropbox `OPEN_ORDERS_DROPBOX_PATH` into Monday.
- Response: immediately returns `{ ok: true }` before sync completes.
- Concurrency: route-local `syncInFlight` ignores duplicate webhook calls while one sync is running.
- Main logic:
  - `syncOpenOrdersFromDropbox()`
  - downloads `OPEN_ORDERS_DROPBOX_PATH` to `OPEN_ORDERS_LOCAL_PATH`
  - parses jobs using `parseOpenOrdersFile`
  - indexes existing Monday items by job number
  - creates new jobs or updates changed jobs

### Monday Events Webhook

- Mounted path: `POST /api/monday/events`
- Purpose: handles several Monday event types.
- Payload normalization accepts top-level fields or Monday `event` fields:
  - `boardId`, `itemId`, `columnId`, `newLabel`
  - `event.boardId`, `event.pulseId`, `event.itemId`, `event.columnId`, `event.type`, `event.value`
- Logic:
  - If `columnId === JOB_FILES_COLUMN_ID` and `boardId === BOARD_ID`, add a visual approval notification.
  - If event type is `create_pulse` or `create_item`, run line-item import for matching Dropbox per-job file.
  - Otherwise only visual-board status events are processed.
  - For visual board events, only the configured visual status column is accepted.
  - Status label must be `START`; then item fields are validated, status is set to in-progress, an update is posted, and `/api/visual-jobs/enqueue` is called.

- Mounted path: `POST /api/monday/echo`
- Purpose: debug echo for webhook payloads.

## Open Orders CSV Sync Contract

### Source Format

Parsed by `src/services/openOrdersParser.js`.

Each job block:

```text
JOB_NUMBER
JOB_TYPE
CUSTOMER
JOB_TITLE
qty,size,colour,code,description
qty,size,colour,code,description
=====
```

Parsing details:

- Empty lines are ignored.
- `=====` finalizes the current job.
- Leading empty CSV cells are trimmed.
- Description preserves commas after the first four fields.
- Numeric size ranges like `9-11` are changed to use a non-breaking hyphen to stop Monday/date conversion.

### Monday Item Matching

Implemented in `fetchExistingJobs()` and `extractJobNumberFromItem()`.

- Prefer configured job-number column:
  - `LINEITEM_JOB_NO_COLUMN_ID`
  - fallback `mondayFields.COLS.JOB_NO`
- Fallback extracts a 5-digit job number from item name.
- `listBoardItems()` pages Monday board items.

### Create Logic

Implemented in `createJobOnMonday(job)`.

- Creates a parent item on `LINEITEM_BOARD_ID` / `LINEITEM_GROUP_ID`.
- Parent item name is:
  - `jobNumber - customer - jobTitle`
  - or `jobNumber - customer - jobType`
- Parent columns set when configured:
  - job number
  - customer
  - job title
- Creates one Monday subitem per parsed line item.
- Creates a final managed subitem named `TOTAL`; its quantity column is the sum of parsed line-item quantities.
- Sets job type status when `JOB_TYPE_STATUS_COLUMN_ID` is configured.
- Print status candidates: `PRINT`.
- Embroidery status candidates: `EMB`, `EMBROIDERY`, `EMBRODIERY`.

Important hardening:

- Parent items must not be deleted as rollback after partial create failure.
- If a subitem or status mutation fails after parent creation, preserve the parent item and retry later.
- Local state can retain a pending job with an item id.
- Job-type status failures are non-fatal for line-item sync.

### Update Logic

Implemented in `updateJobOnMonday(job, existingItem)`.

- Fetches current item and subitems from Monday.
- Tries to update parent job number/customer/title columns if they exist.
- Job-type status update is non-fatal.
- Syncs parsed line-item subitems by index, ignoring the managed `TOTAL` row while matching CSV rows.
- Missing subitems are created.
- Subitems with changed names are replaced by creating the replacement before deleting the old subitem.
- Ensures exactly one managed `TOTAL` subitem is last, with blank code/size/colour columns and the summed quantity.
- Duplicate or misplaced `TOTAL` subitems are treated as managed rows and removed independently of extra-subitem preservation.
- Extra subitems are preserved by default.
- Set `OPEN_ORDERS_DELETE_EXTRA_SUBITEMS=true` to allow deletion of extra subitems.

### Signature/State Logic

Implemented in `computeJobSignature()` and `openOrdersState.js`.

- Signature includes:
  - job number
  - job type
  - customer
  - job title
  - normalized line items
- State path:
  - `OPEN_ORDERS_STATE_PATH`
  - default `data/open-orders-state.json`
- State statuses:
  - `pending`
  - `created`
  - `updated`
- Unchanged signatures are skipped unless Monday subitems do not match the parsed line-item count plus `TOTAL`, or the managed `TOTAL` row is missing, duplicated, not last, or has the wrong quantity.

### Assessment Of Deletion Loop

The observed behavior where a job is created, line items are added, then the whole job disappears and sync starts again is a code-level issue, not expected Monday webhook behavior.

The previous create path deleted the parent item in a catch block if any operation after parent creation failed. A likely failure point is job-type status update after all subitems are created, for example a missing `PRINT` or `EMBROIDERY` label on the configured status column. That made the UI look like Monday removed the job after all line items were added, then the next webhook recreated it.

Current contract: never delete the parent item as cleanup for a sync failure. Preserve it and let the next sync update it.

## Dropbox Per-Job Line-Item Import

Implemented in `src/services/dropboxLineItemImporter.js`.

- Source folder: `DROPBOX_IMPORT_FOLDER`, default `/MONDAY`.
- Archive folder: `DROPBOX_ARCHIVE_FOLDER`, default `/MONDAY/archive`.
- Error folder: `DROPBOX_ERROR_FOLDER`, default `/MONDAY/errors`.
- Finds files by 5-digit job number in filename.
- Parses first worksheet using `xlsx`.
- Required normalized columns:
  - `productid`
  - `sstylecode`
  - `sstyle`
  - `scolour`
  - `ssize`
  - `lngqty`
- Creates subitems on an existing Monday item.
- Moves source file to archive on success or error folder on failure.
- Has in-memory `activeJobs` set to avoid duplicate processing for the same job number.

Triggered by:

- Script: `npm run import:dropbox`
- Monday create-item webhook: `POST /api/monday/events`

## API Endpoints

### Health And Status

- `GET /health`: returns `{ ok: true }`.
- `GET /api/status`: returns `{ ok: true, mondayAuthenticated: boolean }`.

### Monday Auth And Board

- `GET /auth`: redirects to Monday OAuth authorize URL.
- `GET /callback`: exchanges OAuth code and redirects to `/`.
- `GET /api/board`: returns cached Monday board data for dashboard. Requires Monday token/auth.

### Scanner And QR

- `GET /api/scan-states`: returns DB-backed scan state map.
- `GET /api/scan-url?itemId=...`: returns signed scan URL.
- `GET /scan?i=...&ts=...&sig=...`: records a scan and updates Monday columns.
- `POST /api/scanner`: accepts raw scanner data, records scan, updates Monday columns.
- `GET /api/qr?data=...&size=...&margin=...`: returns QR PNG.

Scanner progression:

- scan 1: local status `STEP1_STATUS_LABEL`, tick `CHECKED_IN_COLUMN_ID`
- scan 2: local status `STEP2_STATUS_LABEL`, set `STATUS_COLUMN_ID`
- scan 3: local status `STEP3_STATUS_LABEL`, set `STATUS_COLUMN_ID`

### Customers

- `GET /api/customers/search?q=...`
- `GET /api/customers`
- `POST /api/customers`
- `GET /api/customers/:id`
- `GET /api/customers/:id/orders`

### Orders

- `GET /api/orders?limit=...`
- `POST /api/orders`
- `GET /api/orders/:id`

Order uploads use `multer` and write file metadata to `order_files`.

### DATABASE

The dashboard has a `DATABASE` tab backed by a 2025/2026 MDB import.

Frontend files:

- `public/index.html`: sidebar tab and legacy-style DATABASE hub markup.
- `public/database.js`: DATABASE home screen, manual new-order form, outstanding order grouping, order navigation, order detail tabs, line-item rendering, and design-position rendering.
- `public/database-job.html`: older direct full-width job info page retained as a fallback.
- `public/database-job.js`: older job facts, contact fields, line items, and positions rendering for the fallback page.
- `public/styles.css`: scoped legacy DATABASE hub styles plus older fallback page table styles.

Backend files:

- `src/routes/database.js`: `/api/database` JSON endpoints.
- `src/db/databaseSchema.js`: idempotent table creation.
- `scripts/import-database-mdb.js`: imports `PS_XP_tab.mdb` into Railway/Postgres.

Endpoints:

- `GET /api/database/summary`: returns counts for jobs, line items, positions, import status, counts by year, and counts by type.
- `GET /api/database/jobs?q=&customer=&type=&year=&status=&limit=&offset=`: returns paginated jobs. Default and UI page size is 100 jobs. Search covers job number, customer, job title, contact name/email, client order number, line description, style code, style name, colour, and size. The list response also includes imported order flags and timestamps used by the legacy outstanding-orders grid.
- `GET /api/database/outstanding-counts`: returns open order counts grouped as Printing, Embroidery, and Business Gifts using the same `order_type`/`order_type_abbr` category rules as the legacy UI.
- `GET /api/database/customers?q=`: returns distinct customers from `database_jobs` in alphabetical order, with each customer's latest order number, latest job title, latest order date, contact, customer code, and order count.
- `GET /api/database/customers/:key`: returns one DATABASE customer aggregate. `:key` is either a numeric imported `customer_id` or `name:<customer name>` for rows without a source customer id. The response includes all 2025/2026 jobs for the customer, unique recorded contact rows grouped from job contact fields, and imported customer addresses from `database_customer_addresses` with manual job invoice/delivery address text as a fallback.
- `GET /api/database/customers/search?q=`: searches distinct customer/contact values from `database_jobs`, using the same imported customer data that populates outstanding orders and order details.
- `POST /api/database/jobs`: creates a real manual `database_jobs` row from the legacy New Order form. Required fields are customer, order type, job title, order date, and delivery date. The route allocates the next source order id/order number in a transaction and marks the row `is_manual_entry = true`.
- `GET /api/database/jobs/:id`: returns one job plus contact fields, line items, and position rows. `:id` may be source order id or job number.
- `PUT /api/database/jobs/:id/positions`: replaces editable design-position rows for one job. It updates existing `database_job_positions`, inserts new rows with allocated legacy-compatible `source_order_position_id` values, and removes cleared rows.

Import rules:

- Source file: `PS_XP_tab.mdb`.
- Included years: 2025 and 2026 only.
- Date basis: `tblOrder.dtOrder`, falling back to `tblOrder.dtCreate`.
- Default import mode replaces the current DATABASE snapshot inside one transaction.
- `--append` skips deletes and upserts into existing rows.
- The importer prefers `DATABASE_PUBLIC_URL` when running locally against Railway DB service variables.
- Run against Railway DB service variables:

```bash
railway run --service DB node scripts/import-database-mdb.js PS_XP_tab.mdb
```

UI rules:

- The DATABASE tab is a fixed-size, centered legacy-style hub matching the Access-era reference UI colors, scale, spacing, and layout, with every DATABASE view rendered at 120% legacy scale and empty blue background around the reference canvas on wider dashboard screens.
- The DATABASE home screen is the default tab screen and includes the New Order button, main menu buttons, outstanding-actions panel, admin buttons, and backup-status panel. The outstanding-actions panel shows three open-order counts for Printing, Embroidery, and Business Gifts, sourced from `/api/database/outstanding-counts`. The legacy blue footer bar is intentionally omitted in the dashboard hub.
- The New Order button opens a centered legacy form without placeholder lookup buttons, fake combo-arrow buttons, or a customer-date checkbox. The customer field live-searches `/api/database/customers/search` as the user types; selecting a customer fills contact, delivery address, and invoice address fields from stored DATABASE customer/order data when available. Accept creates a manual job row in `database_jobs`, carrying through selected customer/contact ids and codes when present, then opens that created order in the order-details view.
- The Customers main-menu button opens a legacy-styled list page backed only by `database_jobs`, not the separate dashboard customer tables. Customers are sorted alphabetically, searchable at the top of the page, and each row shows the latest order next to the customer record. Clicking a customer row opens a legacy-style customer page in the DATABASE tab.
- The customer page mirrors the legacy Access-era customer layout with Customer, Code, Account manager, created/edited metadata, a gray lookup panel, and tabs for Orders, Contacts, Addresses, Quotations, Communications, and Actions. The Orders tab lists all 2025/2026 orders for that customer and opens the existing order view when an order is clicked. The Contacts tab lists every unique recorded contact from the customer's jobs. The Addresses tab lists imported MDB addresses for customers present in the 2025/2026 snapshot, plus manual job invoice/delivery address text as a fallback. Quotations, Communications, and Actions are present as empty legacy tabs because those records are not imported into the current snapshot.
- The Outstanding Orders tab loads open jobs through `/api/database/jobs?status=open`, follows pagination until all open jobs are loaded, and groups rows into Print, Embroidery, Gifts, and Other using `order_type`/`order_type_abbr`.
- Clicking an outstanding order opens the in-tab order view. Users can return to the DATABASE home screen with the top-left Home button.
- The order view has three top tabs: Order details, Order Items, and Design. These tabs switch in place without navigating away from the dashboard. The order header reserves spacing above the tabs so document buttons and the metadata panel do not touch or overlap the tab strip. Clicking the customer control in Order details opens the customer page for that order's customer.
- Order details surfaces every imported job field that maps to the reference screen, including customer/contact, type, dates, client reference, comments, invoice fields, and boolean flags.
- Order Items splits imported line items into stock, non-stock, non-deliverable, and internal sections using existing line-item flags and product/style data.
- Design renders imported `database_job_positions` rows and the job `screen_numbers` field. Position, Colour, and Design cells are editable; changes autosave every 5 seconds and flush immediately before switching order tabs, opening another order, leaving DATABASE, or leaving the browser page.
- `/database-job.html?id=<source_order_id>` remains a direct fallback page, but the dashboard DATABASE tab is now the primary workflow.

Core source mappings:

- Jobs: `tblOrder` joined to `tblCustomer`, `tblContact`, and `tblOrderType`.
- Manual New Order rows store non-MDB form fields directly on `database_jobs`: `delivery_method`, `payment_terms`, `order_taken_by`, `delivery_address`, `invoice_address`, and `is_manual_entry`.
- Customer addresses: `tblAddress`, joined through `tblCustomer.invaddressid` / `tblCustomer.deladdressid`, selected 2025/2026 `tblOrder.invaddressid` / `tblOrder.deladdressid`, and selected-customer `tblContact.addressid`. The importer only writes address rows for customers that appear in the 2025/2026 order snapshot, so historic-only customers and addresses are excluded. Imported jobs also store `invoice_address_id`, `delivery_address_id`, and formatted invoice/delivery address text from `tblAddress`.
- Line items: `tblOrderItem` joined to `tblProduct`, `tblStyle`, `tblStyleColour`, `tblColour`, `tblStyleSize`, `tblSize`, `tblProductType`, and `tblSupplier`.
- Positions: `tblOrderPosition`: `orderpositionid` maps to `source_order_position_id`, `orderid` to `source_order_id`, `sposition` to `position_name`, `memcolour` to `colour_notes`, and `sdesign` to `design_ref`.

Current imported production snapshot, verified on 2026-06-11:

- `database_jobs`: 1,162 rows.
- `database_job_line_items`: 5,870 rows.
- `database_job_positions`: 1,664 rows.
- `database_customer_addresses`: importer dry run against root `PS_XP_tab.mdb` on 2026-06-16 returns 583 rows scoped to customers in the 2025/2026 order snapshot.
- Latest `database_import_runs.status`: `complete`.

### Files And Visual QA

- `POST /api/items/:itemId/file`: uploads an image to Monday `JOB_FILES_COLUMN_ID` and queues visual analysis.
- `GET /api/assets/:assetId/inline`: proxies a Monday asset inline.
- `GET /api/visual-approvals/notifications`: returns in-memory visual notification count/items.
- `GET /api/visual-approvals/:itemId`: returns proof/captured visual URLs and optional analysis.
- `POST /api/visual-approvals/:itemId/approve`: checks proof-approved column.
- `POST /api/visual-approvals/:itemId/reject`: moves parent item and subitems to pre-production group.

Note: `visual-approvals.js` contains a duplicate notifications route; the first one handles requests.

### Visual Worker Queue

Mounted at `/api/visual-jobs`.

- `POST /api/visual-jobs/enqueue`: inserts or requeues a visual job.
- `POST /api/visual-jobs/next`: worker claims next queued job. Requires `X-Worker-Key`.
- `POST /api/visual-jobs/heartbeat`: extends worker lock. Requires `X-Worker-Key`.
- `POST /api/visual-jobs/complete`: uploads finished visual to Monday and marks job done/failed. Requires `X-Worker-Key`.

The route expects a `visual_jobs` table with at least:

- `id`
- `board_id`
- `item_id`
- `group_id`
- `job_title`
- `job_no`
- `customer`
- `front_pos`
- `back_pos`
- `garment_colour`
- `front_art_url`
- `back_art_url`
- `metadata`
- `priority`
- `status`
- `attempts`
- `claimed_by`
- `lock_until`
- `output_url`
- `notes`
- `created_at`
- `updated_at`

### PenCarrie

Mounted at `/api/pencarrie`.

- `GET /api/pencarrie/debug/whoami`
- `GET /api/pencarrie/debug/ping`
- `GET /api/pencarrie/orders`
- `GET /api/pencarrie/orders/:ordcode`
- `GET /api/pencarrie/whoami`
- `GET /api/pencarrie/smoke`

`pencarrie.js` uses `src/integrations/pencarrie.js`; `pencarrie-smoke.js` is a direct gateway smoke/debug path.

## Database Tables

Created by `src/db/migrate.js`:

- `job_scans`
- `job_scan_events`
- `customers`
- `orders`
- `order_items`
- `order_files`
- `database_jobs`
- `database_job_line_items`
- `database_job_positions`
- `database_customer_addresses`
- `database_import_runs`

The visual queue routes require `visual_jobs`, but the current migration file does not create it. Treat that as a known schema gap unless a deployment migration exists outside this repo.

## Important Environment Variables

### Monday

- `MONDAY_API_TOKEN`
- `MONDAY_CLIENT_ID`
- `MONDAY_CLIENT_SECRET`
- `MONDAY_REDIRECT_URI`
- `MONDAY_SCOPES`
- `BOARD_ID`
- `BOARD_ID_MAIN`
- `BOARD_ID_VISUAL`
- `LINEITEM_BOARD_ID`
- `LINEITEM_GROUP_ID`
- `LINEITEM_JOB_NO_COLUMN_ID`
- `JOB_TYPE_STATUS_COLUMN_ID`
- `JOB_NO_COLUMN_ID`
- `CUSTOMER_COLUMN_ID`
- `JOB_TITLE_COLUMN_ID`
- `SUBITEM_CODE_COLUMN_ID`
- `SUBITEM_SIZE_COLUMN_ID`
- `SUBITEM_COLOUR_COLUMN_ID`
- `SUBITEM_QTY_COLUMN_ID`
- `STATUS_COLUMN_ID`
- `CHECKED_IN_COLUMN_ID`
- `JOB_FILES_COLUMN_ID`
- `FINISHED_VISUAL_COLUMN_ID`
- `VISUAL_QA_STATUS_COLUMN_ID`
- `VISUAL_QA_TEXT_COLUMN_ID`
- `PROOF_APPROVED_COLUMN_ID`
- `PRE_PRODUCTION_GROUP_ID`

### Dropbox

- `DROPBOX_APP_KEY`
- `DROPBOX_APP_SECRET`
- `DROPBOX_REFRESH_TOKEN`
- `DROPBOX_ACCESS_TOKEN`
- `DROPBOX_IMPORT_FOLDER`
- `DROPBOX_ARCHIVE_FOLDER`
- `DROPBOX_ERROR_FOLDER`
- `OPEN_ORDERS_DROPBOX_PATH`
- `OPEN_ORDERS_LOCAL_PATH`
- `OPEN_ORDERS_STATE_PATH`
- `OPEN_ORDERS_DELETE_EXTRA_SUBITEMS`

### App/DB

- `PORT`
- `DATABASE_URL`
- `PGSSLMODE`
- `SCAN_SECRET`
- `BOARD_PAGE_LIMIT`
- `BOARD_MAX_PAGES`
- `BOARD_CACHE_MS`
- `VERBOSE_SQL`

### Visual/OpenAI

- `OPENAI_API_KEY`
- `OPENAI_VISION_MODEL`
- `VISUAL_WORKER_KEY`
- `VISUAL_CLAIM_SECS`
- `INTERNAL_ENQUEUE_URL`

### PenCarrie

- `PENCARRIE_GATEWAY_URL`
- `PENCARRIE_CUSTOMER_CODE`
- `PENCARRIE_ENV`

## Scripts

- `npm start`: starts `server.js`.
- `npm run smoke:lineitems -- <file>`: parse a line-item XLSX/CSV file.
- `npm run import:dropbox`: import all pending per-job Dropbox line-item files.
- `npm run smoke:open-orders -- <file>`: parse an open-orders CSV file.
- `npm run sync:open-orders -- [file] [--dry-run]`: sync open-orders CSV from file or Dropbox.
- `npm run import:database-mdb -- [PS_XP_tab.mdb] [--dry-run] [--append]`: import 2025/2026 MDB jobs into DATABASE tables.

## Known Risks And Maintenance Notes

- There is no automated test suite.
- `node_modules` is tracked in git despite `.gitignore` ignoring it.
- `.DS_Store` is tracked and currently dirty in the worktree.
- Monday webhooks and Dropbox webhooks do not validate webhook signatures in this code.
- `visual_jobs` table is required by routes but not created by `src/db/migrate.js`.
- Board pagination limits can affect item matching if the board grows beyond configured limits.
- `monday.js` and `mondayClient.js` are separate Monday clients with different auth/token handling.
- Visual notifications are in-memory and reset on process restart.
- Open-orders line-item subitem sync is index-based; reordering source lines can cause replacement behavior. The managed `TOTAL` subitem is synced separately and should remain last.
- DATABASE imports use an MDB snapshot. Run a fresh import whenever the source MDB copy changes.
