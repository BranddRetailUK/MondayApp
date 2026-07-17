const assert = require('node:assert/strict');
const test = require('node:test');

const {
  AUDITED_FRUIT_OF_THE_LOOM_SEARCH_ALIASES,
  normalizeProductStyleAlias,
  resolveAuditedProductStyleAlias,
} = require('../src/services/productStyleAliases');

test('audited Fruit of the Loom aliases resolve legacy style and manufacturer codes', () => {
  assert.equal(AUDITED_FRUIT_OF_THE_LOOM_SEARCH_ALIASES.length, 24);
  assert.equal(resolveAuditedProductStyleAlias('SS6B'), 'SS031');
  assert.equal(resolveAuditedProductStyleAlias('ss6b'), 'SS031');
  assert.equal(resolveAuditedProductStyleAlias('61033'), 'SS031');
  assert.equal(resolveAuditedProductStyleAlias('61-033'), 'SS031');
  assert.equal(resolveAuditedProductStyleAlias('SS31'), 'SS026');
  assert.equal(resolveAuditedProductStyleAlias('61026'), 'SS026');
});

test('audited aliases do not fuzzy-match unreviewed or current catalogue codes', () => {
  assert.equal(resolveAuditedProductStyleAlias('SS031'), null);
  assert.equal(resolveAuditedProductStyleAlias('180m'), null);
  assert.equal(resolveAuditedProductStyleAlias('SS6B extra'), null);
  assert.equal(resolveAuditedProductStyleAlias(''), null);
  assert.equal(normalizeProductStyleAlias(' 61-033 '), '61033');
});

test('both product search endpoints add the audited alias target without replacing base matching', async () => {
  const result = await exerciseProductSearchRoutes('SS6B');

  assert.equal(result.searchResponse.statusCode, 200);
  assert.deepEqual(result.searchResponse.body, { products: [] });
  assert.equal(result.searchQuery.values[4], 'SS031');
  assert.match(result.searchQuery.text, /UPPER\(BTRIM\(s\.style_code\)\) = \$5/);
  assert.match(result.searchQuery.text, /THEN -1/);

  assert.equal(result.stylesResponse.statusCode, 200);
  assert.equal(result.stylesQuery.values[6], 'SS031');
  assert.match(result.stylesQuery.text, /UPPER\(BTRIM\(s\.style_code\)\) = \$7/);
  assert.match(result.stylesQuery.text, /s\.style_code ILIKE \$1/);
});

test('unreviewed searches keep existing query behavior with a null alias target', async () => {
  const result = await exerciseProductSearchRoutes('180m');
  assert.equal(result.searchQuery.values[4], null);
  assert.equal(result.stylesQuery.values[6], null);
});

async function exerciseProductSearchRoutes(query) {
  const poolPath = require.resolve('../src/db/pool');
  const routePath = require.resolve('../src/routes/database');
  const originalPoolModule = require.cache[poolPath];
  const queries = [];
  const fakePool = {
    async query(text, values = []) {
      queries.push({ text, values });
      return { rowCount: 0, rows: [] };
    },
  };

  require.cache[poolPath] = {
    id: poolPath,
    filename: poolPath,
    loaded: true,
    exports: fakePool,
  };
  delete require.cache[routePath];

  try {
    const router = require('../src/routes/database');
    const searchRoute = router.stack.find((layer) => (
      layer.route?.path === '/api/database/products/search'
      && layer.route?.methods?.get
    ));
    const stylesRoute = router.stack.find((layer) => (
      layer.route?.path === '/api/database/products/styles'
      && layer.route?.methods?.get
    ));
    assert.ok(searchRoute, 'product search route is registered');
    assert.ok(stylesRoute, 'styles search route is registered');

    const searchResponse = createResponse();
    await searchRoute.route.stack[0].handle({
      query: { q: query, field: 'code' },
    }, searchResponse);
    const searchQuery = queries.at(-1);

    const stylesResponse = createResponse();
    await stylesRoute.route.stack[0].handle({
      query: { q: query, sort: 'most-used' },
    }, stylesResponse);
    const stylesQuery = queries.at(-1);

    return {
      searchQuery,
      searchResponse,
      stylesQuery,
      stylesResponse,
    };
  } finally {
    delete require.cache[routePath];
    if (originalPoolModule) require.cache[poolPath] = originalPoolModule;
    else delete require.cache[poolPath];
  }
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}
