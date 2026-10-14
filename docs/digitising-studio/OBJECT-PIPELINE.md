# In-house object pipeline

Status: experimental tooling, not the default customer generator. OpenAI remains
available for source artwork interpretation. No external digitising API is used.

The separation is now executable:

1. Artwork preparation and optional OpenAI interpretation propose a physical
   project. Existing PNG, SVG and EPS preparation is shared.
2. The project stores ordered, coloured satin columns, fill regions and running
   paths in millimetres. It can be inspected and edited before compilation.
3. A deterministic local compiler applies garment defaults, samples the geometry,
   creates support/top stitches, routes travel, and encodes DST. It has no model
   or network call. Identical projects produce identical machine output.

## Tools and limits

`src/services/digitisingProject.js` exports validation, immutable edits and
proportional resizing. Edits include geometry/direction rungs, fill angle, physical
stitch settings, entry reversal, sequence movement and satin splitting. Resizing
preserves aspect ratio and density settings; compile again at the new size.

Satin has paired direction rungs along a stroke, including closed columns around
counters. These rungs explicitly control cross-stroke sewing. The AI selects named construction tools from labelled source crops and measured
stroke widths. The local engine fits stems, bowls, legs, crossbars, closed counters
and paired boundary ribbons to actual source pixels. Ribbon rails spread corner
turns over the adjoining arms instead of switching stitch angle abruptly.
Generic curved/branched shapes retain the skeleton-based tool. Invalid semantic
constructions fail; generic fallback fills remain explicitly provisional. Widths outside 0.3–9 mm fail validation.
Centre and inset zigzag satin support are available. Closed contours permit
repeated inner fan points without admitting self-intersecting rails. Broad fills use a specified
angle and optional perpendicular sparse support. Runs follow explicit paths.

Fill scanlines split into continuous strips at forks/counters. Connectors are
checked against contours and holes; a verified contour detour is used where
possible, otherwise a trim/jump. Three-jump trim requests remain controller
dependent. Boundary checks allow DST rounding and bounded satin compensation.
Sibling sections can share a validated source travel region. Connections are
checked against that region and its holes, including bounded pull compensation.
Short row-edge movements are skipped only when the direct return remains inside
the fill. These are digital checks, not a physical thread coverage model.

The experimental T-shirt profile uses 0.20 mm fill-row pitch, 0.55 mm fill support
pitch, 0.30 mm satin spacing and a 6 mm maximum fill movement. Hoodie and woven
profiles retain separate physical defaults. These are provisional, reference-
calibrated settings; fabric/thread sew-outs are still needed.

Current limits: 128 objects, 12,000 validated control points, 512 vertices per
contour, 256 satin rungs, 150,000 generated commands, 300 mm width and 360 mm
height. Invalid/intersecting geometry and objects producing no sewing stitches
fail explicitly. Counter preservation, curved stitches, rotated fill, L arms,
editing, resizing, access control and independent uploads have regression tests.

## Use

Compile a reviewed project without network access:

```sh
npm run compile:digitising-project -- project.json output-directory
```

This writes `candidate.dst`, normalized `project.json`, `compile.json` with
object/phase-labelled commands, and a colour-correct schematic `preview.svg`.
`test/fixtures/digitising/object-tools.json` is a public synthetic example.

Authenticated production-user tools:

- Multipart `POST /api/digitising-studio/project`: artwork and normal customer
  settings produce an editable project, interpretation, review flag and warnings.
- JSON `POST /api/digitising-studio/compile-project`: a reviewed project produces
  local compiler output. Existing authentication and the processing lock apply.

The customer Create button and `/generate` still use the existing generator.
There is no object editor UI yet. These endpoints support development/review.
Automatic running outlines are supported as explicit run objects; see the gated
Create integration below.

Run a held-out comparison:

```sh
npm run benchmark:digitising-project -- source.png settings.json previous.dst reference.dst output-directory [interpretation-cache]
```

The source passes through artwork interpretation, object proposal and compilation
before either comparison DST is read. Only normal customer settings are accepted.
The script saves the project, proposal warnings, candidate, preview and decoded
comparison. An existing interpretation cache avoids an unnecessary OpenAI call.
It reports diagnostics, not an exact-command or production-quality pass score.

## Good Game calibration result (2026-10-13)

The first object candidate failed visual acceptance and needed ten provisional
lettering fill replacements. After tool/planner iterations, the original PNG
passed through the real OpenAI source interpretation and named-tool planner,
then the local compiler at 99 mm width. No reference commands or reference
geometry enter either planning request or compilation. OpenAI requests use
`store:false`; no external digitising service is connected.

Good Game is a **development/calibration reference**, not an independent held-out
validation set. Shared profiles and tools were refined using its comparisons.
There are no logo IDs, supplied coordinates or reference stitches in production
code. Independent synthetic rotations, sizes, touching counters, ribbon corners
and sibling travel exercise the same tools.

