// Approximate visual anchors measured from the supplied placement references.
// Fractions refer to the visible garment, including its collar/hood. These are
// placement guides, not physical calibration or inferred production dimensions.
// AC Solutions: RX350, AFP2, LV290, LV370, SS8, 03824 (all six pages).
// Opal, Rons March and AT&T: small breast, full chest/back and side sleeves.
const PROFILES = {
  tee: { neckRight: 0.62, breastCentre: 0.26, sleeveCentre: 0.32, hoodClearance: 0 },
  polo: { neckRight: 0.62, breastCentre: 0.275, sleeveCentre: 0.35, hoodClearance: 0 },
  sweatshirt: { neckRight: 0.62, breastCentre: 0.275, sleeveCentre: 0.335, hoodClearance: 0 },
  fleece: { neckRight: 0.66, breastCentre: 0.295, sleeveCentre: 0.345, hoodClearance: 0 },
  hoodie: { neckRight: 0.60, breastCentre: 0.345, sleeveCentre: 0.37, hoodClearance: 0.13 },
  hoodedOuterwear: { neckRight: 0.62, breastCentre: 0.395, sleeveCentre: 0.415, hoodClearance: 0.18 },
  outerwear: { neckRight: 0.66, breastCentre: 0.295, sleeveCentre: 0.345, hoodClearance: 0 },
};
const STYLE_PROFILES = {
  GD57: 'hoodie', GD57B: 'hoodie', GD057: 'hoodie', GD057B: 'hoodie',
  RX350: 'hoodie', AFP2: 'hoodedOuterwear', LV290: 'tee',
  LV370: 'polo', SS8: 'sweatshirt', '03824': 'fleece',
};

function garmentSizeProfile(product = {}) {
  const code = String(product.code || '').toUpperCase().replace(/^([A-Z]+)0+(?=\d)/,'$1');
  const names = `${product.name || ''} ${product.requestedName || ''} ${product.visual?.name || ''} ${product.visual?.gender || ''}`;
  const child = code === 'GD57B' || /\b(?:kids?|children|child(?:ren)?['’]?s?|juniors?|youth|boys?|girls?|toddlers?|infants?|bab(?:y|ies))\b/i.test(names);
  // Representative child garment dimensions are 20% smaller, not print dimensions.
  return {sizeCategory:child ? 'child' : 'adult', garmentScale:child ? 0.8 : 1};
}

function placementProfile(product = {}) {
  const code = String(product.code || '').trim().toUpperCase();
  const name = `${product.name || ''} ${product.requestedName || ''} ${product.visual?.name || ''}`.toLowerCase();
  const outer = /jacket|coat|padded|softshell|parka|bodywarmer|gilet/.test(name);
  const hood = /hood/.test(name);
  const family = STYLE_PROFILES[code] || (hood && outer ? 'hoodedOuterwear'
    : hood ? 'hoodie' : /fleece/.test(name) ? 'fleece'
    : /polo/.test(name) ? 'polo' : /sweatshirt|sweat shirt|sweat|crewneck/.test(name) ? 'sweatshirt'
    : outer ? 'outerwear' : 'tee');
  // Gildan's supplied hoodie images have a deeper hood/neck opening.
  const breast = /^GD0?57B?$/.test(code) ? {breastCentre:0.40} : {};
  return { family, ...PROFILES[family], ...breast };
}

function automaticPrintScale(position, garment) {
  if (/breast/.test(position)) return 1.2;
  if (/sleeve/.test(position)) return 1.15;
  if (garment.sizeCategory === 'child' && /^(back|upper back)$/.test(position)) return 0.85;
  return 1;
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

module.exports = { placementProfile, automaticTop, garmentSizeProfile, automaticPrintScale };
