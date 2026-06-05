'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  Plus, Pin, PinOff, Trash2, Share2, Users, ArrowLeft,
  Loader2, Lock, Globe, X, Search, Link2, ExternalLink,
  FolderPlus, Folder, Pencil, Building2, Image as ImageIcon,
} from 'lucide-react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import LinkExt from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import TextStyle from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import { DeleteConfirmModal, type DeleteTarget } from './DeleteConfirmModal'
import {
  type Person, type Team, type Note, type NoteFolder, type Space,
  SpaceBtn, SpinnerRow, Empty, TrashSection, useSpaceQuery,
} from './workspaceShared'

const FOLDER_COLORS = ['#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#ef4444', '#10b981']

// ─── Notes page ──────────────────────────────────────────────────────────────

export function NotesClient({ currentUserId, people, myTeams }: {
  currentUserId: string; people: Person[]; myTeams: Team[]
}) {
  const [space, setSpace] = useState<Space>('personal')
  const [notes, setNotes] = useState<Note[]>([])
  const [trashNotes, setTrashNotes] = useState<Note[]>([])
  const [folders, setFolders] = useState<NoteFolder[]>([])
  const [loading, setLoading] = useState(true)
  const [showTrash, setShowTrash] = useState(false)
  const [activeNote, setActiveNote] = useState<Note | null>(null)
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [search, setSearch] = useState('')
  const [noteFilter, setNoteFilter] = useState<'all' | 'mine' | 'shared' | 'pinned'>('all')
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null)

  useEffect(() => { setSearch(''); setNoteFilter('all'); setActiveFolderId(null) }, [space])

  const qs = useSpaceQuery(space)

  const loadNotes = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const folderParam = activeFolderId ? `&folderId=${activeFolderId}` : ''
      const [active, trash] = await Promise.all([
        fetch(`/api/notes${qs}${folderParam}`).then(r => r.ok ? r.json() : null),
        fetch(`/api/notes${qs}&trash=true`).then(r => r.ok ? r.json() : null),
      ])
      if (active) setNotes(active.notes ?? [])
      else setError('Could not load notes.')
      if (trash) setTrashNotes(trash.notes ?? [])
    } finally { setLoading(false) }
  }, [qs, activeFolderId])

  const loadFolders = useCallback(async () => {
    const r = await fetch(`/api/note-folders${qs}`).then(r => r.ok ? r.json() : null)
    if (r) setFolders(r.folders ?? [])
  }, [qs])

  useEffect(() => { loadNotes(); loadFolders() }, [loadNotes, loadFolders])

  async function createNote() {
    setError('')
    const teamId = space === 'personal' ? null : space
    const r = await fetch('/api/notes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '', body: '', teamId, folderId: activeFolderId }),
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

  const isTeamSpace = space !== 'personal'
  const activeTeam = myTeams.find(t => t.id === space) ?? null
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
    <div className="max-w-6xl mx-auto">
      {deleteTarget && <DeleteConfirmModal target={deleteTarget} onConfirm={confirmDelete} onCancel={() => setDeleteTarget(null)} />}

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-700">Notes</h1>
          <p className="text-sm text-gray-500 mt-0.5">Capture and share knowledge — personal and team.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <SpaceBtn active={space === 'personal'} onClick={() => setSpace('personal')}><Lock className="w-3.5 h-3.5" /> Personal</SpaceBtn>
          {myTeams.map(t => (
            <SpaceBtn key={t.id} active={space === t.id} onClick={() => setSpace(t.id)}><Globe className="w-3.5 h-3.5" /> {t.name}</SpaceBtn>
          ))}
          <button onClick={createNote} className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700">
            <Plus className="w-4 h-4" /> New note
          </button>
        </div>
      </div>

      <p className="text-xs text-gray-400 mb-4">
        {isTeamSpace ? `Team space — everyone on ${activeTeam?.name ?? 'this team'} can see and edit.` : 'Personal space — only you can see these unless you share.'}
      </p>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">{error}</p>}

      <div className="flex gap-5 items-start">
        {/* Folder sidebar */}
        <FolderSidebar
          folders={folders} activeFolderId={activeFolderId}
          onSelect={setActiveFolderId} space={space} isTeamSpace={isTeamSpace}
          onChanged={loadFolders}
          noteCountByFolder={Object.fromEntries(folders.map(f => [f.id, notes.filter(n => n.folder_id === f.id).length]))}
          allCount={notes.length}
        />

        <div className="flex-1 min-w-0">
          {/* Search + filter */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search notes…"
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
            {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>}
          </div>
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
              <Empty label={search || noteFilter !== 'all' ? 'No notes match.' : activeFolderId ? 'No notes in this folder. Click New note to add one.' : isTeamSpace ? `No team notes yet.` : `No personal notes yet.`} />
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredNotes.map(n => (
                  <NoteCard key={n.id} note={n} folders={folders}
                    onOpen={() => setActiveNote(n)}
                    onDelete={() => setDeleteTarget({ type: 'note', id: n.id, title: n.title, mine: n.mine, ownerName: null, canDelete: n.mine || isTeamSpace })}
                  />
                ))}
              </div>
            )}
            <TrashSection show={showTrash} onToggle={() => setShowTrash(s => !s)} trashNotes={trashNotes} onRestoreNote={restore} />
          </>}
        </div>
      </div>
    </div>
  )
}

