/* ============================================================
   Pixel-art for commemorative Relics + shared rendering.

   Relics are earned by completing a subject (never bought). A relic
   is a framed CELESTIAL MEDALLION — a ringed world haloed by an
   ornate frame — coloured entirely by the TIER you earned (Bronze
   through Ruby), so how deep you went on a subject reads at a glance.

   A relic is frozen into state (grid + palette), so it renders
   identically forever. `artSVG` / `fitScale` / `seedSig` render any
   stored piece — relics today, plus anything migrated from older
   builds (e.g. the retired Foundry's forged art).
   ============================================================ */

import { spriteSVG } from './sprites.js';
import { uid } from '../util.js';

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
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

// ---- low-level grid helpers ----
const FILL = ['a', 'b', 'c', 'd', 'e'];
const blank = (S) => Array.from({ length: S }, () => Array(S).fill('.'));
const inb = (g, x, y) => y >= 0 && y < g.length && x >= 0 && x < g[0].length;

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

// ---------------- Commemorative Relics ----------------
// Earned by completing a subject — never bought. A relic is a framed
// CELESTIAL MEDALLION (a ringed world haloed by an ornate frame), and
// its colour comes entirely from the TIER you earned, Bronze through
// Ruby, so how deep you went on a subject reads at a glance. Relic names
// are drawn from real astronomy vocabulary ("<Subject> Nova").

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

// Real astronomy vocabulary, so a relic always reads as "<Subject> <word>".
const CELESTIAL = [
  'Nova', 'Nebula', 'Quasar', 'Pulsar', 'Horizon', 'Singularity', 'Supernova',
  'Constellation', 'Aurora', 'Zenith', 'Corona', 'Meridian', 'Halo', 'Nexus',
  'Vortex', 'Cluster', 'Eclipse', 'Apex', 'Radiant', 'Beacon',
];
function makeRelicName(rng, subjectName) {
  return `${subjectName} ${pick(rng, CELESTIAL)}`;
}

// A framed celestial medallion: ornate double frame + corner studs around
// a ringed world with a tilted ring and a sheen.
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
 * Celestial-Medallion form, palette fixed by tier.
 * @param {{subjectName:string, minutes:number, dateISO:string, tierKey?:string}} info
 */
export function generateRelic({ subjectName, minutes = 0, dateISO, tierKey }) {
  const tier = tierKey ? getRelicTier(tierKey) : relicTierForMinutes(minutes);
  const seed = (Math.floor(Math.random() * 0xffffffff) ^ Date.now()) >>> 0;
  const rng = makeRng(seed);
  const S = 17; // medallions render on a fixed 17×17 grid
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

// ---------------- rendering ----------------

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
