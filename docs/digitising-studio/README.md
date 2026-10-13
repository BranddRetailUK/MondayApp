# Digitising Studio — local experiment

Start with `npm run preview:digitising-studio`, then open http://127.0.0.1:3110/?tab=digitising-studio. The server binds loopback only and rejects other Host/Origin values. It does not connect to Postgres, mount production APIs, write library files, or save uploads. The production application does not mount its API; its navigation entry stays hidden there.

Server credentials: existing `OPENAI_API_KEY`, optional `OPENAI_DIGITISING_MODEL` (default `gpt-5-mini`). Only the explicitly uploaded artwork and setup go to OpenAI, with `store:false`. The API key never reaches the browser. OpenAI gives a design assessment; deterministic code generates stitches. This is not model training or learned professional digitising.

## Implemented

- PNG and self-contained, outlined SVG input (8 MB, 16 MP limit); normalized raster geometry, up to eight approximate palette colours and 128 connected regions. Vector geometry is rasterized, not retained as editable embroidery objects.
- Width/height editing with locked aspect ratio; dimensions use the visible artwork bounds. Width 20–200 mm, hoop safety inset 5 mm each side.
- Individual connected-region thread colours with artwork thumbnails and optional thread-code/needle notes; all-white/all-black overrides. Near-white removal is explicit and also removes internal white elements. Disable it when white belongs in the design.
- T-shirt, hoodie and woven provisional presets affect sparse vertical underlay spacing (1.8/1.3/2.2 mm), plus editable horizontal fill spacing and stitch length. These are test defaults, not inferred customer fabric settings. Actual stabilizer/backing material is not generated or verified.
- Optional three-pass running boundary in the selected garment colour. This is not a satin border and is experimental; tiny boundary fragments may be omitted.
- Actual generated DST decoded for the canvas, stitch-progress slider, travel overlay, exact file download, separate JSON thread sequence/setup/assessment, and local proven-DST comparison. DST does not retain thread colours; the JSON sequence must accompany it.
- Conventional three-jump trim requests, split long jumps, tie stitches and a final jump to the origin. Trim interpretation is controller-dependent. No sequin commands. Run fragments shorter than 0.8 mm are omitted and counted.
- Caps are selectable but generation is explicitly blocked. This engine does not yet implement centre-out cap sequencing, satin columns, letter reconstruction, pull compensation, optimization of element order, or production-quality path planning. No preview implies machine approval.

## Library evidence — 13 October 2026

The read-only inventory found 6,600 DST, 4,022 PXF, 4,313 DGT, 1,494 EMB and 1,309 PDF files. All 148 locally downloaded DSTs were parsed successfully. The remaining 6,452 DSTs were cloud placeholders and were skipped to avoid indefinite OneDrive hydration. The sample is availability-biased, not representative by construction.

Across these 148 designs, medians were: width 83.1 mm, height 48.2 mm, 5,039 stitches, two colour blocks, median stitch length 2.20 mm, and per-design 95th-percentile stitch length 4.0 mm. A sequence of three jumps is recorded only as a possible trim, not proof that a controller trims there. DST cannot establish stabilizer, needle, actual thread colour, original object types, intended fabric, or whether a sew-out passed.

Re-run `node scripts/audit-embroidery-library.mjs /absolute/library/root /tmp/library-audit.json`. On macOS it skips files with zero allocated blocks (a practical placeholder heuristic). It samples up to 250 readable files evenly across sorted paths. Private names and measurements are written only to the chosen local JSON, not committed. Download additional folders through OneDrive to expand the sample.

PSG7000 exists here as PDF and PXF, with no matching DST in the Embroidery tree. Its downloaded run sheet specifies 85.8 × 79.6 mm, 8,313 stitches and seven colour blocks: Madeira codes 1366, 1297, 1249, 1068, 1278, 1147, 1001. The sheet’s needle labels (16–21 and 7) are software assignments, not confirmation of physical needles on the user’s controller. Its 200×200 PXF thumbnail shows a rainbow and small lettering, but is not source artwork. Palette/connected-region analysis exceeds the prototype's region limit; it is not an acceptable digitising input. Flat source artwork was subsequently found and downloaded from DESIGN FILES/28500-28599/28516 Over the Rainbow/rainbow.pdf. It includes raster and vector versions with a bottom strapline; the PXF preview omits that strapline and uses white title lettering. This requires a deliberate embroidery adaptation, not blind raster conversion. A proven DST exported from PXF remains required for the stitch-level benchmark. The Pulse Ambassador website was opened in the in-app browser but failed to provide a working login during this session.

## Acceptance remains open

1. Export PSG7000 to a proven DST and confirm which source-art adaptation and garment it represents. Source artwork and its production worksheet have now been located.
2. Compare orientation, scale, shape coverage, colour order, stitch count/lengths, underlay, satin columns, travel and trim placement against that reference.
3. Implement the missing satin/text/path-planning behaviour before expecting a comparable rainbow design.
4. Inspect the exported file in Pulse; identify the exact Tajima controller's trim and colour-stop behaviour.
5. Sew out on intended fabric/backing, measure distortion and registration, record thread breaks and lost detail, then revise settings. Caps require a distinct validated strategy.

Success means a repeatable acceptable physical sew-out. That condition has not yet been achieved.

## Job cross-reference evidence

`node scripts/cross-reference-embroidery.js PSG7000 /tmp/psg7000-jobs.json` performs a bounded, 15-second-timeout READ ONLY transaction against configured Railway Postgres. Numeric-only searches are deliberately broad candidates; a number in a stitch count or ink code is not a PSG match. It never relinks or edits orders. Reports can include private job information and must stay out of Git. The local preview itself still has no live DB connection.

Design 28516 maps to Over The Rainbow jobs 50151, 50436, 50659, 50875 and 51299. The first three explicitly pair DTF with strapline (28516) with left-breast fleece embroidery PSG6893, 9,163 stitches. Their embroidery notes list navy 1366, blue 1297, green 1249, yellow 1068, orange 1278, red 1147, black and white. The queried rows do not establish PSG7000 as the replacement. Keep PSG6893 and PSG7000 distinct until their design history is confirmed.

Twelve locally available production PDFs were text-inspected, and the PSG7026 sheet was visually rendered. They demonstrate explicit thread brands/codes, ordered needle assignments, trims, garment-specific variants (e.g. beanie), and garment-coloured thread steps. They do not supply enough information to reconstruct Pulse object parameters.
