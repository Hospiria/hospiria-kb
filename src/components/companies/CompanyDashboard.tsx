'use client'

import Link from 'next/link'
import { useState, useRef, useCallback } from 'react'
import {
  BookOpen, StickyNote, CheckSquare, Building2,
  Clock, Tag, ChevronRight, Pin, AlertCircle,
  Plus, Search, X, Sparkles, Loader2,
  Circle, CheckCircle2, ChevronDown, ChevronUp,
  FileText, ListTodo, RotateCcw,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Company { id: string; name: string; description: string | null }

export interface SopItem {
  id: string; title: string; status: string; category_id: string | null
  categories: { id: string; name: string } | null
  created_at: string
}

export interface NoteItem {
  id: string; title: string; updated_at: string; created_at: string
  team_id: string | null; pinned: boolean
  teams?: { name: string } | null
}

export interface TodoItem {
  id: string; title: string; is_done: boolean; priority: string
  due_date: string | null; team_id: string | null; mine: boolean
  teamName: string | null; status: string; created_at: string; updated_at: string
  assignees: { id: string; full_name: string | null }[]
}

type PanelSection = 'sops' | 'notes' | 'tasks'

// ── Helpers ───────────────────────────────────────────────────────────────────

const SOP_STATUS_COLOUR: Record<string, string> = {
  live: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  draft: 'bg-gray-100 text-gray-500 border-gray-200',
  submitted: 'bg-amber-100 text-amber-700 border-amber-200',
  changes_requested: 'bg-orange-100 text-orange-700 border-orange-200',
}

const PRIORITY_COLOUR: Record<string, string> = {
  high: 'text-red-500', medium: 'text-amber-500', low: 'text-gray-300',
}

function fmtDate(s: string) {
  const d = new Date(s)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffH = diffMs / 1000 / 3600
  if (diffH < 1) return 'just now'
  if (diffH < 24) return `${Math.floor(diffH)}h ago`
  if (diffH < 48) return 'yesterday'
  if (diffH < 24 * 7) return `${Math.floor(diffH / 24)}d ago`
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function isOverdue(due: string | null) {
  if (!due) return false
  return new Date(due) < new Date(new Date().toDateString())
}

// ── Date range filter ─────────────────────────────────────────────────────────

type DateRange = 'all' | 'today' | 'week' | 'month' | 'quarter'

const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: 'all',     label: 'All time'   },
  { value: 'today',   label: 'Today'      },
  { value: 'week',    label: 'This week'  },
  { value: 'month',   label: 'This month' },
  { value: 'quarter', label: 'Last 3 months' },
]

const DATE_RANGE_MS: Record<Exclude<DateRange, 'all'>, number> = {
  today:   24 * 3600 * 1000,
  week:     7 * 24 * 3600 * 1000,
  month:   30 * 24 * 3600 * 1000,
  quarter: 90 * 24 * 3600 * 1000,
}

function isInRange(dateStr: string, range: DateRange): boolean {
  if (range === 'all') return true
  return Date.now() - new Date(dateStr).getTime() <= DATE_RANGE_MS[range]
}

// ── Search bar ────────────────────────────────────────────────────────────────

