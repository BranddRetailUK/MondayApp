# MondayApp Service Contract

Last reviewed: 2026-06-19

## Purpose

MondayApp is a legacy Node/Express service that connects Monday.com, Dropbox CSV/XLSX files, a local dashboard, scanner/QR flows, and visual proof workflows.

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
- Hub auth: `/login` and `/signup` serve the app login/signup page. The dashboard entry points `/`, `/index.html`, `/database-job.html`, and `/launch.html` require a Hub session. Static assets remain public, but browser app APIs for the board, DATABASE, visual approvals, and file upload/proxy routes require a Hub session.
- Ultimate Hub dashboard tabs: Dashboard, DATABASE, and Visual Approvals. The active top-level dashboard tab is stored in browser localStorage so a page refresh returns the user to the last selected tab, unless an explicit `?tab=` query or matching hash such as `#database` selects a valid tab. The old standalone `MERCH TRAFFIC`, Orders, Customers, Stock, Shipping, and PenCarrie tabs have been removed. DATABASE order/customer/stock workflows remain part of the DATABASE tab.
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

- The Dashboard tab renders the Monday workboard directly from `/api/board` metadata. It uses Monday group order and color values, a horizontally scrollable dark grid, and parent columns in Monday order, excluding the raw `Subitems` column because subitems are represented by the job-row toggle and excluding `START/END`.
- The dashboard sidebar shows the `Ultimate Hub` text/user name without the old `UH` placeholder icon or `HOME` heading. A top-right sidebar arrow toggles the sidebar open/closed locally; when closed, the dashboard content expands into the freed space and the arrow remains available to reopen the nav.
- The dashboard no longer shows the hero copy (`Ultimate Promotions Job Board`, `Dashboard`, or `Live from Monday...`) or the local `Group colours` controls. Group titles sit above each grid and do not show a job-count line below the title.
- Parent rows render the retained `Print` action button, the job name with a subitem-count badge when present, then live Monday columns. The parent `JOB` column is widened from the longest loaded job title plus its subitem-count badge across groups, and the leading label column header is `LABEL`. Status columns render colored Monday-style full-cell fills using Monday status settings when available, with white label text and a wider `STATUS` column sized for `AWAITING APPROVAL`; Monday checkbox columns render blank when unchecked and standalone colored ticks when checked, with the `JOB` tick shown green. Date column text renders slightly larger and bolder than other plain text values. File columns render Monday attachments through the asset proxy where possible as icon-only cells with one icon per attached file and no inline filename. The `PROOF` column icons open the dashboard proof modal at the clicked file; the modal previews PDFs/images, with file previous/next controls when multiple proofs are attached and page previous/next controls for multi-page PDFs. Text-style columns such as `DES/PSG` and `NOTES` are centered in their grid cells, and `DES/PSG`/`NOTES` are widened from the longest loaded text across groups.
- The dashboard print label opens a 4in by 6in print window with job number, customer, job title, and a scanner QR code. Label values still shrink to fit horizontally, but the job number, customer, and job title start from capped maximum font sizes so short text cannot expand into the QR area.
- Row camera capture/upload logic remains in the frontend, but the per-row camera button and top `Connect Camera` button are hidden from the dashboard grid. The camera modal and upload flow are otherwise unchanged.
- Group and job/subitem toggles use Monday-style chevrons: right when collapsed and down when expanded. `HOLD`, `TO SAMPLE`, `OFFICE`, and `COMPLETED` start collapsed on first dashboard render, while user-opened state is preserved across polling. Collapsed groups hide their item rows and show a slightly rounded Monday-style overview row with job/subitem totals, status distribution bars, and checkbox completion counts by column; the closed `TO SAMPLE` overview row is tinted green when it contains at least one parent job. Expanding a job inserts a subitem grid directly below the parent row using the live Monday subitem column order, excluding the subitem `CHECK IN` and `Text` columns; the subitem grid width stops at its final visible column instead of extending the grey row background across the whole parent grid.
- Parent rows are dashboard-sorted by default inside each group by descending `PRIORITY`, then closest/earliest `DATE`. Parent column headers show a Monday-style blue sort control only while hovering/focusing the header; clicking it overrides the default with a dashboard-only sort using the selected pulled Monday column values, toggling high-to-low then low-to-high on repeat clicks. Header sorting treats earlier dates as the urgent/high side for date columns and does not write to or depend on Monday's item order. The active local sort is preserved across the 1-second polling renders.
- The top dashboard toolbar includes a `Priority highlights` toggle next to `Connect Scanner`. When enabled, parent job rows with an overdue/today/tomorrow `DATE` are tinted red across the whole row, and rows due in 2-3 days are tinted orange; the toggle state is stored in browser localStorage and does not write to Monday.
- The frontend shows a loading wheel on the initial Dashboard board load until `/api/board` has returned and the board UI renders. It polls `/api/board?fresh=1` every 1 second while the Dashboard tab is visible, so Monday-side column/status changes flow one way into the dashboard without waiting for the server cache timeout. The top dashboard toolbar does not show `Connected to Monday`, `ready`, `Update board info`, or `Connect Camera`; the `Connect to Monday` button is hidden during page load and only shown after a Monday auth failure. Manual refresh logic remains available through `loadBoard({ forceRefresh: true })`.

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
- `scripts/import-database-mdb.js`: imports `PS_XP_tab.mdb` into Railway/Postgres, including a products-only mode for products referenced by existing imported order line items.