The final candidate has 6,447 decoded sewing movements, 99.0 × 63.8 mm sewn
bounds, three colour stages, 60 raw jump commands and 97 movements below 0.5 mm.
The compiler requests 17 trims. GAME.DST has 7,450 sewing movements, 99 × 64 mm,
24 raw jump commands and 85 short movements using the same independent reader.
Trim interpretation depends on file encoding and controller; raw jumps are not
trim counts. Stitch count alone is not the fidelity score.

| Colour stage | Shape IoU | Local direction | Thread density |
| --- | ---: | ---: | ---: |
| GOOD | 93.868% | 90.404% | 91.322% |
| GAME | 97.985% | 96.353% | 96.880% |
| APPAREL | 95.536% | 91.082% | 90.954% |

The minimum of all nine measurements is **90.404%** against GAME.DST and
**90.361%** against GAME.PES. Both pass the defined 90% digital gate, plus colour
stage count, size (≤1 mm difference) and short-movement (≤5%) gates. One isolated
source speck below 0.05 mm² and 0.6 mm extent is omitted with a review warning;
there are no lettering fill fallbacks in this candidate. The project retains
`reviewRequired:true` for that warning.

### Reproduce the digital evaluation

Install optional local Python analysis dependencies (`pyembroidery`, `numpy`,
`scipy`, `Pillow`) in a virtual environment. They are not server dependencies.

```sh
python scripts/evaluate-digitising-quality.py candidate.dst GAME.DST score.json
python test/digitising-quality-evaluator.test.py
```

The evaluator independently decodes the exported DST/PES. It allows one global
translation to align sewn bounds, with no scaling or per-letter warping. At a
0.25 mm grid it compares rasterized stitch silhouettes, local axial stitch
orientation and thread-length density (1 mm smoothing). Every colour stage must
pass every measure, so the large white fill cannot hide weaker lettering. Tests
confirm identical output scores 100 and wrong direction, sparse fill and wrong
size fail. This is a documented engineering metric, not a universal embroidery
quality percentage or a machine sew-out certificate.

Remaining differences include bowl/stem joins, exact needle-placement texture,
travel/trim setup and fabric response. The customer Create button remains on
the existing generator while this new path is available through `/project` and
`/compile-project`; it has not been promoted on the strength of one logo alone.
Private source, reference, intermediate iterations and final comparison files
remain outside Git. Physical sew-out and additional real designs are the next
acceptance steps.

## Create integration and routing audit (2026-10-14)

`Create /generate` now defaults to source interpretation, named tool selection,
object proposal and the local compiler. `DIGITISING_OBJECT_PIPELINE=false` is an
explicit server-side rollback to the legacy generator; an unset value uses the
object pipeline. Request fields cannot select the engine. There is no silent
legacy fallback on a failed proposal or compile. `/project` and `/compile-project`
remain available. This is still a test-version workflow requiring sew-out review.

The adapter preserves source physical sizing, linked aspect ratio, garment and
outline choices. It independently decodes the exported DST for the existing
browser's dimension fields and checks sewn bounds against hoop clearance. The
upload preview stays the original source raster; stitch preview/download continue
to use the exported DST and accompanying thread colours.

Optional outlines are explicit three-pass run objects with 1 mm maximum movements.
They follow original included source contours and counters, not the seams of
artificial satin/fill sections. All outlines sew last in the selected colour;
this deliberately differs from the legacy per-element outline sequence. Both
outline and object limits fail explicitly rather than silently dropping detail.

The routing audit found that an entry connector could sew after a trim/colour
change when the preceding position was inside the next object's boundary. Such
entries now jump; continuing same-thread connections retain the existing geometry
checks. Entry checks use quantised destinations. Regression tests include overlapping
colour objects and the existing counter/sibling travel cases.

New integration fixtures are a counter badge, a two-colour pennant and disconnected
tiles, each at 60 and 90 mm canvas width across T-shirt, hoodie and woven profiles.
They exercise authenticated multipart Create, both AI response schemas, source
contours, optional outlines, deterministic compilation and independent DST decode.
AI responses are mocked: these are **synthetic engineering checks**, not held-out
customer artwork, real-model tool-selection validation or production comparisons.
No new production-reference percentage is claimed. The evaluator negative controls
remain necessary but do not establish general quality.

Remaining acceptance work: unrelated real artwork paired with proven DSTs, inspected
at several physical sizes; bowl/stem overlaps and corner needle concentration;
coverage of thin curved/branched regions and explicit fallback warnings; actual
thread coverage of connection routes (being inside a region alone is insufficient);
controller trim recognition; and physical sew-outs on each intended fabric. Default
promotion still requires this evidence. No bulk training or reference-stitch copying
was introduced.

## Finished panels and LEGION calibration (2026-10-14)

The source-only planner now has `finished-panel` and `stems-diagonal` tools.
A finished panel requires a measured rectangular perimeter enclosing at least two
foreground regions. The local tool fits an oriented rectangle from that perimeter,
sews a continuous ground under the foreground, then a 2 mm inset satin edge in the
same colour. Its fill has a 0.6 mm inset, 4 mm maximum movement and a 125-degree
angle relative to the longest side. The ground uses the existing garment density
and support settings. Redundant same-colour enclosed islands are covered by the
ground rather than sewn twice. Foreground objects follow the completed panel.
This is distinct from the optional three-pass running outline. It is not a general
promise that every polygon, patch, fabric or edge construction is supported.

