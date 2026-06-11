export const dynamic = 'force-dynamic'

import { requirePage } from '@/lib/permissions-guard'
import { createServiceClient } from '@/lib/supabase/server'
import { ActivityLog, type ActivityEvent } from '@/components/admin/ActivityLog'

// How many most-recent rows to pull from each source table. Keeps the payload
// bounded on large datasets; the UI flags when the cap is hit.
const PER_SOURCE_LIMIT = 600
// Total events handed to the client after merging + sorting.
const TOTAL_LIMIT = 1500

export default async function ActivityLogPage() {
  await requirePage('activity_log', 'view')

  const db = createServiceClient()

  // ── Fetch every source in parallel ─────────────────────────────────────────
  const [
    { data: sops },
    { data: versions },
    { data: approvals },
    { data: todos },
    { data: notes },
    { data: noteVersions },
    { data: todoEvts },
    { data: quizzes },
    { data: enrollments },
    { data: companies },
    { data: platforms },
    { data: categories },
    { data: profiles },
    { data: authEvents },
  ] = await Promise.all([
    db.from('sops').select('id, title, status, author_id, created_at, updated_at').order('updated_at', { ascending: false }).limit(PER_SOURCE_LIMIT),
    db.from('sop_versions').select('id, sop_id, version_number, created_by, created_at').order('created_at', { ascending: false }).limit(PER_SOURCE_LIMIT),
    db.from('approvals').select('id, sop_id, approver_id, status, created_at').order('created_at', { ascending: false }).limit(PER_SOURCE_LIMIT),
    db.from('todos').select('id, title, owner_id, team_id, created_at, completed_at, deleted_at, deleted_by, is_done').order('created_at', { ascending: false }).limit(PER_SOURCE_LIMIT),
    db.from('notes').select('id, title, owner_id, team_id, created_at, updated_at, deleted_at, deleted_by').order('updated_at', { ascending: false }).limit(PER_SOURCE_LIMIT),
    db.from('note_versions').select('id, note_id, version_number, title, changed_by, created_at').order('created_at', { ascending: false }).limit(PER_SOURCE_LIMIT),
    db.from('todo_events').select('id, todo_id, event_type, actor_id, old_value, new_value, created_at').order('created_at', { ascending: false }).limit(PER_SOURCE_LIMIT),
    db.from('quizzes').select('id, sop_id, title, created_at').order('created_at', { ascending: false }).limit(PER_SOURCE_LIMIT),
    db.from('quiz_enrollments').select('id, quiz_id, user_id, enrolled_by, enrolled_at, completed_at, status').order('enrolled_at', { ascending: false }).limit(PER_SOURCE_LIMIT),
    db.from('companies').select('id, name, created_at').order('created_at', { ascending: false }).limit(PER_SOURCE_LIMIT),
    db.from('platforms').select('id, name, created_at').order('created_at', { ascending: false }).limit(PER_SOURCE_LIMIT),
    db.from('categories').select('id, name, created_at').order('created_at', { ascending: false }).limit(PER_SOURCE_LIMIT),
    db.from('profiles').select('id, full_name'),
    db.rpc('get_auth_events', { lim: PER_SOURCE_LIMIT }),
  ])

  // ── Lookup maps ─────────────────────────────────────────────────────────────
  const nameById = new Map<string, string>((profiles ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name ?? 'Unknown']))
  const sopTitleById = new Map<string, string>((sops ?? []).map((s: { id: string; title: string }) => [s.id, s.title]))
  const todoTitleById = new Map<string, string>((todos ?? []).map((t: { id: string; title: string }) => [t.id, t.title]))
  const todoTeamById = new Map<string, string | null>((todos ?? []).map((t: { id: string; team_id?: string | null }) => [t.id, t.team_id ?? null]))
  const noteTeamById = new Map<string, string | null>((notes ?? []).map((n: { id: string; team_id?: string | null }) => [n.id, n.team_id ?? null]))
  const quizSopById = new Map<string, string>((quizzes ?? []).map((q: { id: string; sop_id: string }) => [q.id, q.sop_id]))
  const quizTitleById = new Map<string, string>((quizzes ?? []).map((q: { id: string; title: string }) => [q.id, q.title]))

  // Build a deep-link href that includes the item id and its space (team or personal)
  function noteHref(noteId: string): string {
    const teamId = noteTeamById.get(noteId)
    return `/notes?id=${noteId}${teamId ? `&space=${teamId}` : ''}`
  }
  function todoHref(todoId: string): string {
    const teamId = todoTeamById.get(todoId)
    return `/todos?id=${todoId}${teamId ? `&space=${teamId}` : ''}`
  }

  const actor = (id: string | null | undefined) => (id ? nameById.get(id) ?? null : null)
  const events: ActivityEvent[] = []
  // Treat updated_at within ~2s of created_at as "no real edit" (just the insert).
  const EDIT_THRESHOLD_MS = 2000

  // ── SOPs: created, and a "modified" event if it was edited after creation ────
  for (const s of (sops ?? []) as { id: string; title: string; status: string; author_id: string | null; created_at: string; updated_at: string }[]) {
    events.push({
      id: `sop-new-${s.id}`, type: 'sop_created', category: 'SOPs',
      title: s.title, actorName: actor(s.author_id), date: s.created_at, href: `/sops/${s.id}`,
    })
    if (s.updated_at && new Date(s.updated_at).getTime() - new Date(s.created_at).getTime() > EDIT_THRESHOLD_MS) {
      events.push({
        id: `sop-upd-${s.id}`, type: 'sop_updated', category: 'SOPs',
        title: s.title, actorName: actor(s.author_id), date: s.updated_at, href: `/sops/${s.id}`,
      })
    }
  }

  // ── SOP versions = real publish history (actor = whoever published) ──────────
  for (const v of (versions ?? []) as { id: string; sop_id: string; version_number: number; created_by: string | null; created_at: string }[]) {
    events.push({
      id: `sopver-${v.id}`, type: 'sop_published', category: 'SOPs',
      title: `${sopTitleById.get(v.sop_id) ?? 'SOP'} (v${v.version_number})`,
      actorName: actor(v.created_by), date: v.created_at, href: `/sops/${v.sop_id}`,
    })
  }

  // ── Approvals ────────────────────────────────────────────────────────────────
  for (const a of (approvals ?? []) as { id: string; sop_id: string; approver_id: string | null; status: string; created_at: string }[]) {
    const type: ActivityEvent['type'] =
      a.status === 'approved' ? 'sop_approved'
      : a.status === 'rejected' ? 'sop_rejected'
      : 'sop_changes_requested'
    events.push({
      id: `appr-${a.id}`, type, category: 'SOPs',
      title: sopTitleById.get(a.sop_id) ?? 'SOP', actorName: actor(a.approver_id),
      date: a.created_at, href: `/sops/${a.sop_id}`,
    })
  }

  // ── Todos: created, completed, deleted ───────────────────────────────────────
  for (const t of (todos ?? []) as { id: string; title: string; owner_id: string | null; team_id?: string | null; created_at: string; completed_at: string | null; deleted_at: string | null; deleted_by: string | null; is_done: boolean }[]) {
    events.push({
      id: `todo-new-${t.id}`, type: 'todo_created', category: 'Tasks',
      title: t.title, actorName: actor(t.owner_id), date: t.created_at, href: todoHref(t.id),
    })
    if (t.completed_at) {
      events.push({
        id: `todo-done-${t.id}`, type: 'todo_completed', category: 'Tasks',
        title: t.title, actorName: actor(t.owner_id), date: t.completed_at, href: todoHref(t.id),
      })
    }
    if (t.deleted_at) {
      events.push({
        id: `todo-del-${t.id}`, type: 'todo_deleted', category: 'Tasks',
        title: t.title, actorName: actor(t.deleted_by ?? t.owner_id), date: t.deleted_at,
      })
    }
  }

  // ── Notes: created and deleted (from notes table; updates come from note_versions) ─
  for (const n of (notes ?? []) as { id: string; title: string; owner_id: string | null; team_id?: string | null; created_at: string; updated_at: string; deleted_at: string | null; deleted_by: string | null }[]) {
    events.push({
      id: `note-new-${n.id}`, type: 'note_created', category: 'Notes',
      title: n.title || 'Untitled note', actorName: actor(n.owner_id), date: n.created_at, href: noteHref(n.id),
    })
    if (n.deleted_at) {
      events.push({
        id: `note-del-${n.id}`, type: 'note_deleted', category: 'Notes',
        title: n.title || 'Untitled note', actorName: actor(n.deleted_by ?? n.owner_id), date: n.deleted_at,
      })
    }
  }

  // ── Note versions: one event per saved version (who edited, when, version #) ─
  for (const v of (noteVersions ?? []) as { id: string; note_id: string; version_number: number; title: string; changed_by: string | null; created_at: string }[]) {
    events.push({
      id: `nver-${v.id}`, type: 'note_updated', category: 'Notes',
      title: `${v.title || 'Untitled note'} (v${v.version_number})`,
      actorName: actor(v.changed_by), date: v.created_at, href: noteHref(v.note_id),
    })
  }

  // ── Todo events: status changes, edits, assignee changes ─────────────────────
  for (const e of (todoEvts ?? []) as { id: string; todo_id: string; event_type: string; actor_id: string | null; old_value: string | null; new_value: string | null; created_at: string }[]) {
    const tTitle = todoTitleById.get(e.todo_id) ?? 'a task'
    if (e.event_type === 'title_changed' || e.event_type === 'detail_changed' ||
        e.event_type === 'priority_changed' || e.event_type === 'due_date_changed') {
      events.push({
        id: `tevt-${e.id}`, type: 'todo_updated', category: 'Tasks',
        title: tTitle, actorName: actor(e.actor_id), date: e.created_at, href: todoHref(e.todo_id),
      })
    } else if (e.event_type === 'status_changed') {
      events.push({
        id: `tevt-${e.id}`, type: 'todo_status_changed', category: 'Tasks',
        title: `${tTitle} → ${e.new_value ?? '?'}`,
        actorName: actor(e.actor_id), date: e.created_at, href: todoHref(e.todo_id),
      })
    } else if (e.event_type === 'assigned') {
      const assigneeName = e.new_value ? (nameById.get(e.new_value) ?? e.new_value) : 'someone'
      events.push({
        id: `tevt-${e.id}`, type: 'todo_assigned', category: 'Tasks',
        title: `${tTitle} → ${assigneeName}`,
        actorName: actor(e.actor_id), date: e.created_at, href: todoHref(e.todo_id),
      })
    }
  }

  // ── Quizzes created ───────────────────────────────────────────────────────────
  for (const q of (quizzes ?? []) as { id: string; sop_id: string; title: string; created_at: string }[]) {
    events.push({
      id: `quiz-new-${q.id}`, type: 'quiz_created', category: 'Quizzes',
      title: q.title, actorName: null, date: q.created_at, href: `/admin/quizzes/${q.id}`,
    })
  }

  // ── Quiz enrollments: enrolled, passed/failed ────────────────────────────────
  for (const e of (enrollments ?? []) as { id: string; quiz_id: string; user_id: string | null; enrolled_by: string | null; enrolled_at: string; completed_at: string | null; status: string }[]) {
    const qTitle = quizTitleById.get(e.quiz_id) ?? 'a quiz'
    events.push({
      id: `enr-${e.id}`, type: 'quiz_enrolled', category: 'Quizzes',
      title: `${actor(e.user_id) ?? 'A user'} → ${qTitle}`, actorName: actor(e.enrolled_by),
      date: e.enrolled_at, href: `/admin/quizzes/${e.quiz_id}`,
    })
    if (e.completed_at && (e.status === 'passed' || e.status === 'failed')) {
      events.push({
        id: `enrdone-${e.id}`, type: e.status === 'passed' ? 'quiz_passed' : 'quiz_failed', category: 'Quizzes',
        title: qTitle, actorName: actor(e.user_id), date: e.completed_at, href: `/admin/quizzes/${e.quiz_id}`,
      })
    }
  }

  // ── Login / logout events (from auth.audit_log_entries via get_auth_events RPC) ─
  for (const e of (authEvents ?? []) as { id: string; actor_id: string | null; action: string; created_at: string }[]) {
    const type = e.action === 'logout' ? 'user_logout' : 'user_login'
    const name = e.actor_id ? (nameById.get(e.actor_id) ?? null) : null
    events.push({
      id: `auth-${e.id}`, type, category: 'Users',
      title: name ?? 'the app',
      actorName: name,
      date: e.created_at,
    })
  }

  // ── Admin tag tables ──────────────────────────────────────────────────────────
  for (const c of (companies ?? []) as { id: string; name: string; created_at: string }[]) {
    events.push({ id: `co-${c.id}`, type: 'company_created', category: 'Admin', title: c.name, actorName: null, date: c.created_at, href: `/companies/${c.id}` })
  }
  for (const p of (platforms ?? []) as { id: string; name: string; created_at: string }[]) {
    events.push({ id: `pf-${p.id}`, type: 'platform_created', category: 'Admin', title: p.name, actorName: null, date: p.created_at })
  }
  for (const c of (categories ?? []) as { id: string; name: string; created_at: string }[]) {
    events.push({ id: `cat-${c.id}`, type: 'category_created', category: 'Admin', title: c.name, actorName: null, date: c.created_at })
  }

  // ── Sort newest-first, cap total ────────────────────────────────────────────
  events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  const truncated = events.length > TOTAL_LIMIT
  const trimmed = truncated ? events.slice(0, TOTAL_LIMIT) : events

  return <ActivityLog events={trimmed} truncated={truncated} />
}