function SearchInput({ value, onChange, placeholder = 'Search…' }: {
  value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-8 pr-7 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-400 transition-colors"
      />
      {value && (
        <button onClick={() => onChange('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}

function FilterChip({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode
}) {
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

function SectionDivider({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 px-1 mb-2 mt-4 first:mt-0">
      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</span>
      <span className="text-[10px] text-gray-400">({count})</span>
      <div className="flex-1 h-px bg-gray-100" />
    </div>
  )
}

// ── SOPs panel ────────────────────────────────────────────────────────────────

function SopsPanel({ sops }: { sops: SopItem[] }) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'live' | 'draft' | 'submitted'>('all')

  const filtered = sops.filter(s => {
    const q = query.toLowerCase()
    const matchSearch = !q || s.title.toLowerCase().includes(q) || (s.categories?.name ?? '').toLowerCase().includes(q)
    const matchStatus = statusFilter === 'all' || s.status === statusFilter
    return matchSearch && matchStatus
  })

  // Group by category
  const groups = new Map<string, SopItem[]>()
  for (const sop of filtered) {
    const cat = sop.categories?.name ?? 'Uncategorised'
    const list = groups.get(cat) ?? []; list.push(sop); groups.set(cat, list)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="p-4 border-b border-gray-100 space-y-3 flex-shrink-0">
        <SearchInput value={query} onChange={setQuery} placeholder="Search SOPs…" />
        <div className="flex items-center gap-1.5 flex-wrap">
          {(['all', 'live', 'draft', 'submitted'] as const).map(s => (
            <FilterChip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </FilterChip>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-gray-400">
            <BookOpen className="w-8 h-8 text-gray-200" />
            <p className="text-sm">{query || statusFilter !== 'all' ? 'No SOPs match your filters' : 'No SOPs linked yet'}</p>
          </div>
        ) : (
          Array.from(groups.entries()).map(([cat, items]) => (
            <div key={cat} className="mb-4">
              <SectionDivider label={cat} count={items.length} />
              <div className="space-y-1.5">
                {items.map(sop => (
                  <Link
                    key={sop.id}
                    href={`/sops/${sop.id}`}
                    className="flex items-center justify-between gap-3 bg-white border border-gray-100 rounded-xl px-3 py-2.5 hover:border-teal-200 hover:bg-teal-50/30 transition-colors group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <BookOpen className="w-3.5 h-3.5 text-gray-300 flex-shrink-0 group-hover:text-teal-500 transition-colors" />
                      <span className="text-sm text-gray-700 truncate">{sop.title}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full border font-medium', SOP_STATUS_COLOUR[sop.status] ?? 'bg-gray-100 text-gray-400 border-gray-200')}>
                        {sop.status}
                      </span>
                      <span className="text-[10px] text-gray-400">{fmtDate(sop.created_at)}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-teal-500" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ── Notes panel ───────────────────────────────────────────────────────────────

function NotesPanel({ teamNotes, myNotes }: { teamNotes: NoteItem[]; myNotes: NoteItem[] }) {
  const [query, setQuery] = useState('')
  const [scopeFilter, setScopeFilter] = useState<'all' | 'team' | 'personal'>('all')
  const [sortBy, setSortBy] = useState<'recent' | 'pinned'>('recent')
  const [dateRange, setDateRange] = useState<DateRange>('all')

  const allNotes = scopeFilter === 'team'
    ? teamNotes
    : scopeFilter === 'personal'
    ? myNotes
    : [...teamNotes, ...myNotes]

  const filtered = allNotes
    .filter(n =>
      (!query || (n.title || '').toLowerCase().includes(query.toLowerCase())) &&
      isInRange(n.updated_at, dateRange)
    )
    .sort((a, b) => {
      if (sortBy === 'pinned') {
        if (a.pinned !== b.pinned) return b.pinned ? 1 : -1
      }
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    })

  const filteredTeam = filtered.filter(n => n.team_id !== null)
  const filteredPersonal = filtered.filter(n => n.team_id === null)
  const hasFilters = !!query || scopeFilter !== 'all' || dateRange !== 'all'

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="p-4 border-b border-gray-100 space-y-3 flex-shrink-0">
        <SearchInput value={query} onChange={setQuery} placeholder="Search notes…" />
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {(['all', 'team', 'personal'] as const).map(s => (
              <FilterChip key={s} active={scopeFilter === s} onClick={() => setScopeFilter(s)}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </FilterChip>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <FilterChip active={sortBy === 'recent'} onClick={() => setSortBy('recent')}>Recent</FilterChip>
            <FilterChip active={sortBy === 'pinned'} onClick={() => setSortBy('pinned')}>Pinned first</FilterChip>
          </div>
        </div>
        {/* Date range */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mr-0.5">Period</span>
          {DATE_RANGE_OPTIONS.map(o => (
            <FilterChip key={o.value} active={dateRange === o.value} onClick={() => setDateRange(o.value)}>
              {o.label}
            </FilterChip>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-gray-400">
            <StickyNote className="w-8 h-8 text-gray-200" />
            <p className="text-sm">{hasFilters ? 'No notes match your filters' : 'No notes linked yet'}</p>
            <Link href="/notes" className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700">
              <Plus className="w-3 h-3" /> Create a note
            </Link>
          </div>
        ) : (
          <>
            {(scopeFilter === 'all' || scopeFilter === 'team') && filteredTeam.length > 0 && (
              <div className="mb-4">
                <SectionDivider label="Team Notes" count={filteredTeam.length} />
                <div className="space-y-1.5">
                  {filteredTeam.map(n => <NoteRow key={n.id} note={n} />)}
                </div>
              </div>
            )}
            {(scopeFilter === 'all' || scopeFilter === 'personal') && filteredPersonal.length > 0 && (
              <div className="mb-4">
                <SectionDivider label="Personal Notes" count={filteredPersonal.length} />
                <div className="space-y-1.5">
                  {filteredPersonal.map(n => <NoteRow key={n.id} note={n} />)}
                </div>
              </div>
            )}
            {/* If scope-filtered, show flat list */}
            {scopeFilter !== 'all' && filtered.length > 0 && filteredTeam.length === 0 && filteredPersonal.length === 0 && (
              <div className="space-y-1.5">
                {filtered.map(n => <NoteRow key={n.id} note={n} />)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function NoteRow({ note }: { note: NoteItem }) {
  return (
    <Link
      href="/notes"
      className="flex items-start justify-between gap-3 bg-white border border-gray-100 rounded-xl px-3 py-2.5 hover:border-teal-200 hover:bg-teal-50/30 transition-colors group"
    >
      <div className="flex items-start gap-2.5 min-w-0">
        {note.pinned
          ? <Pin className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
          : <StickyNote className="w-3.5 h-3.5 text-gray-300 flex-shrink-0 mt-0.5 group-hover:text-teal-500 transition-colors" />
        }
        <div className="min-w-0">
          <p className="text-sm text-gray-700 truncate">{note.title || 'Untitled'}</p>
          {note.teams?.name && (
            <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
              <Tag className="w-2.5 h-2.5" /> {note.teams.name}
            </p>
          )}
        </div>
      </div>
      <span className="text-[10px] text-gray-400 flex-shrink-0 mt-0.5 flex items-center gap-1">
        <Clock className="w-2.5 h-2.5" />{fmtDate(note.updated_at)}
      </span>
    </Link>
  )
}

// ── Tasks panel ───────────────────────────────────────────────────────────────

function TasksPanel({ teamTodos, myTodos }: { teamTodos: TodoItem[]; myTodos: TodoItem[] }) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'open' | 'done' | 'all'>('all')
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all')
  const [scopeFilter, setScopeFilter] = useState<'all' | 'team' | 'personal'>('all')
  const [dateRange, setDateRange] = useState<DateRange>('all')
  const [showDoneHistory, setShowDoneHistory] = useState(true)

  const allTodos = scopeFilter === 'team'
    ? teamTodos
    : scopeFilter === 'personal'
    ? myTodos
    : [...teamTodos, ...myTodos]

  const filtered = allTodos.filter(t => {
    const q = query.toLowerCase()
    const matchSearch = !q || t.title.toLowerCase().includes(q) ||
      (t.teamName ?? '').toLowerCase().includes(q) ||
      t.assignees.some(a => (a.full_name ?? '').toLowerCase().includes(q))
    const matchStatus = statusFilter === 'all' || (statusFilter === 'open' ? !t.is_done : t.is_done)
    const matchPriority = priorityFilter === 'all' || t.priority === priorityFilter
    // For open tasks: filter by created_at (when was it added)
    // For done tasks: filter by updated_at (when was it completed)
    const dateField = t.is_done ? t.updated_at : t.created_at
    const matchDate = isInRange(dateField, dateRange)
    return matchSearch && matchStatus && matchPriority && matchDate
  })

  const hasFilters = !!query || statusFilter !== 'all' || priorityFilter !== 'all' || dateRange !== 'all'

  const openTodos = filtered.filter(t => !t.is_done)
    .sort((a, b) => {
      // Overdue first, then by priority, then by due date
      const aOver = isOverdue(a.due_date) ? 0 : 1
      const bOver = isOverdue(b.due_date) ? 0 : 1
      if (aOver !== bOver) return aOver - bOver
      const pOrder = { high: 0, medium: 1, low: 2 }
      return (pOrder[a.priority as keyof typeof pOrder] ?? 3) - (pOrder[b.priority as keyof typeof pOrder] ?? 3)
    })
  const doneTodos = filtered.filter(t => t.is_done)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="p-4 border-b border-gray-100 space-y-3 flex-shrink-0">
        <SearchInput value={query} onChange={setQuery} placeholder="Search tasks, assignees…" />
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mr-0.5">Status</span>
          {(['all', 'open', 'done'] as const).map(s => (
            <FilterChip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </FilterChip>
          ))}
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide ml-2 mr-0.5">Priority</span>
          {(['all', 'high', 'medium', 'low'] as const).map(p => (
            <FilterChip key={p} active={priorityFilter === p} onClick={() => setPriorityFilter(p)}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </FilterChip>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mr-0.5">Scope</span>
          {(['all', 'team', 'personal'] as const).map(s => (
            <FilterChip key={s} active={scopeFilter === s} onClick={() => setScopeFilter(s)}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </FilterChip>
          ))}
        </div>
        {/* Date range */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mr-0.5">Period</span>
          {DATE_RANGE_OPTIONS.map(o => (
            <FilterChip key={o.value} active={dateRange === o.value} onClick={() => setDateRange(o.value)}>
              {o.label}
            </FilterChip>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-gray-400">
            <CheckSquare className="w-8 h-8 text-gray-200" />
            <p className="text-sm">{hasFilters ? 'No tasks match your filters' : 'No tasks linked yet'}</p>
            <Link href="/todos" className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700">
              <Plus className="w-3 h-3" /> Create a task
            </Link>
          </div>
        ) : (
          <>
            {/* Open / All tasks */}
            {(statusFilter !== 'done') && openTodos.length > 0 && (
              <div className="mb-4">
                <SectionDivider label="Open" count={openTodos.length} />
                <div className="space-y-1.5">
                  {openTodos.map(t => <TaskRow key={t.id} todo={t} />)}
                </div>
              </div>
            )}

            {/* Done / History */}
            {(statusFilter !== 'open') && doneTodos.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-2 px-1 mb-2 mt-4">
                  <button
                    onClick={() => setShowDoneHistory(v => !v)}
                    className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showDoneHistory ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
                    History — Completed ({doneTodos.length})
                  </button>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>
                {showDoneHistory && (
                  <div className="space-y-1.5">
                    {doneTodos.map(t => <TaskRow key={t.id} todo={t} />)}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function TaskRow({ todo }: { todo: TodoItem }) {
  const overdue = !todo.is_done && isOverdue(todo.due_date)
  return (
    <div className="flex items-center gap-2.5 bg-white border border-gray-100 rounded-xl px-3 py-2.5">
      <div className="flex-shrink-0">
        {todo.is_done
          ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          : overdue
          ? <AlertCircle className="w-4 h-4 text-red-400" />
          : <Circle className="w-4 h-4 text-gray-300" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm truncate', todo.is_done ? 'line-through text-gray-400' : 'text-gray-700')}>
          {todo.title}
        </p>
        {todo.teamName && (
          <p className="text-[10px] text-gray-400 flex items-center gap-1">
            <Tag className="w-2.5 h-2.5" />{todo.teamName}
          </p>
        )}
      </div>
      {/* Priority dot */}
      <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0',
        todo.priority === 'high' ? 'bg-red-400' : todo.priority === 'medium' ? 'bg-amber-400' : 'bg-gray-200'
      )} title={`Priority: ${todo.priority}`} />
      {/* Due / completed date */}
      {todo.is_done ? (
        <span className="text-[10px] text-gray-400 flex-shrink-0">done {fmtDate(todo.updated_at)}</span>
      ) : todo.due_date ? (
        <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full border flex-shrink-0',
          overdue ? 'bg-red-50 text-red-600 border-red-200' : 'bg-gray-50 text-gray-500 border-gray-200'
        )}>
          {new Date(todo.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
        </span>
      ) : null}
      {/* Assignee avatars */}
      {todo.assignees.length > 0 && (
        <div className="flex -space-x-1 flex-shrink-0">
          {todo.assignees.slice(0, 2).map(a => (
            <div key={a.id} title={a.full_name ?? undefined}
              className="w-5 h-5 rounded-full bg-teal-100 border border-white flex items-center justify-center text-[8px] font-bold text-teal-700">
              {(a.full_name ?? '?').charAt(0).toUpperCase()}
            </div>
          ))}
          {todo.assignees.length > 2 && (
            <div className="w-5 h-5 rounded-full bg-gray-100 border border-white flex items-center justify-center text-[8px] font-bold text-gray-500">
              +{todo.assignees.length - 2}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Recent Activity ───────────────────────────────────────────────────────────

interface ActivityItem {
  id: string; type: 'sop_new' | 'sop_live' | 'note' | 'task_done' | 'task_open'
  label: string; date: string; href?: string
}

function buildActivity(sops: SopItem[], teamNotes: NoteItem[], myNotes: NoteItem[], teamTodos: TodoItem[], myTodos: TodoItem[]): ActivityItem[] {
  const items: ActivityItem[] = [
    ...sops.map(s => ({
      id: `sop-${s.id}`, type: (s.status === 'live' ? 'sop_live' : 'sop_new') as ActivityItem['type'],
      label: s.title, date: s.created_at, href: `/sops/${s.id}`,
    })),
    ...[...teamNotes, ...myNotes].map(n => ({
      id: `note-${n.id}`, type: 'note' as ActivityItem['type'],
      label: n.title || 'Untitled note', date: n.updated_at,
    })),
    ...[...teamTodos, ...myTodos].filter(t => t.is_done).map(t => ({
      id: `done-${t.id}`, type: 'task_done' as ActivityItem['type'],
      label: t.title, date: t.updated_at,
    })),
    ...[...teamTodos, ...myTodos].filter(t => !t.is_done).map(t => ({
      id: `open-${t.id}`, type: 'task_open' as ActivityItem['type'],
      label: t.title, date: t.created_at,
    })),
  ]
  return items
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 15)
}

const ACTIVITY_ICON: Record<ActivityItem['type'], React.ElementType> = {
  sop_new: FileText,
  sop_live: BookOpen,
  note: StickyNote,
  task_done: CheckCircle2,
  task_open: ListTodo,
}

const ACTIVITY_COLOUR: Record<ActivityItem['type'], string> = {
  sop_new: 'text-gray-400',
  sop_live: 'text-emerald-500',
  note: 'text-amber-500',
  task_done: 'text-emerald-500',
  task_open: 'text-blue-400',
}

const ACTIVITY_LABEL: Record<ActivityItem['type'], string> = {
  sop_new: 'SOP created',
  sop_live: 'SOP published',
  note: 'Note',
  task_done: 'Task done',
  task_open: 'Task added',
}

function RecentActivity({ sops, teamNotes, myNotes, teamTodos, myTodos }: {
  sops: SopItem[]; teamNotes: NoteItem[]; myNotes: NoteItem[]
  teamTodos: TodoItem[]; myTodos: TodoItem[]
}) {
  const [expanded, setExpanded] = useState(true)
  const items = buildActivity(sops, teamNotes, myNotes, teamTodos, myTodos)

  return (
    <div>
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-2 w-full text-left mb-2"
      >
        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Recent Activity</span>
        <div className="flex-1 h-px bg-gray-100" />
        {expanded ? <ChevronUp className="w-3 h-3 text-gray-400" /> : <ChevronDown className="w-3 h-3 text-gray-400" />}
      </button>

      {expanded && (
        <div className="space-y-1">
          {items.length === 0 ? (
            <p className="text-xs text-gray-400 py-4 text-center">No activity yet</p>
          ) : items.map(item => {
            const Icon = ACTIVITY_ICON[item.type]
            const content = (
              <div key={item.id} className="flex items-start gap-2 py-1.5 px-2 rounded-lg hover:bg-gray-50 transition-colors group">
                <Icon className={cn('w-3.5 h-3.5 flex-shrink-0 mt-0.5', ACTIVITY_COLOUR[item.type])} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-600 truncate group-hover:text-gray-800">{item.label}</p>
                  <p className="text-[10px] text-gray-400">{ACTIVITY_LABEL[item.type]} · {fmtDate(item.date)}</p>
                </div>
              </div>
            )
            return item.href
              ? <Link key={item.id} href={item.href}>{content}</Link>
              : <div key={item.id}>{content}</div>
          })}
        </div>
      )}
    </div>
  )
}

// ── AI Summary ────────────────────────────────────────────────────────────────

function AISummary({ companyId }: { companyId: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [text, setText] = useState('')
  const [visible, setVisible] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const generate = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()
    setState('loading')
    setText('')
    setVisible(true)

    try {
      const res = await fetch(`/api/companies/${companyId}/summary`, {
        method: 'POST',
        signal: abortRef.current.signal,
      })
      if (!res.ok) throw new Error(await res.text())
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        setText(prev => prev + decoder.decode(value, { stream: true }))
      }
      setState('done')
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
      setState('error')
      setText('Could not generate summary. Please try again.')
    }
  }, [companyId])

  return (
    <div className="space-y-2">
      <button
        onClick={generate}
        disabled={state === 'loading'}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-semibold rounded-xl hover:from-violet-700 hover:to-indigo-700 transition-all disabled:opacity-60 shadow-sm"
      >
        {state === 'loading'
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating summary…</>
          : <><Sparkles className="w-4 h-4" /> AI Summary — this month</>
        }
      </button>

      {state === 'done' && (
        <button onClick={generate} className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600 mx-auto">
          <RotateCcw className="w-2.5 h-2.5" /> Regenerate
        </button>
      )}

      {visible && (state === 'loading' || state === 'done' || state === 'error') && (
        <div className={cn(
          'relative rounded-xl border p-4 text-xs leading-relaxed',
          state === 'error'
            ? 'border-red-200 bg-red-50 text-red-600'
            : 'border-violet-100 bg-violet-50/50 text-gray-700'
        )}>
          <button
            onClick={() => { setVisible(false); setState('idle') }}
            className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-3 h-3" />
          </button>
          {state === 'loading' && !text && (
            <div className="flex items-center gap-2 text-violet-500">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Reading this month&apos;s activity&hellip;</span>
            </div>
          )}
          {text && <p className="whitespace-pre-wrap pr-4">{text}</p>}
        </div>
      )}
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, active, onClick, colour }: {
  icon: typeof BookOpen; label: string; value: number; sub?: string
  active: boolean; onClick: () => void; colour: string
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex-1 flex flex-col gap-1 p-3 rounded-xl border transition-all text-left',
        active
          ? 'border-navy-300 bg-navy-50 shadow-sm ring-1 ring-navy-200'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
      )}
    >
      <Icon className={cn('w-4 h-4', active ? 'text-navy-600' : colour)} />
      <p className={cn('text-xl font-bold leading-none', active ? 'text-navy-700' : 'text-gray-800')}>{value}</p>
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide leading-none">{label}</p>
      {sub && <p className="text-[10px] text-gray-400">{sub}</p>}
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  company: Company
  sops: SopItem[]
  teamNotes: NoteItem[]
  myNotes: NoteItem[]
  teamTodos: TodoItem[]
  myTodos: TodoItem[]
}

export function CompanyDashboard({ company, sops, teamNotes, myNotes, teamTodos, myTodos }: Props) {
  const [activePanel, setActivePanel] = useState<PanelSection>('tasks')

  const noteCount  = teamNotes.length + myNotes.length
  const taskCount  = teamTodos.length + myTodos.length
  const openTasks  = [...teamTodos, ...myTodos].filter(t => !t.is_done).length
  const overdueTasks = [...teamTodos, ...myTodos].filter(t => !t.is_done && isOverdue(t.due_date)).length

  const PANEL_LABEL: Record<PanelSection, string> = {
    sops: 'SOPs', notes: 'Notes', tasks: 'Tasks',
  }

  return (
    <div className="flex gap-5 items-start">

      {/* ── Left: Overview sidebar ── */}
      <div className="w-72 flex-shrink-0 space-y-5 sticky top-20">

        {/* Company header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-navy-100 flex items-center justify-center flex-shrink-0">
            <Building2 className="w-5 h-5 text-navy-700" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-navy-700 truncate">{company.name}</h1>
            {company.description && (
              <p className="text-xs text-gray-500 truncate">{company.description}</p>
            )}
          </div>
        </div>

        {/* AI Summary */}
        <AISummary companyId={company.id} />

        {/* Stat cards */}
        <div className="flex gap-2">
          <StatCard
            icon={BookOpen} label="SOPs" value={sops.length}
            active={activePanel === 'sops'} onClick={() => setActivePanel('sops')} colour="text-teal-500"
          />
          <StatCard
            icon={StickyNote} label="Notes" value={noteCount}
            active={activePanel === 'notes'} onClick={() => setActivePanel('notes')} colour="text-amber-500"
          />
          <StatCard
            icon={CheckSquare} label="Tasks" value={openTasks}
            sub={overdueTasks > 0 ? `${overdueTasks} overdue` : taskCount > openTasks ? `${taskCount - openTasks} done` : undefined}
            active={activePanel === 'tasks'} onClick={() => setActivePanel('tasks')} colour="text-blue-500"
          />
        </div>

        {/* Recent activity */}
        <RecentActivity sops={sops} teamNotes={teamNotes} myNotes={myNotes} teamTodos={teamTodos} myTodos={myTodos} />
      </div>

      {/* ── Right: Section panel ── */}
      <div className="flex-1 min-w-0 bg-white rounded-2xl border border-gray-200 overflow-hidden flex flex-col" style={{ minHeight: '600px' }}>

        {/* Panel tab strip */}
        <div className="flex items-center border-b border-gray-100 px-2 pt-2 gap-1 flex-shrink-0">
          {(['sops', 'notes', 'tasks'] as const).map(s => (
            <button
              key={s}
              onClick={() => setActivePanel(s)}
              className={cn(
                'px-4 py-2 text-sm font-medium rounded-t-xl transition-colors border-b-2 -mb-px',
                activePanel === s
                  ? 'border-navy-700 text-navy-700 bg-navy-50/50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              )}
            >
              {PANEL_LABEL[s]}
              <span className={cn(
                'ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
                activePanel === s ? 'bg-navy-100 text-navy-700' : 'bg-gray-100 text-gray-500'
              )}>
                {s === 'sops' ? sops.length : s === 'notes' ? noteCount : taskCount}
              </span>
            </button>
          ))}
          <div className="flex-1" />
          <Link
            href={activePanel === 'sops' ? `/sops?company=${company.id}` : activePanel === 'notes' ? '/notes' : '/todos'}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-teal-600 transition-colors px-3 py-2"
          >
            <Plus className="w-3.5 h-3.5" />
            {activePanel === 'sops' ? 'New SOP' : activePanel === 'notes' ? 'New note' : 'New task'}
          </Link>
        </div>

        {/* Panel content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {activePanel === 'sops'  && <SopsPanel  sops={sops} />}
          {activePanel === 'notes' && <NotesPanel  teamNotes={teamNotes} myNotes={myNotes} />}
          {activePanel === 'tasks' && <TasksPanel  teamTodos={teamTodos} myTodos={myTodos} />}
        </div>
      </div>

    </div>
  )
}
