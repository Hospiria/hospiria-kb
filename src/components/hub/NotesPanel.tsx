'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Plus, Trash2, Pin, PinOff, ArrowLeft, Users, Loader2, Check, Share2, X } from 'lucide-react'
import { MentionTextarea } from '@/components/notes/MentionTextarea'

interface Note {
  id: string; title: string; body: string; color: string | null; pinned: boolean
  updated_at: string; mine: boolean; canEdit: boolean; shared: boolean
}
interface Person { id: string; full_name: string | null }
interface ShareRow { user_id: string; can_edit: boolean; profiles?: { full_name: string | null } | null }

export function NotesPanel() {
  const [notes, setNotes] = useState<Note[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState<Note | null>(null)
  const [createError, setCreateError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await fetch('/api/notes'); if (r.ok) setNotes((await r.json()).notes ?? []) } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    load()
    fetch('/api/directory').then(r => r.ok ? r.json() : null).then(d => { if (d) setPeople(d.people ?? []) })
  }, [load])

  async function createNote() {
    setCreateError('')
    const r = await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: '', body: '' }) })
    if (r.ok) {
      const n = (await r.json()).note as Note
      setNotes(prev => [n, ...prev])
      setActive(n)
    } else {
      const d = await r.json().catch(() => ({}))
      setCreateError(d.error ?? 'Could not create — run migration 011 in Supabase first.')
    }
  }

  if (active) return (
    <NoteEditor
      note={active}
      people={people}
      onBack={() => { setActive(null); load() }}
      onChanged={load}
    />
  )

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
        <span className="text-xs text-gray-400">{notes.length} note{notes.length === 1 ? '' : 's'}</span>
        <button onClick={createNote} className="flex items-center gap-1.5 text-sm font-medium text-teal-600 hover:text-teal-700">
          <Plus className="w-4 h-4" /> New note
        </button>
      </div>
      {createError && <p className="text-xs text-red-500 px-3 py-2 bg-red-50 border-b border-red-100">{createError}</p>}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-slate-50">
        {loading
          ? <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>
          : notes.length === 0
            ? <p className="text-center text-sm text-gray-400 py-10">No notes yet. Create one to get started.</p>
            : notes.map(n => (
              <button key={n.id} onClick={() => setActive(n)}
                className="w-full text-left bg-white border border-gray-200 rounded-xl p-3 hover:border-teal-300 transition-colors"
                style={n.color ? { borderLeft: `3px solid ${n.color}` } : undefined}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-navy-700 truncate">{n.title || 'Untitled'}</p>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {n.pinned && <Pin className="w-3.5 h-3.5 text-amber-500" />}
                    {n.shared && <span title="Shared with you"><Users className="w-3.5 h-3.5 text-teal-500" /></span>}
                  </div>
                </div>
                {n.body && <p className="text-xs text-gray-500 mt-1 line-clamp-2 whitespace-pre-wrap">{n.body.slice(0, 160)}</p>}
              </button>
            ))}
      </div>
    </div>
  )
}

function NoteEditor({ note, people, onBack, onChanged }: {
  note: Note; people: Person[]; onBack: () => void; onChanged: () => void
}) {
  const [title, setTitle] = useState(note.title)
  const [body, setBody] = useState(note.body)
  const [pinned, setPinned] = useState(note.pinned)
  const [saved, setSaved] = useState(true)
  const [showShare, setShowShare] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const readOnly = !note.canEdit

  const save = useCallback(async (patch: Record<string, unknown>) => {
    setSaved(false)
    await fetch(`/api/notes/${note.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
    setSaved(true); onChanged()
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
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 flex-shrink-0">
        <button onClick={onBack} className="text-xs text-gray-500 hover:text-navy-700 flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" /> Notes
        </button>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-400 mr-1">{saved ? 'Saved' : 'Saving…'}</span>
          {!readOnly && <button onClick={togglePin} title={pinned ? 'Unpin' : 'Pin'} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">{pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}</button>}
          {note.mine && <button onClick={() => setShowShare(s => !s)} title="Share" className={`p-1.5 rounded-lg hover:bg-gray-100 ${showShare ? 'text-teal-600 bg-teal-50' : 'text-gray-500'}`}><Share2 className="w-4 h-4" /></button>}
          {note.mine && <button onClick={del} title="Delete" className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>}
        </div>
      </div>
      {showShare && note.mine && <SharePanel noteId={note.id} />}
      <div className="flex-1 overflow-y-auto p-4 bg-white">
        <input
          value={title}
          disabled={readOnly}
          onChange={e => { setTitle(e.target.value); triggerSave({ title: e.target.value }) }}
          placeholder="Title"
          className="w-full text-base font-semibold text-navy-700 border-0 outline-none mb-2 bg-transparent placeholder:text-gray-300"
        />
        <MentionTextarea
          value={body}
          disabled={readOnly}
          people={people}
          minRows={8}
          placeholder="Start typing… use @ to mention someone"
          onChange={val => { setBody(val); triggerSave({ body: val }) }}
          onMention={(person, newVal) => {
            setBody(newVal)
            save({ body: newVal, mentionedUserId: person.id })
          }}
        />
        {readOnly && <p className="text-xs text-gray-400 italic mt-2">Shared with you (view only).</p>}
      </div>
    </div>
  )
}

function SharePanel({ noteId }: { noteId: string }) {
  const [people, setPeople] = useState<Person[]>([])
  const [shares, setShares] = useState<ShareRow[]>([])
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [d, s] = await Promise.all([fetch('/api/directory'), fetch(`/api/notes/${noteId}/share`)])
    if (d.ok) setPeople((await d.json()).people ?? [])
    if (s.ok) setShares((await s.json()).shares ?? [])
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

  return (
    <div className="border-b border-gray-100 bg-slate-50 p-3 max-h-48 overflow-y-auto flex-shrink-0">
      <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Share with</p>
      {shares.length > 0 && (
        <div className="mb-2 space-y-1">
          {shares.map(s => (
            <div key={s.user_id} className="flex items-center justify-between text-xs bg-white border border-gray-200 rounded-lg px-2 py-1">
              <span className="text-navy-700 truncate">{s.profiles?.full_name ?? 'User'}</span>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button onClick={() => share(s.user_id, !s.can_edit)} disabled={busy} className="text-[10px] px-1.5 py-0.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50">{s.can_edit ? 'Can edit' : 'View only'}</button>
                <button onClick={() => unshare(s.user_id)} disabled={busy} className="text-gray-300 hover:text-red-500"><X className="w-3 h-3" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="space-y-0.5">
        {people.filter(p => !sharedIds.has(p.id)).map(p => (
          <button key={p.id} onClick={() => share(p.id, false)} disabled={busy} className="w-full text-left text-xs text-gray-600 px-2 py-1 rounded hover:bg-white flex items-center justify-between">
            <span className="truncate">{p.full_name ?? 'User'}</span>
            <Plus className="w-3 h-3 text-gray-400" />
          </button>
        ))}
      </div>
      {busy && <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1"><Check className="w-3 h-3" /> updating…</p>}
    </div>
  )
}
