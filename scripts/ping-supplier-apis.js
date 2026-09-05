#!/usr/bin/env node

const env = require('../src/config/env');
const { createPenCarrieClient } = require('../src/integrations/pencarrie');
const { createRalawiseClient } = require('../src/integrations/ralawise');

function serializeError(error) {
  if (typeof error?.toJSON === 'function') return error.toJSON();
  return {
    name: error?.name || 'Error',
    message: error?.message || String(error),
    code: error?.code || null,
    status: error?.status || null,
  };
}

async function getEgressIp() {
  const response = await fetch('https://api.ipify.org?format=json', {
    headers: { Accept: 'application/json', 'User-Agent': 'UltimateHub/1.0' },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Egress-IP check returned HTTP ${response.status}.`);
  const data = await response.json();
  return String(data.ip || '').trim() || null;
}

function countRalawiseVariants(productGroup) {
  const products = Array.isArray(productGroup?.products) ? productGroup.products : [];
  return products.reduce(
    (total, product) => total + (Array.isArray(product?.variants) ? product.variants.length : 0),
    0
  );
}

async function probePenCarrie() {
  try {
    const response = await createPenCarrieClient().getStock('JH001');
    return {
      ok: true,
      operation: 'pcgetstock',
      identifier: 'JH001',
      status: response.status,
      rootElement: response.rootElement,
      responseBytes: Buffer.byteLength(response.body),
    };
  } catch (error) {
    return { ok: false, operation: 'pcgetstock', identifier: 'JH001', error: serializeError(error) };
  }
}

async function probeRalawise() {
  try {
    const client = createRalawiseClient();
    const authentication = await client.login();
    const response = await client.getInventory('GD001');
    const productGroup = response.data?.productGroup;
    return {
      ok: true,
      operation: 'login + inventory',
      identifier: 'GD001',
      authenticationStatus: authentication.status,
      tokenExpiresInSeconds: authentication.expiresIn,
      inventoryStatus: response.status,
      productGroupId: productGroup?.id || null,
      productCount: Array.isArray(productGroup?.products) ? productGroup.products.length : 0,
      variantCount: countRalawiseVariants(productGroup),
    };
  } catch (error) {
    return { ok: false, operation: 'login + inventory', identifier: 'GD001', error: serializeError(error) };
  }
}

async function main() {
  const [egressResult, penCarrie, ralawise] = await Promise.all([
    getEgressIp().then((ip) => ({ ok: true, ip })).catch((error) => ({ ok: false, error: error.message })),
    probePenCarrie(),
    probeRalawise(),
  ]);

  const expectedIp = String(env.PENCARRIE_STATIC_IP || '').trim() || null;
  const network = {
    egressCheckOk: egressResult.ok,
    egressIp: egressResult.ip || null,
    penCarrieExpectedIpConfigured: Boolean(expectedIp),
    penCarrieExpectedIpMatchesEgress: Boolean(expectedIp && egressResult.ip && expectedIp === egressResult.ip),
    ...(egressResult.ok ? {} : { error: egressResult.error }),
  };

  const report = {
    checkedAt: new Date().toISOString(),
    network,
    penCarrie,
    ralawise,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!penCarrie.ok || !ralawise.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: serializeError(error) }, null, 2));
  process.exitCode = 1;
});
