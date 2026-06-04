'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Plus, Pin, PinOff, Trash2, Share2, Users, ArrowLeft,
  Circle, Sparkles, Loader2, Calendar, ChevronDown,
  StickyNote, ListChecks, Check, X, Lock, Globe, RotateCcw, MessageSquare,
} from 'lucide-react'
import { createPortal } from 'react-dom'
import { MentionTextarea } from './MentionTextarea'
import { DeleteConfirmModal, type DeleteTarget } from './DeleteConfirmModal'
import { CommentsPanel } from '@/components/todos/CommentsPanel'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Person { id: string; full_name: string | null }
interface Team   { id: string; name: string }
interface TodoStatus { id: string; name: string; color: string; is_done: boolean; is_default: boolean }
interface Note {
  id: string; title: string; body: string; color: string | null; pinned: boolean
  updated_at: string; team_id: string | null; mine: boolean; canEdit: boolean
  shared: boolean; deleted_at: string | null; deletedByName: string | null
}
interface Todo {
  id: string; owner_id: string; assignee_id: string | null; team_id: string | null
  title: string; detail: string | null; due_date: string | null
  priority: 'low' | 'medium' | 'high'; status: string; is_done: boolean
  deleted_at: string | null; deleted_by: string | null; deletedByName: string | null
  mine: boolean; assignedToMe: boolean; ownerName: string | null
  assigneeName: string | null; teamName: string | null
}

type Space = 'personal' | string
type Tab = 'notes' | 'todos'

