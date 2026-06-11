# MondayApp Service Contract

Last reviewed: 2026-06-11

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
- Sets job type status from `PRINT` or `EMBROIDERY` when `JOB_TYPE_STATUS_COLUMN_ID` is configured.

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
- Syncs subitems by index.
- Missing subitems are created.
- Subitems with changed names are replaced by creating the replacement before deleting the old subitem.
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
- Unchanged signatures are skipped unless Monday subitem count does not match expected count.

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

## Known Risks And Maintenance Notes

- There is no automated test suite.
- `node_modules` is tracked in git despite `.gitignore` ignoring it.
- `.DS_Store` is tracked and currently dirty in the worktree.
- Monday webhooks and Dropbox webhooks do not validate webhook signatures in this code.
- `visual_jobs` table is required by routes but not created by `src/db/migrate.js`.
- Board pagination limits can affect item matching if the board grows beyond configured limits.
- `monday.js` and `mondayClient.js` are separate Monday clients with different auth/token handling.
- Visual notifications are in-memory and reset on process restart.
- Open-orders subitem sync is index-based; reordering source lines can cause replacement behavior.
