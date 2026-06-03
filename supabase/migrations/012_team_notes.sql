-- =============================================================================
-- Migration 012 — Team notes
--
-- Adds team_id to the notes table so notes can belong to a team (team space)
-- rather than just a person (personal space). Team notes are visible and
-- editable by every member of that team.
--
-- Also updates the notes RLS policies to include team-based access,
-- building on the note_shared_with_me() helper created in the 011 fix.
--
-- Run in: https://supabase.com/dashboard/project/gpdlfnvriwverwlhofzs/sql/new
-- =============================================================================

alter table notes
  add column if not exists team_id uuid references teams(id) on delete cascade;

create index if not exists notes_team_idx on notes(team_id);

-- ---------------------------------------------------------------------------
-- Update RLS policies to include team access
-- ---------------------------------------------------------------------------

-- SELECT: owner OR shared-with-me (personal) OR any team member (team notes)
drop policy if exists "read own or shared notes" on notes;
create policy "read own or shared notes" on notes
  for select using (
    (team_id is null and (
      owner_id = auth.uid()
      or note_shared_with_me(id)
    ))
    or (team_id is not null and has_team_access(team_id))
  );

-- INSERT: owner must be me, and either personal (no team) or a team I belong to
drop policy if exists "insert own notes" on notes;
create policy "insert own notes" on notes
  for insert with check (
    owner_id = auth.uid()
    and (team_id is null or has_team_access(team_id))
  );

-- UPDATE: personal notes — owner or shared-with-edit; team notes — any team member
drop policy if exists "update own or shared-editable notes" on notes;
create policy "update own or shared-editable notes" on notes
  for update using (
    (team_id is null and (
      owner_id = auth.uid()
      or note_shared_with_me(id)
    ))
    or (team_id is not null and has_team_access(team_id))
  );

-- DELETE: owner (personal) or team member (team notes)
drop policy if exists "delete own notes" on notes;
create policy "delete own notes" on notes
  for delete using (
    owner_id = auth.uid()
    or (team_id is not null and has_team_access(team_id))
  );
