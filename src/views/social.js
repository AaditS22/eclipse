/* ============================================================
   Friends — the social hub.
   - Your shareable @code + privacy toggles (ghost / hide subject)
   - Add friend (search by name or @code)
   - Pending requests (accept / decline / cancel)
   - Studying-now (live elapsed, driven by friends' presence)
   - Friends list (with live "studying" glow)
   - This week's leaderboard (study minutes since Monday)

   The header panel (code + toggles + search) is rendered once.
   The #crew-body re-renders on demand + on realtime presence pushes,
   so a typed search query is never clobbered mid-input.
   ============================================================ */

import { getState, update } from '../state.js';
import { escapeHtml, fmtDuration, fmtClock } from '../util.js';
import { astronautSVG } from '../pixel/sprites.js';
import { toast, confirmModal } from '../ui.js';
import * as timer from '../timerStore.js';
import {
  socialEnabled, ensureHandle, listFriends, listRequests, getLeaderboard,
  fetchFriendsPresence, searchUsers, sendRequest, respondRequest, removeFriend,
  subscribePresence, publishPresence,
} from '../social.js';

let presenceUnsub = null;
let tickInterval = null;

/** Tear down realtime + the elapsed ticker (called on view change). */
export function cleanupSocial() {
  if (presenceUnsub) { presenceUnsub(); presenceUnsub = null; }
  if (tickInterval) { clearInterval(tickInterval); tickInterval = null; }
}

export function renderSocial(root) {
  cleanupSocial();

  if (!socialEnabled()) {
    root.innerHTML = `<section class="panel"><div class="panel-title">Friends</div>
      <div class="muted center" style="padding:20px;font-size:12px">Friends features need cloud accounts, which aren't configured for this build.</div></section>`;
    return;
  }

  const s = getState();
  root.innerHTML = headerPanel(s.user.handle, s.settings) + `<div id="crew-body">${loadingHTML()}</div>`;
  wireHeader(root);

  // Mint a handle lazily if we don't have one yet, then patch the display.
  if (!s.user.handle) {
    ensureHandle().then((h) => {
      const el = root.querySelector('.crew-code');
      if (el && h) el.textContent = '@' + h;
    });
  }

  loadAndRender(root);
  presenceUnsub = subscribePresence(() => loadAndRender(root));
}

/* ---------------- header (rendered once) ---------------- */
function headerPanel(handle, settings) {
  return `
  <section class="panel">
    <div class="panel-title">Your Friend Code</div>
    <div class="crew-code-row">
      <code class="crew-code">@${escapeHtml(handle || '…')}</code>
      <button class="btn btn-ghost" id="crew-copy" style="font-size:8px">Copy</button>
    </div>
    <div class="muted" style="font-size:11px;margin:8px 0 14px">Share this so friends can add you.</div>
    <label class="toggle-row"><input type="checkbox" id="crew-ghost" ${settings?.ghostMode ? 'checked' : ''}/> <span>Ghost mode<br><small class="muted">Hide your studying status from everyone.</small></span></label>
    <label class="toggle-row"><input type="checkbox" id="crew-hidesubj" ${settings?.hideSubject ? 'checked' : ''}/> <span>Hide subject<br><small class="muted">Show that you're studying, but not what.</small></span></label>
  </section>
  <section class="panel">
    <div class="panel-title">Add Friend</div>
    <input type="text" id="crew-search" class="crew-search" placeholder="Search name or @code…" autocomplete="off" />
    <div id="crew-results"></div>
  </section>`;
}

function wireHeader(root) {
  root.querySelector('#crew-copy')?.addEventListener('click', async () => {
    const h = getState().user.handle || '';
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText('@' + h);
      toast('Friend code copied.');
    } catch {
      toast('Could not copy friend code.');
    }
  });
  root.querySelector('#crew-ghost')?.addEventListener('change', (e) => {
    update((st) => { st.settings.ghostMode = e.target.checked; });
    repushPresence();
  });
  root.querySelector('#crew-hidesubj')?.addEventListener('change', (e) => {
    update((st) => { st.settings.hideSubject = e.target.checked; });
    repushPresence();
  });

  const search = root.querySelector('#crew-search');
  let t;
  search?.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => doSearch(root, search.value), 250);
  });
}

