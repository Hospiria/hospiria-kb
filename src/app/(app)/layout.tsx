export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getEffectiveSession } from '@/lib/impersonation'
import { getEffectivePermissions } from '@/lib/permissions-server'
import { Role } from '@/types'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { ImpersonationBanner } from '@/components/layout/ImpersonationBanner'
import { FloatingHub } from '@/components/hub/FloatingHub'

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

  const restrictedRoles = ['agent', 'team_leader', 'junior_team_leader']
  if (restrictedRoles.includes(profile.role)) {
    // These roles only see their own primary team + any explicitly granted cross-team access
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
    // approver and super_admin see all teams
    const { data } = await supabase.from('teams').select('id, name').order('name')
    teams = data ?? []
  }

  // Companies and platforms are global tags — everyone sees all active ones
  const [{ data: companies }, { data: platforms }] = await Promise.all([
    supabase.from('companies').select('id, name').eq('is_active', true).order('name'),
    supabase.from('platforms').select('id, name').eq('is_active', true).order('name'),
  ])

  // Effective permissions for the current (impersonated-or-real) user — drives
  // which nav items the sidebar shows.
  const perms = await getEffectivePermissions(createServiceClient(), effectiveUserId, profile.role as Role)

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Suspense fallback={<div className="w-64 bg-navy-900" />}>
        <Sidebar
          profile={profile}
          teamName={profile.teams?.name}
          teams={teams}
          companies={companies ?? []}
          platforms={platforms ?? []}
          perms={perms}
        />
      </Suspense>
      <div className="flex-1 ml-64 flex flex-col min-h-screen">
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
      <FloatingHub perms={perms} />
    </div>
  )
}
