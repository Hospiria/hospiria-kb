export const dynamic = 'force-dynamic'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { UserEditor } from '@/components/admin/UserEditor'

export default async function EditUserPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'super_admin') redirect('/dashboard')

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
