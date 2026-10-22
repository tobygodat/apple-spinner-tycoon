'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { pickVisibleApples } = require('../js/render.js');

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

test('every owned apple is pictured while under the cap', () => {
  assert.deepEqual(pickVisibleApples([3, 2, 0, 1], 64), [3, 2, 0, 1]);
});

test('the cap holds no matter how many apples are owned', () => {
  const picked = pickVisibleApples([5000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], 64);
  assert.equal(sum(picked), 64);
  assert.equal(picked[12], 1, 'a single Platonic Apple is still pictured beside 5,000 Red Delicious');
  assert.equal(picked[0], 63);
});

test('with equal counts, higher tiers get more of the picture', () => {
  const picked = pickVisibleApples(new Array(13).fill(100), 64);
  assert.equal(sum(picked), 64);
  assert.ok(picked.every((n) => n >= 1), 'every owned tier keeps a sprite');
  assert.ok(picked[12] > picked[0]);
});
