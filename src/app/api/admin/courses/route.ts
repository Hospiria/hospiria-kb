export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/server'
import { requireFeature } from '@/lib/permissions-guard'
import { NextResponse } from 'next/server'

export async function GET() {
  const auth = await requireFeature('quizzes', 'view')
  if ('error' in auth) return auth.error

  const db = createAdminClient()

  // All active quizzes
  const { data: quizzes } = await db
    .from('quizzes')
    .select('id, title, pass_mark, status, sop_id, created_at')
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  if (!quizzes?.length) return NextResponse.json({ courses: [] })

  const quizIds = quizzes.map((q: { id: string }) => q.id)
  const sopIds = quizzes.map((q: { sop_id: string | null }) => q.sop_id).filter(Boolean) as string[]

  // All enrollments for these quizzes
  const { data: allEnrollments } = await db
    .from('quiz_enrollments')
    .select('quiz_id, user_id, status, enrolled_at')
    .in('quiz_id', quizIds)

  // Team assignments for the SOPs
  const { data: sopTeamRows } = sopIds.length > 0
    ? await db.from('sop_teams').select('sop_id, team_id').in('sop_id', sopIds)
    : { data: [] }

  // Team names
  const teamIds = [...new Set((sopTeamRows ?? []).map((r: { team_id: string }) => r.team_id))]
  const { data: teamsData } = teamIds.length > 0
    ? await db.from('teams').select('id, name').in('id', teamIds)
    : { data: [] }
  const teamMap = new Map((teamsData ?? []).map((t: { id: string; name: string }) => [t.id, t.name]))

  // Build one course object per quiz
  const courses = quizzes.map((q: { id: string; title: string; pass_mark: number; sop_id: string | null }) => {
    const qEnrollments = (allEnrollments ?? []).filter((e: { quiz_id: string }) => e.quiz_id === q.id)

    // Deduplicate — keep latest enrollment per user
    const latestPerUser = new Map<string, { status: string; enrolled_at: string }>()
    for (const e of qEnrollments as { user_id: string; status: string; enrolled_at: string }[]) {
      const existing = latestPerUser.get(e.user_id)
      if (!existing || new Date(e.enrolled_at) > new Date(existing.enrolled_at)) {
        latestPerUser.set(e.user_id, e)
      }
    }
    const deduped = Array.from(latestPerUser.values())

    const enrolled  = deduped.length
    const passed    = deduped.filter(e => e.status === 'passed').length
    const failed    = deduped.filter(e => e.status === 'failed').length
    const pending   = deduped.filter(e => e.status === 'pending').length
    const completed = passed + failed
    const passRate  = completed > 0 ? Math.round((passed / completed) * 100) : null

    // Teams for this quiz's SOP
    const teams = (sopTeamRows ?? [])
      .filter((r: { sop_id: string }) => r.sop_id === q.sop_id)
      .map((r: { team_id: string }) => ({ id: r.team_id, name: teamMap.get(r.team_id) ?? r.team_id }))

    return { id: q.id, title: q.title, pass_mark: q.pass_mark, sop_id: q.sop_id, enrolled, passed, failed, pending, completed, passRate, teams }
  })

  return NextResponse.json({ courses })
}
