'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Plus, Trash2, Pin, PinOff, ArrowLeft, Users, Loader2, Check, Share2, X, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { MentionTextarea } from '@/components/notes/MentionTextarea'

type NoteFilter = 'all' | 'mine' | 'shared' | 'pinned'

interface Note {
  id: string; title: string; body: string; color: string | null; pinned: boolean
  updated_at: string; mine: boolean; canEdit: boolean; shared: boolean
  sop_id: string | null; sopTitle: string | null
}
interface Person { id: string; full_name: string | null }
interface ShareRow { user_id: string; can_edit: boolean; profiles?: { full_name: string | null } | null }

const FILTER_LABELS: Record<NoteFilter, string> = {
  all: 'All', mine: 'Mine', shared: 'Shared', pinned: 'Pinned',
}

export function NotesPanel({ space }: { space: string }) {
  const [notes, setNotes] = useState<Note[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<NoteFilter>('all')
  const [search, setSearch] = useState('')
  const [active, setActive] = useState<Note | null>(null)
  const [createError, setCreateError] = useState('')

  const qs = space === 'personal' ? '?space=personal' : `?teamId=${space}`

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/notes${qs}`)
      if (r.ok) setNotes((await r.json()).notes ?? [])
    } finally { setLoading(false) }
  }, [qs])

  useEffect(() => { load(); setActive(null); setFilter('all'); setSearch('') }, [load])
  useEffect(() => {
    fetch('/api/directory').then(r => r.ok ? r.json() : null).then(d => { if (d) setPeople(d.people ?? []) })
  }, [])

  async function createNote() {
    setCreateError('')
    const teamId = space === 'personal' ? null : space
    const r = await fetch('/api/notes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '', body: '', teamId }),
    })
    if (r.ok) { const n = (await r.json()).note as Note; setNotes(prev => [n, ...prev]); setActive(n) }
    else { const d = await r.json().catch(() => ({})); setCreateError(d.error ?? 'Could not create.') }
  }

  // Filtered notes
  const sq = search.toLowerCase()
  const filtered = notes.filter(n => {
    if (sq && !n.title.toLowerCase().includes(sq) && !n.body.toLowerCase().includes(sq)) return false
    if (filter === 'mine' && !n.mine) return false
    if (filter === 'shared' && !n.shared) return false
    if (filter === 'pinned' && !n.pinned) return false
    return true
  })

  if (active) return (
    <NoteEditor note={active} people={people} isTeamNote={space !== 'personal'}
      onBack={() => { setActive(null); load() }} onChanged={load} />
  )

  return (
    <div className="flex flex-col h-full">
      {/* Search + filter */}
      <div className="px-3 pt-2 pb-1.5 border-b border-gray-100 space-y-1.5 flex-shrink-0">
        <div className="flex items-center gap-2">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search notes…"
            className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500 bg-white" />
          <button onClick={createNote} className="flex items-center gap-1 text-xs font-medium text-teal-600 hover:text-teal-700 flex-shrink-0">
            <Plus className="w-3.5 h-3.5" /> New
          </button>
        </div>
        <div className="flex gap-1">
          {(Object.keys(FILTER_LABELS) as NoteFilter[]).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${filter === f ? 'bg-navy-700 text-white border-navy-700' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>
              {FILTER_LABELS[f]}
            </button>
          ))}
          {(search || filter !== 'all') && filtered.length !== notes.length && (
            <span className="text-[11px] text-gray-400 ml-auto self-center">{filtered.length}/{notes.length}</span>
          )}
        </div>
      </div>

      {createError && <p className="text-xs text-red-500 px-3 py-1.5 bg-red-50">{createError}</p>}

      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-slate-50">
        {loading ? <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>
          : filtered.length === 0
            ? <p className="text-center text-xs text-gray-400 py-8">
                {search || filter !== 'all' ? 'No notes match.' : 'No notes yet.'}
              </p>
            : filtered.map(n => (
              <button key={n.id} onClick={() => setActive(n)}
                className="w-full text-left bg-white border border-gray-200 rounded-xl p-3 hover:border-teal-300 transition-colors"
                style={n.color ? { borderLeft: `3px solid ${n.color}` } : undefined}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-navy-700 truncate">{n.title || 'Untitled'}</p>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {n.pinned && <Pin className="w-3.5 h-3.5 text-amber-500" />}
                    {n.shared && <span title="Shared"><Users className="w-3.5 h-3.5 text-teal-500" /></span>}
                  </div>
                </div>
                {n.body && <p className="text-xs text-gray-500 mt-1 line-clamp-2 whitespace-pre-wrap">{n.body.slice(0, 120)}</p>}
                {n.sop_id && n.sopTitle && (
                  <p className="text-[10px] text-teal-500 mt-1 flex items-center gap-0.5 truncate">🔗 {n.sopTitle}</p>
                )}
              </button>
            ))}
        <Link href="/notes" className="flex items-center justify-center gap-1 text-xs text-gray-400 hover:text-teal-600 py-2 mt-1">
          <ExternalLink className="w-3 h-3" /> Open full Notes
        </Link>
      </div>
    </div>
  )
}

// ─── Note editor (hub version) ────────────────────────────────────────────────

function NoteEditor({ note, people, isTeamNote, onBack, onChanged }: {
  note: Note; people: Person[]; isTeamNote: boolean
  onBack: () => void; onChanged: () => void
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

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 flex-shrink-0">
        <button onClick={onBack} className="text-xs text-gray-500 hover:text-navy-700 flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" /> Notes
        </button>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-400">{saved ? 'Saved' : 'Saving…'}</span>
          {!readOnly && <button onClick={() => setPinned(v => { save({ pinned: !v }); return !v })}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-400">
            {pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
          </button>}
          {note.mine && !isTeamNote && <button onClick={() => setShowShare(s => !s)}
            className={`p-1.5 rounded hover:bg-gray-100 ${showShare ? 'text-teal-600' : 'text-gray-400'}`}>
            <Share2 className="w-3.5 h-3.5" />
          </button>}
          {note.mine && <button onClick={del} className="p-1.5 rounded hover:bg-red-50 text-gray-300 hover:text-red-500">
            <Trash2 className="w-3.5 h-3.5" />
          </button>}
        </div>
      </div>
      {showShare && <SharePanel noteId={note.id} people={people} />}
      {note.sop_id && note.sopTitle && (
        <Link href={`/sops/${note.sop_id}`} className="mx-3 mt-2 flex items-center gap-1.5 text-xs text-teal-600 bg-teal-50 border border-teal-200 rounded-lg px-2.5 py-1.5 hover:underline">
          🔗 {note.sopTitle} <ExternalLink className="w-3 h-3" />
        </Link>
      )}
      <div className="flex-1 overflow-y-auto p-3 bg-white">
        <input value={title} disabled={readOnly} onChange={e => { setTitle(e.target.value); triggerSave({ title: e.target.value }) }}
          placeholder="Title" className="w-full text-base font-semibold text-navy-700 border-0 outline-none mb-2 bg-transparent placeholder:text-gray-300" />
        <MentionTextarea value={body} disabled={readOnly} people={people} minRows={8}
          placeholder="Type @ to mention someone…"
          onChange={val => { setBody(val); triggerSave({ body: val }) }}
          onMention={(person, newVal) => { setBody(newVal); save({ body: newVal, mentionedUserId: person.id }) }}
        />
        {readOnly && <p className="text-xs text-gray-400 italic mt-2">Shared with you (view only).</p>}
      </div>
    </div>
  )
}

function SharePanel({ noteId, people }: { noteId: string; people: Person[] }) {
  const [shares, setShares] = useState<ShareRow[]>([])
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    const r = await fetch(`/api/notes/${noteId}/share`); if (r.ok) setShares((await r.json()).shares ?? [])
  }, [noteId])
  useEffect(() => { load() }, [load])
  async function share(userId: string, canEdit: boolean) { setBusy(true); await fetch(`/api/notes/${noteId}/share`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, canEdit }) }); await load(); setBusy(false) }
  async function unshare(userId: string) { setBusy(true); await fetch(`/api/notes/${noteId}/share`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) }); await load(); setBusy(false) }
  const sharedIds = new Set(shares.map(s => s.user_id))
  return (
    <div className="border-b border-gray-100 bg-slate-50 p-3 max-h-40 overflow-y-auto flex-shrink-0">
      <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Share with</p>
      {shares.length > 0 && <div className="mb-2 space-y-1">{shares.map(s => (
        <div key={s.user_id} className="flex items-center justify-between text-xs bg-white border border-gray-200 rounded-lg px-2 py-1">
          <span className="truncate">{s.profiles?.full_name ?? 'User'}</span>
          <div className="flex items-center gap-1.5">
            <button onClick={() => share(s.user_id, !s.can_edit)} disabled={busy} className="text-[10px] px-1.5 py-0.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50">{s.can_edit ? 'Edit' : 'View'}</button>
            <button onClick={() => unshare(s.user_id)} disabled={busy} className="text-gray-300 hover:text-red-500"><X className="w-3 h-3" /></button>
          </div>
        </div>
      ))}</div>}
      <div className="space-y-0.5">{people.filter(p => !sharedIds.has(p.id)).map(p => (
        <button key={p.id} onClick={() => share(p.id, false)} disabled={busy}
          className="w-full text-left text-xs text-gray-600 px-2 py-1 rounded hover:bg-white flex items-center justify-between">
          <span className="truncate">{p.full_name ?? 'User'}</span>
          <Plus className="w-3 h-3 text-gray-400" />
        </button>
      ))}</div>
      {busy && <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1"><Check className="w-3 h-3" /> saving…</p>}
    </div>
  )
}
