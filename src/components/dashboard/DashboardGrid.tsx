'use client'

import { useState, useCallback, useRef, useMemo } from 'react'
import Link from 'next/link'
import {
  SlidersHorizontal, CheckCircle2, Clock, AlertTriangle,
  FileText, GraduationCap, StickyNote, TrendingUp,
  ListChecks, ChevronRight, Pin, RotateCcw,
  GripVertical, EyeOff, Check,
} from 'lucide-react'
import type { MemberChase, TeamQuizStat } from '@/app/(app)/dashboard/page'
import type { Profile } from '@/types'

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

const ALLOWED_SPANS = [4, 6, 8, 12]
const GRID_GAP = 16 // px — matches gap-4
const DEFAULT_HEIGHT = 420
const MIN_HEIGHT = 150
const MAX_HEIGHT = 820
const snapSpan = (n: number) =>
  ALLOWED_SPANS.reduce((best, s) => (Math.abs(s - n) < Math.abs(best - n) ? s : best), ALLOWED_SPANS[0])
const clampHeight = (n: number) => Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, n))

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
  data: DashboardData
  adminChildren?: React.ReactNode
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DashboardGrid({ profile, role, hiddenCards: initialHidden, cardLayout, data, adminChildren }: Props) {
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

  const gridRef = useRef<HTMLDivElement>(null)
  const dragKey = useRef<string | null>(null)
  const resizeState = useRef<{
    key: string; axes: { x: boolean; y: boolean }
    startX: number; startY: number; startSpan: number; startHeight: number; unit: number
  } | null>(null)

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

  // ── Drag to resize (x = width/span, y = height) ──────────────────────────
  const startResize = (key: string, axes: { x: boolean; y: boolean }) => (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation()
    const rect = gridRef.current?.getBoundingClientRect()
    const unit = rect ? (rect.width + GRID_GAP) / 12 : 80
    resizeState.current = {
      key, axes, unit,
      startX: e.clientX, startY: e.clientY,
      startSpan: spans[key] ?? 6, startHeight: heights[key] ?? DEFAULT_HEIGHT,
    }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onResizeMove = (e: React.PointerEvent) => {
    const rs = resizeState.current
    if (!rs) return
    if (rs.axes.x) {
      const deltaCols = Math.round((e.clientX - rs.startX) / rs.unit)
      const snapped = snapSpan(Math.min(12, Math.max(4, rs.startSpan + deltaCols)))
      setSpans(prev => (prev[rs.key] === snapped ? prev : { ...prev, [rs.key]: snapped }))
    }
    if (rs.axes.y) {
      const h = clampHeight(rs.startHeight + (e.clientY - rs.startY))
      setHeights(prev => (prev[rs.key] === h ? prev : { ...prev, [rs.key]: h }))
    }
  }
  const endResize = (e: React.PointerEvent) => {
    if (!resizeState.current) return
    ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
    resizeState.current = null
    saveLayout(order, spans, heights)
  }

  const visibleOrdered = order.filter(k => availableKeys.includes(k) && !hidden.has(k))
  const allHidden = availableCards.length > 0 && visibleOrdered.length === 0

  // ── Card renderer ──────────────────────────────────────────────────────────
  const renderCard = (key: string) => {
    switch (key as CardKey) {
      case 'tasks_today': return <TasksCard tasks={data.myTasks} />
      case 'sops_approve': return <SopsApproveCard sops={data.sopsPending} />
      case 'quiz_team':    return <QuizTeamCard stats={data.teamQuizStats} />
      case 'team_chase':   return <ChaseCard members={data.membersToChase} />
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
            Welcome back, {profile.full_name?.split(' ')[0] ?? 'there'} 👋
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

      {/* Edit-mode toolbar */}
      {editing && availableCards.length > 0 && (
        <div className="bg-navy-50 border border-navy-100 rounded-2xl p-4 mb-5">
          <p className="text-xs text-navy-600 font-medium mb-3">
            Drag <GripVertical className="w-3.5 h-3.5 inline -mt-0.5" /> to reorder · drag a card&apos;s right edge to resize · toggle cards below
          </p>
          <div className="flex flex-wrap gap-2">
            {availableCards.map(card => {
              const visible = !hidden.has(card.key)
              return (
                <button key={card.key} onClick={() => toggleCard(card.key)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${visible ? 'border-teal-300 bg-teal-50 text-teal-800' : 'border-gray-200 bg-white text-gray-400'}`}>
                  <card.icon className="w-3.5 h-3.5" />
                  {card.label}
                  {visible && <CheckCircle2 className="w-3 h-3 text-teal-500" />}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Super admin: original rich dashboard first */}
      {role === 'super_admin' && adminChildren && <div className="mb-6">{adminChildren}</div>}

      {/* Cards grid */}
      <div ref={gridRef} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start [grid-auto-flow:row_dense]">
        {visibleOrdered.map(key => (
          <div
            key={key}
            style={{ gridColumn: `span ${spans[key] ?? 6}`, ['--card-h' as string]: `${heights[key] ?? DEFAULT_HEIGHT}px` } as React.CSSProperties}
            className={`relative ${editing ? 'ring-2 ring-navy-100 rounded-2xl' : ''}`}
            onDragEnter={editing ? handleDragEnter(key) : undefined}
            onDragOver={editing ? (e) => e.preventDefault() : undefined}
          >
            {/* Card content (non-interactive while editing so clicks don't navigate) */}
            <div className={editing ? 'pointer-events-none select-none' : ''}>
              {renderCard(key)}
            </div>

            {/* Edit handles */}
            {editing && (
              <>
                {/* Drag-to-reorder grip */}
                <div
                  draggable
                  onDragStart={handleDragStart(key)}
                  onDragEnd={handleDragEnd}
                  title="Drag to move"
                  className="absolute top-2 left-1/2 -translate-x-1/2 z-20 px-2 py-0.5 rounded-md bg-navy-700/90 text-white cursor-grab active:cursor-grabbing flex items-center gap-1 shadow">
                  <GripVertical className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-semibold">move</span>
                </div>
                {/* Hide */}
                <button
                  onClick={() => toggleCard(key)}
                  title="Hide this card"
                  className="absolute top-2 right-2 z-20 p-1 rounded-md bg-white border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 shadow-sm">
                  <EyeOff className="w-3.5 h-3.5" />
                </button>
                {/* Resize handle — right edge (width) */}
                <div
                  onPointerDown={startResize(key, { x: true, y: false })}
                  onPointerMove={onResizeMove}
                  onPointerUp={endResize}
                  title="Drag to resize width"
                  className="absolute top-0 right-0 h-full w-3 z-20 cursor-ew-resize flex items-center justify-center group">
                  <div className="h-12 w-1.5 rounded-full bg-navy-300 group-hover:bg-navy-500 transition-colors" />
                </div>
                {/* Resize handle — bottom edge (height) */}
                <div
                  onPointerDown={startResize(key, { x: false, y: true })}
                  onPointerMove={onResizeMove}
                  onPointerUp={endResize}
                  title="Drag to resize height"
                  className="absolute bottom-0 left-0 w-full h-3 z-20 cursor-ns-resize flex items-center justify-center group">
                  <div className="w-12 h-1.5 rounded-full bg-navy-300 group-hover:bg-navy-500 transition-colors" />
                </div>
                {/* Resize handle — corner (both) */}
                <div
                  onPointerDown={startResize(key, { x: true, y: true })}
                  onPointerMove={onResizeMove}
                  onPointerUp={endResize}
                  title="Drag to resize both"
                  className="absolute bottom-0 right-0 w-5 h-5 z-30 cursor-nwse-resize flex items-end justify-end p-1 group">
                  <div className="w-2.5 h-2.5 border-r-2 border-b-2 border-navy-300 group-hover:border-navy-500 transition-colors" />
                </div>
                {/* Size badge */}
                <span className="absolute bottom-2 left-3 z-20 text-[10px] font-bold text-navy-400 bg-white/80 px-1.5 rounded">
                  {Math.round(((spans[key] ?? 6) / 12) * 100)}% w · {heights[key] ?? DEFAULT_HEIGHT}px h
                </span>
              </>
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
  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm h-full flex flex-col">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`p-1.5 rounded-lg flex-shrink-0 ${colors[color]}`}><Icon className="w-4 h-4" /></div>
          <h2 className="font-bold text-navy-700 text-sm truncate">{title}</h2>
          {count !== undefined && <span className="text-xs text-gray-400 font-medium flex-shrink-0">({count})</span>}
        </div>
        {headerRight ?? (href && <Link href={href} className="text-xs text-teal-600 hover:underline font-medium flex-shrink-0">View all</Link>)}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  )
}

// ─── My Tasks (tabbed: All / Daily / Weekly / Tasks) ───────────────────────────

type TodoRow = {
  id: string; title: string; due_date: string | null; priority: string
  is_done: boolean; is_carry: boolean; status: string
  recurrence: string; recurrence_parent_id: string | null
}
type TaskView = 'all' | 'daily' | 'weekly' | 'tasks'
const TASK_TABS: { key: TaskView; label: string }[] = [
  { key: 'all',    label: 'All' },
  { key: 'daily',  label: '🌅 Daily' },
  { key: 'weekly', label: '📅 Weekly' },
  { key: 'tasks',  label: '✅ Tasks' },
]

function TasksCard({ tasks }: { tasks: Record<string, unknown>[] }) {
  const [view, setView] = useState<TaskView>('all')
  const rows = tasks as TodoRow[]
  const today = new Date().toISOString().slice(0, 10)

  const daily   = rows.filter(t => t.recurrence === 'daily'  && !t.recurrence_parent_id)
  const weekly  = rows.filter(t => t.recurrence === 'weekly' && !t.recurrence_parent_id)
  const oneOff  = rows.filter(t => (t.recurrence ?? 'none') === 'none')

  const overdue  = oneOff.filter(t => t.due_date && t.due_date < today)
  const dueToday = oneOff.filter(t => t.due_date === today)
  const upcoming = oneOff.filter(t => !t.due_date || t.due_date > today)

  const counts: Record<TaskView, number> = { all: rows.length, daily: daily.length, weekly: weekly.length, tasks: oneOff.length }

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

  const empty = rows.length === 0

  return (
    <CardShell title="My Tasks" icon={ListChecks} color={overdue.length > 0 ? 'red' : 'teal'} headerRight={tabs}>
      {empty ? (
        <p className="text-sm text-gray-400 italic px-5 py-6">
          No open tasks. <Link href="/notes" className="text-teal-600 hover:underline pointer-events-auto">Go to Notes &amp; To-dos →</Link>
        </p>
      ) : (
        <div className="max-h-[var(--card-h,420px)] overflow-y-auto">
          {/* All view: grouped one-offs by urgency + recurring sections */}
          {view === 'all' && (
            <>
              {overdue.length > 0 && <TaskGroup label={`⚠️ Overdue (${overdue.length})`} tone="red" items={overdue} />}
              {dueToday.length > 0 && <TaskGroup label={`📅 Due today (${dueToday.length})`} tone="amber" items={dueToday} />}
              {upcoming.length > 0 && <TaskGroup label={`Upcoming (${upcoming.length})`} items={upcoming} />}
              {daily.length > 0 && <TaskGroup label="🌅 Daily routines" items={daily} />}
              {weekly.length > 0 && <TaskGroup label="📅 Weekly routines" items={weekly} />}
            </>
          )}
          {view === 'daily'  && (daily.length  ? <TaskGroup items={daily}  /> : <Empty msg="No daily routines." />)}
          {view === 'weekly' && (weekly.length ? <TaskGroup items={weekly} /> : <Empty msg="No weekly routines." />)}
          {view === 'tasks'  && (oneOff.length ? (
            <>
              {overdue.length > 0 && <TaskGroup label={`⚠️ Overdue (${overdue.length})`} tone="red" items={overdue} />}
              {dueToday.length > 0 && <TaskGroup label={`📅 Due today (${dueToday.length})`} tone="amber" items={dueToday} />}
              {upcoming.length > 0 && <TaskGroup label={`Upcoming (${upcoming.length})`} items={upcoming} />}
            </>
          ) : <Empty msg="No one-off tasks." />)}
        </div>
      )}
    </CardShell>
  )
}

function Empty({ msg }: { msg: string }) {
  return <p className="text-sm text-gray-400 italic px-5 py-6">{msg}</p>
}

function TaskGroup({ label, tone, items }: { label?: string; tone?: 'red' | 'amber'; items: TodoRow[] }) {
  const toneClass = tone === 'red' ? 'text-red-600' : tone === 'amber' ? 'text-amber-600' : 'text-gray-400'
  return (
    <div className="px-5 py-1.5 border-b border-gray-50 last:border-0">
      {label && <p className={`text-[11px] font-semibold mt-1 mb-0.5 ${toneClass}`}>{label}</p>}
      {items.map(t => (
        <Link key={t.id} href="/notes" className="flex items-center gap-2.5 py-1.5 hover:bg-gray-50 -mx-5 px-5 group pointer-events-auto">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${t.priority === 'high' ? 'bg-red-400' : t.priority === 'medium' ? 'bg-amber-400' : 'bg-gray-300'}`} />
          <span className="text-sm text-navy-700 flex-1 truncate group-hover:text-teal-600">{t.title}</span>
          {t.is_carry && <span className="text-[10px] bg-red-100 text-red-600 font-bold px-1.5 py-0.5 rounded flex-shrink-0">DUE</span>}
          {t.due_date && (t.recurrence ?? 'none') === 'none' && (
            <span className="text-[10px] text-gray-400 flex-shrink-0">{t.due_date.slice(5)}</span>
          )}
        </Link>
      ))}
    </div>
  )
}

// ─── SOPs to approve ───────────────────────────────────────────────────────────

type SopRow = { id: string; title: string; updated_at: string; profiles?: { full_name: string | null } | null; categories?: { name: string } | null }

function SopsApproveCard({ sops }: { sops: Record<string, unknown>[] }) {
  const rows = sops as SopRow[]
  return (
    <CardShell title="SOPs to Approve" icon={Clock} count={rows.length} color="amber">
      {rows.length === 0 ? <Empty msg="✅ Nothing waiting for approval." /> : (
        <div className="divide-y divide-gray-50 max-h-[var(--card-h,420px)] overflow-y-auto">
          {rows.map(s => (
            <Link key={s.id} href={`/sops/${s.id}/approve`} className="flex items-center justify-between px-5 py-3 hover:bg-amber-50 group pointer-events-auto">
              <div className="min-w-0 flex-1 mr-3">
                <p className="text-sm font-semibold text-navy-700 truncate group-hover:text-amber-700">{s.title}</p>
                <p className="text-xs text-gray-400 mt-0.5 truncate">By {s.profiles?.full_name ?? 'Unknown'} · {s.categories?.name ?? 'Uncategorised'}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-amber-500 flex-shrink-0" />
            </Link>
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
        <div className="px-5 py-3 space-y-3 max-h-[var(--card-h,420px)] overflow-y-auto">
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

function ChaseCard({ members }: { members: MemberChase[] }) {
  return (
    <CardShell title="Chase Up" icon={AlertTriangle} count={members.length || undefined} color="amber">
      {members.length === 0 ? <Empty msg="✅ No overdue quizzes for your team!" /> : (
        <div className="divide-y divide-gray-50 max-h-[var(--card-h,420px)] overflow-y-auto">
          {members.map(m => (
            <div key={m.id} className="flex items-start gap-3 px-5 py-3">
              <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <span className="text-amber-700 text-xs font-bold">{(m.name[0] ?? '?').toUpperCase()}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-navy-700 truncate">{m.name}</p>
                <p className="text-xs text-gray-400 truncate">{m.quizTitle}</p>
                <p className="text-xs text-red-500 font-medium">Due: {m.dueDate}</p>
              </div>
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
        <div className="divide-y divide-gray-50 max-h-[var(--card-h,420px)] overflow-y-auto">
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
        <div className="divide-y divide-gray-50 max-h-[var(--card-h,420px)] overflow-y-auto">
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
        <div className="divide-y divide-gray-50 max-h-[var(--card-h,420px)] overflow-y-auto">
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
        <div className="divide-y divide-gray-50 max-h-[var(--card-h,420px)] overflow-y-auto">
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
