'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Plus, Send, Loader2, History, FileText, Trash2, ArrowLeft, Sparkles, MessageCircle } from 'lucide-react'

interface SopSource { id: string; title: string }

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const regex = /(\*\*([^*]+)\*\*|\*([^*\n]+)\*|`([^`]+)`)/g
  let lastIndex = 0; let m: RegExpExecArray | null; let i = 0
  while ((m = regex.exec(text)) !== null) {
    if (m.index > lastIndex) nodes.push(text.slice(lastIndex, m.index))
    if (m[2] !== undefined) nodes.push(<strong key={`${keyPrefix}-b${i}`}>{m[2]}</strong>)
    else if (m[3] !== undefined) nodes.push(<em key={`${keyPrefix}-i${i}`}>{m[3]}</em>)
    else if (m[4] !== undefined) nodes.push(<code key={`${keyPrefix}-c${i}`} className="bg-gray-100 rounded px-1 py-0.5 text-[12px] font-mono">{m[4]}</code>)
    lastIndex = regex.lastIndex; i++
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex))
  return nodes
}

function FormattedMessage({ text }: { text: string }) {
  const lines = text.split('\n'); const blocks: React.ReactNode[] = []
  let i = 0; let key = 0
  const bulletRe = /^[-*•]\s+(.*)/; const numberedRe = /^\d+\.\s+(.*)/
  while (i < lines.length) {
    const trimmed = lines[i].trim()
    if (trimmed === '') { i++; continue }
    if (bulletRe.test(trimmed)) {
      const items: string[] = []
      while (i < lines.length && bulletRe.test(lines[i].trim())) { items.push(bulletRe.exec(lines[i].trim())![1]); i++ }
      const k = key++
      blocks.push(<ul key={k} className="list-disc pl-4 space-y-0.5 my-1.5">{items.map((it, idx) => <li key={idx}>{renderInline(it, `ul${k}-${idx}`)}</li>)}</ul>)
      continue
    }
    if (numberedRe.test(trimmed)) {
      const items: string[] = []
      while (i < lines.length && numberedRe.test(lines[i].trim())) { items.push(numberedRe.exec(lines[i].trim())![1]); i++ }
      const k = key++
      blocks.push(<ol key={k} className="list-decimal pl-4 space-y-0.5 my-1.5">{items.map((it, idx) => <li key={idx}>{renderInline(it, `ol${k}-${idx}`)}</li>)}</ol>)
      continue
    }
    const para: string[] = []
    while (i < lines.length) { const t = lines[i].trim(); if (t === '' || bulletRe.test(t) || numberedRe.test(t)) break; para.push(t); i++ }
    const k = key++
    blocks.push(<p key={k} className="my-1.5 first:mt-0 last:mb-0">{renderInline(para.join(' '), `p${k}`)}</p>)
  }
  return <>{blocks}</>
}

interface ChatMessage { role: 'user' | 'assistant'; content: string; sources?: SopSource[] }
interface Conversation { id: string; title: string; updated_at: string }

export function ChatPanel({ onNavigate }: { onNavigate?: () => void }) {
  const [view, setView] = useState<'chat' | 'history'>('chat')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [messages, sending])

  async function loadConversations() {
    try { const res = await fetch('/api/chat'); if (res.ok) setConversations((await res.json()).conversations ?? []) } catch { /* ignore */ }
  }
  function newChat() { setConversationId(null); setMessages([]); setView('chat') }
  async function openConversation(id: string) {
    setConversationId(id); setView('chat'); setMessages([])
    try {
      const res = await fetch(`/api/chat/${id}`)
      if (res.ok) {
        const data = await res.json()
        setMessages((data.messages ?? []).map((m: ChatMessage) => ({ role: m.role, content: m.content, sources: m.sources ?? undefined })))
      }
    } catch { /* ignore */ }
  }
  async function deleteConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation(); setConversations(prev => prev.filter(c => c.id !== id))
    if (conversationId === id) newChat()
    try { await fetch(`/api/chat/${id}`, { method: 'DELETE' }) } catch { /* ignore */ }
  }
  async function send() {
    const text = input.trim(); if (!text || sending) return
    setInput(''); setSending(true); setMessages(prev => [...prev, { role: 'user', content: text }])
    try {
      const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId, message: text }) })
      const data = await res.json()
      if (!res.ok) setMessages(prev => [...prev, { role: 'assistant', content: data.error ?? 'Something went wrong.' }])
      else {
        if (!conversationId && data.conversationId) { setConversationId(data.conversationId); loadConversations() }
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply, sources: data.sources }])
      }
    } catch { setMessages(prev => [...prev, { role: 'assistant', content: 'Network error — please try again.' }]) }
    finally { setSending(false) }
  }
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-end gap-1 px-3 py-1.5 border-b border-gray-100 flex-shrink-0">
        {view === 'history'
          ? <button onClick={() => setView('chat')} className="text-xs text-gray-500 hover:text-navy-700 flex items-center gap-1"><ArrowLeft className="w-3.5 h-3.5" /> Back</button>
          : <>
              <button onClick={() => { setView('history'); loadConversations() }} title="History" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><History className="w-4 h-4" /></button>
              <button onClick={newChat} title="New chat" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><Plus className="w-4 h-4" /></button>
            </>}
      </div>

      {view === 'history' ? (
        <div className="flex-1 overflow-y-auto p-2">
          {conversations.length === 0 ? <p className="text-center text-sm text-gray-400 py-10">No previous chats yet.</p> :
            conversations.map(c => (
              <button key={c.id} onClick={() => openConversation(c.id)} className="w-full text-left group flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-gray-50">
                <MessageCircle className="w-4 h-4 text-gray-300 flex-shrink-0" />
                <span className="flex-1 truncate text-sm text-navy-700">{c.title}</span>
                <span onClick={e => deleteConversation(c.id, e)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></span>
              </button>
            ))}
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-slate-50">
            {messages.length === 0 && !sending && (
              <div className="text-center py-8 px-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center mx-auto mb-3"><Sparkles className="w-6 h-6 text-white" /></div>
                <p className="text-sm font-medium text-navy-700">How can I help?</p>
                <p className="text-xs text-gray-400 mt-1 mb-4">Tell me the client and I&apos;ll find the exact process.</p>
                <div className="space-y-1.5 text-left">
                  {['What is the check-in process for…?', 'Help me handle a guest extension request', 'Draft a late check-in message for a guest'].map(s => (
                    <button key={s} onClick={() => setInput(s)} className="block w-full text-left text-xs text-navy-600 bg-white border border-gray-200 rounded-lg px-3 py-2 hover:border-teal-300 hover:bg-teal-50/40">{s}</button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={cn('max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed', m.role === 'user' ? 'bg-navy-700 text-white rounded-br-sm whitespace-pre-wrap' : 'bg-white border border-gray-200 text-gray-700 rounded-bl-sm')}>
                  {m.role === 'assistant' ? <FormattedMessage text={m.content} /> : m.content}
                  {m.role === 'assistant' && m.sources && m.sources.length > 0 && (
                    <div className="mt-2.5 pt-2.5 border-t border-gray-100 space-y-1">
                      <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Sources</p>
                      {m.sources.map(s => (
                        <Link key={s.id} href={`/sops/${s.id}`} onClick={onNavigate} className="flex items-center gap-1.5 text-xs text-teal-600 hover:text-teal-700 hover:underline">
                          <FileText className="w-3 h-3 flex-shrink-0" /><span className="truncate">{s.title}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-3.5 py-2.5 flex items-center gap-2 text-sm text-gray-400"><Loader2 className="w-4 h-4 animate-spin text-teal-500" /> Searching the SOPs…</div>
              </div>
            )}
          </div>
          <div className="border-t border-gray-200 p-3 flex-shrink-0 bg-white">
            <div className="flex items-end gap-2">
              <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={onKeyDown} rows={1} placeholder="Ask about a SOP…" className="flex-1 resize-none max-h-28 text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
              <button onClick={send} disabled={!input.trim() || sending} className="w-10 h-10 flex-shrink-0 rounded-xl bg-navy-700 text-white flex items-center justify-center hover:bg-navy-800 disabled:opacity-40"><Send className="w-4 h-4" /></button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
