'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Loader2, Brain, MessageSquarePlus, Lightbulb, Users, ShieldCheck,
  Plus, Trash2, GripVertical, Save, Sparkles,
} from 'lucide-react'

type BotSection = 'principle' | 'person' | 'guardrail'

interface Item {
  content: string
  is_active: boolean
}

const SECTION_META: Record<BotSection, {
  title: string
  icon: React.ReactNode
  blurb: string
  placeholder: string
}> = {
  principle: {
    title: 'Principles — our ways',
    icon: <Lightbulb className="w-5 h-5 text-amber-500" />,
    blurb: 'How the bot should behave: tone, rules of thumb, what to ask before answering.',
    placeholder: 'e.g. Always confirm which client the question is about before searching.',
  },
  person: {
    title: 'People & Roles',
    icon: <Users className="w-5 h-5 text-teal-600" />,
    blurb: 'Who’s who, so the bot can point the team to the right human.',
    placeholder: 'e.g. Josef — manager / super-admin; escalate billing disputes to him.',
  },
  guardrail: {
    title: 'Guardrails & Fallbacks',
    icon: <ShieldCheck className="w-5 h-5 text-violet-600" />,
    blurb: 'Hard rules and what to do when there is no answer.',
    placeholder: 'e.g. If no SOP exists for the client, tell them to post in the WhatsApp backup chat.',
  },
}

const SECTIONS: BotSection[] = ['principle', 'person', 'guardrail']

export function BotTrainingManager() {
  const [tab, setTab] = useState<'behaviour' | 'ingest'>('behaviour')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [items, setItems] = useState<Record<BotSection, Item[]>>({
    principle: [], person: [], guardrail: [],
  })
  const [saving, setSaving] = useState<BotSection | null>(null)
  const [savedMsg, setSavedMsg] = useState<Record<BotSection, string>>({
    principle: '', person: '', guardrail: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/bot-config')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load')
      const next: Record<BotSection, Item[]> = { principle: [], person: [], guardrail: [] }
      for (const s of SECTIONS) {
        next[s] = ((data.sections?.[s] ?? []) as { content: string; is_active: boolean }[])
          .map(r => ({ content: r.content, is_active: r.is_active }))
      }
      setItems(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function updateItem(section: BotSection, idx: number, content: string) {
    setItems(prev => {
      const arr = [...prev[section]]
      arr[idx] = { ...arr[idx], content }
      return { ...prev, [section]: arr }
    })
  }

  function addItem(section: BotSection) {
    setItems(prev => ({ ...prev, [section]: [...prev[section], { content: '', is_active: true }] }))
  }

  function removeItem(section: BotSection, idx: number) {
    setItems(prev => ({ ...prev, [section]: prev[section].filter((_, i) => i !== idx) }))
  }

  function move(section: BotSection, idx: number, dir: -1 | 1) {
    setItems(prev => {
      const arr = [...prev[section]]
      const j = idx + dir
      if (j < 0 || j >= arr.length) return prev
      ;[arr[idx], arr[j]] = [arr[j], arr[idx]]
      return { ...prev, [section]: arr }
    })
  }

  async function saveSection(section: BotSection) {
    setSaving(section)
    setSavedMsg(prev => ({ ...prev, [section]: '' }))
    try {
      const payload = items[section].filter(it => it.content.trim().length > 0)
      const res = await fetch('/api/admin/bot-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, items: payload }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      setSavedMsg(prev => ({ ...prev, [section]: `Saved ${data.count} item${data.count === 1 ? '' : 's'}.` }))
    } catch (e) {
      setSavedMsg(prev => ({ ...prev, [section]: e instanceof Error ? e.message : 'Save failed' }))
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Brain className="w-6 h-6 text-teal-600" /> AI Training
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Teach the knowledge-base assistant how to behave, who&apos;s who, and what to do when there&apos;s no SOP.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        <TabBtn active={tab === 'behaviour'} onClick={() => setTab('behaviour')} icon={<Brain className="w-4 h-4" />}>
          Behaviour
        </TabBtn>
        <TabBtn active={tab === 'ingest'} onClick={() => setTab('ingest')} icon={<MessageSquarePlus className="w-4 h-4" />}>
          Teach from conversations
        </TabBtn>
      </div>

      {tab === 'ingest' ? (
        <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-8 text-center">
          <Sparkles className="w-8 h-8 text-violet-400 mx-auto mb-3" />
          <h2 className="font-semibold text-slate-700">Coming next</h2>
          <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
            Drop a WhatsApp export or paste a conversation. The bot will redact personal details,
            find which SOPs you&apos;re missing, and auto-draft them for your review.
          </p>
        </div>
      ) : loading ? (
        <div className="flex items-center gap-3 text-slate-500 py-16 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading bot configuration…
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">
          <p className="font-semibold mb-2">Could not load</p>
          <p className="text-sm">{error}</p>
          <button onClick={load} className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">
            Retry
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {SECTIONS.map(section => {
            const meta = SECTION_META[section]
            const list = items[section]
            return (
              <div key={section} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                  {meta.icon}
                  <div className="flex-1">
                    <h2 className="font-semibold text-slate-900">{meta.title}</h2>
                    <p className="text-xs text-slate-400">{meta.blurb}</p>
                  </div>
                  <span className="text-sm text-slate-400">{list.length}</span>
                </div>

                <div className="p-4 space-y-2">
                  {list.length === 0 && (
                    <p className="text-sm text-slate-400 px-1 py-2">No items yet — add one below.</p>
                  )}
                  {list.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <div className="flex flex-col pt-2 text-slate-300">
                        <button onClick={() => move(section, idx, -1)} disabled={idx === 0}
                          className="hover:text-slate-500 disabled:opacity-30" title="Move up">
                          <GripVertical className="w-4 h-4" />
                        </button>
                      </div>
                      <textarea
                        value={item.content}
                        onChange={e => updateItem(section, idx, e.target.value)}
                        placeholder={meta.placeholder}
                        rows={2}
                        className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-200 resize-y"
                      />
                      <button
                        onClick={() => removeItem(section, idx)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg mt-0.5"
                        title="Remove"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}

                  <div className="flex items-center justify-between pt-2">
                    <button
                      onClick={() => addItem(section)}
                      className="text-sm text-teal-700 font-medium flex items-center gap-1.5 hover:text-teal-800"
                    >
                      <Plus className="w-4 h-4" /> Add item
                    </button>
                    <div className="flex items-center gap-3">
                      {savedMsg[section] && <span className="text-xs text-teal-600 font-medium">{savedMsg[section]}</span>}
                      <button
                        onClick={() => saveSection(section)}
                        disabled={saving === section}
                        className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 flex items-center gap-2 disabled:opacity-50"
                      >
                        {saving === section
                          ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                          : <><Save className="w-4 h-4" /> Save {meta.title.split(' ')[0]}</>}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}

          <p className="text-xs text-slate-400">
            Changes take effect on the next chat message. The assistant always keeps its core Hospiria context — these add to it.
          </p>
        </div>
      )}
    </div>
  )
}

function TabBtn({ active, onClick, icon, children }: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium flex items-center gap-2 border-b-2 -mb-px transition-colors ${
        active
          ? 'border-teal-600 text-teal-700'
          : 'border-transparent text-slate-500 hover:text-slate-700'
      }`}
    >
      {icon}{children}
    </button>
  )
}