Long italic ribbons which exceed the ordinary 9 mm limit retry contour fitting
with bounded raster simplification and monotonic, source-constrained rail pairing.
Existing valid ribbons retain their prior construction. Explicit split satin
permits direction rungs up to 12 mm; the compiler subdivides sewing movements at
its existing 9.6 mm limit. Ordinary satin remains limited to 9 mm. Open curved
columns with invalid skeleton rails fit measured end caps and paired source
boundaries; raster-aware tolerances handle rotated, lower-resolution inputs.
Diagonal-stem tools partition
source geometry at measured inside corners. Tiny non-advancing control intervals
are removed without discarding the closed column's seam. Over-detailed controls
retry paired simplification at a bounded 0.15 mm tolerance before the normal
256-rung limit is enforced.

LEGION's original PNG was processed by real OpenAI interpretation and tool selection
(`store:false`) and the local compiler at 150 mm canvas width. The first attempt
failed satin validation; subsequent iterations repaired the shared tools. No
reference stitch/coordinate data was passed to generation. LEGION is now a second
**calibration** design, not an independent held-out test after these iterations.

The resulting DST has 15,516 nonzero sewing movements, 150.2 × 40.1 mm sewn bounds,
two sewn colour stages, 33 jump commands and 28 movements below 0.5 mm. The reference
has 14,992 nonzero sewing movements and 150.2 × 40.8 mm bounds. Its trailing empty
stop block is recorded separately; the evaluator excludes only trailing empty
colour blocks, retaining interior gaps and sequence positions. Negative controls
cover this distinction as well as wrong direction, density and size.

| Stage | Shape IoU | Local direction | Thread density |
| --- | ---: | ---: | ---: |
| Finished ground | 98.289% | 91.127% | 91.726% |
| Lettering | 80.830% | 91.413% | 85.388% |

**The complete design fails the existing 90% digital gate.** Size, colour sequence
and short-movement gates pass; the red panel passes all three field comparisons.
There are no provisional lettering fills in the final proposal. The original PNG
and the production DST do not have identical foreground placement: a diagnostic
foreground-only translation of approximately −0.5 mm X / −0.75 mm Y raises white
silhouette agreement to about 91.9% (direction 92.3%, density 89.3%). That translation is **not applied to generation
or to the accepted evaluator score**. The user confirmed this was the original
artwork but the digitiser may have altered the final design. Remaining density,
corner/needle texture and placement differences must not be described as a full
match. Physical sew-out remains unverified, including whether the panel/lettering
stack and satin edge produce the intended clean finish.

All 70 digitising tests and both evaluator tests pass. Regression checks include
rotated/resized finished panels, rotated italic ribbons,
diagonal stems, source coverage, bounded stitch lengths and prior Create behaviour.
Good Game regenerates byte-identically to recompiling its previous project with
the current baseline compiler and still achieves the 90.404% minimum against DST.
The PES comparison also remains above 90%, at 90.361%. The earlier saved 6,447-movement file predates the separately committed entry-travel
fix; the current baseline has 6,446 movements. No new private artwork or reference
stitches are committed. The live Create rollout switch remains off by default.

## Creator batch calibration (2026-10-14)

The user authorised this reference batch and explicitly approved source-artwork
interpretation calls to OpenAI (`store:false`). This is deterministic engine/tool
calibration, not model-weight fine-tuning. Original Dropbox files are read-only;
private manifests, source rasters, proofs, caches, generated DSTs and the browsable
report remain uncommitted under `output/digitising-studio/creator-batch/`.

All 17 inventoried DSTs are accounted for. Ten have visually consistent artwork
candidates: six flat calibration entries (four design families), two reserved
holdout designs, and two puff-only diagnostic entries. Repeated trident sizes
stay in one family/split. Two cap references remain unsupported. The heart and
two running-figure DSTs lack matching source art: the supplied HUTTON crown/name
and Slow wordmarks are different designs. The TS raster is a stitch rendering,
not a clean source. TERMITE is excluded at the user's request. Historical proof
of exactly which file was sent is not established by visual matching.

The initial run exposed invalid model tool choices and invalid optional shared
travel boundaries. The planner now constrains each source id to tools compatible
with its measured counters, satin eligibility and panel eligibility, grouping
identical constraints to bound schema size. Response validation remains in place;
the planner cache version is advanced. A named tool whose fitting operation fails
retries the existing generic source construction with an explicit review warning.
Invalid generated satin geometry still fails validation; no width limit is
relaxed. An invalid optional shared travel polygon no longer discards individually
valid sewing objects: those keep ordinary validated travel/trim behaviour and a
review warning. Invalid sewing objects are never accepted by this recovery.

The existing per-stage evaluator and thresholds are unchanged. Results from the
revised source-only pipeline:

