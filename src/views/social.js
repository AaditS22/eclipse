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
import { escapeHtml, fmtDuration, fmtClock, fmtTime, minutesOfDay } from '../util.js';
import { astronautSVG, planetIconSVG } from '../pixel/sprites.js';
import { artSVG, fitScale, getRelicTier } from '../pixel/artgen.js';
import { toast, confirmModal, modal } from '../ui.js';
import * as timer from '../timerStore.js';
import {
  socialEnabled, ensureHandle, listFriends, listRequests, getLeaderboard,
  fetchFriendsPresence, searchUsers, sendRequest, respondRequest, removeFriend,
  subscribePresence, publishPresence, fetchFriendsActivity, currentWeekStartISO,
  fetchFriendCollection,
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
    <label class="toggle-row"><input type="checkbox" id="crew-activity" ${settings?.hideActivity ? 'checked' : ''}/> <span>Hide today's activity<br><small class="muted">Keep your finished sessions off friends' feed — they'll still see when you're live.</small></span></label>
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
  root.querySelector('#crew-activity')?.addEventListener('change', (e) => {
    update((st) => { st.settings.hideActivity = e.target.checked; });
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

  const friendIds = friends.map((f) => f.profile.id);
  const [presence, activity] = await Promise.all([
    fetchFriendsPresence(friendIds),
    fetchFriendsActivity(friendIds),
  ]);
  const studyingNow = friends
    .map((f) => ({ f, p: presence[f.profile.id] }))
    .filter((x) => x.p && x.p.is_studying && x.p.started_at);

  if (!body.isConnected) return;

  body.innerHTML =
    studyingSection(studyingNow) +
    activitySection(activity, friends) +
    requestsSection(requests) +
    friendsSection(friends, presence) +
    leaderboardSection(board);

  if (!body.isConnected) return;
  wireBody(body, root);
  wireProfileLinks(body, friends);
  startTicker(body);
}

/** Make friend rows + activity headers open a read-only friend profile. */
function wireProfileLinks(body, friends) {
  const profById = Object.fromEntries(friends.map((f) => [f.profile.id, f.profile]));
  body.querySelectorAll('[data-profile]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('button')) return; // let row buttons (e.g. remove) act normally
      const prof = profById[el.dataset.profile];
      if (prof) openFriendProfile(prof).catch((err) => toast(err.message || 'Could not load profile.'));
    });
  });
}

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

/** Today's finished sessions from friends (history, even when not live).
 *  Grouped per friend so a busy day shows one header + its sessions, not a
 *  repeated name/avatar for each. `activity` is newest-first, so each group's
 *  order (and the groups themselves) stay newest-first. */
