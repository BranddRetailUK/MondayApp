const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');

test('Open Orders approval filters use dashboard approval and exclude completed work', () => {
  const database = fs.readFileSync(path.join(root, 'public', 'database.js'), 'utf8');
  const matcher = sourceFunction(
    database,
    'function matchesOutstandingApprovalFilter',
    'function compareJobs'
  );

  assert.match(matcher, /truthy\(job\?\.proof_approved\)/);
  assert.match(matcher, /status === 'COMPLETED' \|\| status === 'INVOICED'/);
  assert.match(matcher, /filter === 'ready' \? approved : !approved/);
  assert.doesNotMatch(
    matcher,
    /has_artwork|has_screens|screen_numbers|has_shirts|is_printed/
  );
});

test('Open Orders controls put approval first, color type filters, and separate button groups', () => {
  const index = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'public', 'styles.css'), 'utf8');
  const controls = index.slice(
    index.indexOf('<div class="db-filter-buttons"'),
    index.indexOf('</div>', index.indexOf('<div class="db-filter-buttons"'))
  );

  const approved = controls.indexOf('data-db-group="ready"');
  const notApproved = controls.indexOf('data-db-group="not-ready"');
  const print = controls.indexOf('data-db-group="print"');
  const gifts = controls.indexOf('data-db-group="gifts"');
  const all = controls.indexOf('data-db-group="all"');

  assert.ok(approved !== -1 && approved < notApproved);
  assert.ok(notApproved < print);
  assert.ok(gifts < all);
  assert.match(controls, /db-type-print[^\"]*"[^>]*data-db-group="print"/);
  assert.match(controls, /db-type-print_embroidery[^\"]*"[^>]*data-db-group="print_embroidery"/);
  assert.match(controls, /db-type-embroidery[^\"]*"[^>]*data-db-group="embroidery"/);
  assert.match(controls, /db-type-gifts[^\"]*db-filter-separator-after[^\"]*"[^>]*data-db-group="gifts"/);
  assert.match(
    controls,
    /db-filter-separator-after[^\"]*"[^>]*data-db-group="not-ready"/
  );
  assert.match(
    styles,
    /\.db-filter-buttons \.db-filter-separator-after\{\s*margin-right:8px;/
  );
  assert.match(styles, /\.db-type-print\{\s*background:#fff3a8!important;/);
  assert.match(styles, /\.db-type-print_embroidery\{\s*background:#f0c2ff!important;/);
  assert.match(styles, /\.db-type-embroidery\{\s*background:#ffc477!important;/);
  assert.match(styles, /\.db-type-gifts\{\s*background:#bff6bb!important;/);
});

function sourceFunction(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(start, -1, `${startMarker} should exist`);
  assert.notEqual(end, -1, `${endMarker} should exist`);
  return source.slice(start, end);
}
