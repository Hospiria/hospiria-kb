import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { UserManagement } from '@/components/admin/UserManagement'

export default async function AdminUsersPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || profile.role !== 'super_admin') redirect('/dashboard')

  const { data: users } = await supabase
    .from('profiles')
    .select('*, teams(name), team_access(team_id, teams(name))')
    .order('created_at', { ascending: false })

  const { data: teams } = await supabase.from('teams').select('*').order('name')

  return <UserManagement users={users ?? []} teams={teams ?? []} />
}
