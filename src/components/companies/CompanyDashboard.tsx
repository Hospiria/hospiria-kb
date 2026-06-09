'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  BookOpen, StickyNote, CheckSquare, Building2,
  Clock, Tag, ChevronRight, ArrowUpRight,
  Circle, CheckCircle2, Pin, AlertCircle,
  Plus,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Company { id: string; name: string; description: string | null }

interface SopItem {
  id: string; title: string; status: string; category_id: string | null
  categories: { id: string; name: string } | null
}

interface NoteItem {
  id: string; title: string; updated_at: string
  team_id: string | null; pinned: boolean
  teams?: { name: string } | null
}

interface TodoItem {
  id: string; title: string; is_done: boolean; priority: string
  due_date: string | null; team_id: string | null; mine: boolean
  teamName: string | null; status: string
  assignees: { id: string; full_name: string | null }[]
}

type Tab = 'sops' | 'notes' | 'tasks'

interface Props {
  company: Company
  sops: SopItem[]
  teamNotes: NoteItem[]
  myNotes: NoteItem[]
  teamTodos: TodoItem[]
  myTodos: TodoItem[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_COLOURS: Record<string, string> = {
  live: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  draft: 'bg-gray-100 text-gray-500 border-gray-200',
  submitted: 'bg-amber-100 text-amber-700 border-amber-200',
  changes_requested: 'bg-orange-100 text-orange-700 border-orange-200',
}

const PRIORITY_DOT: Record<string, string> = {
  high: 'text-red-500',
  medium: 'text-amber-500',
  low: 'text-gray-300',
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function isOverdue(due: string | null) {
  if (!due) return false
  return new Date(due) < new Date(new Date().toDateString())
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TabBtn({ active, onClick, icon: Icon, label, count }: {
  active: boolean; onClick: () => void
  icon: typeof BookOpen; label: string; count: number
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl transition-colors',
        active
          ? 'bg-navy-700 text-white shadow-sm'
          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
      )}
    >
      <Icon className="w-4 h-4" />
      {label}
      <span className={cn(
        'ml-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full',
        active ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-500'
      )}>{count}</span>
    </button>
  )
}

function SectionLabel({ label, note }: { label: string; note?: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">{label}</span>
      <div className="flex-1 h-px bg-gray-100" />
      {note && <span className="text-[11px] text-gray-400">{note}</span>}
    </div>
  )
}

function EmptyState({ icon: Icon, label, action, href }: {
  icon: typeof BookOpen; label: string; action?: string; href?: string
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 border border-dashed border-gray-200 rounded-2xl bg-gray-50">
      <Icon className="w-8 h-8 text-gray-200" />
      <p className="text-sm text-gray-400">{label}</p>
      {action && href && (
        <Link href={href} className="flex items-center gap-1.5 text-xs font-medium text-teal-600 hover:text-teal-700">
          <Plus className="w-3.5 h-3.5" />{action}
        </Link>
      )}
    </div>
  )
}

// ── SOPs tab ──────────────────────────────────────────────────────────────────

function SopsTab({ sops }: { sops: SopItem[] }) {
  if (sops.length === 0) {
    return <EmptyState icon={BookOpen} label="No SOPs linked to this company yet." />
  }

  // Group by category
  const groups = new Map<string, SopItem[]>()
  for (const sop of sops) {
    const cat = sop.categories?.name ?? 'Uncategorised'
    const list = groups.get(cat) ?? []
    list.push(sop); groups.set(cat, list)
  }

  return (
    <div className="space-y-6">
      {Array.from(groups.entries()).map(([cat, items]) => (
        <div key={cat}>
          <SectionLabel label={cat} note={`${items.length} SOP${items.length !== 1 ? 's' : ''}`} />
          <div className="space-y-1.5">
            {items.map(sop => (
              <Link
                key={sop.id}
                href={`/sops/${sop.id}`}
                className="flex items-center justify-between gap-3 bg-white border border-gray-100 rounded-xl px-4 py-3 hover:border-teal-200 hover:bg-teal-50/30 transition-colors group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <BookOpen className="w-4 h-4 text-gray-300 flex-shrink-0 group-hover:text-teal-500 transition-colors" />
                  <span className="text-sm font-medium text-gray-700 truncate">{sop.title}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={cn(
                    'text-[11px] px-2 py-0.5 rounded-full border font-medium',
                    STATUS_COLOURS[sop.status] ?? 'bg-gray-100 text-gray-500 border-gray-200'
                  )}>
                    {sop.status}
                  </span>
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-teal-500 transition-colors" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Notes tab ─────────────────────────────────────────────────────────────────

function NoteCard({ note, href }: { note: NoteItem; href: string }) {
  return (
    <Link
      href={href}
      className="flex items-start justify-between gap-3 bg-white border border-gray-100 rounded-xl px-4 py-3 hover:border-teal-200 hover:bg-teal-50/30 transition-colors group"
    >
      <div className="flex items-start gap-3 min-w-0">
        <div className="flex-shrink-0 mt-0.5">
          {note.pinned
            ? <Pin className="w-4 h-4 text-amber-400" />
            : <StickyNote className="w-4 h-4 text-gray-300 group-hover:text-teal-500 transition-colors" />
          }
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-700 truncate">{note.title || 'Untitled'}</p>
          {note.teams?.name && (
            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
              <Tag className="w-3 h-3" /> {note.teams.name}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-xs text-gray-400 flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {fmtDate(note.updated_at)}
        </span>
        <ArrowUpRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-teal-500 transition-colors" />
      </div>
    </Link>
  )
}

function NotesTab({ teamNotes, myNotes, companyId }: {
  teamNotes: NoteItem[]; myNotes: NoteItem[]; companyId: string
}) {
  const noNotes = teamNotes.length === 0 && myNotes.length === 0
  if (noNotes) {
    return <EmptyState icon={StickyNote} label="No notes linked to this company yet." />
  }
  return (
    <div className="space-y-8">
      {teamNotes.length > 0 && (
        <div>
          <SectionLabel label="Team Notes" note={`${teamNotes.length}`} />
          <div className="space-y-1.5">
            {teamNotes.map(n => <NoteCard key={n.id} note={n} href={`/notes?open=${n.id}`} />)}
          </div>
        </div>
      )}
      <div>
        <SectionLabel label="My Personal Notes" note={`${myNotes.length}`} />
        {myNotes.length > 0 ? (
          <div className="space-y-1.5">
            {myNotes.map(n => <NoteCard key={n.id} note={n} href={`/notes?open=${n.id}`} />)}
          </div>
        ) : (
          <div className="py-6 text-center border border-dashed border-gray-200 rounded-2xl bg-gray-50">
            <p className="text-sm text-gray-400 mb-2">No personal notes for this company</p>
            <Link href="/notes" className="flex items-center justify-center gap-1.5 text-xs font-medium text-teal-600 hover:text-teal-700 mx-auto">
              <Plus className="w-3.5 h-3.5" /> Add a note
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Tasks tab ─────────────────────────────────────────────────────────────────

function TodoRow({ todo }: { todo: TodoItem }) {
  const overdue = !todo.is_done && isOverdue(todo.due_date)
  return (
    <div className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl px-4 py-3">
      {/* Status icon */}
      <div className="flex-shrink-0">
        {todo.is_done
          ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          : <Circle className="w-4 h-4 text-gray-300" />
        }
      </div>

      {/* Title + team */}
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm font-medium truncate', todo.is_done ? 'line-through text-gray-400' : 'text-gray-700')}>
          {todo.title}
        </p>
        {todo.teamName && (
          <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
            <Tag className="w-3 h-3" /> {todo.teamName}
          </p>
        )}
      </div>

      {/* Priority */}
      <div className="flex-shrink-0" title={`Priority: ${todo.priority}`}>
        <AlertCircle className={cn('w-3.5 h-3.5', PRIORITY_DOT[todo.priority] ?? 'text-gray-200')} />
      </div>

      {/* Due date */}
      {todo.due_date && (
        <span className={cn(
          'flex-shrink-0 text-xs px-2 py-0.5 rounded-full border font-medium',
          overdue
            ? 'bg-red-50 text-red-600 border-red-200'
            : 'bg-gray-50 text-gray-500 border-gray-200'
        )}>
          {fmtDate(todo.due_date)}
        </span>
      )}

      {/* Assignees */}
      {todo.assignees.length > 0 && (
        <div className="flex -space-x-1 flex-shrink-0">
          {todo.assignees.slice(0, 3).map(a => (
            <div
              key={a.id}
              title={a.full_name ?? undefined}
              className="w-6 h-6 rounded-full bg-teal-100 border border-white flex items-center justify-center text-[9px] font-bold text-teal-700"
            >
              {(a.full_name ?? '?').charAt(0).toUpperCase()}
            </div>
          ))}
          {todo.assignees.length > 3 && (
            <div className="w-6 h-6 rounded-full bg-gray-100 border border-white flex items-center justify-center text-[9px] font-bold text-gray-500">
              +{todo.assignees.length - 3}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TasksTab({ teamTodos, myTodos }: { teamTodos: TodoItem[]; myTodos: TodoItem[] }) {
  const noTodos = teamTodos.length === 0 && myTodos.length === 0
  if (noTodos) {
    return <EmptyState icon={CheckSquare} label="No tasks linked to this company yet." />
  }
  return (
    <div className="space-y-8">
      {teamTodos.length > 0 && (
        <div>
          <SectionLabel label="Team Tasks" note={`${teamTodos.filter(t => !t.is_done).length} open`} />
          <div className="space-y-1.5">
            {teamTodos.map(t => <TodoRow key={t.id} todo={t} />)}
          </div>
        </div>
      )}
      <div>
        <SectionLabel
          label="My Tasks"
          note={`${myTodos.filter(t => !t.is_done).length} open`}
        />
        {myTodos.length > 0 ? (
          <div className="space-y-1.5">
            {myTodos.map(t => <TodoRow key={t.id} todo={t} />)}
          </div>
        ) : (
          <div className="py-6 text-center border border-dashed border-gray-200 rounded-2xl bg-gray-50">
            <p className="text-sm text-gray-400 mb-2">No personal tasks for this company</p>
            <Link href="/todos" className="flex items-center justify-center gap-1.5 text-xs font-medium text-teal-600 hover:text-teal-700 mx-auto">
              <Plus className="w-3.5 h-3.5" /> Add a task
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function CompanyDashboard({ company, sops, teamNotes, myNotes, teamTodos, myTodos }: Props) {
  const [tab, setTab] = useState<Tab>('sops')

  const sopCount   = sops.length
  const noteCount  = teamNotes.length + myNotes.length
  const taskCount  = teamTodos.length + myTodos.length
  const openTasks  = [...teamTodos, ...myTodos].filter(t => !t.is_done).length

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-navy-100 flex items-center justify-center flex-shrink-0">
            <Building2 className="w-5 h-5 text-navy-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-navy-700">{company.name}</h1>
            {company.description && (
              <p className="text-sm text-gray-500 mt-0.5">{company.description}</p>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 mt-4 text-sm text-gray-500">
          <span className="flex items-center gap-1.5">
            <BookOpen className="w-4 h-4 text-gray-400" />
            <strong className="text-gray-700">{sopCount}</strong> SOP{sopCount !== 1 ? 's' : ''}
          </span>
          <span className="text-gray-200">|</span>
          <span className="flex items-center gap-1.5">
            <StickyNote className="w-4 h-4 text-gray-400" />
            <strong className="text-gray-700">{noteCount}</strong> note{noteCount !== 1 ? 's' : ''}
          </span>
          <span className="text-gray-200">|</span>
          <span className="flex items-center gap-1.5">
            <CheckSquare className="w-4 h-4 text-gray-400" />
            <strong className="text-gray-700">{openTasks}</strong> open task{openTasks !== 1 ? 's' : ''}
            {taskCount > openTasks && <span className="text-gray-400">/ {taskCount}</span>}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 p-1 bg-gray-100 rounded-2xl mb-6 w-fit">
        <TabBtn active={tab === 'sops'}  onClick={() => setTab('sops')}  icon={BookOpen}    label="SOPs"  count={sopCount} />
        <TabBtn active={tab === 'notes'} onClick={() => setTab('notes')} icon={StickyNote}  label="Notes" count={noteCount} />
        <TabBtn active={tab === 'tasks'} onClick={() => setTab('tasks')} icon={CheckSquare} label="Tasks" count={taskCount} />
      </div>

      {/* Tab content */}
      <div>
        {tab === 'sops'  && <SopsTab  sops={sops} />}
        {tab === 'notes' && <NotesTab teamNotes={teamNotes} myNotes={myNotes} companyId={company.id} />}
        {tab === 'tasks' && <TasksTab teamTodos={teamTodos} myTodos={myTodos} />}
      </div>
    </div>
  )
}
