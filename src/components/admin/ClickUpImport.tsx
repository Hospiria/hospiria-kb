'use client'

import { useState } from 'react'
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
interface SelectedPage { id: string; name: string; sectionId: string; sectionName: string }
interface SectionAssignment { teamId: string; categoryId: string }
type ImportResult = { name: string; status: 'imported' | 'skipped' | 'error'; error?: string }
type Step = 'connect' | 'docs' | 'pages' | 'assign' | 'importing' | 'done'

// ── Recursive page tree ────────────────────────────────────────────────
function PageTree({
  pages, depth = 0, selectedIds, onToggle, sectionId = '', sectionName = '',
}: {
  pages: CUPage[]
  depth?: number
  selectedIds: Set<string>
  onToggle: (page: CUPage, withChildren: boolean, sectionId: string, sectionName: string) => void
  sectionId?: string
  sectionName?: string
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
        // At depth 0, each page is its own section
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

              {/* Checkbox */}
              <button onClick={() => onToggle(page, false, mySectionId, mySectionName)} className="flex-shrink-0">
                {isSelected
                  ? <CheckSquare className="w-4 h-4 text-teal-600" />
                  : <Square className="w-4 h-4 text-gray-300 group-hover:text-gray-400" />
                }
              </button>

              {/* Icon + name */}
              {hasChildren
                ? <Layers className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                : <File className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              }
              <span className={`text-sm flex-1 truncate ${hasChildren ? 'font-medium text-navy-700' : 'text-gray-700'}`}>
                {page.name}
              </span>

              {/* Select all children */}
              {hasChildren && (
                <button
                  onClick={() => onToggle(page, true, mySectionId, mySectionName)}
                  className="text-xs text-teal-600 hover:underline opacity-0 group-hover:opacity-100 flex-shrink-0 ml-2 pr-3"
                >
                  Select all
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
  const [token, setToken] = useState('')
  const [connecting, setConnecting] = useState(false)
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

  // Assign — per section
  const [sectionAssignments, setSectionAssignments] = useState<Record<string, SectionAssignment>>({})

  // Results
  const [results, setResults] = useState<ImportResult[]>([])

  const filteredDocs = docs.filter(d => !docSearch || d.name.toLowerCase().includes(docSearch.toLowerCase()))

  // Sections derived from selectedPages
  const sections: { id: string; name: string; count: number }[] = []
  const seenSections = new Set<string>()
  for (const p of selectedPages) {
    if (!seenSections.has(p.sectionId)) {
      seenSections.add(p.sectionId)
      sections.push({ id: p.sectionId, name: p.sectionName, count: 0 })
    }
    sections.find(s => s.id === p.sectionId)!.count++
  }

  // ── Connect ──────────────────────────────────────────────────────────
  async function handleConnect() {
    setConnecting(true); setError('')
    try {
      const res = await fetch('/api/admin/clickup/workspaces', { headers: { 'x-clickup-token': token } })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Connection failed'); return }
      setWorkspaces(data.workspaces)
      const wsId = data.workspaces.length === 1 ? data.workspaces[0].id : ''
      if (wsId) { setWorkspaceId(wsId); await loadDocs(wsId) }
    } catch { setError('Could not reach ClickUp. Check your token.') }
    finally { setConnecting(false) }
  }

  async function loadDocs(wsId: string) {
    setLoadingDocs(true)
    try {
      const res = await fetch(`/api/admin/clickup/docs?workspaceId=${wsId}`, { headers: { 'x-clickup-token': token } })
      const data = await res.json()
      if (res.ok) { setDocs(data.docs ?? []); setStep('docs') }
    } finally { setLoadingDocs(false) }
  }

  // ── Select Doc → load page tree ───────────────────────────────────────
  async function selectDoc(doc: ClickUpDoc) {
    setSelectedDoc(doc)
    setPageTree([])
    setSelectedPageIds(new Set())
    setSelectedPages([])
    setSectionAssignments({})
    setPagesError('')
    setLoadingPages(true)
    setStep('pages')
    try {
      const res = await fetch(
        `/api/admin/clickup/pages?workspaceId=${workspaceId}&docId=${doc.id}`,
        { headers: { 'x-clickup-token': token } }
      )
      const data = await res.json()
      if (res.ok) {
        setPageTree(data.pages ?? [])
        if ((data.pages ?? []).length === 0) {
          setPagesError(`No pages returned from ClickUp. Doc ID: ${doc.id}`)
        }
      } else {
        setPagesError(data.error ?? 'Failed to load pages')
      }
    } catch (e) {
      setPagesError(`Unexpected error: ${String(e)}`)
    } finally { setLoadingPages(false) }
  }

  // ── Page selection ────────────────────────────────────────────────────
  function flattenPages(pages: CUPage[]): CUPage[] {
    const result: CUPage[] = []
    for (const p of pages) {
      result.push(p)
      if (p.pages?.length) result.push(...flattenPages(p.pages))
    }
    return result
  }

  function handleTogglePage(page: CUPage, withChildren: boolean, sectionId: string, sectionName: string) {
    const allPages = withChildren ? flattenPages([page]) : [page]
    const ids = allPages.map(p => p.id)
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
        ...allPages
          .filter(p => !existing.has(p.id))
          .map(p => ({ id: p.id, name: p.name, sectionId, sectionName })),
      ]
    })
  }

  function updateSection(sectionId: string, field: 'teamId' | 'categoryId', value: string) {
    setSectionAssignments(prev => ({
      ...prev,
      [sectionId]: {
        teamId: prev[sectionId]?.teamId ?? '',
        categoryId: prev[sectionId]?.categoryId ?? '',
        [field]: value,
        // Reset category when team changes
        ...(field === 'teamId' ? { categoryId: '' } : {}),
      },
    }))
  }

  // ── Import ────────────────────────────────────────────────────────────
  async function handleImport() {
    setStep('importing')
    try {
      const pagesWithAssignment = selectedPages.map(p => ({
        id: p.id,
        name: p.name,
        teamId: sectionAssignments[p.sectionId]?.teamId || null,
        categoryId: sectionAssignments[p.sectionId]?.categoryId || null,
      }))

      const res = await fetch('/api/admin/clickup/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, workspaceId, docId: selectedDoc!.id, pages: pagesWithAssignment }),
      })
      const data = await res.json()
      setResults(data.results ?? [])
    } catch {
      setResults([{ name: 'Import', status: 'error', error: 'Unexpected error' }])
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
        <p className="text-gray-500 text-sm mt-0.5">Browse your ClickUp Docs hierarchy and import individual pages as SOPs</p>
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
          </div>
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
          {workspaces.length > 1 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Workspace</label>
              <select value={workspaceId} onChange={e => { setWorkspaceId(e.target.value); loadDocs(e.target.value) }}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                <option value="">Choose workspace…</option>
                {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
          )}
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
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
            <p className="text-xs text-gray-400 mt-0.5">{docs.length} docs found · search to filter</p>
            <input
              type="text"
              value={docSearch}
              onChange={e => setDocSearch(e.target.value)}
              placeholder="Search docs… e.g. 10.4 PHT"
              className="mt-3 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              autoFocus
            />
          </div>
          <div className="divide-y divide-gray-50 max-h-[400px] overflow-y-auto">
            {filteredDocs.length === 0
              ? <p className="px-5 py-8 text-center text-sm text-gray-400">No docs match your search</p>
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
              <p className="text-xs text-gray-400 mt-0.5">
                {selectedPageIds.size} page{selectedPageIds.size !== 1 ? 's' : ''} selected
              </p>
            </div>
            <button onClick={() => setStep('docs')}
              className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-2 py-1">
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
            <p className="px-5 py-8 text-center text-sm text-gray-400">No pages found in this doc</p>
          ) : (
            <div className="max-h-[450px] overflow-y-auto py-2">
              <p className="text-xs text-gray-400 px-5 pb-2">
                Tick a page to select it · hover a section and click <span className="text-teal-600">Select all</span> to pick the whole section
              </p>
              <PageTree pages={pageTree} selectedIds={selectedPageIds} onToggle={handleTogglePage} />
            </div>
          )}

          <div className="px-5 py-4 border-t border-gray-100 flex justify-between items-center">
            <button onClick={() => setStep('docs')} className="text-sm text-gray-400 hover:text-gray-600">← Back</button>
            <button onClick={() => setStep('assign')} disabled={selectedPageIds.size === 0}
              className="px-4 py-2 bg-navy-700 text-white text-sm font-medium rounded-lg hover:bg-navy-800 disabled:opacity-50">
              Next: Assign → ({selectedPageIds.size} page{selectedPageIds.size !== 1 ? 's' : ''})
            </button>
          </div>
        </div>
      )}

      {/* ── Step 4: Assign per section ── */}
      {step === 'assign' && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-navy-700">Assign to Team &amp; Category</h2>
            <p className="text-sm text-gray-400 mt-0.5">
              Each section can go to a different category. Leave blank to assign later.
            </p>
          </div>

          <div className="divide-y divide-gray-100">
            {sections.map(section => {
              const assignment = sectionAssignments[section.id] ?? { teamId: '', categoryId: '' }
              const filteredCats = categories.filter(c => !assignment.teamId || c.team_id === assignment.teamId)
              return (
                <div key={section.id} className="px-5 py-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Layers className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="font-medium text-navy-700 text-sm">{section.name}</span>
                    <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
                      {section.count} page{section.count !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">App Team</label>
                      <select
                        value={assignment.teamId}
                        onChange={e => updateSection(section.id, 'teamId', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      >
                        <option value="">Assign later</option>
                        {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Category</label>
                      <select
                        value={assignment.categoryId}
                        onChange={e => updateSection(section.id, 'categoryId', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                        disabled={!assignment.teamId}
                      >
                        <option value="">Assign later</option>
                        {filteredCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="px-5 py-3 bg-amber-50 border-t border-amber-100">
            <p className="text-xs text-amber-700">Images will be copied from ClickUp into your app permanently.</p>
          </div>

          <div className="px-5 py-4 border-t border-gray-100 flex justify-between items-center">
            <button onClick={() => setStep('pages')} className="text-sm text-gray-400 hover:text-gray-600">← Back</button>
            <button onClick={handleImport}
              className="px-5 py-2.5 bg-navy-700 text-white text-sm font-semibold rounded-lg hover:bg-navy-800 flex items-center gap-2">
              <Download className="w-4 h-4" />
              Import {selectedPageIds.size} Page{selectedPageIds.size !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      )}

      {/* ── Importing ── */}
      {step === 'importing' && (
        <div className="bg-white border border-gray-200 rounded-2xl p-10 flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-teal-600 animate-spin" />
          <p className="font-semibold text-navy-700">Importing {selectedPageIds.size} pages…</p>
          <p className="text-sm text-gray-400 text-center">Downloading images and saving SOPs. This may take a minute.</p>
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
              <p className="text-sm text-gray-500">
                {importedCount} imported · {skippedCount} empty (skipped) · {errorCount} errors
              </p>
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
              Import More Pages
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
