#!/usr/bin/env node
'use strict';

// Plays one idle strategy against Apple Spinner's real economy (js/economy.js) and against
// models of Cookie Clicker and AdVenture Capitalist built from their published constants.
// Sources for every constant are listed in the balance report (TOB-62).
//
//   node tools/balance-sim.js                 table for all three games
//   node tools/balance-sim.js --json out.json  also write every metric as JSON
//   node tools/balance-sim.js --svg out.svg    also write the time-to-tier chart
//   node tools/balance-sim.js --baseline ../main  also run the economy of another checkout and compare
//   options: --hours 720  --clicks 2  --seed 1  --runs 5 (golden events are random, so runs are averaged)

const fs = require('fs');
const path = require('path');
const E = require(path.join(__dirname, '..', 'js', 'economy.js'));

function parseArgs(argv) {
  const args = { hours: 720, clicks: 2, seed: 1, runs: 5, json: null, svg: null, baseline: null };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '');
    if (!(key in args)) throw new Error('Unknown option ' + argv[i]);
    args[key] = typeof args[key] === 'number' ? Number(argv[i + 1]) : argv[i + 1];
  }
  return args;
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CHECKPOINTS = [60, 300, 900, 1800, 3600, 7200, 14400, 28800, 86400, 172800, 345600, 604800];

function simulate(model, { hours, clicks, seed }) {
  const random = rng(seed);
  const maxT = hours * 3600;
  let state = model.init();
  let t = 0;
  let buff = { mult: 1, clickMult: 1, endsAt: 0 };
  let nextGolden = model.golden ? model.golden.delay(state, random) : Infinity;
  const unlockedAt = model.tiers.map(() => null);
  const ownedAt = model.tiers.map(() => null);
  const purchases = [];
  const rateAt = [];
  let checkpoint = 0;

  const income = (s, b) => {
    const r = model.rates(s, b);
    return r.sps + clicks * r.perClick;
  };
  const markTiers = () => {
    model.tiers.forEach((_, i) => {
      if (unlockedAt[i] === null && model.tierUnlocked(state, i)) unlockedAt[i] = t;
      if (ownedAt[i] === null && model.owned(state, i) > 0) ownedAt[i] = t;
    });
  };

  markTiers();
  while (t < maxT && ownedAt.some((x) => x === null)) {
    const base = income(state, { mult: 1, clickMult: 1 });
    const now = income(state, t < buff.endsAt ? buff : { mult: 1, clickMult: 1 });
    let best = null;
    for (const c of model.candidates(state)) {
      const gain = income(c.apply(state), { mult: 1, clickMult: 1 }) - base;
      if (!(gain > 0)) continue;
      const wait = Math.max(0, c.cost - model.bank(state)) / Math.max(now, 1e-9);
      const score = wait + c.cost / gain;
      if (!best || score < best.score) best = { ...c, score };
    }

    if (best && model.bank(state) >= best.cost) {
      state = model.spend(best.apply(state), best.cost);
      purchases.push({ t, label: best.label });
      markTiers();
      continue;
    }

    const cap = t < 600 ? 1 : t < 3 * 3600 ? 10 : 60;
    let dt = cap;
    if (best) dt = Math.min(dt, (best.cost - model.bank(state)) / Math.max(now, 1e-9));
    if (t < buff.endsAt) dt = Math.min(dt, buff.endsAt - t);
    dt = Math.min(dt, nextGolden - t, maxT - t);
    if (checkpoint < CHECKPOINTS.length) dt = Math.min(dt, CHECKPOINTS[checkpoint] - t);
    dt = Math.max(dt, 1e-6);

    const r = model.rates(state, t < buff.endsAt ? buff : { mult: 1, clickMult: 1 });
    state = model.earn(state, r.sps * dt, r.perClick * clicks * dt, clicks * dt);
    t += dt;

    while (checkpoint < CHECKPOINTS.length && t >= CHECKPOINTS[checkpoint] - 1e-9) {
      rateAt.push({ t: CHECKPOINTS[checkpoint], sps: model.rates(state, { mult: 1, clickMult: 1 }).sps });
      checkpoint++;
    }

    if (t >= nextGolden - 1e-9) {
      const out = model.golden.effect(state, random, t);
      state = out.state;
      if (out.buff) buff = out.buff;
      nextGolden = t + model.golden.delay(state, random);
    }
    markTiers();
  }

  const gaps = purchases.slice(1).map((p, i) => p.t - purchases[i].t);
  const windows = [
    [0, 900],
    [900, 3600],
    [3600, 4 * 3600],
    [4 * 3600, 24 * 3600],
    [24 * 3600, maxT],
  ].map(([from, to]) => {
    const inWindow = purchases.filter((p) => p.t >= from && p.t < to);
    const g = inWindow.slice(1).map((p, i) => p.t - inWindow[i].t);
    const sorted = g.slice().sort((a, b) => a - b);
    return {
      from,
      to,
      purchases: inWindow.length,
      medianGap: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null,
      longestGap: sorted.length ? sorted[sorted.length - 1] : null,
    };
  });
  return {
    name: model.name,
    tiers: model.tiers.map((tier, i) => ({ name: tier.name, unlockedAt: unlockedAt[i], ownedAt: ownedAt[i] })),
    rateAt,
    purchases: purchases.length,
    longestGap: gaps.length ? Math.max(...gaps) : null,
    windows,
    endedAt: t,
  };
}

