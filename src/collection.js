/* ============================================================
   The Foundry — generator catalogue + collection helpers.
   Generators are the gacha-style art forges: each costs Credits,
   produces 3 pieces, and you keep one. Stronger forges weight the
   rarity roll harder, which in turn yields richer pixel art.
   ============================================================ */

import { RARITY } from './cosmetics.js';
import { collectibleArt } from './pixel/sprites.js';
import { uid } from './util.js';

// Weights are relative; they don't need to sum to 100.
export const GENERATORS = [
  {
    id: 'forge-scrap',
    name: 'Scrap Forge',
    tier: 1,
    cost: 5,
    blurb: 'Salvaged parts welded by hand. Cheap pulls, humble odds — but the cosmos is strange, and even scrap gets lucky.',
    weights: { common: 62, uncommon: 28, rare: 9, epic: 1, legendary: 0 },
  },
  {
    id: 'forge-nova',
    name: 'Nova Forge',
    tier: 2,
    cost: 12,
    blurb: 'Stellar-grade synthesis. Vivid palettes, real shot at the good stuff, and the occasional epic.',
    weights: { common: 30, uncommon: 38, rare: 22, epic: 9, legendary: 1 },
  },
  {
    id: 'forge-quantum',
    name: 'Quantum Forge',
    tier: 3,
    cost: 24,
    blurb: 'Bleeding-edge probability collapse. The only forge that can fold a legendary into being.',
    weights: { common: 8, uncommon: 26, rare: 34, epic: 24, legendary: 8 },
  },
];

export function getGenerator(id) {
  return GENERATORS.find((g) => g.id === id);
}

/** Odds as integer percentages for display (sorted high→low rarity). */
export function rarityOdds(generator) {
  const total = Object.values(generator.weights).reduce((a, b) => a + b, 0);
  return ['legendary', 'epic', 'rare', 'uncommon', 'common']
    .filter((r) => generator.weights[r] > 0)
    .map((r) => ({ rarity: r, pct: Math.round((generator.weights[r] / total) * 100) }));
}

// ---- legacy migration -------------------------------------------------
// Older builds kept collected space objects as `col-*` inventory entries
// with a single `featuredCollectible`. We fold those into the new
// collection so nothing a player earned is lost, capturing each one's
// frozen art exactly as it looked.
const LEGACY = [
  { id: 'col-star', sprite: 'star', name: 'Lone Star', rarity: 'common' },
  { id: 'col-moon', sprite: 'moon', name: 'Crescent Moon', rarity: 'common' },
  { id: 'col-meteor', sprite: 'meteor', name: 'Meteor', rarity: 'uncommon' },
  { id: 'col-comet', sprite: 'comet', name: 'Comet', rarity: 'uncommon' },
  { id: 'col-satellite', sprite: 'satellite', name: 'Satellite', rarity: 'rare' },
  { id: 'col-telescope', sprite: 'telescope', name: 'Telescope', rarity: 'rare' },
  { id: 'col-ufo', sprite: 'ufo', name: 'UFO', rarity: 'epic' },
  { id: 'col-galaxy', sprite: 'galaxy', name: 'Spiral Galaxy', rarity: 'epic' },
  { id: 'col-alien', sprite: 'alien', name: 'Little Green Friend', rarity: 'epic' },
  { id: 'col-blackhole', sprite: 'blackhole', name: 'Black Hole', rarity: 'legendary' },
];

/** One-time: convert any owned legacy collectibles into collection pieces. */
export function migrateLegacyCollection(state) {
  const u = state.user;
  if (u.collectionMigrated) return;
  u.collectionMigrated = true;
  u.collection = u.collection || [];

  for (const L of LEGACY) {
    if (!state.inventory.includes(L.id)) continue;
    const art = collectibleArt(L.sprite);
    if (!art) continue;
    const wasFeatured = u.featuredCollectible === L.id;
    const piece = {
      id: uid('art'),
      seed: null,
      gen: 'legacy',
      tier: 0,
      rarity: L.rarity,
      glow: RARITY[L.rarity].order >= 3,
      name: L.name,
      grid: art.grid,
      palette: art.palette,
      createdAt: Date.now(),
    };
    u.collection.push(piece);
    if (wasFeatured) u.featuredArt = piece.id;
    // drop the old inventory entry so it no longer appears anywhere
    state.inventory = state.inventory.filter((i) => i !== L.id);
  }
  u.featuredCollectible = null;
}

/** The currently featured piece object, or null. */
export function featuredPiece(state) {
  const id = state.user.featuredArt;
  return id ? state.user.collection.find((p) => p.id === id) || null : null;
}
