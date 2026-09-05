const test = require('node:test');
const assert = require('node:assert/strict');

const { buildLabelDocument, normalizeLabelQuantity } = require('../public/label-layout');

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
  assert.match(html, /class="label-count">1 of 1<\/div>/);
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

test('label layout creates one numbered 4 by 6 page for every requested label', () => {
  const html = buildLabelDocument({
    orderNumber: '51236',
    customerName: 'Acme',
    jobTitle: 'Staff Hoodies',
  }, { autoPrint: false, quantity: 3 });

  assert.equal((html.match(/data-label-page="\d+"/g) || []).length, 3);
  assert.match(html, /data-label-page="1"/);
  assert.match(html, /data-label-page="2"/);
  assert.match(html, /data-label-page="3"/);
  assert.match(html, /class="label-count">1 of 3<\/div>/);
  assert.match(html, /class="label-count">2 of 3<\/div>/);
  assert.match(html, /class="label-count">3 of 3<\/div>/);
  assert.equal((html.match(/>JOB TITLE<\/div>/g) || []).length, 3);
  assert.match(html, /\.label-page \{ break-after: page; page-break-after: always; \}/);
  assert.match(html, /\.label-page-last \{ break-after: auto; page-break-after: auto; \}/);
  assert.doesNotMatch(html, /setTimeout\(startPrint,\s*150\)/);
});

test('label quantities are whole numbers limited to 1 through 99', () => {
  assert.equal(normalizeLabelQuantity(undefined), 1);
  assert.equal(normalizeLabelQuantity(0), 1);
  assert.equal(normalizeLabelQuantity(3.8), 3);
  assert.equal(normalizeLabelQuantity(100), 99);
});

test('production label document starts printing after text fitting', () => {
  const html = buildLabelDocument({
    orderNumber: '51237',
    customerName: 'Acme',
    jobTitle: 'Staff Hoodies',
  });

  assert.match(html, /fitValues\(\);\s+setTimeout\(startPrint,\s*150\);/);
});
