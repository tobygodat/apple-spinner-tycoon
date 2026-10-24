'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/economy.js');

const NOW = 1_800_000_000_000;
const tierIndex = (id) => E.TIERS.findIndex((tier) => tier.id === id);
const RED = tierIndex('redDelicious');
const GRANNY = tierIndex('grannySmith');
const GALA = tierIndex('gala');

function withOwned(owned, extra) {
  const state = E.freshState(NOW);
  return { ...state, ...extra, owned: { ...state.owned, ...owned } };
}

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, actual + ' ≈ ' + expected);

test('the next apple of a tier costs ceil(baseCost * 1.15^owned)', () => {
  const red = E.TIERS[RED];
  assert.equal(E.costOf(red, 0, 1), 15);
  assert.equal(E.costOf(red, 1, 1), 18);
  assert.equal(E.costOf(red, 10, 1), 61);
  assert.equal(E.costOf(E.TIERS[GRANNY], 3, 1), 153);
});

test('buying several sums the individual rounded prices', () => {
  const red = E.TIERS[RED];
  assert.equal(E.costOf(red, 0, 2), 15 + 18);
  assert.equal(E.costOf(red, 0, 3), 15 + 18 + 20);
});

test('max affordable stops at the last apple the wallet covers', () => {
  const red = E.TIERS[RED];
  assert.equal(E.maxAffordable(red, 0, 14), 0);
  assert.equal(E.maxAffordable(red, 0, 32), 1);
  assert.equal(E.maxAffordable(red, 0, 33), 2);
  assert.equal(E.maxAffordable(red, 0, Infinity) > 0, true, 'an infinite wallet still terminates');
});

test('a buy spends exactly the quoted cost and adds the apples', () => {
  const state = withOwned({}, { spins: 100 });
  const next = E.buyTier(state, RED, 2);
  assert.equal(next.spins, 100 - 33);
  assert.equal(next.owned.redDelicious, 2);
});

test('an unaffordable buy leaves the state unchanged', () => {
  const state = withOwned({}, { spins: 10 });
  assert.equal(E.buyTier(state, RED, 1), state);
});

test('a store row quotes the apples and price a click buys at each buy amount', () => {
  const state = withOwned({ redDelicious: 1 }, { spins: 60 });
  assert.deepEqual(E.quoteTier(state, RED, 1), { qty: 1, cost: 18 });
  assert.deepEqual(E.quoteTier(state, RED, 10), { qty: 10, cost: E.costOf(E.TIERS[RED], 1, 10) });
  assert.deepEqual(E.quoteTier(state, RED, 'max'), { qty: 2, cost: 18 + 20 }, 'Max buys as many as the wallet covers');
  const quote = E.quoteTier(state, RED, 'max');
  const bought = E.buyTier(state, RED, quote.qty);
  assert.equal(bought.spins, state.spins - quote.cost, 'the click spends exactly the quoted price');
  assert.equal(bought.owned.redDelicious, 1 + quote.qty);
});

test('at Max with nothing affordable, a row quotes one apple and a click buys nothing', () => {
  const state = withOwned({}, { spins: 10 });
  const quote = E.quoteTier(state, RED, 'max');
  assert.deepEqual(quote, { qty: 1, cost: 15 });
  assert.equal(E.buyTier(state, RED, quote.qty), state);
});

test('production sums owned apples times their base rate', () => {
  near(E.spinsPerSecond(withOwned({ redDelicious: 10, grannySmith: 2 })), 3);
  near(E.spinsPerSecond(E.freshState(NOW)), 0);
});

test('a variety upgrade doubles only that variety', () => {
  const state = withOwned({ redDelicious: 10, grannySmith: 10 }, { upgrades: ['grannySmith.x1'] });
  near(E.spinsPerSecond(state), 1 + 20);
  near(E.spsEach(state, GRANNY), 2);
  near(E.spsEach(state, RED), 0.1);
});

