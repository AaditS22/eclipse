/* ============================================================
   Auth + cloud-save layer over Supabase.
   - Email/password auth (no SSO).
   - Each user's whole game state lives as one JSONB row in the
     `saves` table, keyed by their auth user id and guarded by RLS.
   Saves are debounced so rapid `update()` calls don't spam the API.
   ============================================================ */

import { supabase } from './supabaseClient.js';

export const authEnabled = () => !!supabase;

export async function getSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onAuthChange(cb) {
  if (!supabase) return;
  supabase.auth.onAuthStateChange((event, session) => cb(event, session));
}

export function signUp(email, password) {
  return supabase.auth.signUp({ email, password });
}

export function signIn(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}

export function signOut() {
  return supabase.auth.signOut();
}

/** Fetch a user's saved state, or null if they have no row yet. */
export async function loadSave(userId) {
  const { data, error } = await supabase
    .from('saves')
    .select('data')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data?.data ?? null;
}

// Debounced upsert so a burst of state changes collapses to one write.
let pushTimer = null;
let pending = null;
export function queueSave(userId, stateObj) {
  pending = stateObj;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(flushSave.bind(null, userId), 800);
}

async function flushSave(userId) {
  if (!pending) return;
  const data = pending;
  pending = null;
  const { error } = await supabase
    .from('saves')
    .upsert({ user_id: userId, data, updated_at: new Date().toISOString() });
  if (error) console.warn('[Eclipse] Cloud save failed:', error.message);
}
