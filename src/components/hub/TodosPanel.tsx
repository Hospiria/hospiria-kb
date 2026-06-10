'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Sparkles, Loader2, Check, Trash2, ChevronDown, Calendar, User, Users, ExternalLink, Pencil } from 'lucide-react'
import Link from 'next/link'

type TodoView = 'all' | 'daily' | 'weekly' | 'tasks'

interface Todo {
  id: string; owner_id: string; assignee_id: string | null; team_id: string | null
  title: string; detail: string | null; due_date: string | null
  priority: 'low' | 'medium' | 'high'; status: string; is_done: boolean
  is_carry: boolean; recurrence: string; recurrence_parent_id: string | null
  recurrence_day_of_week: number | null; recurrence_weekdays_only: boolean
  mine: boolean; assignedToMe: boolean; ownerName: string | null; assigneeName: string | null; teamName: string | null
}
interface TodoStatus { id: string; name: string; color: string; is_done: boolean; is_default: boolean }
interface Person { id: string; full_name: string | null }
interface Team  { id: string; name: string }

const PRIORITY_DOT: Record<string, string> = { high: 'bg-red-500', medium: 'bg-amber-400', low: 'bg-gray-300' }
const VIEW_LABELS: { key: TodoView; label: string }[] = [
  { key: 'all',    label: 'All'     },
  { key: 'daily',  label: '🌅 Daily' },
  { key: 'weekly', label: '📅 Weekly'},
  { key: 'tasks',  label: '☑ Tasks' },
]