function appleSpinner(economy = E, name = 'Apple Spinner') {
  const NONE = { mult: 1, clickMult: 1 };
  return {
    name,
    tiers: economy.TIERS,
    init: () => economy.freshState(0),
    bank: (s) => s.spins,
    owned: (s, i) => s.owned[economy.TIERS[i].id],
    tierUnlocked: (s, i) => economy.tierUnlocked(s, i),
    rates: (s, b = NONE) => ({ sps: economy.spinsPerSecond(s) * b.mult, perClick: economy.spinsPerClick(s, b.mult) }),
    earn: (s, fromSps, fromClicks, clicks) => ({ ...economy.earn(s, fromSps + fromClicks), clicks: s.clicks + clicks }),
    spend: (s) => s,
    candidates(s) {
      const rich = { ...s, spins: Infinity };
      const out = [];
      economy.TIERS.forEach((tier, i) => {
        if (!economy.tierUnlocked(s, i)) return;
        const cost = economy.costOf(tier, s.owned[tier.id], 1);
        out.push({ label: tier.name, cost, apply: (x) => ({ ...economy.buyTier({ ...x, spins: Infinity }, i, 1), spins: x.spins - cost }) });
      });
      for (const u of economy.UPGRADES) {
        if (!economy.upgradeAvailable(rich, u)) continue;
        out.push({ label: u.name, cost: u.cost, apply: (x) => ({ ...economy.buyUpgrade({ ...x, spins: Infinity }, u.id), spins: x.spins - u.cost }) });
      }
      return out;
    },
    golden: {
      delay: (s, random) => (economy.GOLDEN.minDelayMs + random() * (economy.GOLDEN.maxDelayMs - economy.GOLDEN.minDelayMs)) / 1000,
      effect(s, random, t) {
        const caught = { ...s, goldenClicks: s.goldenClicks + 1 };
        if (random() < 0.5) return { state: economy.earn(caught, economy.luckyAmount(caught)) };
        return {
          state: caught,
          buff: { mult: economy.GOLDEN.frenzyMultiplier, clickMult: 1, endsAt: t + economy.GOLDEN.frenzyMs / 1000 },
        };
      },
    },
  };
}

