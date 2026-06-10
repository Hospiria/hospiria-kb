-- =============================================================================
-- Migration 034 — Note version history + Todo event log
--
-- note_versions: full content snapshot on every meaningful note save.
--   One row per save. Lets admins/TLs see who changed a note and what it said.
--
-- todo_events: lightweight event log for task state changes.
--   Rows written by the API on create, status change, title change, assign, delete.
--
-- RLS: both tables mirror their parent's access rules.
--   Personal items (team_id IS NULL) — owner only.
--   Team items — team members + super_admin.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. note_versions
-- ---------------------------------------------------------------------------
create table if not exists note_versions (
  id             uuid primary key default gen_random_uuid(),
  note_id        uuid not null references notes(id) on delete cascade,
  version_number int  not null,
  title          text not null default '',
  body           text not null default '',
  content        jsonb,
  changed_by     uuid references profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (note_id, version_number)
);
create index if not exists note_versions_note_idx    on note_versions(note_id);
create index if not exists note_versions_created_idx on note_versions(created_at desc);

alter table note_versions enable row level security;

drop policy if exists "read accessible note versions" on note_versions;
create policy "read accessible note versions" on note_versions
  for select using (
    exists (
      select 1 from notes n where n.id = note_id and (
        n.owner_id = auth.uid()
        or note_shared_with_me(note_id)
        or (n.team_id is not null and has_team_access(n.team_id))
        or (n.team_id is not null and get_my_role() = 'super_admin')
      )
    )
  );

-- INSERT gated by same access rules; service client is used for writes from the API.
drop policy if exists "insert note versions" on note_versions;
create policy "insert note versions" on note_versions
  for insert with check (
    changed_by = auth.uid()
    and exists (
      select 1 from notes n where n.id = note_id and (
        n.owner_id = auth.uid()
        or note_shared_with_me(note_id)
        or (n.team_id is not null and has_team_access(n.team_id))
        or (n.team_id is not null and get_my_role() = 'super_admin')
      )
    )
  );

-- Versions are immutable — no UPDATE or DELETE policies.

-- ---------------------------------------------------------------------------
-- 2. todo_events
-- ---------------------------------------------------------------------------
create table if not exists todo_events (
  id         uuid primary key default gen_random_uuid(),
  todo_id    uuid not null references todos(id) on delete cascade,
  -- event_type values:
  --   created | title_changed | detail_changed | status_changed
  --   priority_changed | due_date_changed | assigned | unassigned
  --   completed | uncompleted | deleted | restored
  event_type text not null,
  actor_id   uuid references profiles(id) on delete set null,
  old_value  text,   -- human-readable previous value (or user UUID for assigned/unassigned)
  new_value  text,   -- human-readable new value
  created_at timestamptz not null default now()
);
create index if not exists todo_events_todo_idx    on todo_events(todo_id);
create index if not exists todo_events_created_idx on todo_events(created_at desc);

alter table todo_events enable row level security;

drop policy if exists "read accessible todo events" on todo_events;
create policy "read accessible todo events" on todo_events
  for select using (
    exists (
      select 1 from todos t where t.id = todo_id and (
        t.owner_id    = auth.uid()
        or t.assignee_id = auth.uid()
        or (t.team_id is not null and has_team_access(t.team_id))
        or (t.team_id is not null and get_my_role() = 'super_admin')
        or is_todo_assignee(todo_id)
      )
    )
  );

drop policy if exists "insert todo events" on todo_events;
create policy "insert todo events" on todo_events
  for insert with check (
    actor_id = auth.uid()
    and exists (
      select 1 from todos t where t.id = todo_id and (
        t.owner_id    = auth.uid()
        or t.assignee_id = auth.uid()
        or (t.team_id is not null and has_team_access(t.team_id))
        or (t.team_id is not null and get_my_role() = 'super_admin')
        or is_todo_assignee(todo_id)
      )
    )
  );

-- Events are immutable — no UPDATE or DELETE policies.
