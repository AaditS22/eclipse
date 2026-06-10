/* ============================================================
   Procedural pixel-art generator — "The Foundry".

   Variety comes from three independent axes that combine:
     • FORM    — the structural archetype (creature, orb, crystal,
                 sigil, totem, nebula). Each has its own silhouette
                 logic, so pieces don't all read as the same blob.
     • PALETTE — a colour SCHEME (analogous / complementary /
                 triadic / mono / duo) around a random hue, so the
                 colour logic differs piece-to-piece, not just the hue.
     • RARITY  — how rich it gets (grid size, colour count, glow).

   A generated piece is frozen into state (grid + palette), so it
   renders identically forever — that's what makes it "yours".
   ============================================================ */

import { spriteSVG } from './sprites.js';
import { uid, clamp } from '../util.js';

// ---- seeded PRNG (mulberry32) ----
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ri = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const chance = (rng, p) => rng() < p;

// ---- HSL → hex ----
function hslHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s = clamp(s, 0, 100) / 100;
  l = clamp(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

// ---- rarity → how rich the art gets ----
// Bigger grids + more colours than before so pieces read as crafted,
// not noisy. Saturation climbs with rarity for richer palettes.
const RARITY_SPEC = {
  common: { size: 13, colors: 3, sat: 64, glow: false },
  uncommon: { size: 13, colors: 4, sat: 72, glow: false },
  rare: { size: 15, colors: 4, sat: 80, glow: false },
  epic: { size: 15, colors: 5, sat: 90, glow: true },
  legendary: { size: 17, colors: 5, sat: 98, glow: true },
};
const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

/** Roll a rarity from a forge's weight table using the rng. */
function rollRarity(rng, weights) {
  const total = RARITY_ORDER.reduce((sum, r) => sum + (weights[r] || 0), 0);
  let roll = rng() * total;
  for (const r of RARITY_ORDER) {
    roll -= weights[r] || 0;
    if (roll < 0) return r;
  }
  return 'common';
}

// ---- palette: a colour SCHEME around a random base hue ----
const FILL = ['a', 'b', 'c', 'd', 'e'];
const SCHEME_HUES = {
  analogous: [0, 28, -28, 52, -52],
  complementary: [0, 180, 16, 196, -16],
  triadic: [0, 120, 240, 60, 300],
  mono: [0, 0, 0, 0, 0],
  duo: [0, 154, 0, 154, 308],
};
function buildPalette(rng, spec) {
  const baseH = ri(rng, 0, 359);
  const scheme = pick(rng, Object.keys(SCHEME_HUES));
  const offs = SCHEME_HUES[scheme];
  // Ordered light → dark ramp so fills[0] is the brightest. Forms map
  // distance/height onto this ramp, which fakes a light source (top-left)
  // and makes pieces read as volumetric rather than random speckle.
  const lights = scheme === 'mono' ? [86, 72, 58, 44, 30] : [78, 66, 53, 42, 31];
  const pal = {};
  for (let i = 0; i < spec.colors; i++) {
    const s = scheme === 'mono' ? Math.max(20, spec.sat - 20) : clamp(spec.sat + ri(rng, -6, 6), 32, 100);
    pal[FILL[i]] = hslHex(baseH + offs[i], s, lights[i]);
  }
  pal.o = hslHex(baseH, 32, ri(rng, 6, 11)); // outline: dark, faintly tinted
  pal.h = hslHex(baseH, 30, 94);             // highlight / sheen
  return { pal, scheme };
}

// Map a 0..1 distance/height onto the ordered fill ramp (0 = lightest).
const shadeAt = (t, n) => Math.min(n - 1, Math.max(0, Math.floor(t * n)));

// dominant-colour-wins picker
function weightedFill(rng, fills) {
  const w = [0.5, 0.28, 0.13, 0.06, 0.03].slice(0, fills.length);
  let roll = rng() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < fills.length; i++) {
    roll -= w[i];
    if (roll < 0) return fills[i];
  }
  return fills[0];
}

const blank = (S) => Array.from({ length: S }, () => Array(S).fill('.'));
const inb = (g, x, y) => y >= 0 && y < g.length && x >= 0 && x < g[0].length;

// ---------------- FORMS ----------------
// Each returns a 2D char grid (chars in FILL ∪ {'h'}; '.' transparent).

