export const dynamic = 'force-dynamic'

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getEffectiveSession } from '@/lib/impersonation'
import { AdminDashboardClient } from '@/components/admin/AdminDashboardClient'
import { DashboardGrid } from '@/components/dashboard/DashboardGrid'

export type MemberChase = { id: string; userId: string; name: string; dueDate: string; quizTitle: string }
export type TeamQuizStat = { title: string; passed: number; pending: number; failed: number; total: number }

export default async function DashboardPage() {
  const session = await getEffectiveSession()
  if (!session || !session.profile) redirect('/login')
  const { profile, effectiveUserId } = session
  const role = profile.role
  const teamId = profile.primary_team_id ?? null
  const supabase = createClient()
  const db = createServiceClient()

  // Dashboard card visibility + layout preferences
  const { data: prefs } = await supabase
    .from('dashboard_preferences').select('hidden_cards, card_layout').eq('user_id', effectiveUserId).single()
  const hiddenCards: string[] = prefs?.hidden_cards ?? []
  const cardLayout = (prefs?.card_layout ?? {}) as { order?: string[]; spans?: Record<string, number>; heights?: Record<string, number> }

  // Directory for in-card task editing (assignee + team pickers)
  const [{ data: dirPeople }, { data: dirTeams }] = await Promise.all([
    db.from('profiles').select('id, full_name').order('full_name'),
    db.from('teams').select('id, name').order('name'),
  ])
  const people = (dirPeople ?? []) as { id: string; full_name: string | null }[]
  const teamsList = (dirTeams ?? []) as { id: string; name: string }[]

  // ── Super admin keeps existing rich dashboard ─────────────────────────
  if (role === 'super_admin') {
    const [
      { count: liveSops }, { count: pendingSops }, { count: totalUsers },
      { data: enrollments }, { data: quizzes }, { data: teams }, { data: profiles },
      { data: myTasks },
    ] = await Promise.all([
      supabase.from('sops').select('*', { count: 'exact', head: true }).eq('status', 'live'),
      supabase.from('sops').select('*', { count: 'exact', head: true }).eq('status', 'submitted'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('quiz_enrollments').select('id, quiz_id, user_id, status, score, completed_at, due_date'),
      supabase.from('quizzes').select('id, title').eq('status', 'active'),
      supabase.from('teams').select('id, name').order('name'),
      supabase.from('profiles').select('id, full_name, primary_team_id'),
      supabase.from('todos').select('*').eq('owner_id', effectiveUserId).is('deleted_at', null).eq('is_done', false)
        .order('due_date', { ascending: true, nullsFirst: false }).limit(50),
    ])
    return (
      <DashboardGrid profile={profile} role="super_admin" hiddenCards={hiddenCards} cardLayout={cardLayout} userId={effectiveUserId} people={people} teams={teamsList}
        data={{ myTasks: myTasks ?? [], sopsPending: [], membersToChase: [], teamQuizStats: [], teamSops: [], myNotes: [], myCourses: [], mySops: [], teamName: null }}
        adminChildren={
          <AdminDashboardClient
            enrollments={(enrollments ?? []) as Parameters<typeof AdminDashboardClient>[0]['enrollments']}
            quizzes={(quizzes ?? []) as { id: string; title: string }[]}
            teams={(teams ?? []) as { id: string; name: string }[]}
            profiles={(profiles ?? []) as { id: string; full_name: string | null; primary_team_id: string | null }[]}
            liveSops={liveSops ?? 0} pendingSops={pendingSops ?? 0} totalUsers={totalUsers ?? 0}
          />
        }
      />
    )
  }

  // ── Shared data for all other roles ──────────────────────────────────
  const canApprove = ['team_leader', 'approver'].includes(role)

  const [
    { data: myTasks },
    { data: myNotes },
    { data: myCourses },
    { data: sopsPending },
    { data: teamSops },
    { data: mySops },
  ] = await Promise.all([
    supabase.from('todos').select('*')
      .or(`owner_id.eq.${effectiveUserId},assignee_id.eq.${effectiveUserId}`)
      .is('deleted_at', null).eq('is_done', false)
      .order('due_date', { ascending: true, nullsFirst: false }).limit(50),
    supabase.from('notes').select('id, title, body, pinned, updated_at, sop_id')
      .is('deleted_at', null).order('pinned', { ascending: false }).order('updated_at', { ascending: false }).limit(5),
    supabase.from('quiz_enrollments')
      .select('id, status, score, due_date, quizzes(id, title, sops(id, title))')
      .eq('user_id', effectiveUserId).in('status', ['pending', 'failed'])
      .order('due_date', { ascending: true }).limit(8),
    // SOPs pending approval — only those in the user's own team(s)
    canApprove && teamId
      ? supabase.from('sops')
          .select('id, title, updated_at, profiles(full_name), categories(name), sop_teams!inner(team_id)')
          .eq('status', 'submitted')
          .eq('sop_teams.team_id', teamId)
          .order('updated_at', { ascending: true }).limit(10)
      : Promise.resolve({ data: [] }),
    // Recent live SOPs — only for the user's own team
    teamId
      ? supabase.from('sops')
          .select('id, title, status, updated_at, profiles(full_name), sop_teams!inner(team_id)')
          .eq('status', 'live')
          .eq('sop_teams.team_id', teamId)
          .order('updated_at', { ascending: false }).limit(6)
      : Promise.resolve({ data: [] }),
    ['team_leader', 'junior_team_leader', 'approver'].includes(role)
      ? supabase.from('sops').select('id, title, status, updated_at, categories(name)')
          .eq('author_id', effectiveUserId).order('updated_at', { ascending: false }).limit(6)
      : Promise.resolve({ data: [] }),
  ])

  // Members to chase (overdue quizzes in my team)
  let membersToChase: MemberChase[] = []
  if (teamId && canApprove) {
    const today = new Date().toISOString().slice(0, 10)
    const { data: teamMembers } = await db.from('profiles').select('id, full_name').eq('primary_team_id', teamId)
    const memberIds = (teamMembers ?? []).map((p: { id: string }) => p.id)
    if (memberIds.length) {
      const { data: overdue } = await db.from('quiz_enrollments')
        .select('id, user_id, due_date, quizzes(title)')
        .in('user_id', memberIds).eq('status', 'pending').lt('due_date', today).limit(15)
      membersToChase = (overdue ?? []).map((e: unknown) => {
        const row = e as { id: string; user_id: string; due_date: string; quizzes: { title: string }[] | null }
        const quizTitle = Array.isArray(row.quizzes) ? row.quizzes[0]?.title : (row.quizzes as { title: string } | null)?.title
        return {
          id: row.id, userId: row.user_id, dueDate: row.due_date, quizTitle: quizTitle ?? 'Quiz',
          name: (teamMembers ?? []).find((p: { id: string; full_name: string | null }) => p.id === row.user_id)?.full_name ?? 'Unknown',
        }
      })
    }
  }

  // Team quiz stats
  let teamQuizStats: TeamQuizStat[] = []
  if (teamId && canApprove) {
    const { data: teamMembers } = await db.from('profiles').select('id').eq('primary_team_id', teamId)
    const memberIds = (teamMembers ?? []).map((p: { id: string }) => p.id)
    if (memberIds.length) {
      const { data: enrolments } = await db.from('quiz_enrollments')
        .select('status, quizzes(title)').in('user_id', memberIds).limit(300)
      const map = new Map<string, TeamQuizStat>()
      for (const e of (enrolments ?? []) as unknown as { status: string; quizzes: { title: string }[] | { title: string } | null }[]) {
        const t = (Array.isArray(e.quizzes) ? e.quizzes[0]?.title : (e.quizzes as { title: string } | null)?.title) ?? 'Unknown'
        if (!map.has(t)) map.set(t, { title: t, passed: 0, pending: 0, failed: 0, total: 0 })
        const g = map.get(t)!; g.total++
        if (e.status === 'passed') g.passed++
        else if (e.status === 'failed') g.failed++
        else g.pending++
      }
      teamQuizStats = [...map.values()].slice(0, 6)
    }
  }

  return (
    <DashboardGrid
      profile={profile} role={role} hiddenCards={hiddenCards} cardLayout={cardLayout} userId={effectiveUserId}
      people={people} teams={teamsList}
      data={{
        myTasks: myTasks ?? [], sopsPending: sopsPending ?? [],
        membersToChase, teamQuizStats, teamSops: teamSops ?? [],
        myNotes: myNotes ?? [], myCourses: myCourses ?? [], mySops: mySops ?? [],
        teamName: profile.teams?.name ?? null,
      }}
    />
  )
}
