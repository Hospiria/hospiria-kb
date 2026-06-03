'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Plus, Pin, PinOff, Trash2, Share2, Users, ArrowLeft,
  Circle, Sparkles, Loader2, Calendar, ChevronDown,
  StickyNote, ListChecks, Check, X,
} from 'lucide-react'
import { MentionTextarea } from './MentionTextarea'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Person { id: string; full_name: string | null }
interface Team   { id: string; name: string }
interface Note {
  id: string; title: string; body: string; color: string | null; pinned: boolean
  updated_at: string; mine: boolean; canEdit: boolean; shared: boolean
}
interface Todo {
  id: string; owner_id: string; assignee_id: string | null; team_id: string | null
  title: string; detail: string | null; due_date: string | null
  priority: 'low' | 'medium' | 'high'; status: 'open' | 'done'
  mine: boolean; assignedToMe: boolean; ownerName: string | null
  assigneeName: string | null; teamName: string | null
}

type Tab = 'notes' | 'todos'

const PRIORITY_COLOR: Record<string, string> = {
  high: 'text-red-500', medium: 'text-amber-500', low: 'text-gray-300',
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function NotesPageClient({ currentUserId, people, teams }: {
  currentUserId: string
  people: Person[]
  teams: Team[]
}) {
  const [tab, setTab] = useState<Tab>('notes')
  const [notes, setNotes] = useState<Note[]>([])
  const [todos, setTodos] = useState<Todo[]>([])
  const [loadingNotes, setLoadingNotes] = useState(true)
  const [loadingTodos, setLoadingTodos] = useState(true)
  const [activeNote, setActiveNote] = useState<Note | null>(null)
  const [error, setError] = useState('')

  const loadNotes = useCallback(async () => {
    setLoadingNotes(true)
    try {
      const r = await fetch('/api/notes')
      if (r.ok) setNotes((await r.json()).notes ?? [])
      else setError('Could not load notes.')
    } finally { setLoadingNotes(false) }
  }, [])

  const loadTodos = useCallback(async () => {
    setLoadingTodos(true)
    try {
      const r = await fetch('/api/todos')
      if (r.ok) setTodos((await r.json()).todos ?? [])
    } finally { setLoadingTodos(false) }
  }, [])

  useEffect(() => { loadNotes(); loadTodos() }, [loadNotes, loadTodos])

  async function createNote() {
    setError('')
    const r = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '', body: '' }),
    })
    if (r.ok) {
      const n = (await r.json()).note as Note
      setNotes(prev => [n, ...prev])
      setActiveNote(n)
    } else {
      const d = await r.json().catch(() => ({}))
      setError(d.error ?? 'Could not create note — make sure migration 011 has been run in Supabase.')
    }
  }

  if (activeNote) {
    return (
      <NoteEditor
        note={activeNote}
        people={people}
        currentUserId={currentUserId}
        onBack={() => { setActiveNote(null); loadNotes() }}
        onChanged={loadNotes}
      />
    )
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-navy-700">Notes &amp; To-dos</h1>
          <p className="text-sm text-gray-500 mt-0.5">Your personal workspace — notes, tasks, and what the team has shared with you.</p>
        </div>
        {tab === 'notes' && (
          <button onClick={createNote} className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700">
            <Plus className="w-4 h-4" /> New note
          </button>
        )}
        {tab === 'todos' && (
          <span className="text-xs text-gray-400">Use the quick-add box below</span>
        )}
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">{error}</p>}

      <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 mb-5">
        <TabBtn active={tab === 'notes'} onClick={() => setTab('notes')}><StickyNote className="w-4 h-4" /> Notes</TabBtn>
        <TabBtn active={tab === 'todos'} onClick={() => setTab('todos')}><ListChecks className="w-4 h-4" /> To-dos</TabBtn>
      </div>

      {tab === 'notes' && (
        loadingNotes
          ? <SpinnerRow />
          : notes.length === 0
            ? <Empty label="No notes yet. Click 'New note' to get started." />
            : <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {notes.map(n => (
                  <button
                    key={n.id}
                    onClick={() => setActiveNote(n)}
                    className="text-left bg-white border border-gray-200 rounded-2xl p-4 hover:border-teal-400 hover:shadow-sm transition-all group"
                    style={n.color ? { borderTop: `3px solid ${n.color}` } : undefined}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-sm font-semibold text-navy-700 truncate group-hover:text-teal-700">{n.title || 'Untitled'}</p>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {n.pinned && <Pin className="w-3.5 h-3.5 text-amber-500" />}
                        {n.shared && <span title="Shared with you"><Users className="w-3.5 h-3.5 text-teal-400" /></span>}
                      </div>
                    </div>
                    {n.body && <p className="text-xs text-gray-500 line-clamp-3 whitespace-pre-wrap leading-relaxed">{n.body.slice(0, 200)}</p>}
                    <p className="text-[10px] text-gray-300 mt-2">{new Date(n.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
                  </button>
                ))}
              </div>
      )}

      {tab === 'todos' && (
        <TodosSection
          todos={todos}
          people={people}
          teams={teams}
          onRefresh={loadTodos}
          loading={loadingTodos}
        />
      )}
    </div>
  )
}

// ─── Note editor with @mentions ───────────────────────────────────────────────

function NoteEditor({ note, people, currentUserId, onBack, onChanged }: {
  note: Note; people: Person[]; currentUserId: string
  onBack: () => void; onChanged: () => void
}) {
  const [title, setTitle] = useState(note.title)
  const [body, setBody] = useState(note.body)
  const [pinned, setPinned] = useState(note.pinned)
  const [saved, setSaved] = useState(true)
  const [saveError, setSaveError] = useState('')
  const [showShare, setShowShare] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const readOnly = !note.canEdit

  const save = useCallback(async (patch: Record<string, unknown>) => {
    setSaved(false); setSaveError('')
    const r = await fetch(`/api/notes/${note.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (r.ok) { setSaved(true); onChanged() }
    else { setSaveError('Save failed.'); setSaved(true) }
  }, [note.id, onChanged])

  function triggerSave(patch: Record<string, unknown>) {
    setSaved(false)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => save(patch), 700)
  }

  async function del() {
    if (!confirm('Delete this note?')) return
    await fetch(`/api/notes/${note.id}`, { method: 'DELETE' }); onBack()
  }
  async function togglePin() { const v = !pinned; setPinned(v); await save({ pinned: v }) }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <button onClick={onBack} className="text-sm text-gray-500 hover:text-navy-700 flex items-center gap-1.5">
          <ArrowLeft className="w-4 h-4" /> All notes
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{saveError ? <span className="text-red-500">{saveError}</span> : saved ? 'Saved' : 'Saving…'}</span>
          {!readOnly && <button onClick={togglePin} title={pinned ? 'Unpin' : 'Pin'} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">{pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}</button>}
          {note.mine && <button onClick={() => setShowShare(s => !s)} title="Share" className={`p-1.5 rounded-lg hover:bg-gray-100 ${showShare ? 'text-teal-600 bg-teal-50' : 'text-gray-500'}`}><Share2 className="w-4 h-4" /></button>}
          {note.mine && <button onClick={del} title="Delete" className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>}
        </div>
      </div>

      {showShare && note.mine && <SharePanel noteId={note.id} people={people} currentUserId={currentUserId} />}

      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <input
          value={title}
          disabled={readOnly}
          onChange={e => { setTitle(e.target.value); triggerSave({ title: e.target.value }) }}
          placeholder="Note title"
          className="w-full text-2xl font-bold text-navy-700 border-0 outline-none mb-4 bg-transparent placeholder:text-gray-300"
        />
        <MentionTextarea
          value={body}
          disabled={readOnly}
          people={people}
          minRows={12}
          placeholder="Write anything… type @ to mention someone"
          onChange={val => { setBody(val); triggerSave({ body: val }) }}
          onMention={(person, newVal) => {
            setBody(newVal)
            save({ body: newVal, mentionedUserId: person.id })
          }}
        />
        {readOnly && <p className="text-xs text-gray-400 italic mt-2 pt-2 border-t border-gray-100">Shared with you (view only).</p>}
      </div>
    </div>
  )
}

// ─── Share panel ──────────────────────────────────────────────────────────────

function SharePanel({ noteId, people, currentUserId }: { noteId: string; people: Person[]; currentUserId: string }) {
  const [shares, setShares] = useState<{ user_id: string; can_edit: boolean; profiles?: { full_name: string | null } | null }[]>([])
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const r = await fetch(`/api/notes/${noteId}/share`)
    if (r.ok) setShares((await r.json()).shares ?? [])
  }, [noteId])
  useEffect(() => { load() }, [load])

  async function share(userId: string, canEdit: boolean) {
    setBusy(true)
    await fetch(`/api/notes/${noteId}/share`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, canEdit }) })
    await load(); setBusy(false)
  }
  async function unshare(userId: string) {
    setBusy(true)
    await fetch(`/api/notes/${noteId}/share`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) })
    await load(); setBusy(false)
  }

  const sharedIds = new Set(shares.map(s => s.user_id))
  const available = people.filter(p => p.id !== currentUserId && !sharedIds.has(p.id))

  return (
    <div className="bg-white border border-teal-200 rounded-2xl p-4 mb-4">
      <p className="text-sm font-semibold text-navy-700 mb-3 flex items-center gap-2"><Users className="w-4 h-4 text-teal-500" /> Share this note</p>
      {shares.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {shares.map(s => (
            <div key={s.user_id} className="flex items-center justify-between text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <span className="font-medium text-navy-700">{s.profiles?.full_name ?? 'User'}</span>
              <div className="flex items-center gap-2">
                <button onClick={() => share(s.user_id, !s.can_edit)} disabled={busy} className="text-xs px-2 py-0.5 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-100">{s.can_edit ? 'Can edit' : 'View only'}</button>
                <button onClick={() => unshare(s.user_id)} disabled={busy} className="text-gray-400 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      {available.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {available.map(p => (
            <button key={p.id} onClick={() => share(p.id, false)} disabled={busy} className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-gray-100 hover:bg-teal-50 hover:text-teal-700 text-gray-600 transition-colors">
              <Plus className="w-3 h-3" />{p.full_name ?? 'User'}
            </button>
          ))}
        </div>
      ) : shares.length === 0 ? <p className="text-xs text-gray-400 italic">No one else to share with.</p> : null}
      {busy && <p className="text-xs text-gray-400 mt-2 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Saving…</p>}
    </div>
  )
}

// ─── To-dos section ───────────────────────────────────────────────────────────

function TodosSection({ todos, people, teams, onRefresh, loading }: {
  todos: Todo[]; people: Person[]; teams: Team[]
  onRefresh: () => void; loading: boolean
}) {
  const [input, setInput] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  async function add() {
    const text = input.trim(); if (!text || adding) return
    setAdding(true); setAddError('')
    try {
      const r = await fetch('/api/todos/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
      const d = await r.json()
      if (!r.ok) { setAddError(d.error ?? 'Could not parse that.'); return }
      const draft = d.draft
      const c = await fetch('/api/todos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: draft.title, detail: draft.detail, dueDate: draft.dueDate, priority: draft.priority, assigneeId: draft.assigneeId }) })
      if (c.ok) { setInput(''); onRefresh() }
      else setAddError((await c.json()).error ?? 'Could not save.')
    } catch { setAddError('Network error.') } finally { setAdding(false) }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    await fetch(`/api/todos/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); onRefresh()
  }
  async function del(id: string) { await fetch(`/api/todos/${id}`, { method: 'DELETE' }); onRefresh() }

  const open = todos.filter(t => t.status === 'open')
  const done = todos.filter(t => t.status === 'done')

  return (
    <div className="space-y-4">
      {/* AI capture bar */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); add() } }}
              rows={2}
              placeholder="e.g. chase Sonali about 306 tomorrow morning — high priority"
              className="w-full resize-none text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <p className="text-[11px] text-gray-400 mt-1">Press Enter or click Add — I&apos;ll set the date, priority and assignee for you.</p>
          </div>
          <button onClick={add} disabled={!input.trim() || adding} className="h-10 px-4 flex-shrink-0 rounded-xl bg-teal-600 text-white text-sm font-medium flex items-center gap-2 hover:bg-teal-700 disabled:opacity-40">
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Add
          </button>
        </div>
        {addError && <p className="text-xs text-red-500 mt-2">{addError}</p>}
      </div>

      {loading ? <SpinnerRow /> : (
        <>
          {open.length === 0 && done.length === 0 && <Empty label="No to-dos yet. Add one above." />}
          {open.length > 0 && (
            <div className="space-y-2">
              {open.map(t => <TodoRow key={t.id} t={t} people={people} teams={teams} expanded={expanded === t.id} onExpand={() => setExpanded(expanded === t.id ? null : t.id)} onToggle={() => patch(t.id, { status: 'done' })} onPatch={b => patch(t.id, b)} onDelete={() => del(t.id)} />)}
            </div>
          )}
          {done.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Completed ({done.length})</p>
              <div className="space-y-2">
                {done.map(t => <TodoRow key={t.id} t={t} people={people} teams={teams} expanded={expanded === t.id} onExpand={() => setExpanded(expanded === t.id ? null : t.id)} onToggle={() => patch(t.id, { status: 'open' })} onPatch={b => patch(t.id, b)} onDelete={() => del(t.id)} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function TodoRow({ t, people, teams, expanded, onExpand, onToggle, onPatch, onDelete }: {
  t: Todo; people: Person[]; teams: Team[]; expanded: boolean
  onExpand: () => void; onToggle: () => void; onPatch: (b: Record<string, unknown>) => void; onDelete: () => void
}) {
  const done = t.status === 'done'
  const isOverdue = t.due_date && !done && new Date(t.due_date) < new Date()
  return (
    <div className="bg-white border border-gray-200 rounded-2xl">
      <div className="flex items-start gap-3 p-4">
        <button onClick={onToggle} className={`mt-0.5 w-5 h-5 rounded-full border flex-shrink-0 flex items-center justify-center transition-colors ${done ? 'bg-teal-500 border-teal-500' : 'border-gray-300 hover:border-teal-400'}`}>
          {done ? <Check className="w-3 h-3 text-white" /> : <Circle className="w-3 h-3 text-transparent" />}
        </button>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${done ? 'text-gray-400 line-through' : 'text-navy-700'}`}>{t.title}</p>
          {t.detail && !done && <p className="text-xs text-gray-500 mt-0.5">{t.detail}</p>}
          <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-gray-400">
            <span className={`font-medium ${PRIORITY_COLOR[t.priority]}`}>{t.priority}</span>
            {t.due_date && <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-500 font-medium' : ''}`}><Calendar className="w-3 h-3" />{t.due_date}{isOverdue ? ' — overdue' : ''}</span>}
            {t.assigneeName && <span className="flex items-center gap-1 text-teal-600">{t.assignedToMe ? '→ You' : `→ ${t.assigneeName}`}</span>}
            {t.teamName && <span className="flex items-center gap-1"><Users className="w-3 h-3" />{t.teamName}</span>}
          </div>
        </div>
        <button onClick={onExpand} className="p-1 text-gray-300 hover:text-gray-600 mt-0.5"><ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} /></button>
      </div>
      {expanded && (
        <div className="border-t border-gray-100 p-4 bg-slate-50 rounded-b-2xl grid sm:grid-cols-2 gap-3">
          <label className="block text-xs text-gray-500">Priority
            <select value={t.priority} onChange={e => onPatch({ priority: e.target.value })} className="w-full mt-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
            </select>
          </label>
          <label className="block text-xs text-gray-500">Due date
            <input type="date" value={t.due_date ?? ''} onChange={e => onPatch({ dueDate: e.target.value || null })} className="w-full mt-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white" />
          </label>
          <label className="block text-xs text-gray-500">Assign to
            <select value={t.assignee_id ?? ''} onChange={e => onPatch({ assigneeId: e.target.value || null })} className="w-full mt-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
              <option value="">Nobody</option>
              {people.map(p => <option key={p.id} value={p.id}>{p.full_name ?? 'User'}</option>)}
            </select>
          </label>
          <label className="block text-xs text-gray-500">Team list
            <select value={t.team_id ?? ''} onChange={e => onPatch({ teamId: e.target.value || null })} className="w-full mt-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
              <option value="">None (personal)</option>
              {teams.map(tm => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
            </select>
          </label>
          <div className="sm:col-span-2 flex justify-end">
            <button onClick={onDelete} className="text-xs text-gray-400 hover:text-red-600 flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${active ? 'bg-teal-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
      {children}
    </button>
  )
}
function SpinnerRow() { return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div> }
function Empty({ label }: { label: string }) { return <p className="text-center text-sm text-gray-400 py-16 bg-white border border-dashed border-gray-200 rounded-2xl">{label}</p> }

// re-export tiny ones for hub use
export { SharePanel }
