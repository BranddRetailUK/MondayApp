// Approximate visual anchors measured from the supplied placement references.
// Fractions refer to the visible garment, including its collar/hood. These are
// placement guides, not physical calibration or inferred production dimensions.
// AC Solutions: RX350, AFP2, LV290, LV370, SS8, 03824 (all six pages).
// Opal, Rons March and AT&T: small breast, full chest/back and side sleeves.
const PROFILES = {
  tee: { breastCentre: 0.26, sleeveCentre: 0.32, hoodClearance: 0 },
  polo: { breastCentre: 0.275, sleeveCentre: 0.35, hoodClearance: 0 },
  sweatshirt: { breastCentre: 0.275, sleeveCentre: 0.335, hoodClearance: 0 },
  fleece: { breastCentre: 0.295, sleeveCentre: 0.345, hoodClearance: 0 },
  hoodie: { breastCentre: 0.345, sleeveCentre: 0.37, hoodClearance: 0.13 },
  hoodedOuterwear: { breastCentre: 0.395, sleeveCentre: 0.415, hoodClearance: 0.18 },
  outerwear: { breastCentre: 0.295, sleeveCentre: 0.345, hoodClearance: 0 },
};
const STYLE_PROFILES = {
  RX350: 'hoodie', AFP2: 'hoodedOuterwear', LV290: 'tee',
  LV370: 'polo', SS8: 'sweatshirt', '03824': 'fleece',
};

function placementProfile(product = {}) {
  const code = String(product.code || '').trim().toUpperCase();
  const name = `${product.name || ''} ${product.requestedName || ''}`.toLowerCase();
  const outer = /jacket|coat|padded|softshell|parka/.test(name);
  const hood = /hood/.test(name);
  const family = STYLE_PROFILES[code] || (hood && outer ? 'hoodedOuterwear'
    : hood ? 'hoodie' : /fleece/.test(name) ? 'fleece'
    : /polo/.test(name) ? 'polo' : /sweatshirt|sweat shirt|sweat|crewneck/.test(name) ? 'sweatshirt'
    : outer ? 'outerwear' : 'tee');
  return { family, ...PROFILES[family] };
}

function automaticTop(position, view, height, profile = PROFILES.tee) {
  if (/breast/.test(position)) return profile.breastCentre - height / 2;
  if (/sleeve/.test(position)) {
    const centre = ['left', 'right'].includes(view) ? 0.335 : profile.sleeveCentre;
    return centre - height / 2;
  }
  if (position === 'front') return 0.20 + profile.hoodClearance;
  if (position === 'back') {
    // Large/tall back compositions start nearer the neckline; a small back
    // wordmark sits lower. Preserve artwork size and keep a usable hem margin.
    const top = Math.max(0.10, 0.20 - Math.max(0, height - 0.30) * 0.20);
    return top + profile.hoodClearance;
  }
  if (position === 'upper back') return 0.18 + profile.hoodClearance;
  return null; // Nape and hem retain their existing explicit region defaults.
}

module.exports = { placementProfile, automaticTop };
