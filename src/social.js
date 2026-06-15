/* ============================================================
   Social layer (Tier 1) over Supabase — friends, presence, board.

   Three concerns, all guarded by RLS in db/social.sql:
   - profile projection: a thin PUBLIC slice of the player (name,
     handle, level, avatar, weekly totals) mirrored from local state
     on every save, so friends can see each other without exposing
     the private game blob in `saves`.
   - friendships: request / accept / remove.
   - presence: who is studying now. Written only on timer start/stop;
     elapsed time is derived client-side from started_at, so there
     are no heartbeat writes. Reads are friend-scoped by RLS, and
     respect the player's ghost / hide-subject settings on write.

   Mirrors auth.js: if Supabase isn't configured, everything no-ops.
   ============================================================ */

import { supabase } from './supabaseClient.js';
import { getState, update } from './state.js';
import { isoDate } from './util.js';
import { rankProgress } from './rank.js';

export const socialEnabled = () => !!supabase;

// Set once the user is known (login); cleared on logout.
let currentUserId = null;
export const getSocialUserId = () => currentUserId;
export function setSocialUser(id) { currentUserId = id; }
export function clearSocialUser() { currentUserId = null; }

/* ---------------- helpers ---------------- */

/** Monday (local) of the week containing `d`, as yyyy-mm-dd. */
function weekStartISO(d = new Date()) {
  const sinceMonday = (d.getDay() + 6) % 7; // Sun=0 -> 6, Mon=1 -> 0, ...
  return isoDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() - sinceMonday));
}

/** Monday (local) of the current week — so callers can tell if a friend's
 *  cached weekly_* totals belong to this week or a stale one. */
export const currentWeekStartISO = () => weekStartISO();

/** Minutes + XP logged since this week's Monday, from local sessions. */
function weeklyTotals(state) {
  const weekStart = weekStartISO();
  const cutoff = new Date(weekStart + 'T00:00:00').getTime();
  let minutes = 0, xp = 0;
  for (const s of state.sessions || []) {
    if (s.startTime >= cutoff) { minutes += s.durationMinutes; xp += s.xpEarned || 0; }
  }
  return { weekStart, minutes: Math.round(minutes), xp: Math.round(xp) };
}

function slugify(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 12) || 'cmdr';
}
function randSuffix() {
  return Math.random().toString(36).slice(2, 6);
}

/**
 * Ensure the player has a stable, unique @handle. Reuses one already in
 * local state, recovers an existing one from the server (new device), or
 * mints a fresh one. Returns the handle.
 */
export async function ensureHandle() {
  const st = getState();
  if (st.user.handle) return st.user.handle;
  if (!supabase || !currentUserId) return null;

  let handle = null;
  try {
    const { data } = await supabase.from('profiles').select('handle').eq('id', currentUserId).maybeSingle();
    handle = data?.handle || null;
  } catch { /* ignore — we'll mint one */ }

  if (!handle) handle = `${slugify(st.user.username)}-${randSuffix()}`;
  update((s) => { s.user.handle = handle; });
  return handle;
}

/* ---------------- profile projection ---------------- */

let syncTimer = null;
/** Debounced public-profile sync. Safe to call on every persist. */
export function syncProfile() {
  if (!supabase || !currentUserId) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(flushProfile, 1200);
}

async function flushProfile() {
  if (!supabase || !currentUserId) return;
  const st = getState();
  try {
    let handle = await ensureHandle();
    const wk = weeklyTotals(st);
    const totalMinutes = Math.round((st.sessions || []).reduce((a, x) => a + x.durationMinutes, 0));
    const rp = rankProgress(st.rank?.monthlyXp || 0);

    const row = {
      id: currentUserId,
      handle,
      username: st.user.username,
      level: st.user.level,
      avatar_config: st.user.avatarConfig,
      planet_id: rp.planet.id,
      planet_name: rp.planet.name,
      total_minutes: totalMinutes,
      current_streak: st.user.streak,
      weekly_minutes: wk.minutes,
      weekly_xp: wk.xp,
      week_start: wk.weekStart,
      collection: st.user.collection || [],
      featured_art: st.user.featuredArt || null,
      updated_at: new Date().toISOString(),
    };

    let { error } = await supabase.from('profiles').upsert(row);
    // Handle collision (someone else minted the same handle) — remint once.
    if (error && error.code === '23505') {
      handle = `${slugify(st.user.username)}-${randSuffix()}`;
      update((s) => { s.user.handle = handle; });
      row.handle = handle;
      ({ error } = await supabase.from('profiles').upsert(row));
    }
    if (error) console.warn('[Eclipse] Profile sync failed:', error.message);
  } catch (e) {
    console.warn('[Eclipse] Profile sync error:', e.message);
  }
}

