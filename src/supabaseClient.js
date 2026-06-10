/* ============================================================
   Supabase client. Reads its config from Vite env vars:
     VITE_SUPABASE_URL
     VITE_SUPABASE_ANON_KEY
   The anon key is public by design — Row Level Security on the
   `saves` table is what actually protects each user's data.

   If the env vars are absent, `supabase` is null and the app runs
   in local-only mode (no accounts, progress kept in localStorage),
   so development and the first deploy work before you wire it up.
   ============================================================ */

import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && key
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

if (!supabase) {
  console.warn('[Eclipse] Supabase not configured — running in local-only mode (no accounts).');
}