| Design | Split | Minimum digital score | Outcome |
| --- | --- | ---: | --- |
| HUTTON crown/name | Calibration | 63.253% | Below 90; short-movement gate also fails |
| LIONFACE | Calibration | 77.192% | Below 90; short-movement gate also fails |
| Trident, nominal 55 mm tall | Calibration | 79.582% | Below 90; size gate also fails |
| Trident, nominal 80 mm tall | Calibration | 84.591% | Below 90; size gate also fails |
| Trident, nominal 100 mm tall | Calibration | — | Selected satin geometry exceeds width constraints; no candidate |
| LEGION | Calibration | 80.830% | Below 90; known source/reference placement discrepancy remains |
| Worthy | Holdout | 59.990% | Below 90 |
| Lips | Holdout | 37.682% | Below 90; direction differs despite 93.812% silhouette and 95.835% density |

The two puff diagnostics fail generation on the initial baseline (element limit
and unfittable named construction); they are not flat-embroidery acceptance tests.
No scored design passes 90% or 95%. Nominal widths were rounded from reference or
worksheet dimensions, transparent margins were cropped and very large rasters
were downsampled to the existing 2000-pixel working resolution. T-shirt settings
are an explicit baseline assumption because original substrates are undocumented.
These input choices are recorded, not silently fitted during evaluation. Source
rasters and reference DSTs remain separate; only the evaluator reads production
stitches, after candidate generation.

This batch demonstrates that the 90–95% target is **not achieved**. Remaining work
includes robust curved/branched satin reconstruction, source-contained joins,
short-movement control and an explicit construction/direction specification for
broad fills; a source image alone does not encode a digitiser's fill angle or puff
recipe. No score-driven per-design geometry correction was introduced. Holdout
results are reported without tuning against them. The prior Good Game proposal
and current-baseline compiled DST remain byte-identical (6,446 movements). The
customer rollout switch is unchanged and defaults off.

### Reusable private batch runner

```sh
npm run benchmark:digitising-batch -- private-manifest.json new-run-directory \
  --interpret --split=calibration --python=/path/to/evaluation-venv/bin/python
```

Each manifest entry supplies `id`, `family`, `split`, `source`, `reference`, and
ordinary customer `settings`. Splits are `calibration`, `holdout`, or `diagnostic`;
choose one per invocation. Omitting `--interpret` runs locally without model
calls. The runner rejects families crossing splits, input/output overlap, and
existing run directories, so a failed rerun cannot leave a stale candidate that
looks current. It records every selected entry including failures, source and
reference hashes, engine/evaluator fingerprints, warnings and per-stage scores.
Reference access occurs only after generation. Additional source provenance and
assumptions can be retained in the private manifest. This runner does not train
model weights or automatically promote a live generator.

Validation: digitising regressions, batch split/input isolation and failure
accounting tests, evaluator negative controls, plus the cached Good Game
construction/compiler regression. Localhost API tests required normal loopback
permissions; their first sandbox-only attempts failed with `listen EPERM` and
passed when rerun with that permission.

### Creator batch: turning columns and joins (2026-10-14, second development pass)

The user requested continued iterations and identified the tridents' changing
stitch direction as intentional depth. The engine now recognises a bounded,
upright three-prong source topology and fits turning side ribbons around the
shoulders with a crosswise centre column. This uses original source pixels,
not reference stitch coordinates or filename-specific geometry. Pointed caps
receive a small measured cross-section; monotonic boundary pairing preserves
turns. Unsupported orientation/topology or an invalid fit retains ordinary
planning with a review warning. This is not a general arbitrary-fork solver.

The compact T-shirt fork construction (all fitted widths below 7 mm) uses
0.24 mm satin spacing and 0.3 mm compensation, plus three-pass source-tip runs.
These are development calibration settings, not a physically validated fabric
profile. Larger forks retain the existing minimum-width satin cutoff at fine
tips. Source/reference proportions differ slightly across the trident sizes.

Other accepted changes:

- Invalid curved rails can split into independently validated sections. Branch
  recovery assigns every source pixel to a section, merges disconnected
  ownership fragments, and traces diagonal contacts without figure-eight
  contours. Coverage below 90% triggers reconstruction rather than silently
  omitting substantial branches. Local ribbon recovery requires both coverage
  and successful quantised compilation; remaining pieces use reviewed fill.
- Source-fitted columns wider than the explicit 12 mm split-satin limit become
  directional fills with review warnings. Width limits are not relaxed.
- Perforated broad textures with at least six small counters use a transverse
  grain. Ordinary fills retain the configured angle; a general principal-axis
  override was rejected because it regressed Good Game.
- Continuous same-colour joins no longer receive redundant tie-offs. Actual
  cuts, colour changes and the final cut still use the existing lock operation.

A fresh run of the unchanged `physical-field-v1` evaluator, with current engine
fingerprints, generated all eight supported flat examples:

| Design | Previous minimum | Current minimum | All 90% gates pass |
|---|---:|---:|---|
| WORTHY | 59.990 | 70.564 | No |
| HUTTON | 63.253 | 76.578 | No |
| LIPS | 37.682 | 93.894 | Yes |
| LIONFACE | 77.192 | 77.170 | No |
| Trident 55 | 79.582 | 84.214 | No |
| Trident 80 | 84.591 | 90.918 | Yes |
| Trident 100 | Generation error | 90.444 | Yes |
| LEGION | 80.830 | 80.829 | No |

