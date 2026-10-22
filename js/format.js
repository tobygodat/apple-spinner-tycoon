(function (root) {
  'use strict';

  const SUFFIXES = ['M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

  function floorTo(value, places) {
    const scale = Math.pow(10, places);
    return Math.floor(value * scale + 1e-9) / scale;
  }

  function formatNumber(value, decimals) {
    if (!Number.isFinite(value)) return value > 0 ? '∞' : '0';
    if (value < 0) return '-' + formatNumber(-value, decimals);
    const places = decimals || 0;
    if (value < 1e6) return floorTo(value, places).toLocaleString('en-US', { maximumFractionDigits: places });
    const group = Math.floor(Math.log10(value) / 3);
    if (group - 2 >= SUFFIXES.length) return value.toExponential(2);
    return floorTo(value / Math.pow(1000, group), 2).toFixed(2) + ' ' + SUFFIXES[group - 2];
  }

  const Format = { formatNumber };

  if (typeof module === 'object' && module.exports) module.exports = Format;
  else root.Format = Format;
})(typeof globalThis !== 'undefined' ? globalThis : this);
