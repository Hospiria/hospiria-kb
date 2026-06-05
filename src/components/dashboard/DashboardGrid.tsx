'use client'

import { useState, useCallback, useRef, useMemo, createContext, useContext } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  SlidersHorizontal, CheckCircle2, Clock, AlertTriangle,
  FileText, GraduationCap, StickyNote, TrendingUp,
  ListChecks, ChevronRight, Pin, RotateCcw,
  GripVertical, EyeOff, Check, Plus, Sparkles, Trash2, Bell, Loader2, Flag,
} from 'lucide-react'
import type { MemberChase, TeamQuizStat } from '@/app/(app)/dashboard/page'
import type { Profile } from '@/types'

type Person = { id: string; full_name: string | null }
type TeamLite = { id: string; name: string }

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

// ─── Card catalogue ───────────────────────────────────────────────────────────

type CardKey =
  | 'tasks_today' | 'sops_approve' | 'team_chase' | 'quiz_team'
  | 'my_notes' | 'my_courses' | 'team_sops' | 'my_sops'

const CARD_CATALOGUE: {
  key: CardKey; label: string; description: string; icon: typeof Clock; roles: string[]; defaultSpan: number
}[] = [
  { key: 'tasks_today', label: 'My Tasks',          description: 'Daily, weekly & one-off to-dos',     icon: ListChecks,    roles: ['team_leader','junior_team_leader','approver','agent'], defaultSpan: 8 },
  { key: 'sops_approve', label: 'SOPs to Approve',   description: 'Submitted SOPs waiting for review',   icon: Clock,         roles: ['team_leader','approver'], defaultSpan: 4 },
  { key: 'quiz_team',    label: 'Quiz Performance',  description: 'Team quiz completion rates',          icon: TrendingUp,    roles: ['team_leader','approver'], defaultSpan: 6 },
  { key: 'team_chase',   label: 'Chase Up',          description: 'Team members with overdue quizzes',   icon: AlertTriangle, roles: ['team_leader','approver'], defaultSpan: 6 },
  { key: 'my_courses',   label: 'My Courses',        description: 'Quizzes pending or failed',           icon: GraduationCap, roles: ['team_leader','junior_team_leader','approver','agent'], defaultSpan: 6 },
  { key: 'my_notes',     label: 'My Notes',          description: 'Your pinned and recent notes',        icon: StickyNote,    roles: ['team_leader','junior_team_leader','approver','agent'], defaultSpan: 6 },
  { key: 'team_sops',    label: 'Team SOPs',         description: 'Latest live SOPs for your team',      icon: FileText,      roles: ['team_leader','junior_team_leader','approver','agent'], defaultSpan: 6 },
  { key: 'my_sops',      label: 'My SOPs',           description: 'SOPs you have written',               icon: FileText,      roles: ['team_leader','junior_team_leader','approver'], defaultSpan: 6 },
]

const DEFAULT_HEIGHT = 420

// Simple, discrete sizes — no pixel fiddling.
const WIDTH_OPTS: { label: string; span: number }[] = [
  { label: '⅓', span: 4 }, { label: '½', span: 6 }, { label: 'Full', span: 12 },
]
const HEIGHT_OPTS: { label: string; px: number }[] = [
  { label: 'S', px: 260 }, { label: 'M', px: 420 }, { label: 'L', px: 640 },
]

// Lets each card's header render a drag grip (ClickUp-style) without threading
// props through every card component. The grid supplies the draggable handlers.
type DragProps = { draggable?: boolean; onDragStart?: (e: React.DragEvent) => void; onDragEnd?: () => void }
const CardDragContext = createContext<{ dragProps?: DragProps }>({})

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardData {
  myTasks: Record<string, unknown>[]
  sopsPending: Record<string, unknown>[]
  membersToChase: MemberChase[]
  teamQuizStats: TeamQuizStat[]
  teamSops: Record<string, unknown>[]
  myNotes: Record<string, unknown>[]
  myCourses: Record<string, unknown>[]
  mySops: Record<string, unknown>[]
  teamName: string | null
}

interface Props {
  profile: Profile
  role: string
  hiddenCards: string[]
  cardLayout?: { order?: string[]; spans?: Record<string, number>; heights?: Record<string, number> }
  userId: string
  people?: Person[]
  teams?: TeamLite[]
  data: DashboardData
  adminChildren?: React.ReactNode
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DashboardGrid({ profile, role, hiddenCards: initialHidden, cardLayout, userId, people = [], teams = [], data, adminChildren }: Props) {
  const availableCards = useMemo(() => CARD_CATALOGUE.filter(c => c.roles.includes(role)), [role])
  const availableKeys = useMemo(() => availableCards.map(c => c.key as string), [availableCards])

  const [hidden, setHidden] = useState<Set<string>>(new Set(initialHidden))
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  // Layout: merge stored order/spans with available cards (append any new cards).
  const [order, setOrder] = useState<string[]>(() => {
    const stored = (cardLayout?.order ?? []).filter(k => availableKeys.includes(k))
    const missing = availableKeys.filter(k => !stored.includes(k))
    return [...stored, ...missing]
  })
  const [spans, setSpans] = useState<Record<string, number>>(() => {
    const out: Record<string, number> = {}
    for (const c of availableCards) out[c.key] = cardLayout?.spans?.[c.key] ?? c.defaultSpan
    return out
  })
  const [heights, setHeights] = useState<Record<string, number>>(() => {
    const out: Record<string, number> = {}
    for (const c of availableCards) out[c.key] = cardLayout?.heights?.[c.key] ?? DEFAULT_HEIGHT
    return out
  })

  const dragKey = useRef<string | null>(null)

  // ── Persistence ──────────────────────────────────────────────────────────
  const persist = useCallback(async (body: Record<string, unknown>) => {
    setSaving(true)
    await fetch('/api/dashboard/preferences', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).catch(() => {})
    setSaving(false)
  }, [])

  const saveLayout = useCallback((nextOrder: string[], nextSpans: Record<string, number>, nextHeights: Record<string, number>) => {
    persist({ card_layout: { order: nextOrder, spans: nextSpans, heights: nextHeights } })
  }, [persist])

  const toggleCard = useCallback((key: string) => {
    setHidden(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      persist({ hidden_cards: [...next] })
      return next
    })
  }, [persist])