/** Re-publish presence so a settings change takes effect immediately. */
function repushPresence() {
  const ts = timer.timerState();
  publishPresence({ studying: ts.running, subject: ts.subject, startedAt: ts.startedAt });
}

async function doSearch(root, q) {
  const box = root.querySelector('#crew-results');
  if (!box) return;
  if (!q.trim()) { box.innerHTML = ''; return; }
  let results;
  try {
    results = await searchUsers(q);
  } catch (e) {
    box.innerHTML = `<div class="muted" style="font-size:11px;padding:6px 0">${escapeHtml(e.message)}</div>`;
    return;
  }
  const currentQ = root.querySelector('#crew-search')?.value ?? '';
  if (currentQ.trim() !== q.trim()) return;

  if (!results.length) {
    box.innerHTML = `<div class="muted" style="font-size:11px;padding:6px 0">No one found.</div>`;
    return;
  }
  box.innerHTML = results.map((r) => `
    <div class="crew-row">
      <div class="crew-av">${astronautSVG(r.avatar_config || {}, 3)}</div>
      <div class="crew-id"><div class="crew-name">${escapeHtml(r.username)}</div><div class="crew-sub muted">@${escapeHtml(r.handle)}</div></div>
      <button class="btn btn-green" data-add="${r.id}" style="font-size:8px">Add</button>
    </div>`).join('');
  box.querySelectorAll('[data-add]').forEach((b) => {
    b.onclick = async () => {
      try {
        await sendRequest(b.dataset.add);
        toast('Request sent!');
        box.innerHTML = '';
        const inp = root.querySelector('#crew-search');
        if (inp) inp.value = '';
        loadAndRender(root);
      } catch (e) {
        toast(e.message || 'Could not send request.');
      }
    };
  });
}

/* ---------------- body (re-rendered on data / presence) ---------------- */
function loadingHTML() {
  return `<div class="muted center" style="padding:24px;font-size:12px">Loading friends…</div>`;
}

