export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { requirePage } from '@/lib/permissions-guard'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getEffectiveSession } from '@/lib/impersonation'
import { CompanyDashboard } from '@/components/companies/CompanyDashboard'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

export default async function CompanyPage({ params }: { params: { id: string } }) {
  await requirePage('sops', 'view')

  const session = await getEffectiveSession()
  if (!session) redirect('/login')
  const effectiveUserId = session.effectiveUserId

  const supabase = createClient()
  const db = createServiceClient()
  const companyId = params.id

  // ── Company ────────────────────────────────────────────────────────────────
  const { data: company } = await supabase
    .from('companies')
    .select('id, name, description')
    .eq('id', companyId)
    .single()
  if (!company) notFound()

  // ── SOPs ───────────────────────────────────────────────────────────────────
  const { data: sopLinks } = await supabase
    .from('sop_companies')
    .select('sop_id')
    .eq('company_id', companyId)
  const sopIds = (sopLinks ?? []).map((r: { sop_id: string }) => r.sop_id)

  let sops: {
    id: string; title: string; status: string; category_id: string | null
    categories: { id: string; name: string } | null
  }[] = []
  if (sopIds.length > 0) {
    const { data } = await supabase
      .from('sops')
      .select('id, title, status, category_id, categories(id, name)')
      .in('id', sopIds)
      .order('title')
    sops = (data ?? []) as unknown as typeof sops
  }

  // ── Notes ──────────────────────────────────────────────────────────────────
  const { data: noteLinks } = await db
    .from('note_companies')
    .select('note_id')
    .eq('company_id', companyId)
  const noteIds = (noteLinks ?? []).map((r: { note_id: string }) => r.note_id)

  let allNotes: {
    id: string; title: string; updated_at: string
    team_id: string | null; owner_id: string; pinned: boolean
    deleted_at: string | null
    teams?: { name: string } | null
  }[] = []
  if (noteIds.length > 0) {
    const { data } = await supabase
      .from('notes')
      .select('id, title, updated_at, team_id, owner_id, pinned, deleted_at, teams(name)')
      .in('id', noteIds)
      .is('deleted_at', null)
      .order('pinned', { ascending: false })
      .order('updated_at', { ascending: false })
    allNotes = (data ?? []) as unknown as typeof allNotes
  }

  const teamNotes = allNotes.filter(n => n.team_id !== null)
  const myNotes   = allNotes.filter(n => n.team_id === null)

  // ── Todos ──────────────────────────────────────────────────────────────────
  const { data: todoLinks } = await db
    .from('todo_companies')
    .select('todo_id')
    .eq('company_id', companyId)
  const todoIds = (todoLinks ?? []).map((r: { todo_id: string }) => r.todo_id)

  let allTodos: {
    id: string; title: string; is_done: boolean; priority: string
    due_date: string | null; team_id: string | null; owner_id: string
    status: string; deleted_at: string | null
  }[] = []
  if (todoIds.length > 0) {
    const { data } = await supabase
      .from('todos')
      .select('id, title, is_done, priority, due_date, team_id, owner_id, status, deleted_at')
      .in('id', todoIds)
      .is('deleted_at', null)
      .order('is_done', { ascending: true })
      .order('due_date', { ascending: true })
    allTodos = (data ?? []) as typeof allTodos
  }

  // Assignees
  const assigneesByTodo = new Map<string, { id: string; full_name: string | null }[]>()
  if (todoIds.length > 0) {
    const { data: assigneeRows } = await db
      .from('todo_assignees')
      .select('todo_id, user_id')
      .in('todo_id', todoIds)
    const allAssigneeIds = [...new Set((assigneeRows ?? []).map((a: { user_id: string }) => a.user_id))]
    const { data: profiles } = allAssigneeIds.length
      ? await db.from('profiles').select('id, full_name').in('id', allAssigneeIds)
      : { data: [] }
    const nameById = new Map((profiles ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name]))
    for (const row of (assigneeRows ?? []) as { todo_id: string; user_id: string }[]) {
      const list = assigneesByTodo.get(row.todo_id) ?? []
      list.push({ id: row.user_id, full_name: nameById.get(row.user_id) ?? null })
      assigneesByTodo.set(row.todo_id, list)
    }
  }

  const teamIdSet = [...new Set(allTodos.map(t => t.team_id).filter(Boolean) as string[])]
  const { data: teams } = teamIdSet.length
    ? await supabase.from('teams').select('id, name').in('id', teamIdSet)
    : { data: [] }
  const teamById = new Map((teams ?? []).map((t: { id: string; name: string }) => [t.id, t.name]))

  const todosWithMeta = allTodos.map(t => ({
    ...t,
    mine: t.owner_id === effectiveUserId,
    teamName: t.team_id ? teamById.get(t.team_id) ?? null : null,
    assignees: assigneesByTodo.get(t.id) ?? [],
  }))

  const teamTodos = todosWithMeta.filter(t => t.team_id !== null)
  const myTodos   = todosWithMeta.filter(t => t.team_id === null)

  return (
    <div>
      <Link
        href="/sops"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-navy-700 transition-colors mb-6"
      >
        <ChevronLeft className="w-4 h-4" /> Back to SOPs
      </Link>

      <CompanyDashboard
        company={company}
        sops={sops}
        teamNotes={teamNotes}
        myNotes={myNotes}
        teamTodos={teamTodos}
        myTodos={myTodos}
      />
    </div>
  )
}
