'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Search, X, FileText, FilePlus2, FilePen, Globe, Send, CheckCircle2, XCircle,
  MessageSquareWarning, CheckSquare, Trash2, NotebookPen, GraduationCap,
  UserPlus, Award, Briefcase, Layers, FolderPlus, Activity, RefreshCw, UserCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types (shared with the server page) ──────────────────────────────────────

export type ActivityType =
  | 'sop_created' | 'sop_updated' | 'sop_published' | 'sop_submitted'
  | 'sop_approved' | 'sop_rejected' | 'sop_changes_requested'
  | 'todo_created' | 'todo_completed' | 'todo_deleted'
  | 'todo_updated' | 'todo_status_changed' | 'todo_assigned'
  | 'note_created' | 'note_updated' | 'note_deleted'
  | 'quiz_created' | 'quiz_enrolled' | 'quiz_passed' | 'quiz_failed'
  | 'company_created' | 'platform_created' | 'category_created'

export type ActivityCategory = 'SOPs' | 'Tasks' | 'Notes' | 'Quizzes' | 'Admin'

export interface ActivityEvent {
  id: string
  type: ActivityType
  category: ActivityCategory
  title: string
  actorName: string | null
  date: string          // ISO timestamp
  href?: string
}

// ── Per-type display config ───────────────────────────────────────────────────

const TYPE_CONFIG: Record<ActivityType, {
  icon: React.ComponentType<{ className?: string }>
  verb: string
  colour: string        // text colour for the icon
  bg: string            // chip background
}> = {
  sop_created:           { icon: FilePlus2,          verb: 'created SOP',                colour: 'text-teal-600',   bg: 'bg-teal-50' },
  sop_updated:           { icon: FilePen,            verb: 'modified SOP',               colour: 'text-amber-600',  bg: 'bg-amber-50' },
  sop_published:         { icon: Globe,              verb: 'published SOP',              colour: 'text-green-600',  bg: 'bg-green-50' },
  sop_submitted:         { icon: Send,               verb: 'submitted SOP',              colour: 'text-blue-600',   bg: 'bg-blue-50' },
  sop_approved:          { icon: CheckCircle2,       verb: 'approved SOP',               colour: 'text-green-600',  bg: 'bg-green-50' },
  sop_rejected:          { icon: XCircle,            verb: 'rejected SOP',               colour: 'text-red-600',    bg: 'bg-red-50' },
  sop_changes_requested: { icon: MessageSquareWarning, verb: 'requested changes on SOP', colour: 'text-orange-600', bg: 'bg-orange-50' },
  todo_created:          { icon: CheckSquare,        verb: 'created task',               colour: 'text-teal-600',   bg: 'bg-teal-50' },
  todo_completed:        { icon: CheckCircle2,       verb: 'completed task',             colour: 'text-green-600',  bg: 'bg-green-50' },
  todo_deleted:          { icon: Trash2,             verb: 'deleted task',               colour: 'text-red-600',    bg: 'bg-red-50' },
  note_created:          { icon: NotebookPen,        verb: 'created note',               colour: 'text-teal-600',   bg: 'bg-teal-50' },
  note_updated:          { icon: FilePen,            verb: 'modified note',              colour: 'text-amber-600',  bg: 'bg-amber-50' },
  note_deleted:          { icon: Trash2,             verb: 'deleted note',               colour: 'text-red-600',    bg: 'bg-red-50' },
  quiz_created:          { icon: GraduationCap,      verb: 'created quiz',               colour: 'text-purple-600', bg: 'bg-purple-50' },
  quiz_enrolled:         { icon: UserPlus,           verb: 'enrolled in quiz',           colour: 'text-blue-600',   bg: 'bg-blue-50' },
  quiz_passed:           { icon: Award,              verb: 'passed quiz',                colour: 'text-green-600',  bg: 'bg-green-50' },
  quiz_failed:           { icon: XCircle,            verb: 'failed quiz',                colour: 'text-red-600',    bg: 'bg-red-50' },
  todo_updated:          { icon: FilePen,            verb: 'updated task',               colour: 'text-amber-600',  bg: 'bg-amber-50' },
  todo_status_changed:   { icon: RefreshCw,          verb: 'changed status on task',     colour: 'text-blue-600',   bg: 'bg-blue-50' },
  todo_assigned:         { icon: UserCheck,          verb: 'assigned task',              colour: 'text-teal-600',   bg: 'bg-teal-50' },
  company_created:       { icon: Briefcase,          verb: 'added company',              colour: 'text-navy-600',   bg: 'bg-gray-100' },
  platform_created:      { icon: Layers,             verb: 'added platform',             colour: 'text-navy-600',   bg: 'bg-gray-100' },
  category_created:      { icon: FolderPlus,         verb: 'added category',             colour: 'text-navy-600',   bg: 'bg-gray-100' },
}

const CATEGORIES: ActivityCategory[] = ['SOPs', 'Tasks', 'Notes', 'Quizzes', 'Admin']

// ── Date filter (same behaviour as the company dashboard) ─────────────────────

type DateRange = 'all' | 'today' | 'week' | 'month' | 'quarter'
const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: '7 days' },
  { value: 'month', label: '30 days' },
  { value: 'quarter', label: '90 days' },
]
const DATE_RANGE_MS: Record<Exclude<DateRange, 'all'>, number> = {
  today: 24 * 3600 * 1000,
  week: 7 * 24 * 3600 * 1000,
  month: 30 * 24 * 3600 * 1000,
  quarter: 90 * 24 * 3600 * 1000,
}

