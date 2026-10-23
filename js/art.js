(function (root) {
  'use strict';

  const BODY = 'M0 -5.2C-3 -7.6 -8.6 -6.9 -8.6 -0.6C-8.6 4.8 -5 9.4 -2.6 9.4C-1.5 9.4 -1 8.8 0 8.8C1 8.8 1.5 9.4 2.6 9.4C5 9.4 8.6 4.8 8.6 -0.6C8.6 -6.9 3 -7.6 0 -5.2Z';
  const STEM = 'M0 -5.2C0 -7.4 0.8 -9.2 2.2 -10.4';
  const SHADE = 'M8.6 -0.6C8.6 4.8 5 9.4 2.6 9.4C1.5 9.4 1 8.8 0 8.8C3.6 7.6 6.6 4 7.2 -1.8C7.5 -4 7 -5.6 6 -6.4C7.8 -5.6 8.6 -3.4 8.6 -0.6Z';
  const STEM_COLOR = '#7D6A57';

  const shine = (color) => `<path d="M-5 -2.5C-5.6 -0.5 -5.4 1.8 -4.3 3.6" fill="none" stroke="${color}" stroke-width="0.9" stroke-linecap="round"/>`;
  const dots = (color, points) => points.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}"/>`).join('');

  // Colors are the APPL-8 c2 palette. The last four varieties are not in the palette; their tones are
  // picked to stay off purple and sit beside the palette's brass and chrome.
  const VARIETIES = {
    redDelicious: { body: '#8E3239', shade: '#7B2C32', bar: '#9E3A42', marks: shine('#B0606A') },
    grannySmith: { body: '#7FA35E', shade: '#6E8D52', marks: shine('#B4CF92') },
    gala: {
      body: '#C98B40',
      shade: '#AE7938',
      marks: '<path d="M-5.4 -2.6L-5.6 1.4M-3 -3.9L-3.3 3.6M-0.6 -4L-0.5 0.8M1.8 -3.4L2.2 4.8M4.6 -2.2L4.9 1.6M-1.4 3.4L-1.2 6.6" fill="none" stroke="#B0603A" stroke-width="0.7" stroke-linecap="round"/>',
    },
    fuji: {
      body: '#D39A86',
      shade: '#B78675',
      marks: dots('#F4E0CC', [[-3.5, -1, 0.6], [2, -2.5, 0.6], [-1, 3, 0.6], [4, 2, 0.6], [0.5, 0, 0.6]]),
    },
    honeycrisp: {
      body: '#B35A3E',
      shade: '#9B4F37',
      marks: '<path d="M-1 -4.6C-4.5 -3.8 -6.5 -0.5 -5.6 3.5C-5.2 5.5 -4.2 7.2 -3 8.4L-2.6 9.4C-5 9.4 -8.6 4.8 -8.6 -0.6C-8.6 -6.9 -3 -7.6 0 -5.2Z" fill="#D3A256"/>',
    },
    pinkLady: {
      body: '#CF7A93',
      shade: '#B5617B',
      icon: '#D995A9',
      marks: dots('#B25A76', [[3.2, 1.5, 3]]),
      large:
        '<path d="M-5.2 -3.4C-5.9 -1.8 -5.8 0 -5.1 1.4" fill="none" stroke="#EBBBC8" stroke-width="0.8" stroke-linecap="round"/>' +
        dots('#EFC9D4', [[-1.5, -2.5, 0.32], [1.6, 4.2, 0.32], [4.6, -1.6, 0.32], [-3.4, 4.4, 0.32]]),
    },
    cosmicCrisp: {
      body: '#4E1F2E',
      shade: '#441C29',
      bar: '#8A3A52',
      icon: '#915668',
      stem: '#6B5A4D',
      marks: dots('#E9D6DC', [[-3.5, -1.5, 0.55], [2.5, -3, 0.45], [0, 2.5, 0.6], [4.5, 1.5, 0.4], [-2, 5.5, 0.4]]),
    },
    gilded: {
      body: '#C9A554',
      shade: '#AE8F4A',
      outline: '#B39550',
      marks: '<path d="M-3.4 -1.4L-2.6 -0.6M2 3.8L3.2 3" fill="none" stroke="#7F6C3E" stroke-width="0.8" stroke-linecap="round"/>',
    },
    chrome: { body: '#AEB6BF', shade: '#979EA6', marks: shine('#F7F8F8') },
    holographic: {
      body: '#9EC3C4',
      shade: '#88A9AA',
      marks: '<path d="M-6.5 1.5L1.5 -5.5M-4.5 5.5L5.5 -3.5" fill="none" stroke="#D995A9" stroke-width="0.9" stroke-linecap="round"/><path d="M-5.6 3.6L3.6 -4.6" fill="none" stroke="#D3A256" stroke-width="0.9" stroke-linecap="round"/>',
    },
    crystal: {
      body: '#BFD9E0',
      shade: '#A4BCC2',
      marks: '<path d="M0 -5.2L-3.6 1.8L0 8.8L3.6 1.8Z M-8.6 -0.6L-3.6 1.8M8.6 -0.6L3.6 1.8" fill="none" stroke="#7E9AA3" stroke-width="0.7" stroke-linejoin="round"/>',
    },
    nebula: {
      body: '#1E2A3A',
      shade: '#1A2433',
      marks:
        '<path d="M-4.6 2.4C-2.8 -1.6 2.8 -1.2 4.4 -3.8M-3.2 5.2C0 3 3.6 4.2 5.6 1.4" fill="none" stroke="#3E6A7A" stroke-width="0.9" stroke-linecap="round"/>' +
        dots('#E9D6DC', [[-3, -2.6, 0.45], [2.4, 1.2, 0.5], [0.2, 6.2, 0.35], [5, -1.6, 0.35]]),
    },
    platonic: {
      body: '#E8E2D0',
      shade: '#CDC8B8',
      marks: '<path d="M0 -5.2V8.8M-8.6 -0.6C-4 1.4 4 1.4 8.6 -0.6" fill="none" stroke="#C9A554" stroke-width="0.7" stroke-linecap="round"/>',
    },
  };

  function svg(size, inner) {
    const height = Math.round((size * 23) / 22);
    return `<svg width="${size}" height="${height}" viewBox="-11 -12 22 23" aria-hidden="true">${inner}</svg>`;
  }

  // view: 'owned' (full color), 'unowned' (unlocked, not owned: outline), 'locked' (dashed grey with a lock)
  function apple(id, view, size) {
    const v = VARIETIES[id];
    if (view === 'locked') {
      return svg(
        size,
        `<path d="${BODY}" fill="none" stroke="#3A3B40" stroke-width="1.1" stroke-dasharray="2 1.6"/>` +
          '<rect x="-2.6" y="0" width="5.2" height="4.2" rx="0.8" fill="none" stroke="#62666D" stroke-width="0.9"/>' +
          '<path d="M-1.5 0V-1.3A1.5 1.5 0 0 1 1.5 -1.3V0" fill="none" stroke="#62666D" stroke-width="0.9"/>' +
          `<path d="${STEM}" fill="none" stroke="#3A3B40" stroke-width="1.1" stroke-linecap="round"/>`,
      );
    }
    if (view === 'unowned') {
      const line = v.outline || v.body;
      return svg(
        size,
        `<path d="${BODY}" fill="none" stroke="${line}" stroke-width="1.1" stroke-linejoin="round"/>` +
          (v.outline ? v.marks : '') +
          `<path d="${STEM}" fill="none" stroke="${line}" stroke-width="1.1" stroke-linecap="round"/>`,
      );
    }
    const large = size > 40;
    return svg(
      size,
      `<path d="${BODY}" fill="${v.body}"/>` +
        (large ? `<path d="${SHADE}" fill="${v.shade}"/>` : '') +
        v.marks +
        (large && v.large ? v.large : '') +
        `<path d="${STEM}" fill="none" stroke="${v.stem || STEM_COLOR}" stroke-width="${large ? 0.9 : 1.1}" stroke-linecap="round"/>`,
    );
  }

  const ICON_PATHS = {
    'tier.x1':
      '<path d="M8 2.5C8 2.5 3.8 7.2 3.8 10A4.2 4.2 0 0 0 12.2 10C12.2 7.2 8 2.5 8 2.5Z"/><path d="M6.3 10.4A1.8 1.8 0 0 0 8 12"/>',
    'tier.x5': '<path d="M8 14V6"/><path d="M8 7C8 4.5 9.8 2.8 12.5 2.5C12.4 5.2 10.6 7 8 7Z"/><path d="M4 14h8"/>',
    'tier.x25': '<circle cx="8" cy="8" r="5.5"/><ellipse cx="8" cy="8" rx="5.5" ry="2.2" transform="rotate(-30 8 8)"/>',
    'tier.x50': '<circle cx="8" cy="6.5" r="4"/><path d="M8 10.5V14"/><path d="M4.5 14h7"/>',
    'tier.x100': '<path d="M8 8C6.4 6 3.2 6 3.2 8S6.4 10 8 8S11.2 6 12.8 8S9.6 10 8 8Z"/>',
    globalMultiplier: '<path d="M2.5 12.5L6.5 8.5L9 11L13.5 4.5"/><path d="M10 4.5H13.5V8"/>',
    clickMultiplier: '<path d="M2 7C3.8 9.6 5.8 10.8 8 10.8S12.2 9.6 14 7"/><path d="M8 10.8V13M4.6 9.8L3.6 11.4M11.4 9.8L12.4 11.4"/>',
    clickSpsPercent:
      '<path d="M1.8 8C3.3 5.2 5.5 3.8 8 3.8S12.7 5.2 14.2 8C12.7 10.8 10.5 12.2 8 12.2S3.3 10.8 1.8 8Z"/><circle cx="8" cy="8" r="2"/>',
  };

  function upgradeIcon(upgrade) {
    const effect = upgrade.effect;
    const key = effect.kind === 'tierMultiplier' ? 'tier.' + upgrade.id.split('.')[1] : effect.kind;
    return (
      '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      ICON_PATHS[key] +
      '</svg>'
    );
  }

  function iconColor(upgrade) {
    if (upgrade.effect.kind !== 'tierMultiplier') return null;
    const v = VARIETIES[upgrade.effect.tier];
    return v.icon || v.bar || v.body;
  }

  const barColor = (id) => VARIETIES[id].bar || VARIETIES[id].body;
  const bodyColor = (id) => VARIETIES[id].body;

  const HEAD_PATH =
    'M84 352C84 318 80 296 70 276C46 236 38 188 50 140C66 74 122 30 190 30C258 30 304 76 310 140C312 158 308 168 312 180C316 192 334 214 336 224C337 231 328 233 320 235C322 243 324 250 319 256C323 262 321 270 314 274C310 290 296 296 274 296C256 296 250 312 250 352';

  const THUMB_SPOTS = [[130, 120, 14], [200, 96, 12], [240, 160, 16], [150, 190, 13], [215, 215, 11]];

  function headThumbnail(ids) {
    return (
      '<svg width="40" height="42" viewBox="20 10 340 350" aria-hidden="true">' +
      `<path d="${HEAD_PATH}" fill="none" stroke="#8A8F98" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>` +
      '<ellipse cx="190" cy="150" rx="128" ry="34" transform="rotate(-14 190 150)" fill="none" stroke="#3A3B40" stroke-width="8"/>' +
      ids
        .slice(0, THUMB_SPOTS.length)
        .map((id, k) => `<circle cx="${THUMB_SPOTS[k][0]}" cy="${THUMB_SPOTS[k][1]}" r="${THUMB_SPOTS[k][2]}" fill="${bodyColor(id)}"/>`)
        .join('') +
      '</svg>'
    );
  }

  const Art = { apple, upgradeIcon, iconColor, barColor, bodyColor, headThumbnail, HEAD_PATH };

  if (typeof module === 'object' && module.exports) module.exports = Art;
  else root.Art = Art;
})(typeof globalThis !== 'undefined' ? globalThis : this);