Endpoints:

- `GET /api/database/summary`: returns counts for jobs, line items, positions, customer addresses, customer contacts, import status, counts by year, and counts by type.
- `GET /api/database/jobs?q=&customer=&type=&year=&status=&limit=&offset=`: returns paginated jobs. Default and UI page size is 100 jobs. Search covers job number, customer, job title, contact name/email, client order number, line description, style code, style name, colour, and size. The list response also includes imported order flags and timestamps used by the legacy outstanding-orders grid.
- `GET /api/database/outstanding-counts`: returns open order counts grouped as Printing, Embroidery, and Business Gifts using the same `order_type`/`order_type_abbr` category rules as the legacy UI.
- `GET /api/database/customers?q=`: returns distinct customers from `database_jobs` plus manual customer-only rows from `database_customer_profiles` in alphabetical order, with each customer's latest order number, latest job title, latest order date, contact, customer code, and order count when orders exist.
- `GET /api/database/users`: returns Hub users for DATABASE customer account-manager dropdowns.
- `GET /api/database/customers/:key`: returns one DATABASE customer aggregate. `:key` is either a numeric imported `customer_id`, `name:<customer name>` for rows without a source customer id, or `profile:<id>` for manual customer-only profile rows. The response includes all 2025/2026 jobs for the customer, stored/imported contact rows from `database_customer_contacts` merged with job/profile contact fields, imported customer addresses from `database_customer_addresses` with individual address line fields plus manual job/profile invoice/delivery address text as a fallback, and distinct design numbers from `database_job_positions.design_ref` joined to each associated job/order number, order date, and job title.
- `PUT /api/database/customers/:key/account-manager`: updates the aggregate customer's account manager by writing `database_jobs.order_owner_user_id`, `order_owner_name`, and `updated_at_source` across the customer's imported/manual job rows, or `database_customer_profiles.account_manager_*` fields for `profile:<id>` customers. The route accepts a Hub `user_id` selected from `/api/database/users`, with a name fallback for legacy/display-only values.
- `POST /api/database/customers`: creates a manual customer-only profile in `database_customer_profiles` from the legacy New Customer form. The route stores customer name/code, contact name, tel/mobile/email, invoice/delivery address line fields and postcode, and the selected/current Hub user as account manager. Created profiles use `profile:<id>` customer keys and do not create synthetic orders in `database_jobs`.
- `POST /api/database/customers/:key/contacts`: creates a stored contact row in `database_customer_contacts` for an imported/customer-name/profile customer. It records title, firstname, lastname, tel, fax, mobile, email, free-text address, source customer/profile link, and Hub creator/updater metadata. The UI deliberately does not expose the legacy `ynMailout`/Marketing control.
- `PUT /api/database/customers/:key/contacts/:contactId`: updates an existing `database_customer_contacts` row after verifying it belongs to the selected customer aggregate.
- `DELETE /api/database/customers/:key/contacts/:contactId`: deletes an existing `database_customer_contacts` row after verifying it belongs to the selected customer aggregate.
- `GET /api/database/customers/search?q=`: searches distinct customer/contact values from `database_jobs` and `database_customer_profiles`, using the same imported/manual customer data that populates outstanding orders and order/customer details.
- `POST /api/database/jobs`: creates a real manual `database_jobs` row from the legacy New Order form. Required fields are customer, order type, job title, order date, and delivery date. The route allocates the next source order id/order number in a transaction and marks the row `is_manual_entry = true`.
- `GET /api/database/jobs/:id`: returns one job plus contact fields, line items, and position rows. `:id` may be source order id or job number.
- `GET /api/database/products/search?field=style|code&q=`: searches scoped `database_products` rows grouped by `style_id`. Style searches match style names first, with style/alt code fallback. Code searches match style and alternate style codes.
- `GET /api/database/products/styles/:styleId/variants`: returns all scoped product variants for one style, ordered for colour/size dropdowns.
- `POST /api/database/jobs/:id/line-items`: creates a real stock line item for one job from a selected `database_products.source_product_id`. The route allocates the next `source_order_item_id`, copies product style/colour/size/cost fields into `database_job_line_items`, and returns the refreshed line items.
- `POST /api/database/jobs/:id/line-items/custom`: creates a non-stock, non-deliverable, or internal line item without product lookup. Accepted `line_type` values are `nonstock`, `nondelivery`, and `internal`; each stores free-text description, cost, price, quantity, and VAT fields in `database_job_line_items`.
- `PUT /api/database/jobs/:id/line-items/:lineItemId`: updates editable line item fields in place for a single order line. Accepted fields are style/code text fields, description, colour, size, unit cost, unit price, quantity, and VAT rate; the route validates the line belongs to the target order and returns refreshed line items.
- `DELETE /api/database/jobs/:id/line-items/:lineItemId`: deletes a single order line after validating that the line belongs to the target order and returns refreshed line items.
- `PUT /api/database/jobs/:id/line-items/order`: persists the current line-item order for a reordered Order Items section from an ordered list of `source_order_item_id` values. The route validates all submitted lines belong to the target job, writes `database_job_line_items.line_sort_order`, and returns refreshed line items.
- `PUT /api/database/jobs/:id`: updates editable job-level fields. Currently used for default-editable order title autosave by writing `database_jobs.job_title` and `updated_at_source`.
- `PUT /api/database/jobs/:id/positions`: replaces editable design-position rows for one job. It updates existing `database_job_positions`, inserts new rows with allocated legacy-compatible `source_order_position_id` values, writes `position_sort_order` from the submitted row order, and removes cleared rows.

