'use client'

import { useState, useRef } from 'react'
import {
  Loader2, Upload, Sparkles, ShieldCheck, Plus, FileText,
  CheckCircle2, RefreshCw, PencilLine, ExternalLink, ChevronDown,
  Brain, RotateCcw,
} from 'lucide-react'
import Link from 'next/link'

type AdviceSection = 'principle' | 'person' | 'guardrail'
const ADVICE_SECTION_LABEL: Record<AdviceSection, string> = {
  principle: 'Principle',
  person: 'Person / role',
  guardrail: 'Guardrail',
}

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
interface AdvicePattern { text: string; section: AdviceSection }
interface AnalyseResponse {
  source: 'whatsapp' | 'paste'
  redactionCounts: Record<string, number>
  truncated: boolean
  companies: CompanyLite[]
  candidates: Candidate[]
  advice: AdvicePattern[]
}

// Keep each chunk's raw text below this so that, after the server strips
// timestamps and redacts, it stays under the route's MAX_CHARS (14000) and is
// never truncated. Split on line boundaries so we don't cut mid-message.
// Smaller chunks mean fewer candidates per request → a shorter draft step →
// each request finishes comfortably inside the function's 60s ceiling.
const CHUNK_CHARS = 11000
const MAX_CHUNKS = 80 // safety cap for very large exports

type ChunkResponse = AnalyseResponse & { error?: string }

// One part can transiently fail — a Vercel function timeout returns a non-JSON
// error page, or the model occasionally returns malformed JSON. Retry a few
// times with backoff so every part gets analysed rather than being dropped.
async function analyseChunk(text: string, attempts = 3): Promise<ChunkResponse | null> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await fetch('/api/admin/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const bodyText = await res.text()
      if (res.ok) {
        try { return JSON.parse(bodyText) as ChunkResponse } catch { /* malformed — retry */ }
      }
    } catch { /* network/timeout — retry */ }
    if (attempt < attempts - 1) await new Promise(r => setTimeout(r, 1200 * (attempt + 1)))
  }
  return null
}

function chunkRaw(raw: string, maxChars: number): string[] {
  const lines = raw.split(/\r?\n/)
  const chunks: string[] = []
  let cur = ''
  for (const line of lines) {
    if (cur.length + line.length + 1 > maxChars && cur.length > 0) {
      chunks.push(cur)
      cur = ''
    }
    cur += (cur ? '\n' : '') + line
  }
  if (cur.trim()) chunks.push(cur)
  return (chunks.length ? chunks : [raw]).slice(0, MAX_CHUNKS)
}