// Cookie Clicker, from orteil.dashnet.org/cookieclicker/main.js (Game.Object, Game.Tiers,
// Game.mouseCps, Game.shimmerTypes.golden, Game.NewUpgradeCookie, kittens). Achievements are
// approximated from building, bank, CpS, click, golden, and upgrade-count thresholds. Omits sugar
// lumps, minigames, wrath cookies, seasons, and the dragon, so it runs a little slower than real play.
function cookieClicker() {
  const NAMES = ['Cursor', 'Grandma', 'Farm', 'Mine', 'Factory', 'Bank', 'Temple', 'Wizard tower', 'Shipment', 'Alchemy lab', 'Portal', 'Time machine', 'Antimatter condenser'];
  const tiers = NAMES.map((name, n) => {
    if (n === 0) return { name, baseCost: 15, baseCps: 0.1 };
    if (n === 1) return { name, baseCost: 100, baseCps: 1 };
    let cps = Math.ceil(Math.pow(n, n * 0.5 + 2) * 10) / 10;
    let d = Math.pow(10, Math.ceil(Math.log(Math.ceil(cps)) / Math.LN10)) / 100;
    cps = Math.round(cps / d) * d;
    let price = (n + 9 + (n < 5 ? 0 : Math.pow(n - 5, 1.75) * 5)) * Math.pow(10, n);
    d = Math.pow(10, Math.ceil(Math.log(Math.ceil(price)) / Math.LN10)) / 100;
    price = Math.round(price / d) * d;
    return { name, baseCost: price, baseCps: cps };
  });
  const TIER_STEPS = [
    [1, 10],
    [5, 50],
    [25, 500],
    [50, 50000],
    [100, 5e6],
    [150, 5e8],
    [200, 5e11],
  ];
  const upgrades = [];
  tiers.forEach((tier, i) => {
    if (i === 0) return;
    TIER_STEPS.forEach(([count, factor], k) =>
      upgrades.push({ id: tier.name + k, cost: tier.baseCost * factor, unlock: (s) => s.owned[i] >= count, kind: 'tier', tier: i }),
    );
  });
  [
    ['Reinforced index finger', 100, 1],
    ['Carpal tunnel prevention cream', 500, 1],
    ['Ambidextrous', 10000, 10],
  ].forEach(([id, cost, n]) => upgrades.push({ id, cost, unlock: (s) => s.owned[0] >= n, kind: 'cursor' }));
  [
    ['Thousand fingers', 1e5, 25, 0.1],
    ['Million fingers', 1e7, 50, 5],
    ['Billion fingers', 1e8, 100, 10],
    ['Trillion fingers', 1e9, 150, 20],
    ['Quadrillion fingers', 1e10, 200, 20],
  ].forEach(([id, cost, n, factor]) => upgrades.push({ id, cost, unlock: (s) => s.owned[0] >= n, kind: 'fingers', factor }));
  [
    ['Plastic mouse', 5e4, 1e3],
    ['Iron mouse', 5e6, 1e5],
    ['Titanium mouse', 5e8, 1e7],
    ['Adamantium mouse', 5e10, 1e9],
    ['Unobtainium mouse', 5e12, 1e11],
  ].forEach(([id, cost, handmade]) => upgrades.push({ id, cost, unlock: (s) => s.handmade >= handmade, kind: 'mouse' }));
  [2, 3, 4, 8, 9, 10, 11].forEach((b) =>
    upgrades.push({ id: 'grandma' + b, cost: tiers[b].baseCost * 50, unlock: (s) => s.owned[b] >= 15 && s.owned[1] > 0, kind: 'grandma', tier: b }),
  );
  [
    ['Plain cookies', 1, 999999],
    ['Sugar cookies', 1, 4999995],
    ['Oatmeal raisin cookies', 1, 9999999],
    ['Peanut butter cookies', 2, 49999995],
    ['Coconut cookies', 2, 99999999],
    ['Macadamia nut cookies', 2, 99999999],
    ['Almond cookies', 2, 99999999],
    ['Hazelnut cookies', 2, 99999999],
    ['Walnut cookies', 2, 99999999],
    ['White chocolate cookies', 2, 499999995],
    ['Double-chip cookies', 2, 4999999995],
    ['White chocolate macadamia nut cookies', 2, 9999999999],
    ['All-chocolate cookies', 2, 49999999995],
    ['Dark chocolate-coated cookies', 5, 99999999999],
    ['White chocolate-coated cookies', 5, 99999999999],
    ['Eclipse cookies', 2, 499999999995],
    ['Zebra cookies', 2, 999999999999],
    ['Snickerdoodles', 2, 4999999999995],
    ['Stroopwafels', 2, 9999999999999],
    ['Macaroons', 2, 49999999999995],
    ['Empire biscuits', 2, 99999999999999],
  ].forEach(([id, power, cost]) => upgrades.push({ id, cost, unlock: (s) => s.earned >= cost / 20, kind: 'cookie', power }));
  upgrades.push({ id: 'Lucky day', cost: 777777777, unlock: (s) => s.goldenClicks >= 7, kind: 'luck' });
  upgrades.push({ id: 'Serendipity', cost: 77777777777, unlock: (s) => s.goldenClicks >= 27, kind: 'luck' });
  upgrades.push({ id: 'Get lucky', cost: 77777777777777, unlock: (s) => s.goldenClicks >= 77, kind: 'duration' });
  [
    ['Kitten helpers', 9e6, 0.5, 0.1],
    ['Kitten workers', 9e9, 1, 0.125],
    ['Kitten engineers', 9e13, 2, 0.15],
    ['Kitten overseers', 9e16, 3, 0.175],
  ].forEach(([id, cost, milk, factor]) => upgrades.push({ id, cost, unlock: (s) => achievements(s) / 25 >= milk, kind: 'kitten', factor }));
  const byId = new Map(upgrades.map((u) => [u.id, u]));

  const countAt = (value, thresholds) => thresholds.filter((x) => value >= x).length;
  const BUILDING_ACHIEVEMENTS = [1, 50, 100, 150, 200, 250, 300, 350, 400];
  const BANK_ACHIEVEMENTS = [1].concat(Array.from({ length: 20 }, (_, k) => Math.pow(10, Math.floor((k + 1) * 1.5 + 2))));
  const CPS_ACHIEVEMENTS = Array.from({ length: 20 }, (_, k) => Math.pow(10, Math.floor(k * 1.2)));
  function achievements(s) {
    const buildings = s.owned.reduce((a, b) => a + b, 0);
    let n = s.owned.reduce((sum, owned) => sum + countAt(owned, BUILDING_ACHIEVEMENTS), 0);
    n += countAt(s.earned, BANK_ACHIEVEMENTS) + countAt(s.peakCps || 0, CPS_ACHIEVEMENTS);
    n += countAt(s.handmade, [1e3, 1e5, 1e7, 1e9, 1e11]) + countAt(s.goldenClicks, [1, 7, 27, 77]);
    n += countAt(buildings, [100, 500, 1000, 2000]) + countAt(s.upgrades.size, [20, 50, 100, 200]);
    if (Math.min(...s.owned) >= 1) n++;
    return n;
  }

  function cps(s) {
    const has = (kind) => [...s.upgrades].filter((id) => byId.get(id).kind === kind);
    const tierMult = tiers.map(() => 1);
    for (const id of has('tier')) tierMult[byId.get(id).tier] *= 2;
    const nonCursor = s.owned.slice(1).reduce((a, b) => a + b, 0);
    const fingers = s.upgrades.has('Thousand fingers') ? has('fingers').reduce((f, id) => f * byId.get(id).factor, 1) : 0;
    const cursorDoublings = has('cursor').length;
    const grandmaSyn = has('grandma');
    let global = 1;
    for (const id of has('cookie')) global *= 1 + byId.get(id).power / 100;
    const milk = achievements(s) / 25;
    for (const id of has('kitten')) global *= 1 + milk * byId.get(id).factor;
    let total = s.owned[0] * (0.1 * Math.pow(2, cursorDoublings) + fingers * nonCursor) * tierMult[0];
    total += s.owned[1] * tiers[1].baseCps * tierMult[1] * Math.pow(2, grandmaSyn.length);
    for (let i = 2; i < tiers.length; i++) {
      let synergy = 1;
      if (grandmaSyn.includes('grandma' + i)) synergy += (0.01 * s.owned[1]) / (i - 1);
      total += s.owned[i] * tiers[i].baseCps * tierMult[i] * synergy;
    }
    return {
      cps: total * global,
      click: () => 1 * Math.pow(2, cursorDoublings) + fingers * nonCursor,
      mice: has('mouse').length,
    };
  }

  const NONE = { mult: 1, clickMult: 1 };
  const goldenCount = (s, kind) => [...s.upgrades].filter((id) => byId.get(id).kind === kind).length;
  return {
    name: 'Cookie Clicker',
    tiers,
    init: () => ({ cookies: 0, earned: 0, handmade: 0, owned: tiers.map(() => 0), upgrades: new Set(), goldenClicks: 0 }),
    bank: (s) => s.cookies,
    owned: (s, i) => s.owned[i],
    tierUnlocked: (s, i) => s.owned[i] > 0 || s.earned >= tiers[i].baseCost,
    rates(s, b = NONE) {
      const c = cps(s);
      const sps = c.cps * b.mult;
      return { sps, perClick: (c.click() + sps * 0.01 * c.mice) * b.clickMult };
    },
    earn: (s, fromSps, fromClicks) => ({
      ...s,
      peakCps: Math.max(s.peakCps || 0, cps(s).cps),
      cookies: s.cookies + fromSps + fromClicks,
      earned: s.earned + fromSps + fromClicks,
      handmade: s.handmade + fromClicks,
    }),
    spend: (s, cost) => ({ ...s, cookies: s.cookies - cost }),
    candidates(s) {
      const out = [];
      tiers.forEach((tier, i) => {
        if (!(s.owned[i] > 0 || s.earned >= tier.baseCost)) return;
        const cost = Math.ceil(tier.baseCost * Math.pow(1.15, s.owned[i]));
        out.push({ label: tier.name, cost, apply: (x) => ({ ...x, owned: x.owned.map((n, j) => (j === i ? n + 1 : n)) }) });
      });
      for (const u of upgrades) {
        if (s.upgrades.has(u.id) || !u.unlock(s)) continue;
        out.push({ label: u.id, cost: u.cost, apply: (x) => ({ ...x, upgrades: new Set([...x.upgrades, u.id]) }) });
      }
      return out;
    },
    golden: {
      delay(s, random) {
        const scale = Math.pow(0.5, goldenCount(s, 'luck'));
        const fps = 30;
        const min = Math.ceil(fps * 60 * 5 * scale);
        const max = Math.ceil(fps * 60 * 15 * scale);
        for (let frame = 0; ; frame++) {
          if (random() < Math.pow(Math.max(0, (frame - min) / (max - min)), 5)) return frame / fps;
        }
      },
      effect(s, random, t) {
        const caught = { ...s, goldenClicks: s.goldenClicks + 1 };
        const durMod = goldenCount(s, 'duration') ? 2 : 1;
        const list = ['frenzy', 'lucky'];
        if (random() < 0.1) list.push('click frenzy');
        const big = s.owned.map((n, i) => (n >= 10 ? i : -1)).filter((i) => i >= 0);
        if (s.owned.reduce((a, b) => a + b, 0) >= 10 && random() < 0.25 && big.length) list.push('building special');
        const choice = list[Math.floor(random() * list.length)];
        const c = cps(caught);
        if (choice === 'lucky') {
          const amount = Math.min(caught.cookies * 0.15, c.cps * 900) + 13;
          return { state: { ...caught, cookies: caught.cookies + amount, earned: caught.earned + amount } };
        }
        if (choice === 'click frenzy') return { state: caught, buff: { mult: 1, clickMult: 777, endsAt: t + 13 * durMod } };
        if (choice === 'building special') {
          const pick = big[Math.floor(random() * big.length)];
          return { state: caught, buff: { mult: caught.owned[pick] / 10 + 1, clickMult: 1, endsAt: t + 30 * durMod } };
        }
        return { state: caught, buff: { mult: 7, clickMult: 1, endsAt: t + 77 * durMod } };
      },
    },
  };
}

