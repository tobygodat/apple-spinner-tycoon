(function () {
  'use strict';

  const E = window.Economy;
  const R = window.Render;
  const Art = window.Art;
  const fmt = window.Format.formatNumber;

  const SAVE_KEY = 'spinning-apples.save';
  const AUTOSAVE_MS = 10000;
  const SPARK_EVERY_MS = 10000;
  const SPARK_POINTS = 61;
  const narrowQuery = window.matchMedia('(max-width: 720px)');
  const wideQuery = window.matchMedia('(min-width: 1200px)');
  const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const GILDED = E.TIERS.findIndex((tier) => tier.id === 'gilded');
  const TIER_BY_ID = Object.fromEntries(E.TIERS.map((tier) => [tier.id, tier]));
  const UPGRADES_BY_COST = E.UPGRADES.slice().sort((a, b) => a.cost - b.cost);
  const debug = new URLSearchParams(location.search).get('debug') === '1';
  const $ = (id) => document.getElementById(id);

  const els = {
    spins: $('spins'),
    sps: $('sps'),
    perFocus: $('per-focus'),
    iq: $('iq'),
    rank: $('rank'),
    head: $('head'),
    canvas: $('head-canvas'),
    focus: $('focus'),
    caption: $('apple-count'),
    events: $('events'),
    buff: $('buff'),
    buffTime: $('buff-time'),
    store: $('store'),
    storeToggle: $('store-toggle'),
    storeReady: $('store-ready'),
    summaryThumb: $('summary-thumb'),
    summaryRank: $('summary-rank'),
    summaryIq: $('summary-iq'),
    rankNext: $('rank-next'),
    rankFill: $('rank-fill'),
    sparkLine: $('spark-line'),
    sparkDot: $('spark-dot'),
    summarySps: $('summary-sps'),
    upgradesToggle: $('upgrades-toggle'),
    upgradesBody: $('upgrades-body'),
    upgrades: $('upgrades'),
    upgradeCount: $('upgrade-count'),
    upgradesOwned: $('upgrades-owned'),
    upgradesReady: $('upgrades-ready'),
    upgradesEmpty: $('upgrades-empty'),
    upgradesMore: $('upgrades-more'),
    tiers: $('tiers'),
    tiersCount: $('tiers-count'),
    golden: $('golden'),
    goldenCanvas: $('golden-canvas'),
    stats: $('stats'),
    reset: $('reset'),
    saved: $('saved'),
  };

  let reduced = reducedQuery.matches;

  function readSave() {
    try {
      return window.localStorage.getItem(SAVE_KEY);
    } catch {
      return null;
    }
  }

  let skipSaves = false;
  let lastSaveAt = 0;
  function writeSave(savedAt) {
    if (skipSaves) return;
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({ ...state, lastSavedAt: savedAt ?? Date.now() }));
      lastSaveAt = Date.now();
    } catch {
      // Storage can be full or disabled (private mode); the game keeps running unsaved.
    }
  }

  function randomGoldenDelay() {
    return E.GOLDEN.minDelayMs + Math.random() * (E.GOLDEN.maxDelayMs - E.GOLDEN.minDelayMs);
  }

  const bootedAt = Date.now();
  const offline = E.applyOfflineProgress(E.parseSave(readSave(), bootedAt), bootedAt);
  let state = offline.state;
  let golden = { phase: 'waiting', spawnAt: bootedAt + randomGoldenDelay() };
  let buff = { kind: 'none' };
  let buyAmount = 1;
  let upgradesExpanded = false;
  let upgradesOpen = true;
  let upgradesFoldedForCard = false;
  let openTier = -1;
  let rankIndex = E.rankIndexFor(E.iq(state));
  let lastTick = bootedAt;
  let lastPatch = 0;
  let storeDirty = true;
  let lastSpark = bootedAt;
  const spark = new Array(SPARK_POINTS).fill(E.spinsPerSecond(state));

  const stage = R.createStage(els.canvas, E.TIERS);
  stage.setReducedMotion(reduced);

  function ownedCounts() {
    return E.TIERS.map((tier) => state.owned[tier.id]);
  }

  function focusText(amount) {
    return fmt(amount, amount < 1000 ? 1 : 0);
  }

  function rateText(perSecond) {
    return perSecond >= 100 ? fmt(Math.round(perSecond)) : fmt(perSecond, 1);
  }

  function durationText(seconds) {
    const s = Math.max(1, Math.ceil(seconds));
    if (s < 60) return s + 's';
    const m = Math.round(s / 60);
    if (m < 60) return m + 'm';
    const h = Math.floor(m / 60);
    if (h < 48) return m % 60 ? h + 'h ' + (m % 60) + 'm' : h + 'h';
    return Math.round(h / 24) + 'd';
  }

  function shareText(share) {
    const percent = share * 100;
    if (percent > 0 && percent < 0.1) return '<0.1% of output';
    return percent.toFixed(1) + '% of output';
  }

  function setText(el, text) {
    if (el.__text !== text) {
      el.__text = text;
      el.textContent = text;
    }
  }

  function setHidden(el, hidden) {
    if (el.hidden !== hidden) el.hidden = hidden;
  }

  function setClass(el, name, on) {
    if (el.classList.contains(name) !== on) el.classList.toggle(name, on);
  }

  function setAttr(el, name, value) {
    if (el.getAttribute(name) !== value) el.setAttribute(name, value);
  }

  function setHtml(el, key, html) {
    if (el.__html !== key) {
      el.__html = key;
      el.innerHTML = html;
    }
  }

  const RING =
    '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="7" fill="none" stroke="#202125" stroke-width="2"/>' +
    '<path fill="none" stroke="#8A8F98" stroke-width="2" stroke-linecap="round"/></svg>';

  function ringPath(fraction) {
    const p = Math.min(0.999, Math.max(0.02, fraction));
    const a = p * Math.PI * 2;
    const x = (9 + 7 * Math.sin(a)).toFixed(2);
    const y = (9 - 7 * Math.cos(a)).toFixed(2);
    return 'M9 2 A7 7 0 ' + (p > 0.5 ? 1 : 0) + ' 1 ' + x + ' ' + y;
  }

  function patchEta(view, cost, perSecond) {
    const missing = cost - state.spins;
    setText(view.etaText, missing > 0 && perSecond > 0 ? durationText(missing / perSecond) : '');
    setAttr(view.ringArc, 'd', ringPath(state.spins / cost));
  }

  function event(title, detail, ms, key) {
    if (key) {
      const same = els.events.querySelector('.event[data-key="' + key + '"]:not([data-state="closing"])');
      if (same) closeEvent(same, true);
    }
    const el = document.createElement('div');
    el.className = 'event';
    if (key) el.dataset.key = key;
    el.dataset.state = 'entering';
    el.innerHTML = '<span class="event-dot" aria-hidden="true"></span><span class="event-title"></span><span class="event-detail"></span>';
    el.children[1].textContent = title;
    el.children[2].textContent = detail || '';
    setHidden(el.children[2], !detail);
    els.events.prepend(el);
    requestAnimationFrame(() => requestAnimationFrame(() => delete el.dataset.state));
    setTimeout(() => closeEvent(el), ms || 3600);
    const open = els.events.querySelectorAll('.event:not(.event-frenzy):not([data-state="closing"])');
    for (let k = 3; k < open.length; k++) closeEvent(open[k]);
  }

  function closeEvent(el, instant) {
    if (el.dataset.state === 'closing') return;
    if (instant) {
      el.remove();
      return;
    }
    el.dataset.state = 'closing';
    el.addEventListener('transitionend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 300);
  }

  function awayEvent(seconds, earned) {
    event('Away ' + durationText(seconds) + '.', 'Earned ' + fmt(earned) + ' spins.', 7000, 'away');
  }

  function describeEffect(effect) {
    switch (effect.kind) {
      case 'tierMultiplier':
        return TIER_BY_ID[effect.tier].name + ' ×' + effect.factor;
      case 'globalMultiplier':
        return 'All apples ×' + effect.factor;
      case 'clickMultiplier':
        return 'Focus ×' + effect.factor;
      case 'clickSpsPercent':
        return 'Focus +' + effect.percent + '% of spins per second';
    }
    throw new Error('Unknown effect kind: ' + effect.kind);
  }

  function upgradeGain(upgrade) {
    if (upgrade.effect.kind !== 'tierMultiplier' && upgrade.effect.kind !== 'globalMultiplier') return 0;
    return E.spinsPerSecond({ ...state, upgrades: state.upgrades.concat(upgrade.id) }) - E.spinsPerSecond(state);
  }

  function flashDenied(el) {
    if (reduced) return;
    el.animate([{ color: '#F7F8F8' }, { color: '#62666D' }], { duration: 320, easing: 'ease-out' });
  }

  /* Store rows */

  const tierViews = E.TIERS.map((tier, index) => {
    const row = document.createElement('div');
    row.className = 'row tier';
    row.innerHTML =
      '<button type="button" class="row-main">' +
      '<span class="tile art"></span>' +
      '<span class="row-text">' +
      '<span class="row-line row-title"><span class="row-name"></span><span class="tag" hidden>Best value</span></span>' +
      '<span class="row-line row-meta"><span class="bar"><span class="bar-fill"></span></span><span class="row-rate"></span><span class="row-share"></span><span class="row-note"></span></span>' +
      '</span>' +
      '<span class="row-owned"></span><span class="row-price"></span>' +
      '<span class="slot"><span class="eta"><span class="eta-text"></span>' + RING + '</span>' +
      '<span class="buy" aria-hidden="true">Buy</span></span>' +
      '</button>' +
      '<button type="button" class="expand" aria-expanded="false"><span class="expand-icon">' +
      '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5L6 7.5L9 4.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      '</span></button>' +
      '<div class="card">' +
      '<button type="button" class="card-head" aria-expanded="true">' +
      '<span class="card-art"></span>' +
      '<span class="card-title"><span class="card-name"><strong></strong><span class="card-owned"></span></span><span class="card-flavor"></span></span>' +
      '<svg class="chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 7.5L6 4.5L9 7.5" fill="none" stroke="#8A8F98" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      '</button>' +
      '<div class="card-stats">' +
      '<div class="card-stat"><span>Output</span><strong class="c-output"></strong><span class="c-share"></span></div>' +
      '<div class="card-stat"><span>Each</span><strong class="c-each"></strong><span>per apple</span></div>' +
      '<div class="card-stat"><span>Pays back in</span><strong class="c-payback"></strong><span class="c-unit"></span></div>' +
      '</div>' +
      '<div class="card-hint"><span class="c-hint-icon"></span><span class="card-hint-text"></span><span class="card-hint-gain"></span></div>' +
      '<div class="card-buys"><button type="button" class="card-buy c-buy1"></button><button type="button" class="card-buy c-buyn"></button></div>' +
      '</div>';
    els.tiers.append(row);
    const q = (selector) => row.querySelector(selector);
    const view = {
      row,
      main: q('.row-main'),
      art: q('.art'),
      name: q('.row-name'),
      rate: q('.row-rate'),
      tag: q('.tag'),
      bar: q('.bar'),
      barFill: q('.bar-fill'),
      share: q('.row-share'),
      note: q('.row-note'),
      owned: q('.row-owned'),
      price: q('.row-price'),
      etaText: q('.eta-text'),
      ringArc: q('.eta path'),
      expand: q('.expand'),
      cardHead: q('.card-head'),
      cardArt: q('.card-art'),
      cardName: q('.card-name strong'),
      cardOwned: q('.card-owned'),
      cardFlavor: q('.card-flavor'),
      output: q('.c-output'),
      outShare: q('.c-share'),
      each: q('.c-each'),
      payback: q('.c-payback'),
      unit: q('.c-unit'),
      hint: q('.card-hint'),
      hintIcon: q('.c-hint-icon'),
      hintText: q('.card-hint-text'),
      hintGain: q('.card-hint-gain'),
      buy1: q('.c-buy1'),
      buyN: q('.c-buyn'),
      look: '',
    };
    view.name.textContent = tier.name;
    view.cardName.textContent = tier.name;
    view.cardFlavor.textContent = tier.flavor;
    view.expand.setAttribute('aria-label', tier.name + ' details');
    view.main.addEventListener('click', () => buyTier(index, buyAmount));
    view.expand.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleTier(index, e.detail === 0);
    });
    view.cardHead.addEventListener('click', (e) => toggleTier(index, e.detail === 0));
    view.buy1.addEventListener('click', () => buyTier(index, 1, view.buy1));
    view.buyN.addEventListener('click', () => buyTier(index, Number(view.buyN.dataset.qty), view.buyN));
    return view;
  });

  const upgradeViews = UPGRADES_BY_COST.map((upgrade) => {
    const row = document.createElement('div');
    row.className = 'row upgrade';
    row.hidden = true;
    row.innerHTML =
      '<button type="button" class="row-main">' +
      '<span class="tile">' + Art.upgradeIcon(upgrade) + '</span>' +
      '<span class="row-text"><span class="row-name"></span><span class="row-line"><span class="row-effect"></span><span class="row-gain"></span></span></span>' +
      '<span class="row-price"></span>' +
      '<span class="slot"><span class="eta"><span class="eta-text"></span>' + RING + '</span>' +
      '<span class="buy" aria-hidden="true">Buy</span></span>' +
      '</button>';
    const q = (selector) => row.querySelector(selector);
    const tint = Art.iconColor(upgrade);
    if (tint) q('.tile').style.color = tint;
    q('.row-name').textContent = upgrade.name;
    q('.row-effect').textContent = describeEffect(upgrade.effect);
    q('.row-price').textContent = fmt(upgrade.cost);
    const main = q('.row-main');
    main.setAttribute('aria-label', 'Buy ' + upgrade.name + ' for ' + fmt(upgrade.cost) + ' spins. ' + describeEffect(upgrade.effect) + '.');
    main.addEventListener('click', () => buyUpgrade(upgrade.id, main));
    els.upgrades.append(row);
    return { upgrade, row, main, price: q('.row-price'), gain: q('.row-gain'), etaText: q('.eta-text'), ringArc: q('.eta path') };
  });

  function nextTierUpgrade(index) {
    const id = E.TIERS[index].id;
    return UPGRADES_BY_COST.find((u) => u.effect.kind === 'tierMultiplier' && u.effect.tier === id && E.upgradeAvailable(state, u));
  }

  function setUpgradesOpen(open) {
    upgradesOpen = open;
    setAttr(els.upgradesToggle, 'aria-expanded', String(open));
    setHidden(els.upgradesBody, !open);
  }

  function toggleTier(index, fromKeyboard) {
    const closing = openTier === index;
    const previous = openTier;
    openTier = closing ? -1 : index;
    if (previous >= 0) {
      const view = tierViews[previous];
      setClass(view.row, 'is-open', false);
      setAttr(view.expand, 'aria-expanded', 'false');
    }
    if (closing) {
      if (upgradesFoldedForCard) setUpgradesOpen(true);
      upgradesFoldedForCard = false;
      if (fromKeyboard) tierViews[index].expand.focus();
    } else {
      const view = tierViews[index];
      if (upgradesOpen) {
        setUpgradesOpen(false);
        upgradesFoldedForCard = true;
      }
      setClass(view.row, 'is-open', true);
      setAttr(view.expand, 'aria-expanded', 'true');
      if (fromKeyboard) view.cardHead.focus();
      storeDirty = true;
      patchStore(Date.now());
      view.row.scrollIntoView({ block: 'nearest' });
    }
  }

  function buyTier(index, amount, feedbackEl) {
    if (!E.tierUnlocked(state, index)) return;
    const { qty, cost } = E.quoteTier(state, index, amount);
    const next = E.buyTier(state, index, qty);
    if (next === state) {
      if (feedbackEl) flashDenied(feedbackEl);
      return;
    }
    state = next;
    event('Bought ' + qty + ' ' + E.TIERS[index].name, fmt(cost) + ' spins', 2600, 'buy');
    ownedChanged(true);
  }

  function buyUpgrade(id, button) {
    const next = E.buyUpgrade(state, id);
    if (next === state) return;
    state = next;
    storeDirty = true;
    const upgrade = UPGRADES_BY_COST.find((u) => u.id === id);
    event('Bought ' + upgrade.name, describeEffect(upgrade.effect), 3200);
    const hadFocus = document.activeElement === button;
    patchStore(Date.now());
    if (hadFocus) {
      const next = upgradeViews.find((view) => !view.row.hidden && view.row.classList.contains('is-ready'));
      (next ? next.main : els.upgradesToggle).focus({ preventScroll: true });
    }
  }

  function ownedChanged(announce) {
    stage.setCounts(ownedCounts());
    storeDirty = true;
    const iq = E.iq(state);
    const nextIndex = E.rankIndexFor(iq);
    if (announce && nextIndex > rankIndex) {
      event('Rank up: ' + E.RANKS[nextIndex].title, 'IQ ' + iq, 5200);
    }
    rankIndex = nextIndex;
    patchMind();
  }

  function patchMind() {
    const iqExact = E.iqExact(state);
    const iq = Math.round(iqExact);
    const index = E.rankIndexFor(iq);
    const rank = E.RANKS[index];
    const next = E.RANKS[index + 1];
    setText(els.iq, String(iq));
    setText(els.rank, rank.title);
    setText(els.summaryRank, rank.title);
    setText(els.summaryIq, 'IQ ' + iq);
    if (next) {
      setText(els.rankNext, next.iq - iq + ' to ' + next.title);
      const progress = Math.min(1, Math.max(0, (iqExact - rank.iq) / (next.iq - rank.iq)));
      els.rankFill.style.transform = 'scaleX(' + progress.toFixed(3) + ')';
    } else {
      setText(els.rankNext, 'Top rank reached');
      els.rankFill.style.transform = 'scaleX(1)';
    }
    const counts = ownedCounts();
    const total = counts.reduce((a, b) => a + b, 0);
    const shown = stage.visibleCount();
    let caption;
    if (total === 0) caption = 'No apples yet';
    else if (total === 1) caption = '1 apple';
    else if (shown >= total) caption = fmt(total) + ' apples';
    else caption = fmt(total) + ' apples, ' + shown + ' shown';
    setText(els.caption, caption);

    const thumbIds = E.TIERS.map((tier, i) => [tier.id, counts[i]])
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => id);
    setHtml(els.summaryThumb, thumbIds.join(','), Art.headThumbnail(thumbIds));
  }

  function patchSpark(multiplier) {
    const max = Math.max(...spark);
    const min = Math.min(...spark);
    const span = max - min;
    const step = 120 / (SPARK_POINTS - 1);
    const points = spark.map((v, i) => (i * step).toFixed(1) + ',' + (span > 0 ? 22 - ((v - min) / span) * 15 : 14.5).toFixed(1));
    setAttr(els.sparkLine, 'points', points.join(' '));
    const last = points[points.length - 1].split(',');
    setAttr(els.sparkDot, 'cx', last[0]);
    setAttr(els.sparkDot, 'cy', last[1]);
    setText(els.summarySps, rateText(E.spinsPerSecond(state) * multiplier) + '/s');
  }

  function patchStore(now) {
    lastPatch = now;
    storeDirty = false;
    if (els.store.hidden) return;
    const multiplier = E.productionMultiplier(buff, now);
    const sps = E.spinsPerSecond(state);
    const effectiveSps = sps * multiplier;
    patchSpark(multiplier);

    let frontier = E.TIERS.length;
    let unlockedCount = 0;
    for (let i = 0; i < E.TIERS.length; i++) {
      if (E.tierUnlocked(state, i)) unlockedCount++;
      else if (frontier === E.TIERS.length) frontier = i;
    }
    setText(els.tiersCount, unlockedCount + ' of ' + E.TIERS.length + ' unlocked');
    const best = E.bestValueIndex(state);
    let maxShare = 0;
    const shares = E.TIERS.map((tier, i) => {
      const share = sps > 0 ? (state.owned[tier.id] * E.spsEach(state, i)) / sps : 0;
      maxShare = Math.max(maxShare, share);
      return share;
    });

    E.TIERS.forEach((tier, i) => {
      const view = tierViews[i];
      const unlocked = E.tierUnlocked(state, i);
      const visible = unlocked || i === frontier;
      setHidden(view.row, !visible);
      if (!visible) return;
      const owned = state.owned[tier.id];
      const look = !unlocked ? 'locked' : owned > 0 ? 'owned' : 'unowned';
      if (view.look !== look) {
        view.look = look;
        view.art.innerHTML = Art.apple(tier.id, look, 26);
        view.cardArt.innerHTML = Art.apple(tier.id, look, 52);
        setClass(view.row, 'is-locked', !unlocked);
        setHidden(view.expand, !unlocked);
      }
      setClass(view.row, 'is-best', i === best);
      setHidden(view.tag, i !== best);

      if (!unlocked) {
        if (openTier === i) toggleTier(i, false);
        const unlockAt = tier.baseCost / 2;
        setText(view.rate, '');
        setText(view.owned, '');
        setText(view.price, '');
        setHidden(view.bar, false);
        view.barFill.style.background = '#62666D';
        view.barFill.style.width = Math.max(4, Math.min(100, (state.lifetimeSpins / unlockAt) * 100)).toFixed(1) + '%';
        setHidden(view.share, true);
        setHidden(view.note, false);
        setText(view.note, fmt(state.lifetimeSpins) + ' of ' + fmt(unlockAt) + ' lifetime spins');
        setClass(view.row, 'is-affordable', false);
        setClass(view.row, 'is-ready', false);
        setText(view.etaText, '');
        setAttr(view.main, 'aria-disabled', 'true');
        setAttr(view.main, 'aria-label', tier.name + '. Unlocks at ' + fmt(unlockAt) + ' lifetime spins.');
        return;
      }

      const each = E.spsEach(state, i);
      const { qty, cost } = E.quoteTier(state, i, buyAmount);
      const affordable = cost <= state.spins;
      const rate = '+' + rateText(each * multiplier) + '/s';
      setText(view.rate, rate);
      setText(view.owned, fmt(owned));
      setText(view.price, fmt(cost));
      setHidden(view.bar, owned === 0);
      if (owned > 0) {
        view.barFill.style.background = Art.barColor(tier.id);
        view.barFill.style.width = Math.max(4, maxShare > 0 ? (shares[i] / maxShare) * 100 : 0).toFixed(1) + '%';
        setText(view.share, shareText(shares[i]));
      } else {
        setText(view.note, 'Not owned yet');
      }
      setHidden(view.share, owned === 0);
      setHidden(view.note, owned > 0);
      setClass(view.row, 'is-affordable', affordable);
      setClass(view.row, 'is-ready', affordable && i === best);
      setAttr(view.main, 'aria-disabled', String(!affordable));
      setAttr(view.main, 'aria-label', 'Buy ' + qty + ' ' + tier.name + ' for ' + fmt(cost) + ' spins. ' + fmt(owned) + ' owned, ' + rate + ' each.' + (i === best ? ' Best value.' : ''));
      if (!affordable) patchEta(view, cost, effectiveSps);

      if (openTier === i) patchCard(view, i, tier, owned, each, multiplier, shares[i]);
    });

    const upgradesShown = narrowQuery.matches ? 3 : 5;
    let available = 0;
    let ready = 0;
    let firstReady = null;
    let firstAvailable = null;
    for (const view of upgradeViews) {
      const shown = E.upgradeAvailable(state, view.upgrade);
      if (shown) {
        available++;
        firstAvailable = firstAvailable || view.upgrade;
      }
      const affordable = shown && view.upgrade.cost <= state.spins;
      if (affordable) {
        ready++;
        firstReady = firstReady || view.upgrade;
      }
      const visible = shown && (upgradesExpanded || available <= upgradesShown);
      setHidden(view.row, !visible);
      if (!visible) continue;
      setClass(view.row, 'is-affordable', affordable);
      setClass(view.row, 'is-ready', affordable);
      setAttr(view.main, 'aria-disabled', String(!affordable));
      const gain = upgradeGain(view.upgrade);
      setText(view.gain, gain > 0 ? '+' + rateText(gain * multiplier) + '/s' : '');
      if (!affordable) patchEta(view, view.upgrade.cost, effectiveSps);
    }
    setHidden(els.upgradesEmpty, available > 0);
    setText(els.upgradeCount, available ? available + ' available' : '');
    setText(els.upgradesOwned, state.upgrades.length + ' of ' + E.UPGRADES.length + ' owned');
    setText(els.storeReady, ready ? ready + ' ready' : '');
    const summary = firstReady || firstAvailable;
    setHtml(
      els.upgradesReady,
      summary ? summary.id + (firstReady ? ':ready' : '') : '',
      summary ? '<span></span><span class="num"></span>' : '',
    );
    if (summary) {
      setText(els.upgradesReady.children[0], summary.name + (firstReady ? ' ready' : ''));
      setText(els.upgradesReady.children[1], fmt(summary.cost));
    }
    const extra = available - upgradesShown;
    setHidden(els.upgradesMore, extra <= 0);
    if (extra > 0) setText(els.upgradesMore, upgradesExpanded ? 'Show fewer' : 'Show ' + extra + ' more');
  }

  function patchCard(view, index, tier, owned, each, multiplier, share) {
    const unit = E.costOf(tier, owned, 1);
    const most = E.maxAffordable(tier, owned, state.spins);
    setText(view.cardOwned, fmt(owned) + ' owned');
    setText(view.output, rateText(owned * each * multiplier) + '/s');
    setText(view.outShare, shareText(share).replace('of output', 'of all output'));
    setText(view.each, '+' + rateText(each * multiplier) + '/s');
    setText(view.payback, each > 0 ? durationText(unit / (each * multiplier)) : '');
    setText(view.unit, 'at ' + fmt(unit) + ' each');
    const boost = nextTierUpgrade(index);
    setHidden(view.hint, !boost);
    if (boost) {
      setHtml(view.hintIcon, boost.id, Art.upgradeIcon(boost));
      view.hintIcon.style.color = Art.iconColor(boost);
      setText(view.hintText, boost.name + ' doubles this for ' + fmt(boost.cost));
      const gain = upgradeGain(boost);
      setText(view.hintGain, gain > 0 ? '+' + rateText(gain * multiplier) + '/s' : '');
    }
    setHtml(view.buy1, 'b1:' + unit, 'Buy 1 <span>' + fmt(unit) + '</span>');
    setAttr(view.buy1, 'aria-disabled', String(unit > state.spins));
    if (most < 2 && document.activeElement === view.buyN) view.buy1.focus({ preventScroll: true });
    setHidden(view.buyN, most < 2);
    if (most >= 2) {
      view.buyN.dataset.qty = String(most);
      const total = E.costOf(tier, owned, most);
      setHtml(view.buyN, 'bn:' + most + ':' + total, 'Buy ' + fmt(most) + ' <span>' + fmt(total) + '</span>');
    }
  }

  function patchCounters(now) {
    const multiplier = E.productionMultiplier(buff, now);
    setText(els.spins, fmt(state.spins));
    setText(els.sps, rateText(E.spinsPerSecond(state) * multiplier));
    setText(els.perFocus, focusText(E.spinsPerClick(state, multiplier)));
    if (buff.kind === 'frenzy') {
      setText(els.buffTime, Math.ceil(Math.max(0, buff.endsAt - now) / 1000) + ' s left');
    }
    if (els.stats.open) setText(els.saved, lastSaveAt ? 'Saved ' + durationText((now - lastSaveAt) / 1000).replace(/(\d)([smhd])/, '$1 $2') + ' ago' : '');
  }

  function tick(now) {
    const accrued = E.accrue(state, buff, lastTick, now);
    state = accrued.state;
    if (accrued.elapsedMs > 60000 && accrued.earned >= 1) awayEvent(accrued.elapsedMs / 1000, accrued.earned);
    lastTick = now;

    if (buff.kind === 'frenzy' && now >= buff.endsAt) {
      buff = { kind: 'none' };
      stage.setFrenzy(false);
      setHidden(els.buff, true);
    }

    if (now - lastSpark >= SPARK_EVERY_MS) {
      lastSpark = now;
      spark.push(E.spinsPerSecond(state) * E.productionMultiplier(buff, now));
      spark.shift();
      storeDirty = true;
    }

    if (golden.phase === 'waiting' && now >= golden.spawnAt) showGolden(now);
    else if (golden.phase === 'visible' && now >= golden.expiresAt) hideGolden(now);
  }

  /* Golden apple */

  let goldenAnimation = null;
  let goldenPop = null;
  let goldenCss = 120;

  function showGolden(now) {
    golden = { phase: 'visible', expiresAt: now + E.GOLDEN.visibleMs, angle: 0 };
    if (goldenPop) goldenPop.cancel();
    goldenPop = null;
    goldenCss = narrowQuery.matches ? 88 : 120;
    els.golden.style.width = els.golden.style.height = goldenCss + 'px';
    els.golden.setAttribute(
      'aria-label',
      'Golden apple on screen. Pays +' + fmt(E.luckyAmount(state)) + ' spins or ×' + E.GOLDEN.frenzyMultiplier + ' production for ' + E.GOLDEN.frenzyMs / 1000 + ' s.',
    );
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    els.goldenCanvas.width = els.goldenCanvas.height = Math.round(goldenCss * ratio);
    els.golden.hidden = false;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const duration = E.GOLDEN.visibleMs;
    if (reduced) {
      const x = w * (0.15 + Math.random() * 0.5);
      const y = h * (0.2 + Math.random() * 0.45);
      els.golden.style.transform = 'translate(' + x + 'px,' + y + 'px)';
      goldenAnimation = els.golden.animate(
        [{ opacity: 0 }, { opacity: 1, offset: 0.03 }, { opacity: 1, offset: 0.97 }, { opacity: 0 }],
        { duration, fill: 'both' },
      );
    } else {
      els.golden.style.transform = '';
      const y0 = h * (0.2 + Math.random() * 0.45);
      const leftToRight = Math.random() < 0.5;
      const frames = [];
      for (let k = 0; k <= 24; k++) {
        const t = k / 24;
        const x = leftToRight ? -goldenCss + (w + goldenCss) * t : w - (w + goldenCss) * t;
        const y = y0 + Math.sin(t * Math.PI * 3) * h * 0.05;
        frames.push({ transform: 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)', offset: t });
      }
      goldenAnimation = els.golden.animate(frames, { duration, easing: 'linear', fill: 'both' });
    }
  }

  function hideGolden(now) {
    golden = { phase: 'waiting', spawnAt: now + randomGoldenDelay() };
    if (goldenAnimation) goldenAnimation.cancel();
    goldenAnimation = null;
    els.golden.hidden = true;
  }

  function catchGolden() {
    if (golden.phase !== 'visible') return;
    const now = Date.now();
    state = { ...state, goldenClicks: state.goldenClicks + 1 };
    if (Math.random() < 0.5) {
      const amount = E.luckyAmount(state);
      state = E.earn(state, amount);
      event('Golden apple caught', '+' + fmt(amount) + ' spins', 4200);
    } else {
      buff = { kind: 'frenzy', multiplier: E.GOLDEN.frenzyMultiplier, endsAt: now + E.GOLDEN.frenzyMs };
      stage.setFrenzy(true);
      setHidden(els.buff, false);
    }
    storeDirty = true;
    golden = { phase: 'waiting', spawnAt: now + randomGoldenDelay() };
    const moving = goldenAnimation;
    if (moving) moving.pause();
    const pop = (goldenPop = els.golden.animate(
      reduced ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, scale: '1' }, { opacity: 0, scale: '1.3' }],
      { duration: 220, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'forwards' },
    ));
    pop.finished.then(() => {
      if (goldenPop !== pop) return;
      goldenPop = null;
      pop.cancel();
      if (moving) moving.cancel();
      if (goldenAnimation === moving) goldenAnimation = null;
      els.golden.hidden = true;
    }, () => {});
  }

  els.golden.addEventListener('click', catchGolden);

  /* Focus */

  function focusAt(x, y) {
    const now = Date.now();
    const result = E.focus(state, E.productionMultiplier(buff, now));
    state = result.state;
    stage.focus(x, y, '+' + focusText(result.amount));
    storeDirty = true;
  }

  function focusCentered() {
    const center = stage.mindCenterCss();
    focusAt(center.x, center.y);
  }

  els.head.addEventListener('click', (e) => {
    const box = els.canvas.getBoundingClientRect();
    focusAt(e.clientX - box.left, e.clientY - box.top);
  });
  els.focus.addEventListener('click', focusCentered);

  /* Store panel and shortcuts */

  function setStoreOpen(open) {
    if (!open && els.store.contains(document.activeElement)) els.storeToggle.focus({ preventScroll: true });
    setHidden(els.store, !open);
    setAttr(els.storeToggle, 'aria-expanded', String(open));
    storeDirty = true;
  }

  els.storeToggle.addEventListener('click', () => setStoreOpen(els.store.hidden));
  $('store-close').addEventListener('click', () => setStoreOpen(false));

  els.upgradesToggle.addEventListener('click', () => {
    upgradesFoldedForCard = false;
    setUpgradesOpen(!upgradesOpen);
  });

  document.querySelectorAll('[data-amount]').forEach((button) => {
    button.addEventListener('click', () => {
      const value = button.dataset.amount;
      buyAmount = value === 'max' ? 'max' : Number(value);
      document.querySelectorAll('[data-amount]').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
      storeDirty = true;
    });
  });

  els.upgradesMore.addEventListener('click', () => {
    upgradesExpanded = !upgradesExpanded;
    storeDirty = true;
  });

  function openStats() {
    setText($('stat-lifetime'), fmt(state.lifetimeSpins));
    setText($('stat-clicks'), fmt(state.clicks));
    setText($('stat-golden'), fmt(state.goldenClicks));
    setText($('stat-apples'), fmt(ownedCounts().reduce((a, b) => a + b, 0)));
    setText($('stat-upgrades'), state.upgrades.length + ' of ' + E.UPGRADES.length);
    els.stats.showModal();
  }

  $('stats-open').addEventListener('click', openStats);
  for (const dialog of [els.stats, els.reset]) {
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close();
    });
  }
  $('reset-start').addEventListener('click', () => {
    els.stats.close();
    els.reset.showModal();
    $('reset-cancel').focus();
  });
  $('reset-yes').addEventListener('click', () => {
    const now = Date.now();
    state = E.freshState(now);
    buff = { kind: 'none' };
    stage.setFrenzy(false);
    setHidden(els.buff, true);
    hideGolden(now);
    rankIndex = 0;
    lastTick = now;
    spark.fill(0);
    if (openTier >= 0) toggleTier(openTier, false);
    writeSave(now);
    ownedChanged(false);
    els.reset.close();
    event('Progress reset.', '', 3600);
  });

  const TYPING = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
  document.addEventListener('keydown', (e) => {
    if (e.repeat && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      return;
    }
    if (e.defaultPrevented || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (els.stats.open || els.reset.open || TYPING.has(e.target.tagName)) return;
    if (e.key === ' ') {
      if (e.target.closest && e.target.closest('button')) return;
      e.preventDefault();
      focusCentered();
    } else if (e.key === 's' || e.key === 'S') {
      setStoreOpen(els.store.hidden);
    } else if (e.key === 't' || e.key === 'T') {
      openStats();
    } else if (e.key === 'Escape' && !els.store.hidden) {
      setStoreOpen(false);
    }
  });

  reducedQuery.addEventListener('change', (e) => {
    reduced = e.matches;
    stage.setReducedMotion(reduced);
  });

  new ResizeObserver((entries) => {
    const box = entries[0].contentRect;
    stage.resize(box.width, box.height, Math.min(2, window.devicePixelRatio || 1));
    patchMind();
  }).observe(els.head);

  writeSave();
  setInterval(() => writeSave(), AUTOSAVE_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') writeSave();
  });
  window.addEventListener('pagehide', () => writeSave());

  const frameTimes = [];
  let lastPerf = performance.now();

  function loop(perfNow) {
    const started = performance.now();
    const dt = Math.min(0.1, Math.max(0, (perfNow - lastPerf) / 1000));
    lastPerf = perfNow;
    const now = Date.now();
    tick(now);
    patchCounters(now);
    if (storeDirty || now - lastPatch > 100) patchStore(now);
    stage.frame(perfNow / 1000, dt);
    if (golden.phase === 'visible') {
      golden.angle += dt * Math.PI * 2 * (reduced ? 0.25 : 0.7);
      const ratio = els.goldenCanvas.width / goldenCss;
      const S = Math.ceil(((goldenCss * ratio * 0.62) / 0.68) / 16) * 16;
      R.drawGolden(els.goldenCanvas.getContext('2d'), stage.bank, GILDED, S, golden.angle, goldenCss, ratio, perfNow / 1000, reduced);
    }
    if (debug) {
      frameTimes.push({ dt, work: performance.now() - started });
      if (frameTimes.length > 240) frameTimes.shift();
    }
    requestAnimationFrame(loop);
  }

  stage.setCounts(ownedCounts());
  setStoreOpen(wideQuery.matches);
  patchMind();
  patchStore(Date.now());
  if (offline.elapsedSeconds >= 60 && offline.earned >= 1) awayEvent(offline.elapsedSeconds, offline.earned);
  requestAnimationFrame(loop);

  if (debug) {
    const panel = $('debug');
    panel.hidden = false;
    const grant = (perTier) => {
      const owned = { ...state.owned };
      for (const tier of E.TIERS) owned[tier.id] += perTier;
      state = { ...state, owned };
      ownedChanged(true);
    };
    const actions = {
      spins6: () => (state = E.earn(state, 1e6)),
      spins15: () => (state = E.earn(state, 1e15)),
      golden: () => {
        if (golden.phase === 'waiting') golden = { phase: 'waiting', spawnAt: 0 };
      },
      grant: () => grant(25),
      away: () => {
        writeSave(Date.now() - 2 * 3600 * 1000);
        skipSaves = true;
        location.reload();
      },
    };
    panel.addEventListener('click', (e) => {
      const action = e.target.closest('[data-debug]');
      if (action) {
        actions[action.dataset.debug]();
        storeDirty = true;
      }
    });
    window.__apples = {
      state: () => state,
      golden: () => golden,
      buff: () => buff,
      forceGolden: actions.golden,
      catchGolden,
      grant,
      setOwned: (owned) => {
        state = { ...state, owned: { ...E.freshState(0).owned, ...owned } };
        ownedChanged(false);
      },
      specimen: (size, angles, indices) => {
        const canvas = document.createElement('canvas');
        canvas.width = size * angles.length;
        canvas.height = size * indices.length;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#08090A';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const cell = document.createElement('canvas');
        cell.width = cell.height = size;
        indices.forEach((i, row) => {
          angles.forEach((angle, k) => {
            stage.bank.thumbnail(cell, i, false, angle);
            ctx.drawImage(cell, k * size, row * size);
          });
        });
        return canvas.toDataURL();
      },
      addSpins: (n) => (state = E.earn(state, n)),
      frameStats: () => {
        const sorted = frameTimes.map((f) => f.work).sort((a, b) => a - b);
        const dts = frameTimes.map((f) => f.dt);
        return {
          frames: frameTimes.length,
          meanFrameMs: (dts.reduce((a, b) => a + b, 0) / Math.max(1, dts.length)) * 1000,
          workP50: sorted[Math.floor(sorted.length * 0.5)] || 0,
          workP95: sorted[Math.floor(sorted.length * 0.95)] || 0,
          bakeQueue: stage.bank.pending(),
        };
      },
    };
  }
})();