// Creature: a mirrored, volume-shaded body (light core → dark rim) with a
// gently lumpy-but-stable silhouette and a pair of eyes. Reads as a critter.
function formCreature(rng, spec, S, fills) {
  const g = blank(S);
  const cx = (S - 1) / 2, cy = (S - 1) / 2, half = Math.ceil(S / 2);
  const n = fills.length;
  // a few smooth radial lumps deform the outline without making it noisy
  const lumps = Array.from({ length: ri(rng, 2, 4) }, () => ({ a: rng() * Math.PI * 2, r: 0.18 + rng() * 0.45 }));
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < half; x++) {
      const dx = (x - cx) / cx, dy = (y - cy) / cy;
      const rr = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      let edge = 0.92;
      for (const l of lumps) edge += 0.14 * Math.cos(ang - l.a) * l.r;
      if (rr <= edge) {
        // light source up-left: shade by distance from an offset centre
        const t = Math.min(1, Math.hypot(dx + 0.28, dy + 0.28) / 1.5);
        const c = fills[shadeAt(t, n)];
        g[y][x] = c; g[y][S - 1 - x] = c;
      }
    }
  }
  // eyes (dark) + a top-left sheen
  const ey = Math.round(cy - S * 0.05), ex = Math.round(cx - S * 0.22);
  if (inb(g, ex, ey) && g[ey][ex] !== '.') { g[ey][ex] = 'o'; g[ey][S - 1 - ex] = 'o'; }
  const hx = Math.round(cx - S * 0.2), hy = Math.round(cy - S * 0.22);
  if (inb(g, hx, hy) && g[hy][hx] !== '.') g[hy][hx] = 'h';
  return g;
}

// Orb: a shaded sphere (a little planet) — either smooth top-left lighting
// or horizontal cloud bands — with a bright sheen.
function formOrb(rng, spec, S, fills) {
  const g = blank(S);
  const cx = (S - 1) / 2, cy = (S - 1) / 2, R = cx - 0.15;
  const n = fills.length;
  const banded = chance(rng, 0.5);
  const bandH = ri(rng, 1, 2);
  const tilt = ri(rng, -1, 1) * 0.4;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (Math.hypot(x - cx, y - cy) > R) continue;
      let idx;
      if (banded) {
        const bi = Math.floor((y + tilt * (x - cx)) / bandH);
        idx = ((bi % n) + n) % n;
      } else {
        const lx = (x - cx + R * 0.42) / R, ly = (y - cy + R * 0.42) / R;
        idx = shadeAt(Math.min(1, Math.hypot(lx, ly) / 1.45), n);
      }
      g[y][x] = fills[idx];
    }
  }
  const sx = Math.round(cx - R * 0.42), sy = Math.round(cy - R * 0.46);
  if (inb(g, sx, sy) && g[sy][sx] !== '.') { g[sy][sx] = 'h'; if (inb(g, sx + 1, sy)) g[sy][sx + 1] = 'h'; }
  return g;
}

// Crystal: a diamond silhouette with left→right faceted shading + a bright
// central seam, so it catches light like a cut gem.
function formCrystal(rng, spec, S, fills) {
  const g = blank(S);
  const cx = (S - 1) / 2, cy = (S - 1) / 2;
  const n = fills.length;
  const squash = 0.7 + rng() * 0.5;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dn = Math.abs(x - cx) / cx + (Math.abs(y - cy) / cy) * squash;
      if (dn <= 1.0) {
        const horiz = (x - cx) / cx; // -1 (left/light) → 1 (right/dark)
        g[y][x] = fills[shadeAt((horiz + 1) / 2, n)];
      }
    }
  }
  const mid = Math.round(cx); // bright facet seam
  for (let y = 0; y < S; y++) if (g[y][mid] !== '.') g[y][mid] = fills[0];
  if (inb(g, mid, 1) && g[1][mid] !== '.') g[1][mid] = 'h';
  return g;
}

// Sigil: a ring + radial spokes + core. A geometric rune (no outline pass).
function formSigil(rng, spec, S, fills) {
  const g = blank(S);
  const c = (S - 1) / 2, R = c - 1;
  for (let a = 0; a < 360; a += 6) {
    const x = Math.round(c + R * Math.cos((a * Math.PI) / 180));
    const y = Math.round(c + R * Math.sin((a * Math.PI) / 180));
    if (inb(g, x, y)) g[y][x] = fills[0];
  }
  const spokes = ri(rng, 2, 4);
  const col = fills[1 % fills.length];
  for (let k = 0; k < spokes; k++) {
    const a = (k * Math.PI) / spokes + rng() * 0.3;
    for (let r = 0; r <= R; r++) {
      const x = Math.round(c + r * Math.cos(a)), y = Math.round(c + r * Math.sin(a));
      const x2 = Math.round(c - r * Math.cos(a)), y2 = Math.round(c - r * Math.sin(a));
      if (inb(g, x, y)) g[y][x] = col;
      if (inb(g, x2, y2)) g[y2][x2] = col;
    }
  }
  g[Math.round(c)][Math.round(c)] = 'h';
  return g;
}

