-- =============================================================================
-- Migration 023 — Custom to-do lists + manual ordering
--
-- Adds user/team-created lists (like ClickUp lists), a list_id on todos, and a
-- position column for manual ordering (fixes new tasks dropping to the bottom).
--
-- Run in: https://supabase.com/dashboard/project/gpdlfnvriwverwlhofzs/sql/new
-- =============================================================================

create table if not exists todo_lists (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references profiles(id) on delete cascade,
  team_id     uuid references teams(id) on delete cascade,  -- null = personal list
  name        text not null,
  color       text not null default '#14b8a6',
  icon        text,                                          -- optional emoji
  position    int  not null default 0,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists todo_lists_owner_idx on todo_lists(owner_id);
create index if not exists todo_lists_team_idx  on todo_lists(team_id);

-- Link todos to a list (optional) + manual ordering position
alter table todos add column if not exists list_id  uuid references todo_lists(id) on delete set null;
alter table todos add column if not exists position int not null default 0;
create index if not exists todos_list_idx on todos(list_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table todo_lists enable row level security;

drop policy if exists "read own or team lists" on todo_lists;
create policy "read own or team lists" on todo_lists
  for select using (
    owner_id = auth.uid()
    or (team_id is not null and has_team_access(team_id))
  );

drop policy if exists "insert own or team lists" on todo_lists;
create policy "insert own or team lists" on todo_lists
  for insert with check (
    owner_id = auth.uid()
    and (team_id is null or has_team_access(team_id))
  );

drop policy if exists "update own or team lists" on todo_lists;
create policy "update own or team lists" on todo_lists
  for update using (
    owner_id = auth.uid()
    or (team_id is not null and has_team_access(team_id))
  );

drop policy if exists "delete own or team lists" on todo_lists;
create policy "delete own or team lists" on todo_lists
  for delete using (
    owner_id = auth.uid()
    or (team_id is not null and has_team_access(team_id))
  );
