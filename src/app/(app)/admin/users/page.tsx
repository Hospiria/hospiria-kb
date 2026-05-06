export const dynamic = 'force-dynamic'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { UserManagement } from '@/components/admin/UserManagement'

export default async function AdminUsersPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || profile.role !== 'super_admin') redirect('/dashboard')

  const adminClient = createAdminClient()
  const { data: users, error: usersError } = await adminClient
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })

  if (usersError) console.error('Users query error:', usersError.message)

  // Fetch teams separately to avoid join issues
  const { data: teams } = await adminClient.from('teams').select('*').order('name')

  // Fetch team_access separately
  const { data: teamAccess } = await adminClient.from('team_access').select('*')

  // Merge team_access into users
  const usersWithTeams = (users ?? []).map(u => ({
    ...u,
    teams: teams?.find(t => t.id === u.primary_team_id) ? { name: teams.find(t => t.id === u.primary_team_id)!.name } : null,
    team_access: (teamAccess ?? []).filter(ta => ta.user_id === u.id),
  }))

  return <UserManagement users={usersWithTeams} teams={teams ?? []} />
}
