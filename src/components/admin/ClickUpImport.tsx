'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckSquare, Square, Loader2, CheckCircle, AlertCircle,
  ChevronRight, ChevronDown, Plug, FileText, Download, Layers, File,
} from 'lucide-react'
import { Team } from '@/types'

interface Category { id: string; name: string; team_id: string }
interface ClickUpDoc { id: string; name: string }
interface Workspace { id: string; name: string }
interface CUPage { id: string; name: string; pages?: CUPage[] }

// Each selected page tracks its immediate parent section name (used to auto-create categories)
interface SelectedPage {
  id: string
  name: string
  sectionId: string    // top-level section id (for grouping)
  sectionName: string  // top-level section name
  parentName: string   // immediate parent name → becomes the category
}

type ImportResult = { name: string; status: 'imported' | 'skipped' | 'error'; error?: string }
type Step = 'connect' | 'docs' | 'pages' | 'assign' | 'importing' | 'done'

// Strip leading numeric prefix: "2. Core SOPs" → "Core SOPs", "2.1 Enquiry" → "Enquiry"
function stripNumericPrefix(name: string): string {
  return name.replace(/^\d+(?:\.\d+)*\.?\s+/, '').trim()
}

// ── Flatten leaf pages deep in a subtree, all inheriting the same parentName ──
function flattenLeaves(pages: CUPage[], parentName: string): { id: string; name: string; parentName: string }[] {
  const result: { id: string; name: string; parentName: string }[] = []
  for (const p of pages) {
    if (!p.pages?.length) {
      result.push({ id: p.id, name: p.name, parentName })
    } else {
      result.push(...flattenLeaves(p.pages, parentName))
    }
  }
  return result
}

// ── "Import all →" on a section: direct child SECTIONS each become their own category ──
// e.g. clicking "Import all →" on "10.4.3 Guest Reservations Team" gives:
//   - direct leaf children   → category = fallbackCategory ("Guest Reservations Team")
//   - children of "2. Core SOPs" section → category = "Core SOPs"
//   - children of "3. Partner Playbooks" section → category = "Partner Playbooks"
function flattenLeavesFromSection(page: CUPage, fallbackCategory: string): { id: string; name: string; parentName: string }[] {
  const result: { id: string; name: string; parentName: string }[] = []
  for (const child of (page.pages ?? [])) {
    if (!child.pages?.length) {
      // Direct leaf child — use the fallback (the section itself)
      result.push({ id: child.id, name: child.name, parentName: fallbackCategory })
    } else {
      // Direct section child — its name becomes the category for ALL its descendants
      result.push(...flattenLeaves(child.pages, child.name))
    }
  }
  return result
}

