# Automatic digitising production guidelines

These describe the required finish, not a claim that the prototype is production approved.

## Stroke direction

- Top stitching must cross the local stroke path, perpendicular to its tangent.
- An L's vertical stem has horizontal top stitches; its horizontal arm has vertical top stitches.
- Script, curves and closed loops turn their paired stitch rails continuously with the path.
- Longitudinal runs are permitted for underlay and hidden connecting travel only.
- Split branches into local columns at junctions; a whole object's bounding box or a fixed global fill angle must not dictate the finish of its narrow strokes.

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

## Geometry and routing implementation

- Automatic preparation uses a bounded 2000px raster (EPS is rasterised at that bound before normalisation), preserving more source geometry than the former 800px pass. This remains raster-derived geometry, not exact recovery of a source vector.
- Skeleton edges become arc-length sampled paired rails, with closed-loop tangents and distance-to-boundary bounds at forks. Thin satin tapers retain at least the provisional 0.30mm thread width.
- Underlay, rail transitions and same-region travel are mask-checked to preserve holes. Separate regions jump; adjacent branches choose nearby endpoints. Satin columns do not receive the separate thin-feature overlay again.
- Narrow columns use centre-run underlay; wider columns add an inset zigzag. Automatic per-edge satin pull compensation is bounded by 15% of local width and garment maxima of 0.10/0.15/0.08mm (T-shirt/hoodie/woven). These are provisional starting values, requiring fabric-specific sew-out calibration.

### Geometry and sequencing (2026-10-13)

Automatic planning separates substantial regions connected by a neck narrower than
0.5 mm, then grows their ownership back across the unchanged source pixels. Broad
and narrow regions can therefore choose different stitch types. Original source
masks remain the authority for holes and hidden connecting travel. Explicitly
excluded regions and supplied directional guides are not repartitioned.

Satin columns support measured cross-stroke widths up to 9 mm; larger regions
remain fill. Short terminal medial-axis twigs are pruned and the main column
extended to flat caps, rather than treating each cap corner as a separate stroke.
This remains a geometric approximation, particularly at complex touching loops
and sharp joins. The satin limit is provisional, not a fabric calibration.

Automatic broad fill uses a 35-degree default top direction, perpendicular sparse
underlay and a 3.8 mm maximum fill stitch. Density remains garment-derived in
physical units. Mask-routed nearby rows do not each receive an extra tie-off. Fill locks remain
at actual breaks and object ends. A 0.1 mm edge margin accounts for DST endpoint
rounding during connector checks.
Spatial bands may return to a thread colour instead of combining distant objects
only to avoid a colour change. Isolated specks smaller than 0.025 square mm and
0.4 mm in both dimensions are omitted; longer fine strokes are retained.

Regression fixtures cover rotated joined shapes, broad and narrow regions in one
source component, loop counters, medium-width satin versus enlarged fill, and
returning to a thread colour. Reference DSTs are comparison inputs only; no logo
names, coordinates, target commands or private artwork are embedded in the engine.
