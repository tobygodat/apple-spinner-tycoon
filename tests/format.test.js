'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { formatNumber } = require('../js/format.js');

test('numbers under a million use separators and never round up', () => {
  assert.equal(formatNumber(0), '0');
  assert.equal(formatNumber(999999), '999,999');
  assert.equal(formatNumber(14.99), '14');
  assert.equal(formatNumber(1234.56, 1), '1,234.5');
  assert.equal(formatNumber(90, 1), '90');
  assert.equal(formatNumber(0.1 * 7, 1), '0.7');
});

test('a million and up switch to short suffixes with two decimals', () => {
  assert.equal(formatNumber(1e6), '1.00 M');
  assert.equal(formatNumber(4.788e6), '4.78 M');
  assert.equal(formatNumber(20.28e9), '20.28 B');
  assert.equal(formatNumber(41.76e15), '41.76 Qa');
  assert.equal(formatNumber(8.5e18), '8.50 Qi');
  assert.equal(formatNumber(1e33), '1.00 Dc');
});

test('past decillions the number goes scientific', () => {
  assert.equal(formatNumber(1e36), '1.00e+36');
  assert.equal(formatNumber(Infinity), '∞');
});