The target remains unmet: three of eight pass 90%, none pass 95%. WORTHY still
fails size; LIONFACE still fails the short-movement gate. HUTTON and LEGION have
source/reference layout differences; the user confirmed the digitiser may have
changed the artwork and editable PXF files are unavailable. These discrepancies
are retained in the score, not registered away or removed from the batch.

WORTHY and LIPS have now been used for development and are **no longer holdouts**.
The private `manifest-development.json` records previous splits; the original
manifest and earlier results remain unchanged. There is no independent unseen
validation in this pass. Unsupported puff/cap designs and missing/mismatched
originals remain accounted for, including the user-excluded TERMITE. Source-only
interpretations were reused from the approved cache; no weights were fine-tuned.

Private evidence: `output/digitising-studio/creator-batch/round2/checkpoint/`
contains the fresh batch, proposals, exported DSTs, warnings and scores;
`round2/index.html` compares all 17 inventory entries. Individual experiments,
including unsuccessful direction, support-spacing and geometry changes, remain
under `round2/`. Private artwork, references and generated files are not committed.

Validation: 84 digitising tests pass with localhost permission, plus two
independent evaluator negative-control tests. New regressions cover turning
forks at multiple physical sizes through proposal/compilation, pointed topology
rejection, source-pixel ownership, diagonal contours, width-limit preservation,
texture direction and locking at cuts. Good Game still passes at 90.395%, with
6,412 sewing movements; the reduction from the earlier current-baseline output
is due to removal of redundant locks. Its current-compiler output from the old
and new proposals is identical. The object rollout switch remains unchanged.


### Trident directional depth refinement (2026-10-14)

A further pass separates source-measured barbed blades from the turning side
columns. Blade direction follows each blade's own principal axis, avoiding
asymmetry caused by using a selected concave corner as the axis endpoint.
A bounded direction field biases monotonic boundary pairing while retaining
source containment, width limits and ordered rails. Larger stems remain
crosswise; compact stems are oblique and retain that angle until the shoulder
fans into its end cap. The compact turn concentration is calibrated on this
batch and requires unseen-design and sew-out validation. Detailed constructions
are compiled before acceptance; invalid detailed fits retain the validated
basic construction with a review flag. Additional source-tip runs preserve
blade extremities.

Rectangular finished panels may now propose bounded optical centring for an
already geometrically centred, single-colour satin wordmark. The foreground
must span at least 60% of panel width, its bounds centre must be within 0.5 mm
of the panel centre, and its source ink-centroid correction must be within both
1 mm and 1% of each panel dimension. Deliberate offsets, multiple foreground
colours, other garments and outlined configurations are excluded. The candidate
uses 0.24 mm spacing / 0.2 mm compensation, translates associated travel regions,
compiles before adoption and explicitly flags its millimetre layout adjustment
for review. This is an intentional layout proposal, not exact original placement.

Latest unchanged physical-field-v1 scores from the fresh `round2/depth-checkpoint`
run are WORTHY 70.564, HUTTON 76.578, LIPS 93.894, LIONFACE 77.170, trident 55
90.345, trident 80 92.235, trident 100 91.972 and LEGION 90.217. Five of eight
flat development examples pass all 90% gates; none reach 95%. The full batch
objective remains unmet. WORTHY retains its size failure and LIONFACE its
short-movement failure. No reference coordinates, evaluation registration
changes or threshold relaxations were introduced. Broader branch/junction
construction and lettering differences remain unresolved.

Validation: 86 digitising tests and two evaluator controls pass. The Good Game
regression remains 90.395 with 6,412 movements and identical current-compiler
DST output from its old and new proposals. The private `round2/index.html`
report includes all inventory entries and `round2/trident-direction-updated.png`
shows decoded reference/generated stitch angles. These are development metrics,
not a claim of unseen-design accuracy, trained model weights or physical sew-out
quality. Source-only cached interpretation and unchanged rollout gating remain.

### Complex raster artwork: Soul Disciples (2026-10-14)

The supplied 200 mm PNG failed before interpretation because quantisation made
1,293 connected regions, including hundreds of tiny islands between near-black
variants. Automatic palette selection now merges neutral near-black variants
(maximum channel 48, channel spread below 12) while retaining chromatic dark
colours and ordinary greys. Only when the raster exceeds 128 regions, a bounded
one-pixel majority pass consolidates colour-edge chatter; islands of at most
four pixels may merge into a dominant neighbouring colour. Remaining islands
of at most four pixels within a 3×3 raster box may be omitted. Alpha is never
filled, substantial disconnected artwork is retained, and the 128 source-region
limit remains enforced. Both generators report the changed-pixel count.

Fill contours distinguish diagonal outer islands from holes. Overlong contours
may simplify up to 0.2 mm with a review warning; invalid geometry still fails.
Tiny disconnected fill islands use the existing 0.05 mm² / 0.6 mm omission
policy. Additional islands below 0.2 mm² and 1 mm extent are omitted only if
isolated compilation confirms that no sewable fill rows exist, with a warning.