// Totem: stacked symmetric segments, each rounded with edge shading and the
// occasional accent light. Reads as a robot/idol with depth.
function formTotem(rng, spec, S, fills) {
  const g = blank(S);
  const cx = Math.floor((S - 1) / 2), half = Math.ceil(S / 2);
  const n = fills.length;
  let y = 0;
  while (y < S) {
    const segH = ri(rng, 1, 3);
    const w = ri(rng, 1, half - 1);
    const baseIdx = ri(rng, 0, Math.max(0, n - 2));
    const light = chance(rng, 0.4);
    for (let yy = y; yy < Math.min(S, y + segH); yy++) {
      for (let x = cx - w; x <= cx; x++) {
        if (x < 0) continue;
        const idx = Math.min(n - 1, baseIdx + shadeAt((cx - x) / Math.max(1, w), 2)); // centre light, sides darker
        const c = fills[idx];
        g[yy][x] = c; g[yy][S - 1 - x] = c;
      }
      if (light) g[yy][cx] = 'h';
    }
    y += segH;
  }
  return g;
}

// Nebula: a dense, glowing cloud whose colour deepens outward from a bright
// core, sprinkled with stars. Airy (no outline pass).
function formNebula(rng, spec, S, fills) {
  const g = blank(S);
  const cx = (S - 1) / 2, cy = (S - 1) / 2;
  const n = fills.length;
  const sym = chance(rng, 0.6);
  const half = sym ? Math.ceil(S / 2) : S;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < half; x++) {
      const r = Math.hypot((cx - x) / cx, (cy - y) / cy) / Math.SQRT2;
      if (rng() < 0.52 * (1 - r * r * 0.55)) {
        const c = fills[shadeAt(r, n)]; // bright core → dark fringe
        g[y][x] = c;
        if (sym) g[y][S - 1 - x] = c;
      }
    }
  }
  for (let k = 0, ns = ri(rng, 3, 6); k < ns; k++) {
    const x = ri(rng, 0, S - 1), y = ri(rng, 0, S - 1);
    g[y][x] = 'h';
    if (sym) g[y][S - 1 - x] = 'h';
  }
  return g;
}

const FORMS = [
  { label: 'Creature', fn: formCreature, outline: true },
  { label: 'Orb', fn: formOrb, outline: true },
  { label: 'Crystal', fn: formCrystal, outline: true },
  { label: 'Sigil', fn: formSigil, outline: false },
  { label: 'Totem', fn: formTotem, outline: true },
  { label: 'Nebula', fn: formNebula, outline: false },
];

/** Wrap the silhouette in the outline colour for definition. */
function applyOutline(g, S) {
  const out = g.map((row) => row.slice());
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (g[y][x] !== '.') continue;
      if (
        (inb(g, x, y - 1) && g[y - 1][x] !== '.') ||
        (inb(g, x, y + 1) && g[y + 1][x] !== '.') ||
        (inb(g, x - 1, y) && g[y][x - 1] !== '.') ||
        (inb(g, x + 1, y) && g[y][x + 1] !== '.')
      ) out[y][x] = 'o';
    }
  }
  return out;
}

const countFilled = (g) => g.reduce((n, row) => n + row.filter((c) => c !== '.').length, 0);

// ---------------- naming: coined syllables + catalog designation ----------------
const ONSET = ['', 'z', 'v', 'k', 'x', 'th', 'dr', 'br', 'ph', 'sy', 'ny', 'kr', 'vl', 'zh', 'q', 'tr', 'gl', 'st', 'ax', 'sk', 'my', 'os', 'wr'];
const NUCLEUS = ['a', 'e', 'i', 'o', 'u', 'ae', 'ei', 'y', 'io', 'au', 'ou', 'ya', 'eo', 'ia'];
const CODA = ['', 'n', 'x', 'r', 's', 'l', 'th', 'rn', 'sk', 'll', 'ph', 'nx', 'z', 'ix', 'ar', 'on', 'el', 'is', 'or', 'yn'];
const GREEK = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Sigma', 'Omega', 'Zeta', 'Theta', 'Kappa', 'Nyx', 'Eta', 'Rho'];

