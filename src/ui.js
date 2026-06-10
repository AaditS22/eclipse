/* ============================================================
   Shared UI effects: warp transition, toasts, XP popups, modals.
   ============================================================ */

import { prefersReducedMotion, escapeHtml, isoDate } from './util.js';
import { getState, update } from './state.js';
import { makeSubject, subjectTotalMinutes, completeSubjectInState } from './subjects.js';
import { artSVG, fitScale, getRelicTier, relicTierForMinutes } from './pixel/artgen.js';
import { confettiBurst } from './pixel/starfield.js';

/** Horizontal light-streak warp sweep on view changes (~300ms). */
export function warp() {
  const el = document.getElementById('warp');
  el.classList.remove('go');
  // force reflow so the animation restarts
  void el.offsetWidth;
  el.classList.add('go');
}

/** Floating "+150 XP" popup that drifts up and fades. */
export function xpPopup(text, anchorEl) {
  const el = document.createElement('div');
  el.className = 'xp-popup';
  el.textContent = text;
  document.body.appendChild(el);

  let x = window.innerWidth / 2;
  let y = window.innerHeight / 2;
  if (anchorEl) {
    const r = anchorEl.getBoundingClientRect();
    x = r.left + r.width / 2;
    y = r.top;
  }
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  el.style.transform = 'translate(-50%, -50%)';

  const dur = prefersReducedMotion() ? 600 : 1400;
  setTimeout(() => el.remove(), dur);
}

/** Brief toast notification near the bottom nav. */
export function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = msg;
  document.getElementById('overlay').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

/**
 * Open a modal. `bodyHTML` is inner content; `actions` is an array of
 * { label, className, onClick }. Returns a close() function.
 */
export function modal(bodyHTML, actions = []) {
  const scrim = document.createElement('div');
  scrim.className = 'modal-scrim';
  const box = document.createElement('div');
  box.className = 'modal';
  box.innerHTML = bodyHTML;

  const bar = document.createElement('div');
  bar.className = 'btn-row';
  bar.style.marginTop = '18px';
  bar.style.justifyContent = 'center';

  const close = () => scrim.remove();

  for (const a of actions) {
    const b = document.createElement('button');
    b.className = `btn ${a.className || ''}`;
    b.textContent = a.label;
    b.onclick = () => a.onClick?.(close);
    bar.appendChild(b);
  }
  if (actions.length) box.appendChild(bar);

  scrim.appendChild(box);
  scrim.addEventListener('mousedown', (e) => {
    if (e.target === scrim && actions.length === 0) close();
  });
  document.getElementById('overlay').appendChild(scrim);
  return close;
}

/**
 * Wire a subject autocomplete onto a text input.
 * @param {HTMLInputElement} input
 * @param {HTMLElement} listEl   container for the dropdown
 * @param {()=>string[]} getItems  candidate subject names
 */
export function attachAutocomplete(input, listEl, getItems) {
  let sel = -1;
  const close = () => {
    listEl.innerHTML = '';
    listEl.classList.add('hidden');
    sel = -1;
  };
  const render = () => {
    const q = input.value.trim().toLowerCase();
    const items = getItems()
      .filter((name) => name.toLowerCase().includes(q))
      .slice(0, 6);
    if (items.length === 0) return close();
    listEl.classList.remove('hidden');
    listEl.innerHTML = items
      .map((name, i) => `<div class="ac-item ${i === sel ? 'sel' : ''}" data-name="${name.replace(/"/g, '&quot;')}">${name}</div>`)
      .join('');
    listEl.querySelectorAll('.ac-item').forEach((el) => {
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        input.value = el.dataset.name;
        input.dispatchEvent(new Event('change'));
        close();
      });
    });
  };
  input.addEventListener('focus', render);
  input.addEventListener('input', () => { sel = -1; render(); });
  input.addEventListener('blur', () => setTimeout(close, 120));
  input.addEventListener('keydown', (e) => {
    const items = listEl.querySelectorAll('.ac-item');
    if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); render(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); render(); e.preventDefault(); }
    else if (e.key === 'Enter' && sel >= 0 && items[sel]) {
      input.value = items[sel].dataset.name;
      input.dispatchEvent(new Event('change'));
      close();
      e.preventDefault();
    } else if (e.key === 'Escape') close();
  });
}

/**
 * Modal to create a new subject (name + daily goal). Creates it in
 * state and calls back with the new subject record.
 * @param {(subject:object)=>void} onCreated
 */
export function promptNewSubject(onCreated) {
  modal(
    `<h2>New Subject</h2>
     <label class="field"><span>Subject name</span><input type="text" id="ns-name" placeholder="e.g. Calculus" autocomplete="off" /></label>
     <label class="field"><span>Daily goal (minutes)</span><input type="number" id="ns-goal" min="0" step="15" value="60" /></label>
     <p class="muted center" style="font-size:10px;margin:-2px 0 4px">Mark a subject complete whenever you decide it's done — that's when you forge its relic.</p>`,
    [
      { label: 'Cancel', className: 'btn-ghost', onClick: (c) => c() },
      {
        label: 'Add Subject',
        className: 'btn-primary',
        onClick: (c) => {
          const name = document.getElementById('ns-name').value.trim();
          const goal = Math.max(0, parseInt(document.getElementById('ns-goal').value, 10) || 0);
          if (!name) { toast('Enter a subject name.'); return; }
          const s = getState();
          if (s.subjects.some((x) => x.name.toLowerCase() === name.toLowerCase())) {
            toast('That subject already exists.');
            return;
          }
          const subject = makeSubject(name, goal, s.subjects.length);
          update((st) => { st.subjects.push(subject); st.onboarded = true; });
          c();
          toast(`Added ${subject.name}.`);
          onCreated?.(subject);
        },
      },
    ]
  );
  setTimeout(() => document.getElementById('ns-name')?.focus(), 50);
}

