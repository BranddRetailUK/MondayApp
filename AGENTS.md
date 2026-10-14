# Agent Instructions

At the start of every chat in this repository, read `contract.md` one time first to gain service context before making changes or answering implementation questions.
only re-read the contract file if further context is required later in the chat

Treat `contract.md` as the source of truth for service features, webhooks, endpoints, sync logic, and known risks. If code behavior changes, update `contract.md` in the same change.

Runtime note for Codex shells: this Mac has Homebrew Node installed at `/opt/homebrew/bin/node` and npm at `/opt/homebrew/bin/npm`. If a fresh chat/session reports `node` or `npm` missing from `PATH`, do not search the filesystem; run Node/npm checks with `/opt/homebrew/bin` prepended, for example `PATH="/opt/homebrew/bin:/opt/homebrew/sbin:$PATH" npm run smoke:open-orders`.

After completing and validating code updates in this project, commit and push the task changes to `main` unless the user explicitly requests otherwise. Preserve unrelated working-tree changes.

## Digitising engine acceptance

The user accepts a 90% minimum for digital stitch quality. The accepted set is recorded in `docs/digitising-studio/accepted-designs.json`, including Smiley. Whenever refining the digitising engine, run the complete accepted-design regression check after meaningful changes and before committing/pushing; use the instructions in `docs/digitising-studio/OBJECT-PIPELINE.md`. Preserve each accepted baseline as well as the 90% floor. Do not silently omit fixtures, lower baseline scores, replace reference files, or change the evaluator to obtain a pass. Soul Disciples has no designer reference and must remain byte-identical unless the user explicitly accepts a replacement. Missing private fixtures must be reported as an unverified regression check, never a pass.