Import rules:

- Source file: `PS_XP_tab.mdb`.
- Included years: 2025 and 2026 only.
- Date basis: `tblOrder.dtOrder`, falling back to `tblOrder.dtCreate`.
- Default import mode replaces the current DATABASE snapshot inside one transaction. Source-backed `database_customer_contacts` rows are replaced/upserted by `tblContact.ContactID`; manually added contacts with no source contact id are preserved.
- `--append` skips deletes and upserts into existing rows.
- `--addresses-only` imports only address data: it replaces `database_customer_addresses` with addresses for customers present in the 2025/2026 order snapshot and updates existing `database_jobs.invoice_address_id`, `database_jobs.delivery_address_id`, `database_jobs.invoice_address`, and `database_jobs.delivery_address`. It does not reimport jobs, line items, or positions.
- `--products-only` imports only product rows whose `tblProduct.ProductID` appears in current `database_job_line_items.source_product_id`. It creates/updates `database_products` and replaces that scoped product snapshot by default. It does not import the full Access product catalogue.
- The importer prefers `DATABASE_PUBLIC_URL` when running locally against Railway DB service variables.
- Run against Railway DB service variables:

```bash
railway run --service DB node scripts/import-database-mdb.js PS_XP_tab.mdb
```

Run only the 2025/2026 customer-address backfill:

```bash
railway run --service DB node scripts/import-database-mdb.js PS_XP_tab.mdb --addresses-only
```

Run only the products used by the current imported order lines:

```bash
railway run --service DB node scripts/import-database-mdb.js PS_XP_tab.mdb --products-only
```

UI rules:

- The DATABASE tab is a fixed-size, centered legacy-style hub matching the Access-era reference UI colors, scale, spacing, and layout, with every DATABASE view rendered at 120% legacy scale and an empty blue background around the reference canvas on wider dashboard screens. The outermost DATABASE tab background is darker than the legacy UI canvas, and the main legacy canvas has a subtle drop shadow.
- The DATABASE home screen is the default tab screen and includes the New Order button, main menu buttons, Open Orders count panel, and admin buttons. Reports and Marketing live at the bottom of the right-side admin button column below Error log; the old backup-status panel is removed. The Open Orders count panel title is centered, slightly larger, and bold, and the panel shows three open-order counts for Printing, Embroidery, and Business Gifts, sourced from `/api/database/outstanding-counts`. The legacy blue footer bar is intentionally omitted in the dashboard hub.
- The top DATABASE navigation has two main tabs, `Home` and `Outstanding Orders`. The small top-left button is `Back`, returns to the previous in-DATABASE view, and is hidden on the Home view; while hidden, the two main tabs span the full top tab row.
- The New Order button opens a centered legacy form without placeholder lookup buttons, fake combo-arrow buttons, or a customer-date checkbox. The customer field live-searches `/api/database/customers/search` as the user types; selecting a customer fills contact, delivery address, and invoice address fields from stored DATABASE customer/order data when available. Accept creates a manual job row in `database_jobs`, carrying through selected customer/contact ids and codes when present, then opens that created order in the order-details view.
- New manual orders set `database_jobs.order_taken_by`, `order_owner_user_id`, and `order_owner_name` from the logged-in Hub user server-side. The sidebar subtitle under `Ultimate Hub` shows the logged-in user's first and last name.
- The Customers main-menu button opens a legacy-styled list page backed by imported/manual `database_jobs` customer values plus manual customer profiles in `database_customer_profiles`, not the old separate dashboard customer tables. Customers are sorted alphabetically, searchable at the top of the page, and each row shows the latest order next to the customer record when one exists. Clicking a customer row opens a legacy-style customer page in the DATABASE tab. The list toolbar has an `Add Customer` button opposite the search box.
- The Add Customer button opens a centered legacy New Customer form based on the New Order form layout. It captures Customer, Code, Contact, Tel, Mobile, Email, Invoice Address, Delivery Address, and Account manager; the legacy Fax and Marketing inputs are intentionally omitted. Accept creates a `database_customer_profiles` row, then opens the created customer page without creating a `database_jobs` order row.
- The customer page mirrors the legacy Access-era customer layout with read-only Customer and Code fields, an editable Account manager dropdown populated from Hub users, created/edited metadata aligned with the customer-name row, and tabs for Orders, Contacts, Addresses, Quotations, Communications, and Design Numbers. The old top-right customer/code lookup dropdown panel, Edit button, and placeholder tab arrow buttons are not shown. Account manager defaults to the Hub user stored on the earliest customer order when available, falling back to legacy taken-by/staff values, and can be changed to another Hub user. The Orders tab lists all 2025/2026 orders for that customer in a vertically scrollable table and opens the existing order view when an order is clicked. The Contacts tab uses a scrollable legacy card list backed by `database_customer_contacts`, merged with order/profile contact usage; cards are separated by 10px, every field is editable, edits autosave on focus leaving the card and flush before DATABASE navigation/page changes, and each stored card has a red X delete path using the shared are-you-sure modal. The Contacts tab includes Add Contact but intentionally omits quote, alert, phone, mail, Marketing, and Manage Addresses controls. Add Contact opens a centered legacy form with Title, Firstname, Lastname, Tel, Fax, Mobile, Email, and Address fields and writes `database_customer_contacts`. The Addresses tab uses the two-column legacy form layout with default invoice and delivery address panels and individual Address 1-5/Postcode/Tel/Fax fields; manual job invoice/delivery address text is split into line fields as a fallback. The Design Numbers tab lists distinct `database_job_positions.design_ref` values for the customer's orders with each associated job/order number, order date, and job title, and opens that order when a row is clicked. Quotations and Communications are present as empty legacy tabs because those records are not imported into the current snapshot.
- The Outstanding Orders tab loads open jobs through `/api/database/jobs?status=open`, follows pagination until all open jobs are loaded, and groups rows into Print, Embroidery, Gifts, and Other using `order_type`/`order_type_abbr`.
- Clicking an outstanding order opens the in-tab order view. Users can return to the DATABASE home screen with the top-left Home button.
- The order view has three top tabs: Order details, Order Items, and Design. These tabs switch in place without navigating away from the dashboard. The order header reserves spacing above the tabs so document buttons and the metadata panel do not touch or overlap the tab strip. Clicking the customer control in Order details opens the customer page for that order's customer.
- In the order view, the `Order Ack.` document button opens an A4 order acknowledgement preview in a modal. The acknowledgement is rendered from the loaded DATABASE job, customer/address fields, line items, VAT/cost totals, and design positions; it lists stock items first, then non-stock items, then non-deliverable items after a small visual gap, then internal items. The acknowledgement renders explicit fixed-height A4 page blocks, repeats the logo/customer/order header on every page, centers the main 153mm data blocks on the A4 page centerline, and paginates line items, totals, positions, and comments before the 96mm footer-safe content clamp. The final Sub total, VAT, and Total summary prints as a standalone block slightly below all item groups, with unboxed labels and only the monetary amounts inside bordered value boxes. It includes the Ultimate logo at 60.5mm wide in the top-right of each page, anchored at its top-right corner, and a centered 146mm-wide Ultimate letterhead footer image offset 5mm above the bottom of every generated PDF page. The modal closes on outside-backdrop click or Escape and provides print/save-as-PDF controls through the browser print dialog; while printing, the document title is set to `<order no> - Order Acknowlegement` so Chrome uses that as the default PDF filename.
- In the order view, the `Invoice` and `Delivery Note` document buttons use the same A4 modal/print shell, Ultimate logo, and letterhead footer as the order acknowledgement. Invoice documents use the invoice address, set `Invoice No.` to the order number, omit the old ULT ref field, set `Cust ref` from `database_jobs.client_order_no`, set invoice date to the preview generation date, and list only stock, non-stock, non-deliverable, and internal line items with invoice totals and tax analysis. Delivery notes use the delivery address, relabel ULT ref as `Invoice No` using the order number, use the order date from the job order/created date, set delivery date to the preview generation date, set order taken by from the job owner, list only stock, non-stock, non-deliverable, and internal line items, and include blank Signed by, Print Name, and Date lines for the recipient.
- The order title is editable by default in the header and autosaves through `PUT /api/database/jobs/:id` using the same debounced/flush-before-navigation pattern as other DATABASE autosaves. Typing in the title also updates the cached Outstanding Orders row and order selectors immediately, so returning to the list shows the edited title without a page reload. The old Edit button next to the title is removed. The top-right metadata box no longer contains the Job/Order dropdowns; `By:` prefers `order_owner_name` and falls back to `order_taken_by`/legacy staff id.
- Order Details, Order Items, and Design tab content uses the legacy blue/grey/off-white fills for panels, table headers, and empty space. White backgrounds are limited to field-like areas such as customer/order inputs, selects, textareas, line-item entry fields, line item value cells, design edit boxes, supplier/screen fields, and comments fields.
- Order details surfaces every imported job field that maps to the reference screen, including customer/contact, type, dates, client reference, comments, invoice fields, and boolean flags.
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
- Customer contacts: `tblContact.ContactID` maps to `database_customer_contacts.source_contact_id`, `CustomerID` to `customer_id`, `AddressID` to `address_id`, `sTitle`/`sFirstname`/`sLastname` to split contact-name fields, `sTel`/`sFax`/`sMobile`/`sEmail` to the corresponding contact fields, `TraceStaffID` to `trace_staff_id`, and `dtCreate`/`dtEdit` to source timestamps. `contact_address` is the formatted linked `tblAddress` row. The legacy `ynMailout` field is present in the MDB but is intentionally not shown in the current contact UI.
- Customer addresses: `tblAddress`, joined through `tblCustomer.invaddressid` / `tblCustomer.deladdressid`, selected 2025/2026 `tblOrder.invaddressid` / `tblOrder.deladdressid`, and selected-customer `tblContact.addressid`. The importer only writes address rows for customers that appear in the 2025/2026 order snapshot, so historic-only customers and addresses are excluded. Imported jobs also store `invoice_address_id`, `delivery_address_id`, and formatted invoice/delivery address text from `tblAddress`.
- Line items: `tblOrderItem` joined to `tblProduct`, `tblStyle`, `tblStyleColour`, `tblColour`, `tblStyleSize`, `tblSize`, `tblProductType`, and `tblSupplier`. `line_sort_order` is assigned during import from the legacy item order and can be updated manually from the Order Items drag handle.
- Products: `database_products` is keyed by `tblProduct.productid` and is populated only from products referenced by existing `database_job_line_items.source_product_id`. Product rows join `tblProduct` to `tblStyle`, `tblStyleColour`, `tblColour`, `tblStyleSize`, `tblSize`, `tblProductType`, and `tblSupplier`, preserving style code, alternate style code, style name, colour, size, supplier, product type, unit cost, stock, and active flag.
- Positions: `tblOrderPosition`: `orderpositionid` maps to `source_order_position_id`, `orderid` to `source_order_id`, source row order maps to `position_sort_order`, `sposition` to `position_name`, `memcolour` to `colour_notes`, and `sdesign` to `design_ref`.

