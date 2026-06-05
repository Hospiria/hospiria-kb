import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getEffectiveSession } from '@/lib/impersonation'

// Shared data load for the Notes and To-dos pages: the people directory
// (for @mention / assignee pickers) and the user's accessible teams.
export async function getWorkspaceData() {
  const session = await getEffectiveSession()
  if (!session?.profile) return null

  const supabase = createClient()
  const db = createServiceClient()
  const { effectiveUserId, profile } = session

  const { data: people } = await db.from('profiles').select('id, full_name').order('full_name')

  let myTeams: { id: string; name: string }[] = []
  if (['approver', 'super_admin'].includes(profile.role)) {
    const { data } = await supabase.from('teams').select('id, name').order('name')
    myTeams = (data ?? []) as { id: string; name: string }[]
  } else {
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

  return {
    currentUserId: effectiveUserId,
    people: (people ?? []) as { id: string; full_name: string | null }[],
    myTeams,
  }
}
