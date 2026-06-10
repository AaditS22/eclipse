/* ============================================================
   Cosmetics — the equippable things you spend Credits on. Two tracks:
     • Astronaut Suits  — recolour your avatar (equippable)
     • Dashboard Themes — incl. planet themes that recolour the UI
   These render alongside the Forges and your collection in the
   unified Shop (see views/shop.js). All cosmetic. Legendary items
   want credits AND a minimum level.
   ============================================================ */

import { astronautSVG, planetIconSVG } from './pixel/sprites.js';

export const RARITY = {
  common: { label: 'Common', order: 0 },
  uncommon: { label: 'Uncommon', order: 1 },
  rare: { label: 'Rare', order: 2 },
  epic: { label: 'Epic', order: 3 },
  legendary: { label: 'Legendary', order: 4 },
};

// `slot` = avatarConfig key an item equips into (suits, themes).
// `type:'collect'` items don't equip — they just join your collection.
export const CATALOG = [
  // ---- Astronaut suits ----
  { id: 'suit-default', name: 'Standard Suit', category: 'Astronaut Suits', slot: 'suit', rarity: 'common', cost: 0, level: 1, preview: (s) => astronautSVG({ suit: 'suit-default', visor: 'visor-gold' }, s) },
  { id: 'suit-neon', name: 'Neon Purple', category: 'Astronaut Suits', slot: 'suit', rarity: 'uncommon', cost: 8, level: 1, preview: (s) => astronautSVG({ suit: 'suit-neon', visor: 'visor-gold' }, s) },
  { id: 'suit-galaxy', name: 'Galaxy Print', category: 'Astronaut Suits', slot: 'suit', rarity: 'rare', cost: 16, level: 4, preview: (s) => astronautSVG({ suit: 'suit-galaxy', visor: 'visor-stardust' }, s) },
  { id: 'suit-solar', name: 'Solar Flare', category: 'Astronaut Suits', slot: 'suit', rarity: 'epic', cost: 26, level: 8, preview: (s) => astronautSVG({ suit: 'suit-solar', visor: 'visor-alien' }, s) },
  { id: 'suit-blackhole', name: 'Black Hole Suit', category: 'Astronaut Suits', slot: 'suit', rarity: 'legendary', cost: 45, level: 16, preview: (s) => astronautSVG({ suit: 'suit-blackhole', visor: 'visor-nebula' }, s) },

  // ---- Dashboard themes (change --accent). Planet themes use a planet preview. ----
  { id: 'theme-nebula', name: 'Nebula', category: 'Dashboard Themes', slot: 'theme', rarity: 'common', cost: 0, level: 1, accent: '#7c5cfc', preview: () => swatch('#7c5cfc') },
  { id: 'theme-arctic', name: 'Arctic', category: 'Dashboard Themes', slot: 'theme', rarity: 'uncommon', cost: 10, level: 1, accent: '#22d3ee', preview: () => swatch('#22d3ee') },
  { id: 'theme-mars', name: 'Mars Red', category: 'Dashboard Themes', slot: 'theme', rarity: 'rare', cost: 14, level: 4, accent: '#ff4c61', planet: 'mars', preview: (s) => planetIconSVG('mars', s) },
  { id: 'theme-jupiter', name: 'Jupiter', category: 'Dashboard Themes', slot: 'theme', rarity: 'rare', cost: 16, level: 5, accent: '#fb923c', planet: 'jupiter', preview: (s) => planetIconSVG('jupiter', s) },
  { id: 'theme-saturn', name: 'Saturn Gold', category: 'Dashboard Themes', slot: 'theme', rarity: 'epic', cost: 22, level: 8, accent: '#f5c518', planet: 'saturn', preview: (s) => planetIconSVG('saturn', s) },
  { id: 'theme-neptune', name: 'Neptune Deep', category: 'Dashboard Themes', slot: 'theme', rarity: 'epic', cost: 24, level: 10, accent: '#3b82f6', planet: 'neptune', preview: (s) => planetIconSVG('neptune', s) },
  { id: 'theme-void', name: 'Void', category: 'Dashboard Themes', slot: 'theme', rarity: 'legendary', cost: 40, level: 14, accent: '#e8eaf0', preview: () => swatch('#e8eaf0') },
];

export const CATEGORIES = [...new Set(CATALOG.map((c) => c.category))];

export function getCosmetic(id) {
  return CATALOG.find((c) => c.id === id);
}

/** Validate whether a user can purchase an item. */
export function canAfford(item, user) {
  if (user.credits < item.cost) return { ok: false, reason: 'Not enough Credits' };
  if (user.level < item.level) return { ok: false, reason: `Requires Level ${item.level}` };
  return { ok: true };
}

// ---- small inline previews ----
function swatch(color) {
  return `<div style="width:40px;height:40px;border:2px solid var(--border);background:${color}"></div>`;
}