export function TodosPanel({ space, teams }: { space: string; teams: Team[] }) {
  const [todos, setTodos] = useState<Todo[]>([])
  const [statuses, setStatuses] = useState<TodoStatus[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [addMode, setAddMode] = useState<'ai' | 'manual'>('ai')

  // Manual form
  const [mTitle, setMTitle]       = useState('')
  const [mPriority, setMPriority] = useState<'low'|'medium'|'high'>('medium')
  const [mStatus, setMStatus]     = useState('')
  const [mDueDate, setMDueDate]   = useState('')
  const [mAssignee, setMAssignee] = useState('')
  const [mRecur, setMRecur]       = useState<'none'|'daily'|'weekly'>('none')
  const [mDow, setMDow]           = useState(1)          // day-of-week for weekly
  const [mWeekdays, setMWeekdays] = useState(false)      // weekdays-only for daily

  // View + filters
  const [view, setView]             = useState<TodoView>('all')
  const [mineOnly, setMineOnly]     = useState(false)
  const [hideDone, setHideDone]     = useState(false)
  const [statusFilter, setStatusFilter]     = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [search, setSearch]         = useState('')

  const qs = space === 'personal' ? '?space=personal' : `?teamId=${space}`

  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await fetch(`/api/todos${qs}`); if (r.ok) setTodos((await r.json()).todos ?? []) } finally { setLoading(false) }
  }, [qs])

  useEffect(() => { load(); setView('all'); setMineOnly(false); setHideDone(false); setStatusFilter(''); setPriorityFilter(''); setSearch('') }, [load])
  useEffect(() => {
    fetch('/api/directory').then(r => r.ok ? r.json() : null).then(d => { if (d) setPeople(d.people ?? []) })
    fetch('/api/todo-statuses').then(r => r.ok ? r.json() : null).then(d => { if (d) setStatuses(d.statuses ?? []) })
  }, [])

  const defaultStatus = statuses.find(s => s.is_default) ?? statuses[0] ?? null

  async function add() {
    const text = input.trim(); if (!text || adding) return
    setAdding(true); setError('')
    try {
      const r = await fetch('/api/todos/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
      const d = await r.json()
      if (!r.ok) { setError(d.error ?? 'Could not parse.'); return }
      const draft = d.draft
      const teamId = space === 'personal' ? null : space
      const c = await fetch('/api/todos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: draft.title, detail: draft.detail, dueDate: draft.dueDate,
          priority: draft.priority, assigneeId: draft.assigneeId,
          recurrence: draft.recurrence ?? 'none',
          recurrenceDayOfWeek: draft.recurrenceDayOfWeek ?? null,
          recurrenceWeekdaysOnly: draft.recurrenceWeekdaysOnly ?? false,
          statusName: draft.statusName ?? defaultStatus?.name,
          teamId,
        }),
      })
      if (c.ok) { setInput(''); load() } else setError((await c.json()).error ?? 'Could not save.')
    } catch { setError('Network error.') } finally { setAdding(false) }
  }

  async function addManual() {
    if (!mTitle.trim() || adding) return
    setAdding(true); setError('')
    try {
      const teamId = space === 'personal' ? null : space
      const selectedStatus = statuses.find(s => s.name === (mStatus || defaultStatus?.name))
      const c = await fetch('/api/todos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: mTitle.trim(),
          priority: mPriority,
          dueDate: mDueDate || null,
          assigneeId: mAssignee || null,
          recurrence: mRecur,
          recurrenceDayOfWeek: mRecur === 'weekly' ? mDow : null,
          recurrenceWeekdaysOnly: mRecur === 'daily' ? mWeekdays : false,
          statusName: mStatus || defaultStatus?.name,
          isDone: selectedStatus?.is_done ?? false,
          teamId,
        }),
      })
      if (c.ok) {
        setMTitle(''); setMPriority('medium'); setMStatus(''); setMDueDate('')
        setMAssignee(''); setMRecur('none'); setMDow(1); setMWeekdays(false)
        load()
      } else setError((await c.json()).error ?? 'Could not save.')
    } catch { setError('Network error.') } finally { setAdding(false) }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    await fetch(`/api/todos/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); load()
  }

  async function toggle(t: Todo) {
    const nowDone = !t.is_done
    const newStatus = nowDone
      ? (statuses.find(s => s.is_done)?.name ?? 'Completed')
      : (statuses.find(s => !s.is_done)?.name ?? defaultStatus?.name ?? 'To Do')
    await patch(t.id, { status: newStatus, isDone: nowDone })
  }

  async function del(id: string) { await fetch(`/api/todos/${id}`, { method: 'DELETE' }); load() }

  // Apply filters
  const sq = search.toLowerCase()
  let filtered = todos.filter(t => {
    if (sq && !t.title.toLowerCase().includes(sq)) return false
    if (mineOnly && !t.mine && !t.assignedToMe) return false
    if (hideDone && t.is_done) return false
    if (statusFilter && t.status !== statusFilter) return false
    if (priorityFilter && t.priority !== priorityFilter) return false
    return true
  })

  // Split by view
  const daily   = filtered.filter(t => t.recurrence === 'daily'  && !t.recurrence_parent_id)
  const weekly  = filtered.filter(t => t.recurrence === 'weekly' && !t.recurrence_parent_id)
  const regular = filtered.filter(t => t.recurrence === 'none')

  const showDaily  = view === 'all' || view === 'daily'
  const showWeekly = view === 'all' || view === 'weekly'
  const showTasks  = view === 'all' || view === 'tasks'

  const activeCount = filtered.filter(t => !t.is_done).length
  const doneCount   = filtered.filter(t => t.is_done).length

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-3 pt-2 pb-1.5 border-b border-gray-100 space-y-1.5 flex-shrink-0 bg-white">
        {/* Search */}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search to-dos…"
          className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500" />

        {/* View toggle */}
        <div className="flex gap-1 overflow-x-auto pb-0.5">
          {VIEW_LABELS.map(v => (
            <button key={v.key} onClick={() => setView(v.key)}
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap transition-colors flex-shrink-0 ${view === v.key ? 'bg-navy-700 text-white border-navy-700' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>
              {v.label}
            </button>
          ))}
        </div>

        {/* Filter toggles + dropdowns */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Status dropdown */}
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className={`text-[11px] border rounded-lg px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-teal-500 ${statusFilter ? 'border-teal-300 bg-teal-50 text-teal-800' : 'border-gray-200 text-gray-500 bg-white'}`}>
            <option value="">Any status</option>
            {statuses.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>

          {/* Priority dropdown */}
          <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}
            className={`text-[11px] border rounded-lg px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-teal-500 ${priorityFilter ? 'border-teal-300 bg-teal-50 text-teal-800' : 'border-gray-200 text-gray-500 bg-white'}`}>
            <option value="">Any priority</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          {/* Toggle buttons */}
          <button onClick={() => setMineOnly(v => !v)}
            className={`px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${mineOnly ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>
            Mine
          </button>
          <button onClick={() => setHideDone(v => !v)}
            className={`px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${hideDone ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>
            Hide done
          </button>

          {/* Clear active filters */}
          {(statusFilter || priorityFilter) && (
            <button onClick={() => { setStatusFilter(''); setPriorityFilter('') }}
              className="text-[11px] text-gray-400 hover:text-gray-600">✕ Clear</button>
          )}

          <span className="text-[11px] text-gray-400 ml-auto">
            {activeCount} open{doneCount > 0 && `, ${doneCount} done`}
          </span>
        </div>
      </div>

      {/* Add bar — AI or Manual */}
      <div className="px-3 pt-2 pb-2 border-b border-gray-100 flex-shrink-0 space-y-2">
        {/* Mode toggle */}
        <div className="flex items-center gap-1.5">
          <div className="inline-flex rounded-lg border border-gray-200 p-0.5">
            <button onClick={() => setAddMode('ai')}
              className={`flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-medium transition-colors ${addMode === 'ai' ? 'bg-teal-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
              <Sparkles className="w-3 h-3" /> AI
            </button>
            <button onClick={() => setAddMode('manual')}
              className={`flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-medium transition-colors ${addMode === 'manual' ? 'bg-teal-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
              + Manual
            </button>
          </div>
          <span className="text-[10px] text-gray-400">
            {addMode === 'ai' ? 'AI fills date, priority, assignee' : 'Set every field yourself'}
          </span>
        </div>

        {addMode === 'ai' ? (
          <div className="flex items-end gap-2">
            <textarea value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); add() } }}
              rows={1} placeholder="e.g. send checkout reminder on Friday — high"
              className="flex-1 resize-none max-h-20 text-xs border border-gray-200 rounded-xl px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-teal-500" />
            <button onClick={add} disabled={!input.trim() || adding}
              className="h-8 px-3 flex-shrink-0 rounded-xl bg-teal-600 text-white flex items-center gap-1 text-xs font-medium hover:bg-teal-700 disabled:opacity-40">
              {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Add
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <input value={mTitle} onChange={e => setMTitle(e.target.value)}
              placeholder="Task title *"
              className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-teal-500" />
            <div className="grid grid-cols-3 gap-1.5">
              <label className="text-[10px] text-gray-500">Status
                <select value={mStatus} onChange={e => setMStatus(e.target.value)}
                  className="w-full mt-0.5 text-[11px] border border-gray-200 rounded px-1.5 py-1 bg-white">
                  {statuses.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
              </label>
              <label className="text-[10px] text-gray-500">Priority
                <select value={mPriority} onChange={e => setMPriority(e.target.value as 'low'|'medium'|'high')}
                  className="w-full mt-0.5 text-[11px] border border-gray-200 rounded px-1.5 py-1 bg-white">
                  <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                </select>
              </label>
              <label className="text-[10px] text-gray-500">Recur
                <select value={mRecur} onChange={e => setMRecur(e.target.value as 'none'|'daily'|'weekly')}
                  className="w-full mt-0.5 text-[11px] border border-gray-200 rounded px-1.5 py-1 bg-white">
                  <option value="none">Once</option><option value="daily">Daily</option><option value="weekly">Weekly</option>
                </select>
              </label>
            </div>
            {/* Day picker for weekly */}
            {mRecur === 'weekly' && (
              <div className="flex gap-1">
                {[['M',1],['T',2],['W',3],['Th',4],['F',5],['Sa',6],['Su',0]].map(([l,v]) => (
                  <button key={v} type="button" onClick={() => setMDow(v as number)}
                    className={`flex-1 py-0.5 rounded text-[10px] font-medium border ${mDow === v ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-gray-500 border-gray-200'}`}>
                    {l}
                  </button>
                ))}
              </div>
            )}
            {/* Weekdays only for daily */}
            {mRecur === 'daily' && (
              <label className="flex items-center gap-1.5 text-[10px] text-gray-500 cursor-pointer">
                <input type="checkbox" checked={mWeekdays} onChange={e => setMWeekdays(e.target.checked)} className="rounded text-teal-500" />
                Weekdays only (Mon–Fri)
              </label>
            )}
            <div className="grid grid-cols-2 gap-1.5">
              <label className="text-[10px] text-gray-500">Due date
                <input type="date" value={mDueDate} onChange={e => setMDueDate(e.target.value)}
                  className="w-full mt-0.5 text-[11px] border border-gray-200 rounded px-1.5 py-1 bg-white" />
              </label>
              <label className="text-[10px] text-gray-500">Assign to
                <select value={mAssignee} onChange={e => setMAssignee(e.target.value)}
                  className="w-full mt-0.5 text-[11px] border border-gray-200 rounded px-1.5 py-1 bg-white">
                  <option value="">Nobody</option>
                  {people.map(p => <option key={p.id} value={p.id}>{p.full_name ?? 'User'}</option>)}
                </select>
              </label>
            </div>
            <button onClick={addManual} disabled={!mTitle.trim() || adding}
              className="w-full py-1.5 rounded-lg bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 disabled:opacity-40 flex items-center justify-center gap-1.5">
              {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Add task
            </button>
          </div>
        )}
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>

      {/* Todo list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-50">
        {loading ? <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div> : (
          <>
            {showDaily && daily.length > 0 && (
              <Section label="🌅 Daily">
                {daily.map(t => <TodoCard key={t.id} t={t} expanded={expanded === t.id}
                  onExpand={() => setExpanded(expanded === t.id ? null : t.id)}
                  onToggle={() => toggle(t)} onDelete={() => del(t.id)} people={people} teams={teams}
                  onPatch={b => patch(t.id, b)} />)}
              </Section>
            )}
            {showWeekly && weekly.length > 0 && (
              <Section label="📅 Weekly">
                {weekly.map(t => <TodoCard key={t.id} t={t} expanded={expanded === t.id}
                  onExpand={() => setExpanded(expanded === t.id ? null : t.id)}
                  onToggle={() => toggle(t)} onDelete={() => del(t.id)} people={people} teams={teams}
                  onPatch={b => patch(t.id, b)} />)}
              </Section>
            )}
            {showTasks && (
              <Section label={view !== 'all' ? undefined : 'Tasks'}>
                {regular.filter(t => !t.is_done).map(t => (
                  <TodoCard key={t.id} t={t} expanded={expanded === t.id}
                    onExpand={() => setExpanded(expanded === t.id ? null : t.id)}
                    onToggle={() => toggle(t)} onDelete={() => del(t.id)} people={people} teams={teams}
                    onPatch={b => patch(t.id, b)} />
                ))}
                {regular.some(t => t.is_done) && !hideDone && (
                  <div className="mt-1">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold px-1 mb-1">Done</p>
                    {regular.filter(t => t.is_done).map(t => (
                      <TodoCard key={t.id} t={t} expanded={expanded === t.id}
                        onExpand={() => setExpanded(expanded === t.id ? null : t.id)}
                        onToggle={() => toggle(t)} onDelete={() => del(t.id)} people={people} teams={teams}
                        onPatch={b => patch(t.id, b)} />
                    ))}
                  </div>
                )}
              </Section>
            )}
            {filtered.length === 0 && (
              <p className="text-center text-xs text-gray-400 py-8">
                {search || mineOnly || hideDone ? 'No tasks match.' : 'No to-dos yet. Add one above.'}
              </p>
            )}
            <Link href="/notes?tab=todos" className="flex items-center justify-center gap-1 text-xs text-gray-400 hover:text-teal-600 py-1">
              <ExternalLink className="w-3 h-3" /> Open full To-dos
            </Link>
          </>
        )}
      </div>
    </div>
  )
}

function Section({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      {label && <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold px-1">{label}</p>}
      {children}
    </div>
  )
}

function TodoCard({ t, expanded, onExpand, onToggle, onDelete, people, teams, onPatch }: {
  t: Todo; expanded: boolean
  onExpand: () => void; onToggle: () => void; onDelete: () => void
  people: Person[]; teams: Team[]; onPatch: (b: Record<string, unknown>) => void
}) {
  const isDone = t.is_done
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleVal, setTitleVal] = useState(t.title)
  const [detailVal, setDetailVal] = useState(t.detail ?? '')
  const titleRef = useRef<HTMLInputElement>(null)

  // Keep local state in sync when parent refreshes
  useEffect(() => { setTitleVal(t.title) }, [t.title])
  useEffect(() => { setDetailVal(t.detail ?? '') }, [t.detail])

  function startEditTitle() {
    if (isDone) return
    setEditingTitle(true)
    setTimeout(() => titleRef.current?.select(), 0)
  }

  function commitTitle() {
    setEditingTitle(false)
    const trimmed = titleVal.trim()
    if (!trimmed) { setTitleVal(t.title); return }
    if (trimmed !== t.title) onPatch({ title: trimmed })
  }

  function commitDetail() {
    const trimmed = detailVal.trim()
    if (trimmed !== (t.detail ?? '')) onPatch({ detail: trimmed || null })
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl">
      <div className="flex items-start gap-2.5 p-3">
        <button onClick={onToggle}
          className={`mt-0.5 w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center ${isDone ? 'bg-teal-500 border-teal-500' : 'border-gray-300 hover:border-teal-400'}`}>
          {isDone && <Check className="w-3 h-3 text-white" />}
        </button>
        <div className="flex-1 min-w-0">
          {editingTitle ? (
            <input
              ref={titleRef}
              value={titleVal}
              onChange={e => setTitleVal(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); commitTitle() }
                if (e.key === 'Escape') { setTitleVal(t.title); setEditingTitle(false) }
              }}
              className="w-full text-sm text-navy-700 border border-teal-400 rounded-lg px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-teal-400"
            />
          ) : (
            <div className="flex items-start gap-1 flex-wrap group">
              <p className={`text-sm ${isDone ? 'text-gray-400 line-through' : 'text-navy-700'}`}>{t.title}</p>
              {t.is_carry && !isDone && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-600 flex-shrink-0">DUE</span>
              )}
              {!isDone && (
                <button onClick={startEditTitle} className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-gray-300 hover:text-teal-500 flex-shrink-0">
                  <Pencil className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 mt-1 text-[11px] text-gray-400">
            <span className="flex items-center gap-1"><span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[t.priority]}`} />{t.priority}</span>
            {t.due_date && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{t.due_date}</span>}
            {t.assigneeName && <span className="flex items-center gap-1 text-teal-600"><User className="w-3 h-3" />{t.assignedToMe ? 'You' : t.assigneeName}</span>}
            {t.teamName && <span className="flex items-center gap-1"><Users className="w-3 h-3" />{t.teamName}</span>}
            {!t.mine && t.ownerName && <span className="text-gray-400">by {t.ownerName}</span>}
            {t.status && <span className="text-gray-400">{t.status}</span>}
          </div>
        </div>
        <button onClick={onDelete} className="p-1 text-gray-200 hover:text-red-500 flex-shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
        <button onClick={onExpand} className="p-1 text-gray-300 hover:text-gray-500 flex-shrink-0"><ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} /></button>
      </div>
      {expanded && (
        <div className="border-t border-gray-100 p-3 space-y-2.5 bg-slate-50 rounded-b-xl">
          {/* Notes / detail */}
          <label className="block text-[10px] text-gray-500">Notes
            <textarea
              value={detailVal}
              onChange={e => setDetailVal(e.target.value)}
              onBlur={commitDetail}
              rows={2}
              placeholder="Add extra details…"
              className="w-full mt-0.5 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white resize-none focus:outline-none focus:ring-1 focus:ring-teal-400"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10px] text-gray-500">Priority
              <select value={t.priority} onChange={e => onPatch({ priority: e.target.value })} className="w-full mt-0.5 text-xs border border-gray-200 rounded px-1.5 py-1 bg-white">
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
              </select>
            </label>
            <label className="text-[10px] text-gray-500">Due
              <input type="date" value={t.due_date ?? ''} onChange={e => onPatch({ dueDate: e.target.value || null })} className="w-full mt-0.5 text-xs border border-gray-200 rounded px-1.5 py-1 bg-white" />
            </label>
            <label className="text-[10px] text-gray-500">Assign to
              <select value={t.assignee_id ?? ''} onChange={e => onPatch({ assigneeId: e.target.value || null })} className="w-full mt-0.5 text-xs border border-gray-200 rounded px-1.5 py-1 bg-white">
                <option value="">Nobody</option>
                {people.map(p => <option key={p.id} value={p.id}>{p.full_name ?? 'User'}</option>)}
              </select>
            </label>
            <label className="text-[10px] text-gray-500">Team
              <select value={t.team_id ?? ''} onChange={e => onPatch({ teamId: e.target.value || null })} className="w-full mt-0.5 text-xs border border-gray-200 rounded px-1.5 py-1 bg-white">
                <option value="">Personal</option>
                {teams.map(tm => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
              </select>
            </label>
          </div>
        </div>
      )}
    </div>
  )
}