// AdVenture Capitalist (Earth), from the AdVenture Capitalist wiki: Businesses, Unlocks (Earth),
// Cash Upgrades. Production is treated as continuous from the first unit, as if every business
// had its manager; angels, platinum, and the global unlocks are left out.
function adventureCapitalist() {
  const tiers = [
    ['Lemonade Stand', 3.738, 1.07, 0.6, 1],
    ['Newspaper Delivery', 60, 1.15, 3, 60],
    ['Car Wash', 720, 1.14, 6, 540],
    ['Pizza Delivery', 8640, 1.13, 12, 4320],
    ['Donut Shop', 103680, 1.12, 24, 51840],
    ['Shrimp Boat', 1244160, 1.11, 96, 622080],
    ['Hockey Team', 14929920, 1.1, 384, 7464960],
    ['Movie Studio', 179159040, 1.09, 1536, 89579520],
    ['Bank', 2149908480, 1.08, 6144, 1074954240],
    ['Oil Company', 25798901760, 1.07, 36864, 29668737024],
  ].map(([name, baseCost, growth, time, revenue]) => ({ name, baseCost, growth, time, revenue }));
  const cash = [2.5e5, 5e5, 1e6, 5e6, 1e7, 2.5e7, 5e8, 1e10, 5e10, 2.5e11];
  const speed = (n) => Math.pow(2, [25, 50, 100, 200, 300, 400].filter((m) => n >= m).length);
  const NONE = { mult: 1, clickMult: 1 };
  const sps = (s) =>
    tiers.reduce((sum, tier, i) => sum + (s.owned[i] * tier.revenue * speed(s.owned[i]) * (s.cash[i] ? 3 : 1) * (s.monopoly ? 3 : 1)) / tier.time, 0);
  return {
    name: 'AdVenture Capitalist',
    tiers,
    init: () => ({ money: 0, owned: tiers.map((_, i) => (i === 0 ? 1 : 0)), cash: tiers.map(() => false), monopoly: false }),
    bank: (s) => s.money,
    owned: (s, i) => s.owned[i],
    tierUnlocked: (s, i) => s.owned[i] > 0 || s.money >= tiers[i].baseCost,
    rates: (s, b = NONE) => ({ sps: sps(s) * b.mult, perClick: 0 }),
    earn: (s, fromSps) => ({ ...s, money: s.money + fromSps }),
    spend: (s, cost) => ({ ...s, money: s.money - cost }),
    candidates(s) {
      const out = [];
      tiers.forEach((tier, i) => {
        const cost = tier.baseCost * Math.pow(tier.growth, s.owned[i]);
        out.push({ label: tier.name, cost, apply: (x) => ({ ...x, owned: x.owned.map((n, j) => (j === i ? n + 1 : n)) }) });
        if (!s.cash[i]) out.push({ label: tier.name + ' x3', cost: cash[i], apply: (x) => ({ ...x, cash: x.cash.map((c, j) => c || j === i) }) });
      });
      if (!s.monopoly) out.push({ label: 'Monopoly', cost: 1e12, apply: (x) => ({ ...x, monopoly: true }) });
      return out;
    },
    golden: null,
  };
}

