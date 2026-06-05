'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Plus, Trash2, Users, Sparkles, Loader2, Calendar, ChevronDown,
  Check, X, Lock, Globe, Search, SlidersHorizontal, MessageSquare,
} from 'lucide-react'
import { createPortal } from 'react-dom'
import { DeleteConfirmModal, type DeleteTarget } from '@/components/notes/DeleteConfirmModal'
import { CommentsPanel } from '@/components/todos/CommentsPanel'
import {
  type Person, type Team, type Todo, type TodoStatus, type Space,
  PRIORITY_COLOR, SpaceBtn, SectionHeader, SpinnerRow, Empty, TrashSection, useSpaceQuery,
} from '@/components/notes/workspaceShared'

type TodoView = 'all' | 'daily' | 'weekly' | 'tasks'

// ─── To-dos page ──────────────────────────────────────────────────────────────

export function TodosClient({ currentUserId, people, myTeams }: {
  currentUserId: string
  people: Person[]
  myTeams: Team[]
}) {
  const [space, setSpace] = useState<Space>('personal')
  const [todos, setTodos] = useState<Todo[]>([])
  const [trashTodos, setTrashTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)
  const [statuses, setStatuses] = useState<TodoStatus[]>([])
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)

  const [search, setSearch] = useState('')
  const [todoView, setTodoView] = useState<TodoView>('all')
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [mineOnly, setMineOnly] = useState(false)
  const [hideDone, setHideDone] = useState(false)

  useEffect(() => { setSearch(''); setTodoView('all'); setStatusFilter(''); setPriorityFilter(''); setMineOnly(false); setHideDone(false) }, [space])

  const qs = useSpaceQuery(space)

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

  useEffect(() => { loadTodos() }, [loadTodos])
  useEffect(() => {
    fetch('/api/todo-statuses').then(r => r.ok ? r.json() : null).then(d => { if (d) setStatuses(d.statuses ?? []) })
  }, [])

  async function confirmDelete() {
    if (!deleteTarget) return
    const r = await fetch(`/api/todos/${deleteTarget.id}`, { method: 'DELETE' })
    setDeleteTarget(null)
    if (r.ok) loadTodos()
  }
  async function restore(id: string) {
    await fetch(`/api/todos/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ restore: true }) })
    loadTodos()
  }

  const activeTeam = myTeams.find(t => t.id === space) ?? null
  const isTeamSpace = space !== 'personal'
  const sq = search.toLowerCase().trim()

  const filteredTodos = todos.filter(t => {
    if (sq && !t.title.toLowerCase().includes(sq) && !(t.detail ?? '').toLowerCase().includes(sq)) return false
    if (statusFilter && t.status !== statusFilter) return false
    if (priorityFilter && t.priority !== priorityFilter) return false
    if (mineOnly && !t.mine && !t.assignedToMe) return false
    if (hideDone && t.is_done) return false
    return true
  })

  return (
    <div className="max-w-5xl mx-auto">
      {deleteTarget && <DeleteConfirmModal target={deleteTarget} onConfirm={confirmDelete} onCancel={() => setDeleteTarget(null)} />}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-navy-700">To-dos</h1>
        <p className="text-sm text-gray-500 mt-0.5">Tasks and routines — personal and team.</p>
      </div>

      {/* Space switcher */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <SpaceBtn active={space === 'personal'} onClick={() => setSpace('personal')}><Lock className="w-3.5 h-3.5" /> Personal</SpaceBtn>
        {myTeams.map(t => (
          <SpaceBtn key={t.id} active={space === t.id} onClick={() => setSpace(t.id)}><Globe className="w-3.5 h-3.5" /> {t.name}</SpaceBtn>
        ))}
      </div>
      <p className="text-xs text-gray-400 mb-4">
        {isTeamSpace ? `Team space — everyone on ${activeTeam?.name ?? 'this team'} can see and edit.` : 'Personal space — only you can see these unless you assign them.'}
      </p>

      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search to-dos…"
          className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
        {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>}
      </div>

      {/* View toggle + filters */}
      <div className="space-y-2 mb-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {([
            { key: 'all', label: 'All' }, { key: 'daily', label: '🌅 Daily' },
            { key: 'weekly', label: '📅 Weekly' }, { key: 'tasks', label: '☑ Tasks' },
          ] as const).map(v => (
            <button key={v.key} onClick={() => setTodoView(v.key)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${todoView === v.key ? 'bg-navy-700 text-white border-navy-700' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
              {v.label}
            </button>
          ))}
          <div className="flex-1" />
          {(search || statusFilter || priorityFilter || mineOnly || hideDone) && (
            <span className="text-xs text-gray-400">{filteredTodos.length} of {todos.length}</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SlidersHorizontal className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className={`text-xs border rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-teal-500 ${statusFilter ? 'border-teal-300 bg-teal-50 text-teal-800' : 'border-gray-200 text-gray-600 bg-white'}`}>
            <option value="">Any status</option>
            {statuses.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
          <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}
            className={`text-xs border rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-teal-500 ${priorityFilter ? 'border-teal-300 bg-teal-50 text-teal-800' : 'border-gray-200 text-gray-600 bg-white'}`}>
            <option value="">Any priority</option>
            <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
          </select>
          <button onClick={() => setMineOnly(v => !v)}
            className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${mineOnly ? 'border-teal-300 bg-teal-50 text-teal-800' : 'border-gray-200 text-gray-600 bg-white hover:border-gray-300'}`}>
            Mine / assigned
          </button>
          <button onClick={() => setHideDone(v => !v)}
            className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${hideDone ? 'border-teal-300 bg-teal-50 text-teal-800' : 'border-gray-200 text-gray-600 bg-white hover:border-gray-300'}`}>
            Hide done
          </button>
          {(statusFilter || priorityFilter || mineOnly || hideDone) && (
            <button onClick={() => { setStatusFilter(''); setPriorityFilter(''); setMineOnly(false); setHideDone(false) }}
              className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-0.5"><X className="w-3 h-3" /> Clear</button>
          )}
        </div>
      </div>

      <TodosSection
        todos={filteredTodos} trashTodos={trashTodos}
        people={people} teams={myTeams} statuses={statuses}
        currentTeamId={isTeamSpace ? space : null}
        currentUserId={currentUserId}
        todoView={todoView}
        onRefresh={loadTodos}
        loading={loading}
        onDelete={t => setDeleteTarget({ type: 'todo', id: t.id, title: t.title, mine: t.mine, ownerName: t.ownerName, canDelete: t.mine || !!t.team_id })}
        onRestore={restore}
      />
    </div>
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
        className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border transition-colors"
        style={{ backgroundColor: (currentStatus?.color ?? '#94a3b8') + '20', color: currentStatus?.color ?? '#94a3b8', borderColor: (currentStatus?.color ?? '#94a3b8') + '40' }}>
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: currentStatus?.color ?? '#94a3b8' }} />
        {current}
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          <div className="absolute z-[9999] bg-white border border-gray-200 rounded-xl shadow-xl w-44 py-1.5 max-h-60 overflow-y-auto" style={{ top: pos.top, left: pos.left }}>
            {statuses.map(s => (
              <button key={s.id} onClick={() => { onChange(s); setOpen(false) }}
                className="w-full text-left flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-gray-50 transition-colors">
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

// ─── Add-task form ────────────────────────────────────────────────────────────

function AddTaskForm({ statuses, people, teams, currentTeamId, defaultRecurrence, onRefresh }: {
  statuses: TodoStatus[]; people: Person[]; teams: Team[]
  currentTeamId: string | null; defaultRecurrence?: 'none' | 'daily' | 'weekly'
  onRefresh: () => void
}) {
  const [mode, setMode] = useState<'ai' | 'manual'>('ai')
  const [aiInput, setAiInput] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  const defaultStatus = statuses.find(s => s.is_default)?.name ?? (statuses[0]?.name ?? 'To Do')
  const [mTitle, setMTitle] = useState('')
  const [mDetail, setMDetail] = useState('')
  const [mStatus, setMStatus] = useState(defaultStatus)
  const [mPriority, setMPriority] = useState<'low' | 'medium' | 'high'>('medium')
  const [mDueDate, setMDueDate] = useState('')
  const [mAssigneeId, setMAssigneeId] = useState('')
  const [mTeamId, setMTeamId] = useState(currentTeamId ?? '')
  const [mRecurrence, setMRecurrence] = useState<'none' | 'daily' | 'weekly'>(defaultRecurrence ?? 'none')
  const [mDayOfWeek, setMDayOfWeek] = useState(1)
  const [mWeekdaysOnly, setMWeekdaysOnly] = useState(false)

  async function addViaAI() {
    const text = aiInput.trim(); if (!text || adding) return
    setAdding(true); setError('')
    try {
      const r = await fetch('/api/todos/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
      const d = await r.json()
      if (!r.ok) { setError(d.error ?? 'Could not parse that.'); return }
      const draft = d.draft
      const c = await fetch('/api/todos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: draft.title, detail: draft.detail, dueDate: draft.dueDate,
          priority: draft.priority, assigneeId: draft.assigneeId, teamId: currentTeamId,
          recurrence: draft.recurrence ?? defaultRecurrence ?? 'none',
          recurrenceDayOfWeek: draft.recurrenceDayOfWeek ?? null,
          recurrenceWeekdaysOnly: draft.recurrenceWeekdaysOnly ?? false,
          statusName: draft.statusName,
        }),
      })
      if (c.ok) { setAiInput(''); onRefresh() } else setError((await c.json()).error ?? 'Could not save.')
    } catch { setError('Network error.') } finally { setAdding(false) }
  }

  async function addManual() {
    if (!mTitle.trim() || adding) return
    setAdding(true); setError('')
    try {
      const selectedStatus = statuses.find(s => s.name === mStatus)
      const c = await fetch('/api/todos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: mTitle.trim(), detail: mDetail || null, dueDate: mDueDate || null, priority: mPriority,
          assigneeId: mAssigneeId || null, teamId: mTeamId || null, recurrence: mRecurrence,
          recurrenceDayOfWeek: mRecurrence === 'weekly' ? mDayOfWeek : null,
          recurrenceWeekdaysOnly: mRecurrence === 'daily' ? mWeekdaysOnly : false,
          statusName: mStatus, isDone: selectedStatus?.is_done ?? false,
        }),
      })
      if (c.ok) {
        setMTitle(''); setMDetail(''); setMDueDate(''); setMAssigneeId('')
        setMPriority('medium'); setMStatus(defaultStatus)
        onRefresh()
      } else setError((await c.json()).error ?? 'Could not save.')
    } catch { setError('Network error.') } finally { setAdding(false) }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="inline-flex rounded-lg border border-gray-200 p-0.5 text-xs">
          <button onClick={() => setMode('ai')} className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-medium transition-colors ${mode === 'ai' ? 'bg-teal-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}><Sparkles className="w-3 h-3" /> AI</button>
          <button onClick={() => setMode('manual')} className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-medium transition-colors ${mode === 'manual' ? 'bg-teal-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}><Plus className="w-3 h-3" /> Manual</button>
        </div>
        <p className="text-[11px] text-gray-400">{mode === 'ai' ? 'Describe in plain English — AI fills date, priority, assignee & status.' : 'Fill every field yourself.'}</p>
      </div>

      {mode === 'ai' ? (
        <div className="flex items-end gap-3">
          <textarea value={aiInput} onChange={e => setAiInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addViaAI() } }}
            rows={2} placeholder={`e.g. "send checkout reminder email on Monday — high priority"`}
            className="flex-1 resize-none text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500" />
          <button onClick={addViaAI} disabled={!aiInput.trim() || adding}
            className="h-10 px-4 flex-shrink-0 rounded-xl bg-teal-600 text-white text-sm font-medium flex items-center gap-2 hover:bg-teal-700 disabled:opacity-40">
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Add
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <input value={mTitle} onChange={e => setMTitle(e.target.value)} placeholder="Task title *" className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500" />
          <textarea value={mDetail} onChange={e => setMDetail(e.target.value)} rows={2} placeholder="Details (optional)" className="w-full resize-none text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <label className="text-[11px] text-gray-500">Status
              <select value={mStatus} onChange={e => setMStatus(e.target.value)} className="w-full mt-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
                {statuses.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </label>
            <label className="text-[11px] text-gray-500">Priority
              <select value={mPriority} onChange={e => setMPriority(e.target.value as 'low' | 'medium' | 'high')} className="w-full mt-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
              </select>
            </label>
            <label className="text-[11px] text-gray-500">Recurrence
              <select value={mRecurrence} onChange={e => setMRecurrence(e.target.value as 'none' | 'daily' | 'weekly')} className="w-full mt-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
                <option value="none">One-off</option><option value="daily">Daily</option><option value="weekly">Weekly</option>
              </select>
            </label>
            {mRecurrence === 'weekly' && (
              <label className="text-[11px] text-gray-500 sm:col-span-2">Repeats on
                <div className="flex gap-1 mt-1 flex-wrap">
                  {[['Mon',1],['Tue',2],['Wed',3],['Thu',4],['Fri',5],['Sat',6],['Sun',0]].map(([label, val]) => (
                    <button key={val} type="button" onClick={() => setMDayOfWeek(val as number)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${mDayOfWeek === val ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-gray-600 border-gray-200 hover:border-teal-300'}`}>{label}</button>
                  ))}
                </div>
              </label>
            )}
            {mRecurrence === 'daily' && (
              <label className="text-[11px] text-gray-500 flex items-center gap-2 cursor-pointer sm:col-span-2 mt-1">
                <input type="checkbox" checked={mWeekdaysOnly} onChange={e => setMWeekdaysOnly(e.target.checked)} className="rounded text-teal-500" /> Weekdays only (Mon–Fri)
              </label>
            )}
            <label className="text-[11px] text-gray-500">Due date
              <input type="date" value={mDueDate} onChange={e => setMDueDate(e.target.value)} className="w-full mt-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white" />
            </label>
            <label className="text-[11px] text-gray-500">Assign to
              <select value={mAssigneeId} onChange={e => setMAssigneeId(e.target.value)} className="w-full mt-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
                <option value="">Nobody</option>{people.map(p => <option key={p.id} value={p.id}>{p.full_name ?? 'User'}</option>)}
              </select>
            </label>
            {teams.length > 0 && (
              <label className="text-[11px] text-gray-500">Team
                <select value={mTeamId} onChange={e => setMTeamId(e.target.value)} className="w-full mt-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
                  <option value="">Personal</option>{teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
            )}
          </div>
          <div className="flex justify-end">
            <button onClick={addManual} disabled={!mTitle.trim() || adding} className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 disabled:opacity-40">
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add task
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

// ─── Todos section ────────────────────────────────────────────────────────────

function TodosSection({ todos, trashTodos, people, teams, statuses, currentTeamId, todoView, onRefresh, loading, onDelete, onRestore }: {
  todos: Todo[]; trashTodos: Todo[]; people: Person[]; teams: Team[]; statuses: TodoStatus[]
  currentTeamId: string | null; currentUserId: string; todoView: TodoView
  onRefresh: () => void; loading: boolean
  onDelete: (t: Todo) => void; onRestore: (id: string) => void
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showTrash, setShowTrash] = useState(false)

  async function patch(id: string, body: Record<string, unknown>) {
    await fetch(`/api/todos/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); onRefresh()
  }
  async function changeStatus(id: string, s: TodoStatus) { await patch(id, { status: s.name, isDone: s.is_done }) }

  const daily   = todos.filter(t => t.recurrence === 'daily'  && !t.recurrence_parent_id)
  const weekly  = todos.filter(t => t.recurrence === 'weekly' && !t.recurrence_parent_id)
  const regular = todos.filter(t => t.recurrence === 'none')
  const allEmpty = daily.length === 0 && weekly.length === 0 && regular.length === 0

  const setExpand = (id: string) => setExpanded(prev => prev === id ? null : id)
  const rowProps = (t: Todo) => ({
    people, teams, statuses,
    expanded: expanded === t.id,
    onExpand: () => setExpand(t.id),
    onStatusChange: (s: TodoStatus) => changeStatus(t.id, s),
    onPatch: (b: Record<string, unknown>) => patch(t.id, b),
    onDelete: () => onDelete(t),
  })

  const showDaily  = todoView === 'all' || todoView === 'daily'
  const showWeekly = todoView === 'all' || todoView === 'weekly'
  const showTasks  = todoView === 'all' || todoView === 'tasks'

  return (
    <div className="space-y-6">
      {loading && <SpinnerRow />}

      {!loading && showDaily && (
        <div className="space-y-3">
          <SectionHeader emoji="🌅" label="Daily tasks" note="Repeats every day" />
          <AddTaskForm statuses={statuses} people={people} teams={teams} currentTeamId={currentTeamId} defaultRecurrence="daily" onRefresh={onRefresh} />
          {daily.length === 0 ? <p className="text-xs text-gray-400 italic pl-1">No recurring daily tasks yet.</p>
            : <div className="space-y-2">{daily.map(t => <TodoRow key={t.id} t={t} {...rowProps(t)} />)}</div>}
        </div>
      )}

      {!loading && showWeekly && (
        <div className="space-y-3">
          <SectionHeader emoji="📅" label="Weekly tasks" note="Repeats every Monday" />
          <AddTaskForm statuses={statuses} people={people} teams={teams} currentTeamId={currentTeamId} defaultRecurrence="weekly" onRefresh={onRefresh} />
          {weekly.length === 0 ? <p className="text-xs text-gray-400 italic pl-1">No recurring weekly tasks yet.</p>
            : <div className="space-y-2">{weekly.map(t => <TodoRow key={t.id} t={t} {...rowProps(t)} />)}</div>}
        </div>
      )}

      {!loading && showTasks && (
        <div className="space-y-3">
          <SectionHeader label="Tasks" />
          <AddTaskForm statuses={statuses} people={people} teams={teams} currentTeamId={currentTeamId} defaultRecurrence="none" onRefresh={onRefresh} />
          {regular.length === 0 ? <p className="text-xs text-gray-400 italic pl-1">No tasks yet.</p>
            : <>
                <div className="space-y-2">{regular.filter(t => !t.is_done).map(t => <TodoRow key={t.id} t={t} {...rowProps(t)} />)}</div>
                {regular.some(t => t.is_done) && (
                  <div>
                    <p className="text-[11px] text-gray-400 uppercase tracking-wide font-semibold mb-1.5 mt-3">Completed</p>
                    <div className="space-y-2">{regular.filter(t => t.is_done).map(t => <TodoRow key={t.id} t={t} {...rowProps(t)} />)}</div>
                  </div>
                )}
              </>}
        </div>
      )}

      {allEmpty && !loading && <Empty label="No to-dos yet. Add one in any section above." />}
      <TrashSection show={showTrash} onToggle={() => setShowTrash(s => !s)} trashTodos={trashTodos} onRestoreTodo={onRestore} />
    </div>
  )
}

function TodoRow({ t, people, teams, statuses, expanded, onExpand, onStatusChange, onPatch, onDelete }: {
  t: Todo; people: Person[]; teams: Team[]; statuses: TodoStatus[]; expanded: boolean
  onExpand: () => void; onStatusChange: (s: TodoStatus) => void
  onPatch: (b: Record<string, unknown>) => void; onDelete: () => void
}) {
  const isDone = t.is_done
  const isOverdue = t.due_date && !isDone && new Date(t.due_date) < new Date()
  return (
    <div className="bg-white border border-gray-200 rounded-2xl group">
      <div className="flex items-start gap-3 p-4">
        <div className="mt-0.5 flex-shrink-0"><StatusPicker current={t.status} statuses={statuses} onChange={onStatusChange} /></div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`text-sm font-medium ${isDone ? 'text-gray-400 line-through' : 'text-navy-700'}`}>{t.title}</p>
            {t.is_carry && !isDone && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-600 flex-shrink-0">DUE</span>}
            {t.recurrence !== 'none' && (
              <span className="text-[10px] text-gray-400 border border-gray-200 rounded px-1.5 py-0.5 flex-shrink-0">
                {t.recurrence === 'daily' ? `↻ ${t.recurrence_weekdays_only ? 'weekdays' : 'daily'}` : `↻ ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][t.recurrence_day_of_week ?? 1]}`}
              </span>
            )}
          </div>
          {t.detail && !isDone && <p className="text-xs text-gray-500 mt-0.5">{t.detail}</p>}
          <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-gray-400">
            <span className={`font-medium ${PRIORITY_COLOR[t.priority]}`}>{t.priority}</span>
            {t.due_date && <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-500 font-medium' : ''}`}><Calendar className="w-3 h-3" />{t.due_date}{isOverdue ? ' — overdue' : ''}</span>}
            {t.assigneeName && <span className="flex items-center gap-1 text-teal-600">{t.assignedToMe ? '→ You' : `→ ${t.assigneeName}`}</span>}
            {t.teamName && <span className="flex items-center gap-1"><Users className="w-3 h-3" />{t.teamName}</span>}
            {!t.mine && t.ownerName && <span className="flex items-center gap-1">by {t.ownerName}</span>}
          </div>
        </div>
        <button onClick={() => { if (!expanded) onExpand() }} className="p-1.5 rounded-lg transition-colors flex-shrink-0 text-gray-200 hover:text-gray-500 opacity-0 group-hover:opacity-100" title="Comments"><MessageSquare className="w-4 h-4" /></button>
        <button onClick={onDelete} title="Delete" className="p-1.5 rounded-lg text-gray-200 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
        <button onClick={onExpand} className="p-1.5 text-gray-300 hover:text-gray-600 flex-shrink-0"><ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} /></button>
      </div>
      {expanded && (
        <div className="border-t border-gray-100 px-4 pb-4 bg-slate-50 rounded-b-2xl">
          <div className="grid sm:grid-cols-2 gap-3 pt-4">
            <label className="block text-xs text-gray-500">Priority<select value={t.priority} onChange={e => onPatch({ priority: e.target.value })} className="w-full mt-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
            <label className="block text-xs text-gray-500">Due date<input type="date" value={t.due_date ?? ''} onChange={e => onPatch({ dueDate: e.target.value || null })} className="w-full mt-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white" /></label>
            <label className="block text-xs text-gray-500">Assign to<select value={t.assignee_id ?? ''} onChange={e => onPatch({ assigneeId: e.target.value || null })} className="w-full mt-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white"><option value="">Nobody</option>{people.map(p => <option key={p.id} value={p.id}>{p.full_name ?? 'User'}</option>)}</select></label>
            <label className="block text-xs text-gray-500">Team<select value={t.team_id ?? ''} onChange={e => onPatch({ teamId: e.target.value || null })} className="w-full mt-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white"><option value="">Personal</option>{teams.map(tm => <option key={tm.id} value={tm.id}>{tm.name}</option>)}</select></label>
          </div>
          <CommentsPanel todoId={t.id} people={people} />
        </div>
      )}
    </div>
  )
}