export function ConversationIngest() {
  const [text, setText] = useState('')
  const [analysing, setAnalysing] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number; retry?: { done: number; total: number } } | null>(null)
  const [warn, setWarn] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<AnalyseResponse | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Editable working copy of "new" drafts + which to create
  const [drafts, setDrafts] = useState<Record<number, { title: string; bodyMarkdown: string; companyIds: Set<string>; selected: boolean }>>({})
  const [creating, setCreating] = useState(false)
  const [createdMsg, setCreatedMsg] = useState('')

  // Editable working copy of advice patterns + which to add to behaviour
  const [adviceItems, setAdviceItems] = useState<{ text: string; section: AdviceSection; selected: boolean }[]>([])
  const [addingAdvice, setAddingAdvice] = useState(false)
  const [adviceMsg, setAdviceMsg] = useState('')

  // Wipe everything back to a blank slate so you can drop a different chat and
  // start fresh — without being forced to save anything from the current run.
  function resetAll() {
    setText('')
    setResult(null)
    setDrafts({})
    setAdviceItems([])
    setError('')
    setWarn('')
    setCreatedMsg('')
    setAdviceMsg('')
    setProgress(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const content = await file.text()
    // A new upload starts a clean run — drop any results from the last chat.
    setResult(null)
    setDrafts({})
    setAdviceItems([])
    setError('')
    setWarn('')
    setCreatedMsg('')
    setAdviceMsg('')
    setText(content)
  }

  async function analyse() {
    if (text.trim().length < 20) { setError('Paste or upload a longer conversation first.'); return }
    setAnalysing(true)
    setError('')
    setWarn('')
    setResult(null)
    setCreatedMsg('')
    setAdviceMsg('')

    // Split large exports into line-aligned chunks and analyse each in turn,
    // accumulating + de-duplicating results. Each chunk is redacted server-side
    // before the AI sees it, so the full file can be dropped in safely.
    const chunks = chunkRaw(text, CHUNK_CHARS)
    setProgress({ done: 0, total: chunks.length })

    const allCandidates: Candidate[] = []
    const allAdvice: AdvicePattern[] = []
    const mergedCounts: Record<string, number> = {}
    const seenCandidate = new Set<string>()
    const seenAdvice = new Set<string>()
    let companies: CompanyLite[] = []
    let source: 'whatsapp' | 'paste' = 'paste'
    const failedIdx: number[] = []

    // Fold one part's results into the running, de-duplicated totals.
    const absorb = (data: ChunkResponse) => {
      source = data.source ?? source
      if (Array.isArray(data.companies) && data.companies.length) companies = data.companies
      for (const [k, v] of Object.entries((data.redactionCounts ?? {}) as Record<string, number>)) {
        mergedCounts[k] = (mergedCounts[k] ?? 0) + v
      }
      for (const c of (data.candidates ?? []) as Candidate[]) {
        const key = c.title.trim().toLowerCase()
        if (!key || seenCandidate.has(key)) continue
        seenCandidate.add(key)
        allCandidates.push(c)
      }
      for (const a of (data.advice ?? []) as AdvicePattern[]) {
        const key = a.text.trim().toLowerCase()
        if (!key || seenAdvice.has(key)) continue
        seenAdvice.add(key)
        allAdvice.push(a)
      }
    }

    try {
      // Pass 1 — analyse every part in order (analyseChunk retries transient
      // failures internally). Parts that still fail are queued for a second pass.
      for (let ci = 0; ci < chunks.length; ci++) {
        const data = await analyseChunk(chunks[ci])
        if (!data) failedIdx.push(ci)
        else absorb(data)
        setProgress({ done: ci + 1, total: chunks.length })
      }

      // Pass 2 — give the stragglers another full run. Timeouts are usually
      // transient (load spikes), so a clean retry after the queue has drained
      // typically clears the rest.
      if (failedIdx.length > 0) {
        const stillFailed: number[] = []
        for (let k = 0; k < failedIdx.length; k++) {
          setProgress({ done: chunks.length, total: chunks.length, retry: { done: k, total: failedIdx.length } })
          const data = await analyseChunk(chunks[failedIdx[k]])
          if (!data) stillFailed.push(failedIdx[k])
          else absorb(data)
        }
        failedIdx.length = 0
        failedIdx.push(...stillFailed)
      }

      // All parts failed → surface as an error, not an empty result.
      if (failedIdx.length === chunks.length) {
        setError(`Analysis failed on all ${chunks.length} part${chunks.length === 1 ? '' : 's'}. Wait a moment and retry, or try a shorter section.`)
        return
      }
      if (failedIdx.length > 0) {
        setWarn(`${failedIdx.length} of ${chunks.length} parts couldn’t be analysed after retries and were skipped. Results below are from the rest — re-running usually clears the remaining parts.`)
      }

      const merged: AnalyseResponse = {
        source,
        redactionCounts: mergedCounts,
        truncated: false,
        companies,
        candidates: allCandidates,
        advice: allAdvice,
      }
      setResult(merged)

      // Seed editable drafts for "new" candidates, with a client pre-matched.
      const seeded: typeof drafts = {}
      allCandidates.forEach((c, i) => {
        if (c.classification === 'new') {
          const match = c.client
            ? companies.find(co => co.name.toLowerCase() === c.client!.toLowerCase())
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

      // Seed advice working copy (all selected by default).
      setAdviceItems(allAdvice.map(a => ({ ...a, selected: true })))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed')
    } finally {
      setAnalysing(false)
      setProgress(null)
    }
  }

  function updateAdvice(i: number, patch: Partial<{ text: string; section: AdviceSection; selected: boolean }>) {
    setAdviceItems(prev => prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a)))
  }

  // Add selected advice into the bot's behaviour config. For each affected
  // section we read the current items, append the new ones, then save the
  // merged list back via the same bot-config API the Behaviour tab uses.
  async function addAdviceToBehaviour() {
    const chosen = adviceItems.filter(a => a.selected && a.text.trim())
    if (chosen.length === 0) { setAdviceMsg('Nothing selected to add.'); return }

    setAddingAdvice(true)
    setAdviceMsg('')
    try {
      const config = await fetch('/api/admin/bot-config').then(r => r.json())
      const sections = new Set(chosen.map(a => a.section))
      let added = 0

      for (const section of sections) {
        const existing = ((config.sections?.[section] ?? []) as { content: string; is_active: boolean }[])
          .map(r => ({ content: r.content, is_active: r.is_active }))
        const existingText = new Set(existing.map(e => e.content.trim().toLowerCase()))
        const toAdd = chosen
          .filter(a => a.section === section)
          .filter(a => !existingText.has(a.text.trim().toLowerCase()))
          .map(a => ({ content: a.text.trim(), is_active: true }))
        if (toAdd.length === 0) continue

        const res = await fetch('/api/admin/bot-config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ section, items: [...existing, ...toAdd] }),
        })
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          throw new Error(d.error || `Failed saving ${section}`)
        }
        added += toAdd.length
      }

      setAdviceMsg(added > 0
        ? `Added ${added} item${added === 1 ? '' : 's'} to Behaviour. Live on the next chat message.`
        : 'Those items were already in your behaviour config.')
      // Drop the ones we just added from the list.
      setAdviceItems(prev => prev.filter(a => !(a.selected && a.text.trim())))
    } catch (e) {
      setAdviceMsg(e instanceof Error ? e.message : 'Failed to add advice')
    } finally {
      setAddingAdvice(false)
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
  const selectedAdviceCount = adviceItems.filter(a => a.selected && a.text.trim()).length

  return (
    <div className="space-y-5">
      {/* Input */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700">Paste a conversation, or upload a WhatsApp export</p>
          <div className="flex items-center gap-2">
            {(text || result) && !analysing && (
              <button
                onClick={resetAll}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700 flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" /> Start over
              </button>
            )}
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
          placeholder="Paste the chat here — or use “Upload .txt” for an exported WhatsApp chat. You can drop a whole export; it’s processed in parts. Personal details (phones, emails, addresses, codes) are stripped on our server before anything is analysed."
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
            {analysing
              ? <><Loader2 className="w-4 h-4 animate-spin" /> {
                  progress?.retry
                    ? `Retrying part ${Math.min(progress.retry.done + 1, progress.retry.total)} of ${progress.retry.total}…`
                    : progress && progress.total > 1
                      ? `Analysing part ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…`
                      : 'Analysing…'
                }</>
              : <><Sparkles className="w-4 h-4" /> Analyse conversation</>}
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {result && (
        <>
          {warn && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
              {warn}
            </p>
          )}

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
            {adviceItems.length > 0 && (
              <span className="px-2.5 py-1 rounded-lg bg-teal-50 text-teal-700 flex items-center gap-1.5">
                <Brain className="w-3.5 h-3.5" /> {adviceItems.length} advice item{adviceItems.length === 1 ? '' : 's'}
              </span>
            )}
          </div>

          {candidates.length === 0 && adviceItems.length === 0 && (
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

          {/* ADVICE — "our ways" → behaviour config */}
          {adviceItems.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Brain className="w-5 h-5 text-teal-600" />
                  <h3 className="font-semibold text-slate-900">Our ways — advice to teach the bot</h3>
                  <span className="text-sm text-slate-400">({adviceItems.length})</span>
                </div>
                <div className="flex items-center gap-3">
                  {adviceMsg && <span className="text-xs text-teal-600 font-medium">{adviceMsg}</span>}
                  <button
                    onClick={addAdviceToBehaviour}
                    disabled={addingAdvice || selectedAdviceCount === 0}
                    className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 flex items-center gap-2 disabled:opacity-50"
                  >
                    {addingAdvice ? <><Loader2 className="w-4 h-4 animate-spin" /> Adding…</> : <><CheckCircle2 className="w-4 h-4" /> Add {selectedAdviceCount} to Behaviour</>}
                  </button>
                </div>
              </div>
              <p className="px-5 pt-3 text-xs text-slate-400">
                How the team handles things and who&apos;s who. Approved items are added to the matching section in the Behaviour tab and shape every future chat answer.
              </p>
              <ul className="divide-y divide-slate-100">
                {adviceItems.map((a, i) => (
                  <li key={i} className="px-5 py-3 flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={a.selected}
                      onChange={e => updateAdvice(i, { selected: e.target.checked })}
                      className="mt-2 w-4 h-4 accent-teal-600"
                    />
                    <textarea
                      value={a.text}
                      onChange={e => updateAdvice(i, { text: e.target.value })}
                      rows={2}
                      className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-200 resize-y"
                    />
                    <select
                      value={a.section}
                      onChange={e => updateAdvice(i, { section: e.target.value as AdviceSection })}
                      className="mt-0.5 text-xs font-medium border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 focus:outline-none focus:border-teal-400 cursor-pointer"
                    >
                      {(Object.keys(ADVICE_SECTION_LABEL) as AdviceSection[]).map(s => (
                        <option key={s} value={s}>{ADVICE_SECTION_LABEL[s]}</option>
                      ))}
                    </select>
                  </li>
                ))}
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

          {/* Footer — leave without saving and start a fresh conversation. */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-xs text-slate-400">
              Nothing is saved until you click “Create … as drafts” or “Add … to Behaviour”. You can leave the rest.
            </p>
            <button
              onClick={resetAll}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" /> Discard &amp; start over
            </button>
          </div>
        </>
      )}
    </div>
  )
}