function activitySection(activity, friends) {
  const byId = Object.fromEntries(friends.map((f) => [f.profile.id, f.profile]));

  // Bucket sessions by friend, preserving first-seen (newest) order.
  const order = [];
  const groups = {};
  for (const a of activity) {
    if (!byId[a.user_id]) continue; // a friend we can't resolve — skip
    if (!groups[a.user_id]) { groups[a.user_id] = []; order.push(a.user_id); }
    groups[a.user_id].push(a);
  }

  const rows = order
    .map((uid) => {
      const prof = byId[uid];
      const sessions = groups[uid];
      const totalMin = sessions.reduce((sum, a) => sum + (a.minutes || 0), 0);
      const sessionRows = sessions
        .map((a) => {
          const when = fmtTime(minutesOfDay(new Date(a.ended_at)));
          const subj = a.subject ? escapeHtml(a.subject) : 'a focus session';
          return `<div class="act-session">
            <span class="act-subj muted">Studied ${subj} · ${escapeHtml(fmtDuration(a.minutes))}</span>
            <span class="crew-mins muted" style="font-size:9px">${escapeHtml(when)}</span>
          </div>`;
        })
        .join('');
      const tally = sessions.length > 1
        ? `${sessions.length} sessions · ${escapeHtml(fmtDuration(totalMin))}`
        : escapeHtml(fmtDuration(totalMin));
      return `<div class="act-group">
        <div class="crew-row crew-clickable" data-profile="${uid}">
          <div class="crew-av">${astronautSVG(prof.avatar_config || {}, 3)}</div>
          <div class="crew-id">
            <div class="crew-name">${escapeHtml(prof.username)}</div>
            <div class="crew-sub muted">${tally}</div>
          </div>
        </div>
        <div class="act-sessions">${sessionRows}</div>
      </div>`;
    })
    .join('');
  return `<section class="panel">
    <div class="panel-title">📜 Today's Activity</div>
    ${rows || `<div class="muted center" style="padding:14px;font-size:12px">No study sessions logged by friends today, yet.</div>`}
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
    return `<div class="crew-row crew-clickable" data-profile="${f.profile.id}">
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

/* ---------------- friend profile (read-only modal) ---------------- */
/** A friend's hub: their card + headline stats + the relics they've earned.
 *  The collection is heavy, so it's fetched on open (and cached on the
 *  profile object for re-opens) rather than carried by the friends list. */
async function openFriendProfile(profile) {
  if (!Array.isArray(profile.collection)) {
    const { collection, featuredArt } = await fetchFriendCollection(profile.id);
    profile.collection = collection;
    profile.featured_art = featuredArt;
  }
  const coll = profile.collection;
  const pieces = [...coll].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const relics = pieces.filter((p) => p.kind === 'relic');

  const totalMin = profile.total_minutes || 0;
  const hours = (totalMin / 60).toFixed(totalMin >= 600 ? 0 : 1).replace(/\.0$/, '');
  // weekly_* belongs to the current week if the friend's week_start is within a
  // couple of days of ours — a tolerance that absorbs cross-timezone Monday-
  // boundary skew while still zeroing out genuinely stale (last-week) totals.
  const myMonday = new Date(currentWeekStartISO() + 'T00:00:00').getTime();
  const theirMonday = profile.week_start ? new Date(profile.week_start + 'T00:00:00').getTime() : NaN;
  const freshWeek = Number.isFinite(theirMonday) && Math.abs(theirMonday - myMonday) <= 2 * 86400000;
  const weekMin = freshWeek ? (profile.weekly_minutes || 0) : 0;
  const featured = profile.featured_art ? relics.find((p) => p.id === profile.featured_art) : null;

  const featuredHTML = featured
    ? `<div class="pc-featured"><div class="pl-frame">${artSVG(featured, fitScale(featured, 56))}</div><div class="pl-cap">${escapeHtml(featured.name)}</div></div>`
    : '';

  const relicHTML = relics.length
    ? `<div class="polaroid-grid">${relics.map(friendPolaroid).join('')}</div>`
    : `<div class="muted center" style="padding:14px 4px;font-size:12px">No relics yet.</div>`;

  const body = `
    <h2>${escapeHtml(profile.username)}</h2>
    <div class="row" style="align-items:center;gap:12px;margin-bottom:14px">
      <div class="crew-av" style="width:48px;height:48px">${astronautSVG(profile.avatar_config || {}, 4)}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px">LVL ${profile.level || 1}</div>
        <div class="muted" style="font-size:10px">${planetIconSVG(profile.planet_id || 'launch', 2)} ${escapeHtml(profile.planet_name || 'Launchpad')}</div>
      </div>
      ${featuredHTML}
    </div>
    <div class="stat-grid" style="margin-bottom:4px">
      <div class="stat-box"><div class="v">${hours}h</div><div class="k">All Time</div></div>
      <div class="stat-box"><div class="v">${fmtDuration(weekMin)}</div><div class="k">This Week</div></div>
      <div class="stat-box"><div class="v">${profile.current_streak || 0}</div><div class="k">Day Streak</div></div>
    </div>
    <div class="panel-title" style="margin-top:16px">🏆 Relics${relics.length ? ` · ${relics.length}` : ''}</div>
    ${relicHTML}
  `;
  modal(body, [{ label: 'Close', className: 'btn-ghost', onClick: (c) => c() }]);
}

/** A non-interactive relic polaroid for the friend-profile modal. */
function friendPolaroid(p) {
  const rawTint = p.tierColor || getRelicTier(p.tier).color;
  const tint = /^#[0-9a-f]{6}$/i.test(rawTint) ? rawTint : '#6b7280';
  const tag = escapeHtml(`🏆 ${p.tierLabel || getRelicTier(p.tier).label}`);
  return `<figure class="polaroid" style="--tint:${tint}">
    <div class="pl-frame">${artSVG(p, fitScale(p, 104))}</div>
    <figcaption class="pl-cap">${escapeHtml(p.name)}</figcaption>
    <div class="pl-tag" style="color:${tint}">${tag}</div>
  </figure>`;
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
