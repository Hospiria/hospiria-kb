'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  Plus, Trash2, Users, Sparkles, Loader2, Calendar, ChevronDown, Check, X,
  Lock, Globe, Search, SlidersHorizontal, Flag, GripVertical, Inbox, Sunrise,
  CalendarDays, ListPlus, Pencil, MessageSquare, MoreHorizontal,
} from 'lucide-react'
import { createPortal } from 'react-dom'
import { DeleteConfirmModal, type DeleteTarget } from '@/components/notes/DeleteConfirmModal'
import { CommentsPanel } from '@/components/todos/CommentsPanel'
import {
  type Person, type Team, type Todo, type TodoStatus, type TodoList, type Space,
  PRIORITY_COLOR, SpaceBtn, SpinnerRow, Empty, TrashSection, useSpaceQuery,
} from '@/components/notes/workspaceShared'

// View = a smart view (computed) or a custom list (by id)
type SmartView = 'all' | 'today' | 'daily' | 'weekly'
type Selection = { type: 'view'; key: SmartView } | { type: 'list'; id: string }

const SMART_VIEWS: { key: SmartView; label: string; icon: typeof Inbox }[] = [
  { key: 'all', label: 'All tasks', icon: Inbox },
  { key: 'today', label: 'Today', icon: Calendar },
  { key: 'daily', label: 'Daily', icon: Sunrise },
  { key: 'weekly', label: 'Weekly', icon: CalendarDays },
]

const LIST_COLORS = ['#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#ef4444', '#10b981', '#6366f1']

// ─── Main ───────────────────────────────────────────────────────────────────

