(function (root) {
  'use strict';

  const TAU = Math.PI * 2;
  const FRAMES = 32;
  const SHEET_COLS = 8;
  const BODY = 0.34;
  const BODY_CY = 0.57;
  const TEX_W = 256;
  const TEX_H = 128;
  const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
  const BAKE_ORDER = [0, 16, 8, 24, 4, 20, 12, 28, 2, 18, 10, 26, 6, 22, 14, 30, 1, 17, 9, 25, 5, 21, 13, 29, 3, 19, 11, 27, 7, 23, 15, 31];

  function pickVisibleApples(counts, cap) {
    const total = counts.reduce((a, b) => a + b, 0);
    if (total <= cap) return counts.slice();
    const picked = counts.map(() => 0);
    let left = cap;
    for (let i = counts.length - 1; i >= 0 && left > 0; i--) {
      if (counts[i] > 0) {
        picked[i] = 1;
        left--;
      }
    }
    while (left > 0) {
      let best = -1;
      let bestQuotient = -1;
      for (let i = 0; i < counts.length; i++) {
        if (picked[i] >= counts[i]) continue;
        const quotient = (counts[i] * (i + 1)) / (picked[i] + 1);
        if (quotient > bestQuotient) {
          bestQuotient = quotient;
          best = i;
        }
      }
      if (best < 0) break;
      picked[best]++;
      left--;
    }
    return picked;
  }

  const PERM = (() => {
    const base = Array.from({ length: 256 }, (_, i) => i);
    let seed = 1337;
    for (let i = 255; i > 0; i--) {
      seed = (seed * 16807) % 2147483647;
      const j = seed % (i + 1);
      [base[i], base[j]] = [base[j], base[i]];
    }
    const perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) perm[i] = base[i & 255];
    return perm;
  })();

  function fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function grad(h, x, y, z) {
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return (h & 1 ? -u : u) + (h & 2 ? -v : v);
  }

  function noise3(x, y, z) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const X = xi & 255;
    const Y = yi & 255;
    const Z = zi & 255;
    x -= xi;
    y -= yi;
    z -= zi;
    const u = fade(x);
    const v = fade(y);
    const w = fade(z);
    const A = PERM[X] + Y;
    const AA = PERM[A] + Z;
    const AB = PERM[A + 1] + Z;
    const B = PERM[X + 1] + Y;
    const BA = PERM[B] + Z;
    const BB = PERM[B + 1] + Z;
    return lerp(
      lerp(
        lerp(grad(PERM[AA] & 15, x, y, z), grad(PERM[BA] & 15, x - 1, y, z), u),
        lerp(grad(PERM[AB] & 15, x, y - 1, z), grad(PERM[BB] & 15, x - 1, y - 1, z), u),
        v,
      ),
      lerp(
        lerp(grad(PERM[AA + 1] & 15, x, y, z - 1), grad(PERM[BA + 1] & 15, x - 1, y, z - 1), u),
        lerp(grad(PERM[AB + 1] & 15, x, y - 1, z - 1), grad(PERM[BB + 1] & 15, x - 1, y - 1, z - 1), u),
        v,
      ),
      w,
    );
  }

  function fbm3(x, y, z, octaves) {
    let sum = 0;
    let amp = 0.5;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * noise3(x, y, z);
      norm += amp;
      x *= 2.03;
      y *= 2.03;
      z *= 2.03;
      amp *= 0.5;
    }
    return sum / norm;
  }

  function hash(n) {
    const s = Math.sin(n * 12.9898) * 43758.5453;
    return s - Math.floor(s);
  }

  function smoothstep(a, b, x) {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  function fract(x) {
    return x - Math.floor(x);
  }

  function rgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  function rgba(hex, alpha) {
    const [r, g, b] = rgb(hex).map((c) => Math.round(c * 255));
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function mixInto(out, a, b, t) {
    out[0] = a[0] + (b[0] - a[0]) * t;
    out[1] = a[1] + (b[1] - a[1]) * t;
    out[2] = a[2] + (b[2] - a[2]) * t;
    return out;
  }

  function hsvInto(out, h, s, v) {
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    switch (((i % 6) + 6) % 6) {
      case 0: out[0] = v; out[1] = t; out[2] = p; break;
      case 1: out[0] = q; out[1] = v; out[2] = p; break;
      case 2: out[0] = p; out[1] = v; out[2] = t; break;
      case 3: out[0] = p; out[1] = q; out[2] = v; break;
      case 4: out[0] = t; out[1] = p; out[2] = v; break;
      default: out[0] = v; out[1] = p; out[2] = q;
    }
    return out;
  }

  function norm3(x, y, z) {
    const l = Math.hypot(x, y, z);
    return { x: x / l, y: y / l, z: z / l };
  }

  function streak(lam, lat, freq, seed) {
    return 0.5 + 0.5 * fbm3(Math.cos(lam) * freq + seed, lat * 1.4, Math.sin(lam) * freq, 3);
  }

  function low(p, freq, seed) {
    return 0.5 + 0.5 * fbm3(p.x * freq + seed, p.y * freq, p.z * freq, 3);
  }

  function spots(lam, lat, cells, chance, radius, seed) {
    const fu = (lam / TAU) * cells;
    const fv = ((lat + Math.PI / 2) / Math.PI) * (cells / 2);
    const iu = Math.floor(fu);
    const iv = Math.floor(fv);
    const squeeze = Math.max(0.15, Math.cos(lat));
    let best = 0;
    for (let du = -1; du <= 1; du++) {
      for (let dv = -1; dv <= 1; dv++) {
        const cu = iu + du;
        const cv = iv + dv;
        const h = hash((((cu % cells) + cells) % cells) * 131.7 + cv * 17.3 + seed);
        if (h > chance) continue;
        const dx = (fu - (cu + hash(h * 91.1 + 3.3))) * squeeze;
        const dy = fv - (cv + hash(h * 47.9 + 1.1));
        best = Math.max(best, 1 - smoothstep(radius * 0.45, radius, Math.sqrt(dx * dx + dy * dy)));
      }
    }
    return best;
  }

  const WHITE = [1, 1, 1];
  const A = [0, 0, 0];
  const B = [0, 0, 0];

  const PATTERNS = {
    streaks(c, d, lam, lat, p, out) {
      const t = smoothstep(0.25, 0.8, streak(lam, lat, 7, 3.1) * 0.65 + low(p, 1.6, 9.4) * 0.45);
      mixInto(out, c[0], c[2], t);
      mixInto(out, out, c[1], 0.3);
      mixInto(out, out, d, spots(lam, lat, 46, 0.5, 0.2, 1.7) * 0.35);
    },
    speckle(c, d, lam, lat, p, out) {
      mixInto(out, c[1], c[2], smoothstep(0.35, 0.8, low(p, 1.3, 2.2)));
      mixInto(out, out, c[0], smoothstep(0.2, 1.3, lat) * 0.55);
      mixInto(out, out, d, spots(lam, lat, 60, 0.75, 0.22, 5.3) * 0.55);
    },
    stripes(c, d, lam, lat, p, out) {
      mixInto(A, c[0], c[1], smoothstep(0.3, 0.9, low(p, 1.4, 4.4)) * 0.55);
      const s = streak(lam, lat, 9, 7.7);
      const cover = 0.75 - 0.45 * smoothstep(-0.6, 1.3, lat);
      mixInto(B, c[1], c[2], smoothstep(0.45, 0.75, s));
      mixInto(out, A, B, smoothstep(0.42, 0.62, s * (0.55 + cover * 0.65)));
      mixInto(out, out, d, spots(lam, lat, 50, 0.45, 0.2, 2.9) * 0.3);
    },
    blush(c, d, lam, lat, p, out, look) {
      const bias = look.blushBias || 0;
      const s = streak(lam, lat, 8, 2.9);
      const side = 0.5 + 0.5 * Math.cos(lam - 0.8);
      const amount = smoothstep(0.35 - bias, 0.85 - bias, side * 0.7 + low(p, 1.8, 6.1) * 0.3 + (s - 0.5) * 0.35);
      mixInto(B, c[1], c[2], smoothstep(0.4, 0.8, s));
      mixInto(out, c[0], B, amount);
      mixInto(out, out, d, spots(lam, lat, 50, 0.5, 0.2, 4.4) * 0.3);
    },
    mottle(c, d, lam, lat, p, out) {
      const s = streak(lam, lat, 8, 1.3);
      const red = smoothstep(0.38, 0.62, low(p, 3.4, 8.8) * 0.75 + s * 0.35);
      mixInto(B, c[1], c[2], smoothstep(0.45, 0.85, s));
      mixInto(out, c[0], B, red * 0.95);
      mixInto(out, out, d, spots(lam, lat, 50, 0.5, 0.2, 6.6) * 0.35);
    },
    stars(c, d, lam, lat, p, out) {
      mixInto(out, c[0], c[2], smoothstep(0.25, 0.85, low(p, 2.2, 3.3) * 0.6 + streak(lam, lat, 7, 4.2) * 0.5));
      mixInto(out, out, c[1], 0.25);
      mixInto(out, out, d, spots(lam, lat, 38, 0.6, 0.26, 8.1) * 0.95);
    },
    nebula(c, d, lam, lat, p, out) {
      mixInto(out, c[0], c[1], smoothstep(0.55, 0.95, low(p, 2.6, 1.9)) * 0.35);
      mixInto(out, out, c[3], smoothstep(0.7, 1, low(p, 3.7, 5.5)) * 0.2);
      mixInto(out, out, WHITE, spots(lam, lat, 70, 0.35, 0.18, 9.9) * 0.9);
    },
    glitter(c, d, lam, lat, p, out) {
      out[0] = spots(lam, lat, 64, 0.45, 0.25, 2.2);
      out[1] = low(p, 9, 3.7);
      out[2] = low(p, 2.5, 7);
    },
  };

  const textureCache = new Map();

  function textureFor(index, look) {
    const kind = look.pattern || (look.material === 'holo' ? 'glitter' : null);
    if (!kind) return null;
    if (textureCache.has(index)) return textureCache.get(index);
    const paint = PATTERNS[kind];
    const colors = (look.colors || []).map(rgb);
    const dots = look.dots ? rgb(look.dots) : WHITE;
    const tex = new Float32Array(TEX_W * TEX_H * 3);
    const out = [0, 0, 0];
    const point = { x: 0, y: 0, z: 0 };
    for (let j = 0; j < TEX_H; j++) {
      const lat = ((j + 0.5) / TEX_H) * Math.PI - Math.PI / 2;
      const cl = Math.cos(lat);
      for (let i = 0; i < TEX_W; i++) {
        const lam = ((i + 0.5) / TEX_W) * TAU;
        point.x = cl * Math.sin(lam);
        point.y = Math.sin(lat);
        point.z = cl * Math.cos(lam);
        paint(colors, dots, lam, lat, point, out, look);
        const o = (j * TEX_W + i) * 3;
        tex[o] = out[0];
        tex[o + 1] = out[1];
        tex[o + 2] = out[2];
      }
    }
    textureCache.set(index, tex);
    return tex;
  }

  function sampleTex(tex, lam, lat, out) {
    const fu = (lam / TAU) * TEX_W - 0.5;
    const fv = Math.min(TEX_H - 1, Math.max(0, ((lat + Math.PI / 2) / Math.PI) * TEX_H - 0.5));
    const iu = Math.floor(fu);
    const iv = Math.floor(fv);
    const tu = fu - iu;
    const tv = fv - iv;
    const u0 = ((iu % TEX_W) + TEX_W) % TEX_W;
    const u1 = (u0 + 1) % TEX_W;
    const r0 = iv * TEX_W;
    const r1 = Math.min(TEX_H - 1, iv + 1) * TEX_W;
    for (let k = 0; k < 3; k++) {
      const a = tex[(r0 + u0) * 3 + k];
      const b = tex[(r0 + u1) * 3 + k];
      const c = tex[(r1 + u0) * 3 + k];
      const d = tex[(r1 + u1) * 3 + k];
      out[k] = (a + (b - a) * tu) * (1 - tv) + (c + (d - c) * tu) * tv;
    }
    return out;
  }

  // The apple is a surface of revolution, so turning it only shifts longitude.
  // Everything here depends on the pixel alone and is computed once per sprite size.
  function mapApple(X, Y, round, q) {
    if (round) {
      q.qx = X;
      q.qy = Y;
      q.w = 1;
      return X * X + Y * Y;
    }
    const w = 1.06 + 0.05 * Math.exp(-(((Y + 0.25) / 0.45) ** 2)) - 0.16 * smoothstep(0.05, 1.05, Y);
    const qx = X / w;
    const top = 0.15 * Math.exp(-((qx / 0.26) ** 2)) * (1 - smoothstep(-0.95, -0.35, Y));
    const bottom = 0.05 * Math.exp(-((qx / 0.22) ** 2)) * smoothstep(0.55, 0.95, Y);
    q.qx = qx;
    q.qy = Y - top + bottom;
    q.w = w;
    return q.qx * q.qx + q.qy * q.qy;
  }

  const geometryCache = new Map();

  function geometryFor(S, round) {
    const key = S + (round ? ':round' : '');
    const cached = geometryCache.get(key);
    if (cached) return cached;
    const unit = BODY * S;
    const cx = S / 2;
    const cy = BODY_CY * S;
    const inner = Math.pow(Math.max(0, 1 - 2.2 / unit), 2);
    const q = { qx: 0, qy: 0, w: 1 };
    const rows = { idx: [], cover: [], lam: [], lat: [], nx: [], ny: [], nz: [], u: [], v: [], cav: [], tx: [], tz: [] };
    for (let py = 0; py < S; py++) {
      for (let px = 0; px < S; px++) {
        const X = (px + 0.5 - cx) / unit;
        const Y = (py + 0.5 - cy) / unit;
        if (X * X + Y * Y > 1.6) continue;
        let r2 = mapApple(X, Y, round, q);
        let cover = 1;
        if (r2 > inner) {
          let inside = 0;
          for (let sy = -1; sy <= 1; sy++) {
            for (let sx = -1; sx <= 1; sx++) {
              if (mapApple((px + 0.5 + sx / 3 - cx) / unit, (py + 0.5 + sy / 3 - cy) / unit, round, q) < 1) inside++;
            }
          }
          if (!inside) continue;
          cover = inside / 9;
          r2 = mapApple(X, Y, round, q);
        }
        let qx = q.qx;
        let qy = q.qy;
        if (r2 > 0.995) {
          const k = Math.sqrt(0.995 / r2);
          qx *= k;
          qy *= k;
        }
        const qz = Math.sqrt(Math.max(0, 1 - qx * qx - qy * qy));
        const n = norm3(qx / q.w, qy, qz);
        const lamV = Math.atan2(qx, qz);
        rows.idx.push(py * S + px);
        rows.cover.push(cover);
        rows.lam.push(lamV);
        rows.lat.push(Math.asin(Math.max(-1, Math.min(1, qy))));
        rows.nx.push(n.x);
        rows.ny.push(n.y);
        rows.nz.push(n.z);
        rows.u.push(X);
        rows.v.push(Y);
        rows.cav.push(
          round ? 0 : Math.exp(-((qx / 0.2) ** 2 + ((qy + 0.93) / 0.12) ** 2)) + 0.6 * Math.exp(-((qx / 0.16) ** 2 + ((qy - 0.97) / 0.08) ** 2)),
        );
        rows.tx.push(Math.cos(lamV));
        rows.tz.push(-Math.sin(lamV));
      }
    }
    const g = { count: rows.idx.length, idx: Int32Array.from(rows.idx) };
    for (const name of ['cover', 'lam', 'lat', 'nx', 'ny', 'nz', 'u', 'v', 'cav', 'tx', 'tz']) g[name] = Float32Array.from(rows[name]);
    geometryCache.set(key, g);
    return g;
  }

  const L = norm3(-0.48, -0.62, 0.62);
  const H = norm3(L.x, L.y, L.z + 1);
  const FILL = norm3(0.75, 0.1, 0.45);

  function softbox(az, el, centerAz, halfW, centerEl, halfH) {
    let d = az - centerAz;
    d -= TAU * Math.round(d / TAU);
    return (1 - smoothstep(halfW * 0.6, halfW, Math.abs(d))) * (1 - smoothstep(halfH * 0.6, halfH, Math.abs(el - centerEl)));
  }

  function studio(rx, ry, rz, spin) {
    const c = Math.cos(spin);
    const s = Math.sin(spin);
    const x = rx * c + rz * s;
    const z = -rx * s + rz * c;
    const el = -ry;
    const az = Math.atan2(x, z);
    let e = 0.05 + 0.18 * smoothstep(-0.1, 0.8, el);
    e += softbox(az, el, -0.75, 0.45, 0.55, 0.4) * 2.4;
    e += softbox(az, el, 1.9, 0.32, 0.3, 0.6) * 1.3;
    e += (1 - smoothstep(0.02, 0.22, Math.abs(el))) * 0.3;
    return el < -0.15 ? e * 0.5 : e;
  }

  const T = [0, 0, 0];
  const C = [0, 0, 0];

  function reflectEnv(p, spin) {
    return studio(2 * p.nz * p.nx, 2 * p.nz * p.ny, 2 * p.nz * p.nz - 1, spin);
  }

  function shadeFruit(p, m, out, specStrength, shininess, clearcoat) {
    sampleTex(m.tex, p.lam, p.lat, T);
    const ndl = p.nx * L.x + p.ny * L.y + p.nz * L.z;
    const diff = Math.max(0, (ndl + 0.25) / 1.25);
    const fill = Math.max(0, p.nx * FILL.x + p.ny * FILL.y + p.nz * FILL.z) * 0.16;
    const rim = (1 - p.nz) * (1 - p.nz);
    const k = (0.17 + 0.08 * Math.max(0, -p.ny) + 0.95 * diff + fill) * (1 - 0.6 * p.cav) * (1 - 0.3 * rim);
    const ndh = Math.max(0, p.nx * H.x + p.ny * H.y + p.nz * H.z);
    const spec = (specStrength * Math.pow(ndh, shininess) + 0.05 * Math.pow(ndh, 8)) * (1 - p.cav);
    const coat = clearcoat ? clearcoat * (0.04 + 0.96 * Math.pow(1 - p.nz, 5)) * reflectEnv(p, 0) * 0.6 : 0;
    out[0] = T[0] * k + spec + coat;
    out[1] = T[1] * k + spec + coat;
    out[2] = T[2] * k + spec + coat;
  }

  const FACETS = Array.from({ length: 36 }, (_, k) => {
    const y = 1 - (2 * (k + 0.5)) / 36;
    const r = Math.sqrt(1 - y * y);
    const a = k * GOLDEN_ANGLE;
    return { x: r * Math.sin(a), y, z: r * Math.cos(a), hue: hash(k * 3.7 + 1) };
  });

  const MATERIALS = {
    matte(p, m, out) {
      shadeFruit(p, m, out, 0.24, 22, 0);
    },
    gloss(p, m, out) {
      shadeFruit(p, m, out, 0.9, 80, 0.8);
    },
    metal(p, m, out) {
      const e = reflectEnv(p, p.theta);
      const ndl = Math.max(0, (p.nx * L.x + p.ny * L.y + p.nz * L.z + 0.3) / 1.3);
      const k = (0.22 + 0.42 * ndl + 0.75 * e) * (1 - 0.6 * p.cav) * (1 + 0.2 * (1 - p.nz) * (1 - p.nz));
      const hot = Math.max(0, e - 0.9) * 0.5;
      out[0] = m.tint[0] * k + hot;
      out[1] = m.tint[1] * k + hot;
      out[2] = m.tint[2] * k + hot;
    },
    chrome(p, m, out) {
      const rx = 2 * p.nz * p.nx;
      const rz = 2 * p.nz * p.nz - 1;
      const c = Math.cos(p.theta);
      const s = Math.sin(p.theta);
      const x = rx * c + rz * s;
      const z = -rx * s + rz * c;
      const up = -2 * p.nz * p.ny;
      let v;
      if (up > 0.03) {
        mixInto(out, [0.5, 0.58, 0.7], [0.93, 0.96, 1], smoothstep(0.03, 0.75, up));
        const sun = softbox(Math.atan2(x, z), up, -0.7, 0.4, 0.5, 0.25) * 1.6;
        out[0] += sun;
        out[1] += sun;
        out[2] += sun;
      } else if (up > -0.06) {
        v = lerp(0.22, 0.4, smoothstep(-0.06, 0.03, up));
        out[0] = v;
        out[1] = v * 1.03;
        out[2] = v * 1.08;
      } else {
        const d = 1 / Math.max(0.05, -up);
        const check = (Math.floor(x * d * 1.5) + Math.floor(z * d * 1.5)) & 1;
        v = lerp(0.28, check ? 0.6 : 0.26, smoothstep(0.06, 0.5, -up));
        out[0] = v;
        out[1] = v * 1.02;
        out[2] = v * 1.06;
      }
      const k = 1 - 0.55 * p.cav;
      out[0] *= m.tint[0] * k;
      out[1] *= m.tint[1] * k;
      out[2] *= m.tint[2] * k;
    },
    holo(p, m, out) {
      sampleTex(m.tex, p.lam, p.lat, T);
      const hue = fract((p.lam / TAU) * 2 + (p.lat / Math.PI) * 0.7 + (1 - p.nz) * 0.85 + T[2] * 0.35);
      hsvInto(C, hue, 0.72, 1);
      const ndl = p.nx * L.x + p.ny * L.y + p.nz * L.z;
      const k = (0.45 + 0.6 * Math.max(0, (ndl + 0.3) / 1.3)) * (1 - 0.5 * p.cav);
      const ndh = Math.max(0, p.nx * H.x + p.ny * H.y + p.nz * H.z);
      const glint = T[0] * Math.pow(Math.max(0, Math.sin(p.theta * 3 + T[1] * TAU * 3)), 6) * 1.4;
      const shine = 0.9 * Math.pow(ndh, 60) + glint + reflectEnv(p, 0) * 0.12 * (1 - p.nz);
      for (let i = 0; i < 3; i++) out[i] = (0.15 + 0.85 * C[i]) * k + shine;
    },
    crystal(p, m, out) {
      const cl = Math.cos(p.lat);
      const ox = cl * Math.sin(p.lam);
      const oy = Math.sin(p.lat);
      const oz = cl * Math.cos(p.lam);
      let best = -2;
      let second = -2;
      let id = 0;
      for (let k = 0; k < FACETS.length; k++) {
        const q = FACETS[k];
        const d = ox * q.x + oy * q.y + oz * q.z;
        if (d > best) {
          second = best;
          best = d;
          id = k;
        } else if (d > second) second = d;
      }
      const q = FACETS[id];
      const c = Math.cos(p.theta);
      const s = Math.sin(p.theta);
      const f = norm3(
        (q.x * c - q.z * s) * 0.7 + p.nx * 0.3,
        q.y * 0.7 + p.ny * 0.3,
        Math.max(0.05, q.z * c + q.x * s) * 0.7 + p.nz * 0.3,
      );
      const edge = 1 - smoothstep(0.003, 0.02, best - second);
      const e = studio(2 * f.z * f.x, 2 * f.z * f.y, 2 * f.z * f.z - 1, 0);
      const ndl = Math.max(0, f.x * L.x + f.y * L.y + f.z * L.z);
      hsvInto(C, fract(q.hue + p.theta / TAU), 0.55, 1);
      const fringe = 0.3 * (1 - f.z);
      const facet = 0.75 + 0.5 * q.hue;
      for (let i = 0; i < 3; i++) out[i] = (m.tint[i] * (0.22 + 0.4 * ndl) + e * 0.55) * facet + C[i] * fringe + edge * 0.3;
      out[3] = Math.min(1, 0.45 + 0.35 * (1 - p.nz) + 0.25 * Math.min(1, e) + edge * 0.2);
    },
    nebula(p, m, out) {
      sampleTex(m.tex, p.lam, p.lat, T);
      const gx = p.u * 0.95;
      const gy = (p.v + 0.08) * 1.3;
      const r = Math.hypot(gx, gy);
      const ang = Math.atan2(gy, gx) + p.theta;
      const arms = Math.pow(0.5 + 0.5 * Math.cos(2 * ang - 5.5 * Math.log(r + 0.08)), 2.5);
      const fall = Math.exp(-r * 2.4);
      const core = Math.exp(-(r * r) / 0.012);
      const c = m.colors;
      const ndh = Math.max(0, p.nx * H.x + p.ny * H.y + p.nz * H.z);
      const fres = 0.06 + 0.94 * Math.pow(1 - p.nz, 4);
      const glass = reflectEnv(p, 0) * fres * 0.8 + 0.9 * Math.pow(ndh, 80);
      const rim = (1 - p.nz) * (1 - p.nz) * 0.5;
      for (let i = 0; i < 3; i++) {
        out[i] =
          T[i] +
          c[1][i] * arms * fall * 1.4 +
          c[2][i] * arms * Math.exp(-r * 4.5) * 0.9 +
          c[3][i] * arms * smoothstep(0.3, 0.8, r) * 0.5 +
          core * 1.3 +
          glass +
          c[1][i] * rim;
      }
      out[3] = 0.92 + 0.08 * (1 - p.nz);
    },
    platonic(p, m, out) {
      const ndl = p.nx * L.x + p.ny * L.y + p.nz * L.z;
      const diff = Math.max(0, (ndl + 0.6) / 1.6);
      const ndh = Math.max(0, p.nx * H.x + p.ny * H.y + p.nz * H.z);
      hsvInto(C, fract(0.58 + (1 - p.nz) * 0.7 + p.lat * 0.08 + p.lam / TAU), 0.28, 1);
      const edge = (1 - p.nz) * (1 - p.nz) * 0.6;
      const quarter = p.lam / (Math.PI / 2);
      const meridian = Math.abs(quarter - Math.round(quarter)) * (Math.PI / 2) * Math.cos(p.lat);
      const line = Math.max(1 - smoothstep(0.015, 0.04, meridian), 1 - smoothstep(0.015, 0.04, Math.abs(p.lat)));
      const k = 0.62 + 0.45 * diff;
      const spec = 0.6 * Math.pow(ndh, 40) + 0.25 * Math.pow(ndh, 6);
      for (let i = 0; i < 3; i++) {
        const pearl = m.tint[i] * k * (1 - edge) + C[i] * edge;
        out[i] = pearl + (m.gold[i] * (0.7 + 0.8 * diff) - pearl) * line * 0.9 + spec;
      }
    },
  };

  const materialCache = new Map();

  function materialFor(index, look) {
    if (materialCache.has(index)) return materialCache.get(index);
    const m = {
      shade: MATERIALS[look.material],
      look,
      tex: textureFor(index, look),
      tint: look.tint ? rgb(look.tint) : WHITE,
      gold: look.gold ? rgb(look.gold) : WHITE,
      colors: (look.colors || []).map(rgb),
      round: look.material === 'platonic',
    };
    materialCache.set(index, m);
    return m;
  }

  const P = { lam: 0, lat: 0, u: 0, v: 0, nx: 0, ny: 0, nz: 1, cav: 0, theta: 0 };
  const OUT = [0, 0, 0, 1];

  function paintBody(data, g, m, theta, silhouette) {
    data.fill(0);
    const lobes = m.look.lobes || 0;
    for (let k = 0; k < g.count; k++) {
      const i = g.idx[k] * 4;
      if (silhouette) {
        data[i] = 44;
        data[i + 1] = 40;
        data[i + 2] = 78;
        data[i + 3] = 255 * g.cover[k];
        continue;
      }
      const lam = fract((g.lam[k] + theta) / TAU) * TAU;
      let nx = g.nx[k];
      let ny = g.ny[k];
      let nz = g.nz[k];
      if (lobes) {
        const latN = g.lat[k] / (Math.PI / 2);
        const bump = lobes * 1.4 * Math.sin(5 * lam) * (0.3 + 0.7 * smoothstep(0.2, 0.9, latN));
        nx += bump * g.tx[k];
        nz += bump * g.tz[k];
        const len = Math.hypot(nx, ny, nz);
        nx /= len;
        ny /= len;
        nz /= len;
      }
      P.lam = lam;
      P.lat = g.lat[k];
      P.u = g.u[k];
      P.v = g.v[k];
      P.nx = nx;
      P.ny = ny;
      P.nz = nz;
      P.cav = g.cav[k];
      P.theta = theta;
      OUT[3] = 1;
      m.shade(P, m, OUT);
      data[i] = OUT[0] * 255;
      data[i + 1] = OUT[1] * 255;
      data[i + 2] = OUT[2] * 255;
      data[i + 3] = OUT[3] * g.cover[k] * 255;
    }
  }

  function drawStemAndLeaf(ctx, x0, y0, S, theta, look, silhouette, front) {
    const unit = BODY * S;
    const cx = x0 + S / 2;
    const baseY = y0 + BODY_CY * S - unit * 0.84;
    const lean = Math.sin(theta + 0.7) * unit * 0.12;
    const tipX = cx + lean;
    const tipY = baseY - unit * 0.42;
    const leafPhase = theta + 1.9;
    const leafInFront = Math.cos(leafPhase) > 0;
    ctx.save();
    ctx.lineCap = 'round';
    if (front) {
      ctx.beginPath();
      ctx.moveTo(cx, baseY + unit * 0.06);
      ctx.quadraticCurveTo(cx + lean * 0.2 + unit * 0.04, baseY - unit * 0.25, tipX, tipY);
      if (silhouette) ctx.strokeStyle = '#2c284e';
      else {
        const stem = ctx.createLinearGradient(cx - unit * 0.06, 0, cx + unit * 0.06, 0);
        stem.addColorStop(0, look.stem[0]);
        stem.addColorStop(1, look.stem[1]);
        ctx.strokeStyle = stem;
      }
      ctx.lineWidth = Math.max(1, unit * 0.075);
      ctx.stroke();
    }
    if (leafInFront === front) {
      const bx = cx + lean * 0.55;
      const by = baseY - unit * 0.42 * 0.55;
      const reach = unit * 0.55 * (0.3 + 0.7 * Math.abs(Math.sin(leafPhase)));
      const tx = bx + Math.sign(Math.sin(leafPhase) || 1) * reach;
      const ty = by - unit * 0.14 - unit * 0.08 * Math.abs(Math.cos(leafPhase));
      const dx = tx - bx;
      const dy = ty - by;
      const len = Math.hypot(dx, dy) || 1;
      const w = unit * 0.13;
      const px = (-dy / len) * w;
      const py = (dx / len) * w;
      const mx = (bx + tx) / 2;
      const my = (by + ty) / 2;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(mx + px, my + py, tx, ty);
      ctx.quadraticCurveTo(mx - px, my - py, bx, by);
      if (silhouette) ctx.fillStyle = '#2c284e';
      else {
        const leaf = ctx.createLinearGradient(mx + px, my + py, mx - px, my - py);
        leaf.addColorStop(0, leafInFront ? look.leaf[0] : look.leaf[1]);
        leaf.addColorStop(1, look.leaf[1]);
        ctx.fillStyle = leaf;
      }
      ctx.fill();
      if (!silhouette && unit > 14) {
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + dx * 0.85, by + dy * 0.85);
        ctx.strokeStyle = 'rgba(0,0,0,0.18)';
        ctx.lineWidth = Math.max(0.5, unit * 0.015);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  const scratchCache = new Map();

  function scratchFor(S) {
    let scratch = scratchCache.get(S);
    if (!scratch) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = S;
      const ctx = canvas.getContext('2d');
      scratch = { canvas, ctx, image: ctx.createImageData(S, S) };
      scratchCache.set(S, scratch);
    }
    return scratch;
  }

  function renderApple(ctx, x0, y0, S, index, look, theta, silhouette) {
    const m = materialFor(index, look);
    const scratch = scratchFor(S);
    paintBody(scratch.image.data, geometryFor(S, m.round), m, theta, silhouette);
    scratch.ctx.putImageData(scratch.image, 0, 0);
    drawStemAndLeaf(ctx, x0, y0, S, theta, look, silhouette, false);
    ctx.drawImage(scratch.canvas, x0, y0);
    drawStemAndLeaf(ctx, x0, y0, S, theta, look, silhouette, true);
  }

  function createSpriteBank(tiers) {
    const sheets = new Map();
    const queues = BAKE_ORDER.map(() => []);
    const tasks = [];
    let queued = 0;

    function sheet(index, S, golden) {
      const key = index + ':' + S + (golden ? ':golden' : '');
      let s = sheets.get(key);
      if (s) return s;
      const canvas = document.createElement('canvas');
      canvas.width = S * SHEET_COLS;
      canvas.height = S * (FRAMES / SHEET_COLS);
      s = { index, S, golden: Boolean(golden), canvas, ctx: canvas.getContext('2d'), baked: new Uint8Array(FRAMES), live: true };
      sheets.set(key, s);
      bakeFrame(s, 0);
      for (let rank = 1; rank < FRAMES; rank++) queues[rank].push(s);
      queued += FRAMES - 1;
      return s;
    }

    function bakeFrame(s, f) {
      const x = (f % SHEET_COLS) * s.S;
      const y = Math.floor(f / SHEET_COLS) * s.S;
      renderApple(s.ctx, x, y, s.S, s.index, tiers[s.index].look, (f / FRAMES) * TAU, false);
      s.baked[f] = 1;
    }

    function retain(keep) {
      for (const [key, s] of sheets) {
        if (keep(s)) continue;
        s.live = false;
        sheets.delete(key);
      }
      for (const queue of queues) {
        const before = queue.length;
        for (let k = queue.length - 1; k >= 0; k--) if (!queue[k].live) queue.splice(k, 1);
        queued -= before - queue.length;
      }
    }

    function pump(budgetMs) {
      const end = performance.now() + budgetMs;
      while (performance.now() < end) {
        if (tasks.length) {
          tasks.shift()();
          continue;
        }
        let rank = 1;
        while (rank < FRAMES && !queues[rank].length) rank++;
        if (rank === FRAMES) return;
        const s = queues[rank].shift();
        queued--;
        if (s.live) bakeFrame(s, BAKE_ORDER[rank]);
      }
    }

    function later(run) {
      tasks.push(run);
    }

    function draw(ctx, index, S, angle, x, y, size, golden) {
      const s = sheet(index, S, golden);
      let f = Math.round((fract(angle / TAU) * FRAMES)) % FRAMES;
      for (let d = 1; !s.baked[f] && d < FRAMES; d++) {
        if (s.baked[(f + d) % FRAMES]) f = (f + d) % FRAMES;
        else if (s.baked[(f - d + FRAMES) % FRAMES]) f = (f - d + FRAMES) % FRAMES;
      }
      ctx.drawImage(s.canvas, (f % SHEET_COLS) * S, Math.floor(f / SHEET_COLS) * S, S, S, x - size / 2, y - size / 2, size, size);
    }

    function thumbnail(canvas, index, locked, angle) {
      const S = canvas.width;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, S, S);
      renderApple(ctx, 0, 0, S, index, tiers[index].look, angle === undefined ? 0.55 : angle, locked);
      if (!locked) return;
      ctx.fillStyle = 'rgba(200, 192, 255, 0.55)';
      ctx.font = `700 ${Math.round(S * 0.26)}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', S / 2, BODY_CY * S + S * 0.01);
    }

    return { draw, thumbnail, later, pump, retain, pending: () => queued + tasks.length };
  }

  const effectCache = new Map();

  function effectSprite(key, size, paint) {
    let canvas = effectCache.get(key);
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      paint(canvas.getContext('2d'), size);
      effectCache.set(key, canvas);
    }
    return canvas;
  }

  function glowSprite(color) {
    return effectSprite('glow' + color, 128, (ctx, s) => {
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, rgba(color, 0.85));
      g.addColorStop(0.35, rgba(color, 0.32));
      g.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    });
  }

  function sparkleSprite(color) {
    return effectSprite('sparkle' + color, 64, (ctx, s) => {
      const c = s / 2;
      const g = ctx.createRadialGradient(c, c, 0, c, c, c);
      g.addColorStop(0, rgba(color, 1));
      g.addColorStop(0.2, rgba(color, 0.55));
      g.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = g;
      for (const [w, h] of [[0.09, 0.5], [0.5, 0.09]]) {
        ctx.beginPath();
        ctx.moveTo(c, c - h * s);
        ctx.quadraticCurveTo(c, c, c + w * s, c);
        ctx.quadraticCurveTo(c, c, c, c + h * s);
        ctx.quadraticCurveTo(c, c, c - w * s, c);
        ctx.quadraticCurveTo(c, c, c, c - h * s);
        ctx.fill();
      }
    });
  }

  function raysSprite() {
    return effectSprite('rays', 256, (ctx, s) => {
      const c = s / 2;
      const g = ctx.createRadialGradient(c, c, s * 0.08, c, c, c);
      g.addColorStop(0, 'rgba(255, 246, 214, 0.75)');
      g.addColorStop(1, 'rgba(255, 220, 140, 0)');
      ctx.fillStyle = g;
      const count = 14;
      for (let k = 0; k < count; k++) {
        const a = (k / count) * TAU;
        const spread = k % 2 ? 0.07 : 0.11;
        ctx.beginPath();
        ctx.moveTo(c, c);
        ctx.lineTo(c + Math.cos(a - spread) * c, c + Math.sin(a - spread) * c);
        ctx.lineTo(c + Math.cos(a + spread) * c, c + Math.sin(a + spread) * c);
        ctx.closePath();
        ctx.fill();
      }
    });
  }

  function haloSprite() {
    return effectSprite('halo', 128, (ctx, s) => {
      ctx.beginPath();
      ctx.ellipse(s / 2, s / 2, s * 0.38, s * 0.11, 0, 0, TAU);
      ctx.shadowColor = 'rgba(255, 210, 110, 0.9)';
      ctx.shadowBlur = s * 0.06;
      ctx.strokeStyle = '#fff1c4';
      ctx.lineWidth = s * 0.045;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = s * 0.015;
      ctx.stroke();
    });
  }

  const HEAD_PATH =
    'M 30 112 C 30 104 29.5 98 28.5 92 C 27.5 86 24 80 20.5 75 C 14 66 10.5 56 10.5 45 ' +
    'C 10.5 22 28 6 50 6 C 68 6 81 17 83.5 33 C 84.3 38 84 41 83.6 43.5 C 85 47 87.5 52 89.5 56.5 ' +
    'C 90.5 58.8 89.6 60.4 87.4 60.8 L 85.6 61.1 C 86.2 63.2 86 64.4 85.4 65.3 C 86.2 66.4 86.1 67.6 85.2 68.6 ' +
    'C 85.9 70.4 85.6 72.6 84.4 74.4 C 82.8 76.8 79.6 78.2 75.6 78.2 C 73 78.2 70.5 79.6 69.4 82.4 ' +
    'C 68.2 85.4 67.8 88 67.6 91 C 67.4 96 67.6 103 68 112 Z';
  const EYE_PATH = 'M 71.5 45.6 Q 75 48.4 78.6 45.4 M 72.6 46.9 L 72 48.4 M 74.8 47.6 L 74.6 49.2 M 77 47.1 L 77.4 48.6';
  const BROW_PATH = 'M 70.5 40.6 Q 75 38.6 80 40.2';
  const HEAD_BOX = { x: 8, y: 4, w: 84, h: 106 };
  const MIND = { cx: 47, cy: 37, rx: 33, ry: 27 };

  function createStage(canvas, tiers) {
    const ctx = canvas.getContext('2d');
    const bank = createSpriteBank(tiers);
    const headPath = new Path2D(HEAD_PATH);
    const eyePath = new Path2D(EYE_PATH);
    const browPath = new Path2D(BROW_PATH);
    const headLayer = document.createElement('canvas');
    const outlineLayer = document.createElement('canvas');

    let W = 0;
    let H = 0;
    let dpr = 1;
    let scale = 1;
    let ox = 0;
    let oy = 0;
    let mind = { cx: 0, cy: 0, rx: 0, ry: 0 };
    let spriteS = 0;
    let appleD = 0;
    let cap = 64;
    let counts = tiers.map(() => 0);
    let apples = [];
    let byKey = new Map();
    let orbit = 0;
    let momentum = 0;
    let flash = 0;
    let frenzy = false;
    let reduced = false;
    const floaters = [];
    const ripples = [];

    function resize(cssW, cssH, ratio) {
      dpr = ratio;
      W = Math.max(1, Math.round(cssW * dpr));
      H = Math.max(1, Math.round(cssH * dpr));
      canvas.width = W;
      canvas.height = H;
      scale = Math.min(W / HEAD_BOX.w, (H * 1.02) / HEAD_BOX.h);
      ox = (W - HEAD_BOX.w * scale) / 2 - HEAD_BOX.x * scale;
      oy = H * 0.02 - HEAD_BOX.y * scale;
      mind = { cx: ox + MIND.cx * scale, cy: oy + MIND.cy * scale, rx: MIND.rx * scale, ry: MIND.ry * scale };
      cap = Math.max(20, Math.min(64, Math.floor((Math.PI * mind.rx * mind.ry) / (26 * dpr) ** 2)));
      paintLayers();
      layout(performance.now() / 1000, true);
    }

    function paintLayers() {
      for (const layer of [headLayer, outlineLayer]) {
        layer.width = W;
        layer.height = H;
      }
      const h = headLayer.getContext('2d');
      h.setTransform(scale, 0, 0, scale, ox, oy);
      const fill = h.createRadialGradient(MIND.cx, MIND.cy, 2, MIND.cx, MIND.cy + 8, 70);
      fill.addColorStop(0, '#221a4d');
      fill.addColorStop(0.45, '#151132');
      fill.addColorStop(1, '#0b0a18');
      h.fillStyle = fill;
      h.fill(headPath);
      h.save();
      h.clip(headPath);
      h.lineWidth = 0.18;
      for (let k = 1; k <= 6; k++) {
        h.strokeStyle = `rgba(170,160,255,${0.075 - k * 0.007})`;
        h.beginPath();
        h.ellipse(MIND.cx, MIND.cy, MIND.rx * k * 0.2, MIND.ry * k * 0.2, 0, 0, TAU);
        h.stroke();
      }
      h.strokeStyle = 'rgba(170,160,255,0.08)';
      for (let k = 0; k < 48; k++) {
        const a = (k / 48) * TAU;
        const r1 = k % 4 ? 0.97 : 0.92;
        h.beginPath();
        h.moveTo(MIND.cx + Math.cos(a) * MIND.rx * r1 * 1.2, MIND.cy + Math.sin(a) * MIND.ry * r1 * 1.2);
        h.lineTo(MIND.cx + Math.cos(a) * MIND.rx * 1.2, MIND.cy + Math.sin(a) * MIND.ry * 1.2);
        h.stroke();
      }
      h.restore();
      fadeNeck(h);

      const o = outlineLayer.getContext('2d');
      o.setTransform(scale, 0, 0, scale, ox, oy);
      o.lineJoin = 'round';
      o.lineCap = 'round';
      o.strokeStyle = 'rgba(150,140,255,0.16)';
      o.lineWidth = 1.6;
      o.stroke(headPath);
      o.strokeStyle = 'rgba(214,208,255,0.78)';
      o.lineWidth = 0.45;
      o.stroke(headPath);
      o.strokeStyle = 'rgba(214,208,255,0.55)';
      o.lineWidth = 0.4;
      o.stroke(eyePath);
      o.stroke(browPath);
      fadeNeck(o);
    }

    function fadeNeck(layerCtx) {
      layerCtx.setTransform(1, 0, 0, 1, 0, 0);
      layerCtx.globalCompositeOperation = 'destination-out';
      const top = oy + 84 * scale;
      const grad = layerCtx.createLinearGradient(0, top, 0, Math.min(H, oy + 108 * scale));
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,1)');
      layerCtx.fillStyle = grad;
      layerCtx.fillRect(0, top, W, H - top);
      layerCtx.globalCompositeOperation = 'source-over';
    }

    function setCounts(next) {
      counts = next.slice();
      layout(performance.now() / 1000, false);
    }

    function layout(now, snap) {
      const alloc = pickVisibleApples(counts, cap);
      const wanted = [];
      for (let i = alloc.length - 1; i >= 0; i--) for (let k = 0; k < alloc[i]; k++) wanted.push(i + ':' + k);
      const n = wanted.length;
      appleD = n === 0 ? 0 : n === 1 ? Math.min(mind.rx, mind.ry) * 1.05 : Math.min(Math.min(mind.rx, mind.ry) * 0.86, Math.sqrt((Math.PI * mind.rx * mind.ry) / n) * 0.84);

      const nextByKey = new Map();
      const nextApples = [];
      wanted.forEach((key, slot) => {
        let r;
        let a;
        if (n === 1) {
          r = 0;
          a = 0;
        } else if (n <= 3) {
          r = 0.48;
          a = -Math.PI / 2 + (slot / n) * TAU;
        } else if (n <= 7) {
          r = slot === 0 ? 0 : 0.56;
          a = slot === 0 ? 0 : -Math.PI / 2 + ((slot - 1) / (n - 1)) * TAU;
        } else {
          r = Math.sqrt(slot / (n - 1)) * 0.97;
          a = slot * GOLDEN_ANGLE;
        }
        const tx = Math.cos(a) * r;
        const ty = Math.sin(a) * r;
        let apple = byKey.get(key);
        if (!apple) {
          const tier = Number(key.split(':')[0]);
          const seed = hash(tier * 977 + Number(key.split(':')[1]) * 13.7 + 1);
          apple = {
            key,
            tier,
            seed,
            x: tx,
            y: ty,
            angle: seed * TAU,
            speed: tier === tiers.length - 1 ? 0.22 : 0.26 + 0.18 * hash(seed * 31),
            born: snap ? -10 : now,
            dying: 0,
          };
        }
        apple.dying = 0;
        apple.tx = tx;
        apple.ty = ty;
        if (snap) {
          apple.x = tx;
          apple.y = ty;
        }
        nextByKey.set(key, apple);
        nextApples.push(apple);
      });
      for (const apple of apples) {
        if (!nextByKey.has(apple.key) && !snap) {
          if (!apple.dying) apple.dying = now;
          if (now - apple.dying < 0.25) nextApples.push(apple);
        }
      }
      apples = nextApples;
      byKey = nextByKey;

      const needed = Math.min(320, Math.max(48, Math.ceil((appleD * 1.12) / (2 * BODY) / 16) * 16));
      if (needed > spriteS || needed < spriteS * 0.6) {
        spriteS = needed;
        bank.retain((s) => s.S === spriteS || s.golden);
      }
    }

    function focus(xCss, yCss, text) {
      momentum = Math.min(10, momentum + 1.3);
      const x = xCss * dpr;
      const y = yCss * dpr;
      floaters.push({ x, y, text, t0: performance.now() / 1000, drift: (Math.random() - 0.5) * 18 * dpr });
      if (floaters.length > 40) floaters.shift();
      if (reduced) flash = 0.16;
      else {
        ripples.push({ x, y, t0: performance.now() / 1000 });
        if (ripples.length > 12) ripples.shift();
      }
    }

    function mindCenterCss() {
      return { x: mind.cx / dpr, y: mind.cy / dpr };
    }

    function frame(now, dt) {
      bank.pump(5);
      if (!W) return;
      const spinRate = (1 + momentum) * (frenzy ? 1.7 : 1) * (reduced ? 0.35 : 1);
      momentum *= Math.exp(-dt * 1.3);
      if (momentum < 0.001) momentum = 0;
      if (!reduced) orbit += dt * 0.045 * (1 + momentum * 0.15);
      flash *= Math.exp(-dt * 9);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(headLayer, 0, 0);
      ctx.save();
      ctx.setTransform(scale, 0, 0, scale, ox, oy);
      ctx.clip(headPath);
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      if (frenzy) {
        const pulse = 0.14 + 0.06 * Math.sin(now * 5);
        const g = ctx.createRadialGradient(mind.cx, mind.cy, 0, mind.cx, mind.cy, mind.rx * 1.4);
        g.addColorStop(0, `rgba(255,190,80,${pulse})`);
        g.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
      if (flash > 0.005) {
        ctx.fillStyle = `rgba(200,190,255,${flash})`;
        ctx.fillRect(0, 0, W, H);
      }

      const ease = reduced ? 1 : 1 - Math.exp(-dt * 8);
      const cos = Math.cos(orbit);
      const sin = Math.sin(orbit);
      const reach = { x: mind.rx - appleD * 0.22, y: mind.ry - appleD * 0.22 };
      for (const apple of apples) {
        apple.x += (apple.tx - apple.x) * ease;
        apple.y += (apple.ty - apple.y) * ease;
        apple.angle += dt * TAU * apple.speed * spinRate;
        const rx = apple.x * cos - apple.y * sin;
        const ry = apple.x * sin + apple.y * cos;
        apple.r = Math.hypot(rx, ry);
        apple.px = mind.cx + rx * reach.x;
        apple.py = mind.cy + ry * reach.y + (reduced ? 0 : Math.sin(now * 1.3 + apple.seed * 40) * appleD * 0.035);
      }
      apples.sort((a, b) => b.r - a.r);

      const D = appleD;
      let glowing = 0;
      for (const apple of apples) if (tiers[apple.tier].look.glow) glowing++;
      const glowAlpha = (frenzy ? 0.7 : 0.45) * Math.min(1, Math.sqrt(5 / Math.max(1, glowing)));
      let rays = 0;
      for (let k = apples.length - 1; k >= 0; k--) {
        const apple = apples[k];
        apple.rays = Boolean(tiers[apple.tier].look.halo) && rays < 3;
        if (apple.rays) rays++;
      }
      for (const apple of apples) {
        const look = tiers[apple.tier].look;
        const age = Math.min(1, (now - apple.born) / 0.28);
        const enter = 1 - Math.pow(1 - age, 3);
        const exit = apple.dying ? Math.max(0, 1 - (now - apple.dying) / 0.22) : 1;
        const alpha = enter * exit;
        if (alpha <= 0) continue;
        const grow = reduced ? 1 : 0.7 + 0.3 * enter;
        const size = ((D * (1.08 - 0.14 * apple.r)) / (2 * BODY)) * grow;
        const body = size * 2 * BODY;
        const x = apple.px;
        const y = apple.py;

        if (look.glow) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = alpha * glowAlpha;
          const gs = body * 2.1;
          ctx.drawImage(glowSprite(look.glow), x - gs / 2, y - gs / 2, gs, gs);
          if (apple.rays) {
            const rs = body * 2.9;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(reduced ? 0 : now * 0.12 + apple.seed * 3);
            ctx.globalAlpha = alpha * (apples.length > 8 ? 0.35 : 0.7);
            ctx.drawImage(raysSprite(), -rs / 2, -rs / 2, rs, rs);
            ctx.restore();
          }
          ctx.globalCompositeOperation = 'source-over';
        }

        ctx.globalAlpha = alpha;
        bank.draw(ctx, apple.tier, spriteS, apple.angle, x, y, size);

        if (look.halo) {
          const hs = body * 0.95;
          const bob = reduced ? 0 : Math.sin(now * 2 + apple.seed * 9) * body * 0.03;
          ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(haloSprite(), x - hs / 2, y - body * 0.6 - hs / 2 + bob, hs, hs);
          ctx.globalCompositeOperation = 'source-over';
        }
        if (look.sparkle && body > 14 * dpr) {
          ctx.globalCompositeOperation = 'lighter';
          for (let j = 0; j < 2; j++) {
            const cycle = now * 0.8 + hash(apple.seed * 50 + j) * 7;
            const c = Math.floor(cycle);
            const ph = cycle - c;
            const tw = Math.pow(Math.sin(Math.PI * ph), 3);
            const ang = hash(apple.seed * 91 + c * 7.3 + j) * TAU;
            const rr = 0.2 + 0.5 * hash(apple.seed * 17 + c * 3.1 + j);
            const ss = body * (reduced ? 0.45 : 0.25 + 0.3 * tw);
            ctx.globalAlpha = alpha * tw;
            ctx.drawImage(sparkleSprite(look.sparkle), x + Math.cos(ang) * rr * body * 0.5 - ss / 2, y + Math.sin(ang) * rr * body * 0.5 - ss / 2, ss, ss);
          }
          ctx.globalCompositeOperation = 'source-over';
        }
        ctx.globalAlpha = 1;
      }
      apples = apples.filter((a) => !a.dying || now - a.dying < 0.25);

      for (let k = ripples.length - 1; k >= 0; k--) {
        const r = ripples[k];
        const age = (now - r.t0) / 0.42;
        if (age >= 1) {
          ripples.splice(k, 1);
          continue;
        }
        const e = 1 - Math.pow(1 - age, 3);
        ctx.strokeStyle = `rgba(214,206,255,${0.5 * (1 - age)})`;
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        ctx.arc(r.x, r.y, (10 + 40 * e) * dpr, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
      ctx.drawImage(outlineLayer, 0, 0);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${Math.round(19 * dpr)}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
      for (let k = floaters.length - 1; k >= 0; k--) {
        const f = floaters[k];
        const age = (now - f.t0) / 0.9;
        if (age >= 1) {
          floaters.splice(k, 1);
          continue;
        }
        const e = 1 - Math.pow(1 - age, 3);
        const alpha = age < 0.1 ? age / 0.1 : 1 - Math.pow((age - 0.1) / 0.9, 2);
        const fx = f.x + (reduced ? 0 : f.drift * e);
        const fy = f.y - (reduced ? 0 : 56 * dpr * e) - 14 * dpr;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = 'rgba(10,8,24,0.75)';
        ctx.fillText(f.text, fx, fy + 2 * dpr);
        ctx.fillStyle = frenzy ? '#ffd27a' : '#f4f1ff';
        ctx.fillText(f.text, fx, fy);
      }
      ctx.globalAlpha = 1;
    }

    return {
      resize,
      setCounts,
      focus,
      frame,
      mindCenterCss,
      setFrenzy(on) {
        frenzy = on;
      },
      setReducedMotion(on) {
        reduced = on;
      },
      visibleCount: () => apples.filter((a) => !a.dying).length,
      bank,
    };
  }

  function drawGolden(canvasCtx, bank, index, S, angle, cssSize, ratio, now, reduced) {
    const W = canvasCtx.canvas.width;
    canvasCtx.setTransform(1, 0, 0, 1, 0, 0);
    canvasCtx.clearRect(0, 0, W, W);
    const c = W / 2;
    const body = cssSize * ratio * 0.62;
    const pulse = reduced ? 0.8 : 0.75 + 0.25 * Math.sin(now * 4);
    canvasCtx.globalCompositeOperation = 'lighter';
    canvasCtx.globalAlpha = pulse * 0.8;
    const gs = body * 1.6;
    canvasCtx.drawImage(glowSprite('#ffcf5c'), c - gs / 2, c - gs / 2, gs, gs);
    canvasCtx.globalAlpha = 1;
    canvasCtx.globalCompositeOperation = 'source-over';
    bank.draw(canvasCtx, index, S, angle, c, c, body / (2 * BODY), true);
    canvasCtx.globalCompositeOperation = 'lighter';
    for (let j = 0; j < 3; j++) {
      const cycle = now * 1.1 + j * 0.37;
      const tw = reduced ? 0.6 : Math.pow(Math.sin(Math.PI * fract(cycle)), 3);
      const a = (j / 3) * TAU + Math.floor(cycle) * 2.1;
      const ss = body * (0.25 + 0.25 * tw);
      canvasCtx.globalAlpha = tw;
      canvasCtx.drawImage(sparkleSprite('#fff6d0'), c + Math.cos(a) * body * 0.42 - ss / 2, c + Math.sin(a) * body * 0.42 - ss / 2, ss, ss);
    }
    canvasCtx.globalAlpha = 1;
    canvasCtx.globalCompositeOperation = 'source-over';
  }

  const Render = { createStage, drawGolden, pickVisibleApples };

  if (typeof module === 'object' && module.exports) module.exports = Render;
  else root.Render = Render;
})(typeof globalThis !== 'undefined' ? globalThis : this);
