(function productSizeOrderModule(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.DatabaseProductSizeOrder = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function createProductSizeOrder() {
  'use strict';

  const naturalCollator = new Intl.Collator('en', {
    numeric: true,
    sensitivity: 'base',
  });

  function cleanSizeLabel(value) {
    return String(value == null ? '' : value).trim();
  }

  function standardSizeRank(value) {
    let compact = cleanSizeLabel(value)
      .toUpperCase()
      .replace(/[.'’]/g, '')
      .replace(/\bSIZE\b/g, '')
      .replace(/[\s_-]+/g, '');
    if (!compact) return null;

    let youth = false;
    if (compact.startsWith('YOUTH')) {
      youth = true;
      compact = compact.slice(5);
    } else if (/^Y(?:X+S|S|M|L|X+L|\d+XL?)$/.test(compact)) {
      youth = true;
      compact = compact.slice(1);
    }

    const aliases = {
      EXTRASMALL: 'XS',
      XSMALL: 'XS',
      SMALL: 'S',
      MEDIUM: 'M',
      LARGE: 'L',
      EXTRALARGE: 'XL',
      XLARGE: 'XL',
    };
    compact = aliases[compact] || compact;

    let rank = null;
    const extraSmall = compact.match(/^(X+)S$/);
    const extraLarge = compact.match(/^(X+)L$/);
    const numberedLarge = compact.match(/^(\d+)X(?:L|LARGE)?$/);
    if (extraSmall) rank = -extraSmall[1].length;
    else if (compact === 'S') rank = 0;
    else if (compact === 'M') rank = 1;
    else if (compact === 'L') rank = 2;
    else if (extraLarge) rank = 2 + extraLarge[1].length;
    else if (numberedLarge) rank = 2 + Number(numberedLarge[1]);

    return rank == null ? null : { youth, rank };
  }

  function standardSizeKey(value) {
    const label = cleanSizeLabel(value);
    const direct = standardSizeRank(label);
    if (direct) return [direct.youth ? 1 : 0, direct.rank, direct.rank, 1];

    const parts = label
      .split(/\s*(?:\/|&|\+|\bTO\b|[-\u2010-\u2015])\s*/i)
      .filter(Boolean);
    if (parts.length < 2) return null;
    const ranks = parts.map(standardSizeRank);
    if (ranks.some((rank) => !rank) || ranks.some((rank) => rank.youth !== ranks[0].youth)) {
      return null;
    }
    return [
      ranks[0].youth ? 1 : 0,
      ranks[0].rank,
      ranks[ranks.length - 1].rank,
      ranks.length,
    ];
  }

  function numericSizeKey(value) {
    const label = cleanSizeLabel(value).toUpperCase();
    const match = label.match(
      /^(\d+(?:\.\d+)?)\s*(?:[-\u2010-\u2015/]\s*(\d+(?:\.\d+)?))?\s*(?:YEARS?|YRS?|MONTHS?|MOS?|T)?$/
    );
    if (!match) return null;
    const start = Number(match[1]);
    const end = match[2] == null ? start : Number(match[2]);
    return [2, start, end, match[2] == null ? 1 : 2];
  }

  function sizeSortKey(value) {
    const label = cleanSizeLabel(value);
    const standard = standardSizeKey(label);
    if (standard) return standard;
    const numeric = numericSizeKey(label);
    if (numeric) return numeric;
    if (/^(?:ONE\s*SIZE(?:\s*FITS\s*ALL)?|ONESIZE|OSFA|OS)$/i.test(label)) {
      return [4, 0, 0, 0];
    }
    return [3, 0, 0, 0];
  }

  function compareSizeKeys(left, right) {
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
      const difference = Number(left[index] || 0) - Number(right[index] || 0);
      if (difference) return difference;
    }
    return 0;
  }

  function compareSizes(left, right) {
    const leftLabel = cleanSizeLabel(left);
    const rightLabel = cleanSizeLabel(right);
    const ranked = compareSizeKeys(sizeSortKey(leftLabel), sizeSortKey(rightLabel));
    return ranked || naturalCollator.compare(leftLabel, rightLabel);
  }

  function sortSizes(values, labelForValue = (value) => value) {
    return Array.from(values || []).sort((left, right) => (
      compareSizes(labelForValue(left), labelForValue(right))
    ));
  }

  return Object.freeze({ compareSizes, sortSizes });
}));
