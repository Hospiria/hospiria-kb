'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Plus, Pin, PinOff, Trash2, Share2, Users, ArrowLeft,
  Loader2, Lock, Globe, X, Search, Link2, ExternalLink,
} from 'lucide-react'
import { MentionTextarea } from './MentionTextarea'
import { DeleteConfirmModal, type DeleteTarget } from './DeleteConfirmModal'
import {
  type Person, type Team, type Note, type Space,
  SpaceBtn, SpinnerRow, Empty, TrashSection, useSpaceQuery,
} from './workspaceShared'

// ─── Notes page ─────────────────────────────────────────────────────────────

export function NotesClient({ currentUserId, people, myTeams }: {
  currentUserId: string
  people: Person[]
  myTeams: Team[]
}) {
  const [space, setSpace] = useState<Space>('personal')
  const [notes, setNotes] = useState<Note[]>([])
  const [trashNotes, setTrashNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [showTrash, setShowTrash] = useState(false)
  const [activeNote, setActiveNote] = useState<Note | null>(null)
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)

  const [search, setSearch] = useState('')
  const [noteFilter, setNoteFilter] = useState<'all' | 'mine' | 'shared' | 'pinned'>('all')

  useEffect(() => { setSearch(''); setNoteFilter('all') }, [space])

  const qs = useSpaceQuery(space)

  const loadNotes = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [active, trash] = await Promise.all([
        fetch(`/api/notes${qs}`).then(r => r.ok ? r.json() : null),
        fetch(`/api/notes${qs}&trash=true`).then(r => r.ok ? r.json() : null),
      ])
      if (active) setNotes(active.notes ?? [])
      else setError('Could not load notes.')
      if (trash) setTrashNotes(trash.notes ?? [])
    } finally { setLoading(false) }
  }, [qs])

  useEffect(() => { loadNotes() }, [loadNotes])

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

  async function confirmDelete() {
    if (!deleteTarget) return
    const r = await fetch(`/api/notes/${deleteTarget.id}`, { method: 'DELETE' })
    setDeleteTarget(null)
    if (r.ok) loadNotes()
    else { const d = await r.json().catch(() => ({})); setError(d.error || 'Delete failed') }
  }

  async function restore(id: string) {
    await fetch(`/api/notes/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ restore: true }) })
    loadNotes()
  }

  const activeTeam = myTeams.find(t => t.id === space) ?? null
  const isTeamSpace = space !== 'personal'
  const sq = search.toLowerCase().trim()

  const filteredNotes = notes.filter(n => {
    if (sq && !n.title.toLowerCase().includes(sq) && !n.body.toLowerCase().includes(sq)) return false
    if (noteFilter === 'mine' && !n.mine) return false
    if (noteFilter === 'shared' && !n.shared) return false
    if (noteFilter === 'pinned' && !n.pinned) return false
    return true
  })

  if (activeNote) {
    return (
      <>
        <NoteEditor
          note={activeNote} people={people} currentUserId={currentUserId}
          isTeamNote={isTeamSpace}
          onBack={() => { setActiveNote(null); loadNotes() }}
          onChanged={loadNotes}
          onDelete={n => setDeleteTarget({ type: 'note', id: n.id, title: n.title, mine: n.mine, ownerName: null, canDelete: n.mine || isTeamSpace })}
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
          <h1 className="text-2xl font-bold text-navy-700">Notes</h1>
          <p className="text-sm text-gray-500 mt-0.5">Capture and share knowledge — personal and team.</p>
        </div>
        <button onClick={createNote} className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700">
          <Plus className="w-4 h-4" /> New note
        </button>
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
        {isTeamSpace ? `Team space — everyone on ${activeTeam?.name ?? 'this team'} can see and edit.` : 'Personal space — only you can see these unless you share.'}
      </p>

      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search notes…"
          className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
        {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>}
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        {(['all', 'mine', 'shared', 'pinned'] as const).map(f => (
          <button key={f} onClick={() => setNoteFilter(f)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors capitalize ${noteFilter === f ? 'bg-navy-700 text-white border-navy-700' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
            {f === 'all' ? 'All' : f === 'mine' ? 'Mine' : f === 'shared' ? 'Shared with me' : '📌 Pinned'}
          </button>
        ))}
        {(search || noteFilter !== 'all') && <span className="text-xs text-gray-400 ml-1">{filteredNotes.length} of {notes.length}</span>}
      </div>

      {loading ? <SpinnerRow /> : <>
        {filteredNotes.length === 0 ? (
          <Empty label={search || noteFilter !== 'all' ? 'No notes match your search.' : isTeamSpace ? `No team notes yet. Click 'New note' to create one.` : `No personal notes yet. Click 'New note' to get started.`} />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredNotes.map(n => (
              <NoteCard key={n.id} note={n}
                onOpen={() => setActiveNote(n)}
                onDelete={() => setDeleteTarget({ type: 'note', id: n.id, title: n.title, mine: n.mine, ownerName: null, canDelete: n.mine || isTeamSpace })}
              />
            ))}
          </div>
        )}
        <TrashSection show={showTrash} onToggle={() => setShowTrash(s => !s)} trashNotes={trashNotes} onRestoreNote={restore} />
      </>}
    </div>
  )
}

// ─── Note card ────────────────────────────────────────────────────────────────

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
        <div className="flex items-center gap-2 mt-2">
          <p className="text-[10px] text-gray-300">{new Date(note.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
          {note.sop_id && note.sopTitle && (
            <span className="text-[10px] text-teal-500 flex items-center gap-0.5 truncate">
              <Link2 className="w-2.5 h-2.5 flex-shrink-0" /> {note.sopTitle}
            </span>
          )}
        </div>
      </button>
      <button onClick={e => { e.stopPropagation(); onDelete() }} title="Delete note"
        className="absolute top-3 right-3 p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100">
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

  const [linkedSopId, setLinkedSopId] = useState<string | null>(note.sop_id)
  const [linkedSopTitle, setLinkedSopTitle] = useState<string | null>(note.sopTitle)
  const [showSopPicker, setShowSopPicker] = useState(false)
  const [sopSearch, setSopSearch] = useState('')
  const [sopResults, setSopResults] = useState<{ id: string; title: string }[]>([])
  const [sopSearching, setSopSearching] = useState(false)
  const sopDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  function searchSops(q: string) {
    setSopSearch(q)
    if (sopDebounce.current) clearTimeout(sopDebounce.current)
    if (q.trim().length < 2) { setSopResults([]); setSopSearching(false); return }
    setSopSearching(true)
    sopDebounce.current = setTimeout(async () => {
      const { createClient } = await import('@/lib/supabase/client')
      const sb = createClient()
      const { data } = await sb.from('sops').select('id, title').ilike('title', `%${q.trim()}%`).order('title').limit(10)
      setSopResults((data ?? []) as { id: string; title: string }[])
      setSopSearching(false)
    }, 250)
  }

  async function linkSop(sop: { id: string; title: string }) {
    setLinkedSopId(sop.id); setLinkedSopTitle(sop.title)
    setShowSopPicker(false); setSopSearch(''); setSopResults([])
    await save({ sopId: sop.id })
  }
  async function unlinkSop() { setLinkedSopId(null); setLinkedSopTitle(null); await save({ sopId: null }) }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <button onClick={onBack} className="text-sm text-gray-500 hover:text-navy-700 flex items-center gap-1.5"><ArrowLeft className="w-4 h-4" /> Notes</button>
        <div className="flex items-center gap-2">
          {isTeamNote && <span className="text-xs text-teal-600 bg-teal-50 border border-teal-200 rounded-full px-2.5 py-0.5 flex items-center gap-1"><Globe className="w-3 h-3" /> Team note</span>}
          <span className="text-xs text-gray-400">{saveError ? <span className="text-red-500">{saveError}</span> : saved ? 'Saved' : 'Saving…'}</span>
          {!readOnly && <button onClick={togglePin} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">{pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}</button>}
          {!readOnly && <button onClick={() => setShowSopPicker(s => !s)} title="Link to SOP" className={`p-1.5 rounded-lg hover:bg-gray-100 ${showSopPicker ? 'text-teal-600 bg-teal-50' : linkedSopId ? 'text-teal-600' : 'text-gray-500'}`}><Link2 className="w-4 h-4" /></button>}
          {!isTeamNote && note.mine && <button onClick={() => setShowShare(s => !s)} className={`p-1.5 rounded-lg hover:bg-gray-100 ${showShare ? 'text-teal-600 bg-teal-50' : 'text-gray-500'}`}><Share2 className="w-4 h-4" /></button>}
          <button onClick={() => onDelete(note)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>

      {showSopPicker && (
        <div className="bg-white border border-teal-200 rounded-2xl p-4 mb-4 space-y-3">
          <p className="text-sm font-semibold text-navy-700 flex items-center gap-2"><Link2 className="w-4 h-4 text-teal-500" /> Link to a SOP</p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            {sopSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />}
            <input autoFocus value={sopSearch} onChange={e => searchSops(e.target.value)} placeholder="Search SOPs by title…"
              className="w-full pl-9 pr-9 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
          {sopSearch.trim().length < 2 ? (
            <p className="text-xs text-gray-400">Type at least 2 characters to search.</p>
          ) : !sopSearching && sopResults.length === 0 ? (
            <p className="text-xs text-gray-400">No SOPs found.</p>
          ) : (
            <ul className="space-y-1 max-h-48 overflow-y-auto">
              {sopResults.map(s => (
                <li key={s.id}>
                  <button onClick={() => linkSop(s)} className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-teal-50 text-navy-700 flex items-center gap-2">
                    <Link2 className="w-3.5 h-3.5 text-teal-400 flex-shrink-0" /> {s.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {showShare && !isTeamNote && note.mine && <SharePanel noteId={note.id} people={people} currentUserId={currentUserId} />}

      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        {linkedSopId && linkedSopTitle && (
          <div className="flex items-center gap-2 mb-4 p-2.5 bg-teal-50 border border-teal-200 rounded-xl">
            <Link2 className="w-3.5 h-3.5 text-teal-500 flex-shrink-0" />
            <a href={`/sops/${linkedSopId}`} target="_blank" rel="noopener noreferrer"
              className="text-sm text-teal-700 font-medium hover:underline flex-1 truncate flex items-center gap-1">
              {linkedSopTitle} <ExternalLink className="w-3 h-3 flex-shrink-0" />
            </a>
            {!readOnly && <button onClick={unlinkSop} title="Unlink SOP" className="text-teal-400 hover:text-red-500 flex-shrink-0"><X className="w-4 h-4" /></button>}
          </div>
        )}

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

export function SharePanel({ noteId, people, currentUserId }: { noteId: string; people: Person[]; currentUserId: string }) {
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
