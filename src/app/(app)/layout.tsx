export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveSession } from '@/lib/impersonation'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { ImpersonationBanner } from '@/components/layout/ImpersonationBanner'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const session = await getEffectiveSession()
  if (!session) redirect('/login')

  const { profile, realProfile, isImpersonating } = session

  // Fetch accessible teams based on effective profile
  let teams: { id: string; name: string }[] = []
  const effectiveUserId = session.effectiveUserId

  if (profile.role === 'agent') {
    if (profile.primary_team_id) {
      const { data } = await supabase.from('teams').select('id, name').eq('id', profile.primary_team_id)
      teams = data ?? []
    }
    const { data: extra } = await supabase.from('team_access').select('teams(id, name)').eq('user_id', effectiveUserId)
    const extraTeams = (extra ?? []).flatMap((e: { teams?: { id: string; name: string } | { id: string; name: string }[] | null }) => {
      if (!e.teams) return []
      return Array.isArray(e.teams) ? e.teams : [e.teams]
    })
    teams = [...teams, ...extraTeams]
  } else {
    const { data } = await supabase.from('teams').select('id, name').order('name')
    teams = data ?? []
  }

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
        <Topbar profile={realProfile} />
        <main className="flex-1 mt-14 p-6">
          {isImpersonating && (
            <ImpersonationBanner
              userName={profile.full_name ?? 'Unknown User'}
              userRole={profile.role}
            />
          )}
          {children}
        </main>
      </div>
    </div>
  )
}
