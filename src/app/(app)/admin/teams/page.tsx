import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TeamManagement } from '@/components/admin/TeamManagement'

export default async function AdminTeamsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || profile.role !== 'super_admin') redirect('/dashboard')

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
