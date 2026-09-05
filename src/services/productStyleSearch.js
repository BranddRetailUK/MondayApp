function normalizeStyleCodeSearchKey(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/^([A-Z]+)0+([0-9])/, '$1$2');
}

function normalizedStyleCodeSql(expression) {
  return `REGEXP_REPLACE(
    UPPER(BTRIM(COALESCE(${expression}, ''))),
    '^([A-Z]+)0+([0-9])',
    '\\1\\2'
  )`;
}

module.exports = {
  normalizeStyleCodeSearchKey,
  normalizedStyleCodeSql,
};