function average(runs) {
  const mean = (values) => (values.some((v) => v === null) ? null : values.reduce((a, b) => a + b, 0) / values.length);
  const first = runs[0];
  return {
    name: first.name,
    runs: runs.length,
    tiers: first.tiers.map((tier, i) => ({
      name: tier.name,
      unlockedAt: mean(runs.map((r) => r.tiers[i].unlockedAt)),
      ownedAt: mean(runs.map((r) => r.tiers[i].ownedAt)),
    })),
    rateAt: first.rateAt.map((x, i) => ({ t: x.t, sps: mean(runs.map((r) => (r.rateAt[i] ? r.rateAt[i].sps : null))) })).filter((x) => x.sps !== null),
    purchases: Math.round(mean(runs.map((r) => r.purchases))),
    longestGap: Math.max(...runs.map((r) => r.longestGap)),
    windows: first.windows.map((w, i) => ({
      from: w.from,
      to: w.to,
      purchases: Math.round(mean(runs.map((r) => r.windows[i].purchases))),
      medianGap: mean(runs.map((r) => r.windows[i].medianGap)),
      longestGap: Math.max(...runs.map((r) => r.windows[i].longestGap || 0)) || null,
    })),
    endedAt: Math.max(...runs.map((r) => r.endedAt)),
  };
}