async function loadAndRender(root) {
  const body = root.querySelector('#crew-body');
  if (!body) return;

  let friends, requests, board;
  try {
    [friends, requests, board] = await Promise.all([listFriends(), listRequests(), getLeaderboard()]);
  } catch (e) {
    body.innerHTML = `<div class="muted center" style="padding:24px;font-size:12px">Couldn't load friends: ${escapeHtml(e.message)}</div>`;
    return;
  }

  const presence = await fetchFriendsPresence(friends.map((f) => f.profile.id));
  const studyingNow = friends
    .map((f) => ({ f, p: presence[f.profile.id] }))
    .filter((x) => x.p && x.p.is_studying && x.p.started_at);

  if (!body.isConnected) return;

  body.innerHTML =
    studyingSection(studyingNow) +
    requestsSection(requests) +
    friendsSection(friends, presence) +
    leaderboardSection(board);

  if (!body.isConnected) return;
  wireBody(body, root);
  startTicker(body);

function studyingSection(list) {
  const rows = list.map(({ f, p }) => {
    const started = new Date(p.started_at).getTime();
    const subj = p.subject ? `Studying ${escapeHtml(p.subject)}` : 'In a focus session';
    return `<div class="crew-row">
      <div class="crew-av studying">${astronautSVG(f.profile.avatar_config || {}, 3)}</div>
      <div class="crew-id">
        <div class="crew-name">${escapeHtml(f.profile.username)} <span class="crew-live">● LIVE</span></div>
        <div class="crew-sub muted">${subj}</div>
      </div>
      <div class="crew-elapsed" data-started="${started}">${fmtClock(Date.now() - started)}</div>
    </div>`;
  }).join('');
  return `<section class="panel">
    <div class="panel-title">🛰️ Studying Now${list.length ? ` · ${list.length}` : ''}</div>
    ${list.length ? rows : `<div class="muted center" style="padding:14px;font-size:12px">No friends studying right now. Be the one who starts.</div>`}
  </section>`;
}

function requestsSection(req) {
  if (!req.incoming.length && !req.outgoing.length) return '';
  const inc = req.incoming.map((r) => `<div class="crew-row">
      <div class="crew-av">${astronautSVG(r.profile.avatar_config || {}, 3)}</div>
      <div class="crew-id"><div class="crew-name">${escapeHtml(r.profile.username)}</div><div class="crew-sub muted">@${escapeHtml(r.profile.handle)}</div></div>
      <div class="crew-actions">
        <button class="btn btn-green" data-accept="${r.id}" style="font-size:8px">Accept</button>
        <button class="btn btn-ghost" data-decline="${r.id}" style="font-size:8px">Decline</button>
      </div>
    </div>`).join('');
  const out = req.outgoing.map((r) => `<div class="crew-row">
      <div class="crew-av">${astronautSVG(r.profile.avatar_config || {}, 3)}</div>
      <div class="crew-id"><div class="crew-name">${escapeHtml(r.profile.username)}</div><div class="crew-sub muted">@${escapeHtml(r.profile.handle)} · pending</div></div>
      <button class="btn btn-ghost" data-cancel="${r.id}" style="font-size:8px">Cancel</button>
    </div>`).join('');
  return `<section class="panel">
    <div class="panel-title">Requests</div>
    ${inc}${out}
  </section>`;
}

function friendsSection(friends, presence) {
  const rows = friends.map((f) => {
    const p = presence[f.profile.id];
    const studying = !!(p && p.is_studying);
    return `<div class="crew-row">
      <div class="crew-av${studying ? ' studying' : ''}">${astronautSVG(f.profile.avatar_config || {}, 3)}</div>
      <div class="crew-id">
        <div class="crew-name">${escapeHtml(f.profile.username)}</div>
        <div class="crew-sub muted">LVL ${f.profile.level || 1} · ${escapeHtml(f.profile.planet_name || 'Launchpad')}</div>
      </div>
      <button class="btn btn-ghost" data-remove="${f.friendshipId}" title="Remove friend" style="font-size:8px">✕</button>
    </div>`;
  }).join('');
  return `<section class="panel">
    <div class="panel-title">Friends · ${friends.length}</div>
    ${friends.length ? rows : `<div class="muted center" style="padding:14px;font-size:12px">No friends yet. Share your code or add someone above.</div>`}
  </section>`;
}

function medal(i) {
  return i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
}

function leaderboardSection(board) {
  const rows = board.map((r, i) => `<div class="crew-row${r.isMe ? ' me' : ''}">
      <div class="crew-rank">${medal(i)}</div>
      <div class="crew-av">${astronautSVG(r.avatar || {}, 3)}</div>
      <div class="crew-id"><div class="crew-name">${escapeHtml(r.username)}${r.isMe ? ' <span class="muted">(you)</span>' : ''}</div><div class="crew-sub muted">LVL ${r.level || 1}</div></div>
      <div class="crew-mins">${fmtDuration(r.weeklyMinutes)}</div>
    </div>`).join('');
  return `<section class="panel">
    <div class="panel-title">🏁 This Week's Leaderboard</div>
    <div class="muted" style="font-size:11px;margin-bottom:10px">Study time logged since Monday.</div>
    ${board.length > 1 || board.some((r) => r.weeklyMinutes > 0) ? rows : `<div class="muted center" style="padding:14px;font-size:12px">Add friends to compete on the board.</div>`}
  </section>`;
}

function wireBody(body, root) {
  const act = async (fn, msg) => {
    try { await fn(); if (msg) toast(msg); loadAndRender(root); }
    catch (e) { toast(e.message || 'Something went wrong.'); }
  };
  body.querySelectorAll('[data-accept]').forEach((b) => (b.onclick = () => act(() => respondRequest(b.dataset.accept, true), 'Friend added!')));
  body.querySelectorAll('[data-decline]').forEach((b) => (b.onclick = () => act(() => respondRequest(b.dataset.decline, false))));
  body.querySelectorAll('[data-cancel]').forEach((b) => (b.onclick = () => act(() => respondRequest(b.dataset.cancel, false))));
  body.querySelectorAll('[data-remove]').forEach((b) => (b.onclick = async () => {
    const ok = await confirmModal('Remove this friend?', { okLabel: 'Remove', danger: true });
    if (ok) act(() => removeFriend(b.dataset.remove));
  }));
}

/** 1s ticker that updates each live elapsed clock in-place. */
function startTicker(body) {
  if (tickInterval) clearInterval(tickInterval);
  const els = body.querySelectorAll('[data-started]');
  if (!els.length) return;
  tickInterval = setInterval(() => {
    body.querySelectorAll('[data-started]').forEach((el) => {
      el.textContent = fmtClock(Date.now() - Number(el.dataset.started));
    });
  }, 1000);
}
