const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { protectedRouter, shouldPreserveStatusAfterLabelPrint } = require('../src/routes/test-dashboard');
const { TEST_DASHBOARD_GROUP_IDS: groups } = require('../src/services/testDashboardDefaults');

test('retired scanner routes cannot advance status or generate scan URLs', async () => {
  const app = express();
  app.use(express.json(), protectedRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    for (const [url, method] of [['/test-scan?j=50593&ts=1&sig=invalid', 'GET'],
      ['/api/test-dashboard/scan-url?jobId=50593', 'GET'], ['/api/test-dashboard/scanner', 'POST']]) {
      const result = await fetch(`http://127.0.0.1:${server.address().port}${url}`, {
        method, ...(method === 'POST' ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scan: '50593' }) } : {})
      });
      assert.equal(result.status, 404, url);
    }
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test('browser assets have no serial connection, scanner UI or scan submission code', () => {
  for (const file of ['script.js', 'styles.css', 'index.html']) {
    const source = fs.readFileSync(path.join(__dirname, '..', 'public', file), 'utf8');
    assert.doesNotMatch(source, /navigator\.serial|connectScannerBtn|scan-pill|scanPill|connectSerialScanner|\/test-scan|\/api\/test-dashboard\/scanner/);
  }
});

test('label reprint guards preserve completed and ready production statuses', () => {
  for (const group of Object.values(groups)) assert.equal(shouldPreserveStatusAfterLabelPrint('COMPLETED', group), true);
  assert.equal(shouldPreserveStatusAfterLabelPrint('READY TO PRINT', groups.PRINT), true);
  assert.equal(shouldPreserveStatusAfterLabelPrint('READY TO PRINT', groups.EMBROIDERY), true);
  assert.equal(shouldPreserveStatusAfterLabelPrint('READY TO PRINT', groups.PRE_PRODUCTION), false);
  assert.equal(shouldPreserveStatusAfterLabelPrint('NO STOCK', groups.PRE_PRODUCTION), false);
});