function duration(seconds) {
  if (seconds === null || seconds === undefined) return '—';
  if (seconds < 60) return Math.round(seconds) + 's';
  if (seconds < 3600) return (seconds / 60).toFixed(seconds < 600 ? 1 : 0) + 'm';
  if (seconds < 86400) return (seconds / 3600).toFixed(1) + 'h';
  return (seconds / 86400).toFixed(1) + 'd';
}

function sci(n) {
  if (n < 1000) return n.toFixed(n < 10 ? 1 : 0);
  return n.toExponential(2).replace('e+', 'e');
}

function table(results) {
  const lines = [];
  const pad = (s, n) => String(s).padEnd(n);
  for (const r of results) {
    lines.push('', '## ' + r.name + ' (' + r.purchases + ' purchases, last tier by ' + duration(r.endedAt) + ')', '');
    lines.push(pad('#', 4) + pad('name', 24) + pad('unlocked', 10) + 'first owned');
    r.tiers.forEach((tier, i) => lines.push(pad(i + 1, 4) + pad(tier.name, 24) + pad(duration(tier.unlockedAt), 10) + duration(tier.ownedAt)));
    lines.push('', 'production per second: ' + r.rateAt.map((x) => duration(x.t) + ' ' + sci(x.sps)).join(', '));
    lines.push('time between purchases (median / longest):');
    for (const w of r.windows) {
      lines.push('  ' + pad(duration(w.from) + '–' + duration(w.to), 12) + pad(w.purchases + ' buys', 10) + duration(w.medianGap) + ' / ' + duration(w.longestGap));
    }
  }
  return lines.join('\n');
}

