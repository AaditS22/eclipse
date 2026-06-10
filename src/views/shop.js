/* ============================================================
   The Shop — the single place you spend Credits. One purchasable
   surface, three sections:
     • Forges          — gacha art generators; each pull mints 3, keep 1
     • Astronaut Suits — recolour your avatar (equippable)
     • Dashboard Themes — incl. planet themes that recolour the UI
   What you forge (and the relics you earn) lives in your Profile.
   ============================================================ */

import { getState, update } from '../state.js';
import { CATALOG, CATEGORIES, RARITY, canAfford, getCosmetic } from '../cosmetics.js';
import { modal, toast } from '../ui.js';
import { applyTheme } from '../hud.js';
import { GENERATORS, getGenerator, rarityOdds } from '../collection.js';
import { generateArt, artSVG, fitScale } from '../pixel/artgen.js';

const RARITY_COLOR = {
  common: '#6b7280',
  uncommon: '#39d98a',
  rare: '#3b82f6',
  epic: '#7c5cfc',
  legendary: '#f5c518',
};

export function renderShop(root, { rerenderAll }) {
  const s = getState();

  root.innerHTML = `
    <section class="panel">
      <div class="between">
        <div class="panel-title" style="margin:0">The Shop</div>
        <div class="hud-credits pixel" style="font-size:10px">◈ ${s.user.credits} Credits</div>
      </div>
      <div class="muted" style="margin-top:8px;font-size:11px">Earn 1 Credit per 100 XP. Forge one-of-a-kind art, recolour your suit, and unlock planet themes. Everything you forge shows up in your <b>Profile</b>.</div>
    </section>

    <section class="panel">
      <div class="panel-title">Forges</div>
      <div class="muted" style="font-size:11px;margin-bottom:10px">Each pull mints three abstract pieces — keep the one you love, scrap the rest. Pricier forges roll richer art.</div>
      <div class="forge-grid">${GENERATORS.map((g) => forgeCardHTML(g, s)).join('')}</div>
    </section>

    <div id="shop-cats"></div>
  `;

  const catsBox = root.querySelector('#shop-cats');
  catsBox.innerHTML = CATEGORIES.map((cat) => {
    const items = CATALOG.filter((c) => c.category === cat);
    return `<section class="panel">
      <div class="panel-title">${cat}</div>
      <div class="shop-grid">${items.map((it) => cardHTML(it, s)).join('')}</div>
    </section>`;
  }).join('');

  root.querySelectorAll('.forge-btn').forEach((btn) =>
    btn.addEventListener('click', () => forge(btn.dataset.gen, rerenderAll))
  );
  catsBox.querySelectorAll('.shop-card[data-cosmetic]').forEach((el) =>
    el.addEventListener('click', () => openItem(el.dataset.cosmetic, rerenderAll))
  );
}

/* ---------------- Forges ---------------- */
function forgeCardHTML(gen, s) {
  const afford = s.user.credits >= gen.cost;
  const odds = rarityOdds(gen)
    .map((o) => `<span class="forge-odd"><i style="background:${RARITY_COLOR[o.rarity]}"></i>${o.pct}% ${RARITY[o.rarity].label}</span>`)
    .join('');
  return `<div class="forge-card forge-t${gen.tier}">
    <div class="between">
      <div class="forge-name">${gen.name}</div>
      <div class="forge-cost">◈ ${gen.cost}</div>
    </div>
    <div class="forge-blurb muted">${gen.blurb}</div>
    <div class="forge-odds">${odds}</div>
    <button class="btn ${afford ? 'btn-primary' : ''} forge-btn" data-gen="${gen.id}" ${afford ? '' : 'disabled'}>
      ${afford ? '⚙ Forge ×3' : `Need ◈ ${gen.cost}`}
    </button>
  </div>`;
}