function syllable(rng) {
  return pick(rng, ONSET) + pick(rng, NUCLEUS) + pick(rng, CODA);
}
function coined(rng) {
  let n = syllable(rng) || 'a';
  if (chance(rng, 0.62)) n += (chance(rng, 0.28) ? "'" : '') + syllable(rng);
  return n.charAt(0).toUpperCase() + n.slice(1);
}
function roman(n) {
  const m = [['X', 10], ['IX', 9], ['V', 5], ['IV', 4], ['I', 1]];
  let r = '';
  for (const [s, v] of m) while (n >= v) { r += s; n -= v; }
  return r;
}
function makeName(rng, rarity) {
  let name = coined(rng);
  const r = rng();
  if (r < 0.4) name += '-' + ri(rng, 2, 9) + pick(rng, ['A', 'F', 'X', 'Z', 'K', 'V', 'N']);
  else if (r < 0.64) name += ' ' + roman(ri(rng, 1, 12));
  else if (r < 0.84) name += ' ' + pick(rng, GREEK);
  if (rarity === 'legendary' && chance(rng, 0.6)) name = 'The ' + name;
  return name;
}

/**
 * Forge a single piece from a generator definition.
 * @param {{id:string, tier:number, weights:object}} generator
 * @returns frozen, serialisable piece object
 */
export function generateArt(generator) {
  const seed = (Math.floor(Math.random() * 0xffffffff) ^ Date.now()) >>> 0;
  const rng = makeRng(seed);
  const rarity = rollRarity(rng, generator.weights);
  const spec = RARITY_SPEC[rarity];
  const { pal, scheme } = buildPalette(rng, spec);
  const S = spec.size;
  const fills = FILL.slice(0, spec.colors);

  let form = pick(rng, FORMS);
  let g = form.fn(rng, spec, S, fills);
  if (countFilled(g) < 5) { form = FORMS[0]; g = form.fn(rng, spec, S, fills); } // safety net
  if (form.outline) g = applyOutline(g, S);

  return {
    id: uid('art'),
    seed,
    gen: generator.id,
    tier: generator.tier,
    rarity,
    glow: spec.glow,
    form: form.label,
    scheme,
    name: makeName(rng, rarity),
    grid: g.map((row) => row.join('')),
    palette: pal,
    createdAt: Date.now(),
  };
}

// ---------------- Commemorative Relics ----------------
// Earned by completing a subject — never bought. A relic is a framed
// CELESTIAL MEDALLION (a ringed world haloed by an ornate frame) — a
// silhouette the random Foundry can never roll — and its colour comes
// entirely from the TIER you earned, Bronze through Ruby, so how deep
// you went on a subject reads at a glance. Relic names are drawn from
// real astronomy vocabulary ("<Subject> Nova"), which is what keeps
// them distinct from the Foundry's coined-gibberish abstract art.

// Tiers ranked by total hours studied on the subject at completion.
// `pal` is a fixed 5-shade ramp (a..e) + outline (o) + highlight (h);
// `color` is the representative swatch used for borders/labels in the UI.
export const RELIC_TIERS = [
  { key: 'bronze',   label: 'Bronze',   minHours: 0,   color: '#cd7f32',
    pal: { a: '#e0a262', b: '#c97f33', c: '#8a4f1d', d: '#f4cf9a', e: '#5b3411', o: '#241204', h: '#ffe9c9' } },
  { key: 'silver',   label: 'Silver',   minHours: 10,  color: '#c0c8d4',
    pal: { a: '#dfe6f0', b: '#b7c0cf', c: '#828b9e', d: '#ffffff', e: '#565d6e', o: '#181b22', h: '#ffffff' } },
  { key: 'gold',     label: 'Gold',     minHours: 25,  color: '#f5c518',
    pal: { a: '#ffe07a', b: '#f5c518', c: '#c69209', d: '#fff3b0', e: '#876004', o: '#271d00', h: '#fffbe0' } },
  { key: 'platinum', label: 'Platinum', minHours: 50,  color: '#9fc4cf',
    pal: { a: '#cfeef2', b: '#9fc4cf', c: '#6f93a0', d: '#eafbff', e: '#486069', o: '#101c20', h: '#ffffff' } },
  { key: 'diamond',  label: 'Diamond',  minHours: 100, color: '#74d6f5',
    pal: { a: '#b6ecff', b: '#74d6f5', c: '#3fa8d6', d: '#e6fbff', e: '#2b7ba3', o: '#06222e', h: '#ffffff' } },
  { key: 'ruby',     label: 'Ruby',     minHours: 200, color: '#ec1f4b',
    pal: { a: '#ff6b85', b: '#ec1f4b', c: '#a50f30', d: '#ff9fb0', e: '#6e0a20', o: '#2a020c', h: '#ffe0e6' } },
];