// ── Recursive page tree ────────────────────────────────────────────────
function PageTree({
  pages, depth = 0, selectedIds, onToggle, sectionId = '', sectionName = '', myParentName = '',
}: {
  pages: CUPage[]
  depth?: number
  selectedIds: Set<string>
  onToggle: (page: CUPage, withChildren: boolean, sectionId: string, sectionName: string, parentName: string) => void
  sectionId?: string
  sectionName?: string
  myParentName?: string // name of the container holding these pages
}) {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(pages.map(p => p.id))
  )

  function toggle(id: string) {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  return (
    <div>
      {pages.map(page => {
        const hasChildren = (page.pages?.length ?? 0) > 0
        const isExpanded = expanded.has(page.id)
        const isSelected = selectedIds.has(page.id)
        const mySectionId = depth === 0 ? page.id : sectionId
        const mySectionName = depth === 0 ? page.name : sectionName

        return (
          <div key={page.id}>
            <div
              className="flex items-center gap-1.5 py-1.5 hover:bg-gray-50 rounded-lg group"
              style={{ paddingLeft: `${depth * 20 + 16}px` }}
            >
              {/* Expand/collapse */}
              <button
                onClick={() => toggle(page.id)}
                className={`w-4 h-4 flex-shrink-0 flex items-center justify-center ${hasChildren ? 'text-gray-400 hover:text-gray-600' : 'invisible'}`}
              >
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>

              {/* Checkbox — disabled for sections (they're just folders) */}
              <button
                onClick={() => !hasChildren && onToggle(page, false, mySectionId, mySectionName, myParentName)}
                className={`flex-shrink-0 ${hasChildren ? 'cursor-default opacity-30' : ''}`}
                title={hasChildren ? 'Section — use "Import all" to select pages inside' : undefined}
              >
                {isSelected
                  ? <CheckSquare className="w-4 h-4 text-teal-600" />
                  : <Square className="w-4 h-4 text-gray-300 group-hover:text-gray-400" />
                }
              </button>

              {/* Icon + name */}
              {hasChildren
                ? <Layers className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                : <File className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              }
              <span className={`text-sm flex-1 truncate ${hasChildren ? 'font-medium text-gray-400 italic' : 'text-gray-700'}`}>
                {page.name}
                {hasChildren && <span className="ml-1.5 text-xs text-amber-500 not-italic font-normal">section</span>}
              </span>

              {/* Import all: only selects leaf pages under this section */}
              {hasChildren && (
                <button
                  onClick={() => onToggle(page, true, mySectionId, mySectionName, page.name)}
                  className="text-xs text-teal-600 hover:underline opacity-0 group-hover:opacity-100 flex-shrink-0 ml-2 pr-3 font-medium"
                >
                  Import all →
                </button>
              )}
            </div>

            {hasChildren && isExpanded && (
              <PageTree
                pages={page.pages!}
                depth={depth + 1}
                selectedIds={selectedIds}
                onToggle={onToggle}
                sectionId={mySectionId}
                sectionName={mySectionName}
                myParentName={page.name}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────
export function ClickUpImport({ teams, categories }: { teams: Team[]; categories: Category[] }) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('connect')

  // Connect
  const [token, setToken] = useState(() =>
    typeof window !== 'undefined' ? (localStorage.getItem('cu_token') ?? '') : ''
  )
  const [connecting, setConnecting] = useState(false)
  const [autoConnecting, setAutoConnecting] = useState(false)
  const [error, setError] = useState('')
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspaceId, setWorkspaceId] = useState('')

  // Docs
  const [docs, setDocs] = useState<ClickUpDoc[]>([])
  const [docSearch, setDocSearch] = useState('')
  const [loadingDocs, setLoadingDocs] = useState(false)
  const [selectedDoc, setSelectedDoc] = useState<ClickUpDoc | null>(null)

  // Pages
  const [pageTree, setPageTree] = useState<CUPage[]>([])
  const [loadingPages, setLoadingPages] = useState(false)
  const [pagesError, setPagesError] = useState('')
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set())
  const [selectedPages, setSelectedPages] = useState<SelectedPage[]>([])

  // Assign
  const [assignTeamId, setAssignTeamId] = useState('')

  // Results
  const [results, setResults] = useState<ImportResult[]>([])

  const filteredDocs = docs.filter(d => !docSearch || d.name.toLowerCase().includes(docSearch.toLowerCase()))

  // Auto-connect if token saved
  useEffect(() => {
    const saved = localStorage.getItem('cu_token')
    if (saved && step === 'connect') {
      setAutoConnecting(true)
      fetch('/api/admin/clickup/workspaces', { headers: { 'x-clickup-token': saved } })
        .then(async r => {
          const data = await r.json()
          if (!r.ok) {
            setError(data.error ?? 'Saved token is no longer valid. Please reconnect.')
            localStorage.removeItem('cu_token')
            return
          }
          if (data.workspaces?.length) {
            setWorkspaces(data.workspaces)
            const wsId = data.workspaces[0].id
            setWorkspaceId(wsId)
            await loadDocs(wsId)
          } else {
            setError('No workspaces found. Please re-enter your token.')
          }
        })
        .catch(() => setError('Could not reach ClickUp. Check your internet connection.'))
        .finally(() => setAutoConnecting(false))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Connect ──────────────────────────────────────────────────────────
  async function handleConnect() {
    setConnecting(true); setError('')
    try {
      const res = await fetch('/api/admin/clickup/workspaces', { headers: { 'x-clickup-token': token } })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Connection failed'); return }
      localStorage.setItem('cu_token', token)
      setWorkspaces(data.workspaces)
      const wsId = data.workspaces.length === 1 ? data.workspaces[0].id : ''
      if (wsId) { setWorkspaceId(wsId); await loadDocs(wsId) }
    } catch { setError('Could not reach ClickUp. Check your token.') }
    finally { setConnecting(false) }
  }

  async function loadDocs(wsId: string) {
    setLoadingDocs(true)
    try {
      const t = token || localStorage.getItem('cu_token') || ''
      const res = await fetch(`/api/admin/clickup/docs?workspaceId=${wsId}`, { headers: { 'x-clickup-token': t } })
      const data = await res.json()
      if (res.ok) {
        setDocs(data.docs ?? [])
        setStep('docs')
      } else {
        setError(data.error ?? 'Failed to load ClickUp docs. Please try again.')
      }
    } catch {
      setError('Could not load docs. Check your connection.')
    } finally {
      setLoadingDocs(false)
    }
  }

  // ── Select Doc ────────────────────────────────────────────────────────
  async function selectDoc(doc: ClickUpDoc) {
    setSelectedDoc(doc)
    setPageTree([])
    setSelectedPageIds(new Set())
    setSelectedPages([])
    setAssignTeamId('')
    setPagesError('')
    setLoadingPages(true)
    setStep('pages')
    try {
      const t = token || localStorage.getItem('cu_token') || ''
      const res = await fetch(
        `/api/admin/clickup/pages?workspaceId=${workspaceId}&docId=${doc.id}`,
        { headers: { 'x-clickup-token': t } }
      )
      const data = await res.json()
      if (res.ok) {
        setPageTree(data.pages ?? [])
        if (!data.pages?.length) setPagesError(`No pages returned. Doc ID: ${doc.id}`)
      } else {
        setPagesError(data.error ?? 'Failed to load pages')
      }
    } catch (e) {
      setPagesError(`Unexpected error: ${String(e)}`)
    } finally { setLoadingPages(false) }
  }

  // ── Page selection ────────────────────────────────────────────────────
  function handleTogglePage(page: CUPage, withChildren: boolean, sectionId: string, sectionName: string, parentName: string) {
    // Always use the top-level section name as the category, regardless of where the user clicked
    const categoryName = sectionName || parentName

    if (withChildren) {
      // "Import all →" clicked: direct child sections each become their own category
      const leaves = flattenLeavesFromSection(page, categoryName)
      const ids = leaves.map(l => l.id)
      const allSelected = ids.every(id => selectedPageIds.has(id))

      setSelectedPageIds(prev => {
        const next = new Set(prev)
        if (allSelected) ids.forEach(id => next.delete(id))
        else ids.forEach(id => next.add(id))
        return next
      })
      setSelectedPages(prev => {
        if (allSelected) return prev.filter(p => !ids.includes(p.id))
        const existing = new Set(prev.map(p => p.id))
        return [
          ...prev,
          ...leaves
            .filter(l => !existing.has(l.id))
            .map(l => ({ id: l.id, name: l.name, sectionId, sectionName, parentName: l.parentName })),
        ]
      })
    } else {
      // Individual leaf page clicked — category = top-level section name
      if (page.pages?.length) return
      const allSelected = selectedPageIds.has(page.id)

      setSelectedPageIds(prev => {
        const next = new Set(prev)
        allSelected ? next.delete(page.id) : next.add(page.id)
        return next
      })
      setSelectedPages(prev => {
        if (allSelected) return prev.filter(p => p.id !== page.id)
        if (prev.some(p => p.id === page.id)) return prev
        return [...prev, { id: page.id, name: page.name, sectionId, sectionName, parentName: categoryName }]
      })
    }
  }

  // ── Import (batched to avoid timeouts) ───────────────────────────────
  const BATCH_SIZE = 50

  async function handleImport() {
    setStep('importing')
    const pagesPayload = selectedPages.map(p => ({
      id: p.id,
      name: p.name,
      teamId: assignTeamId || null,
      // Strip numeric prefix so "2. Core SOPs" becomes "Core SOPs" as a category name
      parentName: p.parentName ? stripNumericPrefix(p.parentName) : null,
      categoryId: null,
    }))

    const allResults: ImportResult[] = []
    const t = token || localStorage.getItem('cu_token') || ''

    for (let i = 0; i < pagesPayload.length; i += BATCH_SIZE) {
      const batch = pagesPayload.slice(i, i + BATCH_SIZE)
      try {
        const res = await fetch('/api/admin/clickup/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: t, workspaceId, docId: selectedDoc!.id, pages: batch }),
        })
        const data = await res.json()
        allResults.push(...(data.results ?? []))
      } catch {
        // Mark entire batch as errored
        batch.forEach(p => allResults.push({ name: p.name, status: 'error', error: 'Request failed' }))
      }
      // Update results incrementally so the user sees progress
      setResults([...allResults])
    }

    setStep('done')
  }

  const importedCount = results.filter(r => r.status === 'imported').length
  const skippedCount = results.filter(r => r.status === 'skipped').length
  const errorCount = results.filter(r => r.status === 'error').length

  const steps = ['Connect', 'Select Doc', 'Select Pages', 'Assign', 'Done']
  const stepIndex = { connect: 0, docs: 1, pages: 2, assign: 3, importing: 3, done: 4 }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy-700">Import from ClickUp</h1>
        <p className="text-gray-500 text-sm mt-0.5">Browse your ClickUp Docs hierarchy and import pages as SOPs</p>
      </div>

      {/* Step bar */}
      <div className="flex items-center gap-1.5 text-xs">
        {steps.map((label, i) => {
          const active = i === stepIndex[step]
          const done = i < stepIndex[step]
          return (
            <div key={label} className="flex items-center gap-1.5">
              <span className={`w-5 h-5 rounded-full flex items-center justify-center font-semibold flex-shrink-0 ${active ? 'bg-navy-700 text-white' : done ? 'bg-teal-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                {done ? '✓' : i + 1}
              </span>
              <span className={`hidden sm:inline ${active ? 'text-navy-700 font-medium' : 'text-gray-400'}`}>{label}</span>
              {i < steps.length - 1 && <ChevronRight className="w-3 h-3 text-gray-300 flex-shrink-0" />}
            </div>
          )
        })}
      </div>

      {/* ── Step 1: Connect ── */}
      {step === 'connect' && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-5">
          <div className="flex items-center gap-2">
            <Plug className="w-5 h-5 text-navy-700" />
            <h2 className="font-semibold text-navy-700">Connect to ClickUp</h2>
            {autoConnecting && <Loader2 className="w-4 h-4 animate-spin text-teal-500 ml-1" />}
          </div>
          {autoConnecting && <p className="text-sm text-gray-400">Reconnecting with saved token…</p>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Personal API Token</label>
            <input
              type="password"
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="pk_XXXXXXXXXXXXXXXXXXXXXXXXXX"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <p className="text-xs text-gray-400 mt-1">ClickUp → Profile → Settings → Apps → API Token</p>
          </div>
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 space-y-1">
              <p>{error}</p>
              <button
                onClick={() => { localStorage.removeItem('cu_token'); setError(''); setToken('') }}
                className="text-xs text-red-500 underline hover:text-red-700"
              >
                Clear saved token and start fresh
              </button>
            </div>
          )}
          <button onClick={handleConnect} disabled={connecting || !token.trim()}
            className="w-full py-2.5 bg-navy-700 text-white text-sm font-medium rounded-lg hover:bg-navy-800 disabled:opacity-50 flex items-center justify-center gap-2">
            {connecting || loadingDocs ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
            {connecting ? 'Connecting…' : loadingDocs ? 'Loading docs…' : 'Connect to ClickUp'}
          </button>
        </div>
      )}

      {/* ── Step 2: Select Doc ── */}
      {step === 'docs' && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-navy-700">Select a Doc</h2>
            <p className="text-xs text-gray-400 mt-0.5">{docs.length} docs found</p>
            <input type="text" value={docSearch} onChange={e => setDocSearch(e.target.value)}
              placeholder="Search docs… e.g. 10.4 PHT"
              className="mt-3 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              autoFocus />
          </div>
          <div className="divide-y divide-gray-50 max-h-[400px] overflow-y-auto">
            {filteredDocs.length === 0
              ? <p className="px-5 py-8 text-center text-sm text-gray-400">No docs match</p>
              : filteredDocs.map(doc => (
                <button key={doc.id} onClick={() => selectDoc(doc)}
                  className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors text-left">
                  <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span className="text-sm text-navy-700 flex-1 truncate">{doc.name}</span>
                  <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                </button>
              ))
            }
          </div>
          <div className="px-5 py-3 border-t border-gray-100">
            <button onClick={() => setStep('connect')} className="text-sm text-gray-400 hover:text-gray-600">← Back</button>
          </div>
        </div>
      )}

      {/* ── Step 3: Browse & Select Pages ── */}
      {step === 'pages' && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-navy-700">{selectedDoc?.name}</h2>
              <p className="text-xs text-gray-400 mt-0.5">{selectedPageIds.size} pages selected</p>
            </div>
            <button onClick={() => setStep('docs')} className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-2 py-1">
              ← Change doc
            </button>
          </div>

          {loadingPages ? (
            <div className="flex items-center justify-center gap-2 py-10 text-gray-400 text-sm">
              <Loader2 className="w-5 h-5 animate-spin" /> Loading pages…
            </div>
          ) : pagesError ? (
            <div className="px-5 py-6">
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{pagesError}</p>
            </div>
          ) : pageTree.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-gray-400">No pages found</p>
          ) : (
            <div className="max-h-[450px] overflow-y-auto py-2">
              <div className="mx-4 mb-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs text-blue-700">
                  <span className="font-semibold">Sections</span> (shown in italic) are folder headers — hover and click <span className="font-semibold text-teal-600">Import all →</span> to select all SOPs inside.
                  Categories will be <span className="font-semibold">auto-created</span> from section names when you import.
                </p>
              </div>
              <PageTree pages={pageTree} selectedIds={selectedPageIds} onToggle={handleTogglePage} />
            </div>
          )}

          <div className="px-5 py-4 border-t border-gray-100 flex justify-between items-center">
            <button onClick={() => setStep('docs')} className="text-sm text-gray-400 hover:text-gray-600">← Back</button>
            <button onClick={() => setStep('assign')} disabled={selectedPageIds.size === 0}
              className="px-4 py-2 bg-navy-700 text-white text-sm font-medium rounded-lg hover:bg-navy-800 disabled:opacity-50">
              Next: Assign → ({selectedPageIds.size} pages)
            </button>
          </div>
        </div>
      )}

      {/* ── Step 4: Assign ── */}
      {step === 'assign' && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-5">
          <div>
            <h2 className="font-semibold text-navy-700">Assign to Team</h2>
            <p className="text-sm text-gray-400 mt-0.5">
              {selectedPageIds.size} pages from <span className="text-navy-700 font-medium">{selectedDoc?.name}</span>.
              Categories will be auto-created from ClickUp section names.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              App Team <span className="text-red-500">*</span>
            </label>
            <select value={assignTeamId} onChange={e => setAssignTeamId(e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 ${!assignTeamId ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
              <option value="">— Select a team —</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {!assignTeamId && (
              <p className="text-xs text-red-500 mt-1">A team is required so categories can be auto-created from your ClickUp sections.</p>
            )}
          </div>

          {/* Preview of sections → categories that will be created */}
          {(() => {
            const sectionNames = [...new Set(selectedPages.map(p => p.parentName).filter(Boolean))]
            if (!sectionNames.length) return null
            return (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Categories that will be created</p>
                <div className="flex flex-wrap gap-1.5">
                  {sectionNames.map(name => (
                    <span key={name} className="text-xs bg-teal-100 text-teal-700 border border-teal-200 rounded-full px-2 py-0.5">{name}</span>
                  ))}
                </div>
              </div>
            )
          })()}

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
            Images will be copied from ClickUp into your app permanently.
          </div>

          <div className="flex justify-between items-center pt-1">
            <button onClick={() => setStep('pages')} className="text-sm text-gray-400 hover:text-gray-600">← Back</button>
            <button onClick={handleImport} disabled={!assignTeamId}
              className="px-5 py-2.5 bg-navy-700 text-white text-sm font-semibold rounded-lg hover:bg-navy-800 disabled:opacity-40 flex items-center gap-2">
              <Download className="w-4 h-4" />
              Import {selectedPageIds.size} Pages
            </button>
          </div>
        </div>
      )}

      {/* ── Importing ── */}
      {step === 'importing' && (
        <div className="bg-white border border-gray-200 rounded-2xl p-10 flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-teal-600 animate-spin" />
          <p className="font-semibold text-navy-700">Importing {selectedPageIds.size} pages…</p>
          <p className="text-sm text-gray-400 text-center">
            Processing in batches of {BATCH_SIZE}. Large imports take a few minutes — please keep this tab open.
          </p>
          {results.length > 0 && (
            <p className="text-sm text-teal-600 font-medium">{results.length} / {selectedPageIds.size} done</p>
          )}
        </div>
      )}

      {/* ── Done ── */}
      {step === 'done' && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-5 border-b border-gray-100 flex items-center gap-3">
            {errorCount > 0
              ? <AlertCircle className="w-6 h-6 text-amber-500 flex-shrink-0" />
              : <CheckCircle className="w-6 h-6 text-teal-600 flex-shrink-0" />
            }
            <div>
              <p className="font-semibold text-navy-700">Import complete</p>
              <div className="flex gap-3 mt-1 flex-wrap">
                <span className="text-sm text-teal-600 font-medium">✓ {importedCount} imported</span>
                {skippedCount > 0 && <span className="text-sm text-gray-400">⊘ {skippedCount} empty (skipped)</span>}
                {errorCount > 0 && <span className="text-sm text-red-500">✕ {errorCount} errors</span>}
              </div>
              {skippedCount > 0 && <p className="text-xs text-gray-400 mt-1">Skipped pages had no content — normal for section headers.</p>}
            </div>
          </div>
          <div className="divide-y divide-gray-50 max-h-[300px] overflow-y-auto">
            {results.map((r, i) => (
              <div key={i} className="px-5 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  {r.status === 'imported' && <CheckCircle className="w-3.5 h-3.5 text-teal-500 flex-shrink-0" />}
                  {r.status === 'skipped' && <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-300 flex-shrink-0" />}
                  {r.status === 'error' && <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
                  <span className="text-sm text-navy-700 truncate">{r.name}</span>
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0 ml-4">
                  {r.status === 'error' ? r.error : r.status}
                </span>
              </div>
            ))}
          </div>
          <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
            <button onClick={() => router.push('/sops')}
              className="flex-1 py-2 bg-navy-700 text-white text-sm font-medium rounded-lg hover:bg-navy-800">
              View SOPs
            </button>
            <button onClick={() => { setStep('pages'); setResults([]) }}
              className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">
              Import More
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
