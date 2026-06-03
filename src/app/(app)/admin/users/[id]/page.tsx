export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { requirePage } from '@/lib/permissions-guard'
import { UserEditor } from '@/components/admin/UserEditor'

export default async function EditUserPage({ params }: { params: { id: string } }) {
  await requirePage('users', 'view')
  const admin = createAdminClient()
  const [{ data: target }, { data: teams }, { data: access }] = await Promise.all([
    admin.from('profiles').select('id, full_name, role, primary_team_id').eq('id', params.id).single(),
    admin.from('teams').select('*').order('name'),
    admin.from('team_access').select('team_id').eq('user_id', params.id),
  ])
  if (!target) notFound()

  return (
    <UserEditor
      user={target}
      teams={teams ?? []}
      teamAccessTeamIds={((access ?? []) as { team_id: string }[]).map(a => a.team_id)}
    />
  )
}
