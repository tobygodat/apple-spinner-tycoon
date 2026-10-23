(function (root) {
  'use strict';

  const SAVE_VERSION = 1;
  const COST_GROWTH = 1.15;
  const OFFLINE_CAP_SECONDS = 8 * 60 * 60;
  const GOLDEN = {
    minDelayMs: 60000,
    maxDelayMs: 180000,
    visibleMs: 12000,
    frenzyMultiplier: 7,
    frenzyMs: 30000,
  };

  const { TIERS, UPGRADES, RANKS } =
    typeof module === 'object' && module.exports ? require('./data.js') : root.GameData;

  const UPGRADE_BY_ID = new Map(UPGRADES.map((upgrade) => [upgrade.id, upgrade]));

  function freshState(now) {
    return {
      version: SAVE_VERSION,
      spins: 0,
      lifetimeSpins: 0,
      clicks: 0,
      owned: Object.fromEntries(TIERS.map((tier) => [tier.id, 0])),
      upgrades: [],
      goldenClicks: 0,
      lastSavedAt: now,
    };
  }

  function unitCost(tier, owned) {
    return Math.ceil(tier.baseCost * Math.pow(COST_GROWTH, owned));
  }

  function costOf(tier, owned, qty) {
    let total = 0;
    for (let k = 0; k < qty; k++) total += unitCost(tier, owned + k);
    return total;
  }

  function maxAffordable(tier, owned, spins) {
    let count = 0;
    let total = 0;
    for (;;) {
      const next = unitCost(tier, owned + count);
      if (!Number.isFinite(next) || total + next > spins) return count;
      total += next;
      count++;
    }
  }

  function meetsRequirement(state, requirement) {
    switch (requirement.kind) {
      case 'owned':
        return state.owned[requirement.tier] >= requirement.count;
      case 'lifetimeSpins':
        return state.lifetimeSpins >= requirement.amount;
      case 'clicks':
        return state.clicks >= requirement.count;
    }
    throw new Error('Unknown requirement kind: ' + requirement.kind);
  }

  function multipliers(state) {
    const tier = Object.fromEntries(TIERS.map((t) => [t.id, 1]));
    let global = 1;
    let click = 1;
    let clickSpsPercent = 0;
    for (const id of state.upgrades) {
      const effect = UPGRADE_BY_ID.get(id).effect;
      switch (effect.kind) {
        case 'tierMultiplier':
          tier[effect.tier] *= effect.factor;
          break;
        case 'globalMultiplier':
          global *= effect.factor;
          break;
        case 'clickMultiplier':
          click *= effect.factor;
          break;
        case 'clickSpsPercent':
          clickSpsPercent += effect.percent;
          break;
        default:
          throw new Error('Unknown effect kind: ' + effect.kind);
      }
    }
    return { tier, global, click, clickSpsPercent };
  }

  function spsEach(state, index) {
    const tier = TIERS[index];
    const m = multipliers(state);
    return tier.baseSps * m.tier[tier.id] * m.global;
  }

  function spinsPerSecond(state) {
    const m = multipliers(state);
    let total = 0;
    for (const tier of TIERS) total += state.owned[tier.id] * tier.baseSps * m.tier[tier.id];
    return total * m.global;
  }

  function spinsPerClick(state, productionMultiplier) {
    const m = multipliers(state);
    const sps = spinsPerSecond(state) * (productionMultiplier || 1);
    return m.click + (sps * m.clickSpsPercent) / 100;
  }

  function earn(state, amount) {
    return { ...state, spins: state.spins + amount, lifetimeSpins: state.lifetimeSpins + amount };
  }

  function focus(state, productionMultiplier) {
    const amount = spinsPerClick(state, productionMultiplier);
    return { state: { ...earn(state, amount), clicks: state.clicks + 1 }, amount };
  }

  function buyTier(state, index, qty) {
    const tier = TIERS[index];
    const owned = state.owned[tier.id];
    if (!(qty >= 1)) return state;
    const cost = costOf(tier, owned, qty);
    if (!(cost <= state.spins)) return state;
    return { ...state, spins: state.spins - cost, owned: { ...state.owned, [tier.id]: owned + qty } };
  }

  function tierUnlocked(state, index) {
    const tier = TIERS[index];
    return state.owned[tier.id] > 0 || state.lifetimeSpins >= tier.baseCost / 2;
  }

  function bestValueIndex(state) {
    let best = -1;
    let bestRatio = 0;
    TIERS.forEach((tier, i) => {
      if (!tierUnlocked(state, i)) return;
      const ratio = spsEach(state, i) / unitCost(tier, state.owned[tier.id]);
      if (ratio > bestRatio) {
        best = i;
        bestRatio = ratio;
      }
    });
    return best;
  }

  function upgradeAvailable(state, upgrade) {
    return !state.upgrades.includes(upgrade.id) && meetsRequirement(state, upgrade.unlock);
  }

  function buyUpgrade(state, id) {
    const upgrade = UPGRADE_BY_ID.get(id);
    if (!upgrade || !upgradeAvailable(state, upgrade) || upgrade.cost > state.spins) return state;
    return { ...state, spins: state.spins - upgrade.cost, upgrades: state.upgrades.concat(id) };
  }

  function apparentLoad(state) {
    let load = 0;
    TIERS.forEach((tier, i) => {
      load += state.owned[tier.id] * (i + 1);
    });
    return load;
  }

  function iqExact(state) {
    return 100 + 15 * Math.log2(1 + apparentLoad(state));
  }

  function iq(state) {
    return Math.round(iqExact(state));
  }

  function rankIndexFor(iqValue) {
    let index = 0;
    for (let i = 0; i < RANKS.length; i++) if (iqValue >= RANKS[i].iq) index = i;
    return index;
  }

  function rankFor(iqValue) {
    return RANKS[rankIndexFor(iqValue)];
  }

  function productionMultiplier(buff, now) {
    return buff.kind === 'frenzy' && now < buff.endsAt ? buff.multiplier : 1;
  }

  function accrue(state, buff, from, to) {
    const elapsedMs = Math.min(Math.max(0, to - from), OFFLINE_CAP_SECONDS * 1000);
    const boostedMs = buff.kind === 'frenzy' ? Math.min(elapsedMs, Math.max(0, Math.min(to, buff.endsAt) - from)) : 0;
    const earned = (spinsPerSecond(state) * (elapsedMs + boostedMs * (productionMultiplier(buff, from) - 1))) / 1000;
    return { state: earned > 0 ? earn(state, earned) : state, earned, elapsedMs };
  }

  function applyOfflineProgress(state, now) {
    const elapsedSeconds = Math.min(Math.max(0, (now - state.lastSavedAt) / 1000), OFFLINE_CAP_SECONDS);
    const earned = elapsedSeconds * spinsPerSecond(state);
    return { state: { ...earn(state, earned), lastSavedAt: now }, earned, elapsedSeconds };
  }

  function luckyAmount(state) {
    return Math.min(state.spins * 0.15, spinsPerSecond(state) * 900) + 13;
  }

  function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  function nonNegative(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
  }

  function wholeNumber(value) {
    return Math.floor(nonNegative(value));
  }

  function parseSave(raw, now) {
    let data = raw;
    if (typeof raw === 'string') {
      try {
        data = JSON.parse(raw);
      } catch {
        return freshState(now);
      }
    }
    if (!isRecord(data)) return freshState(now);

    const fresh = freshState(now);
    const owned = { ...fresh.owned };
    if (isRecord(data.owned)) for (const tier of TIERS) owned[tier.id] = wholeNumber(data.owned[tier.id]);

    const upgrades = Array.isArray(data.upgrades)
      ? Array.from(new Set(data.upgrades.filter((id) => typeof id === 'string' && UPGRADE_BY_ID.has(id))))
      : [];

    const spins = nonNegative(data.spins);
    const savedAt = data.lastSavedAt;
    return {
      version: SAVE_VERSION,
      spins,
      lifetimeSpins: Math.max(nonNegative(data.lifetimeSpins), spins),
      clicks: wholeNumber(data.clicks),
      owned,
      upgrades,
      goldenClicks: wholeNumber(data.goldenClicks),
      lastSavedAt: typeof savedAt === 'number' && Number.isFinite(savedAt) && savedAt <= now ? savedAt : now,
    };
  }

  const Economy = {
    OFFLINE_CAP_SECONDS,
    GOLDEN,
    TIERS,
    UPGRADES,
    RANKS,
    freshState,
    parseSave,
    costOf,
    maxAffordable,
    spinsPerSecond,
    spsEach,
    spinsPerClick,
    earn,
    focus,
    buyTier,
    buyUpgrade,
    tierUnlocked,
    bestValueIndex,
    upgradeAvailable,
    iq,
    iqExact,
    rankFor,
    rankIndexFor,
    applyOfflineProgress,
    productionMultiplier,
    accrue,
    luckyAmount,
  };

  if (typeof module === 'object' && module.exports) module.exports = Economy;
  else root.Economy = Economy;
})(typeof globalThis !== 'undefined' ? globalThis : this);