function svg(results) {
  const W = 960;
  const H = 560;
  const L = 70;
  const R = 200;
  const T = 40;
  const B = 50;
  const maxTier = Math.max(...results.map((r) => r.tiers.length));
  const minLog = 0;
  const maxLog = Math.log10(30 * 86400);
  const x = (tier) => L + ((tier - 1) / (maxTier - 1)) * (W - L - R);
  const y = (sec) => H - B - ((Math.log10(Math.max(sec, 1)) - minLog) / (maxLog - minLog)) * (H - T - B);
  const colors = ['#E5484D', '#D3A256', '#3E6A7A', '#7FA35E', '#B25A76'];
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="Helvetica, Arial, sans-serif" font-size="13">`,
    `<rect width="${W}" height="${H}" fill="#FFFFFF"/>`,
    `<text x="${L}" y="24" font-size="16" font-weight="bold">Time to own the first unit of each tier (log scale, idle strategy, 2 clicks/s)</text>`,
  ];
  const ticks = [
    [1, '1s'],
    [10, '10s'],
    [60, '1m'],
    [600, '10m'],
    [3600, '1h'],
    [6 * 3600, '6h'],
    [86400, '1d'],
    [7 * 86400, '7d'],
    [30 * 86400, '30d'],
  ];
  for (const [sec, label] of ticks) {
    parts.push(`<line x1="${L}" x2="${W - R}" y1="${y(sec)}" y2="${y(sec)}" stroke="#E6E6E6"/>`);
    parts.push(`<text x="${L - 8}" y="${y(sec) + 4}" text-anchor="end" fill="#555">${label}</text>`);
  }
  for (let tier = 1; tier <= maxTier; tier++) parts.push(`<text x="${x(tier)}" y="${H - B + 20}" text-anchor="middle" fill="#555">${tier}</text>`);
  parts.push(`<text x="${(L + W - R) / 2}" y="${H - 10}" text-anchor="middle" fill="#333">tier</text>`);
  results.forEach((r, k) => {
    const pts = r.tiers.map((tier, i) => [i + 1, tier.ownedAt]).filter(([, t]) => t !== null);
    const color = colors[k % colors.length];
    const dash = r.dash ? ' stroke-dasharray="6 4"' : '';
    parts.push(`<polyline fill="none" stroke="${color}" stroke-width="2.5"${dash} points="${pts.map(([i, t]) => x(i) + ',' + y(t)).join(' ')}"/>`);
    for (const [i, t] of pts) parts.push(`<circle cx="${x(i)}" cy="${y(t)}" r="3.5" fill="${color}"/>`);
    parts.push(`<line x1="${W - R + 20}" x2="${W - R + 50}" y1="${T + 20 + k * 24}" y2="${T + 20 + k * 24}" stroke="${color}" stroke-width="2.5"${dash}/>`);
    parts.push(`<text x="${W - R + 58}" y="${T + 24 + k * 24}">${r.name}</text>`);
  });
  parts.push('</svg>');
  return parts.join('\n');
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  const seeds = Array.from({ length: args.runs }, (_, k) => args.seed + k);
  const models = [appleSpinner, cookieClicker, adventureCapitalist];
  if (args.baseline) {
    const baseline = require(path.resolve(args.baseline, 'js', 'economy.js'));
    models.splice(1, 0, () => appleSpinner(baseline, 'Apple Spinner (baseline)'));
  }
  const results = models.map((model) => average(seeds.map((seed) => simulate(model(), { ...args, seed }))));
  if (args.baseline) results[1].dash = true;
  console.log(
    '# Idle strategy: shortest payback (wait + cost / gain), ' + args.clicks + ' clicks/s, golden events caught.',
    'Mean of ' + args.runs + ' runs (seeds ' + seeds[0] + '–' + seeds[seeds.length - 1] + '); longest gaps are the worst run.',
  );
  console.log(table(results));
  if (args.baseline) {
    console.log('\n## Apple Spinner against the baseline (first owned, ratio)\n');
    results[0].tiers.forEach((tier, i) => {
      const before = results[1].tiers[i].ownedAt;
      console.log(String(i + 1).padEnd(4) + tier.name.padEnd(24) + duration(before).padEnd(10) + duration(tier.ownedAt).padEnd(10) + (tier.ownedAt / before).toFixed(2) + '×');
    });
  }
  if (args.json) fs.writeFileSync(args.json, JSON.stringify(results, null, 2));
  if (args.svg) fs.writeFileSync(args.svg, svg(results));
}

module.exports = { simulate, average, appleSpinner, cookieClicker, adventureCapitalist, svg, table };