Complex designs can use up to 512 sewing objects and 48,000 validated control
points. Per-contour, satin-width, counter-containment and 150,000-command limits
remain intact. Boundary detours above 1,024 contour vertices fall back to cuts
and jumps when a direct contained connection is unavailable; the compiler flags
the trim count for review. Point-in-ring bounding checks and allocation-free
edge distances reduce geometry overhead without changing containment rules.

The private source-only local reproduction now exports 172 objects / 51,289
stitches, with 194 trims and 33 colour changes (four colours reused across 34
stages). Independent DST decoding reports 195.7 × 199.8 mm. The original artwork
is unchanged. This reproduction used deterministic local planning without new
OpenAI calls; the hosted interpretation path was not exercised. The shaded
record highlights, fine lettering and trim strategy still require review; export
success is not a known-good fidelity score or sew-out approval. Private evidence
is under `output/digitising-studio/soul-disciples/` (proposal, candidate DST,
compile stats and decoded preview). Good Game's current-compiler stitches remain
identical. Regression coverage includes raster noise, preservation of alpha and
substantial islands, dark-colour separation, diagonal fill islands, expanded
complexity bounds and safe fallback travel. Rollout activation is unchanged.

### API-enabled complex-artwork interpretation (2026-10-14)

The follow-up live failure occurred after preparation, in model interpretation.
Both interpretation and construction-tool selection now use batches of at most
24 regions with at most two concurrent requests. Each batch retains the full
source image for context; stroke batches add only their own labelled crops.
Token-budget truncation splits the affected batch recursively; incomplete JSON
is never consumed, single-region failures remain explicit, and content-filter
or other errors are not bypassed. Stroke output budget is now 8,000 tokens per
batch. Validated batches are combined and checked again for complete identity.
Completed batches can be reused from the existing optional local cache.

A real source-artwork API reproduction also exposed invalid nonwhite exclusions,
a white arch mistaken for background, excessive optional section guides, and a
model-selected satin column that failed physical width validation. The response
schema now binds ids to source colours and requires inclusion of nonwhite regions.
When the original prepared upload already has transparency, alpha defines
negative space and **all white artwork must also be included**. This policy is
in cache context and validation; older cache entries are reusable only if they
satisfy the current policy. Opaque paper-background handling remains available.

Optional interpretation guides that would exceed the 128-section budget are
not applied; their complete source geometry continues through automatic
construction with a review warning. Semantic satin proposals are validated and
locally compiled before acceptance. Failed model constructions receive a flagged
source-geometry fallback instead of aborting the whole generation. These changes
do not relax width, containment, object or command limits and do not silently
remove source regions.

Validation: 100 digitising tests pass, including bounded batching, truncation,
source-bound schemas, preservation of transparent white artwork, section budgets
and invalid-satin recovery. Good Game's current-compiler DST remains identical.
Private real-API evidence is under `output/digitising-studio/soul-disciples/`,
including `interpreted-plan.json`, cached validated responses and diagnostic
JSON drafts. Only approved source artwork is sent with `store:false`; no DST or
reference proof is sent. Hosted deployment verification remains separate from
the local run through the real API.

The real API-enabled Soul Disciples reproduction completed after these fixes:
126 interpreted source regions, no excluded artwork, 157 sewing objects, 50,767
stitches, 161 trims, 33 colour changes, independently decoded 195.7 × 199.8 mm.
The decoded preview was inspected: the white arch and complete O silhouette are
retained. A model-selected closed-column proposal had compiled successfully but
covered only the O's centre; semantic acceptance now additionally requires at
least 97% sampled source-mask coverage before local compilation. Rejected
proposals retain explicit review warnings and use automatic source construction.
This is a local end-to-end run using real API responses and their validated
cache, not a hosted-deployment or physical sew-out confirmation. Its DST and
preview are `interpreted-candidate.dst` and `interpreted-preview.png` in the
private evidence directory.


## Soul Disciples live-output repair (2026-10-14)

The supplied downloaded DST exposed the legacy Create default: its 45,310 stitches
contained 6,810 sub-0.5 mm movements, 215 trims and 33 colour changes. Create now
uses the validated object pipeline unless the server explicitly requests legacy
rollback with `DIGITISING_OBJECT_PIPELINE=false`. This changes the test-version
engine; it is not physical production approval. Hosted deployment was not verified.

The repair handles transparent-source antialiasing as mixtures of existing thread
colours, preserves opaque highlights, and cleans newly split microscopic islands
after a single majority pass. It does not fill transparent pixels. Neutral shading
uses neutral palette entries; photographic gradients are discretised, not recreated
as continuous embroidery shading. Source preparation now identifies 79 regions.

Complex fills retain containment-checked routes around counters regardless of the
total vertex count. Nearest-boundary lower bounds prune the search without bypassing
geometry checks. Automatic sequences with eight or more colour changes may group
independent same-colour objects; overlapping bounds plus compensation retain their
original stacking order. Separate letters still receive cuts. Explicit edited
projects retain their prescribed object order. Tie-off diagnostics now identify the
object actually being locked, including at colour/object boundaries.

