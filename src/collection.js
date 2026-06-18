/* ============================================================
   Collection helpers — your earned pieces live here.

   The collection holds commemorative Relics (earned by completing a
   subject) plus any art migrated from older builds. The retired
   Foundry's gacha forges no longer mint new pieces, but anything
   already earned stays displayable.
   ============================================================ */

import { RARITY } from './cosmetics.js';
import { collectibleArt } from './pixel/sprites.js';
import { uid } from './util.js';

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
