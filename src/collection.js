/* ============================================================
   Collection helpers — your earned pieces live here.

   The collection holds commemorative Relics (earned by completing a
   subject). The Foundry's gacha forges and the old space-object
   collectibles are both retired; any forged art left in a saved
   collection is purged on load so only relics remain.
   ============================================================ */

// Old `col-*` inventory ids from builds that had space-object collectibles.
// They no longer represent anything ownable, so we strip them on load.
const LEGACY_IDS = [
  'col-star', 'col-moon', 'col-meteor', 'col-comet', 'col-satellite',
  'col-telescope', 'col-ufo', 'col-galaxy', 'col-alien', 'col-blackhole',
];

/**
 * One-time cleanup of retired content. Drops any forged art from the
 * collection (only commemorative relics are kept) and removes the old
 * space-object collectibles. Idempotent — safe to run on every load.
 */
export function purgeForgedArt(state) {
  const u = state.user;
  u.collection = u.collection || [];

  // Only relics survive; everything else was forged/legacy art.
  u.collection = u.collection.filter((p) => p.kind === 'relic');
  if (u.featuredArt && !u.collection.some((p) => p.id === u.featuredArt)) {
    u.featuredArt = null;
  }

  // Drop retired collectible inventory entries + their featured pointer.
  state.inventory = (state.inventory || []).filter((i) => !LEGACY_IDS.includes(i));
  u.featuredCollectible = null;
  u.collectionMigrated = true;
}

/** The currently featured piece object, or null. */
export function featuredPiece(state) {
  const id = state.user.featuredArt;
  return id ? state.user.collection.find((p) => p.id === id) || null : null;
}
