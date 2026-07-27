const test = require('node:test');
const assert = require('node:assert/strict');

const { buildLabelDocument } = require('../public/label-layout');

test('label layout renders no QR and gives customer and job title two whole-word lines', () => {
  const html = buildLabelDocument({
    orderNumber: '51234',
    customerName: 'Hertfordshire Community Sports Partnership',
    jobTitle: 'Embroidered Volunteer Jackets for the Summer Community Festival',
  }, { autoPrint: false });

  assert.doesNotMatch(html, /\bqr\b/i);
  assert.doesNotMatch(html, /scanUrl|test-scan/i);
  assert.equal((html.match(/class="value"[\s\S]{0,200}?data-max-lines="2"/g) || []).length, 2);
  assert.equal((html.match(/data-single-line-floor="34"/g) || []).length, 2);
  assert.match(html, /overflow-wrap:\s*normal/);
  assert.match(html, /word-break:\s*normal/);
  assert.match(html, /hyphens:\s*none/);
  assert.match(html, /justify-content:\s*flex-start/);
  assert.match(html, /gap:\s*0\.32in/);
  assert.match(html, /text-align:\s*center/);
  assert.match(html, /\.block-job-title\s*\{\s*margin-top:\s*0\.08in/);
  assert.match(html, /heightFits = maxLines === 1 \|\| el\.scrollHeight/);
  assert.doesNotMatch(html, /setTimeout\(startPrint,\s*150\)/);
});

test('label layout keeps the job number on one line and escapes printed values', () => {
  const html = buildLabelDocument({
    orderNumber: '51235',
    customerName: 'A&B <Workwear>',
    jobTitle: '"Long-term" Staff Hoodies',
  }, { autoPrint: false });

  assert.equal((html.match(/class="value"[\s\S]{0,200}?data-max-lines="1"/g) || []).length, 1);
  assert.match(html, /<span class="word">A&amp;B<\/span> <span class="word">&lt;Workwear&gt;<\/span>/);
  assert.match(html, /<span class="word">&quot;Long-term&quot;<\/span>/);
  assert.match(html, /\.word\s*\{\s*white-space:\s*nowrap/);
});

test('production label document starts printing after text fitting', () => {
  const html = buildLabelDocument({
    orderNumber: '51236',
    customerName: 'Acme',
    jobTitle: 'Staff Hoodies',
  });

  assert.match(html, /fitValues\(\);\s+setTimeout\(startPrint,\s*150\);/);
});
