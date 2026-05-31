'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Loader2, Sparkles, CheckCircle2, AlertTriangle, HelpCircle,
  Tag, Plus, RefreshCw, Building2,
} from 'lucide-react'

type Confidence = 'high' | 'low' | 'ai'

interface CompanyLite { id: string; name: string }
interface Suggestion {
  companyId: string
  name: string
  confidence: Confidence
  where: 'title' | 'content'
  count: number
}
interface Row {
  id: string
  title: string
  suggestions: Suggestion[]
}
interface Counts {
  total: number
  alreadyTagged: number
  confident: number
  review: number
  unmatched: number
}

const PAGE = 50

export function AutoTagManager() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [companies, setCompanies] = useState<CompanyLite[]>([])
  const [confident, setConfident] = useState<Row[]>([])
  const [review, setReview] = useState<Row[]>([])
  const [unmatched, setUnmatched] = useState<{ id: string; title: string }[]>([])
  const [counts, setCounts] = useState<Counts | null>(null)

  // sopId -> chosen companyIds
  const [picks, setPicks] = useState<Record<string, Set<string>>>({})

  const [applying, setApplying] = useState(false)
  const [aiRunning, setAiRunning] = useState(false)
  const [aiProgress, setAiProgress] = useState({ done: 0, total: 0 })
  const [msg, setMsg] = useState('')

  // Pagination per section
  const [confPage, setConfPage] = useState(1)
  const [revPage, setRevPage] = useState(1)
  const [unmPage, setUnmPage] = useState(1)

  const scan = useCallback(async () => {
    setLoading(true)
    setError('')
    setMsg('')
    try {
      const res = await fetch('/api/admin/auto-tag/scan', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Scan failed')

      setCompanies(data.companies ?? [])
      setConfident(data.confident ?? [])
      setReview(data.review ?? [])
      setUnmatched(data.unmatched ?? [])
      setCounts(data.counts ?? null)

      // Pre-check: confident → all high-confidence suggestions; review → none.
      const initial: Record<string, Set<string>> = {}
      for (const row of (data.confident ?? []) as Row[]) {
        initial[row.id] = new Set(
          row.suggestions.filter(s => s.confidence === 'high').map(s => s.companyId)
        )
      }
      for (const row of (data.review ?? []) as Row[]) {
        initial[row.id] = new Set()
      }
      setPicks(initial)
      setConfPage(1); setRevPage(1); setUnmPage(1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { scan() }, [scan])

  function togglePick(sopId: string, companyId: string) {
    setPicks(prev => {
      const next = { ...prev }
      const set = new Set(next[sopId] ?? [])
      if (set.has(companyId)) set.delete(companyId)
      else set.add(companyId)
      next[sopId] = set
      return next
    })
  }

  function countChecked() {
    return Object.values(picks).filter(s => s.size > 0).length
  }

  async function applyChecked() {
    const assignments = Object.entries(picks)
      .filter(([, set]) => set.size > 0)
      .map(([sopId, set]) => ({ sopId, companyIds: [...set] }))

    if (assignments.length === 0) {
      setMsg('Nothing checked to apply.')
      return
    }

    setApplying(true)
    setMsg('')
    try {
      const res = await fetch('/api/admin/auto-tag/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignments }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Apply failed')

      const applied = new Set(assignments.map(a => a.sopId))
      // Remove applied SOPs from view
      setConfident(prev => prev.filter(r => !applied.has(r.id)))
      setReview(prev => prev.filter(r => !applied.has(r.id)))
      setUnmatched(prev => prev.filter(r => !applied.has(r.id)))
      setPicks(prev => {
        const next = { ...prev }
        applied.forEach(id => delete next[id])
        return next
      })
      setMsg(`Tagged ${data.sops} SOP${data.sops === 1 ? '' : 's'} (${data.applied} link${data.applied === 1 ? '' : 's'}).`)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Apply failed')
    } finally {
      setApplying(false)
    }
  }

  async function runAiOnUnmatched() {
    if (unmatched.length === 0) return
    setAiRunning(true)
    setMsg('')
    const batchSize = 10
    const ids = unmatched.map(u => u.id)
    setAiProgress({ done: 0, total: ids.length })

    const newReview: Row[] = []
    const stillUnmatched: { id: string; title: string }[] = []
    const titleById = new Map(unmatched.map(u => [u.id, u.title]))
    const newPicks: Record<string, Set<string>> = {}

    try {
      for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize)
        const res = await fetch('/api/admin/auto-tag/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sopIds: batch }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'AI pass failed')

        for (const result of (data.results ?? []) as Row[]) {
          if (result.suggestions && result.suggestions.length > 0) {
            newReview.push(result)
            newPicks[result.id] = new Set(result.suggestions.map(s => s.companyId))
          } else {
            stillUnmatched.push({ id: result.id, title: titleById.get(result.id) ?? result.title })
          }
        }
        setAiProgress({ done: Math.min(i + batchSize, ids.length), total: ids.length })
      }

      // AI suggestions land in the review section (pre-checked), so they get a human glance.
      setReview(prev => [...newReview, ...prev])
      setUnmatched(stillUnmatched)
      setPicks(prev => ({ ...prev, ...newPicks }))
      setRevPage(1)
      setMsg(`AI suggested companies for ${newReview.length} of ${ids.length} SOPs. Review and apply.`)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'AI pass failed')
    } finally {
      setAiRunning(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-slate-500 py-20 justify-center">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Scanning all SOPs against the company list…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">
        <p className="font-semibold mb-2">Could not scan SOPs</p>
        <p className="text-sm">{error}</p>
        <button onClick={scan} className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">
          Retry
        </button>
      </div>
    )
  }

  const checked = countChecked()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Tag className="w-6 h-6 text-teal-600" /> Auto-tag SOPs by company
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Name-matched suggestions across every untagged SOP. Confident matches are pre-checked — review the rest, then apply.
          </p>
        </div>
        <button
          onClick={scan}
          disabled={applying || aiRunning}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 flex items-center gap-2 disabled:opacity-50"
        >
          <RefreshCw className="w-4 h-4" /> Re-scan
        </button>
      </div>

      {/* Counts */}
      {counts && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <StatCard label="Total SOPs" value={counts.total} />
          <StatCard label="Already tagged" value={counts.alreadyTagged} />
          <StatCard label="Confident" value={confident.length} tone="green" />
          <StatCard label="Needs review" value={review.length} tone="amber" />
          <StatCard label="No match" value={unmatched.length} tone="slate" />
        </div>
      )}

      {/* Action bar */}
      <div className="sticky top-0 z-10 bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap shadow-sm">
        <div className="text-sm text-slate-600">
          <span className="font-semibold text-slate-900">{checked}</span> SOP{checked === 1 ? '' : 's'} checked for tagging
          {msg && <span className="ml-3 text-teal-600 font-medium">{msg}</span>}
        </div>
        <div className="flex items-center gap-3">
          {unmatched.length > 0 && (
            <button
              onClick={runAiOnUnmatched}
              disabled={aiRunning || applying}
              className="px-4 py-2 border border-violet-200 text-violet-700 bg-violet-50 rounded-lg text-sm font-semibold hover:bg-violet-100 flex items-center gap-2 disabled:opacity-50"
            >
              {aiRunning
                ? <><Loader2 className="w-4 h-4 animate-spin" /> AI {aiProgress.done}/{aiProgress.total}</>
                : <><Sparkles className="w-4 h-4" /> Run AI on {unmatched.length} unmatched</>}
            </button>
          )}
          <button
            onClick={applyChecked}
            disabled={applying || aiRunning || checked === 0}
            className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 flex items-center gap-2 disabled:opacity-50"
          >
            {applying
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Applying…</>
              : <><CheckCircle2 className="w-4 h-4" /> Apply {checked} checked</>}
          </button>
        </div>
      </div>

      {/* Confident */}
      <Section
        icon={<CheckCircle2 className="w-5 h-5 text-green-600" />}
        title="Confident matches"
        subtitle="Pre-checked. Skim and apply."
        rows={confident}
        page={confPage}
        setPage={setConfPage}
        companies={companies}
        picks={picks}
        togglePick={togglePick}
        emptyText="No confident matches left."
      />

      {/* Review */}
      <Section
        icon={<AlertTriangle className="w-5 h-5 text-amber-500" />}
        title="Needs review"
        subtitle="Low-confidence or AI suggestions — check the ones that are right."
        rows={review}
        page={revPage}
        setPage={setRevPage}
        companies={companies}
        picks={picks}
        togglePick={togglePick}
        emptyText="Nothing to review."
      />

      {/* Unmatched */}
      <UnmatchedSection
        rows={unmatched}
        page={unmPage}
        setPage={setUnmPage}
        companies={companies}
        picks={picks}
        togglePick={togglePick}
      />
    </div>
  )
}