export function TodosClient({ currentUserId, people, myTeams }: {
  currentUserId: string; people: Person[]; myTeams: Team[]
}) {
  const [space, setSpace] = useState<Space>('personal')
  const [todos, setTodos] = useState<Todo[]>([])
  const [trashTodos, setTrashTodos] = useState<Todo[]>([])
  const [lists, setLists] = useState<TodoList[]>([])
  const [statuses, setStatuses] = useState<TodoStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [sel, setSel] = useState<Selection>({ type: 'view', key: 'all' })
  const [showTrash, setShowTrash] = useState(false)
  const [commentTask, setCommentTask] = useState<Todo | null>(null)

  // filters
  const [search, setSearch] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [mineOnly, setMineOnly] = useState(false)
  const [hideDone, setHideDone] = useState(false)

  const qs = useSpaceQuery(space)

  useEffect(() => { setSel({ type: 'view', key: 'all' }); setSearch('') }, [space])

  const loadTodos = useCallback(async () => {
    setLoading(true)
    try {
      const [active, trash] = await Promise.all([
        fetch(`/api/todos${qs}`).then(r => r.ok ? r.json() : null),
        fetch(`/api/todos${qs}&trash=true`).then(r => r.ok ? r.json() : null),
      ])
      if (active) setTodos(active.todos ?? [])
      if (trash) setTrashTodos(trash.todos ?? [])
    } finally { setLoading(false) }
  }, [qs])

  const loadLists = useCallback(async () => {
    const r = await fetch(`/api/todo-lists${qs}`).then(r => r.ok ? r.json() : null)
    if (r) setLists(r.lists ?? [])
  }, [qs])

  useEffect(() => { loadTodos(); loadLists() }, [loadTodos, loadLists])
  useEffect(() => { fetch('/api/todo-statuses').then(r => r.ok ? r.json() : null).then(d => { if (d) setStatuses(d.statuses ?? []) }) }, [])

  const isTeamSpace = space !== 'personal'
  const activeTeam = myTeams.find(t => t.id === space) ?? null
  const today = new Date().toISOString().slice(0, 10)

  // ── filtering by selection ──────────────────────────────────────────────
  const baseForSelection = useMemo(() => {
    const tmplOrOneOff = todos.filter(t => !t.recurrence_parent_id) // hide generated child instances
    if (sel.type === 'list') return tmplOrOneOff.filter(t => t.list_id === sel.id)
    switch (sel.key) {
      case 'daily':  return tmplOrOneOff.filter(t => t.recurrence === 'daily')
      case 'weekly': return tmplOrOneOff.filter(t => t.recurrence === 'weekly')
      case 'today':  return tmplOrOneOff.filter(t => t.recurrence === 'none' && t.due_date && t.due_date <= today && !t.is_done)
      default:       return tmplOrOneOff // all
    }
  }, [todos, sel, today])

  const sq = search.toLowerCase().trim()
  const visible = baseForSelection.filter(t => {
    if (sq && !t.title.toLowerCase().includes(sq) && !(t.detail ?? '').toLowerCase().includes(sq)) return false
    if (statusFilter && t.status !== statusFilter) return false
    if (priorityFilter && t.priority !== priorityFilter) return false
    if (mineOnly && !t.mine && !t.assignedToMe) return false
    if (hideDone && t.is_done) return false
    return true
  })

  const openTasks = visible.filter(t => !t.is_done)
  const doneTasks = visible.filter(t => t.is_done)

  const activeFilterCount = [statusFilter, priorityFilter].filter(Boolean).length + (mineOnly ? 1 : 0) + (hideDone ? 1 : 0)

  // ── add defaults from current selection ─────────────────────────────────
  const addDefaults = useMemo(() => {
    const d: { recurrence: 'none' | 'daily' | 'weekly'; dueDate: string | null; listId: string | null } =
      { recurrence: 'none', dueDate: null, listId: null }
    if (sel.type === 'list') d.listId = sel.id
    else if (sel.key === 'daily') d.recurrence = 'daily'
    else if (sel.key === 'weekly') d.recurrence = 'weekly'
    else if (sel.key === 'today') d.dueDate = today
    return d
  }, [sel, today])

  // ── optimistic insert of a newly-created task (no full reload) ────────────
  const nameById = useMemo(() => new Map(people.map(p => [p.id, p.full_name])), [people])
  function handleCreated(raw: Record<string, unknown>) {
    const r = raw as Partial<Todo> & { assignee_id?: string | null; team_id?: string | null; assigneeIds?: string[] }
    const ids = Array.isArray(r.assigneeIds) ? r.assigneeIds : (r.assignee_id ? [r.assignee_id] : [])
    const assignees = ids.map(id => ({ id, full_name: nameById.get(id) ?? null }))
    const enriched: Todo = {
      id: String(r.id), owner_id: String(r.owner_id ?? currentUserId),
      assignee_id: ids[0] ?? null, team_id: r.team_id ?? null,
      title: String(r.title ?? ''), detail: r.detail ?? null, due_date: r.due_date ?? null,
      priority: (r.priority as Todo['priority']) ?? 'medium', status: String(r.status ?? 'open'),
      is_done: !!r.is_done, recurrence: (r.recurrence as Todo['recurrence']) ?? 'none',
      recurrence_parent_id: r.recurrence_parent_id ?? null, is_carry: false,
      recurrence_day_of_week: r.recurrence_day_of_week ?? null, recurrence_weekdays_only: !!r.recurrence_weekdays_only,
      deleted_at: null, deleted_by: null, deletedByName: null,
      mine: true, assignedToMe: ids.includes(currentUserId),
      ownerName: 'You', assignees, assigneeName: assignees[0]?.full_name ?? null,
      teamName: r.team_id ? (myTeams.find(t => t.id === r.team_id)?.name ?? null) : null,
      list_id: r.list_id ?? null, position: (r.position as number) ?? 0,
    }
    setTodos(prev => [enriched, ...prev])
  }

  // ── mutations ─────────────────────────────────────────────────────────────
  async function patch(id: string, body: Record<string, unknown>) {
    setTodos(prev => prev.map(t => t.id === id ? applyPatch(t, body, nameById) : t))
    await fetch(`/api/todos/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {})
  }
  async function toggleDone(t: Todo) {
    const done = statuses.find(s => s.is_done)
    const open = statuses.find(s => s.is_default && !s.is_done) ?? statuses.find(s => !s.is_done)
    const target = t.is_done ? open : done
    await patch(t.id, { status: target?.name ?? (t.is_done ? 'open' : 'done'), isDone: !t.is_done })
  }
  async function confirmDelete() {
    if (!deleteTarget) return
    setTodos(prev => prev.filter(t => t.id !== deleteTarget.id))
    await fetch(`/api/todos/${deleteTarget.id}`, { method: 'DELETE' }).catch(() => {})
    setDeleteTarget(null)
    loadTodos()
  }
  async function restore(id: string) {
    await fetch(`/api/todos/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ restore: true }) })
    loadTodos()
  }
  async function reorder(orderedIds: string[]) {
    await fetch('/api/todos/reorder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: orderedIds }) }).catch(() => {})
  }
  async function emptyTrash() {
    if (!confirm('Permanently delete all tasks in the trash? This cannot be undone.')) return
    setTrashTodos([])
    await fetch(`/api/todos/trash${qs}`, { method: 'DELETE' }).catch(() => {})
  }

  const selLabel = sel.type === 'list'
    ? lists.find(l => l.id === sel.id)?.name ?? 'List'
    : SMART_VIEWS.find(v => v.key === sel.key)?.label ?? 'Tasks'

  return (
    <div className="max-w-6xl mx-auto">
      {deleteTarget && <DeleteConfirmModal target={deleteTarget} onConfirm={confirmDelete} onCancel={() => setDeleteTarget(null)} />}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold text-navy-700">To-dos</h1>
        <div className="flex flex-wrap items-center gap-2">
          <SpaceBtn active={space === 'personal'} onClick={() => setSpace('personal')}><Lock className="w-3.5 h-3.5" /> Personal</SpaceBtn>
          {myTeams.map(t => (
            <SpaceBtn key={t.id} active={space === t.id} onClick={() => setSpace(t.id)}><Globe className="w-3.5 h-3.5" /> {t.name}</SpaceBtn>
          ))}
        </div>
      </div>

      <div className="flex gap-5 items-start">
        {/* Sidebar */}
        <ListSidebar
          lists={lists} sel={sel} onSelect={setSel}
          todos={todos} today={today}
          space={space} isTeamSpace={isTeamSpace}
          onListsChange={loadLists}
        />

        {/* Main */}
        <div className="flex-1 min-w-0">
          {/* Slim toolbar */}
          <div className="flex items-center gap-2 mb-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search ${selLabel.toLowerCase()}…`}
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
            </div>
            <div className="relative">
              <button onClick={() => setShowFilters(s => !s)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${activeFilterCount > 0 || showFilters ? 'border-teal-300 bg-teal-50 text-teal-700' : 'border-gray-200 text-gray-600 bg-white hover:border-gray-300'}`}>
                <SlidersHorizontal className="w-3.5 h-3.5" /> Filter
                {activeFilterCount > 0 && <span className="bg-teal-600 text-white rounded-full w-4 h-4 text-[10px] flex items-center justify-center">{activeFilterCount}</span>}
              </button>
              {showFilters && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowFilters(false)} />
                  <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-xl p-3 w-56 space-y-2.5">
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase">Status</label>
                      <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-full mt-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
                        <option value="">Any status</option>
                        {statuses.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase">Priority</label>
                      <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} className="w-full mt-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
                        <option value="">Any priority</option>
                        <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
                      </select>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer"><input type="checkbox" checked={mineOnly} onChange={e => setMineOnly(e.target.checked)} className="rounded text-teal-500" /> Mine / assigned to me</label>
                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer"><input type="checkbox" checked={hideDone} onChange={e => setHideDone(e.target.checked)} className="rounded text-teal-500" /> Hide completed</label>
                    {activeFilterCount > 0 && (
                      <button onClick={() => { setStatusFilter(''); setPriorityFilter(''); setMineOnly(false); setHideDone(false) }}
                        className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"><X className="w-3 h-3" /> Clear filters</button>
                    )}
                  </div>
                </>
              )}
            </div>
            <span className="text-xs text-gray-400 ml-auto">{openTasks.length} open{doneTasks.length ? ` · ${doneTasks.length} done` : ''}</span>
          </div>

          {/* Quick add (inline, top) */}
          <QuickAdd
            statuses={statuses} people={people} teams={myTeams} lists={lists}
            currentTeamId={isTeamSpace ? space : null}
            defaults={addDefaults}
            onCreated={handleCreated}
          />

          {/* Table */}
          {loading ? <SpinnerRow /> : (
            <div className="mt-3">
              {visible.length === 0 ? (
                <Empty label={search || activeFilterCount > 0 ? 'No tasks match.' : `No tasks in "${selLabel}". Add one above.`} />
              ) : (
                <TaskTable
                  open={openTasks} done={doneTasks}
                  people={people} teams={myTeams} statuses={statuses} lists={lists}
                  onToggleDone={toggleDone}
                  onPatch={patch}
                  onChangeStatus={(id, s) => patch(id, { status: s.name, isDone: s.is_done })}
                  onDelete={t => setDeleteTarget({ type: 'todo', id: t.id, title: t.title, mine: t.mine, ownerName: t.ownerName, canDelete: t.mine || !!t.team_id })}
                  onReorder={reorder}
                  onOpenComments={setCommentTask}
                />
              )}
              <TrashSection show={showTrash} onToggle={() => setShowTrash(s => !s)} trashTodos={trashTodos} onRestoreTodo={restore} onEmpty={emptyTrash} />
            </div>
          )}
        </div>
      </div>

      {/* Comments drawer (right side) */}
      {commentTask && (
        <>
          <div className="fixed inset-0 bg-black/20 z-40" onClick={() => { setCommentTask(null); loadTodos() }} />
          <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col">
            <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Comments</p>
                <p className="text-sm font-semibold text-navy-700 truncate">{commentTask.title}</p>
              </div>
              <button onClick={() => { setCommentTask(null); loadTodos() }} className="text-gray-400 hover:text-navy-700 flex-shrink-0"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3">
              <CommentsPanel todoId={commentTask.id} people={people} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function applyPatch(t: Todo, b: Record<string, unknown>, peopleById?: Map<string, string | null>): Todo {
  const next: Todo = {
    ...t,
    priority: (b.priority as Todo['priority']) ?? t.priority,
    due_date: b.dueDate !== undefined ? (b.dueDate as string | null) : t.due_date,
    assignee_id: b.assigneeId !== undefined ? (b.assigneeId as string | null) : t.assignee_id,
    team_id: b.teamId !== undefined ? (b.teamId as string | null) : t.team_id,
    list_id: b.listId !== undefined ? (b.listId as string | null) : t.list_id,
    status: (b.status as string) ?? t.status,
    is_done: b.isDone !== undefined ? !!b.isDone : t.is_done,
    title: (b.title as string) ?? t.title,
  }
  if (Array.isArray(b.assigneeIds)) {
    const ids = b.assigneeIds as string[]
    next.assignees = ids.map(id => ({ id, full_name: peopleById?.get(id) ?? null }))
    next.assignee_id = ids[0] ?? null
  }
  return next
}

// ─── Sidebar (smart views + custom lists) ─────────────────────────────────────

function ListSidebar({ lists, sel, onSelect, todos, today, space, isTeamSpace, onListsChange }: {
  lists: TodoList[]; sel: Selection; onSelect: (s: Selection) => void
  todos: Todo[]; today: string; space: Space; isTeamSpace: boolean
  onListsChange: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  const countFor = (key: SmartView) => {
    const base = todos.filter(t => !t.recurrence_parent_id && !t.is_done)
    if (key === 'daily')  return base.filter(t => t.recurrence === 'daily').length
    if (key === 'weekly') return base.filter(t => t.recurrence === 'weekly').length
    if (key === 'today')  return base.filter(t => t.recurrence === 'none' && t.due_date && t.due_date <= today).length
    return base.length
  }
  const listCount = (id: string) => todos.filter(t => t.list_id === id && !t.is_done && !t.recurrence_parent_id).length

  async function addList() {
    const name = newName.trim(); if (!name) { setAdding(false); return }
    const color = LIST_COLORS[lists.length % LIST_COLORS.length]
    const r = await fetch('/api/todo-lists', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color, teamId: isTeamSpace ? space : null }),
    })
    setNewName(''); setAdding(false)
    if (r.ok) { const { list } = await r.json(); onListsChange(); onSelect({ type: 'list', id: list.id }) }
  }
  async function renameList(id: string, name: string) {
    setEditingId(null)
    await fetch(`/api/todo-lists/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
    onListsChange()
  }
  async function deleteList(id: string) {
    if (!confirm('Delete this list? Tasks in it will move back to All tasks.')) return
    await fetch(`/api/todo-lists/${id}`, { method: 'DELETE' })
    if (sel.type === 'list' && sel.id === id) onSelect({ type: 'view', key: 'all' })
    onListsChange()
  }

  return (
    <aside className="w-48 flex-shrink-0 hidden md:block">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 mb-1">Views</p>
      <nav className="space-y-0.5 mb-5">
        {SMART_VIEWS.map(v => {
          const active = sel.type === 'view' && sel.key === v.key
          const c = countFor(v.key)
          return (
            <button key={v.key} onClick={() => onSelect({ type: 'view', key: v.key })}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors ${active ? 'bg-navy-700 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              <v.icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1 text-left truncate">{v.label}</span>
              {c > 0 && <span className={`text-[10px] ${active ? 'text-white/70' : 'text-gray-400'}`}>{c}</span>}
            </button>
          )
        })}
      </nav>

      <div className="flex items-center justify-between px-2 mb-1">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">My Lists</p>
        <button onClick={() => setAdding(true)} title="New list" className="text-gray-400 hover:text-teal-600"><ListPlus className="w-3.5 h-3.5" /></button>
      </div>
      <nav className="space-y-0.5">
        {lists.map(l => {
          const active = sel.type === 'list' && sel.id === l.id
          const c = listCount(l.id)
          return (
            <div key={l.id} className="group relative">
              {editingId === l.id ? (
                <input autoFocus defaultValue={l.name}
                  onBlur={e => renameList(l.id, e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') renameList(l.id, (e.target as HTMLInputElement).value); if (e.key === 'Escape') setEditingId(null) }}
                  className="w-full text-sm border border-teal-300 rounded-lg px-2 py-1 focus:outline-none" />
              ) : (
                <button onClick={() => onSelect({ type: 'list', id: l.id })}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors ${active ? 'bg-navy-700 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: l.color }} />
                  <span className="flex-1 text-left truncate">{l.icon ? `${l.icon} ` : ''}{l.name}</span>
                  {c > 0 && <span className={`text-[10px] ${active ? 'text-white/70' : 'text-gray-400'}`}>{c}</span>}
                </button>
              )}
              {editingId !== l.id && (
                <div className="absolute right-1 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-0.5 bg-inherit">
                  <button onClick={() => setEditingId(l.id)} title="Rename" className={`p-0.5 rounded ${active ? 'text-white/70 hover:text-white' : 'text-gray-300 hover:text-gray-600'}`}><Pencil className="w-3 h-3" /></button>
                  <button onClick={() => deleteList(l.id)} title="Delete" className={`p-0.5 rounded ${active ? 'text-white/70 hover:text-white' : 'text-gray-300 hover:text-red-500'}`}><Trash2 className="w-3 h-3" /></button>
                </div>
              )}
            </div>
          )
        })}
        {adding && (
          <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
            onBlur={addList} onKeyDown={e => { if (e.key === 'Enter') addList(); if (e.key === 'Escape') { setAdding(false); setNewName('') } }}
            placeholder="List name…" className="w-full text-sm border border-teal-300 rounded-lg px-2 py-1 focus:outline-none" />
        )}
        {lists.length === 0 && !adding && (
          <button onClick={() => setAdding(true)} className="w-full text-left text-xs text-gray-400 hover:text-teal-600 px-2 py-1.5 flex items-center gap-1.5">
            <Plus className="w-3 h-3" /> Create a list
          </button>
        )}
      </nav>
    </aside>
  )
}

// ─── Quick add (single line + expandable) ─────────────────────────────────────

function QuickAdd({ statuses, people, teams, lists, currentTeamId, defaults, onCreated }: {
  statuses: TodoStatus[]; people: Person[]; teams: Team[]; lists: TodoList[]; currentTeamId: string | null
  defaults: { recurrence: 'none' | 'daily' | 'weekly'; dueDate: string | null; listId: string | null }
  onCreated: (raw: Record<string, unknown>) => void
}) {
  const [title, setTitle] = useState('')
  const [adding, setAdding] = useState(false)
  const [mode, setMode] = useState<'quick' | 'ai'>('ai')
  const [showExtra, setShowExtra] = useState(false)

  const defaultStatus = statuses.find(s => s.is_default)?.name ?? (statuses[0]?.name ?? 'To Do')
  const [detail, setDetail] = useState('')
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium')
  const [dueDate, setDueDate] = useState('')
  const [assigneeIds, setAssigneeIds] = useState<string[]>([])
  const [status, setStatus] = useState(defaultStatus)
  const [recurrence, setRecurrence] = useState<'none' | 'daily' | 'weekly'>(defaults.recurrence)
  const [dayOfWeek, setDayOfWeek] = useState(1)
  const [weekdaysOnly, setWeekdaysOnly] = useState(false)
  const [listId, setListId] = useState(defaults.listId ?? '')

  // Keep recurrence/list in sync with the active view/list when it changes
  useEffect(() => { setRecurrence(defaults.recurrence); setListId(defaults.listId ?? '') }, [defaults.recurrence, defaults.listId])

  function reset() {
    setTitle(''); setDetail(''); setDueDate(''); setAssigneeIds([]); setPriority('medium')
    setStatus(defaultStatus); setRecurrence(defaults.recurrence); setDayOfWeek(1); setWeekdaysOnly(false)
    setListId(defaults.listId ?? '')
  }

  const [aiNote, setAiNote] = useState('')

  async function add() {
    const t = title.trim(); if (!t || adding) return
    setAdding(true); setAiNote('')
    try {
      if (mode === 'ai') {
        const r = await fetch('/api/todos/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: t }) })
        const d = await r.json()
        if (r.ok && d.draft) {
          const draft = d.draft
          const res = await fetch('/api/todos', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: draft.title, detail: draft.detail, dueDate: draft.dueDate,
              priority: draft.priority, assigneeId: draft.assigneeId,
              teamId: currentTeamId, listId: defaults.listId,
              recurrence: draft.recurrence ?? defaults.recurrence,
              recurrenceDayOfWeek: draft.recurrenceDayOfWeek ?? null,
              recurrenceWeekdaysOnly: draft.recurrenceWeekdaysOnly ?? false,
              statusName: draft.statusName,
            }),
          })
          const cd = await res.json().catch(() => ({}))
          if (res.ok && cd.todo) onCreated(cd.todo)
          // Brief confirmation of what the AI picked up
          const bits: string[] = []
          if (draft.dueDate) bits.push(`📅 ${draft.dueDate}`)
          if (draft.recurrence && draft.recurrence !== 'none') bits.push(`↻ ${draft.recurrence}`)
          if (draft.priority && draft.priority !== 'medium') bits.push(`🚩 ${draft.priority}`)
          if (draft.assigneeName) bits.push(`→ ${draft.assigneeName}`)
          setAiNote(bits.length ? `Added · ${bits.join(' · ')}` : 'Added')
          setTimeout(() => setAiNote(''), 4000)
        } else {
          setAiNote(d.error ?? 'Could not parse that.')
        }
      } else {
        const selectedStatus = statuses.find(s => s.name === status)
        const res = await fetch('/api/todos', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: t, detail: detail || null, priority,
            dueDate: dueDate || defaults.dueDate || null,
            assigneeIds, teamId: currentTeamId,
            listId: listId || null,
            recurrence,
            recurrenceDayOfWeek: recurrence === 'weekly' ? dayOfWeek : null,
            recurrenceWeekdaysOnly: recurrence === 'daily' ? weekdaysOnly : false,
            statusName: status,
            isDone: selectedStatus?.is_done ?? false,
          }),
        })
        const cd = await res.json().catch(() => ({}))
        if (res.ok && cd.todo) onCreated(cd.todo)
      }
      reset()
    } finally { setAdding(false) }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl">
      {/* Mode toggle */}
      <div className="flex items-center gap-2 px-3 pt-2">
        <div className="inline-flex rounded-lg border border-gray-200 p-0.5 text-xs">
          <button onClick={() => setMode('ai')} className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-medium transition-colors ${mode === 'ai' ? 'bg-teal-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
            <Sparkles className="w-3 h-3" /> AI
          </button>
          <button onClick={() => setMode('quick')} className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-medium transition-colors ${mode === 'quick' ? 'bg-navy-700 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
            Manual
          </button>
        </div>
        <p className="text-[11px] text-gray-400 truncate">
          {mode === 'ai' ? 'Type naturally — AI picks up date, recurrence, priority & assignee.' : 'Type a task, or open all fields with the sliders.'}
        </p>
      </div>

      <div className="flex items-center gap-2 px-3 py-2">
        {mode === 'ai' && <Sparkles className="w-4 h-4 text-teal-500 flex-shrink-0" />}
        <input value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()}
          placeholder={mode === 'ai' ? 'e.g. “remind Sarah to chase checkout report every Monday — high priority”' : 'Add a task, press Enter…'}
          className="flex-1 text-sm bg-transparent focus:outline-none placeholder:text-gray-400" />
        {mode === 'quick' && (
          <button onClick={() => setShowExtra(s => !s)} className={`p-1 rounded flex-shrink-0 ${showExtra ? 'text-teal-600 bg-teal-50' : 'text-gray-300 hover:text-gray-600'}`} title="Set all fields">
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        )}
        <button onClick={add} disabled={!title.trim() || adding}
          className="flex items-center gap-1 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg disabled:opacity-40 flex-shrink-0">
          {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add
        </button>
      </div>
      {aiNote && <p className="px-3 pb-2 -mt-1 text-[11px] text-teal-600 font-medium">{aiNote}</p>}

      {mode === 'quick' && showExtra && (
        <div className="border-t border-gray-100 px-3 py-3 space-y-2.5">
          <textarea value={detail} onChange={e => setDetail(e.target.value)} rows={2} placeholder="Details (optional)"
            className="w-full resize-none text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <label className="text-[10px] font-semibold text-gray-400">Status
              <select value={status} onChange={e => setStatus(e.target.value)} className="w-full mt-0.5 text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white">
                {statuses.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </label>
            <label className="text-[10px] font-semibold text-gray-400">Priority
              <select value={priority} onChange={e => setPriority(e.target.value as 'low'|'medium'|'high')} className="w-full mt-0.5 text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white">
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
              </select>
            </label>
            <label className="text-[10px] font-semibold text-gray-400">Recurrence
              <select value={recurrence} onChange={e => setRecurrence(e.target.value as 'none'|'daily'|'weekly')} className="w-full mt-0.5 text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white">
                <option value="none">One-off</option><option value="daily">Daily</option><option value="weekly">Weekly</option>
              </select>
            </label>

            {recurrence === 'weekly' && (
              <label className="text-[10px] font-semibold text-gray-400 sm:col-span-3">Repeats on
                <div className="flex gap-1 mt-1 flex-wrap">
                  {[['Mon',1],['Tue',2],['Wed',3],['Thu',4],['Fri',5],['Sat',6],['Sun',0]].map(([label, val]) => (
                    <button key={val} type="button" onClick={() => setDayOfWeek(val as number)}
                      className={`px-2 py-1 rounded-lg text-xs font-medium border transition-colors ${dayOfWeek === val ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-gray-600 border-gray-200 hover:border-teal-300'}`}>{label}</button>
                  ))}
                </div>
              </label>
            )}
            {recurrence === 'daily' && (
              <label className="text-[10px] font-semibold text-gray-400 flex items-center gap-2 cursor-pointer sm:col-span-3 mt-1">
                <input type="checkbox" checked={weekdaysOnly} onChange={e => setWeekdaysOnly(e.target.checked)} className="rounded text-teal-500" /> Weekdays only (Mon–Fri)
              </label>
            )}

            <label className="text-[10px] font-semibold text-gray-400">Due date
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="w-full mt-0.5 text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white" />
            </label>
            <div className="text-[10px] font-semibold text-gray-400">Assign to
              <div className="mt-1 border border-gray-200 rounded-lg px-2 py-1 bg-white flex items-center min-h-[30px]">
                <AssigneePicker value={assigneeIds} people={people} onChange={setAssigneeIds} />
              </div>
            </div>
            <label className="text-[10px] font-semibold text-gray-400">List
              <select value={listId} onChange={e => setListId(e.target.value)} className="w-full mt-0.5 text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white">
                <option value="">No list</option>{lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Table ──────────────────────────────────────────────────────────────────

function TaskTable({ open, done, people, teams, statuses, lists, onToggleDone, onPatch, onChangeStatus, onDelete, onReorder, onOpenComments }: {
  open: Todo[]; done: Todo[]; people: Person[]; teams: Team[]; statuses: TodoStatus[]; lists: TodoList[]
  onToggleDone: (t: Todo) => void
  onPatch: (id: string, b: Record<string, unknown>) => void
  onChangeStatus: (id: string, s: TodoStatus) => void
  onDelete: (t: Todo) => void
  onReorder: (ids: string[]) => void
  onOpenComments: (t: Todo) => void
}) {
  const [order, setOrder] = useState<string[]>(open.map(t => t.id))
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showDone, setShowDone] = useState(true)
  const dragId = useRef<string | null>(null)

  useEffect(() => { setOrder(open.map(t => t.id)) }, [open])

  const orderedOpen = order.map(id => open.find(t => t.id === id)).filter(Boolean) as Todo[]
  const nameById = useMemo(() => new Map(people.map(p => [p.id, p.full_name])), [people])

  function onDrop() {
    if (dragId.current) onReorder(order)
    dragId.current = null
  }
  function onEnter(overId: string) {
    const from = dragId.current
    if (!from || from === overId) return
    setOrder(prev => {
      const fi = prev.indexOf(from), ti = prev.indexOf(overId)
      if (fi === -1 || ti === -1 || fi === ti) return prev
      const next = [...prev]; next.splice(fi, 1); next.splice(ti, 0, from); return next
    })
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Column header */}
      <div className="grid grid-cols-[18px_18px_1fr_80px_40px_64px_76px_24px_24px] gap-2 items-center px-3 py-2 border-b border-gray-100 text-[10px] font-bold uppercase tracking-wide text-gray-400">
        <span /><span /><span>Task</span><span>Status</span><span className="text-center">Prio</span><span className="text-right pr-1">Due</span><span>Assignee</span><span /><span />
      </div>

      {orderedOpen.map(t => (
        <TaskRow key={t.id} t={t} people={people} teams={teams} statuses={statuses} lists={lists}
          assigneeName={t.assignee_id ? nameById.get(t.assignee_id) ?? null : null}
          expanded={expandedId === t.id}
          onToggleDone={() => onToggleDone(t)}
          onExpand={() => setExpandedId(e => e === t.id ? null : t.id)}
          onChangeStatus={s => onChangeStatus(t.id, s)}
          onPatch={b => onPatch(t.id, b)}
          onDelete={() => onDelete(t)}
          onOpenComments={() => onOpenComments(t)}
          draggable
          onDragStart={() => { dragId.current = t.id }}
          onDragEnter={() => onEnter(t.id)}
          onDragEnd={onDrop}
        />
      ))}

      {done.length > 0 && (
        <>
          <button onClick={() => setShowDone(s => !s)} className="w-full flex items-center gap-1.5 px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wide border-t border-gray-100 hover:bg-gray-50">
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showDone ? 'rotate-180' : ''}`} /> Completed ({done.length})
          </button>
          {showDone && done.map(t => (
            <TaskRow key={t.id} t={t} people={people} teams={teams} statuses={statuses} lists={lists}
              assigneeName={t.assignee_id ? nameById.get(t.assignee_id) ?? null : null}
              expanded={expandedId === t.id}
              onToggleDone={() => onToggleDone(t)}
              onExpand={() => setExpandedId(e => e === t.id ? null : t.id)}
              onChangeStatus={s => onChangeStatus(t.id, s)}
              onPatch={b => onPatch(t.id, b)}
              onDelete={() => onDelete(t)}
              onOpenComments={() => onOpenComments(t)}
            />
          ))}
        </>
      )}
    </div>
  )
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function TaskRow({ t, people, teams, statuses, lists, expanded, onToggleDone, onExpand, onChangeStatus, onPatch, onDelete, onOpenComments, draggable, onDragStart, onDragEnter, onDragEnd }: {
  t: Todo; people: Person[]; teams: Team[]; statuses: TodoStatus[]; lists: TodoList[]
  assigneeName: string | null; expanded: boolean
  onToggleDone: () => void; onExpand: () => void; onChangeStatus: (s: TodoStatus) => void
  onPatch: (b: Record<string, unknown>) => void; onDelete: () => void; onOpenComments: () => void
  draggable?: boolean; onDragStart?: () => void; onDragEnter?: () => void; onDragEnd?: () => void
}) {
  const isDone = t.is_done
  const isOverdue = t.due_date && !isDone && t.due_date < new Date().toISOString().slice(0, 10)
  const dueLabel = t.due_date ? new Date(t.due_date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null
  const recur = recurrenceLabel(t)
  const comments = t.commentCount ?? 0

  return (
    <div className="border-b border-gray-50 last:border-0"
      onDragEnter={onDragEnter} onDragOver={e => draggable && e.preventDefault()}>
      <div className="grid grid-cols-[18px_18px_1fr_80px_40px_64px_76px_24px_24px] gap-2 items-center px-3 py-2 group hover:bg-slate-50/60">
        {/* drag handle */}
        <span draggable={draggable} onDragStart={onDragStart} onDragEnd={onDragEnd}
          className={`cursor-grab active:cursor-grabbing text-gray-200 group-hover:text-gray-400 ${draggable ? '' : 'opacity-0'}`}>
          <GripVertical className="w-3.5 h-3.5" />
        </span>
        {/* checkbox */}
        <button onClick={onToggleDone} title={isDone ? 'Mark not done' : 'Mark done'}
          className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${isDone ? 'bg-teal-500 border-teal-500' : 'border-gray-300 hover:border-teal-500'}`}>
          {isDone && <Check className="w-2.5 h-2.5 text-white" />}
        </button>
        {/* title + recurrence schedule */}
        <button onClick={onExpand} className="min-w-0 text-left flex items-center gap-2">
          <span className={`text-sm truncate ${isDone ? 'text-gray-400 line-through' : 'text-navy-700'}`}>{t.title}</span>
          {t.is_carry && !isDone && <span className="text-[9px] bg-red-100 text-red-600 font-bold px-1 py-0.5 rounded flex-shrink-0">DUE</span>}
          {recur && <span className="text-[9px] text-gray-500 bg-gray-100 rounded px-1.5 py-0.5 flex-shrink-0 flex items-center gap-0.5">↻ {recur}</span>}
        </button>
        {/* status */}
        <div className="min-w-0"><StatusPicker current={t.status} statuses={statuses} onChange={onChangeStatus} /></div>
        {/* priority */}
        <div className="flex justify-center"><PriorityPicker value={t.priority} onChange={p => onPatch({ priority: p })} /></div>
        {/* due */}
        <div className="flex justify-end pr-1"><DueCell value={t.due_date} overdue={!!isOverdue} label={dueLabel} onChange={d => onPatch({ dueDate: d })} /></div>
        {/* assignees — click to change (multi) */}
        <div className="min-w-0">
          <AssigneePicker
            value={(t.assignees && t.assignees.length ? t.assignees.map(a => a.id) : (t.assignee_id ? [t.assignee_id] : []))}
            people={people}
            onChange={ids => onPatch({ assigneeIds: ids })}
          />
        </div>
        {/* comments indicator */}
        <button onClick={onOpenComments} title={comments ? `${comments} comment${comments !== 1 ? 's' : ''}` : 'Add a comment'}
          className={`flex items-center justify-center gap-0.5 ${comments ? 'text-teal-600' : 'text-gray-200 group-hover:text-gray-400'}`}>
          <MessageSquare className="w-3.5 h-3.5" />
          {comments > 0 && <span className="text-[10px] font-semibold">{comments}</span>}
        </button>
        {/* delete */}
        <button onClick={onDelete} title="Delete" className="text-gray-200 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity flex justify-center">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {expanded && (
        <div className="px-3 pb-3 bg-slate-50/60">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-2">
            <label className="text-[10px] font-semibold text-gray-400">List
              <select value={t.list_id ?? ''} onChange={e => onPatch({ listId: e.target.value || null })} className="w-full mt-0.5 text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white">
                <option value="">No list</option>{lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
            {teams.length > 0 && (
              <label className="text-[10px] font-semibold text-gray-400">Team
                <select value={t.team_id ?? ''} onChange={e => onPatch({ teamId: e.target.value || null })} className="w-full mt-0.5 text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white">
                  <option value="">Personal</option>{teams.map(tm => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
                </select>
              </label>
            )}
          </div>
          {t.detail && <p className="text-xs text-gray-500 mt-2 whitespace-pre-wrap">{t.detail}</p>}
          <button onClick={onOpenComments} className="mt-2 text-[11px] text-teal-600 hover:underline flex items-center gap-1">
            <MessageSquare className="w-3 h-3" /> {comments ? `View ${comments} comment${comments !== 1 ? 's' : ''}` : 'Add a comment'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Assignee picker (click to reassign) ──────────────────────────────────────

function initials(name: string | null) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

function AssigneePicker({ value, people, onChange }: { value: string[]; people: Person[]; onChange: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const btnRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const selected = people.filter(p => value.includes(p.id))
  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + window.scrollY + 4, left: r.left + window.scrollX - 120 })
    }
    setOpen(o => !o); setQ('')
  }
  function toggleUser(id: string) {
    onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id])
  }
  const filtered = q ? people.filter(p => (p.full_name ?? '').toLowerCase().includes(q.toLowerCase())) : people
  return (
    <>
      <button ref={btnRef} onClick={toggle} title={selected.length ? selected.map(s => s.full_name).join(', ') : 'Assign'} className="flex items-center hover:bg-gray-100 rounded-full px-0.5 py-0.5 max-w-full">
        {selected.length === 0 && (
          <span className="w-5 h-5 rounded-full border border-dashed border-gray-300 text-gray-300 text-[11px] flex items-center justify-center flex-shrink-0">+</span>
        )}
        {selected.length === 1 && (
          <span className="flex items-center gap-1">
            <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-700 text-[9px] font-bold flex items-center justify-center flex-shrink-0">{initials(selected[0].full_name)}</span>
            <span className="text-[11px] text-gray-600 truncate">{(selected[0].full_name ?? 'User').split(' ')[0]}</span>
          </span>
        )}
        {selected.length > 1 && (
          <span className="flex items-center">
            {selected.slice(0, 3).map((s, i) => (
              <span key={s.id} className={`w-5 h-5 rounded-full bg-teal-100 text-teal-700 text-[9px] font-bold flex items-center justify-center ring-1 ring-white ${i > 0 ? '-ml-1.5' : ''}`}>{initials(s.full_name)}</span>
            ))}
            {selected.length > 3 && <span className="text-[10px] text-gray-400 ml-1">+{selected.length - 3}</span>}
          </span>
        )}
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          <div className="absolute z-[9999] bg-white border border-gray-200 rounded-xl shadow-xl w-56 py-1.5" style={{ top: pos.top, left: pos.left }}>
            <div className="flex items-center justify-between px-2 pb-1">
              <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search people…"
                className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-teal-500" />
            </div>
            {value.length > 0 && (
              <button onClick={() => onChange([])} className="w-full text-left text-[11px] text-gray-400 hover:text-red-500 px-3 py-1">Clear all</button>
            )}
            <div className="max-h-52 overflow-y-auto">
              {filtered.map(p => {
                const on = value.includes(p.id)
                return (
                  <button key={p.id} onClick={() => toggleUser(p.id)} className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50">
                    <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${on ? 'bg-teal-500 border-teal-500' : 'border-gray-300'}`}>{on && <Check className="w-2.5 h-2.5 text-white" />}</span>
                    <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-700 text-[9px] font-bold flex items-center justify-center">{initials(p.full_name)}</span>
                    <span className="flex-1 truncate">{p.full_name ?? 'User'}</span>
                  </button>
                )
              })}
            </div>
            <div className="px-2 pt-1 border-t border-gray-100 mt-1">
              <button onClick={() => setOpen(false)} className="w-full text-center text-[11px] text-teal-600 font-medium py-1 hover:bg-teal-50 rounded">Done</button>
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  )
}

// ─── Recurrence label ─────────────────────────────────────────────────────────

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
function recurrenceLabel(t: Todo): string | null {
  if (t.recurrence === 'daily') return t.recurrence_weekdays_only ? 'Weekdays' : 'Daily'
  if (t.recurrence === 'weekly') return `Weekly · ${DOW[t.recurrence_day_of_week ?? 1]}`
  return null
}

// ─── Priority picker (click the flag to change) ───────────────────────────────

const PRIO_OPTS: { value: 'high' | 'medium' | 'low'; label: string; color: string }[] = [
  { value: 'high', label: 'High', color: 'text-red-500' },
  { value: 'medium', label: 'Medium', color: 'text-amber-500' },
  { value: 'low', label: 'Low', color: 'text-gray-300' },
]

function PriorityPicker({ value, onChange }: { value: string; onChange: (p: string) => void }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + window.scrollY + 4, left: r.left + window.scrollX - 60 })
    }
    setOpen(o => !o)
  }
  return (
    <>
      <button ref={btnRef} onClick={toggle} title={`Priority: ${value}`} className="p-0.5 rounded hover:bg-gray-100">
        <Flag className={`w-3.5 h-3.5 ${PRIORITY_COLOR[value]}`} fill="currentColor" />
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          <div className="absolute z-[9999] bg-white border border-gray-200 rounded-xl shadow-xl w-32 py-1.5" style={{ top: pos.top, left: pos.left }}>
            {PRIO_OPTS.map(o => (
              <button key={o.value} onClick={() => { onChange(o.value); setOpen(false) }}
                className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50">
                <Flag className={`w-3.5 h-3.5 ${o.color}`} fill="currentColor" />
                <span className="flex-1">{o.label}</span>
                {value === o.value && <Check className="w-3 h-3 text-teal-500" />}
              </button>
            ))}
          </div>
        </>,
        document.body,
      )}
    </>
  )
}

// ─── Due cell (click the date to change) ──────────────────────────────────────

function DueCell({ value, overdue, label, onChange }: { value: string | null; overdue: boolean; label: string | null; onChange: (d: string | null) => void }) {
  const [editing, setEditing] = useState(false)
  if (editing) {
    return (
      <input type="date" autoFocus defaultValue={value ?? ''}
        onBlur={e => { setEditing(false); if (e.target.value !== (value ?? '')) onChange(e.target.value || null) }}
        onChange={e => { onChange(e.target.value || null); setEditing(false) }}
        className="text-[11px] border border-teal-300 rounded px-1 py-0.5 w-[72px] focus:outline-none" />
    )
  }
  return (
    <button onClick={() => setEditing(true)} title="Set due date"
      className={`text-[11px] rounded px-1 py-0.5 hover:bg-gray-100 ${label ? (overdue ? 'text-red-500 font-semibold' : 'text-gray-500') : 'text-gray-300 hover:text-gray-500'}`}>
      {label ?? '+ date'}
    </button>
  )
}

// ─── Status picker ──────────────────────────────────────────────────────────

function StatusPicker({ current, statuses, onChange }: { current: string; statuses: TodoStatus[]; onChange: (s: TodoStatus) => void }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const currentStatus = statuses.find(s => s.name === current)
  if (!statuses.length) return null
  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + window.scrollY + 4, left: r.left + window.scrollX })
    }
    setOpen(o => !o)
  }
  return (
    <>
      <button ref={btnRef} onClick={toggle}
        className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border transition-colors max-w-full truncate"
        style={{ backgroundColor: (currentStatus?.color ?? '#94a3b8') + '20', color: currentStatus?.color ?? '#94a3b8', borderColor: (currentStatus?.color ?? '#94a3b8') + '40' }}>
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: currentStatus?.color ?? '#94a3b8' }} />
        <span className="truncate">{current}</span>
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          <div className="absolute z-[9999] bg-white border border-gray-200 rounded-xl shadow-xl w-44 py-1.5 max-h-60 overflow-y-auto" style={{ top: pos.top, left: pos.left }}>
            {statuses.map(s => (
              <button key={s.id} onClick={() => { onChange(s); setOpen(false) }} className="w-full text-left flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-gray-50">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                <span className="flex-1 truncate">{s.name}</span>
                {s.name === current && <Check className="w-3 h-3 text-teal-500 flex-shrink-0" />}
              </button>
            ))}
          </div>
        </>,
        document.body,
      )}
    </>
  )
}
