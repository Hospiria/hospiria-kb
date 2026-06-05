-- =============================================================================
-- Migration 028 — Notes upgrade: rich content, folders, multi-SOP/company links
--
-- 1. notes.content  jsonb — Tiptap JSON for the rich editor.
--    notes.body is kept for backward compatibility; old notes still render.
-- 2. note_folders   — user-created folders (personal or team-scoped).
-- 3. notes.folder_id — FK to note_folders.
-- 4. note_sops      — many-to-many notes ↔ SOPs (replaces single sop_id).
-- 5. note_companies — many-to-many notes ↔ companies.
--
-- Run in: https://supabase.com/dashboard/project/gpdlfnvriwverwlhofzs/sql/new
-- =============================================================================

-- 1. Rich content column (Tiptap JSON). Old notes keep body, new ones use content.
alter table notes add column if not exists content jsonb;

-- 2. Note folders
create table if not exists note_folders (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references profiles(id) on delete cascade,
  team_id    uuid references teams(id) on delete cascade,  -- null = personal
  name       text not null,
  color      text not null default '#14b8a6',
  icon       text,
  position   int  not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists note_folders_owner_idx on note_folders(owner_id);
create index if not exists note_folders_team_idx  on note_folders(team_id);

alter table note_folders enable row level security;

drop policy if exists "read own or team note folders" on note_folders;
create policy "read own or team note folders" on note_folders
  for select using (
    (team_id is null and owner_id = auth.uid())
    or (team_id is not null and has_team_access(team_id))
  );

drop policy if exists "manage own or team note folders" on note_folders;
create policy "manage own or team note folders" on note_folders
  for all using (
    (team_id is null and owner_id = auth.uid())
    or (team_id is not null and has_team_access(team_id))
  ) with check (
    owner_id = auth.uid()
    and ((team_id is null) or has_team_access(team_id))
  );

-- 3. Link notes to folders
alter table notes add column if not exists folder_id uuid references note_folders(id) on delete set null;
create index if not exists notes_folder_idx on notes(folder_id);

-- 4. Note → many SOPs
create table if not exists note_sops (
  note_id uuid not null references notes(id) on delete cascade,
  sop_id  uuid not null references sops(id)  on delete cascade,
  primary key (note_id, sop_id)
);
create index if not exists note_sops_sop_idx on note_sops(sop_id);

-- Backfill from the existing single sop_id
insert into note_sops (note_id, sop_id)
select id, sop_id from notes where sop_id is not null
on conflict do nothing;

alter table note_sops enable row level security;

drop policy if exists "read accessible note sops" on note_sops;
create policy "read accessible note sops" on note_sops
  for select using (
    exists (
      select 1 from notes n where n.id = note_id and (
        n.owner_id = auth.uid()
        or note_shared_with_me(note_id)
        or (n.team_id is not null and has_team_access(n.team_id))
      )
    )
  );

drop policy if exists "manage accessible note sops" on note_sops;
create policy "manage accessible note sops" on note_sops
  for all using (
    exists (
      select 1 from notes n where n.id = note_id and (
        n.owner_id = auth.uid()
        or (n.team_id is not null and has_team_access(n.team_id))
      )
    )
  ) with check (
    exists (
      select 1 from notes n where n.id = note_id and (
        n.owner_id = auth.uid()
        or (n.team_id is not null and has_team_access(n.team_id))
      )
    )
  );

-- 5. Note → many companies
create table if not exists note_companies (
  note_id    uuid not null references notes(id)     on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  primary key (note_id, company_id)
);
create index if not exists note_companies_company_idx on note_companies(company_id);

alter table note_companies enable row level security;

drop policy if exists "read accessible note companies" on note_companies;
create policy "read accessible note companies" on note_companies
  for select using (
    exists (
      select 1 from notes n where n.id = note_id and (
        n.owner_id = auth.uid()
        or note_shared_with_me(note_id)
        or (n.team_id is not null and has_team_access(n.team_id))
      )
    )
  );

drop policy if exists "manage accessible note companies" on note_companies;
create policy "manage accessible note companies" on note_companies
  for all using (
    exists (
      select 1 from notes n where n.id = note_id and (
        n.owner_id = auth.uid()
        or (n.team_id is not null and has_team_access(n.team_id))
      )
    )
  ) with check (
    exists (
      select 1 from notes n where n.id = note_id and (
        n.owner_id = auth.uid()
        or (n.team_id is not null and has_team_access(n.team_id))
      )
    )
  );