function StatCard({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'green' | 'amber' | 'slate' }) {
  const tones: Record<string, string> = {
    default: 'bg-white border-slate-200',
    green: 'bg-green-50 border-green-200',
    amber: 'bg-amber-50 border-amber-200',
    slate: 'bg-slate-50 border-slate-200',
  }
  return (
    <div className={`rounded-xl border p-3 ${tones[tone]}`}>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500 font-medium">{label}</p>
    </div>
  )
}

function ConfidenceBadge({ c }: { c: Confidence }) {
  const map: Record<Confidence, { label: string; cls: string }> = {
    high: { label: 'high', cls: 'bg-green-100 text-green-700' },
    low: { label: 'maybe', cls: 'bg-amber-100 text-amber-700' },
    ai: { label: 'AI', cls: 'bg-violet-100 text-violet-700' },
  }
  const { label, cls } = map[c]
  return <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide ${cls}`}>{label}</span>
}

function Pager({ page, setPage, total }: { page: number; setPage: (n: number) => void; total: number }) {
  const pages = Math.ceil(total / PAGE)
  if (pages <= 1) return null
  return (
    <div className="flex items-center justify-center gap-2 pt-3">
      <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
        className="px-3 py-1 text-sm border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50">Prev</button>
      <span className="text-sm text-slate-500">Page {page} of {pages}</span>
      <button onClick={() => setPage(Math.min(pages, page + 1))} disabled={page === pages}
        className="px-3 py-1 text-sm border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50">Next</button>
    </div>
  )
}

function ManualAdd({ companies, picked, onAdd }: { companies: CompanyLite[]; picked: Set<string>; onAdd: (id: string) => void }) {
  const [value, setValue] = useState('')
  const available = companies.filter(c => !picked.has(c.id))
  return (
    <select
      value={value}
      onChange={e => { if (e.target.value) { onAdd(e.target.value); setValue('') } }}
      className="text-xs border border-slate-200 rounded-lg px-2 py-1 text-slate-600 bg-white max-w-[180px]"
    >
      <option value="">+ Add company…</option>
      {available.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  )
}

function Section({
  icon, title, subtitle, rows, page, setPage, companies, picks, togglePick, emptyText,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  rows: Row[]
  page: number
  setPage: (n: number) => void
  companies: CompanyLite[]
  picks: Record<string, Set<string>>
  togglePick: (sopId: string, companyId: string) => void
  emptyText: string
}) {
  const start = (page - 1) * PAGE
  const visible = rows.slice(start, start + PAGE)
  const companyById = new Map(companies.map(c => [c.id, c]))

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
        {icon}
        <h2 className="font-semibold text-slate-900">{title}</h2>
        <span className="text-sm text-slate-400">({rows.length})</span>
        <span className="text-xs text-slate-400 ml-2">{subtitle}</span>
      </div>

      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-400">{emptyText}</p>
      ) : (
        <>
          <ul className="divide-y divide-slate-50">
            {visible.map(row => {
              const picked = picks[row.id] ?? new Set<string>()
              // Suggestions shown as checkboxes, plus any manually-added picks not in suggestions.
              const suggestionIds = new Set(row.suggestions.map(s => s.companyId))
              const extraPicked = [...picked].filter(id => !suggestionIds.has(id))
              return (
                <li key={row.id} className="px-5 py-3">
                  <p className="text-sm font-medium text-slate-800 mb-2">{row.title}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {row.suggestions.map(s => {
                      const on = picked.has(s.companyId)
                      return (
                        <button
                          key={s.companyId}
                          onClick={() => togglePick(row.id, s.companyId)}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-sm transition-colors ${
                            on
                              ? 'bg-teal-50 border-teal-300 text-teal-800'
                              : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                          }`}
                        >
                          {on ? <CheckCircle2 className="w-3.5 h-3.5" /> : <span className="w-3.5 h-3.5 rounded-full border border-current inline-block" />}
                          {s.name}
                          <ConfidenceBadge c={s.confidence} />
                          {s.count > 0 && <span className="text-[10px] text-slate-400">×{s.count}</span>}
                        </button>
                      )
                    })}
                    {extraPicked.map(id => {
                      const c = companyById.get(id)
                      if (!c) return null
                      return (
                        <button
                          key={id}
                          onClick={() => togglePick(row.id, id)}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border bg-teal-50 border-teal-300 text-teal-800 text-sm"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {c.name}
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase bg-slate-100 text-slate-600">manual</span>
                        </button>
                      )
                    })}
                    <ManualAdd companies={companies} picked={picked} onAdd={id => togglePick(row.id, id)} />
                  </div>
                </li>
              )
            })}
          </ul>
          <div className="px-5 pb-4">
            <Pager page={page} setPage={setPage} total={rows.length} />
          </div>
        </>
      )}
    </div>
  )
}

