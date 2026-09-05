const AUDITED_FRUIT_OF_THE_LOOM_SEARCH_ALIASES = Object.freeze([
  Object.freeze({ legacyStyleId: 1, legacyStyleCode: 'SS6', legacyManufacturerCode: '61036', catalogueStyleCode: 'SS030' }),
  Object.freeze({ legacyStyleId: 115, legacyStyleCode: 'SS11', legacyManufacturerCode: '63402', catalogueStyleCode: 'SS402' }),
  Object.freeze({ legacyStyleId: 128, legacyStyleCode: 'SS6B', legacyManufacturerCode: '61033', catalogueStyleCode: 'SS031' }),
  Object.freeze({ legacyStyleId: 6, legacyStyleCode: 'SS8', legacyManufacturerCode: '62216', catalogueStyleCode: 'SS270' }),
  Object.freeze({ legacyStyleId: 144, legacyStyleCode: 'SS10', legacyManufacturerCode: '61044', catalogueStyleCode: 'SS044' }),
  Object.freeze({ legacyStyleId: 52, legacyStyleCode: 'SS14', legacyManufacturerCode: '62208', catalogueStyleCode: 'SS224' }),
  Object.freeze({ legacyStyleId: 977, legacyStyleCode: 'SS27', legacyManufacturerCode: '63204', catalogueStyleCode: 'SS204' }),
  Object.freeze({ legacyStyleId: 149, legacyStyleCode: 'SS12', legacyManufacturerCode: '61082', catalogueStyleCode: 'SS048' }),
  Object.freeze({ legacyStyleId: 211, legacyStyleCode: 'SS11B', legacyManufacturerCode: '63417', catalogueStyleCode: 'SS417' }),
  Object.freeze({ legacyStyleId: 20, legacyStyleCode: 'SS9', legacyManufacturerCode: '62202', catalogueStyleCode: 'SS200' }),
  Object.freeze({ legacyStyleId: 64, legacyStyleCode: 'SS16', legacyManufacturerCode: '62034', catalogueStyleCode: 'SS822' }),
  Object.freeze({ legacyStyleId: 150, legacyStyleCode: 'SS18', legacyManufacturerCode: '61098', catalogueStyleCode: 'SS100' }),
  Object.freeze({ legacyStyleId: 203, legacyStyleCode: 'SS14B', legacyManufacturerCode: '62037', catalogueStyleCode: 'SS873' }),
  Object.freeze({ legacyStyleId: 209, legacyStyleCode: 'SS15B', legacyManufacturerCode: '64025', catalogueStyleCode: 'SS823' }),
  Object.freeze({ legacyStyleId: 1333, legacyStyleCode: 'SS92', legacyManufacturerCode: '62228', catalogueStyleCode: 'SS826' }),
  Object.freeze({ legacyStyleId: 156, legacyStyleCode: 'SS7', legacyManufacturerCode: '61066', catalogueStyleCode: 'SS034' }),
  Object.freeze({ legacyStyleId: 79, legacyStyleCode: 'SS15', legacyManufacturerCode: '64026', catalogueStyleCode: 'SS405' }),
  Object.freeze({ legacyStyleId: 159, legacyStyleCode: 'SS21', legacyManufacturerCode: '61038', catalogueStyleCode: 'SS032' }),
  Object.freeze({ legacyStyleId: 201, legacyStyleCode: 'SS9B', legacyManufacturerCode: '62031', catalogueStyleCode: 'SS801' }),
  Object.freeze({ legacyStyleId: 116, legacyStyleCode: 'SS17', legacyManufacturerCode: '62032', catalogueStyleCode: 'SS830' }),
  Object.freeze({ legacyStyleId: 2577, legacyStyleCode: 'SS702', legacyManufacturerCode: '61398', catalogueStyleCode: 'SS047' }),
  Object.freeze({ legacyStyleId: 1161, legacyStyleCode: 'SS31', legacyManufacturerCode: '61026', catalogueStyleCode: 'SS026' }),
  Object.freeze({ legacyStyleId: 1397, legacyStyleCode: 'SS34', legacyManufacturerCode: '61168', catalogueStyleCode: 'SS168' }),
  Object.freeze({ legacyStyleId: 1162, legacyStyleCode: 'SS32', legacyManufacturerCode: '61028', catalogueStyleCode: 'SS028' }),
]);

function normalizeProductStyleAlias(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}

function buildAliasTargets(definitions) {
  const targets = new Map();
  for (const definition of definitions) {
    const target = String(definition.catalogueStyleCode || '').trim().toUpperCase();
    if (!target) throw new Error('Audited product style alias is missing a catalogue style code');
    for (const alias of [definition.legacyStyleCode, definition.legacyManufacturerCode]) {
      const normalizedAlias = normalizeProductStyleAlias(alias);
      if (!normalizedAlias) continue;
      const existingTarget = targets.get(normalizedAlias);
      if (existingTarget && existingTarget !== target) {
        throw new Error(`Conflicting audited product style alias ${normalizedAlias}`);
      }
      targets.set(normalizedAlias, target);
    }
  }
  return targets;
}

const AUDITED_PRODUCT_STYLE_ALIAS_TARGETS = buildAliasTargets(
  AUDITED_FRUIT_OF_THE_LOOM_SEARCH_ALIASES
);

function resolveAuditedProductStyleAlias(value) {
  return AUDITED_PRODUCT_STYLE_ALIAS_TARGETS.get(normalizeProductStyleAlias(value)) || null;
}

module.exports = {
  AUDITED_FRUIT_OF_THE_LOOM_SEARCH_ALIASES,
  normalizeProductStyleAlias,
  resolveAuditedProductStyleAlias,
};