function isInDateFilter(dateStr: string, range: DateRange, fromDate: string, toDate: string): boolean {
  const d = new Date(dateStr).getTime()
  if (fromDate || toDate) {
    const from = fromDate ? new Date(fromDate).getTime() : 0
    const to = toDate ? new Date(toDate + 'T23:59:59').getTime() : Infinity
    return d >= from && d <= to
  }
  if (range === 'all') return true
  return Date.now() - d <= DATE_RANGE_MS[range]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatWhen(iso: string): string {
  const d = new Date(iso)
  const now = Date.now()
  const diff = now - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ActivityLog({ events, truncated }: { events: ActivityEvent[]; truncated: boolean }) {
  const [query, setQuery] = useState('')
  const [cats, setCats] = useState<Set<ActivityCategory>>(new Set())
  const [range, setRange] = useState<DateRange>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const hasCustom = !!fromDate || !!toDate

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return events.filter(e => {
      if (cats.size > 0 && !cats.has(e.category)) return false
      if (!isInDateFilter(e.date, range, fromDate, toDate)) return false
      if (q) {
        const hay = `${e.title} ${e.actorName ?? ''} ${TYPE_CONFIG[e.type].verb}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [events, query, cats, range, fromDate, toDate])

  // Group filtered events by calendar day for readable scanning
  const grouped = useMemo(() => {
    const map = new Map<string, ActivityEvent[]>()
    for (const e of filtered) {
      const k = dayKey(e.date)
      const list = map.get(k) ?? []
      list.push(e)
      map.set(k, list)
    }
    return [...map.entries()]
  }, [filtered])

  function toggleCat(c: ActivityCategory) {
    setCats(prev => {
      const next = new Set(prev)
      if (next.has(c)) next.delete(c)
      else next.add(c)
      return next
    })
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center shadow-sm">
          <Activity className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-navy-700">Activity Log &amp; History</h1>
          <p className="text-sm text-gray-500">Everything that happened across the app — SOPs, tasks, notes, quizzes and admin changes.</p>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by title, person or action…"
            className="w-full pl-9 pr-8 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-400 transition-colors"
          />
          {query && (
            <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Category chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mr-0.5">Type</span>
          <Chip active={cats.size === 0} onClick={() => setCats(new Set())}>All</Chip>
          {CATEGORIES.map(c => (
            <Chip key={c} active={cats.has(c)} onClick={() => toggleCat(c)}>{c}</Chip>
          ))}
        </div>

        {/* Date range */}
        <div className="space-y-2 pt-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mr-0.5">Period</span>
            {DATE_RANGE_OPTIONS.map(o => (
              <Chip key={o.value} active={!hasCustom && range === o.value}
                onClick={() => { setFromDate(''); setToDate(''); setRange(o.value) }}>
                {o.label}
              </Chip>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">From</span>
              <input type="date" value={fromDate}
                onChange={e => { setFromDate(e.target.value); setRange('all') }}
                className="flex-1 min-w-0 text-xs border border-gray-200 rounded-lg px-2 py-1 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-gray-600 transition-colors" />
            </div>
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">To</span>
              <input type="date" value={toDate}
                onChange={e => { setToDate(e.target.value); setRange('all') }}
                className="flex-1 min-w-0 text-xs border border-gray-200 rounded-lg px-2 py-1 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-gray-600 transition-colors" />
            </div>
            {hasCustom && (
              <button onClick={() => { setFromDate(''); setToDate(''); setRange('all') }} title="Clear dates"
                className="flex-shrink-0 p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Result count */}
      <div className="flex items-center justify-between px-1">
        <p className="text-xs text-gray-400">
          {filtered.length} event{filtered.length === 1 ? '' : 's'}
          {filtered.length !== events.length && ` of ${events.length}`}
        </p>
        {truncated && (
          <p className="text-xs text-amber-600">Showing the most recent {events.length} events.</p>
        )}
      </div>

      {/* Feed */}
      {grouped.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center text-gray-400 text-sm">
          No activity matches your filters.
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([day, items]) => (
            <div key={day}>
              <div className="flex items-center gap-2 px-1 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">{day}</span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>
              <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-50 overflow-hidden">
                {items.map(e => <Row key={e.id} event={e} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Row({ event }: { event: ActivityEvent }) {
  const cfg = TYPE_CONFIG[event.type]
  const Icon = cfg.icon
  const inner = (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/60 transition-colors">
      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', cfg.bg)}>
        <Icon className={cn('w-4 h-4', cfg.colour)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-gray-700 truncate">
          <span className="font-semibold text-navy-700">{event.actorName ?? 'Someone'}</span>
          {' '}{cfg.verb}{' '}
          <span className="font-medium text-gray-900">{event.title}</span>
        </p>
      </div>
      <time className="text-xs text-gray-400 flex-shrink-0 whitespace-nowrap" dateTime={event.date}
        title={new Date(event.date).toLocaleString()}>
        {formatWhen(event.date)}
      </time>
    </div>
  )
  return event.href ? <Link href={event.href} className="block">{inner}</Link> : inner
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors',
        active
          ? 'bg-navy-700 text-white border-navy-700'
          : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
      )}
    >
      {children}
    </button>
  )
}