export async function getMyProfile() {
  if (!supabase || !currentUserId) return null;
  const { data } = await supabase.from('profiles').select('*').eq('id', currentUserId).maybeSingle();
  return data;
}

/* ---------------- friendships ---------------- */

// Friend search + pending-request lookups read the thin public view, since
// the base profiles table is friends-only by RLS.
const PUBLIC_COLS = 'id, handle, username, level, avatar_config, planet_name';
const PUBLIC_VIEW = 'profiles_public';

/** Accepted friends → [{ friendshipId, profile }]. */
export async function listFriends() {
  if (!supabase || !currentUserId) return [];
  const { data: fr, error } = await supabase
    .from('friendships')
    .select('id, requester, addressee')
    .eq('status', 'accepted');
  if (error) throw error;
  if (!fr.length) return [];

  const ids = fr.map((f) => (f.requester === currentUserId ? f.addressee : f.requester));
  const { data: profs } = await supabase.from('profiles').select('*').in('id', ids);
  const byId = Object.fromEntries((profs || []).map((p) => [p.id, p]));

  return fr.map((f) => {
    const otherId = f.requester === currentUserId ? f.addressee : f.requester;
    return { friendshipId: f.id, profile: byId[otherId] || { id: otherId, username: 'Unknown', handle: '' } };
  });
}

/** Pending requests → { incoming: [{id, profile}], outgoing: [...] }. */
export async function listRequests() {
  if (!supabase || !currentUserId) return { incoming: [], outgoing: [] };
  const { data, error } = await supabase
    .from('friendships')
    .select('id, requester, addressee')
    .eq('status', 'pending');
  if (error) throw error;

  const ids = [...new Set(data.map((f) => (f.requester === currentUserId ? f.addressee : f.requester)))];
  let byId = {};
  if (ids.length) {
    const { data: profs } = await supabase.from(PUBLIC_VIEW).select(PUBLIC_COLS).in('id', ids);
    byId = Object.fromEntries((profs || []).map((p) => [p.id, p]));
  }
  const blank = (id) => ({ id, username: 'Cadet', handle: '' });
  return {
    incoming: data.filter((f) => f.addressee === currentUserId).map((f) => ({ id: f.id, profile: byId[f.requester] || blank(f.requester) })),
    outgoing: data.filter((f) => f.requester === currentUserId).map((f) => ({ id: f.id, profile: byId[f.addressee] || blank(f.addressee) })),
  };
}

/** Search profiles by name or @handle (excludes self). */
export async function searchUsers(q) {
  if (!supabase || !currentUserId) return [];
  const term = String(q || '').replace(/^@/, '').replace(/[^a-zA-Z0-9 _-]/g, '').trim();
  if (!term) return [];
  const { data, error } = await supabase
    .from(PUBLIC_VIEW)
    .select(PUBLIC_COLS)
    .or(`handle.ilike.%${term}%,username.ilike.%${term}%`)
    .neq('id', currentUserId)
    .limit(10);
  if (error) throw error;
  return data || [];
}

export async function sendRequest(targetId) {
  if (!supabase || !currentUserId) return;
  if (targetId === currentUserId) throw new Error("That's your own code.");
  const { error } = await supabase
    .from('friendships')
    .insert({ requester: currentUserId, addressee: targetId, status: 'pending' });
  if (error) {
    if (error.code === '23505') throw new Error('You already have a request or friendship with them.');
    throw error;
  }
}

