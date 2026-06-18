/* ============================================================
   The Shop — the single place you spend Credits. Purchasable
   cosmetic tracks:
     • Astronaut Suits — recolour your avatar (equippable)
     • Dashboard Themes — incl. planet themes that recolour the UI
   The relics you earn by completing subjects live in your Profile.
   ============================================================ */

import { getState, update } from '../state.js';
import { CATALOG, CATEGORIES, RARITY, canAfford, getCosmetic } from '../cosmetics.js';
import { modal, toast } from '../ui.js';
import { applyTheme } from '../hud.js';
import { fmtCredits } from '../util.js';

export function renderShop(root, { rerenderAll }) {
  const s = getState();

  root.innerHTML = `
    <section class="panel">
      <div class="between">
        <div class="panel-title" style="margin:0">The Shop</div>
        <div class="hud-credits pixel" style="font-size:10px">◈ ${fmtCredits(s.user.credits)} Credits</div>
      </div>
      <div class="muted" style="margin-top:8px;font-size:11px">Earn 1 Credit per 100 XP. Recolour your suit and unlock planet themes — and earn one-of-a-kind relics by completing subjects, shown in your <b>Profile</b>.</div>
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

  catsBox.querySelectorAll('.shop-card[data-cosmetic]').forEach((el) =>
    el.addEventListener('click', () => openItem(el.dataset.cosmetic, rerenderAll))
  );
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
