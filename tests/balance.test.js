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
