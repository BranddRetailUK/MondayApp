# Ultimate Hub print worker

Current exporter/core: 1.13. The worker counts PDF pages, then Illustrator processes
each page or imported artboard. Embroidery positions are ignored. PNG model photos
and vector flats may both serve as garment bases; output remains EPS for vector-only
artwork and PNG for artwork containing raster images. Identical isolated artwork at
the same labelled size is saved once across pages. PNG capture retains a safety
margin and never repeatedly trims after the final resample.

Install the **whole updated worker folder**, including `worker.js`, `local-files.js`,
`vendor/pdf-lib.min.js` and the three `exporter` files. Close any active Illustrator
review and wait for its result to report, then restart the worker. Updating only the
exporter folder will leave PDF page counting unavailable. The standalone worker
still needs no npm installation.
At startup the worker prints its running folder and `exporter 1.13`; it refuses to
claim work if the exporter and detection core versions are mixed. If Hub still
reports `Multi-artboard proofs require manual export.`, the workstation is using a
pre-1.13 exporter from another folder. Locate the folder printed in the worker
window, update that folder, preserve its `config.json`, then restart the worker.

Confident, fully prepared proofs export automatically; uncertain detections, manual
selections and preparation failures still show review. Successful exports open PRINT
in File Explorer without a success alert. Export errors show a dialog and are
reported to Hub after dismissal.

This package runs on the signed-in Windows computer that has Illustrator and your synced DESIGN FILES folder. Ultimate Hub queues exports when a real DATABASE job's JOB tick changes from unapproved to approved. Numeric print designs >=28300 are eligible. PSG, older designs, embroidery-only jobs and private dashboard jobs are excluded. Mixed print/embroidery jobs export only their eligible numeric print references.

The first release retains Illustrator's artwork review dialog. Settings and folder selection are supplied automatically. Approving the proof in Hub and reviewing the extracted artwork are separate steps. Jobs run one at a time. This is not a Windows service and does not run in a logged-out session.

## Server setup

Deploy the accompanying Hub code from the feature branch after review. Normal startup creates the queue table. No existing approvals are backfilled.

1. Generate a long random token, for example with Node: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
2. Add that value as Railway `PRINT_EXPORT_WORKER_TOKEN`. Keep it private; this token can claim and report print work only.
3. The sidebar **Print exports** switch starts **Off**. Complete workstation setup, then sign in as `production@ultimatepromotions.co.uk` and turn it On immediately above Sign out. The setting is stored in Postgres and takes effect without a restart. Other accounts cannot see or change this switch. The former PRINT_EXPORT_ENABLED environment flag is no longer used.
4. The Dashboard has a **Print exports** button showing the latest 200 tasks and their results. Export state does not change STATUS, TRANS or other production fields.

No token is included in this package or stored in the repository. Turning the sidebar switch Off stops new queue entries and claims; in-flight jobs can finish. Unapproving a job cancels its queued/running tasks even if the feature has been disabled.

## Workstation setup

1. Install Node.js 22 or later and ensure `node` is available in a new Command Prompt. Illustrator must be installed and licensed for the signed-in Windows user.
2. Extract the whole worker folder to a permanent user-writable location, such as `C:\UltimateHub\PrintWorker`. Keep all files and the `exporter` subfolder together. If Windows marks the downloaded ZIP as blocked, use its Properties > Unblock before extracting. The launcher uses PowerShell RemoteSigned; it does not bypass execution policy. Managed computers may need their administrator to approve/sign the scripts.
3. Copy `config.example.json` to `config.json`. Set `hubUrl`, `workerId`, your actual `designRoot`, and the same random token used on Railway. Do not commit or share config.json.
4. Mark DESIGN FILES **Always keep on this device** in OneDrive where practical. The worker reads a proof fully before opening it; unavailable or ambiguous files need attention.
5. Close any proof already open in Illustrator that the worker is about to process. Double-click `start-worker.cmd` and keep that window running. It polls Hub every ten seconds.
6. After the server is enabled, approve one eligible test job in Hub. The proof opens locally; check each artwork preview and click Export. Outputs are saved in that design folder's PRINT subfolder. EPS is used for vectors, PNG for raster/mixed artwork, using the proof's size and 300ppi for PNG.
7. Verify this first real Windows/Illustrator run before leaving the worker in routine use. Native COM launch, ScriptUI review and real Illustrator output cannot be verified by the Linux development tests.

To start at sign-in, put a shortcut to start-worker.cmd in the current user's Startup folder (`shell:startup`). Do not configure it to run while the user is logged out. Start only one worker on the designated production computer.

## File selection and output behaviour

- Searches up to six directory levels / 30,000 folders. Numeric range folders are traversed only if they contain the design number. Symlinks/junctions are not followed.
- Requires one folder containing the exact design-number token. `29109` does not match `129109`.
- Requires exactly one direct child file ending in `proof.pdf` or `proof.ai`, case-insensitive. Two matches require operator attention; it never guesses the newest revision.
- The numeric reference from Hub DES/PSG is the source of truth for folder selection and output filenames. Old numbers printed inside reused proofs or in their filenames do not block automation and never override Hub. The containing folder must match the queued design number. Manual runs still read the proof reference.
- Multi-page PDFs and multi-artboard AI proofs are processed page by page. PDF page count is read before Illustrator opens the file. Missing readable print labels, unavailable links, already-open proofs or incomplete previews require attention.
- A skipped detected view produces Needs attention even if other artwork exported. Inspect those outputs before retrying; the script does not silently mark a partial job complete.
- Existing output files are preserved with version suffixes. No text report is written to PRINT. Worker recovery records are stored under `%LOCALAPPDATA%\UltimateHub\PrintWorker`.
- The worker uses the bundled exporter. Renaming or installing your separate manual JSX does not change this copy. The bundled JSX can also be run manually via File > Scripts > Other Script.

When testing, turn the switch On, approve the intended test job, then turn it Off after the worker has claimed the task. While On it applies to eligible approvals by all users. Off pauses unclaimed tasks; they resume if switched On again. Approvals made while Off are not queued later. An already running export can finish.

## Recovery

The server issues a unique claim for each attempt, renewed by a heartbeat. If contact is lost, the task needs attention instead of being automatically re-exported. A final result whose HTTP reply was lost is retried from the local pending record without launching Illustrator again.

If the worker crashes or is forcibly closed, it intentionally leaves `worker.lock`. Check that no other worker or export is running before removing that file. Restart the worker to report a saved result. If it reports an unfinished previous export, close that export's review/temporary documents in Illustrator, inspect PRINT, preserve a copy of pending.json for diagnosis and move pending.json aside. Restart the worker, then use Retry export in Hub once the task needs attention. Do not kill Illustrator if it contains unsaved unrelated work.

Removing approval or changing design references stops a queued task before launch and is detected during worker heartbeats. Cancellation is cooperative at script checkpoints, including before copying each completed output. A file already written stays in PRINT; cancellation does not delete production files. A native Illustrator call/dialog cannot be forcibly interrupted safely, so dismiss the review when asked to stop. The worker does not launch another job until its Illustrator invocation finishes.

Reapproving a job creates a new approval cycle and can create versioned outputs. Explicit Retry also preserves old files. Review outputs first.

## Developer checks

Run `npm ci` and `npm run test:print-exports` from the repository root. Tests use an isolated embedded PostgreSQL engine and temporary filesystem fixtures, not Railway or OneDrive. The workstation worker has no npm dependencies. Windows end-to-end testing remains required.