const PRIORITY_COLOR: Record<string, string> = {
  high: 'text-red-500', medium: 'text-amber-500', low: 'text-gray-300',
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function NotesPageClient({ currentUserId, people, myTeams }: {
  currentUserId: string
  people: Person[]
  myTeams: Team[]
}) {
  const [space, setSpace] = useState<Space>('personal')
  const [tab, setTab] = useState<Tab>('notes')
  const [notes, setNotes] = useState<Note[]>([])
  const [todos, setTodos] = useState<Todo[]>([])
  const [trashNotes, setTrashNotes] = useState<Note[]>([])
  const [trashTodos, setTrashTodos] = useState<Todo[]>([])
  const [loadingNotes, setLoadingNotes] = useState(true)
  const [loadingTodos, setLoadingTodos] = useState(true)
  const [showTrash, setShowTrash] = useState(false)
  const [activeNote, setActiveNote] = useState<Note | null>(null)
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [statuses, setStatuses] = useState<TodoStatus[]>([])

  const qs = space === 'personal' ? '?space=personal' : `?teamId=${space}`

  const loadNotes = useCallback(async () => {
    setLoadingNotes(true); setError('')
    try {
      const [active, trash] = await Promise.all([
        fetch(`/api/notes${qs}`).then(r => r.ok ? r.json() : null),
        fetch(`/api/notes${qs}&trash=true`).then(r => r.ok ? r.json() : null),
      ])
      if (active) setNotes(active.notes ?? [])
      else setError('Could not load notes.')
      if (trash) setTrashNotes(trash.notes ?? [])
    } finally { setLoadingNotes(false) }
  }, [qs])

  const loadTodos = useCallback(async () => {
    setLoadingTodos(true)
    try {
      const [active, trash] = await Promise.all([
        fetch(`/api/todos${qs}`).then(r => r.ok ? r.json() : null),
        fetch(`/api/todos${qs}&trash=true`).then(r => r.ok ? r.json() : null),
      ])
      if (active) setTodos(active.todos ?? [])
      if (trash) setTrashTodos(trash.todos ?? [])
    } finally { setLoadingTodos(false) }
  }, [qs])

  useEffect(() => { loadNotes(); loadTodos() }, [loadNotes, loadTodos])
  useEffect(() => {
    fetch('/api/todo-statuses').then(r => r.ok ? r.json() : null).then(d => { if (d) setStatuses(d.statuses ?? []) })
  }, [])

  async function createNote() {
    setError('')
    const teamId = space === 'personal' ? null : space
    const r = await fetch('/api/notes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '', body: '', teamId }),
    })
    if (r.ok) { const n = (await r.json()).note as Note; setNotes(prev => [n, ...prev]); setActiveNote(n) }
    else { const d = await r.json().catch(() => ({})); setError(d.error ?? 'Could not create note.') }
  }

  function requestDelete(target: DeleteTarget) { setDeleteTarget(target) }

  async function confirmDelete() {
    if (!deleteTarget) return
    const url = deleteTarget.type === 'note' ? `/api/notes/${deleteTarget.id}` : `/api/todos/${deleteTarget.id}`
    const r = await fetch(url, { method: 'DELETE' })
    setDeleteTarget(null)
    if (r.ok) { if (deleteTarget.type === 'note') loadNotes(); else loadTodos() }
    else { const d = await r.json().catch(() => ({})); setError(d.error || 'Delete failed') }
  }

  async function restore(type: 'note' | 'todo', id: string) {
    const url = type === 'note' ? `/api/notes/${id}` : `/api/todos/${id}`
    await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ restore: true }) })
    if (type === 'note') loadNotes(); else loadTodos()
  }

  const activeTeam = myTeams.find(t => t.id === space) ?? null
  const isTeamSpace = space !== 'personal'

  if (activeNote) {
    return (
      <>
        <NoteEditor
          note={activeNote} people={people} currentUserId={currentUserId}
          isTeamNote={isTeamSpace}
          onBack={() => { setActiveNote(null); loadNotes() }}
          onChanged={loadNotes}
          onDelete={n => requestDelete({ type: 'note', id: n.id, title: n.title, mine: n.mine, ownerName: null, canDelete: n.mine || isTeamSpace })}
        />
        {deleteTarget && <DeleteConfirmModal target={deleteTarget} onConfirm={async () => { await confirmDelete(); setActiveNote(null) }} onCancel={() => setDeleteTarget(null)} />}
      </>
    )
  }

  return (
    <div className="max-w-5xl mx-auto">
      {deleteTarget && <DeleteConfirmModal target={deleteTarget} onConfirm={confirmDelete} onCancel={() => setDeleteTarget(null)} />}

      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-navy-700">Notes &amp; To-dos</h1>
          <p className="text-sm text-gray-500 mt-0.5">Your workspace — personal and team.</p>
        </div>
        {tab === 'notes' && (
          <button onClick={createNote} className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700">
            <Plus className="w-4 h-4" /> New note
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">{error}</p>}

      {/* Space switcher */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <SpaceBtn active={space === 'personal'} onClick={() => setSpace('personal')}><Lock className="w-3.5 h-3.5" /> Personal</SpaceBtn>
        {myTeams.map(t => (
          <SpaceBtn key={t.id} active={space === t.id} onClick={() => setSpace(t.id)}><Globe className="w-3.5 h-3.5" /> {t.name}</SpaceBtn>
        ))}
      </div>
      <p className="text-xs text-gray-400 mb-4">
        {isTeamSpace ? `Team space — everyone on ${activeTeam?.name ?? 'this team'} can see and edit.` : 'Personal space — only you can see these unless you share or assign them.'}
      </p>

      {/* Content tabs */}
      <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 mb-5">
        <TabBtn active={tab === 'notes'} onClick={() => setTab('notes')}><StickyNote className="w-4 h-4" /> Notes</TabBtn>
        <TabBtn active={tab === 'todos'} onClick={() => setTab('todos')}><ListChecks className="w-4 h-4" /> To-dos</TabBtn>
      </div>

      {tab === 'notes' && (
        loadingNotes ? <SpinnerRow /> : <>
          {notes.length === 0 ? (
            <Empty label={isTeamSpace ? `No team notes yet. Click 'New note' to create one.` : `No personal notes yet. Click 'New note' to get started.`} />
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {notes.map(n => (
                <NoteCard
                  key={n.id}
                  note={n}
                  onOpen={() => setActiveNote(n)}
                  onDelete={() => requestDelete({ type: 'note', id: n.id, title: n.title, mine: n.mine, ownerName: null, canDelete: n.mine || isTeamSpace })}
                />
              ))}
            </div>
          )}
          <TrashSection
            show={showTrash} onToggle={() => setShowTrash(s => !s)}
            trashNotes={trashNotes} trashTodos={[]}
            onRestoreNote={id => restore('note', id)}
          />
        </>
      )}

      {tab === 'todos' && (
        <TodosSection
          todos={todos} trashTodos={trashTodos}
          people={people} teams={myTeams} statuses={statuses}
          currentTeamId={isTeamSpace ? space : null}
          currentUserId={currentUserId}
          onRefresh={loadTodos}
          loading={loadingTodos}
          onDelete={t => requestDelete({
            type: 'todo', id: t.id, title: t.title, mine: t.mine, ownerName: t.ownerName,
            canDelete: t.mine || (!!t.team_id),
          })}
          onRestore={id => restore('todo', id)}
        />
      )}
    </div>
  )
}

// ─── Note card with quick delete ─────────────────────────────────────────────

function NoteCard({ note, onOpen, onDelete }: { note: Note; onOpen: () => void; onDelete: () => void }) {
  return (
    <div className="relative group bg-white border border-gray-200 rounded-2xl p-4 hover:border-teal-400 hover:shadow-sm transition-all"
      style={note.color ? { borderTop: `3px solid ${note.color}` } : undefined}>
      <button onClick={onOpen} className="w-full text-left">
        <div className="flex items-start justify-between gap-2 mb-1 pr-6">
          <p className="text-sm font-semibold text-navy-700 truncate group-hover:text-teal-700">{note.title || 'Untitled'}</p>
          <div className="flex items-center gap-1 flex-shrink-0">
            {note.pinned && <Pin className="w-3.5 h-3.5 text-amber-500" />}
            {note.shared && <span title="Shared with you"><Users className="w-3.5 h-3.5 text-teal-400" /></span>}
          </div>
        </div>
        {note.body && <p className="text-xs text-gray-500 line-clamp-3 whitespace-pre-wrap leading-relaxed">{note.body.slice(0, 200)}</p>}
        <p className="text-[10px] text-gray-300 mt-2">{new Date(note.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
      </button>
      {/* Quick delete — always visible, top-right corner */}
      <button
        onClick={e => { e.stopPropagation(); onDelete() }}
        title="Delete note"
        className="absolute top-3 right-3 p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// ─── Note editor ──────────────────────────────────────────────────────────────

function NoteEditor({ note, people, currentUserId, isTeamNote, onBack, onChanged, onDelete }: {
  note: Note; people: Person[]; currentUserId: string; isTeamNote: boolean
  onBack: () => void; onChanged: () => void; onDelete: (n: Note) => void
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
    const r = await fetch(`/api/notes/${note.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
    if (r.ok) { setSaved(true); onChanged() } else { setSaveError('Save failed.'); setSaved(true) }
  }, [note.id, onChanged])

  function triggerSave(patch: Record<string, unknown>) {
    setSaved(false)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => save(patch), 700)
  }

  async function togglePin() { const v = !pinned; setPinned(v); await save({ pinned: v }) }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <button onClick={onBack} className="text-sm text-gray-500 hover:text-navy-700 flex items-center gap-1.5"><ArrowLeft className="w-4 h-4" /> Notes</button>
        <div className="flex items-center gap-2">
          {isTeamNote && <span className="text-xs text-teal-600 bg-teal-50 border border-teal-200 rounded-full px-2.5 py-0.5 flex items-center gap-1"><Globe className="w-3 h-3" /> Team note</span>}
          <span className="text-xs text-gray-400">{saveError ? <span className="text-red-500">{saveError}</span> : saved ? 'Saved' : 'Saving…'}</span>
          {!readOnly && <button onClick={togglePin} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">{pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}</button>}
          {!isTeamNote && note.mine && <button onClick={() => setShowShare(s => !s)} className={`p-1.5 rounded-lg hover:bg-gray-100 ${showShare ? 'text-teal-600 bg-teal-50' : 'text-gray-500'}`}><Share2 className="w-4 h-4" /></button>}
          <button onClick={() => onDelete(note)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>
      {showShare && !isTeamNote && note.mine && <SharePanel noteId={note.id} people={people} currentUserId={currentUserId} />}
      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <input value={title} disabled={readOnly} onChange={e => { setTitle(e.target.value); triggerSave({ title: e.target.value }) }} placeholder="Note title" className="w-full text-2xl font-bold text-navy-700 border-0 outline-none mb-4 bg-transparent placeholder:text-gray-300" />
        <MentionTextarea
          value={body} disabled={readOnly} people={people} minRows={12}
          placeholder={isTeamNote ? 'Write for your team… type @ to mention someone' : 'Write anything… type @ to mention someone'}
          onChange={val => { setBody(val); triggerSave({ body: val }) }}
          onMention={(person, newVal) => { setBody(newVal); save({ body: newVal, mentionedUserId: person.id }) }}
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
    const r = await fetch(`/api/notes/${noteId}/share`); if (r.ok) setShares((await r.json()).shares ?? [])
  }, [noteId])
  useEffect(() => { load() }, [load])
  async function share(userId: string, canEdit: boolean) { setBusy(true); await fetch(`/api/notes/${noteId}/share`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, canEdit }) }); await load(); setBusy(false) }
  async function unshare(userId: string) { setBusy(true); await fetch(`/api/notes/${noteId}/share`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) }); await load(); setBusy(false) }
  const sharedIds = new Set(shares.map(s => s.user_id))
  const available = people.filter(p => p.id !== currentUserId && !sharedIds.has(p.id))
  return (
    <div className="bg-white border border-teal-200 rounded-2xl p-4 mb-4">
      <p className="text-sm font-semibold text-navy-700 mb-3 flex items-center gap-2"><Lock className="w-4 h-4 text-teal-500" /> Share this note</p>
      {shares.length > 0 && <div className="space-y-1.5 mb-3">{shares.map(s => (<div key={s.user_id} className="flex items-center justify-between text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2"><span className="font-medium text-navy-700">{s.profiles?.full_name ?? 'User'}</span><div className="flex items-center gap-2"><button onClick={() => share(s.user_id, !s.can_edit)} disabled={busy} className="text-xs px-2 py-0.5 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-100">{s.can_edit ? 'Can edit' : 'View only'}</button><button onClick={() => unshare(s.user_id)} disabled={busy} className="text-gray-400 hover:text-red-500"><X className="w-3.5 h-3.5" /></button></div></div>))}</div>}
      {available.length > 0 ? <div className="flex flex-wrap gap-1.5">{available.map(p => (<button key={p.id} onClick={() => share(p.id, false)} disabled={busy} className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-gray-100 hover:bg-teal-50 hover:text-teal-700 text-gray-600 transition-colors"><Plus className="w-3 h-3" />{p.full_name ?? 'User'}</button>))}</div> : shares.length === 0 ? <p className="text-xs text-gray-400 italic">No one else to share with.</p> : null}
      {busy && <p className="text-xs text-gray-400 mt-2 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Saving…</p>}
    </div>
  )
}

// ─── To-dos section ───────────────────────────────────────────────────────────

function StatusPicker({ current, statuses, onChange }: {
  current: string; statuses: TodoStatus[]; onChange: (s: TodoStatus) => void
}) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const currentStatus = statuses.find(s => s.name === current)

  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + window.scrollY + 4, left: r.left + window.scrollX })
    }
    setOpen(o => !o)
  }

  if (!statuses.length) return null

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
          <div className="absolute z-[9999] bg-white border border-gray-200 rounded-xl shadow-xl w-44 py-1.5 max-h-60 overflow-y-auto"
            style={{ top: pos.top, left: pos.left }}>
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

function TodosSection({ todos, trashTodos, people, teams, statuses, currentTeamId, currentUserId, onRefresh, loading, onDelete, onRestore }: {
  todos: Todo[]; trashTodos: Todo[]; people: Person[]; teams: Team[]; statuses: TodoStatus[]
  currentTeamId: string | null; currentUserId: string
  onRefresh: () => void; loading: boolean
  onDelete: (t: Todo) => void; onRestore: (id: string) => void
}) {
  const [input, setInput] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showTrash, setShowTrash] = useState(false)

  async function add() {
    const text = input.trim(); if (!text || adding) return
    setAdding(true); setAddError('')
    try {
      const r = await fetch('/api/todos/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
      const d = await r.json()
      if (!r.ok) { setAddError(d.error ?? 'Could not parse that.'); return }
      const draft = d.draft
      const c = await fetch('/api/todos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: draft.title, detail: draft.detail, dueDate: draft.dueDate, priority: draft.priority, assigneeId: draft.assigneeId, teamId: currentTeamId }) })
      if (c.ok) { setInput(''); onRefresh() } else setAddError((await c.json()).error ?? 'Could not save.')
    } catch { setAddError('Network error.') } finally { setAdding(false) }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    await fetch(`/api/todos/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); onRefresh()
  }

  async function changeStatus(id: string, s: TodoStatus) {
    await patch(id, { status: s.name, isDone: s.is_done })
  }

  const active = todos.filter(t => !t.is_done)
  const done = todos.filter(t => t.is_done)

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-2xl p-4">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); add() } }} rows={2}
              placeholder={currentTeamId ? `Add a team task…` : `Add a task… e.g. "chase Sonali about 306 tomorrow — high priority"`}
              className="w-full resize-none text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500" />
            <p className="text-[11px] text-gray-400 mt-1">Press Enter — AI fills in date, priority and assignee.</p>
          </div>
          <button onClick={add} disabled={!input.trim() || adding} className="h-10 px-4 flex-shrink-0 rounded-xl bg-teal-600 text-white text-sm font-medium flex items-center gap-2 hover:bg-teal-700 disabled:opacity-40">
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Add
          </button>
        </div>
        {addError && <p className="text-xs text-red-500 mt-2">{addError}</p>}
      </div>

      {loading ? <SpinnerRow /> : <>
        {active.length === 0 && done.length === 0 && <Empty label={currentTeamId ? 'No team to-dos yet.' : 'No personal to-dos. Add one above.'} />}
        {active.length > 0 && <div className="space-y-2">{active.map(t => <TodoRow key={t.id} t={t} people={people} teams={teams} statuses={statuses} expanded={expanded === t.id} onExpand={() => setExpanded(expanded === t.id ? null : t.id)} onStatusChange={s => changeStatus(t.id, s)} onPatch={b => patch(t.id, b)} onDelete={() => onDelete(t)} />)}</div>}
        {done.length > 0 && <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Completed ({done.length})</p>
          <div className="space-y-2">{done.map(t => <TodoRow key={t.id} t={t} people={people} teams={teams} statuses={statuses} expanded={expanded === t.id} onExpand={() => setExpanded(expanded === t.id ? null : t.id)} onStatusChange={s => changeStatus(t.id, s)} onPatch={b => patch(t.id, b)} onDelete={() => onDelete(t)} />)}</div>
        </div>}
        <TrashSection show={showTrash} onToggle={() => setShowTrash(s => !s)} trashNotes={[]} trashTodos={trashTodos} onRestoreTodo={onRestore} />
      </>}
    </div>
  )
}

function TodoRow({ t, people, teams, statuses, expanded, onExpand, onStatusChange, onPatch, onDelete }: {
  t: Todo; people: Person[]; teams: Team[]; statuses: TodoStatus[]; expanded: boolean
  onExpand: () => void; onStatusChange: (s: TodoStatus) => void
  onPatch: (b: Record<string, unknown>) => void; onDelete: () => void
}) {
  const [showComments, setShowComments] = useState(false)
  const isDone = t.is_done
  const isOverdue = t.due_date && !isDone && new Date(t.due_date) < new Date()

  return (
    <div className="bg-white border border-gray-200 rounded-2xl group">
      <div className="flex items-start gap-3 p-4">
        {/* Status picker replaces the simple circle */}
        <div className="mt-0.5 flex-shrink-0">
          <StatusPicker current={t.status} statuses={statuses} onChange={onStatusChange} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${isDone ? 'text-gray-400 line-through' : 'text-navy-700'}`}>{t.title}</p>
          {t.detail && !isDone && <p className="text-xs text-gray-500 mt-0.5">{t.detail}</p>}
          <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-gray-400">
            <span className={`font-medium ${PRIORITY_COLOR[t.priority]}`}>{t.priority}</span>
            {t.due_date && <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-500 font-medium' : ''}`}><Calendar className="w-3 h-3" />{t.due_date}{isOverdue ? ' — overdue' : ''}</span>}
            {t.assigneeName && <span className="flex items-center gap-1 text-teal-600">{t.assignedToMe ? '→ You' : `→ ${t.assigneeName}`}</span>}
            {t.teamName && <span className="flex items-center gap-1"><Users className="w-3 h-3" />{t.teamName}</span>}
            {!t.mine && t.ownerName && <span className="flex items-center gap-1">by {t.ownerName}</span>}
          </div>
        </div>
        {/* Comments toggle */}
        <button onClick={() => { setShowComments(s => !s); if (!expanded) onExpand() }}
          className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${showComments ? 'text-teal-600 bg-teal-50' : 'text-gray-200 hover:text-gray-500 opacity-0 group-hover:opacity-100'}`}
          title="Comments">
          <MessageSquare className="w-4 h-4" />
        </button>
        {/* Quick delete */}
        <button onClick={onDelete} title="Delete"
          className="p-1.5 rounded-lg text-gray-200 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0">
          <Trash2 className="w-4 h-4" />
        </button>
        <button onClick={onExpand} className="p-1.5 text-gray-300 hover:text-gray-600 flex-shrink-0">
          <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {expanded && (
        <div className="border-t border-gray-100 px-4 pb-4 bg-slate-50 rounded-b-2xl">
          <div className="grid sm:grid-cols-2 gap-3 pt-4">
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
                <option value="">Nobody</option>{people.map(p => <option key={p.id} value={p.id}>{p.full_name ?? 'User'}</option>)}
              </select>
            </label>
            <label className="block text-xs text-gray-500">Team list
              <select value={t.team_id ?? ''} onChange={e => onPatch({ teamId: e.target.value || null })} className="w-full mt-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
                <option value="">Personal</option>{teams.map(tm => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
              </select>
            </label>
          </div>
          {/* Comments thread */}
          <CommentsPanel todoId={t.id} people={people} />
        </div>
      )}
    </div>
  )
}

// ─── Trash section ────────────────────────────────────────────────────────────

function TrashSection({ show, onToggle, trashNotes, trashTodos, onRestoreNote, onRestoreTodo }: {
  show: boolean; onToggle: () => void
  trashNotes: Note[]; trashTodos: Todo[]
  onRestoreNote?: (id: string) => void; onRestoreTodo?: (id: string) => void
}) {
  const total = trashNotes.length + trashTodos.length
  if (total === 0) return null
  return (
    <div className="mt-6">
      <button onClick={onToggle} className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600 font-medium mb-2">
        <Trash2 className="w-3.5 h-3.5" /> Trash ({total}) <ChevronDown className={`w-3.5 h-3.5 transition-transform ${show ? 'rotate-180' : ''}`} />
      </button>
      {show && (
        <div className="bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-4 space-y-2">
          {trashNotes.map(n => (
            <div key={n.id} className="flex items-center justify-between gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm text-gray-500 line-through truncate">{n.title || 'Untitled'}</p>
                {n.deletedByName && <p className="text-xs text-gray-400">Deleted by {n.deletedByName} · {n.deleted_at ? new Date(n.deleted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}</p>}
              </div>
              <button onClick={() => onRestoreNote?.(n.id)} className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 flex-shrink-0"><RotateCcw className="w-3.5 h-3.5" /> Restore</button>
            </div>
          ))}
          {trashTodos.map(t => (
            <div key={t.id} className="flex items-center justify-between gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm text-gray-500 line-through truncate">{t.title}</p>
                {t.deletedByName && <p className="text-xs text-gray-400">Deleted by {t.deletedByName} · {t.deleted_at ? new Date(t.deleted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}</p>}
              </div>
              <button onClick={() => onRestoreTodo?.(t.id)} className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 flex-shrink-0"><RotateCcw className="w-3.5 h-3.5" /> Restore</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SpaceBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors ${active ? 'bg-navy-700 text-white border-navy-700' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}>{children}</button>
}
function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${active ? 'bg-teal-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>{children}</button>
}
function SpinnerRow() { return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div> }
function Empty({ label }: { label: string }) { return <p className="text-center text-sm text-gray-400 py-16 bg-white border border-dashed border-gray-200 rounded-2xl">{label}</p> }

export { SharePanel }