Development iterations reduced the generated output from 127 trims / 15 colour
changes / 4.02% short stitches to 104 trims / 16 colour changes / 3.66% short stitches
after colour-edge cleanup. The final real-interpretation output independently decodes
to 51,067 stitches, 195.6 × 199.8 mm and a maximum sewing movement of 8.08 mm.
Small text and counters were visually inspected in the decoded stitch rendering.
104 regression tests pass, including 6–8 mm satin lettering, contained joins, complex
counter travel, safe colour sequencing, transparent shading and default Create HTTP
integration. This is a development example, not held-out accuracy validation.

Private evidence: `output/digitising-studio/soul-disciples/live-review/` contains the
user-file metrics, intermediate rounds, final `repaired.dst`, `repaired.json`, decoded
metrics/preview and a lettering crop. Customer artwork and these artifacts are not
committed. Without a professional Soul Disciples reference or physical sew-out, no
90–95% accuracy or fabric-quality claim is made. Mixed broad fills/narrow columns,
small curved-letter inner turns and tonal simplification still require sew-out review.


### Rounded satin recovery: Smiley (2026-10-14)

This pass addresses narrow rounded shapes whose original skeleton failed and
therefore selected or fell back to broad diagonal fill. It does not replace
already successful satin tools. `digitisingRoundedColumns.js` measures nearly
convex islands with a stable principal axis, large circular counters with
attached branches, and open curved bands via `digitisingArcColumns.js`.
The open-arc circle is a direction guide only: both rails are measured against
the actual source pixels. Closed curves use source-contour radial samples and
a smoothed, bounded normal field; cap widths separate attached limbs from the
main curve. Branches/caps sew before the continuous ring/arc. Fine convex details
below an 8 mm advancing extent retain their existing construction.

Acceptance requires 99% sampled source-pixel coverage, sampled rail containment
within 0.2 mm of the source, unchanged project geometry/width validation and
successful quantised compilation. Ordinary satin remains limited to 9 mm;
explicit split satin retains the existing 12 mm control/9.6 mm movement limits.
Large/unstable/unsupported reconstructions retain the prior validated fallback
with review warnings. Sub-0.3 mm² residual fragments may be omitted within the
coverage guard; this remains a reviewed approximation, not exact source identity.
Travel contours exceeding 512 vertices can simplify within the existing 0.2 mm
bound before validation, keeping connected curves from requiring needless cuts.

Smiley was generated from the supplied flat PNG. The user explicitly authorised
OpenAI source-only calls with `store:false`; neither the designer DST nor its
geometry enters planning or compilation. The existing physical-field-v1
registration, metrics and thresholds are unchanged. For the controlled stitch
comparison, only transparent margins were cropped and a fixed 83.4 mm nominal
width was supplied before generation. Uploaded-artwork defaults remain unchanged.
The same prepared input/tool plan is also run through the pre-change planner.

| Matched-input result | Shape | Direction | Density | Minimum |
|---|---:|---:|---:|---:|
| Before recovery | 90.620 | 55.182 | 90.641 | 55.182 |
| Source-only AI / current engine | 90.950 | 92.350 | 90.849 | 90.849 |

**The requested 95% target remains unmet.** The new result passes the existing
90% engineering gate only. Boundary details, directions at joins and local
thread-length distribution still differ. Alternative source-normal fields,
column directions, support spacing and compensation were tested; unsuccessful
variants were retained privately and did not alter the evaluator. This design
is calibration data, not unseen validation. No percentage implies sew-out quality.

A separate real Create-engine run used the original untrimmed PNG with normal
upload defaults. It produces 4,265 sewing movements, six compiler trim requests,
zero colour changes and 42 short movements, with satin for the principal forms.
This is distinct from the controlled comparison output (3,606 movements, nine
trim requests). No production history row was written by these local tests.

Periodic regression checkpoints regenerated proposals from the saved source
rasters/configurations and source-only tool plans, then recompiled. All six
accepted benchmark files are byte-identical to the pre-change baseline:
Good Game 90.395, Lips 93.894, tridents 55/80/100 90.345/92.235/91.972, and
LEGION 90.217. Soul Disciples is independently regenerated from its source with
its saved interpretation/tool plan and also remains byte-identical (51,067
movements, 104 trims, 16 colour changes). This isolates geometry/compiler changes
from stochastic new model decisions; it is not a claim that every fresh model
response will be identical.

Private evidence lives in `output/digitising-studio/smiley-quality/`:
`matched-baseline/`, `ai-cropped-final/`, `guarded-final/`, `default-create/`,
`regression-baseline/`, `regression-round1/`, `regression-round9/`,
`regression-round12/`, `regression-final/`, `soul-regression/`, the private
`regress.cjs`, manifests, source interpretations and individual iterations.
To repeat the accepted-design checkpoint without new model calls:

```sh
node output/digitising-studio/smiley-quality/regress.cjs new-checkpoint-name
node output/digitising-studio/smiley-quality/soul-regress.cjs
```