function UnmatchedSection({
  rows, page, setPage, companies, picks, togglePick,
}: {
  rows: { id: string; title: string }[]
  page: number
  setPage: (n: number) => void
  companies: CompanyLite[]
  picks: Record<string, Set<string>>
  togglePick: (sopId: string, companyId: string) => void
}) {
  const start = (page - 1) * PAGE
  const visible = rows.slice(start, start + PAGE)
  const companyById = new Map(companies.map(c => [c.id, c]))

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
        <HelpCircle className="w-5 h-5 text-slate-400" />
        <h2 className="font-semibold text-slate-900">No name match</h2>
        <span className="text-sm text-slate-400">({rows.length})</span>
        <span className="text-xs text-slate-400 ml-2">Run the AI pass, or tag manually.</span>
      </div>

      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-400">Everything matched a company name.</p>
      ) : (
        <>
          <ul className="divide-y divide-slate-50">
            {visible.map(row => {
              const picked = picks[row.id] ?? new Set<string>()
              return (
                <li key={row.id} className="px-5 py-3">
                  <p className="text-sm font-medium text-slate-800 mb-2 flex items-center gap-2">
                    <Building2 className="w-3.5 h-3.5 text-slate-300" /> {row.title}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {[...picked].map(id => {
                      const c = companyById.get(id)
                      if (!c) return null
                      return (
                        <button
                          key={id}
                          onClick={() => togglePick(row.id, id)}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border bg-teal-50 border-teal-300 text-teal-800 text-sm"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> {c.name}
                        </button>
                      )
                    })}
                    <ManualAdd companies={companies} picked={picked} onAdd={id => togglePick(row.id, id)} />
                    {picked.size === 0 && <span className="text-xs text-slate-300 flex items-center gap-1"><Plus className="w-3 h-3" /> no company yet</span>}
                  </div>
                </li>
              )
            })}
          </ul>
          <div className="px-5 pb-4">
            <Pager page={page} setPage={setPage} total={rows.length} />
          </div>
        </>
      )}
    </div>
  )
}
