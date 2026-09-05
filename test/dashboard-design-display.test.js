const assert = require('node:assert/strict');
const test = require('node:test');

const {
  designDisplayTextFromRawValue,
  designTextFromPositions,
} = require('../src/routes/test-dashboard');

test('DES/PSG display keeps design and PSG references while excluding ST references', () => {
  const text = designTextFromPositions([
    {
      design_ref: '12345 / PSG6789 / ST1234',
      position_name: 'Front',
      colour_notes: 'STITCH COUNT 4500',
    },
  ], {
    screen_numbers: 'PSG9000 / ST9999',
  });

  assert.equal(text, '12345 / PSG9000, PSG6789');
  assert.doesNotMatch(text, /\bST(?:ITCH)?/i);
});

test('DES/PSG display returns blank for ST-only source references', () => {
  const text = designTextFromPositions([
    {
      design_ref: 'ST1234',
      position_name: 'Back',
      colour_notes: 'STITCH COUNT: 4500',
    },
  ], {
    screen_numbers: 'ST9999',
  });

  assert.equal(text, '');
});

test('DES/PSG stored-state fallback also filters ST references', () => {
  assert.equal(
    designDisplayTextFromRawValue('54321 / PSG2468 / ST1357'),
    '54321 / PSG2468'
  );
  assert.equal(designDisplayTextFromRawValue('ST1357'), '');
});
