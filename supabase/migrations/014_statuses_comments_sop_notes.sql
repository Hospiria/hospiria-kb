-- =============================================================================
-- Migration 014 — Custom todo statuses, todo comments, SOP notes
--
-- 1. todo_statuses  — admin-configurable status list (replaces open/done enum)
-- 2. todo_comments  — comment thread on each to-do with optional replies
-- 3. sop_notes      — personal or team annotations on a SOP (side panel)
--
-- Run in: https://supabase.com/dashboard/project/gpdlfnvriwverwlhofzs/sql/new
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Custom todo statuses
-- ---------------------------------------------------------------------------
create table if not exists todo_statuses (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,
  color     text not null default '#94a3b8',
  position  int  not null default 10,
  is_done   boolean not null default false,   -- todos with this status count as done
  is_default boolean not null default false,  -- pre-selected when creating a todo
  created_at timestamptz not null default now()
);

-- Seed defaults (ON CONFLICT DO NOTHING so re-running is safe)
insert into todo_statuses (name, color, position, is_done, is_default) values
  ('To Do',      '#94a3b8', 10, false, true ),
  ('In Progress','#3b82f6', 20, false, false),
  ('In Review',  '#f59e0b', 30, false, false),
  ('Completed',  '#10b981', 40, true,  false),
  ('Blocked',    '#ef4444', 50, false, false)
on conflict do nothing;

-- Drop the existing open/done check constraint on todos so status can be any text
alter table todos drop constraint if exists todos_status_check;

-- Add is_done flag for fast filtering (set by the API when status changes)
alter table todos add column if not exists is_done boolean not null default false;

-- Migrate existing data
update todos set status = 'To Do',     is_done = false where status = 'open';
update todos set status = 'Completed', is_done = true  where status = 'done';

-- ---------------------------------------------------------------------------
-- 2. Todo comments (flat + one level of replies)
-- ---------------------------------------------------------------------------
create table if not exists todo_comments (
  id        uuid primary key default gen_random_uuid(),
  todo_id   uuid not null references todos(id)  on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  parent_id uuid references todo_comments(id)   on delete cascade,
  body      text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists todo_comments_todo_idx   on todo_comments(todo_id);
create index if not exists todo_comments_parent_idx on todo_comments(parent_id);

drop trigger if exists todo_comments_set_updated_at on todo_comments;
create trigger todo_comments_set_updated_at before update on todo_comments
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. SOP notes (personal or team annotations)
-- ---------------------------------------------------------------------------
create table if not exists sop_notes (
  id        uuid primary key default gen_random_uuid(),
  sop_id    uuid not null references sops(id)     on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  team_id   uuid references teams(id)              on delete cascade,
  body      text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sop_notes_sop_idx on sop_notes(sop_id);

drop trigger if exists sop_notes_set_updated_at on sop_notes;
create trigger sop_notes_set_updated_at before update on sop_notes
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------
alter table todo_statuses enable row level security;
alter table todo_comments  enable row level security;
alter table sop_notes      enable row level security;

-- todo_statuses: any authenticated user reads; super_admin manages
drop policy if exists "read todo_statuses" on todo_statuses;
create policy "read todo_statuses" on todo_statuses
  for select using (auth.uid() is not null);

drop policy if exists "manage todo_statuses" on todo_statuses;
create policy "manage todo_statuses" on todo_statuses
  for all using (get_my_role() = 'super_admin')
  with check (get_my_role() = 'super_admin');

-- todo_comments: same access scope as the parent todo
drop policy if exists "read todo_comments" on todo_comments;
create policy "read todo_comments" on todo_comments
  for select using (
    exists (
      select 1 from todos t where t.id = todo_id and (
        t.owner_id = auth.uid() or t.assignee_id = auth.uid() or
        (t.team_id is not null and has_team_access(t.team_id))
      ) and t.deleted_at is null
    )
  );

drop policy if exists "insert todo_comments" on todo_comments;
create policy "insert todo_comments" on todo_comments
  for insert with check (
    author_id = auth.uid() and
    exists (
      select 1 from todos t where t.id = todo_id and (
        t.owner_id = auth.uid() or t.assignee_id = auth.uid() or
        (t.team_id is not null and has_team_access(t.team_id))
      ) and t.deleted_at is null
    )
  );

drop policy if exists "manage own todo_comments" on todo_comments;
create policy "manage own todo_comments" on todo_comments
  for all using (author_id = auth.uid())
  with check (author_id = auth.uid());

-- sop_notes: personal = author only; team = team members
drop policy if exists "read sop_notes" on sop_notes;
create policy "read sop_notes" on sop_notes
  for select using (
    (team_id is null and author_id = auth.uid()) or
    (team_id is not null and has_team_access(team_id))
  );

drop policy if exists "insert sop_notes" on sop_notes;
create policy "insert sop_notes" on sop_notes
  for insert with check (
    author_id = auth.uid() and
    (team_id is null or has_team_access(team_id))
  );

drop policy if exists "manage own sop_notes" on sop_notes;
create policy "manage own sop_notes" on sop_notes
  for all using (author_id = auth.uid())
  with check (author_id = auth.uid());
