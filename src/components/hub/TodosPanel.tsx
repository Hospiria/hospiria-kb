'use client'

import { useEffect, useState, useCallback } from 'react'
import { Sparkles, Loader2, Check, Trash2, ChevronDown, Calendar, User, Users } from 'lucide-react'

interface Todo {
  id: string; owner_id: string; assignee_id: string | null; team_id: string | null
  title: string; detail: string | null; due_date: string | null
  priority: 'low' | 'medium' | 'high'; status: string; is_done: boolean
  mine: boolean; assignedToMe: boolean; ownerName: string | null; assigneeName: string | null; teamName: string | null
}
interface TodoStatus { id: string; name: string; color: string; is_done: boolean; is_default: boolean }
interface Person { id: string; full_name: string | null }
interface Team { id: string; name: string }

const PRIORITY_DOT: Record<string, string> = { high: 'bg-red-500', medium: 'bg-amber-400', low: 'bg-gray-300' }

export function TodosPanel() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [statuses, setStatuses] = useState<TodoStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [people, setPeople] = useState<Person[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [input, setInput] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await fetch('/api/todos?space=personal'); if (r.ok) setTodos((await r.json()).todos ?? []) } finally { setLoading(false) }
  }, [])
  useEffect(() => {
    load()
    fetch('/api/directory').then(r => r.ok ? r.json() : null).then(d => { if (d) { setPeople(d.people ?? []); setTeams(d.teams ?? []) } })
    fetch('/api/todo-statuses').then(r => r.ok ? r.json() : null).then(d => { if (d) setStatuses(d.statuses ?? []) })
  }, [load])

  const defaultStatus = statuses.find(s => s.is_default) ?? statuses[0] ?? null

  // AI capture — passes full draft including recurrence and statusName
  async function add() {
    const text = input.trim(); if (!text || adding) return
    setAdding(true); setError('')
    try {
      const r = await fetch('/api/todos/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
      const d = await r.json()
      if (!r.ok) { setError(d.error ?? 'Could not add that.'); return }
      const draft = d.draft
      const c = await fetch('/api/todos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: draft.title, detail: draft.detail, dueDate: draft.dueDate,
          priority: draft.priority, assigneeId: draft.assigneeId,
          recurrence: draft.recurrence ?? 'none',
          recurrenceDayOfWeek: draft.recurrenceDayOfWeek ?? null,
          recurrenceWeekdaysOnly: draft.recurrenceWeekdaysOnly ?? false,
          statusName: draft.statusName ?? defaultStatus?.name,
        }),
      })
      if (c.ok) { setInput(''); load() } else setError((await c.json()).error ?? 'Could not save.')
    } catch { setError('Network error.') } finally { setAdding(false) }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    await fetch(`/api/todos/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); load()
  }

  // Toggle done — sends BOTH status string AND isDone boolean so the DB column is updated
  async function toggle(t: Todo) {
    const nowDone = !t.is_done
    const newStatus = nowDone
      ? (statuses.find(s => s.is_done)?.name ?? 'Completed')
      : (statuses.find(s => !s.is_done)?.name ?? defaultStatus?.name ?? 'To Do')
    await patch(t.id, { status: newStatus, isDone: nowDone })
  }

  async function del(id: string) { await fetch(`/api/todos/${id}`, { method: 'DELETE' }); load() }

  const open = todos.filter(t => !t.is_done)
  const done = todos.filter(t => t.is_done)

  return (
    <div className="flex flex-col h-full">
      {/* AI capture */}
      <div className="p-3 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); add() } }}
            rows={1} placeholder="e.g. send checkout reminder email on Friday — high priority"
            className="flex-1 resize-none max-h-24 text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          <button onClick={add} disabled={!input.trim() || adding} className="h-10 px-3 flex-shrink-0 rounded-xl bg-teal-600 text-white flex items-center gap-1.5 text-sm font-medium hover:bg-teal-700 disabled:opacity-40">
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Add
          </button>
        </div>
        <p className="text-[10px] text-gray-400 mt-1">Type naturally — I&apos;ll set the date, priority and assignee.</p>
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-slate-50">
        {loading ? <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div> :
          open.length === 0 && done.length === 0 ? <p className="text-center text-sm text-gray-400 py-10">No to-dos yet. Add one above.</p> :
          <>
            {open.map(t => <TodoCard key={t.id} t={t} people={people} teams={teams} expanded={expanded === t.id} onExpand={() => setExpanded(expanded === t.id ? null : t.id)} onToggle={() => toggle(t)} onPatch={b => patch(t.id, b)} onDelete={() => del(t.id)} />)}
            {done.length > 0 && (
              <div className="pt-2">
                <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold px-1 mb-1">Done ({done.length})</p>
                {done.map(t => <TodoCard key={t.id} t={t} people={people} teams={teams} expanded={expanded === t.id} onExpand={() => setExpanded(expanded === t.id ? null : t.id)} onToggle={() => toggle(t)} onPatch={b => patch(t.id, b)} onDelete={() => del(t.id)} />)}
              </div>
            )}
          </>}
      </div>
    </div>
  )
}

function TodoCard({ t, people, teams, expanded, onExpand, onToggle, onPatch, onDelete }: {
  t: Todo; people: Person[]; teams: Team[]; expanded: boolean
  onExpand: () => void; onToggle: () => void; onPatch: (b: Record<string, unknown>) => void; onDelete: () => void
}) {
  const isDone = t.is_done
  return (
    <div className="bg-white border border-gray-200 rounded-xl">
      <div className="flex items-start gap-2.5 p-3">
        <button onClick={onToggle} className={`mt-0.5 w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center ${isDone ? 'bg-teal-500 border-teal-500' : 'border-gray-300 hover:border-teal-400'}`}>
          {isDone && <Check className="w-3 h-3 text-white" />}
        </button>
        <div className="flex-1 min-w-0">
          <p className={`text-sm ${isDone ? 'text-gray-400 line-through' : 'text-navy-700'}`}>{t.title}</p>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1 text-[11px] text-gray-400">
            <span className="flex items-center gap-1"><span className={`w-2 h-2 rounded-full ${PRIORITY_DOT[t.priority]}`} />{t.priority}</span>
            {t.due_date && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{t.due_date}</span>}
            {t.assigneeName && <span className="flex items-center gap-1 text-teal-600"><User className="w-3 h-3" />{t.assignedToMe ? 'You' : t.assigneeName}</span>}
            {t.teamName && <span className="flex items-center gap-1"><Users className="w-3 h-3" />{t.teamName}</span>}
          </div>
        </div>
        <button onClick={onExpand} className="p-1 text-gray-300 hover:text-gray-500"><ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} /></button>
      </div>
      {expanded && (
        <div className="border-t border-gray-100 p-3 space-y-2 bg-slate-50">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-gray-500">Priority
              <select value={t.priority} onChange={e => onPatch({ priority: e.target.value })} className="w-full mt-0.5 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
              </select>
            </label>
            <label className="text-[11px] text-gray-500">Due
              <input type="date" value={t.due_date ?? ''} onChange={e => onPatch({ dueDate: e.target.value || null })} className="w-full mt-0.5 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white" />
            </label>
            <label className="text-[11px] text-gray-500">Assign to
              <select value={t.assignee_id ?? ''} onChange={e => onPatch({ assigneeId: e.target.value || null })} className="w-full mt-0.5 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
                <option value="">Nobody</option>
                {people.map(p => <option key={p.id} value={p.id}>{p.full_name ?? 'User'}</option>)}
              </select>
            </label>
            <label className="text-[11px] text-gray-500">Team list
              <select value={t.team_id ?? ''} onChange={e => onPatch({ teamId: e.target.value || null })} className="w-full mt-0.5 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
                <option value="">None</option>
                {teams.map(tm => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
              </select>
            </label>
          </div>
          <div className="flex justify-end">
            <button onClick={onDelete} className="text-xs text-gray-400 hover:text-red-600 flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
          </div>
        </div>
      )}
    </div>
  )
}
