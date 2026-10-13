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
Automatic running outlines require an explicit run object in this pipeline.

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