// forge flow: deduct, mint 3, pick 1
function forge(genId, rerenderAll) {
  const gen = getGenerator(genId);
  const s = getState();
  if (s.user.credits < gen.cost) { toast('Not enough Credits.'); return; }

  const picks = [generateArt(gen), generateArt(gen), generateArt(gen)];
  update((st) => { st.user.credits -= gen.cost; });

  const cards = picks
    .map(
      (p, i) => `<div class="pull-card" data-idx="${i}" style="--rar:${RARITY_COLOR[p.rarity]}">
        <div class="pull-art ${p.glow ? 'glow' : ''}">${artSVG(p, fitScale(p, 78))}</div>
        <div class="pull-name">${p.name}</div>
        <div class="pull-rar" style="color:${RARITY_COLOR[p.rarity]}">${RARITY[p.rarity].label}</div>
      </div>`
    )
    .join('');

  const close = modal(
    `<h2 class="center">${gen.name}</h2>
     <p class="center muted" style="font-size:11px;margin:-4px 0 12px">Three minted from the void. Pick the one to keep — the rest are scrapped.</p>
     <div class="pull-row">${cards}</div>`,
    [{ label: 'Keep none (scrap all)', className: 'btn-ghost', onClick: (c) => { c(); toast('All three scrapped.'); rerenderAll(); } }]
  );

  document.querySelectorAll('.pull-card').forEach((el) => {
    el.addEventListener('click', () => {
      const piece = picks[Number(el.dataset.idx)];
      update((st) => {
        st.user.collection.push(piece);
        if (!st.user.featuredArt) st.user.featuredArt = piece.id; // auto-feature your first
      });
      close();
      toast(`Kept: ${piece.name} (${RARITY[piece.rarity].label})`);
      rerenderAll();
    });
  });
}

/* ---------------- Cosmetics (suits / themes) ---------------- */
function cardHTML(item, s) {
  const owned = s.inventory.includes(item.id);
  const equipped = s.user.avatarConfig[item.slot] === item.id;
  const legendary = item.rarity === 'legendary';
  const cls = [
    'shop-card',
    owned ? 'owned' : 'locked',
    equipped ? 'equipped' : '',
    legendary ? 'rar-legendary-border' : '',
  ].join(' ');

  let status;
  if (!owned) {
    status = `<div class="c-cost">${item.cost === 0 ? 'FREE' : `◈ ${item.cost}`}${item.level > 1 ? ` · Lv${item.level}` : ''}</div>`;
  } else {
    status = `<div class="c-cost" style="color:${equipped ? 'var(--green)' : 'var(--muted)'}">${equipped ? 'EQUIPPED' : 'OWNED'}</div>`;
  }

  return `<div class="${cls}" data-cosmetic="${item.id}">
    <div class="rarity-dot rar-${item.rarity}"></div>
    <div class="preview">${item.preview(4)}</div>
    ${!owned ? `<div class="lock">🔒</div>` : ''}
    <div class="c-name">${item.name}</div>
    ${status}
  </div>`;
}

function openItem(id, rerenderAll) {
  const item = getCosmetic(id);
  const s = getState();
  const owned = s.inventory.includes(id);
  const equipped = s.user.avatarConfig[item.slot] === id;

  const rarityLabel = RARITY[item.rarity].label;
  const meta = `
    <div class="center" style="margin:8px 0 14px">${item.preview(6)}</div>
    <div class="summary-row"><span>Rarity</span><span class="v"><span class="rarity-dot rar-${item.rarity}" style="position:static;display:inline-block;margin-right:6px"></span>${rarityLabel}</span></div>
    <div class="summary-row"><span>Type</span><span class="v">${item.category}</span></div>
    ${item.level > 1 ? `<div class="summary-row"><span>Level Required</span><span class="v">${item.level}</span></div>` : ''}
    <div class="summary-row"><span>Cost</span><span class="v">${item.cost === 0 ? 'Free' : `◈ ${item.cost}`}</span></div>
  `;

  const actions = [{ label: 'Close', className: 'btn-ghost', onClick: (c) => c() }];

  if (!owned) {
    const aff = canAfford(item, s.user);
    actions.push({
      label: aff.ok ? 'Purchase' : aff.reason,
      className: aff.ok ? 'btn-primary' : 'btn',
      onClick: (close) => {
        if (!aff.ok) { toast(aff.reason); return; }
        update((st) => {
          st.user.credits -= item.cost;
          st.inventory.push(item.id);
          st.user.avatarConfig[item.slot] = item.id; // auto-equip
        });
        applyTheme();
        close();
        toast(`Unlocked & equipped: ${item.name}`);
        rerenderAll();
      },
    });
  } else if (!equipped) {
    actions.push({
      label: 'Equip',
      className: 'btn-green',
      onClick: (close) => {
        update((st) => { st.user.avatarConfig[item.slot] = item.id; });
        applyTheme();
        close();
        toast(`Equipped: ${item.name}`);
        rerenderAll();
      },
    });
  }

  modal(`<h2>${item.name}</h2>${meta}`, actions);
}
