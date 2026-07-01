# MondayApp Service Contract

Last reviewed: 2026-07-01

## Purpose

MondayApp is a legacy Node/Express service that connects Monday.com, Dropbox CSV/XLSX files, Railway/Postgres database views, Cloudinary-backed dashboard files, a local dashboard, scanner/QR flows, and visual proof workflows.

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
- Hub auth: `/login` and `/signup` serve the app login/signup page. The dashboard entry points `/`, `/index.html`, `/database-job.html`, and `/launch.html` require a Hub session. Static assets remain public, but browser app APIs for the board, DATABASE, Test Dashboard, visual approvals, and file upload/proxy routes require a Hub session.
- Ultimate Hub dashboard tabs: Dashboard, DATABASE, Visual Approvals, and Test Dashboard. The active top-level dashboard tab is stored in browser localStorage so a page refresh returns the user to the last selected tab, unless an explicit `?tab=` query or matching hash such as `#database` or `#test-dashboard` selects a valid tab. The old standalone `MERCH TRAFFIC`, Orders, Customers, Stock, Shipping, and PenCarrie tabs have been removed. DATABASE order/customer/stock workflows remain part of the DATABASE tab.
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
- `src/routes/test-dashboard.js`: DB-backed test dashboard API, scanner flow, status/priority state, and Cloudinary file metadata routes.
- `src/services/testDashboardDefaults.js`: mirrored dashboard group/column/status defaults for the test dashboard.
- `src/services/cloudinaryDashboard.js`: Cloudinary config, upload signing, seed upload, and asset deletion helpers for test dashboard file columns.
- `src/routes/hub-auth.js`: Ultimate Hub signup/login/session endpoints.
- `src/services/hubAuth.js`: scrypt password hashing, session-cookie creation, and current-user lookup.
- `src/middleware/hubAuth.js`: attaches `req.hubUser` and protects page/API routes.
- `visual-runner.js` and `visual generator/`: local visual generation runner/assets.

## Webhooks

### Dropbox Open Orders Webhook

- Mounted path: `GET /api/dropbox/webhook`
- Purpose: Dropbox challenge verification.
- Query: `challenge`
- Response: raw challenge string.
- Auth: public machine-to-machine route mounted before Hub API auth.

- Mounted path: `POST /api/dropbox/webhook`
- Purpose: starts background sync from Dropbox `OPEN_ORDERS_DROPBOX_PATH` into Monday.
- Response: immediately returns `{ ok: true }` before sync completes.
- Auth: public machine-to-machine route mounted before Hub API auth.
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

### Legacy Access CSV Exporter

The VM-side Access exporter lives in `database2monday_script/uvm_terminal_nohtml_nopositions_ver2.py`.

- Reads `uvm_settings.txt` from the executable folder, its parent folder, or the current working directory. This supports the packaged `dist/` executable while keeping settings beside the script folder.
- Connects to `PS_XP_tab.mdb` with `PS_XP_sys.mdw` through the 32-bit Microsoft Access ODBC driver.
- Reconnects after connection/export-loop failures instead of exiting silently.
- Writes daily logs under `logs/` beside the executable/script and writes `last_export_status.json`; when the Dropbox output folder exists it also writes `open_orders_export_status.json` beside `open_orders.csv`.
- Refreshes the customer lookup every export cycle so jobs for newly-created customers are not skipped by a stale startup cache.
- Writes `open_orders.csv` via a temporary file and atomic replace so a failed export does not truncate the last good CSV.
- Supports `--once` for a single diagnostic export pass.
- `start_exporter.bat` starts the normal VM loop and `run_export_once.bat` runs one diagnostic export from the correct working directory.
- `build_exe.bat` rebuilds the replacement Windows executable on the 32-bit Access VM using 32-bit Python and PyInstaller.

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

### Ultimate Hub Auth

- `GET /login`: serves the Hub login/signup page in login mode.
- `GET /signup`: serves the same page in signup mode.
- `GET /api/auth/me`: returns `{ user }` for the current Hub session, or `null`.
- `POST /api/auth/signup`: creates a `hub_users` row and starts a session. Requires `email`, `first_name`, `last_name`, and `password`. Signup email addresses must be exactly on `@ultimatepromotions.co.uk`.
- `POST /api/auth/login`: verifies email/password and starts a session.
- `POST /api/auth/logout`: deletes the current session and clears the cookie.

Security rules:

- Passwords are stored only as Node `crypto.scrypt` hashes with per-user random salts.
- Session cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` in production/HTTPS.
- Database session rows store only a SHA-256 hash of the random browser session token.
- Monday OAuth remains on `/auth` and `/callback`; do not reuse those paths for Hub login.

### Health And Status

- `GET /health`: returns `{ ok: true }`.
- `GET /api/status`: returns `{ ok: true, mondayAuthenticated: boolean, hubAuthenticated: boolean }`.

### Monday Auth And Board

- `GET /auth`: redirects to Monday OAuth authorize URL.
- `GET /callback`: exchanges OAuth code and redirects to `/`.
- `GET /api/board`: returns cached Monday board data for dashboard. Requires Monday token/auth. The response includes board id/name, ordered parent column metadata (`id`, `title`, `type`, `settings_str`), ordered group metadata (`id`, `title`, `color`, `position`), grouped items with each item's Monday column values, and `subitemColumns` metadata from the Monday subitem board when subitems are present. Dashboard refreshes may bypass the route cache with `?fresh=1`, `?refresh=1`, or a `Cache-Control: no-cache` request header.
- `PUT /api/board/items/:itemId/status-column`: updates one parent item Monday status-type column from the dashboard. Requires Hub API auth and Monday auth. Body: `{ "columnId": "...", "label": "..." }`; for clearing dashboard priority, body may be `{ "columnId": "...", "clear": true }`. The route only accepts dashboard parent columns titled `STATUS` or `PRIORITY`, plus the configured `STATUS_COLUMN_ID` for compatibility, verifies submitted labels exist in that column's Monday `settings_str`, writes via `change_column_value`, and clears the `/api/board` cache. Only the dashboard `PRIORITY` column can be cleared to an empty/default-grey status. `/api/board/items/:itemId/job-status` is retained as an alias for the same handler.

### Test Dashboard

- `GET /api/test-dashboard/board`: returns a Monday-shaped board payload for the Test Dashboard tab without reading Monday runtime board data. It is built from Railway/Postgres `database_jobs`, `database_job_line_items`, `database_job_positions`, `job_scans`, and test-dashboard state/file tables. It emits the same group/column/subitem/value shape as `/api/board`, with file columns backed by Cloudinary `secure_url` values and no Monday asset ids.
- `PUT /api/test-dashboard/items/:jobId/status-column`: updates DB-backed test dashboard `STATUS` or `PRIORITY` state for a `database_jobs.source_order_id`. Body matches the Monday dashboard route: `{ "columnId": "...", "label": "..." }`, or `{ "columnId": "...", "clear": true }` for clearing `PRIORITY`. The route validates labels against the mirrored column settings, stores state in `test_dashboard_job_state`, and applies copied board automation logic for status-driven group moves, completed cleanup, invoiced archive, and priority clearing.
- `GET /api/test-dashboard/scan-url?jobId=...`: returns a signed `/test-scan?j=...&ts=...&sig=...` URL for DB-backed label printing.
- `GET /test-scan?j=...&ts=...&sig=...`: public signed scan endpoint for DB-backed labels. It records scanner state against the job source order id and updates the test-dashboard DB state only.
- `POST /api/test-dashboard/scanner`: accepts scanner data for the Test Dashboard tab, including `/test-scan` URLs or bare numeric job ids, records scan state, and refreshes DB-backed status/check-in state without calling Monday.
- `POST /api/test-dashboard/uploads/signature`: returns a short-lived signed Cloudinary browser-upload payload. It requires `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`; the API secret never reaches the browser.
- `POST /api/test-dashboard/items/:jobId/files`: saves Cloudinary upload metadata for a DB job/file column in `test_dashboard_files`.
- `DELETE /api/test-dashboard/items/:jobId/files/:fileId`: deletes a test-dashboard file metadata row and best-effort destroys the Cloudinary asset.

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

### Dashboard Board UI

- The Dashboard tab renders the Monday workboard directly from `/api/board` metadata. It uses Monday group order and color values, a page-level horizontally scrollable dark grid mounted directly in the dashboard tab instead of inside a card/container, and parent columns in Monday order, excluding the raw `Subitems` column because subitems are represented by the job-row toggle and excluding `START/END`.
- The dashboard sidebar shows the `Ultimate Hub` text/user name without the old `UH` placeholder icon or `HOME` heading. On desktop, a top-right sidebar arrow toggles the sidebar open/closed locally; when closed, the dashboard content expands into the freed space and the arrow remains available to reopen the nav. On mobile portrait and phone landscape widths, the sidebar starts closed as an off-canvas drawer opened by a fixed menu button and closed by the drawer close button, backdrop, Escape, orientation/page restore, or selecting a tab; phone landscape keeps the wide board grid available with compact top chrome and a taller scroll area.
- Browser viewport zoom is locked for the app shell, but the Dashboard board supports a custom two-finger pinch zoom on mobile and phone-landscape layouts so the wide Monday grid can be zoomed out without scaling other tabs.
- The dashboard no longer shows the hero copy (`Ultimate Promotions Job Board`, `Dashboard`, or `Live from Monday...`) or the local `Group colours` controls. Group titles sit above each grid and do not show a job-count line below the title.
- Parent rows render the retained `Print` action button with a pointer cursor, the job name with a subitem-count badge when present, then live Monday columns. Dashboard parent and subitem title text uses fixed font size, line-height, and max-height so titles cannot render taller or visually larger than neighboring rows. The parent `JOB` column width is sized once from the longest loaded job title across all groups plus its subitem-count badge so following columns align between groups, while per-parent subitem title sizing remains per job. The leading label column header is `LABEL` on desktop, and the label/print column is hidden on mobile and phone-landscape layouts so jobs start at the first visible column. Status columns render colored Monday-style full-cell fills using Monday status settings when available, with white label text and a wider `STATUS` column sized for `AWAITING APPROVAL`; parent `STATUS` and `PRIORITY` cells are clickable and open a Monday-style label picker using the column's configured labels, order, and colors, then write the selected label back to Monday. The `PRIORITY` picker includes a grey `No Priority` option that clears the Monday priority status back to the empty/default-grey state. Monday checkbox columns render blank when unchecked and standalone colored ticks when checked, with the `JOB` tick shown green. Date column text renders slightly larger and bolder than other plain text values. File columns render Monday attachments through the asset proxy where possible as icon-only cells with one icon per attached file and no inline filename. The `PROOF`, `FILES`, and `IMAGE` column icons open the dashboard preview modal at the clicked file; the modal previews PDFs/images without a footer filename, with file previous/next controls when multiple files are attached, centered desktop page previous/next controls for multi-page PDFs, a red close control, and mobile-specific close plus PDF page controls that remain visible inside the popup. In mobile views, preview modal PDF page controls are transparent so only the arrows and page number are visible while remaining tappable; phone landscape uses a full-screen modal with a shorter top bar and page controls overlaid on the document area. Text-style columns such as design number / `DES/PSG` and `NOTES` are centered in their grid cells and sized per group from the longest loaded text in that group, never narrower than the column title; empty `NOTES` groups shrink to the title width.
- On desktop Dashboard preview modals, rendered PDF files include zoom controls with 100% as the default current fitted size, plus a 180-degree rotate toggle. When desktop PDF zoom is above 100%, click-hold dragging pans the scrollable PDF canvas. These zoom, drag-pan, and rotate controls are not exposed in mobile or phone-landscape modal layouts.
- The dashboard print label opens a 4in by 6in print window with job number, customer, job title, and a scanner QR code. Label values still shrink to fit horizontally, but the job number, customer, and job title start from capped maximum font sizes so short text cannot expand into the QR area. After the browser print dialog completes and focus returns, the label print popup closes itself.
- Row camera capture/upload logic remains in the frontend, but the per-row camera button and top `Connect Camera` button are hidden from the dashboard grid. The camera modal and upload flow are otherwise unchanged.
- Group and job/subitem toggles use Monday-style chevrons: right when collapsed and down when expanded. `HOLD`, `TO SAMPLE`, `OFFICE`, and `COMPLETED` start collapsed on first desktop dashboard render; all groups start collapsed on first mobile or phone-landscape dashboard render, while user-opened state is preserved across polling. Collapsed groups hide their item rows and show a slightly rounded Monday-style overview row with the group title, status distribution bars, and checkbox completion counts by column; closed group cards do not show job or subitem totals. On mobile and phone-landscape layouts, closed group cards hide all right-side overview columns, show only the group title, and share the same width as the `PRE-PRODUCTION` closed card. On mobile and phone-landscape layouts, the open `PRINT` and `EMBROIDERY` group grids hide the `TRANS`, `JAQ`, `STATUS`, `TYPE`, `IMAGE`, and `CHECKED IN` columns while other groups keep their normal mobile columns. The collapsed group title block is measured from the widest loaded group title plus 20% title padding so the first metric column sits directly beside it instead of after the full `JOB` column width. The closed `TO SAMPLE` overview row is tinted green when it contains at least one parent job. Expanding a job inserts a subitem grid directly below the parent row using the live Monday subitem column order, excluding the subitem `CHECK IN` and `Text` columns; subitem grids have no leading blank label column and begin with the `Subitem` column while keeping their indented panel position relative to the parent job row. Each job's subitem name, `SIZE`, `CODE`, and `COLOUR` columns are sized from that job's longest matching subitem value, not from a board-wide maximum. The subitem panel paints black behind the tight grid so rows end cleanly at the last visible subitem column, and a subtle Monday-style connector rail with curved row branches visually attaches subitem rows to their parent job. The subitem grid width stops at its final visible column instead of extending the grey row background across the whole parent grid.
- Parent rows are dashboard-sorted by default inside each group by descending `PRIORITY`, then closest/earliest `DATE`. Parent column headers show a Monday-style blue sort control only while hovering/focusing the header; clicking it overrides the default with a dashboard-only sort using the selected pulled Monday column values, toggling high-to-low then low-to-high on repeat clicks. Header sorting treats earlier dates as the urgent/high side for date columns and does not write to or depend on Monday's item order. The active local sort is preserved across the 1-second polling renders.
- The top dashboard toolbar includes a `Priority highlights` toggle next to `Connect Scanner` on desktop; both controls are hidden on mobile and phone landscape dashboard layouts. When enabled, parent job rows with an overdue/today/tomorrow `DATE` are tinted red across the whole row, and rows due in 2-3 days are tinted orange; the toggle state is stored in browser localStorage and does not write to Monday.
- The frontend shows a loading wheel on the initial Dashboard board load until `/api/board` has returned and the board UI renders. It polls `/api/board?fresh=1` every 1 second while the Dashboard tab is visible, so Monday-side column/status changes flow into the dashboard without waiting for the server cache timeout; polling pauses while the status/priority picker is open or a dashboard status write is in flight. The top dashboard toolbar does not show `Connected to Monday`, `ready`, `Update board info`, or `Connect Camera`; the `Connect to Monday` button is hidden during page load and only shown after a Monday auth failure. Manual refresh logic remains available through `loadBoard({ forceRefresh: true })`.

### Test Dashboard UI

- The Test Dashboard sidebar tab sits at the bottom of the top-level nav list and uses the same board renderer, group layout, subitem expansion, local sorting, priority highlights, preview modal, print-label layout, and mobile pinch-zoom behavior as the Monday Dashboard tab.
- The Test Dashboard reads only `/api/test-dashboard/board` for board data and writes only test-dashboard API routes for status, priority, scanner, and file actions. It must not use `/api/board`, Monday item ids, Monday status writes, Monday asset proxy URLs, or Monday camera/upload routes for its board state.
- The Test Dashboard parent rows are keyed by `database_jobs.source_order_id`; subitems are populated from `database_job_line_items`; design text comes from `database_job_positions` plus job screen-number fields; open jobs exclude `database_jobs.is_complete = true`.
- `PROOF`, `FILES`, `IMAGE`, and any future file/image columns render as icon-only cells using Cloudinary `secure_url` values from `test_dashboard_files`. The same dashboard preview modal opens images, PDFs, and other supported files directly from those Cloudinary URLs.
- Dragging files onto a Test Dashboard file/image cell requests `/api/test-dashboard/uploads/signature`, uploads directly from the browser to Cloudinary, then stores metadata through `/api/test-dashboard/items/:jobId/files`. Column folders are `ultimate-hub/test-dashboard/<column-slug>/<order-no>/`, with built-in slugs `proof`, `files`, and `image`.
- Test Dashboard label printing requests `/api/test-dashboard/scan-url` and prints `/test-scan` QR codes. Scanner input while the Test Dashboard tab is active expands bare numeric job ids through the test scan-url route and posts scan results to `/api/test-dashboard/scanner`.
- The Test Dashboard polls `/api/test-dashboard/board?fresh=1` every 1 second only while the Test Dashboard tab is visible. Polling pauses while the shared status/priority picker is open or a status write is in flight.

### DATABASE

The dashboard has a `DATABASE` tab backed by a full-history MDB import.

Frontend files:

- `public/index.html`: sidebar tab and legacy-style DATABASE hub markup.
- `public/database.js`: DATABASE home screen, manual new-order form, outstanding order grouping, order navigation, order detail tabs, line-item rendering, and design-position rendering.
- `public/database-job.html`: older direct full-width job info page retained as a fallback.
- `public/database-job.js`: older job facts, contact fields, line items, and positions rendering for the fallback page.
- `public/styles.css`: scoped legacy DATABASE hub styles plus older fallback page table styles.

Backend files:

- `src/routes/database.js`: `/api/database` JSON endpoints.
- `src/db/databaseSchema.js`: idempotent table creation.
- `scripts/import-database-mdb.js`: imports `PS_XP_tab.mdb` into Railway/Postgres, including a products-only mode for the full Access product catalogue.

Endpoints:

- `GET /api/database/summary`: returns counts for jobs, line items, positions, products, customer addresses, customer contacts, import status, counts by year, and counts by type.
- `GET /api/database/jobs?q=&customer=&type=&year=&status=&limit=&offset=&includeTotal=`: returns paginated jobs. Default and UI page size is 100 jobs. `includeTotal=false` skips the count query for follow-up page loads when the UI already has the first-page total. Search covers job number, customer, job title, contact name/email, client order number, line description, style code, style name, colour, and size. The list response also includes imported order flags and timestamps used by the legacy outstanding-orders grid.
- `GET /api/database/outstanding-counts`: returns open order counts grouped as Printing, Embroidery, and Business Gifts using the same `order_type`/`order_type_abbr` category rules as the legacy UI.
- `GET /api/database/customers?q=`: returns distinct customers from `database_jobs` plus manual customer-only rows from `database_customer_profiles` in alphabetical order, with each customer's latest order number, latest job title, latest order date, contact, customer code, and order count when orders exist.
- `GET /api/database/users`: returns Hub users for DATABASE customer account-manager dropdowns.
- `GET /api/database/customers/:key`: returns one DATABASE customer aggregate. `:key` is either a numeric imported `customer_id`, `name:<customer name>` for rows without a source customer id, or `profile:<id>` for manual customer-only profile rows. The response includes all imported jobs for the customer, stored/imported contact rows from `database_customer_contacts` merged with job/profile contact fields, imported customer addresses from `database_customer_addresses` with individual address line fields plus manual job/profile invoice/delivery address text as a fallback, and one design-number row per associated order/job. Design numbers from `database_job_positions.design_ref` and PSG / Stitch Count references found in order, position, or line-item description text are merged onto that single job row. PSG references are normalized with optional suffix letters, stitch counts are normalized from `ST`/`STS`/`STC`/stitch labels or a bare count immediately after a PSG reference, and both are removed from the displayed design-number text so they are not duplicated across columns.
- `PUT /api/database/customers/:key/account-manager`: updates the aggregate customer's account manager by writing `database_jobs.order_owner_user_id`, `order_owner_name`, and `updated_at_source` across the customer's imported/manual job rows, or `database_customer_profiles.account_manager_*` fields for `profile:<id>` customers. The route accepts a Hub `user_id` selected from `/api/database/users`, with a name fallback for legacy/display-only values.
- `POST /api/database/customers`: creates a manual customer-only profile in `database_customer_profiles` from the legacy New Customer form. The route stores customer name/code, contact name, tel/mobile/email, invoice/delivery address line fields and postcode, and the selected/current Hub user as account manager. Created profiles use `profile:<id>` customer keys and do not create synthetic orders in `database_jobs`.
- `POST /api/database/customers/:key/contacts`: creates a stored contact row in `database_customer_contacts` for an imported/customer-name/profile customer. It records title, firstname, lastname, tel, fax, mobile, email, free-text address, source customer/profile link, and Hub creator/updater metadata. The UI deliberately does not expose the legacy `ynMailout`/Marketing control.
- `PUT /api/database/customers/:key/contacts/:contactId`: updates an existing `database_customer_contacts` row after verifying it belongs to the selected customer aggregate.
- `DELETE /api/database/customers/:key/contacts/:contactId`: deletes an existing `database_customer_contacts` row after verifying it belongs to the selected customer aggregate.
- `GET /api/database/customers/search?q=`: searches distinct customer/contact values from `database_jobs` and `database_customer_profiles`, using the same imported/manual customer data that populates outstanding orders and order/customer details.
- `POST /api/database/jobs`: creates a real manual `database_jobs` row from the legacy New Order form. Required fields are customer, order type, job title, order date, delivery date, and invoice required. The route allocates the next source order id and next job/order number from `MAX(source_order_id) + 1` and `GREATEST(MAX(order_no), 50000) + 1`. If `invoice_required = true`, it allocates `invoice_no` separately from `GREATEST(MAX(invoice_no), 50000) + 1`; if `invoice_required = false`, it stores `invoice_no = NULL` and does not consume an invoice number. The route marks the row `is_manual_entry = true`.
- `GET /api/database/jobs/:id`: returns one job plus contact fields, line items, and position rows. `:id` may be source order id or job number.
- `PUT /api/database/jobs/:id`: updates supported order-level fields. The current UI uses it for `job_title` autosave and for setting `is_complete = true` when closing an order.
- `GET /api/database/products/search?field=style|code&q=`: searches full imported `database_products` rows grouped by `style_id`. Style searches match style names first, with style/alt code fallback. Code searches match style and alternate style codes.
- `GET /api/database/products/styles/:styleId/variants`: returns all imported product variants for one style, ordered for colour/size dropdowns.
- `POST /api/database/jobs/:id/line-items`: creates a real stock line item for one job from a selected `database_products.source_product_id`. The route allocates the next `source_order_item_id`, copies product style/colour/size/cost fields into `database_job_line_items`, and returns the refreshed line items.
- `POST /api/database/jobs/:id/line-items/custom`: creates a non-stock, non-deliverable, or internal line item without product lookup. Accepted `line_type` values are `nonstock`, `nondelivery`, and `internal`; each stores free-text description, cost, price, quantity, and VAT fields in `database_job_line_items`.
- `PUT /api/database/jobs/:id/line-items/:lineItemId`: updates editable line item fields in place for a single order line. Accepted fields are style/code text fields, description, colour, size, unit cost, unit price, quantity, and VAT rate; the route validates the line belongs to the target order and returns refreshed line items.
- `DELETE /api/database/jobs/:id/line-items/:lineItemId`: deletes a single order line after validating that the line belongs to the target order and returns refreshed line items.
- `PUT /api/database/jobs/:id/line-items/order`: persists the current line-item order for a reordered Order Items section from an ordered list of `source_order_item_id` values. The route validates all submitted lines belong to the target job, writes `database_job_line_items.line_sort_order`, and returns refreshed line items.
- `PUT /api/database/jobs/:id`: updates editable job-level fields. Currently used for default-editable order title autosave by writing `database_jobs.job_title` and `updated_at_source`.
- `PUT /api/database/jobs/:id/positions`: replaces editable design-position rows for one job. It updates existing `database_job_positions`, inserts new rows with allocated legacy-compatible `source_order_position_id` values, writes `position_sort_order` from the submitted row order, and removes cleared rows.

Import rules:

- Source file: `PS_XP_tab.mdb`.
- Included years: all dated source years by default. Orders without a source year are preserved with `source_year = NULL` if present in the MDB.
- Date basis: `tblOrder.dtOrder`, falling back to `tblOrder.dtCreate`.
- Default import mode replaces the current DATABASE snapshot inside one transaction, including the full product catalogue. Source-backed `database_customer_contacts` rows are replaced/upserted by `tblContact.ContactID`; manually added contacts with no source contact id are preserved.
- `--append` skips deletes and upserts into existing rows.
- `--insert-only` skips deletes and inserts only source rows whose source ID is not already present, using `ON CONFLICT DO NOTHING`. Existing jobs, line items, positions, customer addresses, source-backed contacts, and products are not updated or deleted. `database_import_runs` row counts for this mode record inserted rows, not scanned snapshot rows. It cannot be combined with `--append` or `--addresses-only`.
- `--years=2025,2026` is available for scoped diagnostics, but the production default is full-history.
- `--addresses-only` imports only address data: it replaces `database_customer_addresses` with addresses for customers present in the selected order snapshot and updates existing `database_jobs.invoice_address_id`, `database_jobs.delivery_address_id`, `database_jobs.invoice_address`, and `database_jobs.delivery_address`. It does not reimport jobs, line items, positions, or products.
- `--products-only` imports only the full Access product catalogue into `database_products`, replacing product rows by default.
- `--products-from-existing-orders` preserves the old scoped product import behavior for diagnostics by importing only products referenced by current `database_job_line_items.source_product_id`.
- The importer prefers `DATABASE_PUBLIC_URL` when running locally against Railway DB service variables.
- Run against Railway DB service variables:

```bash
railway run --service DB node scripts/import-database-mdb.js PS_XP_tab.mdb
```

Run the append-safe insert-only import for a refreshed MDB without deleting or updating existing DATABASE rows:

```bash
railway run --service DB node scripts/import-database-mdb.js PS_XP_tab.mdb --insert-only
```

Run only the customer-address backfill:

```bash
railway run --service DB node scripts/import-database-mdb.js PS_XP_tab.mdb --addresses-only
```

Run only the full product catalogue:

```bash
railway run --service DB node scripts/import-database-mdb.js PS_XP_tab.mdb --products-only
```

UI rules:

- The DATABASE tab is a fixed-size, centered legacy-style hub matching the Access-era reference UI colors, scale, spacing, and layout, with every DATABASE view rendered at 120% legacy scale and an empty blue background around the reference canvas on wider dashboard screens. On mobile screens, the same DATABASE workflows switch to stacked responsive panels with horizontally scrollable data tables and forms sized to the viewport instead of the fixed 120% canvas. DATABASE does not support pinch zoom; it remains locked like the app shell and only allows normal panning/scrolling. The outermost DATABASE tab background is darker than the legacy UI canvas, and the main legacy canvas has a subtle drop shadow on wider screens.
- The DATABASE home screen is the default tab screen and includes the New Order button, main menu buttons, Open Orders count panel, and admin buttons. On mobile, the Open Orders count panel sits at the top and the desktop left/right button groups become two columns underneath in the same relative locations. Reports and Marketing live at the bottom of the right-side admin button column below Error log; the old backup-status panel is removed. The Open Orders count panel title is centered, slightly larger, and bold, and the panel shows three open-order counts for Printing, Embroidery, and Business Gifts, sourced from `/api/database/outstanding-counts`. The legacy blue footer bar is intentionally omitted in the dashboard hub.
- The top DATABASE navigation has two main tabs, `Home` and `Outstanding Orders`. The small top-left button is `Back`, returns to the previous in-DATABASE view, and is hidden on the Home view; while hidden, the two main tabs span the full top tab row.
- The New Order button opens a centered legacy form without placeholder lookup buttons, fake combo-arrow buttons, or a customer-date checkbox. The customer field live-searches `/api/database/customers/search` as the user types; selecting a customer fills contact, delivery address, and invoice address fields from stored DATABASE customer/order data when available. Accept requires Invoice required to be set to Yes or No, creates a manual job row in `database_jobs`, carries through selected customer/contact ids and codes when present, assigns the next job/order number independently from invoice numbering, and opens that created order in the order-details view. Jobs with Invoice required Yes receive the next invoice number; jobs with Invoice required No store a null invoice number and do not consume one.
- New manual orders set `database_jobs.order_taken_by`, `order_owner_user_id`, and `order_owner_name` from the logged-in Hub user server-side. The sidebar subtitle under `Ultimate Hub` shows the logged-in user's first and last name.
- The Customers main-menu button opens a legacy-styled list page backed by imported/manual `database_jobs` customer values plus manual customer profiles in `database_customer_profiles`, not the old separate dashboard customer tables. Customers are sorted alphabetically, searchable at the top of the page, and each row shows the latest order next to the customer record when one exists. Clicking a customer row opens a legacy-style customer page in the DATABASE tab. The list toolbar has an `Add Customer` button opposite the search box.
- The Add Customer button opens a centered legacy New Customer form based on the New Order form layout. It captures Customer, Code, Contact, Tel, Mobile, Email, Invoice Address, Delivery Address, and Account manager; the legacy Fax and Marketing inputs are intentionally omitted. Accept creates a `database_customer_profiles` row, then opens the created customer page without creating a `database_jobs` order row.
- The customer page mirrors the legacy Access-era customer layout with read-only Customer and Code fields, an editable Account manager dropdown populated from Hub users, created/edited metadata aligned with the customer-name row, and tabs for Orders, Contacts, Addresses, Quotations, Communications, and Design Numbers. The old top-right customer/code lookup dropdown panel, Edit button, and placeholder tab arrow buttons are not shown. Account manager defaults to the Hub user stored on the earliest customer order when available, falling back to legacy taken-by/staff values, and can be changed to another Hub user. The Orders tab lists all imported orders for that customer in a vertically scrollable table and opens the existing order view when an order is clicked. The Contacts tab uses a scrollable legacy card list backed by `database_customer_contacts`, merged with order/profile contact usage; cards are separated by 10px, every field is editable, edits autosave on focus leaving the card and flush before DATABASE navigation/page changes, and each stored card has a red X delete path using the shared are-you-sure modal. The Contacts tab includes Add Contact but intentionally omits quote, alert, phone, mail, Marketing, and Manage Addresses controls. Add Contact opens a centered legacy form with Title, Firstname, Lastname, Tel, Fax, Mobile, Email, and Address fields and writes `database_customer_contacts`. The Addresses tab uses the two-column legacy form layout with default invoice and delivery address panels and individual Address 1-5/Postcode/Tel/Fax fields; manual job invoice/delivery address text is split into line fields as a fallback. The Design Numbers tab columns are Job no, Design number, PSG / Stitch Count, Job title, and Order date. It shows one row per job, merging distinct design numbers and PSG / Stitch Count references extracted from order, position, and line-item description text; PSG/stitch-count-only orders also appear with a blank design number, and rows open that order when clicked. The Design number and PSG / Stitch Count columns are sized from the longest loaded value in the current customer view. Quotations and Communications are present as empty legacy tabs because those records are not imported into the current snapshot.
- The Outstanding Orders tab loads open jobs through `/api/database/jobs?status=open`, follows pagination until all open jobs are loaded, and groups rows into Print, Embroidery, Gifts, and Other using `order_type`/`order_type_abbr`. The open-orders grid shows selector, order number, customer, type, job title, taken by, order date, and delivery columns only; the old five checkbox placeholder columns are not rendered. The job title column is measured from the widest visible title and capped so the Delivery column reaches but does not exceed the right edge of the table frame. The All Orders view has a search box backed by `/api/database/jobs?q=...`, uses the same 100-row page size, renders the first matching page immediately, then continues loading remaining pages silently in the background with `includeTotal=false` follow-up requests. Background page loads are paced and populate the client cache without rebuilding the visible table; the visible table grows by 100-row batches only when the user scrolls near the bottom, so full-history imports do not block the initial screen paint or cause repeated main-thread table rebuilds. In All Orders mode, order selector dropdowns are capped to the first 500 loaded rows plus the currently selected order to avoid rendering tens of thousands of options.
- Clicking an outstanding order opens the in-tab order view. Users can return to the DATABASE home screen with the top-left Home button.
- Clickable DATABASE order-number links use a pointer cursor on hover.
- The order view has three top tabs: Order details, Order Items, and Design. These tabs switch in place without navigating away from the dashboard. The order header reserves spacing above the tabs so document buttons and the metadata panel do not touch or overlap the tab strip. Clicking the customer control in Order details opens the customer page for that order's customer.
- In the order view, the `Order Ack.` document button opens an A4 order acknowledgement preview in a modal. The acknowledgement is rendered from the loaded DATABASE job, customer/address fields, line items, and VAT/cost totals; it lists stock items first, then non-stock items, then non-deliverable items after a small visual gap, then internal items. The acknowledgement does not show the order Design/Design Numbers section. It renders explicit fixed-height A4 page blocks, repeats the logo/customer/order header on every page, centers the main 153mm data blocks on the A4 page centerline, and paginates line items, totals, and comments before the 96mm footer-safe content clamp. The final Sub total, VAT, and Total summary prints as a standalone block slightly below all item groups, with unboxed labels and only the monetary amounts inside bordered value boxes. It includes the Ultimate logo at 60.5mm wide in the top-right of each page, anchored at its top-right corner, and a centered 146mm-wide Ultimate letterhead footer image without bank details offset 5mm above the bottom of every generated PDF page. The modal closes on outside-backdrop click or Escape and provides print/save-as-PDF controls through the browser print dialog; while printing, the document title is set to `<order no> - Order Acknowlegement` so Chrome uses that as the default PDF filename.
- In the order view, the `Invoice` and `Delivery Note` document buttons use the same A4 modal/print shell and Ultimate logo as the order acknowledgement. Invoice documents keep the existing bank-detail letterhead footer, use the invoice address, set `Invoice No.` from `database_jobs.invoice_no`, omit the old ULT ref field, set `Cust ref` from `database_jobs.client_order_no`, set invoice date to the preview generation date, and list only stock, non-stock, non-deliverable, and internal line items with invoice totals and tax analysis. Delivery notes use the same no-bank footer as order acknowledgements, use the delivery address, relabel ULT ref as `Invoice No` using `database_jobs.invoice_no`, use the order date from the job order/created date, set delivery date to the preview generation date, set order taken by from the job owner, list only stock, non-stock, non-deliverable, and internal line items, and include blank Signed by, Print Name, and Date lines for the recipient. If `invoice_required = false`, `invoice_no` remains null, the Invoice action is disabled, and delivery notes leave `Invoice No` blank.
- The order title is editable by default in the header and autosaves through `PUT /api/database/jobs/:id` using the same debounced/flush-before-navigation pattern as other DATABASE autosaves. Typing in the title also updates the cached Outstanding Orders row and order selectors immediately, so returning to the list shows the edited title without a page reload. The old Edit button next to the title is removed. The top-right metadata box no longer contains the Job/Order dropdowns; `By:` prefers `order_owner_name` and falls back to `order_taken_by`/legacy staff id.
- Order Details, Order Items, and Design tab content uses the legacy blue/grey/off-white fills for panels, table headers, and empty space. White backgrounds are limited to field-like areas such as customer/order inputs, selects, textareas, line-item entry fields, line item value cells, design edit boxes, supplier/screen fields, and comments fields.
- Order details surfaces the retained imported job fields that map to the reference screen, including customer/contact, type, dates, client reference, comments, address, and payment fields. The lower legacy document-number panel, invoice/pro-forma checkbox panel, and job-flag checkbox panel are intentionally omitted from the current UI. A Close Order button sits bottom-right under Comments with a small top gap and its right edge aligned to the payment box border; clicking it opens the shared are-you-sure modal, Confirm persists `is_complete = true` for the order and removes it from open-order lists, and No closes the modal without updating the order. Contact, order type, taken by, and delivery method render as read-only text inputs without dropdown arrows. The Completion row does not show the old placeholder completion tickbox. Generating an Invoice updates only the visible/in-memory Completion date field to the invoice date shown on that generated document; generating a Delivery Note updates only the visible/in-memory Delivery date field to the delivery date shown on that generated document. These UI date mirrors do not persist to the database and do not change PDF rendering.
- Order Items splits imported line items into stock, non-stock, non-deliverable, and internal sections using existing line-item flags and product/style data. The stock table displays Code, Style, Colour, Size, Cost, Price, Qty, and VAT; it does not show Alt code or a separate Stock code/source product id column. The Style/description column is sized so the VAT column remains visible at the right edge of the stock items box without horizontal clipping. Line item ordering uses `database_job_line_items.line_sort_order`, falling back to `source_order_item_id`.
- The Order Items stock table has an Add line button centered below the current stock rows, sitting directly on the grey table fill without a full-width off-white strip. The stock table is vertically scrollable; after rendering, it scrolls to the bottom so the Add line or draft row remains visible when the list is longer than the box. Clicking Add line inserts one editable stock row at the bottom without a left-side `+` save button. The Style and Code inputs use product autocomplete backed by `database_products`; pressing Enter selects the first result when the result list is open. Once a style/code result is selected, Colour and Size become dropdowns for that style's available product variants, Cost follows the selected variant, and pressing Enter or leaving the draft row creates the line item. Clicking away from a newly added blank draft row removes it instead of leaving an empty validation row.
- Non-stock, non-deliverable, and internal item sections also have Add line buttons centered in their grey section areas. These boxes are vertically scrollable and auto-scroll to the bottom after rendering so their Add line or draft row remains visible. They create text-entry rows only and deliberately do not use product search; clicking Add line places the editable row at the bottom of that section without a left-side `+` save button, and pressing Enter or leaving the draft row creates the line item. Clicking away from a newly added blank draft row removes it instead of leaving an empty validation row. Saved line item values remain editable in place; clicking a saved field allows edits, and pressing Enter or leaving that field saves the new value through `PUT /api/database/jobs/:id/line-items/:lineItemId`. The Order Items canvas expands vertically so the non-stock/internal sections sit inside the main legacy outline instead of extending past it.
- Every saved line item row in the stock, non-stock, non-deliverable, and internal sections has a red X delete button followed by a black arrow drag handle. The delete button opens an are-you-sure modal with Confirm and No actions; Confirm deletes the line through `DELETE /api/database/jobs/:id/line-items/:lineItemId`, and No closes without deleting. Click-hold and drag on the black arrow handle moves the row within that section with a ghost copy following the pointer; dropping the row updates the visible order and autosaves that section's ordered line ids after about 3.5 seconds. Pending line-order changes also flush before opening another order, leaving DATABASE, or leaving the browser page.
- Design renders imported `database_job_positions` rows ordered by `position_sort_order` falling back to `source_order_position_id`, plus the job `screen_numbers` field. Position, Colour, and Design cells are editable with white cell backgrounds; populated rows have a red X delete button followed by a black arrow drag handle. Deleting a design row uses the same are-you-sure modal pattern as order line items, drag-and-drop reorders rows in place, and clicking away from a newly added blank unsaved row removes it. Changes autosave every 5 seconds and flush immediately before switching order tabs, opening another order, leaving DATABASE, or leaving the browser page.
- `/database-job.html?id=<source_order_id>` remains a direct fallback page, but the dashboard DATABASE tab is now the primary workflow.

Core source mappings:

- Jobs: `tblOrder` joined to `tblCustomer`, `tblContact`, and `tblOrderType`.
- Manual New Order rows store non-MDB form fields directly on `database_jobs`: `delivery_method`, `payment_terms`, `order_taken_by`, `order_owner_user_id`, `order_owner_name`, `delivery_address`, `invoice_address`, and `is_manual_entry`.
- Manual New Customer rows store customer-only profile fields on `database_customer_profiles` using the same customer/contact/address naming as `database_jobs`/`database_customer_addresses`. These profiles are merged into customer list/search/detail APIs using `profile:<id>` keys, have zero orders until a real order exists for the same customer, and are suppressed from list/search once a matching `database_jobs` customer exists to avoid duplicate rows.
- Customer contacts: `tblContact.ContactID` maps to `database_customer_contacts.source_contact_id`, `CustomerID` to `customer_id`, `AddressID` to `address_id`, `sTitle`/`sFirstname`/`sLastname` to split contact-name fields, `sTel`/`sFax`/`sMobile`/`sEmail` to the corresponding contact fields, `TraceStaffID` to `trace_staff_id`, and `dtCreate`/`dtEdit` to nullable source timestamps. `contact_address` is the formatted linked `tblAddress` row. The legacy `ynMailout` field is present in the MDB but is intentionally not shown in the current contact UI.
- Customer addresses: `tblAddress`, joined through `tblCustomer.invaddressid` / `tblCustomer.deladdressid`, selected `tblOrder.invaddressid` / `tblOrder.deladdressid`, and selected-customer `tblContact.addressid`. The importer writes address rows for customers that appear in the selected order snapshot. Imported jobs also store `invoice_address_id`, `delivery_address_id`, and formatted invoice/delivery address text from `tblAddress`.
- Line items: `tblOrderItem` joined to `tblProduct`, `tblStyle`, `tblStyleColour`, `tblColour`, `tblStyleSize`, `tblSize`, `tblProductType`, and `tblSupplier`. `line_sort_order` is assigned during import from the legacy item order and can be updated manually from the Order Items drag handle.
- Products: `database_products` is keyed by `tblProduct.productid` and is populated from the full Access product catalogue. Product rows join `tblProduct` to `tblStyle`, `tblStyleColour`, `tblColour`, `tblStyleSize`, `tblSize`, `tblProductType`, and `tblSupplier`, preserving style code, alternate style code, style name, colour, size, supplier, product type, unit cost, stock, and active flag.
- Positions: `tblOrderPosition`: `orderpositionid` maps to `source_order_position_id`, `orderid` to `source_order_id`, source row order maps to `position_sort_order`, `sposition` to `position_name`, `memcolour` to `colour_notes`, and `sdesign` to `design_ref`.

Latest full-history Railway import from root `PS_XP_tab uptodate.mdb` on 2026-06-19:

- `database_jobs`: 43,141 rows.
- `database_job_line_items`: 189,257 rows.
- `database_job_positions`: 63,367 rows.
- `database_customer_addresses`: 5,197 rows.
- `database_customer_contacts`: 7,505 rows.
- `database_products`: 113,209 rows.
- Year range includes historic rows from 1931, 1958, 1996, and 2000 through 2026.
- Latest `database_import_runs.status`: `complete`, `source_years`: `all`, message: `Snapshot replaced`.
- Outstanding open orders after import: 49.
- Manual test cleanup after import removed the single preserved `database_customer_profiles` row named `test customer` / code `test`; no manual profiles, manual jobs, or manual contacts remain.

Latest insert-only Railway catch-up import from root `PS_XP_tabUP TO DATE.mdb` on 2026-07-01:

- Inserted rows recorded by `database_import_runs.id = 7`: 36 jobs, 214 line items, 62 positions, 2 customer addresses, 1 source-backed contact, and 21 products.
- Current DATABASE table counts after cleanup: 43,177 jobs, 189,466 line items, 63,429 positions, 5,199 customer addresses, 7,506 customer contacts, and 113,230 products.
- Latest `database_import_runs.status`: `complete`, `source_years`: `all`, message: `Snapshot insert-only complete`.
- Post-import cleanup deleted 5 `database_job_line_items` rows for source order item ids `207117`, `207118`, `207119`, `207120`, and `207179` after verifying those ids are absent from `PS_XP_tabUP TO DATE.mdb`.

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

## Database Tables

Created by `src/db/migrate.js`:

- `job_scans`
- `job_scan_events`
- `hub_users`
- `hub_sessions`
- `database_jobs`
- `database_customer_profiles`
- `database_job_line_items`
- `database_products`
- `database_job_positions`
- `database_customer_addresses`
- `database_import_runs`
- `test_dashboard_groups`
- `test_dashboard_columns`
- `test_dashboard_job_state`
- `test_dashboard_files`
- `test_dashboard_seed_runs`

The visual queue routes require `visual_jobs`, but the current migration file does not create it. Treat that as a known schema gap unless a deployment migration exists outside this repo.

Test Dashboard schema:

- `test_dashboard_groups`: mirrored group ids, titles, colors, positions, and sort order.
- `test_dashboard_columns`: mirrored parent/subitem column metadata, including status settings JSON and file-column definitions.
- `test_dashboard_job_state`: per-job dashboard state keyed by `database_jobs.source_order_id`, including mirrored Monday item id from one-time seed, group id, item name, JSONB column values, archive flag, and seed timestamps.
- `test_dashboard_files`: Cloudinary metadata for file/image cells. Stores source order id, column id/title, `public_id`, `secure_url`, resource type, format, original filename, bytes, dimensions, metadata, creator, and timestamps. It does not store file bytes.
- `test_dashboard_seed_runs`: one-time Monday seed audit rows with counts and status.

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
- `DATABASE_PUBLIC_URL`
- `PGSSLMODE`
- `SCAN_SECRET`
- `BOARD_PAGE_LIMIT`
- `BOARD_MAX_PAGES`
- `BOARD_CACHE_MS`
- `VERBOSE_SQL`

### Cloudinary

- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `CLOUDINARY_TEST_DASHBOARD_ROOT`: optional; defaults to `ultimate-hub/test-dashboard`.

### Visual/OpenAI

- `OPENAI_API_KEY`
- `OPENAI_VISION_MODEL`
- `VISUAL_WORKER_KEY`
- `VISUAL_CLAIM_SECS`
- `INTERNAL_ENQUEUE_URL`

## Scripts

- `npm start`: starts `server.js`.
- `npm run smoke:lineitems -- <file>`: parse a line-item XLSX/CSV file.
- `npm run import:dropbox`: import all pending per-job Dropbox line-item files.
- `npm run smoke:open-orders -- <file>`: parse an open-orders CSV file.
- `npm run sync:open-orders -- [file] [--dry-run]`: sync open-orders CSV from file or Dropbox.
- `npm run import:database-mdb -- [PS_XP_tab.mdb] [--dry-run] [--append] [--insert-only]`: import full-history MDB jobs, contacts, addresses, positions, and products into DATABASE tables. Add `--years=2025,2026` for a scoped diagnostic import, `--products-only` to import only the full product catalogue, or `--insert-only` to add only source rows that do not already exist.
- `npm run seed:test-dashboard -- [--dry-run] [--skip-files] [--limit-files-per-column=N]`: one-time Monday snapshot seed for Test Dashboard metadata. It copies groups, columns, item state, and current Monday file assets into Cloudinary folders and stores only Cloudinary metadata in Postgres. Use `--skip-files` for state-only diagnostics.

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