/**
 * Celebratory modal for a freshly forged relic. `onDone` fires when the
 * user dismisses it (so callers can re-render).
 * @param {object} relic  the minted relic piece
 * @param {{onDone?:()=>void}} [opts]
 */
export function celebrateRelic(relic, { onDone } = {}) {
  const tier = getRelicTier(relic.tier);
  const hrs = (relic.minutes / 60).toFixed(1).replace(/\.0$/, '');
  modal(
    `<h2 class="center">★ Subject Complete ★</h2>
     <div class="relic-award">
       <div class="relic-award-art" style="filter:drop-shadow(0 0 10px ${tier.color})">${artSVG(relic, fitScale(relic, 110))}</div>
       <div class="badge-ribbon" style="background:${tier.color};color:#0b0e1a;margin-bottom:6px">🏆 ${tier.label.toUpperCase()} RELIC — ${escapeHtml(relic.engraving)}</div>
       <div class="center" style="font-size:12px;margin-bottom:4px">${escapeHtml(relic.name)}</div>
       <div class="muted center" style="font-size:10px">${hrs} hours studied · forged ${relic.earnedAt}. Find it in the Shop.</div>
     </div>`,
    [{ label: 'Collect', className: 'btn-primary', onClick: (c) => { c(); onDone?.(); } }]
  );
  confettiBurst();
  setTimeout(() => toast(`🏆 ${relic.engraving} complete — ${tier.label} relic forged!`), 200);
}

/**
 * Ask whether the user is permanently done with a subject; on yes, forge
 * its relic and celebrate. Used both from the Subjects tab and right after
 * a study session ends.
 * @param {string} subjectName
 * @param {(completed:boolean)=>void} [onDone]  called after the flow resolves
 */
export function promptSubjectCompletion(subjectName, onDone) {
  const s = getState();
  const sub = s.subjects.find((x) => x.name === subjectName);
  if (!sub || sub.completedAt) { onDone?.(false); return; }

  const minutes = subjectTotalMinutes(s, sub.name);
  const tier = relicTierForMinutes(minutes);
  const hrs = (minutes / 60).toFixed(1).replace(/\.0$/, '');

  modal(
    `<h2>Done with ${escapeHtml(sub.name)}?</h2>
     <p class="center" style="font-size:12px;line-height:1.6">Are you finished studying <b>${escapeHtml(sub.name)}</b> permanently?<br><br>
     You've logged <b>${hrs}h</b>, which forges a <b style="color:${tier.color}">${tier.label}</b> relic. You won't be able to log more sessions to it afterward (you can reopen it later, but that removes the relic).</p>`,
    [
      { label: 'Keep studying', className: 'btn-ghost', onClick: (c) => { c(); onDone?.(false); } },
      {
        label: `Complete · ${tier.label} relic`,
        className: 'btn-green',
        onClick: (c) => {
          c();
          let relic = null;
          update((st) => { relic = completeSubjectInState(st, sub.id, isoDate()); });
          if (relic) celebrateRelic(relic, { onDone: () => onDone?.(true) });
          else onDone?.(false);
        },
      },
    ]
  );
}

/**
 * Fill a container with a subject <select> whose options are the
 * configured subjects plus an "+ Add new subject…" entry. Picking
 * "add" opens promptNewSubject and selects the result.
 * @param {HTMLElement} container
 * @param {{value?:string, disabled?:boolean, onChange:(name:string)=>void}} opts
 */
export function renderSubjectPicker(container, { value = '', disabled = false, onChange }) {
  // Completed subjects can no longer be studied, so they never appear here.
  const subjects = getState().subjects.filter((s) => !s.completedAt);
  const opts = subjects
    .map((s) => `<option value="${escapeHtml(s.name)}" ${s.name === value ? 'selected' : ''}>${escapeHtml(s.name)}</option>`)
    .join('');
  container.innerHTML = `<select class="subject-select" ${disabled ? 'disabled' : ''}>
      ${subjects.length === 0 ? '<option value="" disabled selected>No subjects yet</option>' : ''}
      ${!value && subjects.length ? '<option value="" disabled selected>Select a subject…</option>' : ''}
      ${opts}
      <option value="__add__">+ Add new subject…</option>
    </select>`;
  const sel = container.querySelector('select');
  sel.addEventListener('change', () => {
    if (sel.value === '__add__') {
      sel.value = value || '';
      promptNewSubject((subject) => {
        renderSubjectPicker(container, { value: subject.name, disabled, onChange });
        onChange?.(subject.name);
      });
      return;
    }
    onChange?.(sel.value);
  });
}

/** Confirm-style modal returning a promise. */
export function confirmModal(message, { okLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = {}) {
  return new Promise((resolve) => {
    modal(`<h2>Confirm</h2><p class="center">${message}</p>`, [
      { label: cancelLabel, className: 'btn-ghost', onClick: (c) => { c(); resolve(false); } },
      { label: okLabel, className: danger ? 'btn-red' : 'btn-primary', onClick: (c) => { c(); resolve(true); } },
    ]);
  });
}
