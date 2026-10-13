# Automatic digitising production guidelines

These describe the required finish, not a claim that the prototype is production approved.

## Thin features

- Areas approximately **one to three thread widths** wide must use top stitches
  **across their local width**, following the shape as it bends or tapers.
- Do not finish these areas with one or two lengthwise running stitches. A
  lengthwise centre run or edge run may provide support underneath crosswise top stitches.
- Continue the crosswise column toward a pointed tip. Do not discard its stitches
  using the broad-fill minimum-run threshold.
- Where a taper becomes narrower than one thread, the experimental engine retains
  a one-thread-wide crosswise finish, rather than substituting a longitudinal run.
- Determine the direction from local geometry, including thin branches attached to
  wider shapes; a parent section's fill direction must not override this rule.
- Recompute the paths and spacing at the requested physical size. The customer does
  not choose stitch angles, density or minimum stitch settings.

The current engine assumes an effective thread width of **0.30 mm**, so the normal
thin-feature band is approximately 0.30–0.90 mm. This is an internal provisional
assumption, not a measured property of every thread. It must be calibrated against
actual cones, fabric and sew-outs. Features below DST resolution cannot be recovered.

## Coverage and direction

Aim for dense, even coverage without gaps, using bounded garment-specific spacing.
Do not increase density without limit. Current experimental satin spacing is
0.34 mm for T-shirts, 0.32 mm for hoodies and 0.36 mm for woven shirts. Fill and
underlay retain separate physical spacing. These defaults require sew-out validation.

Use consistent directions for similar limbs and section-following underlay. Check
joins, travel, contour detail and needle penetration spacing on the decoded output.
A render or stitch-count match alone does not establish a professional sewn finish.

## Existing designs and validation

Use saved production files for known PSG jobs. New artwork can use learned general
principles, but comparison references must not be substituted for generated output.
Keep production references separate during generation and compare afterwards.

## Connected sections and fine branches

Route connecting support stitches inside the original same-thread source region. Preserve jumps where regions are disconnected; never shortcut across holes. Finish a narrow branch beside its adjoining broad section, retaining crosswise top stitches. Direction transitions between guided ribbon sections are eased by a bounded source-derived axial adjustment. These routing/style rules remain experimental pending sew-out verification.