/** The tier a subject earns for `minutes` of total study time. */
export function relicTierForMinutes(minutes = 0) {
  const hrs = minutes / 60;
  let tier = RELIC_TIERS[0];
  for (const t of RELIC_TIERS) if (hrs >= t.minHours) tier = t;
  return tier;
}

/** Look up a tier by key (falls back to Bronze). */
export function getRelicTier(key) {
  return RELIC_TIERS.find((t) => t.key === key) || RELIC_TIERS[0];
}

// Real astronomy vocabulary — deliberately NOT the coined gibberish the
// Foundry uses, so a relic always reads as "<Subject> <celestial word>".
const CELESTIAL = [
  'Nova', 'Nebula', 'Quasar', 'Pulsar', 'Horizon', 'Singularity', 'Supernova',
  'Constellation', 'Aurora', 'Zenith', 'Corona', 'Meridian', 'Halo', 'Nexus',
  'Vortex', 'Cluster', 'Eclipse', 'Apex', 'Radiant', 'Beacon',
];
function makeRelicName(rng, subjectName) {
  return `${subjectName} ${pick(rng, CELESTIAL)}`;
}

// A framed celestial medallion: ornate double frame + corner studs around
// a ringed world with a tilted ring and a sheen. The Foundry's forms never
// produce this silhouette, so relics never collide with forged art.
function formRelicMedallion(S, fills) {
  const g = blank(S);
  const c = (S - 1) / 2;
  const frame = fills[2];
  for (let i = 1; i < S - 1; i++) {
    g[1][i] = frame; g[S - 2][i] = frame; g[i][1] = frame; g[i][S - 2] = frame;
  }
  for (const [yy, xx] of [[1, 1], [1, S - 2], [S - 2, 1], [S - 2, S - 2]]) g[yy][xx] = 'h';
  // ringed world filling the frame
  const R = c - 3;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = Math.hypot(x - c, y - c);
      if (d <= R) {
        const t = d / R;
        g[y][x] = t < 0.42 ? fills[3] : t < 0.78 ? fills[0] : fills[1];
      }
    }
  }
  // tilted ring sweeping across the world
  for (let x = 2; x < S - 2; x++) {
    const yy = Math.round(c + (x - c) * 0.22);
    if (inb(g, x, yy) && g[yy][x] !== '.') g[yy][x] = fills[1];
    if (inb(g, x, yy - 1) && g[yy - 1][x] !== '.') g[yy - 1][x] = fills[2];
  }
  // sheen highlight
  const sx = Math.round(c - R * 0.4), sy = Math.round(c - R * 0.4);
  if (inb(g, sx, sy) && g[sy][sx] !== '.') g[sy][sx] = 'h';
  return g;
}

/**
 * Forge a commemorative relic for a completed subject. Always
 * legendary-grade, Celestial-Medallion form, palette fixed by tier.
 * @param {{subjectName:string, minutes:number, dateISO:string, tierKey?:string}} info
 */
export function generateRelic({ subjectName, minutes = 0, dateISO, tierKey }) {
  const tier = tierKey ? getRelicTier(tierKey) : relicTierForMinutes(minutes);
  const seed = (Math.floor(Math.random() * 0xffffffff) ^ Date.now()) >>> 0;
  const rng = makeRng(seed);
  const S = RARITY_SPEC.legendary.size;
  const fills = FILL.slice(0, 5);
  const g = applyOutline(formRelicMedallion(S, fills), S);
  return {
    id: uid('relic'),
    seed,
    gen: 'milestone',
    tier: tier.key,
    tierLabel: tier.label,
    tierColor: tier.color,
    rarity: 'legendary',
    glow: true,
    kind: 'relic',
    form: 'Celestial Medallion',
    engraving: subjectName,
    minutes,
    earnedAt: dateISO,
    name: makeRelicName(rng, subjectName),
    grid: g.map((row) => row.join('')),
    palette: { ...tier.pal },
    createdAt: Date.now(),
  };
}

/** Render any stored piece (generated or migrated) to an SVG string. */
export function artSVG(piece, scale = 4) {
  if (!piece || !piece.grid) return '';
  return spriteSVG(piece.grid, piece.palette, scale);
}

/** A scale that fits a piece into roughly `box` px (for cards/modals). */
export function fitScale(piece, box) {
  const n = piece?.grid?.length || 12;
  return Math.max(2, Math.floor(box / n));
}

/** Short hex signature shown to the user, e.g. "A3F90C". */
export function seedSig(piece) {
  if (piece?.seed == null) return '——';
  return piece.seed.toString(16).toUpperCase().padStart(8, '0').slice(-6);
}
