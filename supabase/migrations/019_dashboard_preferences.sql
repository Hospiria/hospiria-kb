-- =============================================================================
-- Migration 019 — Dashboard preferences (card visibility + order)
--
-- Each user can hide cards they don't want on their dashboard.
-- hidden_cards stores an array of card keys (e.g. ['notes_pinned', 'team_sops']).
--
-- Run in: https://supabase.com/dashboard/project/gpdlfnvriwverwlhofzs/sql/new
-- =============================================================================

create table if not exists dashboard_preferences (
  user_id     uuid primary key references profiles(id) on delete cascade,
  hidden_cards text[] not null default '{}',
  updated_at  timestamptz not null default now()
);

alter table dashboard_preferences enable row level security;

drop policy if exists "users manage own dashboard prefs" on dashboard_preferences;
create policy "users manage own dashboard prefs" on dashboard_preferences
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
