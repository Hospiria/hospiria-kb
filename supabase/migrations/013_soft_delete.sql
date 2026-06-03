-- =============================================================================
-- Migration 013 — Soft delete for notes and to-dos
--
-- Adds deleted_at + deleted_by to both tables so deletions are reversible
-- and auditable ("deleted by whom, when"). Hard deletes are replaced by
-- setting deleted_at; a trash view is shown in the UI.
--
-- Run in: https://supabase.com/dashboard/project/gpdlfnvriwverwlhofzs/sql/new
-- =============================================================================

alter table notes
  add column if not exists deleted_at  timestamptz,
  add column if not exists deleted_by  uuid references profiles(id) on delete set null;

alter table todos
  add column if not exists deleted_at  timestamptz,
  add column if not exists deleted_by  uuid references profiles(id) on delete set null;

create index if not exists notes_deleted_at_idx on notes(deleted_at) where deleted_at is not null;
create index if not exists todos_deleted_at_idx on todos(deleted_at) where deleted_at is not null;