// ─── Folder sidebar ──────────────────────────────────────────────────────────

function FolderSidebar({ folders, activeFolderId, onSelect, space, isTeamSpace, onChanged, noteCountByFolder, allCount }: {
  folders: NoteFolder[]; activeFolderId: string | null; onSelect: (id: string | null) => void
  space: Space; isTeamSpace: boolean; onChanged: () => void
  noteCountByFolder: Record<string, number>; allCount: number
}) {
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  async function addFolder() {
    const name = newName.trim(); if (!name) { setAdding(false); return }
    const color = FOLDER_COLORS[folders.length % FOLDER_COLORS.length]
    const r = await fetch('/api/note-folders', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color, teamId: isTeamSpace ? space : null }),
    })
    setNewName(''); setAdding(false)
    if (r.ok) onChanged()
  }
  async function rename(id: string, name: string) {
    setEditingId(null)
    await fetch(`/api/note-folders/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
    onChanged()
  }
  async function deleteFolder(id: string) {
    if (!confirm('Delete this folder? Notes inside will move to All Notes.')) return
    await fetch(`/api/note-folders/${id}`, { method: 'DELETE' })
    if (activeFolderId === id) onSelect(null)
    onChanged()
  }

  return (
    <aside className="w-44 flex-shrink-0 hidden md:block">
      <button onClick={() => onSelect(null)}
        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors mb-1 ${!activeFolderId ? 'bg-navy-700 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
        <Folder className="w-4 h-4 flex-shrink-0" />
        <span className="flex-1 text-left truncate">All Notes</span>
        <span className={`text-[10px] ${!activeFolderId ? 'text-white/70' : 'text-gray-400'}`}>{allCount}</span>
      </button>

      <div className="flex items-center justify-between px-2 mb-1 mt-3">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Folders</p>
        <button onClick={() => setAdding(true)} title="New folder" className="text-gray-400 hover:text-teal-600"><FolderPlus className="w-3.5 h-3.5" /></button>
      </div>

      <nav className="space-y-0.5">
        {folders.map(f => {
          const active = activeFolderId === f.id
          const count = noteCountByFolder[f.id] ?? 0
          return (
            <div key={f.id} className="group relative">
              {editingId === f.id ? (
                <input autoFocus defaultValue={f.name}
                  onBlur={e => rename(f.id, e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') rename(f.id, (e.target as HTMLInputElement).value); if (e.key === 'Escape') setEditingId(null) }}
                  className="w-full text-sm border border-teal-300 rounded-lg px-2 py-1 focus:outline-none" />
              ) : (
                <button onClick={() => onSelect(f.id)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors ${active ? 'bg-navy-700 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: f.color }} />
                  <span className="flex-1 text-left truncate">{f.icon ? `${f.icon} ` : ''}{f.name}</span>
                  {count > 0 && <span className={`text-[10px] ${active ? 'text-white/70' : 'text-gray-400'}`}>{count}</span>}
                </button>
              )}
              {editingId !== f.id && (
                <div className="absolute right-1 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-0.5">
                  <button onClick={() => setEditingId(f.id)} className={`p-0.5 rounded ${active ? 'text-white/70 hover:text-white' : 'text-gray-300 hover:text-gray-600'}`}><Pencil className="w-3 h-3" /></button>
                  <button onClick={() => deleteFolder(f.id)} className={`p-0.5 rounded ${active ? 'text-white/70 hover:text-white' : 'text-gray-300 hover:text-red-500'}`}><Trash2 className="w-3 h-3" /></button>
                </div>
              )}
            </div>
          )
        })}
        {adding ? (
          <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
            onBlur={addFolder} onKeyDown={e => { if (e.key === 'Enter') addFolder(); if (e.key === 'Escape') { setAdding(false); setNewName('') } }}
            placeholder="Folder name…" className="w-full text-sm border border-teal-300 rounded-lg px-2 py-1 focus:outline-none" />
        ) : folders.length === 0 ? (
          <button onClick={() => setAdding(true)} className="w-full text-left text-xs text-gray-400 hover:text-teal-600 px-2 py-1.5 flex items-center gap-1.5">
            <Plus className="w-3 h-3" /> Create a folder
          </button>
        ) : null}
      </nav>
    </aside>
  )
}

// ─── Note card ────────────────────────────────────────────────────────────────

function NoteCard({ note, folders, onOpen, onDelete }: { note: Note; folders: NoteFolder[]; onOpen: () => void; onDelete: () => void }) {
  const folder = folders.find(f => f.id === note.folder_id)
  const sopCount = (note.sops ?? []).length
  const coCount = (note.companies ?? []).length
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
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <p className="text-[10px] text-gray-300">{new Date(note.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
          {folder && <span className="text-[10px] text-gray-400 flex items-center gap-0.5"><Folder className="w-2.5 h-2.5" /> {folder.name}</span>}
          {sopCount > 0 && <span className="text-[10px] text-teal-500 flex items-center gap-0.5"><Link2 className="w-2.5 h-2.5" /> {sopCount}</span>}
          {coCount > 0 && <span className="text-[10px] text-blue-500 flex items-center gap-0.5"><Building2 className="w-2.5 h-2.5" /> {coCount}</span>}
        </div>
      </button>
      <button onClick={e => { e.stopPropagation(); onDelete() }} title="Delete note"
        className="absolute top-3 right-3 p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// ─── Note editor (rich Tiptap) ────────────────────────────────────────────────

function NoteEditor({ note, people, currentUserId, isTeamNote, onBack, onChanged, onDelete }: {
  note: Note; people: Person[]; currentUserId: string; isTeamNote: boolean
  onBack: () => void; onChanged: () => void; onDelete: (n: Note) => void
}) {
  const [title, setTitle] = useState(note.title)
  const [pinned, setPinned] = useState(note.pinned)
  const [saved, setSaved] = useState(true)
  const [saveError, setSaveError] = useState('')
  const [showShare, setShowShare] = useState(false)
  const [linkedSops, setLinkedSops] = useState<{ id: string; title: string }[]>(note.sops ?? (note.sop_id && note.sopTitle ? [{ id: note.sop_id, title: note.sopTitle }] : []))
  const [linkedCompanies, setLinkedCompanies] = useState<{ id: string; name: string }[]>(note.companies ?? [])
  const [showSlash, setShowSlash] = useState(false)
  const [slashQuery, setSlashQuery] = useState('')
  const [slashResults, setSlashResults] = useState<{ label: string; href?: string; action?: () => void }[]>([])
  const [slashPos, setSlashPos] = useState({ top: 0, left: 0 })
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const readOnly = !note.canEdit
  const imgInputRef = useRef<HTMLInputElement>(null)

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

  async function saveSops(sops: { id: string; title: string }[]) {
    setLinkedSops(sops)
    await save({ sopIds: sops.map(s => s.id), sops })
  }
  async function saveCompanies(cos: { id: string; name: string }[]) {
    setLinkedCompanies(cos)
    await save({ companyIds: cos.map(c => c.id) })
  }

  // Image upload
  async function uploadImage(file: File) {
    const form = new FormData(); form.append('file', file)
    const r = await fetch('/api/notes/upload-image', { method: 'POST', body: form })
    if (r.ok) { const { url } = await r.json(); editor?.chain().focus().setImage({ src: url }).run() }
  }

  // Slash command search
  const slashDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  async function handleSlash(q: string, coords: { top: number; left: number }) {
    setSlashQuery(q); setSlashPos(coords)
    if (slashDebounce.current) clearTimeout(slashDebounce.current)
    slashDebounce.current = setTimeout(async () => {
      const { createClient } = await import('@/lib/supabase/client')
      const sb = createClient()
      const term = q.toLowerCase()
      const [{ data: sops }, { data: companies }] = await Promise.all([
        sb.from('sops').select('id, title').ilike('title', `%${term}%`).limit(5),
        sb.from('companies').select('id, name').ilike('name', `%${term}%`).limit(3),
      ])
      const results: { label: string; href?: string; section: string }[] = [
        ...((sops ?? []) as { id: string; title: string }[]).map(s => ({ label: `📄 ${s.title}`, href: `/sops/${s.id}`, section: 'SOPs' })),
        ...((companies ?? []) as { id: string; name: string }[]).map(c => ({ label: `🏢 ${c.name}`, section: 'Companies' })),
        { label: '📝 My Notes', href: '/notes', section: 'Pages' },
        { label: '✅ My To-dos', href: '/todos', section: 'Pages' },
        { label: '📚 My Courses', href: '/quizzes', section: 'Pages' },
      ].filter(r => !term || r.label.toLowerCase().includes(term))
      setSlashResults(results)
    }, 200)
  }

  function insertLink(item: { label: string; href?: string; action?: () => void }) {
    setShowSlash(false)
    if (item.action) { item.action(); return }
    if (item.href) {
      const text = item.label.replace(/^[^\s]+\s/, '') // strip emoji prefix
      editor?.chain().focus().insertContent(`<a href="${item.href}">${text}</a> `).run()
    }
  }

  // Tiptap editor
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      LinkExt.configure({ openOnClick: false }),
      Image.configure({ allowBase64: false }),
      Placeholder.configure({ placeholder: 'Write anything… type / to search and link' }),
      TextStyle,
      Color,
    ],
    content: note.content ?? (note.body ? { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: note.body }] }] } : ''),
    editable: !readOnly,
    immediatelyRender: false,
    onUpdate: ({ editor: e }) => {
      triggerSave({ content: e.getJSON(), body: e.getText().slice(0, 2000) })
    },
  })

  return (
    <div className="max-w-3xl mx-auto">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={onBack} className="text-sm text-gray-500 hover:text-navy-700 flex items-center gap-1.5"><ArrowLeft className="w-4 h-4" /> Notes</button>
        <div className="flex items-center gap-2">
          {isTeamNote && <span className="text-xs text-teal-600 bg-teal-50 border border-teal-200 rounded-full px-2.5 py-0.5 flex items-center gap-1"><Globe className="w-3 h-3" /> Team note</span>}
          <span className="text-xs text-gray-400">{saveError ? <span className="text-red-500">{saveError}</span> : saved ? 'Saved' : 'Saving…'}</span>
          {!readOnly && <button onClick={togglePin} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">{pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}</button>}
          {/* Image upload */}
          {!readOnly && <>
            <button onClick={() => imgInputRef.current?.click()} title="Insert image" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><ImageIcon className="w-4 h-4" /></button>
            <input ref={imgInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f); e.target.value = '' }} />
          </>}
          {!isTeamNote && note.mine && <button onClick={() => setShowShare(s => !s)} className={`p-1.5 rounded-lg hover:bg-gray-100 ${showShare ? 'text-teal-600 bg-teal-50' : 'text-gray-500'}`}><Share2 className="w-4 h-4" /></button>}
          <button onClick={() => onDelete(note)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>

      {showShare && !isTeamNote && note.mine && <SharePanel noteId={note.id} people={people} currentUserId={currentUserId} />}

      {/* SOPs + companies */}
      <div className="flex flex-wrap gap-4 mb-4">
        <div className="flex-1 min-w-[200px]">
          <p className="text-[10px] font-semibold text-gray-400 mb-1 flex items-center gap-1"><Link2 className="w-3 h-3" /> Linked SOPs</p>
          <GenericLinker
            value={linkedSops.map(s => ({ id: s.id, label: s.title }))}
            icon={Link2} placeholder="Search SOPs to link…"
            onSearch={async q => { const { createClient } = await import('@/lib/supabase/client'); const sb = createClient(); const { data } = await sb.from('sops').select('id, title').ilike('title', `%${q}%`).limit(8); return ((data ?? []) as { id: string; title: string }[]).map(s => ({ id: s.id, label: s.title })) }}
            onChange={items => saveSops(items.map(i => ({ id: i.id, title: i.label })))}
          />
        </div>
        <div className="flex-1 min-w-[200px]">
          <p className="text-[10px] font-semibold text-gray-400 mb-1 flex items-center gap-1"><Building2 className="w-3 h-3" /> Linked companies</p>
          <GenericLinker
            value={linkedCompanies.map(c => ({ id: c.id, label: c.name }))}
            icon={Building2} placeholder="Search companies…"
            onSearch={async q => { const res = await fetch(`/api/companies?q=${encodeURIComponent(q)}`); const d = await res.json(); return (d.companies ?? []).map((c: { id: string; name: string }) => ({ id: c.id, label: c.name })) }}
            onChange={items => saveCompanies(items.map(i => ({ id: i.id, name: i.label })))}
          />
        </div>
      </div>

      {/* Title */}
      <input value={title} disabled={readOnly}
        onChange={e => { setTitle(e.target.value); triggerSave({ title: e.target.value }) }}
        placeholder="Note title"
        className="w-full text-2xl font-bold text-navy-700 border-0 outline-none mb-3 bg-transparent placeholder:text-gray-300" />

      {/* Rich editor */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 relative"
        onKeyDown={e => {
          if (!editor) return
          if (e.key === '/') {
            const sel = window.getSelection()
            if (sel?.rangeCount) {
              const r = sel.getRangeAt(0).getBoundingClientRect()
              setSlashPos({ top: r.bottom + window.scrollY + 4, left: r.left + window.scrollX })
            }
            setShowSlash(true); handleSlash('', slashPos)
          } else if (showSlash) {
            if (e.key === 'Escape') { setShowSlash(false); return }
            setTimeout(() => {
              const sel = window.getSelection(); if (!sel?.anchorNode) return
              const text = sel.anchorNode.textContent ?? ''
              const idx = text.lastIndexOf('/')
              if (idx >= 0) handleSlash(text.slice(idx + 1), slashPos)
            }, 0)
          }
        }}>
        <EditorContent editor={editor} className="prose prose-sm max-w-none focus:outline-none min-h-[300px] [&_.ProseMirror]:outline-none [&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-gray-400 [&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none" />
        {readOnly && <p className="text-xs text-gray-400 italic mt-2 pt-2 border-t border-gray-100">Shared with you (view only).</p>}

        {/* Slash command popover */}
        {showSlash && slashResults.length > 0 && typeof document !== 'undefined' && (
          <div className="fixed z-[9999] bg-white border border-gray-200 rounded-xl shadow-xl w-64 py-1.5 max-h-64 overflow-y-auto" style={{ top: slashPos.top, left: slashPos.left }}>
            <p className="text-[10px] font-bold text-gray-400 uppercase px-3 pb-1">Search &amp; link</p>
            {slashResults.map((r, i) => (
              <button key={i} onClick={() => insertLink(r)} className="w-full text-left text-sm px-3 py-1.5 hover:bg-teal-50 text-navy-700 truncate">
                {r.label}
              </button>
            ))}
            <button onClick={() => setShowSlash(false)} className="w-full text-left text-[11px] text-gray-400 px-3 py-1 hover:bg-gray-50">Dismiss (Esc)</button>
          </div>
        )}
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

// ─── Generic linker (reused from todos pattern) ───────────────────────────────

type LinkItem = { id: string; label: string }

function GenericLinker({ value, icon: Icon, placeholder, onSearch, onChange }: {
  value: LinkItem[]; icon: typeof Link2; placeholder: string
  onSearch: (q: string) => Promise<LinkItem[]>
  onChange: (items: LinkItem[]) => void
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<LinkItem[]>([])
  const [searching, setSearching] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  function search(text: string) {
    setQ(text)
    if (debounce.current) clearTimeout(debounce.current)
    if (text.trim().length < 1) { setResults([]); setSearching(false); return }
    setSearching(true)
    debounce.current = setTimeout(async () => {
      const picked = new Set(value.map(v => v.id))
      const res = await onSearch(text.trim()).catch(() => [])
      setResults(res.filter(r => !picked.has(r.id)))
      setSearching(false)
    }, 250)
  }
  function add(item: LinkItem) { onChange([...value, item]); setQ(''); setResults([]) }
  function remove(id: string) { onChange(value.filter(i => i.id !== id)) }

  const sopHrefs = useMemo(() => new Map(value.filter(v => v.id).map(v => [v.id, `/sops/${v.id}`])), [value])

  return (
    <div className="space-y-1.5">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map(item => (
            <span key={item.id} className="flex items-center gap-1 bg-teal-50 border border-teal-200 text-teal-700 text-[11px] rounded-lg px-2 py-1 max-w-[200px]">
              <Icon className="w-3 h-3 flex-shrink-0" />
              {sopHrefs.get(item.id)
                ? <a href={sopHrefs.get(item.id)} target="_blank" rel="noopener noreferrer" className="truncate hover:underline flex items-center gap-0.5">{item.label} <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" /></a>
                : <span className="truncate">{item.label}</span>}
              <button onClick={() => remove(item.id)} className="text-teal-400 hover:text-red-500 flex-shrink-0"><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
        {searching && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 animate-spin" />}
        <input value={q} onChange={e => search(e.target.value)} placeholder={placeholder}
          className="w-full pl-8 pr-8 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
      </div>
      {q.length >= 1 && (
        <div className="border border-gray-100 rounded-lg max-h-36 overflow-y-auto">
          {!searching && results.length === 0 ? <p className="text-[11px] text-gray-400 px-3 py-2">No results.</p>
            : results.map(r => (
              <button key={r.id} onClick={() => add(r)} className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-teal-50 text-navy-700">
                <Icon className="w-3.5 h-3.5 text-teal-400 flex-shrink-0" /><span className="flex-1 truncate">{r.label}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  )
}
