-- =============================================================================
-- Migration 011 — Notes & smart to-dos
--
--   notes        — per-user notepad entries; shareable with other users.
--   note_shares  — who a note is shared with (view or edit).
--   todos        — tasks; can be assigned to another user and/or scoped to a
--                  team (shared team lists), with due date / priority / status.
--
-- Collaboration uses the existing `notifications` table (no new table): sharing
-- a note or assigning a to-do inserts a notification for the recipient.
--
-- Run in: https://supabase.com/dashboard/project/gpdlfnvriwverwlhofzs/sql/new
-- =============================================================================

create table if not exists notes (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references profiles(id) on delete cascade,
  title      text not null default '',
  body       text not null default '',
  color      text,                      -- optional accent for the notepad UI
  pinned     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notes_owner_idx on notes(owner_id);

create table if not exists note_shares (
  note_id   uuid not null references notes(id) on delete cascade,
  user_id   uuid not null references profiles(id) on delete cascade,
  can_edit  boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (note_id, user_id)
);
create index if not exists note_shares_user_idx on note_shares(user_id);

create table if not exists todos (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references profiles(id) on delete cascade,
  assignee_id uuid references profiles(id) on delete set null,
  team_id     uuid references teams(id) on delete cascade,   -- set => shared team list
  title       text not null,
  detail      text,
  due_date    date,
  priority    text not null default 'medium' check (priority in ('low','medium','high')),
  status      text not null default 'open'   check (status in ('open','done')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists todos_owner_idx on todos(owner_id);
create index if not exists todos_assignee_idx on todos(assignee_id);
create index if not exists todos_team_idx on todos(team_id);

-- updated_at maintenance (reuses set_updated_at() from migration 005)
drop trigger if exists notes_set_updated_at on notes;
create trigger notes_set_updated_at before update on notes
  for each row execute function set_updated_at();
drop trigger if exists todos_set_updated_at on todos;
create trigger todos_set_updated_at before update on todos
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------
alter table notes enable row level security;
alter table note_shares enable row level security;
alter table todos enable row level security;

-- NOTES: owner full; shared users read; shared-with-edit can update.
drop policy if exists "read own or shared notes" on notes;
create policy "read own or shared notes" on notes
  for select using (
    owner_id = auth.uid()
    or exists (select 1 from note_shares s where s.note_id = id and s.user_id = auth.uid())
  );

drop policy if exists "insert own notes" on notes;
create policy "insert own notes" on notes
  for insert with check (owner_id = auth.uid());

drop policy if exists "update own or shared-editable notes" on notes;
create policy "update own or shared-editable notes" on notes
  for update using (
    owner_id = auth.uid()
    or exists (select 1 from note_shares s where s.note_id = id and s.user_id = auth.uid() and s.can_edit)
  );

drop policy if exists "delete own notes" on notes;
create policy "delete own notes" on notes
  for delete using (owner_id = auth.uid());

-- NOTE_SHARES: a user sees shares for notes they own or shares aimed at them;
-- only the note owner can create/remove shares.
drop policy if exists "read relevant note_shares" on note_shares;
create policy "read relevant note_shares" on note_shares
  for select using (
    user_id = auth.uid()
    or exists (select 1 from notes n where n.id = note_id and n.owner_id = auth.uid())
  );

drop policy if exists "owner manages note_shares" on note_shares;
create policy "owner manages note_shares" on note_shares
  for all using (
    exists (select 1 from notes n where n.id = note_id and n.owner_id = auth.uid())
  ) with check (
    exists (select 1 from notes n where n.id = note_id and n.owner_id = auth.uid())
  );

-- TODOS: visible to owner, assignee, or any member of the team (team lists).
drop policy if exists "read own assigned or team todos" on todos;
create policy "read own assigned or team todos" on todos
  for select using (
    owner_id = auth.uid()
    or assignee_id = auth.uid()
    or (team_id is not null and has_team_access(team_id))
  );

drop policy if exists "insert todos" on todos;
create policy "insert todos" on todos
  for insert with check (
    owner_id = auth.uid()
    and (team_id is null or has_team_access(team_id))
  );

drop policy if exists "update own assigned or team todos" on todos;
create policy "update own assigned or team todos" on todos
  for update using (
    owner_id = auth.uid()
    or assignee_id = auth.uid()
    or (team_id is not null and has_team_access(team_id))
  );

drop policy if exists "delete own or team todos" on todos;
create policy "delete own or team todos" on todos
  for delete using (
    owner_id = auth.uid()
    or (team_id is not null and has_team_access(team_id))
  );
