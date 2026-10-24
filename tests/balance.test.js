'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const sim = require('../tools/balance-sim.js');

const OPTIONS = { hours: 24 * 7, clicks: 2 };
const run = (model) => sim.average([1, 2, 3].map((seed) => sim.simulate(model(), { ...OPTIONS, seed })));

test('every tier after the first arrives within two thirds to one and a half times the Cookie Clicker time for the same tier', () => {
  const ours = run(sim.appleSpinner);
  const cookie = run(sim.cookieClicker);
  for (let i = 1; i < ours.tiers.length; i++) {
    const ratio = ours.tiers[i].ownedAt / cookie.tiers[i].ownedAt;
    assert.ok(ratio > 2 / 3 && ratio < 1.5, ours.tiers[i].name + ' arrives at ' + ratio.toFixed(2) + '× the Cookie Clicker time');
  }
});

test('the tier table is our own, not a copy or a constant scale of Cookie Clicker buildings', () => {
  const E = require('../js/economy.js');
  const cookie = sim.cookieClicker().tiers;
  assert.notEqual(E.COST_GROWTH, 1.15, 'price growth is not Cookie Clicker 1.15');
  for (const [key, theirs] of [['baseCost', 'baseCost'], ['baseSps', 'baseCps']]) {
    const ratios = E.TIERS.map((tier, i) => tier[key] / cookie[i][theirs]);
    ratios.forEach((ratio, i) => assert.ok(Math.abs(Math.log(ratio)) >= Math.log(1.15), E.TIERS[i].name + ' ' + key + ' is ' + ratio.toFixed(2) + '× Cookie Clicker'));
    for (let i = 0; i + 3 <= ratios.length; i++) {
      const window = ratios.slice(i, i + 3);
      assert.ok(Math.max(...window) / Math.min(...window) >= 1.2, key + ' of tiers ' + (i + 1) + '–' + (i + 3) + ' is a near-constant scale of Cookie Clicker');
    }
  }
});
