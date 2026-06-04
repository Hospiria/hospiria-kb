'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Loader2, Trash2, CornerDownRight, Send, MessageSquare } from 'lucide-react'
import { MentionTextarea } from '@/components/notes/MentionTextarea'

interface Comment {
  id: string; author_id: string; parent_id: string | null
  body: string; created_at: string; authorName: string; mine: boolean
}
interface Person { id: string; full_name: string | null }

function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (d < 60) return 'just now'
  if (d < 3600) return `${Math.floor(d / 60)}m ago`
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function CommentsPanel({ todoId, people }: { todoId: string; people: Person[] }) {
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [replyTo, setReplyTo] = useState<Comment | null>(null)
  const [sending, setSending] = useState(false)
  const [mentionedUserId, setMentionedUserId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/todos/${todoId}/comments`)
      if (r.ok) setComments((await r.json()).comments ?? [])
    } finally { setLoading(false) }
  }, [todoId])

  useEffect(() => { load() }, [load])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [comments])

  async function send() {
    const body = input.trim(); if (!body || sending) return
    setSending(true)
    try {
      const r = await fetch(`/api/todos/${todoId}/comments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, parentId: replyTo?.id ?? null, mentionedUserId }),
      })
      if (r.ok) { setInput(''); setReplyTo(null); setMentionedUserId(null); load() }
    } finally { setSending(false) }
  }

  async function del(id: string) {
    await fetch(`/api/todo-comments/${id}`, { method: 'DELETE' })
    setComments(prev => prev.filter(c => c.id !== id))
  }

  // Top-level comments and their replies
  const topLevel = comments.filter(c => !c.parent_id)
  const repliesOf = (id: string) => comments.filter(c => c.parent_id === id)

  return (
    <div className="mt-4 border-t border-gray-100 pt-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
        <MessageSquare className="w-3.5 h-3.5" /> Comments {comments.length > 0 && `(${comments.length})`}
      </p>

      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-gray-300" /></div>
      ) : (
        <div className="space-y-3 mb-3">
          {topLevel.length === 0 && <p className="text-xs text-gray-400 italic">No comments yet. Be the first.</p>}
          {topLevel.map(c => (
            <div key={c.id}>
              <CommentBubble comment={c} onDelete={() => del(c.id)} onReply={() => setReplyTo(c)} />
              {repliesOf(c.id).map(r => (
                <div key={r.id} className="ml-6 mt-1.5 flex items-start gap-1.5">
                  <CornerDownRight className="w-3 h-3 text-gray-300 mt-1 flex-shrink-0" />
                  <CommentBubble comment={r} onDelete={() => del(r.id)} onReply={() => setReplyTo(c)} small />
                </div>
              ))}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      {replyTo && (
        <div className="flex items-center gap-2 mb-2 text-xs text-gray-500 bg-gray-50 px-3 py-1.5 rounded-lg">
          <CornerDownRight className="w-3 h-3" /> Replying to <strong>{replyTo.authorName}</strong>
          <button onClick={() => setReplyTo(null)} className="ml-auto text-gray-400 hover:text-gray-600">✕</button>
        </div>
      )}

      <div className="flex items-end gap-2">
        <MentionTextarea
          value={input}
          people={people}
          minRows={1}
          placeholder="Add a comment… @ to mention"
          className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
          onChange={setInput}
          onMention={(person, val) => { setInput(val); setMentionedUserId(person.id) }}
        />
        <button onClick={send} disabled={!input.trim() || sending}
          className="w-9 h-9 flex-shrink-0 rounded-xl bg-teal-600 text-white flex items-center justify-center hover:bg-teal-700 disabled:opacity-40">
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )
}

function CommentBubble({ comment, onDelete, onReply, small }: {
  comment: Comment; onDelete: () => void; onReply: () => void; small?: boolean
}) {
  return (
    <div className={`group bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 ${small ? 'text-xs' : 'text-sm'}`}>
      <div className="flex items-center gap-2 mb-1">
        <div className={`rounded-full bg-navy-700 text-white flex items-center justify-center font-bold flex-shrink-0 ${small ? 'w-5 h-5 text-[10px]' : 'w-6 h-6 text-[11px]'}`}>
          {comment.authorName[0].toUpperCase()}
        </div>
        <span className="font-semibold text-navy-700">{comment.authorName}</span>
        <span className="text-gray-400 text-[11px] ml-auto">{timeAgo(comment.created_at)}</span>
      </div>
      <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{comment.body}</p>
      <div className="flex items-center gap-3 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onReply} className="text-[11px] text-gray-400 hover:text-teal-600">Reply</button>
        {comment.mine && <button onClick={onDelete} className="text-[11px] text-gray-400 hover:text-red-500 flex items-center gap-0.5"><Trash2 className="w-3 h-3" /> Delete</button>}
      </div>
    </div>
  )
}
