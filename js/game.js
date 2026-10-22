(function () {
  'use strict';

  const E = window.Economy;
  const R = window.Render;
  const fmt = window.Format.formatNumber;

  const SAVE_KEY = 'spinning-apples.save';
  const AUTOSAVE_MS = 10000;
  const narrowQuery = window.matchMedia('(max-width: 820px)');
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
    rankFill: $('rank-fill'),
    rankNext: $('rank-next'),
    buff: $('buff'),
    buffTime: $('buff-time'),
    buffFill: $('buff-fill'),
    head: $('head'),
    canvas: $('head-canvas'),
    figure: $('apple-count'),
    tiers: $('tiers'),
    upgrades: $('upgrades'),
    upgradesEmpty: $('upgrades-empty'),
    upgradesMore: $('upgrades-more'),
    upgradeCount: $('upgrade-count'),
    golden: $('golden'),
    goldenCanvas: $('golden-canvas'),
    toasts: $('toasts'),
    settings: $('settings'),
  };

  const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = reducedQuery.matches;

  function readSave() {
    try {
      return window.localStorage.getItem(SAVE_KEY);
    } catch {
      return null;
    }
  }

  let skipSaves = false;
  function writeSave(savedAt) {
    if (skipSaves) return;
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({ ...state, lastSavedAt: savedAt ?? Date.now() }));
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
  let rankIndex = E.rankIndexFor(E.iq(state));
  let lastTick = bootedAt;
  let lastPatch = 0;
  let storeDirty = true;

  const stage = R.createStage(els.canvas, E.TIERS);
  stage.setReducedMotion(reduced);

  function ownedCounts() {
    return E.TIERS.map((tier) => state.owned[tier.id]);
  }

  function focusText(amount) {
    return fmt(amount, amount < 1000 ? 1 : 0);
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

  function toast(title, body, ms) {
    const el = document.createElement('div');
    el.className = 'toast';
    const t = document.createElement('p');
    t.className = 'toast-title';
    t.textContent = title;
    const b = document.createElement('p');
    b.className = 'toast-body';
    b.textContent = body;
    el.append(t, b);
    els.toasts.prepend(el);
    requestAnimationFrame(() => requestAnimationFrame(() => (el.dataset.state = 'open')));
    setTimeout(() => closeToast(el), ms || 4200);
    const open = els.toasts.querySelectorAll('.toast:not([data-state="closing"])');
    for (let k = 3; k < open.length; k++) closeToast(open[k]);
  }

  function closeToast(el) {
    if (el.dataset.state === 'closing') return;
    el.dataset.state = 'closing';
    el.addEventListener('transitionend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 400);
  }

  function describeEffect(effect) {
    switch (effect.kind) {
      case 'tierMultiplier':
        return TIER_BY_ID[effect.tier].name + ' spin ×' + effect.factor;
      case 'globalMultiplier':
        return 'All apples spin ×' + effect.factor;
      case 'clickMultiplier':
        return 'Focus ×' + effect.factor;
      case 'clickSpsPercent':
        return 'Focus +' + effect.percent + '% of spins/sec';
    }
    throw new Error('Unknown effect kind: ' + effect.kind);
  }

  const ICONS = {
    clickMultiplier:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12c2.4-3.6 5.4-5.4 9-5.4s6.6 1.8 9 5.4c-2.4 3.6-5.4 5.4-9 5.4S5.4 15.6 3 12Z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/></svg>',
    clickSpsPercent:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13c2.2 2.6 4.9 3.9 8 3.9s5.8-1.3 8-3.9M12 4v3M5.5 6.5l2 2M18.5 6.5l-2 2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="12" cy="12.6" r="2.2" fill="currentColor"/></svg>',
    globalMultiplier:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12c0-1.1.9-2 2-2s2 .9 2 2.4c0 2.2-1.8 4-4 4s-4.5-1.8-4.5-4.5S9.7 7 12.5 7 18 9.3 18 12.6 15.3 19 12 19s-7.5-2.9-7.5-7S7.9 4.5 12 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  };

  const thumbRatio = Math.min(2, window.devicePixelRatio || 1);

  const tierViews = E.TIERS.map((tier, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tier';
    button.innerHTML =
      '<canvas class="tier-thumb" aria-hidden="true"></canvas>' +
      '<span class="tier-main"><span class="tier-name"></span><span class="tier-flavor"></span>' +
      '<span class="tier-meta"><span class="tier-cost"></span><span class="tier-qty"></span><span class="tier-rate"></span></span></span>' +
      '<span class="tier-owned" aria-hidden="true"></span>';
    const thumb = button.querySelector('.tier-thumb');
    thumb.width = thumb.height = Math.round(52 * thumbRatio);
    button.addEventListener('click', () => buyTier(index));
    els.tiers.append(button);
    return {
      button,
      thumb,
      name: button.querySelector('.tier-name'),
      flavor: button.querySelector('.tier-flavor'),
      cost: button.querySelector('.tier-cost'),
      qty: button.querySelector('.tier-qty'),
      rate: button.querySelector('.tier-rate'),
      owned: button.querySelector('.tier-owned'),
      locked: null,
      affordable: null,
      label: '',
    };
  });

  const upgradeViews = UPGRADES_BY_COST.map((upgrade) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'upgrade';
    button.hidden = true;
    const icon = upgrade.effect.kind === 'tierMultiplier' ? '<canvas aria-hidden="true"></canvas>' : ICONS[upgrade.effect.kind];
    button.innerHTML =
      '<span class="upgrade-icon" data-kind="' + upgrade.effect.kind + '">' + icon + '</span>' +
      '<span class="upgrade-main"><span class="upgrade-name"></span><span class="upgrade-effect"></span><span class="upgrade-flavor"></span></span>' +
      '<span class="upgrade-cost"></span>';
    button.querySelector('.upgrade-name').textContent = upgrade.name;
    button.querySelector('.upgrade-effect').textContent = describeEffect(upgrade.effect);
    button.querySelector('.upgrade-flavor').textContent = upgrade.flavor;
    button.querySelector('.upgrade-cost').textContent = fmt(upgrade.cost);
    button.setAttribute('aria-label', upgrade.name + '. ' + describeEffect(upgrade.effect) + '. Costs ' + fmt(upgrade.cost) + ' spins.');
    button.addEventListener('click', () => buyUpgrade(upgrade.id, button));
    els.upgrades.append(button);
    return { upgrade, button, canvas: button.querySelector('canvas'), drawn: false, affordable: null };
  });

  function flashDenied(el) {
    el.animate([{ color: '#ff9b9b' }, { color: 'currentColor' }], { duration: 320, easing: 'ease-out' });
  }

  function buyTier(index) {
    if (!E.tierUnlocked(state, index)) return;
    const tier = E.TIERS[index];
    const owned = state.owned[tier.id];
    const qty = buyAmount === 'max' ? E.maxAffordable(tier, owned, state.spins) : buyAmount;
    const next = E.buyTier(state, index, qty);
    if (next === state) {
      flashDenied(tierViews[index].cost);
      return;
    }
    state = next;
    ownedChanged(true);
  }

  function buyUpgrade(id, button) {
    const next = E.buyUpgrade(state, id);
    if (next === state) {
      flashDenied(button.querySelector('.upgrade-cost'));
      return;
    }
    state = next;
    storeDirty = true;
    const upgrade = UPGRADES_BY_COST.find((u) => u.id === id);
    toast('Enhancement installed', upgrade.name + '. ' + describeEffect(upgrade.effect) + '.', 3200);
    const hadFocus = document.activeElement === button;
    patchStore(Date.now());
    if (hadFocus) {
      const next = upgradeViews.find((view) => !view.button.hidden);
      (next ? next.button : els.head).focus({ preventScroll: true });
    }
  }

  function ownedChanged(announce) {
    stage.setCounts(ownedCounts());
    storeDirty = true;
    const iq = E.iq(state);
    const nextIndex = E.rankIndexFor(iq);
    if (announce && nextIndex > rankIndex) {
      const rank = E.RANKS[nextIndex];
      toast('New rank · IQ ' + iq, rank.title + '. ' + rank.blurb, 5200);
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
    if (next) {
      setText(els.rankNext, 'Next: ' + next.title + ' at IQ ' + next.iq);
      const progress = Math.min(1, Math.max(0, (iqExact - rank.iq) / (next.iq - rank.iq)));
      els.rankFill.style.transform = 'scaleX(' + progress.toFixed(3) + ')';
    } else {
      setText(els.rankNext, 'You have reached the Ideal Form.');
      els.rankFill.style.transform = 'scaleX(1)';
    }
    const total = ownedCounts().reduce((a, b) => a + b, 0);
    const shown = stage.visibleCount();
    let caption;
    if (total === 0) caption = 'Fig. 1. Subject, imagining nothing. Click the head to focus.';
    else if (total === 1) caption = 'Fig. 1. Subject, imagining 1 apple.';
    else if (shown >= total) caption = 'Fig. 1. Subject, imagining ' + fmt(total) + ' apples.';
    else caption = 'Fig. 1. Subject, imagining ' + fmt(total) + ' apples. ' + shown + ' pictured; the rest spin too fast to see.';
    setText(els.figure, caption);
  }

  function patchStore(now) {
    lastPatch = now;
    storeDirty = false;
    let frontier = E.TIERS.length;
    for (let i = 0; i < E.TIERS.length; i++) {
      if (!E.tierUnlocked(state, i)) {
        frontier = i;
        break;
      }
    }
    E.TIERS.forEach((tier, i) => {
      const view = tierViews[i];
      const unlocked = E.tierUnlocked(state, i);
      setHidden(view.button, !unlocked && i !== frontier);
      if (!unlocked && i !== frontier) return;
      const locked = !unlocked;
      if (view.locked !== locked) {
        view.locked = locked;
        view.button.classList.toggle('is-locked', locked);
        setText(view.name, locked ? '???' : tier.name);
        setText(view.flavor, locked ? 'Spin ' + fmt(tier.baseCost / 2) + ' times in total to picture this one.' : tier.flavor);
        stage.bank.later(() => stage.bank.thumbnail(view.thumb, i, locked));
      }
      const owned = state.owned[tier.id];
      const qty = buyAmount === 'max' ? Math.max(1, E.maxAffordable(tier, owned, state.spins)) : buyAmount;
      const cost = E.costOf(tier, owned, qty);
      const affordable = !locked && cost <= state.spins;
      if (view.affordable !== affordable) {
        view.affordable = affordable;
        view.button.classList.toggle('is-affordable', affordable);
        view.button.setAttribute('aria-disabled', String(!affordable));
      }
      setText(view.cost, fmt(cost));
      setText(view.qty, qty > 1 ? '×' + qty : '');
      setText(view.rate, locked ? '' : fmt(E.spsEach(state, i) * E.productionMultiplier(buff, now), 1) + '/s each');
      setText(view.owned, locked ? '' : fmt(owned));
      const label = locked
        ? 'Locked variety. Spin ' + fmt(tier.baseCost / 2) + ' times in total to reveal it.'
        : 'Buy ' + qty + ' ' + tier.name + ' for ' + fmt(cost) + ' spins. You own ' + fmt(owned) + '.';
      if (view.label !== label) {
        view.label = label;
        view.button.setAttribute('aria-label', label);
      }
    });

    const upgradesShown = narrowQuery.matches ? 3 : 5;
    let available = 0;
    for (const view of upgradeViews) {
      const shown = E.upgradeAvailable(state, view.upgrade);
      if (shown) available++;
      const visible = shown && (upgradesExpanded || available <= upgradesShown);
      setHidden(view.button, !visible);
      if (!visible) continue;
      if (!view.drawn && view.canvas) {
        view.drawn = true;
        view.canvas.width = view.canvas.height = Math.round(36 * thumbRatio);
        const index = E.TIERS.findIndex((t) => t.id === view.upgrade.effect.tier);
        stage.bank.later(() => stage.bank.thumbnail(view.canvas, index, false));
      }
      const affordable = view.upgrade.cost <= state.spins;
      if (view.affordable !== affordable) {
        view.affordable = affordable;
        view.button.classList.toggle('is-affordable', affordable);
        view.button.setAttribute('aria-disabled', String(!affordable));
      }
    }
    setHidden(els.upgradesEmpty, available > 0);
    setText(els.upgradeCount, available ? available + ' available' : '');
    const extra = available - upgradesShown;
    setHidden(els.upgradesMore, extra <= 0);
    if (extra > 0) setText(els.upgradesMore, upgradesExpanded ? 'Show fewer' : 'Show ' + extra + ' more');
  }

  function patchCounters(now) {
    const multiplier = E.productionMultiplier(buff, now);
    setText(els.spins, fmt(state.spins));
    setText(els.sps, fmt(E.spinsPerSecond(state) * multiplier, 1));
    setText(els.perFocus, '+' + focusText(E.spinsPerClick(state, multiplier)));
    if (buff.kind === 'frenzy') {
      const left = Math.max(0, buff.endsAt - now);
      setText(els.buffTime, Math.ceil(left / 1000) + 's');
      els.buffFill.style.transform = 'scaleX(' + (left / E.GOLDEN.frenzyMs).toFixed(4) + ')';
    }
  }

  function tick(now) {
    const accrued = E.accrue(state, buff, lastTick, now);
    state = accrued.state;
    if (accrued.elapsedMs > 60000 && accrued.earned >= 1) {
      toast('Welcome back', 'While you were away, your apples spun ' + fmt(accrued.earned) + ' times.', 7000);
    }
    lastTick = now;

    if (buff.kind === 'frenzy' && now >= buff.endsAt) {
      buff = { kind: 'none' };
      stage.setFrenzy(false);
      setHidden(els.buff, true);
    }

    if (golden.phase === 'waiting' && now >= golden.spawnAt) showGolden(now);
    else if (golden.phase === 'visible' && now >= golden.expiresAt) hideGolden(now);
  }

  let goldenAnimation = null;
  let goldenPop = null;
  let goldenCss = 120;

  function showGolden(now) {
    golden = { phase: 'visible', expiresAt: now + E.GOLDEN.visibleMs, angle: 0 };
    if (goldenPop) goldenPop.cancel();
    goldenPop = null;
    goldenCss = narrowQuery.matches ? 88 : 120;
    els.golden.style.width = els.golden.style.height = goldenCss + 'px';
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
      toast('Lucky!', 'The golden apple was worth ' + fmt(amount) + ' spins.', 4200);
    } else {
      buff = { kind: 'frenzy', multiplier: E.GOLDEN.frenzyMultiplier, endsAt: now + E.GOLDEN.frenzyMs };
      stage.setFrenzy(true);
      setHidden(els.buff, false);
      toast('Frenzy!', 'Production ×' + E.GOLDEN.frenzyMultiplier + ' for ' + E.GOLDEN.frenzyMs / 1000 + ' seconds.', 4200);
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

  els.head.addEventListener('click', (event) => {
    const now = Date.now();
    const result = E.focus(state, E.productionMultiplier(buff, now));
    state = result.state;
    let x;
    let y;
    if (event.detail === 0 || event.target !== els.canvas) {
      const center = stage.mindCenterCss();
      x = center.x;
      y = center.y;
    } else {
      x = event.offsetX;
      y = event.offsetY;
    }
    stage.focus(x, y, '+' + focusText(result.amount));
    storeDirty = true;
  });

  els.head.addEventListener('keydown', (event) => {
    if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
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

  const resetStart = $('reset-start');
  const resetConfirm = $('reset-confirm');

  function showResetConfirm(show) {
    setHidden(resetConfirm, !show);
    setHidden(resetStart, show);
    if (show) $('reset-cancel').focus();
  }

  $('settings-open').addEventListener('click', () => {
    setText($('stat-lifetime'), fmt(state.lifetimeSpins));
    setText($('stat-clicks'), fmt(state.clicks));
    setText($('stat-golden'), fmt(state.goldenClicks));
    setText($('stat-apples'), fmt(ownedCounts().reduce((a, b) => a + b, 0)));
    setText($('stat-upgrades'), state.upgrades.length + ' of ' + E.UPGRADES.length);
    showResetConfirm(false);
    els.settings.showModal();
  });
  els.settings.addEventListener('close', () => showResetConfirm(false));
  els.settings.addEventListener('click', (event) => {
    if (event.target === els.settings) els.settings.close();
  });
  resetStart.addEventListener('click', () => showResetConfirm(true));
  $('reset-cancel').addEventListener('click', () => {
    showResetConfirm(false);
    resetStart.focus();
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
    writeSave(now);
    ownedChanged(false);
    els.settings.close();
    toast('Mind cleared', 'Zero apples. Peaceful, honestly.', 3600);
  });

  reducedQuery.addEventListener('change', (event) => {
    reduced = event.matches;
    stage.setReducedMotion(reduced);
  });

  new ResizeObserver((entries) => {
    const box = entries[0].contentRect;
    stage.resize(box.width, box.height, Math.min(2, window.devicePixelRatio || 1));
    patchMind();
  }).observe(els.head);

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
  patchMind();
  patchStore(Date.now());
  if (offline.earned >= 1) {
    toast('Welcome back', 'While you were away, your apples spun ' + fmt(offline.earned) + ' times.', 7000);
  }
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
    panel.addEventListener('click', (event) => {
      const action = event.target.closest('[data-debug]');
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
        ctx.fillStyle = '#151132';
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