Current imported production snapshot:

- `database_jobs`: 1,162 rows.
- `database_job_line_items`: 5,870 rows.
- `database_job_positions`: 1,664 rows.
- `database_customer_addresses`: importer dry run against root `PS_XP_tab.mdb` on 2026-06-16 returns 583 rows scoped to customers in the 2025/2026 order snapshot.
- `database_customer_contacts`: importer dry run against root `PS_XP_tab.mdb` on 2026-06-18 returns 1,211 rows scoped to customers in the 2025/2026 order snapshot.
- `database_products`: 1,953 rows after products-only import on 2026-06-17, exactly matching distinct products referenced by current `database_job_line_items`; `stock` is present but all imported rows currently have stock `0`.
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

## Scripts

- `npm start`: starts `server.js`.
- `npm run smoke:lineitems -- <file>`: parse a line-item XLSX/CSV file.
- `npm run import:dropbox`: import all pending per-job Dropbox line-item files.
- `npm run smoke:open-orders -- <file>`: parse an open-orders CSV file.
- `npm run sync:open-orders -- [file] [--dry-run]`: sync open-orders CSV from file or Dropbox.
- `npm run import:database-mdb -- [PS_XP_tab.mdb] [--dry-run] [--append]`: import 2025/2026 MDB jobs into DATABASE tables. Add `--products-only` to import only product rows referenced by existing imported order lines.

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
- `database_products` is a scoped product snapshot, not the full MDB product catalogue. Re-run `--products-only` after importing or replacing DATABASE line items.
