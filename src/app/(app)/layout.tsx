import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, teams(*)')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  // Fetch accessible teams
  let teams: { id: string; name: string }[] = []
  if (profile.role === 'agent') {
    if (profile.primary_team_id) {
      const { data } = await supabase.from('teams').select('id, name').eq('id', profile.primary_team_id)
      teams = data ?? []
    }
    const { data: extra } = await supabase.from('team_access').select('teams(id, name)').eq('user_id', user.id)
    const extraTeams = (extra ?? []).flatMap((e: { teams?: { id: string; name: string } | { id: string; name: string }[] | null }) => {
      if (!e.teams) return []
      return Array.isArray(e.teams) ? e.teams : [e.teams]
    })
    teams = [...teams, ...extraTeams]
  } else {
    const { data } = await supabase.from('teams').select('id, name').order('name')
    teams = data ?? []
  }

  // Fetch categories for those teams
  const teamIds = teams.map(t => t.id)
  const { data: categories } = teamIds.length > 0
    ? await supabase.from('categories').select('id, team_id, name, display_order').in('team_id', teamIds).order('display_order')
    : { data: [] }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Suspense fallback={<div className="w-60 bg-navy-700" />}>
        <Sidebar profile={profile} teamName={profile.teams?.name} teams={teams} categories={categories ?? []} />
      </Suspense>
      <div className="flex-1 ml-60 flex flex-col min-h-screen">
        <Topbar profile={profile} />
        <main className="flex-1 mt-14 p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
