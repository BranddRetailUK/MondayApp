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
counters. These rungs explicitly control cross-stroke sewing. Automatic proposals
come from local skeleton normals; manually authored geometry controls the final
direction. An L needs separate stem/foot columns; complex junctions need section
planning rather than one global angle. Widths outside 0.3–9 mm fail validation.
Centre and inset zigzag satin support are available. Broad fills use a specified
angle and optional perpendicular sparse support. Runs follow explicit paths.

Fill scanlines split into continuous strips at forks/counters. Connectors are
checked against contours and holes; a verified contour detour is used where
possible, otherwise a trim/jump. Three-jump trim requests remain controller
dependent. Boundary checks allow DST rounding and bounded satin compensation.
These are digital checks, not a physical thread coverage model.

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

## What the Good Game test showed

At a 100 mm requested width, the first object candidate had 5,335 sewing
movements, 23 jump sequences and 271 movements below 0.5 mm. The preceding
generator had 6,346 / 32 / 458 respectively. The held-out GAME.DST had
7,450 / 4 / 74 and sewn bounds of 99 × 64 mm; both candidates were 100 × 64.5 mm.
Jump sequences are decoded movement groups, not verified machine trim counts.
Fewer stitches or movements are not in themselves better digitising.

This candidate **fails visual acceptance**. The automatic proposal still produces
folded/overlapping rails on ten lettering regions. Strict validation rejects
those satin objects and the proposal labels their fill replacements as provisional
with `reviewRequired:true`. Two isolated details under 0.05 mm² and 0.6 mm extent
are omitted with explicit review warnings. The lettering therefore loses the
reference's correct satin construction. GAME fill construction/density also
remains different. Private source, reference and generated files are not committed.

The next gate is clean automatic stroke decomposition: separate stems, arms,
curves and junctions into valid paired rails with coverage checks against the
source mask. A reviewed object plan should prove compiler quality independently
of recognition. Promote the new path only after multiple unrelated designs pass
digital inspection, routing/coverage checks and physical sew-outs. Do not hide
invalid satin geometry by treating a provisional fill as a finished result.
