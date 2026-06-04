-- =============================================================================
-- Migration 017 — Link a note to a SOP
--
-- Adds an optional sop_id to the notes table so a note can reference one SOP.
-- The linked SOP is shown as a clickable chip in the note editor.
-- On delete cascade: if the SOP is deleted, the link is cleared (not the note).
--
-- Run in: https://supabase.com/dashboard/project/gpdlfnvriwverwlhofzs/sql/new
-- =============================================================================

alter table notes
  add column if not exists sop_id uuid references sops(id) on delete set null;

create index if not exists notes_sop_idx on notes(sop_id) where sop_id is not null;
