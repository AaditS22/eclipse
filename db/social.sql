-- ============================================================
--  Eclipse — social features (Tier 1: friends, presence, leaderboard)
--
--  Run this ONCE in the Supabase SQL editor (Dashboard → SQL Editor).
--  It is idempotent: safe to re-run. It assumes the existing `saves`
--  table from the cloud-save feature already exists.
--
--  What it creates:
--    profiles     - public-facing slice of each player (read by friends
--                   + anyone searching to add you). Synced from the client
--                   on every save; never holds the private game blob.
--    friendships  - one row per pair (requester/addressee, pending/accepted).
--    presence     - who is studying right now. Written only on timer
--                   start/stop; elapsed time is derived client-side from
--                   started_at, so there are no heartbeat writes.
--
--  Privacy model: presence + the richer profile fields are readable ONLY
--  by accepted friends (enforced by RLS via are_friends()). A minimal set
--  of profile columns is readable by any signed-in user so friend search
--  / pending requests can show a name + handle.
-- ============================================================

-- ---------- profiles ----------------------------------------
create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  handle         text unique not null,        -- shareable friend code, e.g. "nova-7x3k"
  username       text not null default 'Cmdr. Cadet',
  level          int  not null default 1,
  avatar_config  jsonb not null default '{}'::jsonb,
  planet_id      text not null default 'launch',
  planet_name    text not null default 'Launchpad',
  total_minutes  int  not null default 0,
  current_streak int  not null default 0,
  weekly_minutes int  not null default 0,
  weekly_xp      int  not null default 0,
  week_start     date,                         -- Monday of the week weekly_* counts
  updated_at     timestamptz not null default now()
);

-- case-insensitive handle lookups for friend search
create index if not exists profiles_handle_lower_idx on public.profiles (lower(handle));
create index if not exists profiles_username_lower_idx on public.profiles (lower(username));

-- ---------- friendships -------------------------------------
create table if not exists public.friendships (
  id         uuid primary key default gen_random_uuid(),
  requester  uuid not null references auth.users(id) on delete cascade,
  addressee  uuid not null references auth.users(id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester <> addressee)
);

-- One relationship per unordered pair — blocks both duplicate requests and
-- A→B / B→A racing into two rows.
create unique index if not exists friendships_pair_uidx
  on public.friendships (least(requester, addressee), greatest(requester, addressee));

create index if not exists friendships_requester_idx on public.friendships (requester);
create index if not exists friendships_addressee_idx on public.friendships (addressee);

-- ---------- presence ----------------------------------------
create table if not exists public.presence (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  is_studying boolean not null default false,
  subject     text,                            -- null when hidden ("hide subject")
  started_at  timestamptz,
  updated_at  timestamptz not null default now()
);

-- ---------- helper: are two users accepted friends? ---------
-- SECURITY DEFINER so it can see friendship rows regardless of the caller's
-- RLS context; it only ever returns a boolean, never leaks rows.
create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester = a and f.addressee = b)
        or (f.requester = b and f.addressee = a))
  );
$$;

-- ============================================================
--  Row Level Security
-- ============================================================
alter table public.profiles    enable row level security;
alter table public.friendships enable row level security;
alter table public.presence    enable row level security;

-- ---- profiles ----
-- The full profile row (incl. weekly/total stats) is readable only by the
-- owner and accepted friends. A thin public slice for friend search lives in
-- the profiles_public view below.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (auth.uid() = id or public.are_friends(auth.uid(), id));

-- You may only create/update your own profile row.
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (auth.uid() = id);

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Thin, searchable public slice. Owned by the table owner, so it is NOT
-- subject to the friends-only RLS above and can back friend search / pending
-- requests. It exposes only non-sensitive columns (no study totals/streaks).
create or replace view public.profiles_public as
  select id, handle, username, level, avatar_config, planet_name
  from public.profiles;

grant select on public.profiles_public to authenticated;

-- ---- friendships ----
-- You can see rows you are part of.
drop policy if exists friendships_select on public.friendships;
create policy friendships_select on public.friendships
  for select to authenticated
  using (auth.uid() = requester or auth.uid() = addressee);

-- You can only send a request as yourself.
drop policy if exists friendships_insert on public.friendships;
create policy friendships_insert on public.friendships
  for insert to authenticated
  with check (auth.uid() = requester);

-- Either party can update the row (accept request / etc). The status CHECK
-- on the column keeps it to pending/accepted.
drop policy if exists friendships_update on public.friendships;
create policy friendships_update on public.friendships
  for update to authenticated
  using (auth.uid() = requester or auth.uid() = addressee)
  with check (auth.uid() = requester or auth.uid() = addressee);

-- Either party can remove the relationship (decline / cancel / unfriend).
drop policy if exists friendships_delete on public.friendships;
create policy friendships_delete on public.friendships
  for delete to authenticated
  using (auth.uid() = requester or auth.uid() = addressee);

-- ---- presence ----
-- Read your own row, or a friend's.
drop policy if exists presence_select on public.presence;
create policy presence_select on public.presence
  for select to authenticated
  using (auth.uid() = user_id or public.are_friends(auth.uid(), user_id));

drop policy if exists presence_insert on public.presence;
create policy presence_insert on public.presence
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists presence_update on public.presence;
create policy presence_update on public.presence
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
--  Realtime — stream friends' presence changes to the client.
--  RLS above still applies to realtime, so a client only receives
--  presence rows it is allowed to read (its own + friends').
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'presence'
  ) then
    alter publication supabase_realtime add table public.presence;
  end if;
end $$;
