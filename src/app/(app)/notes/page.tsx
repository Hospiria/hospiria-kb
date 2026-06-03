export const dynamic = 'force-dynamic'

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getEffectiveSession } from '@/lib/impersonation'
import { NotesPageClient } from '@/components/notes/NotesPageClient'

export default async function NotesPage() {
  const session = await getEffectiveSession()
  if (!session?.profile) redirect('/login')

  const supabase = createClient()
  const db = createServiceClient()

  const { effectiveUserId, profile } = session

  // People for @mention / assignee pickers.
  const { data: people } = await db.from('profiles').select('id, full_name').order('full_name')

  // User's accessible teams — used for the team-space switcher.
  // Approvers and super_admins see all teams; others see their own.
  let myTeams: { id: string; name: string }[] = []
  if (['approver', 'super_admin'].includes(profile.role)) {
    const { data } = await supabase.from('teams').select('id, name').order('name')
    myTeams = (data ?? []) as { id: string; name: string }[]
  } else {
    // Primary team + cross-team access
    const [{ data: all }, { data: access }] = await Promise.all([
      supabase.from('teams').select('id, name').order('name'),
      supabase.from('team_access').select('team_id').eq('user_id', effectiveUserId),
    ])
    const accessIds = new Set([
      profile.primary_team_id,
      ...((access ?? []) as { team_id: string }[]).map(a => a.team_id),
    ].filter(Boolean))
    myTeams = ((all ?? []) as { id: string; name: string }[]).filter(t => accessIds.has(t.id))
  }

  return (
    <NotesPageClient
      currentUserId={effectiveUserId}
      people={(people ?? []) as { id: string; full_name: string | null }[]}
      myTeams={myTeams}
    />
  )
}