test('global multipliers scale every variety', () => {
  near(E.spinsPerSecond(withOwned({ grannySmith: 4, redDelicious: 10 }, { upgrades: ['shapeRotator'] })), 5 * 1.1);
});

test('variety upgrades stay locked until enough of that variety is owned', () => {
  const stemAlignment = E.UPGRADES.find((upgrade) => upgrade.id === 'grannySmith.x5');
  assert.equal(E.upgradeAvailable(withOwned({ grannySmith: 4 }), stemAlignment), false);
  assert.equal(E.upgradeAvailable(withOwned({ grannySmith: 5 }), stemAlignment), true);
});

test('an upgrade can only be bought once', () => {
  const bought = E.buyUpgrade(withOwned({ grannySmith: 1 }, { spins: 2000 }), 'grannySmith.x1');
  assert.equal(bought.spins, 1000);
  assert.deepEqual(bought.upgrades, ['grannySmith.x1']);
  assert.equal(E.buyUpgrade(bought, 'grannySmith.x1'), bought);
});

test('a focus click earns 1 spin, then doubles with a click upgrade', () => {
  const first = E.focus(E.freshState(NOW));
  assert.equal(first.amount, 1);
  assert.equal(first.state.spins, 1);
  assert.equal(first.state.clicks, 1);
  assert.equal(E.focus(withOwned({}, { upgrades: ['closeYourEyes'] })).amount, 2);
  assert.equal(E.focus(withOwned({}, { upgrades: ['closeYourEyes', 'squintHarder'] })).amount, 4);
});

test('the percent-of-production click upgrade adds 1% of spins per second per click', () => {
  const state = withOwned({ grannySmith: 100 }, { upgrades: ['mindsEye'] });
  near(E.spinsPerClick(state), 1 + 1);
  near(E.spinsPerClick(state, 7), 1 + 7, 'a frenzy boosts the production share of a click');
  near(E.spinsPerClick(withOwned({ grannySmith: 100 }, { upgrades: ['mindsEye', 'thirdEye'] })), 1 + 2);
});

test('estimated IQ: no apples is 100, nine Red Delicious is 150', () => {
  assert.equal(E.iq(E.freshState(NOW)), 100);
  assert.equal(E.iq(withOwned({ redDelicious: 1 })), 115);
  assert.equal(E.iq(withOwned({ redDelicious: 9 })), 150);
  assert.equal(E.iq(withOwned({ grannySmith: 1 })), Math.round(100 + 15 * Math.log2(3)), 'higher tiers weigh more');
});

test('rank titles follow the IQ ladder', () => {
  assert.equal(E.rankFor(100).title, 'Aphantasic');
  assert.equal(E.rankFor(149).title, 'Shape Rotator');
  assert.equal(E.rankFor(150).title, 'Certified Genius');
  assert.equal(E.rankFor(400).title, 'Platonic Mind');
});

test('offline progress credits elapsed seconds times production', () => {
  const state = withOwned({ grannySmith: 1 }, { lastSavedAt: NOW - 2 * 3600 * 1000 });
  const result = E.applyOfflineProgress(state, NOW);
  assert.equal(result.earned, 7200);
  assert.equal(result.state.spins, 7200);
  assert.equal(result.state.lifetimeSpins, 7200);
  assert.equal(result.state.lastSavedAt, NOW);
});

test('offline progress is capped at 8 hours', () => {
  const state = withOwned({ grannySmith: 1 }, { lastSavedAt: NOW - 30 * 3600 * 1000 });
  const result = E.applyOfflineProgress(state, NOW);
  assert.equal(result.elapsedSeconds, 8 * 3600);
  assert.equal(result.earned, 8 * 3600);
});

test('a save from the future credits nothing', () => {
  const state = withOwned({ grannySmith: 1 }, { lastSavedAt: NOW + 60_000 });
  assert.equal(E.applyOfflineProgress(state, NOW).earned, 0);
});

