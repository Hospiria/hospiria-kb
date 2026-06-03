export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { requirePage } from '@/lib/permissions-guard'
import { BulkSopManager } from '@/components/admin/BulkSopManager'

export default async function AdminSopsPage() {
  await requirePage('sops', 'edit')

  const supabase = createClient()

  const [{ data: sops }, { data: teams }, { data: categories }] = await Promise.all([
    supabase
      .from('sops')
      .select(`
        id, title, status, updated_at, category_id,
        categories(id, name, team_id),
        profiles(full_name),
        sop_teams(team_id, teams(id, name))
      `)
      .order('updated_at', { ascending: false }),
    supabase.from('teams').select('id, name').order('name'),
    supabase.from('categories').select('id, name, team_id').order('name'),
  ])

  // Cast needed: Supabase returns arrays for joins, our type expects singular
  type AnySop = Parameters<typeof BulkSopManager>[0]['sops'][0]
  return (
    <BulkSopManager
      sops={(sops ?? []) as unknown as AnySop[]}
      teams={teams ?? []}
      categories={categories ?? []}
    />
  )
}