  // ── Drag to reorder ────────────────────────────────────────────────────────
  const handleDragStart = (key: string) => (e: React.DragEvent) => {
    dragKey.current = key
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', key)
  }
  const handleDragEnter = (overKey: string) => () => {
    const from = dragKey.current
    if (!from || from === overKey) return
    setOrder(prev => {
      const fi = prev.indexOf(from), ti = prev.indexOf(overKey)
      if (fi === -1 || ti === -1 || fi === ti) return prev
      const next = [...prev]; next.splice(fi, 1); next.splice(ti, 0, from)
      return next
    })
  }
  const handleDragEnd = () => {
    if (dragKey.current) saveLayout(order, spans, heights)
    dragKey.current = null
  }

  // ── Simple size setters (buttons, no dragging) ────────────────────────────
  const setWidth = (key: string, span: number) => {
    const next = { ...spans, [key]: span }
    setSpans(next); saveLayout(order, next, heights)
  }
  const setHeight = (key: string, px: number) => {
    const next = { ...heights, [key]: px }
    setHeights(next); saveLayout(order, spans, next)
  }

  const visibleOrdered = order.filter(k => availableKeys.includes(k) && !hidden.has(k))
  const allHidden = availableCards.length > 0 && visibleOrdered.length === 0

  // ── Card renderer ──────────────────────────────────────────────────────────
  const renderCard = (key: string) => {
    switch (key as CardKey) {
      case 'tasks_today': return <TasksCard tasks={data.myTasks} people={people} teams={teams} currentUserId={userId} editing={editing} />
      case 'sops_approve': return <SopsApproveCard sops={data.sopsPending} editing={editing} />
      case 'quiz_team':    return <QuizTeamCard stats={data.teamQuizStats} />
      case 'team_chase':   return <ChaseCard members={data.membersToChase} editing={editing} />
      case 'my_courses':   return <MyCoursesCard courses={data.myCourses} />
      case 'my_notes':     return <MyNotesCard notes={data.myNotes} />
      case 'team_sops':    return <TeamSopsCard sops={data.teamSops} teamName={data.teamName} />
      case 'my_sops':      return <MySopsCard sops={data.mySops} />
      default: return null
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-black text-navy-700 tracking-tight">
            {greeting()}, {profile.full_name?.split(' ')[0] ?? 'there'} 👋
          </h1>
          <p className="text-gray-400 text-sm mt-1 font-medium">
            {data.teamName ? `${data.teamName} · ` : ''}Hospiria Knowledge Base
          </p>
        </div>
        {availableCards.length > 0 && (
          <button onClick={() => setEditing(v => !v)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm font-medium transition-colors flex-shrink-0 ${editing ? 'bg-navy-700 text-white border-navy-700' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
            {editing ? <Check className="w-4 h-4" /> : <SlidersHorizontal className="w-4 h-4" />}
            {editing ? (saving ? 'Saving…' : 'Done') : 'Customise'}
          </button>
        )}
      </div>

      {/* Manage Cards drawer (right side, ClickUp-style) */}
      {editing && availableCards.length > 0 && (
        <>
          <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setEditing(false)} />
          <div className="fixed right-0 top-0 h-full w-80 bg-white shadow-2xl z-50 flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="font-bold text-navy-700">Manage cards</h2>
              <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-navy-700"><Check className="w-5 h-5" /></button>
            </div>
            <p className="px-5 pt-3 text-[11px] text-gray-400">
              Drag <GripVertical className="w-3 h-3 inline -mt-0.5" /> on a card to reorder · use the W/H buttons on a card to resize.
            </p>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {availableCards.map(card => {
                const visible = !hidden.has(card.key)
                return (
                  <div key={card.key} className="flex items-start gap-3 p-3 rounded-xl border border-gray-200">
                    <div className="p-1.5 rounded-lg bg-navy-50 text-navy-600 flex-shrink-0"><card.icon className="w-4 h-4" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-navy-700">{card.label}</p>
                      <p className="text-[11px] text-gray-400 leading-snug">{card.description}</p>
                    </div>
                    <button onClick={() => toggleCard(card.key)}
                      className={`text-[11px] font-semibold px-2 py-1 rounded-lg flex-shrink-0 flex items-center gap-1 transition-colors ${visible ? 'bg-teal-50 text-teal-700 border border-teal-200' : 'bg-navy-700 text-white'}`}>
                      {visible ? <><Check className="w-3 h-3" /> Added</> : 'Add'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* Super admin: original rich dashboard first */}
      {role === 'super_admin' && adminChildren && <div className="mb-6">{adminChildren}</div>}

      {/* Cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start [grid-auto-flow:row_dense]">
        {visibleOrdered.map(key => (
          <div
            key={key}
            style={{ gridColumn: `span ${spans[key] ?? 6}`, height: `${heights[key] ?? DEFAULT_HEIGHT}px` }}
            className={`relative ${editing ? 'ring-2 ring-navy-100 rounded-2xl' : ''}`}
            onDragEnter={handleDragEnter(key)}
            onDragOver={(e) => e.preventDefault()}
          >
            {/* Card content. Drag-to-reorder is always available via the header
                grip. Only in edit mode do we make the body inert so clicks land
                on the size/hide toolbar instead of navigating. */}
            <div className={`h-full ${editing ? 'pointer-events-none select-none' : ''}`}>
              <CardDragContext.Provider value={{
                dragProps: { draggable: true, onDragStart: handleDragStart(key), onDragEnd: handleDragEnd },
              }}>
                {renderCard(key)}
              </CardDragContext.Provider>
            </div>

            {/* Size + hide toolbar (edit mode only) */}
            {editing && (
              <div className="absolute top-2 right-2 z-30 flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg shadow-sm px-1.5 py-1 pointer-events-auto">
                <span className="text-[10px] text-gray-400 font-semibold pl-0.5">W</span>
                {WIDTH_OPTS.map(w => (
                  <button key={w.label} onClick={() => setWidth(key, w.span)}
                    className={`text-[11px] font-bold w-6 h-5 rounded transition-colors ${(spans[key] ?? 6) === w.span ? 'bg-navy-700 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                    {w.label}
                  </button>
                ))}
                <span className="w-px h-4 bg-gray-200 mx-0.5" />
                <span className="text-[10px] text-gray-400 font-semibold">H</span>
                {HEIGHT_OPTS.map(h => (
                  <button key={h.label} onClick={() => setHeight(key, h.px)}
                    className={`text-[11px] font-bold w-5 h-5 rounded transition-colors ${(heights[key] ?? DEFAULT_HEIGHT) === h.px ? 'bg-navy-700 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                    {h.label}
                  </button>
                ))}
                <span className="w-px h-4 bg-gray-200 mx-0.5" />
                <button onClick={() => toggleCard(key)} title="Hide this card"
                  className="p-1 rounded text-gray-400 hover:text-red-500">
                  <EyeOff className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}

        {/* Empty state */}
        {allHidden && (
          <div className="md:col-span-12 text-center py-16 bg-white border border-dashed border-gray-200 rounded-2xl">
            <p className="text-gray-400 text-sm">All cards are hidden.</p>
            <button onClick={() => { setHidden(new Set()); persist({ hidden_cards: [] }) }}
              className="mt-2 text-sm text-teal-600 hover:underline flex items-center gap-1 mx-auto">
              <RotateCcw className="w-3.5 h-3.5" /> Restore all cards
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Shared shell ─────────────────────────────────────────────────────────────

function CardShell({ title, icon: Icon, count, href, color = 'teal', headerRight, children }: {
  title: string; icon: typeof Clock; count?: number; href?: string
  color?: 'teal'|'amber'|'red'|'navy'; headerRight?: React.ReactNode; children: React.ReactNode
}) {
  const colors = {
    teal:  'bg-teal-50 text-teal-600', amber: 'bg-amber-50 text-amber-600',
    red:   'bg-red-50 text-red-600',   navy:  'bg-navy-50 text-navy-600',
  }
  const { dragProps } = useContext(CardDragContext)
  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm h-full flex flex-col">
      <div className="px-4 py-3.5 border-b border-gray-100 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            {...dragProps}
            title="Drag to move card"
            className="pointer-events-auto cursor-grab active:cursor-grabbing text-gray-300 hover:text-navy-600 flex-shrink-0 touch-none">
            <GripVertical className="w-4 h-4" />
          </span>
          <div className={`p-1.5 rounded-lg flex-shrink-0 ${colors[color]}`}><Icon className="w-4 h-4" /></div>
          <h2 className="font-bold text-navy-700 text-sm truncate">{title}</h2>
          {count !== undefined && <span className="text-xs text-gray-400 font-medium flex-shrink-0">({count})</span>}
        </div>
        {headerRight ?? (href && <Link href={href} className="text-xs text-teal-600 hover:underline font-medium flex-shrink-0">View all</Link>)}
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  )
}

// ─── My Tasks (tabbed: All / Daily / Weekly / Tasks) ───────────────────────────

type TodoRow = {
  id: string; title: string; detail?: string | null; due_date: string | null; priority: string
  is_done: boolean; is_carry: boolean; status: string
  recurrence: string; recurrence_parent_id: string | null
  assignee_id?: string | null; team_id?: string | null
}
type TaskView = 'all' | 'daily' | 'weekly' | 'tasks'
const TASK_TABS: { key: TaskView; label: string }[] = [
  { key: 'all',    label: 'All' },
  { key: 'daily',  label: '🌅 Daily' },
  { key: 'weekly', label: '📅 Weekly' },
  { key: 'tasks',  label: '✅ Tasks' },
]

function Empty({ msg }: { msg: string }) {
  return <p className="text-sm text-gray-400 italic px-5 py-6">{msg}</p>
}

const PRIO: Record<string, { c: string; l: string }> = {
  high:   { c: 'text-red-500',   l: 'High' },
  medium: { c: 'text-amber-500', l: 'Medium' },
  low:    { c: 'text-gray-300',  l: 'Low' },
}

type GroupDef = { key: string; label: string; tone?: 'red' | 'amber'; items: TodoRow[]; recurrence: 'none'|'daily'|'weekly'; due: string }

function TasksCard({ tasks, people, teams, editing }: {
  tasks: Record<string, unknown>[]; people: Person[]; teams: TeamLite[]; currentUserId: string; editing: boolean
}) {
  const router = useRouter()
  const [items, setItems] = useState<TodoRow[]>(() => tasks as TodoRow[])
  const [view, setView] = useState<TaskView>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [addingIn, setAddingIn] = useState<string | null>(null)
  const [groupText, setGroupText] = useState('')

  // Top quick-add (AI / manual)
  const [showAdd, setShowAdd] = useState(false)
  const [addMode, setAddMode] = useState<'ai' | 'manual'>('ai')
  const [addText, setAddText] = useState('')
  const [adding, setAdding] = useState(false)
  const [mPriority, setMPriority] = useState('medium')
  const [mDue, setMDue] = useState('')
  const [mAssignee, setMAssignee] = useState('')
  const [mTeam, setMTeam] = useState('')
  const [mRecur, setMRecur] = useState<'none' | 'daily' | 'weekly'>('none')

  const nameById = useMemo(() => new Map(people.map(p => [p.id, p.full_name])), [people])
  const today = new Date().toISOString().slice(0, 10)

  const daily   = items.filter(t => t.recurrence === 'daily'  && !t.recurrence_parent_id)
  const weekly  = items.filter(t => t.recurrence === 'weekly' && !t.recurrence_parent_id)
  const oneOff  = items.filter(t => (t.recurrence ?? 'none') === 'none')
  const overdue  = oneOff.filter(t => t.due_date && t.due_date < today)
  const dueToday = oneOff.filter(t => t.due_date === today)
  const upcoming = oneOff.filter(t => !t.due_date || t.due_date > today)
  const counts: Record<TaskView, number> = { all: items.length, daily: daily.length, weekly: weekly.length, tasks: oneOff.length }

  // Groups per view
  const groups: GroupDef[] = (() => {
    const od: GroupDef = { key: 'overdue', label: 'Overdue', tone: 'red', items: overdue, recurrence: 'none', due: today }
    const dt: GroupDef = { key: 'today', label: 'Due today', tone: 'amber', items: dueToday, recurrence: 'none', due: today }
    const up: GroupDef = { key: 'upcoming', label: 'Upcoming', items: upcoming, recurrence: 'none', due: '' }
    const da: GroupDef = { key: 'daily', label: '🌅 Daily routines', items: daily, recurrence: 'daily', due: '' }
    const wk: GroupDef = { key: 'weekly', label: '📅 Weekly routines', items: weekly, recurrence: 'weekly', due: '' }
    if (view === 'daily') return [da]
    if (view === 'weekly') return [wk]
    if (view === 'tasks') return [od, dt, up]
    return [od, dt, up, da, wk]
  })()

  // ── Mutations (optimistic) ────────────────────────────────────────────────
  async function toggleDone(t: TodoRow) {
    setItems(prev => prev.filter(x => x.id !== t.id))
    await fetch(`/api/todos/${t.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done', isDone: true }),
    }).catch(() => setItems(prev => [t, ...prev]))
  }
  async function saveEdit(id: string, patch: Partial<{ priority: string; dueDate: string; assigneeId: string; teamId: string }>) {
    setBusyId(id)
    setItems(prev => prev.map(x => x.id === id ? {
      ...x,
      priority: patch.priority ?? x.priority,
      due_date: patch.dueDate !== undefined ? (patch.dueDate || null) : x.due_date,
      assignee_id: patch.assigneeId !== undefined ? (patch.assigneeId || null) : x.assignee_id,
      team_id: patch.teamId !== undefined ? (patch.teamId || null) : x.team_id,
    } : x))
    await fetch(`/api/todos/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    }).catch(() => {})
    setBusyId(null)
  }
  async function del(id: string) {
    setItems(prev => prev.filter(x => x.id !== id)); setExpandedId(null)
    await fetch(`/api/todos/${id}`, { method: 'DELETE' }).catch(() => {})
  }
  async function createTodo(body: Record<string, unknown>): Promise<boolean> {
    const res = await fetch('/api/todos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).catch(() => null)
    if (!res || !res.ok) return false
    const d = await res.json()
    if (d.todo) { setItems(prev => [d.todo as TodoRow, ...prev]); router.refresh(); return true }
    return false
  }
  async function addTop() {
    if (!addText.trim() || adding) return
    setAdding(true)
    try {
      let body: Record<string, unknown>
      if (addMode === 'ai') {
        const r = await fetch('/api/todos/ai', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: addText }),
        })
        const d = await r.json()
        if (!r.ok || !d.draft) return
        body = { ...d.draft }
      } else {
        body = { title: addText, priority: mPriority, dueDate: mDue || null, assigneeId: mAssignee || null, teamId: mTeam || null, recurrence: mRecur }
      }
      if (await createTodo(body)) {
        setAddText(''); setMDue(''); setMAssignee(''); setMTeam(''); setMRecur('none'); setMPriority('medium')
      }
    } finally { setAdding(false) }
  }
  async function addToGroup(g: GroupDef) {
    if (!groupText.trim()) return
    const ok = await createTodo({ title: groupText, priority: 'medium', recurrence: g.recurrence, dueDate: g.due || null })
    if (ok) setGroupText('') // keep input open for rapid entry
  }

  const tabs = (
    <div className="flex items-center gap-1">
      {TASK_TABS.map(t => (
        <button key={t.key} onClick={() => setView(t.key)}
          className={`px-2 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap transition-colors ${view === t.key ? 'bg-navy-700 text-white border-navy-700' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>
          {t.label}{counts[t.key] > 0 ? ` ${counts[t.key]}` : ''}
        </button>
      ))}
    </div>
  )

  const dueCell = (t: TodoRow) => {
    if ((t.recurrence ?? 'none') !== 'none') return <span className="text-[11px] text-gray-300">—</span>
    if (!t.due_date) return <span className="text-[11px] text-gray-300">—</span>
    const cls = t.due_date < today ? 'text-red-500 font-semibold' : t.due_date === today ? 'text-amber-600 font-semibold' : 'text-gray-500'
    const d = new Date(t.due_date + 'T00:00:00')
    return <span className={`text-[11px] ${cls}`}>{d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
  }

  // ── Row (ClickUp-style table) ──────────────────────────────────────────────
  const Row = (t: TodoRow) => {
    const open = expandedId === t.id
    const assigneeName = t.assignee_id ? nameById.get(t.assignee_id) : null
    const prio = PRIO[t.priority] ?? PRIO.medium
    return (
      <div key={t.id} className="border-b border-gray-50 last:border-0">
        <div className="grid grid-cols-[18px_1fr_64px_64px] items-center gap-2 py-2 group/row">
          <button onClick={() => toggleDone(t)} title="Mark complete"
            className="w-4 h-4 rounded-full border-2 border-gray-300 hover:border-teal-500 hover:bg-teal-50 transition-colors" />
          <button onClick={() => setExpandedId(open ? null : t.id)} className="flex items-center gap-2 min-w-0 text-left">
            <span className="text-sm text-navy-700 truncate group-hover/row:text-teal-600">{t.title}</span>
            {assigneeName && <span className="text-[10px] text-gray-400 flex-shrink-0 max-w-[70px] truncate">· {assigneeName}</span>}
            {t.is_carry && <span className="text-[9px] bg-red-100 text-red-600 font-bold px-1 py-0.5 rounded flex-shrink-0">DUE</span>}
          </button>
          <div className="flex items-center gap-1 justify-self-start" title={`Priority: ${prio.l}`}>
            <Flag className={`w-3.5 h-3.5 ${prio.c}`} fill="currentColor" />
            {t.priority === 'high' && <span className="text-[10px] text-red-500 font-semibold">High</span>}
          </div>
          <div className="justify-self-end pr-1">{dueCell(t)}</div>
        </div>
        {open && (
          <div className="pb-3 pl-6 pr-1 grid grid-cols-2 gap-2 bg-slate-50/50 rounded-lg mb-1">
            <label className="text-[10px] font-semibold text-gray-400">Priority
              <select value={t.priority} onChange={e => saveEdit(t.id, { priority: e.target.value })} className="mt-0.5 w-full border border-gray-200 rounded-lg px-2 py-1 text-xs">
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
              </select>
            </label>
            <label className="text-[10px] font-semibold text-gray-400">Due date
              <input type="date" value={t.due_date ?? ''} onChange={e => saveEdit(t.id, { dueDate: e.target.value })} className="mt-0.5 w-full border border-gray-200 rounded-lg px-2 py-1 text-xs" />
            </label>
            <label className="text-[10px] font-semibold text-gray-400">Assigned to
              <select value={t.assignee_id ?? ''} onChange={e => saveEdit(t.id, { assigneeId: e.target.value })} className="mt-0.5 w-full border border-gray-200 rounded-lg px-2 py-1 text-xs">
                <option value="">Unassigned</option>
                {people.map(p => <option key={p.id} value={p.id}>{p.full_name ?? 'Unknown'}</option>)}
              </select>
            </label>
            <label className="text-[10px] font-semibold text-gray-400">Team
              <select value={t.team_id ?? ''} onChange={e => saveEdit(t.id, { teamId: e.target.value })} className="mt-0.5 w-full border border-gray-200 rounded-lg px-2 py-1 text-xs">
                <option value="">Personal</option>
                {teams.map(tm => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
              </select>
            </label>
            <div className="col-span-2 flex items-center justify-between mt-1">
              <Link href="/notes" className="text-[11px] text-teal-600 hover:underline">Open in Notes →</Link>
              <button onClick={() => del(t.id)} className="text-[11px] text-red-400 hover:text-red-600 flex items-center gap-1">
                <Trash2 className="w-3 h-3" /> Delete
              </button>
            </div>
            {busyId === t.id && <span className="col-span-2 text-[10px] text-gray-400">Saving…</span>}
          </div>
        )}
      </div>
    )
  }

  const Group = (g: GroupDef) => {
    const isCollapsed = collapsed.has(g.key)
    const toneClass = g.tone === 'red' ? 'text-red-600' : g.tone === 'amber' ? 'text-amber-600' : 'text-gray-500'
    return (
      <div key={g.key} className="px-5 pt-2">
        <button onClick={() => setCollapsed(prev => { const n = new Set(prev); n.has(g.key) ? n.delete(g.key) : n.add(g.key); return n })}
          className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide mb-0.5">
          <ChevronRight className={`w-3 h-3 transition-transform ${isCollapsed ? '' : 'rotate-90'} text-gray-400`} />
          <span className={toneClass}>{g.label}</span>
          <span className="text-gray-300 font-semibold">{g.items.length}</span>
        </button>
        {!isCollapsed && (
          <>
            {g.items.map(Row)}
            {addingIn === g.key ? (
              <div className="flex items-center gap-1.5 py-1.5">
                <input autoFocus value={groupText} onChange={e => setGroupText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addToGroup(g); if (e.key === 'Escape') { setAddingIn(null); setGroupText('') } }}
                  onBlur={() => { if (!groupText.trim()) setAddingIn(null) }}
                  placeholder="Task name, then Enter…"
                  className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
            ) : (
              <button onClick={() => { setAddingIn(g.key); setGroupText('') }}
                className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-teal-600 py-1.5">
                <Plus className="w-3 h-3" /> Add Task
              </button>
            )}
          </>
        )}
      </div>
    )
  }

  return (
    <CardShell title="My Tasks" icon={ListChecks} color={overdue.length > 0 ? 'red' : 'teal'} headerRight={tabs}>
      <div className="h-full overflow-y-auto flex flex-col">
        {/* Quick-add (collapsible, AI / manual) */}
        {!editing && (
          <div className="px-5 py-2 border-b border-gray-100">
            {!showAdd ? (
              <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 text-xs font-semibold text-teal-600 hover:text-teal-700">
                <Plus className="w-3.5 h-3.5" /> Quick add
              </button>
            ) : (
              <div className="bg-slate-50/70 -mx-1 px-2 py-2 rounded-lg">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <button onClick={() => setAddMode('ai')} className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${addMode === 'ai' ? 'bg-teal-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}><Sparkles className="w-3 h-3" /> AI</button>
                  <button onClick={() => setAddMode('manual')} className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${addMode === 'manual' ? 'bg-navy-700 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>Manual</button>
                  <button onClick={() => setShowAdd(false)} className="ml-auto text-[11px] text-gray-400 hover:text-gray-600">Close</button>
                </div>
                <div className="flex items-center gap-1.5">
                  <input value={addText} onChange={e => setAddText(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTop()}
                    placeholder={addMode === 'ai' ? 'e.g. “chase checkout report Friday, high priority”' : 'Task title…'}
                    className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                  <button onClick={addTop} disabled={adding || !addText.trim()} className="flex items-center gap-1 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg disabled:opacity-50">
                    {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add
                  </button>
                </div>
                {addMode === 'manual' && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    <select value={mPriority} onChange={e => setMPriority(e.target.value)} className="border border-gray-200 rounded-lg px-1.5 py-1 text-[11px]"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select>
                    <input type="date" value={mDue} onChange={e => setMDue(e.target.value)} className="border border-gray-200 rounded-lg px-1.5 py-1 text-[11px]" />
                    <select value={mRecur} onChange={e => setMRecur(e.target.value as 'none'|'daily'|'weekly')} className="border border-gray-200 rounded-lg px-1.5 py-1 text-[11px]"><option value="none">Once</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select>
                    <select value={mAssignee} onChange={e => setMAssignee(e.target.value)} className="border border-gray-200 rounded-lg px-1.5 py-1 text-[11px] max-w-[120px]"><option value="">Assignee…</option>{people.map(p => <option key={p.id} value={p.id}>{p.full_name ?? 'Unknown'}</option>)}</select>
                    <select value={mTeam} onChange={e => setMTeam(e.target.value)} className="border border-gray-200 rounded-lg px-1.5 py-1 text-[11px] max-w-[120px]"><option value="">Personal</option>{teams.map(tm => <option key={tm.id} value={tm.id}>{tm.name}</option>)}</select>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Column header */}
        <div className="grid grid-cols-[18px_1fr_64px_64px] gap-2 px-5 py-1.5 border-b border-gray-100 text-[10px] font-bold uppercase tracking-wide text-gray-400 sticky top-0 bg-white z-10">
          <span /><span>Name</span><span className="justify-self-start">Priority</span><span className="justify-self-end pr-1">Due</span>
        </div>

        {/* Grouped list */}
        {items.length === 0 ? (
          <Empty msg="No open tasks — add one above. 🎉" />
        ) : groups.every(g => g.items.length === 0) ? (
          <Empty msg={view === 'daily' ? 'No daily routines.' : view === 'weekly' ? 'No weekly routines.' : 'Nothing here.'} />
        ) : (
          groups.filter(g => g.items.length > 0 || g.key === 'today' || g.key === 'upcoming' || view === 'daily' || view === 'weekly').map(Group)
        )}
      </div>
    </CardShell>
  )
}

// ─── SOPs to approve ───────────────────────────────────────────────────────────

type SopRow = { id: string; title: string; updated_at: string; profiles?: { full_name: string | null } | null; categories?: { name: string } | null }

function SopsApproveCard({ sops, editing }: { sops: Record<string, unknown>[]; editing: boolean }) {
  const router = useRouter()
  const [rows, setRows] = useState<SopRow[]>(() => sops as SopRow[])
  const [busy, setBusy] = useState<string | null>(null)

  async function approve(id: string) {
    setBusy(id)
    const res = await fetch(`/api/sops/${id}/approve`, { method: 'POST' }).catch(() => null)
    if (res && res.ok) {
      setRows(prev => prev.filter(s => s.id !== id))
      router.refresh()
    }
    setBusy(null)
  }

  return (
    <CardShell title="SOPs to Approve" icon={Clock} count={rows.length} color="amber">
      {rows.length === 0 ? <Empty msg="✅ Nothing waiting for approval." /> : (
        <div className="divide-y divide-gray-50 h-full overflow-y-auto">
          {rows.map(s => (
            <div key={s.id} className="flex items-center gap-2 px-5 py-3 hover:bg-amber-50 group">
              <Link href={`/sops/${s.id}/approve`} className="min-w-0 flex-1 pointer-events-auto">
                <p className="text-sm font-semibold text-navy-700 truncate group-hover:text-amber-700">{s.title}</p>
                <p className="text-xs text-gray-400 mt-0.5 truncate">By {s.profiles?.full_name ?? 'Unknown'} · {s.categories?.name ?? 'Uncategorised'}</p>
              </Link>
              {!editing && (
                <>
                  <button onClick={() => approve(s.id)} disabled={busy === s.id} title="Approve & publish"
                    className="pointer-events-auto flex items-center gap-1 bg-green-600 hover:bg-green-700 text-white text-[11px] font-semibold px-2 py-1 rounded-lg disabled:opacity-50 flex-shrink-0">
                    {busy === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Approve
                  </button>
                  <Link href={`/sops/${s.id}/approve`} title="Review" className="pointer-events-auto text-gray-300 hover:text-amber-500 flex-shrink-0">
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </CardShell>
  )
}

// ─── Quiz performance ──────────────────────────────────────────────────────────

function QuizTeamCard({ stats }: { stats: TeamQuizStat[] }) {
  return (
    <CardShell title="Quiz Performance" icon={TrendingUp} color="teal">
      {stats.length === 0 ? <Empty msg="No quiz data yet." /> : (
        <div className="px-5 py-3 space-y-3 h-full overflow-y-auto">
          {stats.map(s => {
            const pct = s.total > 0 ? Math.round((s.passed / s.total) * 100) : 0
            return (
              <div key={s.title}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-navy-700 truncate max-w-[70%]">{s.title}</p>
                  <span className={`text-xs font-bold ${pct >= 80 ? 'text-teal-600' : pct >= 50 ? 'text-amber-600' : 'text-red-500'}`}>{pct}%</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${pct >= 80 ? 'bg-teal-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${pct}%` }} />
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5">{s.passed} passed · {s.pending} pending · {s.failed} failed</p>
              </div>
            )
          })}
        </div>
      )}
    </CardShell>
  )
}

// ─── Chase up ──────────────────────────────────────────────────────────────────

function ChaseCard({ members, editing }: { members: MemberChase[]; editing: boolean }) {
  const [nudged, setNudged] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)

  async function nudge(m: MemberChase) {
    setBusy(m.id)
    const res = await fetch('/api/dashboard/nudge', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: m.userId, quizTitle: m.quizTitle }),
    }).catch(() => null)
    if (res && res.ok) setNudged(prev => new Set(prev).add(m.id))
    setBusy(null)
  }

  return (
    <CardShell title="Chase Up" icon={AlertTriangle} count={members.length || undefined} color="amber">
      {members.length === 0 ? <Empty msg="✅ No overdue quizzes for your team!" /> : (
        <div className="divide-y divide-gray-50 h-full overflow-y-auto">
          {members.map(m => (
            <div key={m.id} className="flex items-center gap-3 px-5 py-3">
              <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <span className="text-amber-700 text-xs font-bold">{(m.name[0] ?? '?').toUpperCase()}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-navy-700 truncate">{m.name}</p>
                <p className="text-xs text-gray-400 truncate">{m.quizTitle}</p>
                <p className="text-xs text-red-500 font-medium">Due: {m.dueDate}</p>
              </div>
              {!editing && (
                nudged.has(m.id) ? (
                  <span className="text-[11px] text-teal-600 font-semibold flex-shrink-0 flex items-center gap-1"><Check className="w-3 h-3" /> Sent</span>
                ) : (
                  <button onClick={() => nudge(m)} disabled={busy === m.id} title="Send a reminder"
                    className="pointer-events-auto flex items-center gap-1 border border-amber-300 text-amber-700 hover:bg-amber-100 text-[11px] font-semibold px-2 py-1 rounded-lg disabled:opacity-50 flex-shrink-0">
                    {busy === m.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Bell className="w-3 h-3" />} Nudge
                  </button>
                )
              )}
            </div>
          ))}
        </div>
      )}
    </CardShell>
  )
}

// ─── My courses ────────────────────────────────────────────────────────────────

type CourseRow = { id: string; status: string; score: number | null; due_date: string | null; quizzes: { id: string; title: string } | null }

function MyCoursesCard({ courses }: { courses: Record<string, unknown>[] }) {
  const rows = courses as CourseRow[]
  return (
    <CardShell title="My Courses" icon={GraduationCap} count={rows.length || undefined} href="/quizzes" color="navy">
      {rows.length === 0 ? <Empty msg="✅ No outstanding courses." /> : (
        <div className="divide-y divide-gray-50 h-full overflow-y-auto">
          {rows.map(c => (
            <Link key={c.id} href="/quizzes" className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 group pointer-events-auto">
              <div className="min-w-0 flex-1 mr-3">
                <p className="text-sm font-semibold text-navy-700 truncate group-hover:text-teal-600">{c.quizzes?.title ?? 'Quiz'}</p>
                {c.due_date && <p className="text-xs text-gray-400 mt-0.5">Due: {c.due_date}</p>}
              </div>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${c.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                {c.status === 'failed' ? 'Retry' : 'Pending'}
              </span>
            </Link>
          ))}
        </div>
      )}
    </CardShell>
  )
}

// ─── My notes ──────────────────────────────────────────────────────────────────

type NoteRow = { id: string; title: string; body: string | null; pinned: boolean; updated_at: string; sop_id: string | null }

function MyNotesCard({ notes }: { notes: Record<string, unknown>[] }) {
  const rows = notes as NoteRow[]
  return (
    <CardShell title="My Notes" icon={StickyNote} href="/notes" color="teal">
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400 italic px-5 py-6">No notes yet. <Link href="/notes" className="text-teal-600 hover:underline pointer-events-auto">Create one →</Link></p>
      ) : (
        <div className="divide-y divide-gray-50 h-full overflow-y-auto">
          {rows.map(n => (
            <Link key={n.id} href="/notes" className="flex items-start gap-2.5 px-5 py-3 hover:bg-teal-50 group pointer-events-auto">
              {n.pinned && <Pin className="w-3 h-3 text-amber-500 mt-0.5 flex-shrink-0" />}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-navy-700 truncate group-hover:text-teal-600">{n.title || 'Untitled'}</p>
                {n.body && <p className="text-xs text-gray-400 truncate">{n.body.slice(0, 90)}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </CardShell>
  )
}

// ─── Team SOPs ─────────────────────────────────────────────────────────────────

type TeamSopRow = { id: string; title: string; status: string; updated_at: string; profiles?: { full_name: string | null } | null }

function TeamSopsCard({ sops, teamName }: { sops: Record<string, unknown>[]; teamName: string | null }) {
  const rows = sops as TeamSopRow[]
  return (
    <CardShell title={`${teamName ?? 'Team'} SOPs`} icon={FileText} href="/sops" color="navy">
      {rows.length === 0 ? <Empty msg="No SOPs yet." /> : (
        <div className="divide-y divide-gray-50 h-full overflow-y-auto">
          {rows.map(s => (
            <Link key={s.id} href={`/sops/${s.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 group pointer-events-auto">
              <div className="min-w-0 flex-1 mr-3">
                <p className="text-sm font-semibold text-navy-700 truncate group-hover:text-teal-600">{s.title}</p>
                <p className="text-xs text-gray-400 mt-0.5">Updated {new Date(s.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-teal-500 flex-shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </CardShell>
  )
}

// ─── My SOPs ───────────────────────────────────────────────────────────────────

type MySopRow = { id: string; title: string; status: string; updated_at: string; categories?: { name: string } | null }

function MySopsCard({ sops }: { sops: Record<string, unknown>[] }) {
  const rows = sops as MySopRow[]
  const statusColor: Record<string, string> = { live: 'bg-teal-100 text-teal-700', draft: 'bg-gray-100 text-gray-600', submitted: 'bg-amber-100 text-amber-700' }
  return (
    <CardShell title="My SOPs" icon={FileText} href="/sops" color="navy">
      {rows.length === 0 ? <Empty msg="You haven't written any SOPs yet." /> : (
        <div className="divide-y divide-gray-50 h-full overflow-y-auto">
          {rows.map(s => (
            <Link key={s.id} href={`/sops/${s.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 group pointer-events-auto">
              <div className="min-w-0 flex-1 mr-3">
                <p className="text-sm font-semibold text-navy-700 truncate group-hover:text-teal-600">{s.title}</p>
                <p className="text-xs text-gray-400">{s.categories?.name ?? 'Uncategorised'}</p>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 capitalize ${statusColor[s.status] ?? 'bg-gray-100 text-gray-600'}`}>{s.status}</span>
            </Link>
          ))}
        </div>
      )}
    </CardShell>
  )
}