test('a frenzy multiplies production by 7 until it ends', () => {
  const frenzy = { kind: 'frenzy', multiplier: 7, endsAt: NOW + 30_000 };
  assert.equal(E.productionMultiplier(frenzy, NOW), 7);
  assert.equal(E.productionMultiplier(frenzy, NOW + 30_000), 1);
  assert.equal(E.productionMultiplier({ kind: 'none' }, NOW), 1);
});

test('production accrues per second, and a frenzy boosts only the part of the window it covers', () => {
  const state = withOwned({ grannySmith: 1 });
  assert.equal(E.accrue(state, { kind: 'none' }, NOW, NOW + 2000).earned, 2);
  const frenzy = { kind: 'frenzy', multiplier: 7, endsAt: NOW + 30_000 };
  const result = E.accrue(state, frenzy, NOW, NOW + 60_000);
  assert.equal(result.earned, 30 * 7 + 30);
  assert.equal(result.state.spins, 240);
  assert.equal(result.state.lifetimeSpins, 240);
});

test('accrual after a long absence is capped at 8 hours', () => {
  const state = withOwned({ grannySmith: 1 });
  assert.equal(E.accrue(state, { kind: 'none' }, NOW - 30 * 3600 * 1000, NOW).earned, 8 * 3600);
});

test('a buff never reaches the save', () => {
  const frenzy = { kind: 'frenzy', multiplier: 7, endsAt: NOW + 30_000 };
  const saved = JSON.stringify({ ...withOwned({ grannySmith: 1 }), buff: frenzy });
  assert.equal('buff' in E.parseSave(saved, NOW), false);
});

test('lucky golden apples pay min(15% of bank, 900s of production) + 13', () => {
  assert.equal(E.luckyAmount(withOwned({ grannySmith: 1 }, { spins: 1000 })), 150 + 13);
  assert.equal(E.luckyAmount(withOwned({ grannySmith: 1 }, { spins: 1e9 })), 900 + 13);
  assert.equal(E.luckyAmount(withOwned({}, { spins: 1000 })), 13, 'no production means only the flat 13');
});

test('parseSave turns garbage into a fresh game', () => {
  for (const raw of ['not json{', 'null', '42', '[]', null, undefined, 7]) {
    assert.deepEqual(E.parseSave(raw, NOW), E.freshState(NOW), String(raw));
  }
});

test('parseSave fills defaults for a partial save', () => {
  const state = E.parseSave(JSON.stringify({ spins: 50, owned: { gala: 2 } }), NOW);
  assert.equal(state.spins, 50);
  assert.equal(state.lifetimeSpins, 50);
  assert.equal(state.owned.gala, 2);
  assert.equal(state.owned.redDelicious, 0);
  assert.deepEqual(state.upgrades, []);
  assert.equal(state.clicks, 0);
  assert.equal(state.lastSavedAt, NOW);
});

test('parseSave reads an older save that predates clicks, golden apples, and timestamps', () => {
  const old = { version: 0, spins: 10, lifetimeSpins: 500, owned: { redDelicious: 3 }, upgrades: ['redDelicious.x1'] };
  const state = E.parseSave(JSON.stringify(old), NOW);
  assert.equal(state.version, 1);
  assert.equal(state.lifetimeSpins, 500);
  assert.equal(state.owned.redDelicious, 3);
  assert.deepEqual(state.upgrades, ['redDelicious.x1']);
  assert.equal(state.clicks, 0);
  assert.equal(state.goldenClicks, 0);
  assert.equal(state.lastSavedAt, NOW);
});

