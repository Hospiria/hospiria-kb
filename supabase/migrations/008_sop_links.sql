-- =============================================================================
-- Migration 008 — SOP <-> SOP links ("Related SOPs")
--
-- Lets any SOP be linked to other SOPs. Links are BIDIRECTIONAL: a single row
-- represents the relationship, and it shows on both SOPs. To guarantee one row
-- per pair (and avoid A-B / B-A duplicates) we store the pair in canonical
-- order with a CHECK that sop_a < sop_b.
--
-- RLS mirrors the sop_companies / sop_platforms junctions:
--   read  — any authenticated user (needed to render "Related SOPs")
--   write — SOP authors + admin roles (matches sop_teams / sop_companies)
--
-- Run in: https://supabase.com/dashboard/project/gpdlfnvriwverwlhofzs/sql/new
-- =============================================================================

create table if not exists sop_links (
  sop_a uuid not null references sops(id) on delete cascade,
  sop_b uuid not null references sops(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (sop_a, sop_b),
  -- Canonical unordered pair: store each relationship exactly once.
  constraint sop_links_ordered check (sop_a < sop_b)
);

-- Fast lookup from either side of the relationship.
create index if not exists sop_links_sop_b_idx on sop_links(sop_b);

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------
alter table sop_links enable row level security;

drop policy if exists "Authenticated can read sop_links" on sop_links;
create policy "Authenticated can read sop_links" on sop_links
  for select using (auth.uid() is not null);

drop policy if exists "Authors and admins can manage sop_links" on sop_links;
create policy "Authors and admins can manage sop_links" on sop_links
  for all using (
    get_my_role() in ('super_admin', 'junior_team_leader', 'team_leader', 'approver')
  )
  with check (
    get_my_role() in ('super_admin', 'junior_team_leader', 'team_leader', 'approver')
  );