/** Accept (status→accepted) or, when accept=false, delete the row (decline/cancel). */
export async function respondRequest(friendshipId, accept) {
  if (!supabase) return;
  if (accept) {
    const { error } = await supabase
      .from('friendships')
      .update({ status: 'accepted', updated_at: new Date().toISOString() })
      .eq('id', friendshipId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('friendships').delete().eq('id', friendshipId);
    if (error) throw error;
  }
}

export async function removeFriend(friendshipId) {
  if (!supabase) return;
  const { error } = await supabase.from('friendships').delete().eq('id', friendshipId);
  if (error) throw error;
}

/* ---------------- leaderboard ---------------- */

/** Friends + you, ranked by THIS week's study minutes (stale weeks → 0). */
export async function getLeaderboard() {
  if (!supabase || !currentUserId) return [];
  const [friends, me] = await Promise.all([listFriends(), getMyProfile()]);
  const ws = weekStartISO();
  const rows = [];
  const push = (p, isMe) => {
    if (!p) return;
    const weekly = p.week_start === ws ? (p.weekly_minutes || 0) : 0;
    rows.push({ id: p.id, username: p.username, handle: p.handle, level: p.level, avatar: p.avatar_config, weeklyMinutes: weekly, isMe });
  };
  friends.forEach((f) => push(f.profile, false));
  push(me, true);
  rows.sort((a, b) => b.weeklyMinutes - a.weeklyMinutes);
  return rows;
}

/* ---------------- presence ---------------- */

/**
 * Publish the player's study status. Honors ghost mode (publish nothing
 * meaningful) and hide-subject (status without the subject name).
 */
export async function publishPresence({ studying = false, subject = '', startedAt = null } = {}) {
  if (!supabase || !currentUserId) return;
  const st = getState();
  const ghost = !!st.settings?.ghostMode;
  const on = studying && !ghost;
  const row = {
    user_id: currentUserId,
    is_studying: on,
    subject: on && !st.settings?.hideSubject ? (subject || null) : null,
    started_at: on ? new Date(startedAt || Date.now()).toISOString() : null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('presence').upsert(row);
  if (error) console.warn('[Eclipse] Presence update failed:', error.message);
}

/** Current presence rows for a set of friend ids → { userId: row }. */
export async function fetchFriendsPresence(friendIds) {
  if (!supabase || !friendIds.length) return {};
  const { data, error } = await supabase.from('presence').select('*').in('user_id', friendIds);
  if (error) {
    console.warn('[Eclipse] Presence fetch failed:', error.message);
    return {};
  }
  return Object.fromEntries((data || []).map((p) => [p.user_id, p]));
}

/** Subscribe to friends' presence changes (RLS scopes rows to friends). */
export function subscribePresence(onChange) {
  if (!supabase) return () => {};
  const channel = supabase
    .channel('presence-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'presence' }, (payload) => onChange(payload))
    .subscribe();
  return () => supabase.removeChannel(channel);
}

/* ---------------- activity feed (today's history) ---------------- */

/**
 * Mirror a finished session to the friends activity feed. Opt-out via the
 * `hideActivity` setting; honors `hideSubject` (logs a generic label instead
 * of the subject name). Friend-scoped by RLS; no-ops without cloud/login.
 */
export async function logStudySession({ subject, minutes, startTime, endTime }) {
  if (!supabase || !currentUserId) return;
  const st = getState();
  if (st.settings?.hideActivity) return; // explicit opt-out
  const mins = Math.round(Number(minutes) || 0);
  if (mins < 1) return;
  const end = new Date(endTime);
  const row = {
    user_id: currentUserId,
    subject: st.settings?.hideSubject ? 'Focus session' : (String(subject || '').trim() || 'Study'),
    minutes: mins,
    started_at: new Date(startTime).toISOString(),
    ended_at: end.toISOString(),
    // Bucket by the END day so a session that crosses midnight shows up under
    // the day it finished — matching the ended_at the feed displays/filters on.
    day: isoDate(end),
  };
  const { error } = await supabase.from('study_log').insert(row);
  if (error) console.warn('[Eclipse] Activity log failed:', error.message);
}

/**
 * Friends' study sessions for a given local day (default: today), newest
 * first. RLS already restricts rows to accepted friends + yourself.
 */
export async function fetchFriendsActivity(friendIds, day = isoDate()) {
  if (!supabase || !friendIds.length) return [];
  const { data, error } = await supabase
    .from('study_log')
    .select('user_id, subject, minutes, ended_at')
    .in('user_id', friendIds)
    .eq('day', day)
    .order('ended_at', { ascending: false })
    .limit(100);
  if (error) {
    console.warn('[Eclipse] Activity fetch failed:', error.message);
    return [];
  }
  return data || [];
}