Keep private artwork, reference DSTs, generated files and these private runners
out of Git. `npm run test:digitising-studio` passes 113 tests, including rotated
islands, rotated counters/branches, flared open arcs and width-limit rejection;
the two evaluator controls also pass. Hosted deployment and physical sew-out
verification are outstanding.

### Smiley density follow-up (2026-10-14)

Recovered rounded T-shirt satin now uses 0.31 mm spacing (previously 0.30), with explicit object settings taking precedence. Other garment profiles and ordinary successful column constructions are unchanged. The unchanged physical-field-v1 controlled Smiley comparison measures 90.922 silhouette, 92.369 direction and 91.520 density (minimum 90.922; **95% remains unmet**), with 3,510 sewing movements. Normal original-upload generation produces 4,139 stitches, 6 trims and 42 short stitches. Six accepted reference cases and Soul Disciples remain byte-identical to their baselines. Full 113-test suite plus four focused rounded tests pass (the focused run includes one new settings-precedence test). Private evidence: `output/digitising-studio/smiley-quality/density-final/`, `density-default-create/`, `regression-density-final/`, `soul-density-regression/`.

The saved live Smiley at 2026-10-14T14:03:33.398Z does not match the earlier refined file: 5,171 stitches/21 trims versus 4,265/6. Railway refinement deployment `e2708cdc-b82f-4f5e-9a57-acf5c574dc1a` for commit `4c76770` reports SUCCESS with updatedAt 14:03:44.615Z, after that job was saved. A fresh post-deployment job is required to verify live output equivalence.

The follow-up rejected local ring-width capping (89.294 minimum), earlier arc-cap transitions (90.284), extra edge runs (density 89.021 and excessive short stitches), stronger normal smoothing (90.774), and extra branch overlap (90.780). Calibration used only source-derived geometry; reference files remained evaluation inputs. Uniform density/compensation sweeps improved density but did not close the outline gap. A separate diagnostic comparing the uploaded source silhouette with the reference shows contour disagreement; it is not a proven upper bound on attainable fidelity. Do not describe this checkpoint as 95% or substitute a new metric.

### Accepted digitising regression set (2026-10-14)

The user accepted Smiley and set **90% as the minimum target going forward**, superseding the earlier 95% target. `docs/digitising-studio/accepted-designs.json` records Good Game, Lips, Trident 55/80/100, LEGION, Smiley (90.922 minimum), and Soul Disciples (byte-identical protection; no designer reference). Every engine refinement must run all eight cases; the new `npm run check:digitising-accepted -- <private-manifest> <fresh-output-dir> [python]` regenerates from frozen source-only inputs/plans, checks pinned reference/baseline hashes, evaluates scored designs with unchanged physical-field-v1 and requires both the 90% floor and their accepted minimum scores. Missing cases, generation failures, failed quality gates or changed Soul output fail the run. Private artwork, references, plans and generated DSTs remain outside Git.

Latest live Smiley job `ce6324a2-80da-4e24-91ab-7c1cc981dcb3` (2026-10-14T14:22:45.899Z) has 4,143 stitches and 6 trims. Against the deployed-refinement local original-upload file (4,139 stitches/6 trims), physical-field-v1 scores are 99.177 silhouette, 99.818 direction and 99.590 density. This verifies close live/local agreement, not byte identity or a new 99% score against the designer reference.

Run every accepted case after meaningful engine changes and before shipping:

```sh
npm run check:digitising-accepted -- \
  output/digitising-studio/accepted-fixtures/manifest.json \
  output/digitising-studio/accepted-check-NEW-RUN \
  /tmp/digitising-eval-venv/bin/python
```

Use an unused output directory. The Python environment needs pyembroidery, numpy, scipy and Pillow. The private manifest supplies `id`, `png` (prepared source raster), `config` and `strokePlan` (frozen source-only JSON), `baseline` and, for scored designs, `reference`; paths resolve relative to the manifest. This isolates construction/compiler changes from AI variability. Also run the normal Studio tests for preprocessing/API behavior; new AI interpretations need separate source-only validation. Smiley uses the existing transparent-margin-cropped controlled comparison, preserving its accepted 83.4 mm nominal input and evaluator; normal-upload live equivalence is checked separately. The runner emits a report and returns nonzero for any failed or omitted case. Do not reset accepted baselines automatically.

Current accepted minima: Good Game 90.395, Lips 93.894, Trident 55 90.345, Trident 80 92.235, Trident 100 91.972, LEGION 90.217, Smiley 90.922. Soul retains exact-byte protection. Earlier statements that 95% remains unmet are historical, not the current acceptance requirement.

Validation: `output/digitising-studio/accepted-check-20261014/report.json` passes all eight cases, each byte-identical to its accepted baseline. The two regression-runner tests cover missing/duplicate cases, missing references, the 90% floor, degradation above 90%, failed gates, evaluator identity and exact-byte-only protection. Latest live/local evidence is saved privately under `output/digitising-studio/smiley-quality/live-20261014-142245/`.
