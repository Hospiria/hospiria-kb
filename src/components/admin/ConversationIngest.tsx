'use client'

import { useState, useRef } from 'react'
import {
  Loader2, Upload, Sparkles, ShieldCheck, Plus, FileText,
  CheckCircle2, RefreshCw, PencilLine, ExternalLink, ChevronDown,
} from 'lucide-react'
import Link from 'next/link'

interface CompanyLite { id: string; name: string }
interface Candidate {
  title: string
  summary: string
  client: string | null
  classification: 'new' | 'update' | 'exists'
  matchedSop: { id: string; title: string } | null
  bodyMarkdown?: string
  changeNote?: string
}
interface AnalyseResponse {
  source: 'whatsapp' | 'paste'
  redactionCounts: Record<string, number>
  truncated: boolean
  companies: CompanyLite[]
  candidates: Candidate[]
}

export function ConversationIngest() {
  const [text, setText] = useState('')
  const [analysing, setAnalysing] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<AnalyseResponse | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Editable working copy of "new" drafts + which to create
  const [drafts, setDrafts] = useState<Record<number, { title: string; bodyMarkdown: string; companyIds: Set<string>; selected: boolean }>>({})
  const [creating, setCreating] = useState(false)
  const [createdMsg, setCreatedMsg] = useState('')

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const content = await file.text()
    setText(content)
  }

  async function analyse() {
    if (text.trim().length < 20) { setError('Paste or upload a longer conversation first.'); return }
    setAnalysing(true)
    setError('')
    setResult(null)
    setCreatedMsg('')
    try {
      const res = await fetch('/api/admin/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Analysis failed')
      setResult(data)

      // Seed editable drafts for "new" candidates, with a client pre-matched.
      const seeded: typeof drafts = {}
      ;(data.candidates as Candidate[]).forEach((c, i) => {
        if (c.classification === 'new') {
          const match = c.client
            ? (data.companies as CompanyLite[]).find(co => co.name.toLowerCase() === c.client!.toLowerCase())
            : undefined
          seeded[i] = {
            title: c.title,
            bodyMarkdown: c.bodyMarkdown ?? '',
            companyIds: new Set(match ? [match.id] : []),
            selected: true,
          }
        }
      })
      setDrafts(seeded)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed')
    } finally {
      setAnalysing(false)
    }
  }

  function updateDraft(i: number, patch: Partial<{ title: string; bodyMarkdown: string; selected: boolean }>) {
    setDrafts(prev => ({ ...prev, [i]: { ...prev[i], ...patch } }))
  }
  function toggleCompany(i: number, companyId: string) {
    setDrafts(prev => {
      const d = prev[i]
      const set = new Set(d.companyIds)
      set.has(companyId) ? set.delete(companyId) : set.add(companyId)
      return { ...prev, [i]: { ...d, companyIds: set } }
    })
  }

  async function createSelected() {
    const items = Object.values(drafts)
      .filter(d => d.selected && d.title.trim() && d.bodyMarkdown.trim())
      .map(d => ({ title: d.title.trim(), bodyMarkdown: d.bodyMarkdown, companyIds: [...d.companyIds] }))
    if (items.length === 0) { setCreatedMsg('Nothing selected to create.'); return }

    setCreating(true)
    setCreatedMsg('')
    try {
      const res = await fetch('/api/admin/ingest/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Create failed')
      setCreatedMsg(`Created ${data.created} draft SOP${data.created === 1 ? '' : 's'}. Find them under Manage SOPs (status: Draft).`)
      // Drop created ones from the selectable set
      setDrafts(prev => {
        const next = { ...prev }
        Object.keys(next).forEach(k => { if (next[+k].selected) delete next[+k] })
        return next
      })
    } catch (e) {
      setCreatedMsg(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setCreating(false)
    }
  }

  const candidates = result?.candidates ?? []
  const news = candidates.map((c, i) => ({ c, i })).filter(x => x.c.classification === 'new')
  const updates = candidates.map((c, i) => ({ c, i })).filter(x => x.c.classification === 'update')
  const exists = candidates.map((c, i) => ({ c, i })).filter(x => x.c.classification === 'exists')
  const redactionTotal = result ? Object.values(result.redactionCounts).reduce((a, b) => a + b, 0) : 0
  const selectedCount = Object.values(drafts).filter(d => d.selected).length

  return (
    <div className="space-y-5">
      {/* Input */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700">Paste a conversation, or upload a WhatsApp export</p>
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept=".txt" onChange={handleFile} className="hidden" />
            <button
              onClick={() => fileRef.current?.click()}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 flex items-center gap-2"
            >
              <Upload className="w-4 h-4" /> Upload .txt
            </button>
          </div>
        </div>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={8}
          placeholder="Paste the chat here — or use “Upload .txt” for an exported WhatsApp chat. Personal details (phones, emails, addresses) are stripped on our server before anything is analysed."
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-200 resize-y font-mono"
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-400 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" /> PII is redacted before the AI sees it.
          </p>
          <button
            onClick={analyse}
            disabled={analysing || text.trim().length < 20}
            className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 flex items-center gap-2 disabled:opacity-50"
          >
            {analysing ? <><Loader2 className="w-4 h-4 animate-spin" /> Analysing…</> : <><Sparkles className="w-4 h-4" /> Analyse conversation</>}
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {result && (
        <>
          {/* Summary */}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" /> {result.source === 'whatsapp' ? 'WhatsApp export' : 'Pasted text'}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" /> {redactionTotal} item{redactionTotal === 1 ? '' : 's'} redacted
            </span>
            {result.truncated && (
              <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700">Long chat — analysed the first portion. Run the rest separately.</span>
            )}
            <span className="text-slate-400">{candidates.length} topic{candidates.length === 1 ? '' : 's'} found</span>
          </div>

          {candidates.length === 0 && (
            <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-4">
              No reusable SOP-worthy knowledge found in this conversation.
            </p>
          )}

          {/* NEW — draftable */}
          {news.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Plus className="w-5 h-5 text-green-600" />
                  <h3 className="font-semibold text-slate-900">New SOPs to create</h3>
                  <span className="text-sm text-slate-400">({news.length})</span>
                </div>
                <div className="flex items-center gap-3">
                  {createdMsg && <span className="text-xs text-teal-600 font-medium">{createdMsg}</span>}
                  <button
                    onClick={createSelected}
                    disabled={creating || selectedCount === 0}
                    className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 flex items-center gap-2 disabled:opacity-50"
                  >
                    {creating ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</> : <><CheckCircle2 className="w-4 h-4" /> Create {selectedCount} as drafts</>}
                  </button>
                </div>
              </div>
              <ul className="divide-y divide-slate-100">
                {news.map(({ c, i }) => {
                  const d = drafts[i]
                  if (!d) return null
                  return (
                    <li key={i} className="px-5 py-4 space-y-3">
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={d.selected}
                          onChange={e => updateDraft(i, { selected: e.target.checked })}
                          className="mt-1.5 w-4 h-4 accent-teal-600"
                        />
                        <div className="flex-1 space-y-2">
                          <input
                            value={d.title}
                            onChange={e => updateDraft(i, { title: e.target.value })}
                            className="w-full text-sm font-semibold text-slate-800 border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-teal-400"
                          />
                          <p className="text-xs text-slate-500">{c.summary}</p>
                          <details className="group">
                            <summary className="text-xs text-teal-700 font-medium cursor-pointer flex items-center gap-1 list-none">
                              <PencilLine className="w-3.5 h-3.5" /> Edit draft body
                              <ChevronDown className="w-3 h-3 group-open:rotate-180 transition-transform" />
                            </summary>
                            <textarea
                              value={d.bodyMarkdown}
                              onChange={e => updateDraft(i, { bodyMarkdown: e.target.value })}
                              rows={10}
                              className="mt-2 w-full text-xs border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:border-teal-400 resize-y font-mono"
                            />
                          </details>
                          {/* Company tags */}
                          <div className="flex flex-wrap items-center gap-1.5 pt-1">
                            <span className="text-xs text-slate-400">Tag:</span>
                            {result.companies.map(co => {
                              const on = d.companyIds.has(co.id)
                              return (
                                <button
                                  key={co.id}
                                  onClick={() => toggleCompany(i, co.id)}
                                  className={`text-xs px-2 py-0.5 rounded-md border transition-colors ${
                                    on ? 'bg-teal-50 border-teal-300 text-teal-800' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                                  }`}
                                >
                                  {co.name}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {/* UPDATE */}
          {updates.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-amber-500" />
                <h3 className="font-semibold text-slate-900">Existing SOPs that may need updating</h3>
                <span className="text-sm text-slate-400">({updates.length})</span>
              </div>
              <ul className="divide-y divide-slate-100">
                {updates.map(({ c, i }) => (
                  <li key={i} className="px-5 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-800">{c.title}</p>
                      {c.matchedSop && (
                        <Link
                          href={`/sops/${c.matchedSop.id}`}
                          target="_blank"
                          className="text-xs text-teal-700 font-medium flex items-center gap-1 hover:underline shrink-0"
                        >
                          Open “{c.matchedSop.title}” <ExternalLink className="w-3 h-3" />
                        </Link>
                      )}
                    </div>
                    {c.changeNote && (
                      <p className="text-sm text-slate-600 mt-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                        <span className="font-medium text-amber-800">Suggested change: </span>{c.changeNote}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* EXISTS */}
          {exists.length > 0 && (
            <details className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <summary className="px-5 py-3 cursor-pointer flex items-center gap-2 list-none">
                <CheckCircle2 className="w-5 h-5 text-slate-300" />
                <h3 className="font-semibold text-slate-500">Already covered</h3>
                <span className="text-sm text-slate-400">({exists.length})</span>
                <ChevronDown className="w-4 h-4 text-slate-300 ml-auto" />
              </summary>
              <ul className="divide-y divide-slate-50 border-t border-slate-100">
                {exists.map(({ c, i }) => (
                  <li key={i} className="px-5 py-2.5 flex items-center justify-between gap-3">
                    <span className="text-sm text-slate-600">{c.title}</span>
                    {c.matchedSop && (
                      <Link href={`/sops/${c.matchedSop.id}`} target="_blank" className="text-xs text-slate-400 hover:text-teal-700 flex items-center gap-1 shrink-0">
                        {c.matchedSop.title} <ExternalLink className="w-3 h-3" />
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  )
}
