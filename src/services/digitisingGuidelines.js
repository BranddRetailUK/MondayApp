// Service-owned production intent. Physical defaults remain sew-out dependent.
const GUIDELINES={
  version:2,
  strokeDirectionRule:'Top stitches cross the local stroke path at a perpendicular angle. Vertical letter stems use horizontal top stitches; horizontal arms use vertical top stitches. Script columns turn continuously with their local tangent. Longitudinal runs are underlay or hidden travel, never the visible stroke finish.',
  assumedThreadWidthMm:.3,
  thinAreaThreadWidths:[1,3],
  thinAreaRule:'Thin areas approximately one to three thread widths wide must receive crosswise top stitches following the local shape, not a lengthwise running-stitch finish. Lengthwise stitches may be underlay only. Taper the crosswise column toward the tip; do not silently replace it with edge runs.',
};
module.exports=GUIDELINES;
