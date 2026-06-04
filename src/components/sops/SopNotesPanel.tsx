'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Lock, Globe, Loader2, StickyNote } from 'lucide-react'
import { MentionTextarea } from '@/components/notes/MentionTextarea'

interface SopNote {
  id: string; author_id: string; team_id: string | null; body: string
  created_at: string; authorName: string; teamName: string | null; mine: boolean; isTeam: boolean
}
interface Team { id: string; name: string }
interface Person { id: string; full_name: string | null }

function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (d < 60) return 'just now'
  if (d < 3600) return `${Math.floor(d / 60)}m ago`
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function SopNotesPanel({ sopId, teams, people }: {
  sopId: string; teams: Team[]; people: Person[]
}) {
  const [notes, setNotes] = useState<SopNote[]>([])
  const [loading, setLoading] = useState(true)
  const [body, setBody] = useState('')
  const [teamId, setTeamId] = useState<string>('')  // '' = personal
  const [mentionedUserId, setMentionedUserId] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/sops/${sopId}/notes`)
      if (r.ok) setNotes((await r.json()).notes ?? [])
    } finally { setLoading(false) }
  }, [sopId])

  useEffect(() => { load() }, [load])

  async function submit() {
    const text = body.trim(); if (!text || sending) return
    setSending(true); setError('')
    try {
      const r = await fetch(`/api/sops/${sopId}/notes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text, teamId: teamId || null, mentionedUserId }),
      })
      if (r.ok) { setBody(''); setMentionedUserId(null); load() }
      else { const d = await r.json().catch(() => ({})); setError(d.error ?? 'Failed to save.') }
    } finally { setSending(false) }
  }

  async function del(id: string) {
    await fetch(`/api/sop-notes/${id}`, { method: 'DELETE' })
    setNotes(prev => prev.filter(n => n.id !== id))
  }

  const personal = notes.filter(n => !n.isTeam)
  const team = notes.filter(n => n.isTeam)

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <StickyNote className="w-4 h-4 text-teal-500" />
        <p className="text-sm font-semibold text-navy-700">Notes</p>
        <span className="text-xs text-gray-400 ml-1">{notes.length > 0 ? `${notes.length}` : ''}</span>
      </div>

      {/* Compose */}
      <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
        {/* Personal vs Team — dropdown */}
        <div className="flex items-center gap-2">
          {!teamId
            ? <Lock className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            : <Globe className="w-3.5 h-3.5 text-teal-500 flex-shrink-0" />}
          <select
            value={teamId}
            onChange={e => setTeamId(e.target.value)}
            className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white text-gray-700"
          >
            <option value="">🔒 Personal (only me)</option>
            {teams.map(t => (
              <option key={t.id} value={t.id}>🌐 {t.name}</option>
            ))}
          </select>
        </div>
        <MentionTextarea
          value={body} people={people} minRows={2}
          placeholder={teamId ? 'Add a team note… @ to mention' : 'Add a personal note… @ to mention'}
          onChange={setBody}
          onMention={(p, val) => { setBody(val); setMentionedUserId(p.id) }}
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex justify-end">
          <button onClick={submit} disabled={!body.trim() || sending}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white text-xs font-semibold rounded-lg hover:bg-teal-700 disabled:opacity-40">
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add note
          </button>
        </div>
      </div>

      {/* Notes list */}
      {loading ? <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-gray-300" /></div> : (
        <div className="space-y-2">
          {team.length > 0 && (
            <>
              {team.map(n => <NoteItem key={n.id} note={n} onDelete={() => del(n.id)} />)}
            </>
          )}
          {personal.length > 0 && (
            <>
              {team.length > 0 && <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold px-1 pt-1">Your personal notes</p>}
              {personal.map(n => <NoteItem key={n.id} note={n} onDelete={() => del(n.id)} />)}
            </>
          )}
          {notes.length === 0 && <p className="text-xs text-gray-400 italic text-center py-4">No notes yet. Write one above.</p>}
        </div>
      )}
    </div>
  )
}

function NoteItem({ note, onDelete }: { note: SopNote; onDelete: () => void }) {
  return (
    <div className="group bg-white border border-gray-200 rounded-xl px-3 py-2.5">
      <div className="flex items-center gap-2 mb-1.5">
        <div className="w-5 h-5 rounded-full bg-navy-700 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
          {note.authorName[0].toUpperCase()}
        </div>
        <span className="text-xs font-semibold text-navy-700">{note.authorName}</span>
        {note.isTeam && note.teamName && (
          <span className="text-[10px] text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
            <Globe className="w-2.5 h-2.5" /> {note.teamName}
          </span>
        )}
        {!note.isTeam && (
          <span className="text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
            <Lock className="w-2.5 h-2.5" /> Private
          </span>
        )}
        <span className="text-[11px] text-gray-400 ml-auto">{timeAgo(note.created_at)}</span>
      </div>
      <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{note.body}</p>
      {note.mine && (
        <button onClick={onDelete} className="mt-1.5 opacity-0 group-hover:opacity-100 text-[11px] text-gray-400 hover:text-red-500 flex items-center gap-0.5 transition-opacity">
          <Trash2 className="w-3 h-3" /> Delete
        </button>
      )}
    </div>
  )
}
