# Retired packing scanner connection reference

Retired 13 October 2026. Last implementation: Git commit `f38ec2f`.

## Connection

- A USB serial connection selected manually through Chrome/Edge's Web Serial API (`navigator.serial.requestPort()`). The browser displayed its device picker; no USB vendor/product filter or saved port ID was configured.
- The Connect Scanner button appeared for the Hub user whose normalized full name was `Ultimate Packing` (the packing account). It lived in the sidebar dashboard controls, before Sign out.
- Requires a browser with Web Serial support and a secure origin (HTTPS or localhost). Select the scanner's serial port and grant browser permission. Another application holding the port can prevent opening it.
- Serial settings: **115200 baud, 8 data bits, 1 stop bit, no parity, no flow control, 255-byte buffer**.
- After opening, the app attempted to assert **DTR and RTS** (`dataTerminalReady: true`, `requestToSend: true`). Failure to set these signals was tolerated.
- Input was decoded with `TextDecoderStream` (default UTF-8). CR/LF separated scans. Partial input flushed after **140 ms idle**, or when accumulated input exceeded **8192 characters**. The old reader also recognized an `i=<digits>` plus `sig=<hex>` URL before a line ending arrived.
- Disconnect/page unload cancelled and released the reader, cancelled decoding, closed the port, cleared buffered input and the idle timer. Browser serial connect/disconnect events updated connection feedback. There was no automatic port reconnection or remembered device identity.

## Former barcode protocol

- Bare numeric job IDs were expanded using `GET /api/test-dashboard/scan-url?jobId=...`.
- Signed URLs used `/test-scan?j=<source-order-id>&ts=<milliseconds>&sig=<hex>`; legacy `i=` was accepted. Split jobs could use their virtual Print/Embroidery IDs.
- Signing used HMAC-SHA256 over `<itemId>.<ts>` with the server's `SCAN_SECRET`. No secret value is stored here. The retired implementation used `change-me` if the environment variable was absent; do not reuse that fallback in a future implementation.
- The browser posted `{ "scan": "<URL>" }` to `/api/test-dashboard/scanner`. The public signed URL also advanced status when opened.
- Old progression was first scan Checked In, second In Production, third Completed, capped at three. Environment overrides were `STEP1_STATUS_LABEL`, `STEP2_STATUS_LABEL`, `STEP3_STATUS_LABEL`.
- `job_scans` and `job_scan_events` retain historical records. They are no longer used to drive the board. Current labels contain no barcode/QR; label printing checks jobs in and completion is manual.

## Hardware identity and future reuse

The application did **not** record manufacturer, model, USB VID/PID, device serial number, OS port name, or scanner configuration-barcode instructions. These cannot be established from the source code. Read them from the physical scanner/device picker before future reuse.

For a new use, start with the serial settings above, inspect actual scanner output, and implement a new explicit action protocol and authorization checks. Do not restore the old automatic job-status endpoints or expose the signing secret. Historical implementation can be inspected with `git show f38ec2f:public/script.js` and `git show f38ec2f:src/services/scanner.js`.
