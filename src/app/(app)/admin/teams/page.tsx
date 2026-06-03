export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { requirePage } from '@/lib/permissions-guard'
import { TeamManagement } from '@/components/admin/TeamManagement'

export default async function AdminTeamsPage() {
  await requirePage('teams', 'view')
  const supabase = createClient()

  const { data: teams } = await supabase.from('teams').select('*').order('name')
  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .order('display_order')

  const { data: approvers } = await supabase
    .from('profiles')
    .select('id, full_name, primary_team_id')
    .in('role', ['approver', 'super_admin'])

  return <TeamManagement teams={teams ?? []} categories={categories ?? []} approvers={approvers ?? []} />
}