test('parseSave never lets bad numbers or unknown ids through', () => {
  const state = E.parseSave(
    {
      spins: Infinity,
      lifetimeSpins: NaN,
      clicks: 2.7,
      goldenClicks: -4,
      owned: { redDelicious: -3, gala: Infinity, fuji: '4', grannySmith: 2.9 },
      upgrades: ['nope', 'redDelicious.x1', 'redDelicious.x1', 7, null],
      lastSavedAt: NOW + 1e9,
    },
    NOW,
  );
  assert.equal(state.spins, 0);
  assert.equal(state.lifetimeSpins, 0);
  assert.equal(state.clicks, 2);
  assert.equal(state.goldenClicks, 0);
  assert.equal(state.owned.redDelicious, 0);
  assert.equal(state.owned.gala, 0);
  assert.equal(state.owned.fuji, 0);
  assert.equal(state.owned.grannySmith, 2);
  assert.deepEqual(state.upgrades, ['redDelicious.x1']);
  assert.equal(state.lastSavedAt, NOW, 'a timestamp from the future is clamped to now');
  assert.ok(Object.values(state).every((v) => typeof v !== 'number' || Number.isFinite(v)));
});

test('a saved game survives a round trip through JSON', () => {
  const state = withOwned(
    { redDelicious: 12, gala: 3, platonic: 1 },
    { spins: 1234.5, lifetimeSpins: 99999, clicks: 40, upgrades: ['redDelicious.x1', 'closeYourEyes'], goldenClicks: 2, lastSavedAt: NOW - 5000 },
  );
  assert.deepEqual(E.parseSave(JSON.stringify(state), NOW), state);
});

test('a variety unlocks once lifetime spins reach half its base cost', () => {
  assert.equal(E.tierUnlocked(withOwned({}, { lifetimeSpins: 549 }), GALA), false);
  assert.equal(E.tierUnlocked(withOwned({}, { lifetimeSpins: 550 }), GALA), true);
  assert.equal(E.tierUnlocked(withOwned({ gala: 1 }), GALA), true, 'owning one keeps it unlocked');
});

test('every upgrade refers to a real tier and a known effect', () => {
  const tierIds = new Set(E.TIERS.map((tier) => tier.id));
  const kinds = new Set(['tierMultiplier', 'globalMultiplier', 'clickMultiplier', 'clickSpsPercent']);
  assert.equal(new Set(E.UPGRADES.map((u) => u.id)).size, E.UPGRADES.length, 'upgrade ids are unique');
  for (const upgrade of E.UPGRADES) {
    assert.ok(kinds.has(upgrade.effect.kind), upgrade.id);
    if (upgrade.effect.kind === 'tierMultiplier') assert.ok(tierIds.has(upgrade.effect.tier), upgrade.id);
    if (upgrade.unlock.kind === 'owned') assert.ok(tierIds.has(upgrade.unlock.tier), upgrade.id);
    assert.ok(upgrade.cost > 0, upgrade.id);
  }
  for (const tier of E.TIERS) {
    assert.equal(E.UPGRADES.filter((u) => u.effect.kind === 'tierMultiplier' && u.effect.tier === tier.id).length, 5, tier.id);
  }
});

test('best value is the unlocked variety with the most output per spin for its next apple', () => {
  const FUJI = tierIndex('fuji');
  assert.equal(E.bestValueIndex(E.freshState(NOW)), -1, 'nothing is unlocked in a fresh game');
  assert.equal(E.bestValueIndex(withOwned({}, { lifetimeSpins: 50 })), GRANNY, 'Granny Smith beats Red Delicious per spin');
  const owned = { redDelicious: 64, grannySmith: 52, gala: 41, fuji: 30, honeycrisp: 21, pinkLady: 12, cosmicCrisp: 4 };
  const unlocked = withOwned(owned, { lifetimeSpins: 318e6, clicks: 1200 });
  const notYet = ['pinkLady.x5', 'cosmicCrisp.x1', 'iqmaxxing', 'fourthEye'];
  const upgrades = E.UPGRADES.filter((u) => E.upgradeAvailable(unlocked, u) && !notYet.includes(u.id)).map((u) => u.id);
  const midGame = { ...unlocked, upgrades };
  assert.equal(E.bestValueIndex(midGame), FUJI, 'the mid-game save in the design picks Fuji');
  assert.equal(E.bestValueIndex({ ...midGame, upgrades: upgrades.concat('pinkLady.x5') }), tierIndex('pinkLady'), 'doubling Pink Lady overtakes Fuji');
});
