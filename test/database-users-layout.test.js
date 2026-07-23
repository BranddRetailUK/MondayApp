const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('pending signup review buttons fit inside the requests table', () => {
  const styles = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');
  const emailWidth = cssWidth(
    styles,
    /#db-signup-requests-table th:nth-child\(2\)\{width:(\d+)px\}/
  );
  const reviewWidth = cssWidth(
    styles,
    /#db-signup-requests-table th:nth-child\(4\)\{width:(\d+)px;text-align:center\}/
  );
  const buttonWidth = cssWidth(
    styles,
    /\.db-signup-review-button\{[\s\S]*?min-width:(\d+)px;/
  );

  const threeButtonsWithMarginsAndCellPadding = (buttonWidth + 4) * 3 + 8;
  assert.equal(emailWidth, 420);
  assert.ok(reviewWidth >= threeButtonsWithMarginsAndCellPadding);
});

function cssWidth(styles, pattern) {
  const match = styles.match(pattern);
  assert.ok(match, `Expected CSS rule matching ${pattern}`);
  return Number(match[1]);
}
