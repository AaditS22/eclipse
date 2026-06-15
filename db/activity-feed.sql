-- ============================================================
--  Eclipse — friends activity feed ("Today's Activity")
--
--  Run this ONCE in the Supabase SQL editor AFTER db/social.sql.
--  Idempotent: safe to re-run. Reuses public.are_friends() from social.sql.
--
--  study_log mirrors each FINISHED study session so friends can see a
--  history of what you studied today, not just your live status. Writes
--  happen once per session (on stop / countdown completion); the client
--  opts out via the "Hide today's activity" setting and blanks the
--  subject when "Hide subject" is on. Reads are friends-only by RLS.
-- ============================================================

create table if not exists public.study_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  subject    text not null,
  minutes    int  not null,
  started_at timestamptz not null,
  ended_at   timestamptz not null,
  day        date not null,                 -- studier's local day of ended_at (for "today" filtering)
  created_at timestamptz not null default now()
);
create index if not exists study_log_user_day_idx on public.study_log (user_id, day);

alter table public.study_log enable row level security;

-- Readable by you and your accepted friends; you only insert your own rows.
drop policy if exists studylog_select on public.study_log;
create policy studylog_select on public.study_log
  for select to authenticated
  using (auth.uid() = user_id or public.are_friends(auth.uid(), user_id));

drop policy if exists studylog_insert on public.study_log;
create policy studylog_insert on public.study_log
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists studylog_delete on public.study_log;
create policy studylog_delete on public.study_log
  for delete to authenticated
  using (auth.uid() = user_id);
