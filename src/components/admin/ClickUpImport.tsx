'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckSquare, Square, Loader2, CheckCircle, AlertCircle,
  ChevronRight, Plug, FileText, Download, Layers, Folder, FolderOpen,
} from 'lucide-react'
import { Team } from '@/types'

interface Category { id: string; name: string; team_id: string }
interface ClickUpDoc { id: string; name: string }
interface Workspace { id: string; name: string }
interface Space { id: string; name: string }
interface CUFolder { id: string; name: string }
type ImportResult = { docName: string; imported: number; skipped: number; error?: string }
type Step = 'connect' | 'browse' | 'select' | 'configure' | 'importing' | 'done'

export function ClickUpImport({ teams, categories }: { teams: Team[]; categories: Category[] }) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('connect')

  // Auth
  const [token, setToken] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState('')

  // Workspace
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspaceId, setWorkspaceId] = useState('')

  // Browse: Space → Folder
  const [spaces, setSpaces] = useState<Space[]>([])
  const [selectedSpace, setSelectedSpace] = useState<Space | null>(null)
  const [folders, setFolders] = useState<CUFolder[]>([])
  const [selectedFolder, setSelectedFolder] = useState<CUFolder | null>(null)
  const [loadingSpaces, setLoadingSpaces] = useState(false)
  const [loadingFolders, setLoadingFolders] = useState(false)

  // Docs
  const [loadingDocs, setLoadingDocs] = useState(false)
  const [docs, setDocs] = useState<ClickUpDoc[]>([])
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set())
  const [docsSource, setDocsSource] = useState<string>('')
  const [showSearch, setShowSearch] = useState(false)
  const [docSearch, setDocSearch] = useState('')

  // Configure
  const [teamId, setTeamId] = useState('')
  const [categoryId, setCategoryId] = useState('')

  // Results
  const [results, setResults] = useState<ImportResult[]>([])

  const filteredCategories = categories.filter(c => !teamId || c.team_id === teamId)

  // ── Connect ──────────────────────────────────────────────────────────
  async function handleConnect() {
    setConnecting(true)
    setConnectError('')
    try {
      const res = await fetch('/api/admin/clickup/workspaces', {
        headers: { 'x-clickup-token': token },
      })
      const data = await res.json()
      if (!res.ok) { setConnectError(data.error ?? 'Connection failed'); return }

      setWorkspaces(data.workspaces)
      const wsId = data.workspaces.length === 1 ? data.workspaces[0].id : ''
      if (wsId) { setWorkspaceId(wsId); await loadSpaces(wsId) }
    } catch {
      setConnectError('Could not reach ClickUp. Check your token.')
    } finally {
      setConnecting(false)
    }
  }

  // ── Spaces ────────────────────────────────────────────────────────────
  async function loadSpaces(wsId: string) {
    setLoadingSpaces(true)
    try {
      const res = await fetch(`/api/admin/clickup/spaces?workspaceId=${wsId}`, {
        headers: { 'x-clickup-token': token },
      })
      const data = await res.json()
      if (res.ok) { setSpaces(data.spaces ?? []); setStep('browse') }
    } finally {
      setLoadingSpaces(false)
    }
  }

  // ── Folders ───────────────────────────────────────────────────────────
  async function selectSpace(space: Space) {
    setSelectedSpace(space)
    setSelectedFolder(null)
    setFolders([])
    setLoadingFolders(true)
    try {
      const res = await fetch(`/api/admin/clickup/folders?spaceId=${space.id}`, {
        headers: { 'x-clickup-token': token },
      })
      const data = await res.json()
      if (res.ok) setFolders(data.folders ?? [])
    } finally {
      setLoadingFolders(false)
    }
  }

  // ── Docs ──────────────────────────────────────────────────────────────
  async function loadDocs(space: Space | null, folder: CUFolder | null) {
    setLoadingDocs(true)
    setConnectError('')
    try {
      const params = new URLSearchParams({ workspaceId })
      if (folder) params.set('folderId', folder.id)
      else if (space) params.set('spaceId', space.id)

      const res = await fetch(`/api/admin/clickup/docs?${params}`, {
        headers: { 'x-clickup-token': token },
      })
      const data = await res.json()
      if (!res.ok) { setConnectError(data.error ?? 'Failed to load docs'); return }
      setDocs(data.docs ?? [])
      setDocsSource(data.source ?? '')
      setShowSearch(data.showSearch ?? false)
      setDocSearch('')
      setSelectedDocIds(new Set())
      setStep('select')
    } catch {
      setConnectError('Failed to load docs.')
    } finally {
      setLoadingDocs(false)
    }
  }

  function toggleDoc(id: string) {
    setSelectedDocIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelectedDocIds(selectedDocIds.size === docs.length ? new Set() : new Set(docs.map(d => d.id)))
  }

  // ── Import ────────────────────────────────────────────────────────────
  async function handleImport() {
    setStep('importing')
    try {
      const selectedDocs = docs.filter(d => selectedDocIds.has(d.id))
      const res = await fetch('/api/admin/clickup/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token, workspaceId,
          docs: selectedDocs,
          teamId: teamId || null,
          categoryId: categoryId || null,
        }),
      })
      const data = await res.json()
      setResults(data.results ?? [])
    } catch {
      setResults([{ docName: 'Import', imported: 0, skipped: 0, error: 'Unexpected error' }])
    }
    setStep('done')
  }

  const totalImported = results.reduce((s, r) => s + r.imported, 0)
  const totalSkipped = results.reduce((s, r) => s + r.skipped, 0)
  const hasErrors = results.some(r => r.error)

  // Breadcrumb label
  const browseLocation = selectedFolder
    ? `${selectedSpace?.name} › ${selectedFolder.name}`
    : selectedSpace?.name ?? 'Choose a space'

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy-700">Import from ClickUp</h1>
        <p className="text-gray-500 text-sm mt-0.5">Browse your ClickUp hierarchy and import Docs directly — images included</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs">
        {(['Connect', 'Browse', 'Select', 'Assign', 'Done'] as const).map((label, i) => {
          const stepMap: Record<string, Step> = { Connect: 'connect', Browse: 'browse', Select: 'select', Assign: 'configure', Done: 'done' }
          const isActive = step === stepMap[label] || (step === 'importing' && label === 'Assign')
          return (
            <div key={label} className="flex items-center gap-1.5">
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-semibold ${isActive ? 'bg-navy-700 text-white' : 'bg-gray-100 text-gray-400'}`}>
                {i + 1}
              </span>
              <span className={`hidden sm:inline ${isActive ? 'text-navy-700 font-medium' : 'text-gray-400'}`}>{label}</span>
              {i < 4 && <ChevronRight className="w-3 h-3 text-gray-300" />}
            </div>
          )
        })}
      </div>

      {/* ── STEP 1: Connect ── */}
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
            <p className="text-xs text-gray-400 mt-1">ClickUp → Profile avatar → Settings → Apps → API Token</p>
          </div>

          {workspaces.length > 1 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Workspace</label>
              <select
                value={workspaceId}
                onChange={e => { setWorkspaceId(e.target.value); loadSpaces(e.target.value) }}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="">Choose workspace…</option>
                {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
          )}

          {connectError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{connectError}</p>
          )}

          <button
            onClick={handleConnect}
            disabled={connecting || !token.trim()}
            className="w-full py-2.5 bg-navy-700 text-white text-sm font-medium rounded-lg hover:bg-navy-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {connecting || loadingSpaces ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
            {connecting ? 'Connecting…' : loadingSpaces ? 'Loading spaces…' : 'Connect to ClickUp'}
          </button>
        </div>
      )}

      {/* ── STEP 2: Browse Space → Folder ── */}
      {step === 'browse' && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-navy-700">Browse your ClickUp</h2>
            <p className="text-xs text-gray-400 mt-0.5">Select a Space, then optionally drill into a Folder</p>
          </div>

          <div className="grid grid-cols-2 divide-x divide-gray-100">
            {/* Spaces column */}
            <div>
              <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" /> Spaces
                </p>
              </div>
              <div className="max-h-[320px] overflow-y-auto">
                {spaces.map(space => (
                  <button
                    key={space.id}
                    onClick={() => selectSpace(space)}
                    className={`w-full flex items-center gap-2.5 px-4 py-3 text-left text-sm transition-colors hover:bg-gray-50 ${selectedSpace?.id === space.id ? 'bg-teal-50 text-teal-700 font-medium border-r-2 border-teal-500' : 'text-navy-700'}`}
                  >
                    <Layers className="w-3.5 h-3.5 flex-shrink-0 opacity-60" />
                    <span className="truncate">{space.name}</span>
                    {selectedSpace?.id === space.id && <ChevronRight className="w-3 h-3 ml-auto flex-shrink-0" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Folders column */}
            <div>
              <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Folder className="w-3.5 h-3.5" /> Folders
                </p>
              </div>
              <div className="max-h-[320px] overflow-y-auto">
                {!selectedSpace ? (
                  <p className="px-4 py-6 text-xs text-gray-400 text-center">← Select a space first</p>
                ) : loadingFolders ? (
                  <div className="flex items-center justify-center py-6 gap-2 text-gray-400 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                  </div>
                ) : (
                  <>
                    {/* Option to load all docs in this space (no folder) */}
                    <button
                      onClick={() => { setSelectedFolder(null); loadDocs(selectedSpace, null) }}
                      className="w-full flex items-center gap-2.5 px-4 py-3 text-left text-sm transition-colors hover:bg-gray-50 text-gray-500 border-b border-gray-50"
                    >
                      <FolderOpen className="w-3.5 h-3.5 flex-shrink-0 opacity-60" />
                      <span className="italic">All docs in {selectedSpace.name}</span>
                    </button>
                    {folders.length === 0 ? (
                      <p className="px-4 py-4 text-xs text-gray-400 text-center">No folders in this space</p>
                    ) : folders.map(folder => (
                      <button
                        key={folder.id}
                        onClick={() => { setSelectedFolder(folder); loadDocs(selectedSpace, folder) }}
                        className={`w-full flex items-center gap-2.5 px-4 py-3 text-left text-sm transition-colors hover:bg-gray-50 ${selectedFolder?.id === folder.id ? 'bg-teal-50 text-teal-700 font-medium' : 'text-navy-700'}`}
                      >
                        <Folder className="w-3.5 h-3.5 flex-shrink-0 opacity-60" />
                        <span className="truncate">{folder.name}</span>
                        {loadingDocs && selectedFolder?.id === folder.id
                          ? <Loader2 className="w-3 h-3 ml-auto animate-spin flex-shrink-0" />
                          : <ChevronRight className="w-3 h-3 ml-auto flex-shrink-0 opacity-40" />
                        }
                      </button>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="px-5 py-3 border-t border-gray-100">
            <button onClick={() => setStep('connect')} className="text-sm text-gray-400 hover:text-gray-600">← Back</button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Select Docs ── */}
      {step === 'select' && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h2 className="font-semibold text-navy-700">
                  {docsSource === 'all'
                    ? `${docs.length} Docs across whole workspace`
                    : `${docs.length} Doc${docs.length !== 1 ? 's' : ''} in `}
                  {docsSource !== 'all' && <span className="text-teal-600">{browseLocation}</span>}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">{selectedDocIds.size} selected</p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={selectAll} className="text-xs text-teal-600 hover:underline font-medium">
                  {selectedDocIds.size === docs.length ? 'Deselect all' : 'Select all'}
                </button>
                <button onClick={() => setStep('browse')} className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-2 py-1">
                  ← Browse
                </button>
              </div>
            </div>
            {/* Warning + search when showing all workspace docs */}
            {showSearch && (
              <div className="mt-2 space-y-2">
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  ⚠ Could not filter by space — showing all workspace docs. Use the search below to find your docs.
                </p>
                <input
                  type="text"
                  value={docSearch}
                  onChange={e => setDocSearch(e.target.value)}
                  placeholder="Search docs by name… e.g. 10.4 PHT"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  autoFocus
                />
              </div>
            )}
          </div>

          <div className="divide-y divide-gray-50 max-h-[400px] overflow-y-auto">
            {docs.length === 0 ? (
              <div className="px-5 py-10 text-center text-gray-400">
                <p className="text-sm font-medium text-gray-500">No docs found</p>
                <p className="text-xs mt-1 text-gray-400">ClickUp Docs are separate from task folders.<br />Try selecting the Space directly instead of a folder.</p>
                <button onClick={() => setStep('browse')} className="mt-3 text-xs text-teal-600 hover:underline font-medium">← Go back and select the Space</button>
              </div>
            ) : docs.filter(d => !docSearch || d.name.toLowerCase().includes(docSearch.toLowerCase())).map(doc => (
              <button
                key={doc.id}
                onClick={() => toggleDoc(doc.id)}
                className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors text-left"
              >
                {selectedDocIds.has(doc.id)
                  ? <CheckSquare className="w-4 h-4 text-teal-600 flex-shrink-0" />
                  : <Square className="w-4 h-4 text-gray-300 flex-shrink-0" />
                }
                <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="text-sm text-navy-700 flex-1 truncate">{doc.name}</span>
              </button>
            ))}

          </div>

          <div className="px-5 py-4 border-t border-gray-100 flex justify-between items-center">
            <button onClick={() => setStep('browse')} className="text-sm text-gray-400 hover:text-gray-600">← Back</button>
            <button
              onClick={() => setStep('configure')}
              disabled={selectedDocIds.size === 0}
              className="px-4 py-2 bg-navy-700 text-white text-sm font-medium rounded-lg hover:bg-navy-800 transition-colors disabled:opacity-50"
            >
              Next: Assign → ({selectedDocIds.size} selected)
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 4: Configure ── */}
      {step === 'configure' && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-5">
          <div>
            <h2 className="font-semibold text-navy-700">Assign to Team & Category</h2>
            <p className="text-sm text-gray-400 mt-0.5">
              From: <span className="text-teal-600">{browseLocation}</span> · {selectedDocIds.size} doc{selectedDocIds.size !== 1 ? 's' : ''}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">App Team</label>
              <select
                value={teamId}
                onChange={e => { setTeamId(e.target.value); setCategoryId('') }}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="">Assign later</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                value={categoryId}
                onChange={e => setCategoryId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="">Assign later</option>
                {filteredCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
            <strong>Images:</strong> All images will be downloaded from ClickUp and stored permanently in your app.
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep('select')} className="text-sm text-gray-400 hover:text-gray-600">← Back</button>
            <button
              onClick={handleImport}
              className="px-5 py-2.5 bg-navy-700 text-white text-sm font-semibold rounded-lg hover:bg-navy-800 transition-colors flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Import {selectedDocIds.size} Doc{selectedDocIds.size !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      )}

      {/* ── Importing ── */}
      {step === 'importing' && (
        <div className="bg-white border border-gray-200 rounded-2xl p-10 flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-teal-600 animate-spin" />
          <p className="font-semibold text-navy-700">Importing from ClickUp…</p>
          <p className="text-sm text-gray-400 text-center">
            Fetching pages, downloading images and saving to your app.<br />This may take a few minutes for large docs.
          </p>
        </div>
      )}

      {/* ── Done ── */}
      {step === 'done' && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-5 border-b border-gray-100 flex items-center gap-3">
            {hasErrors
              ? <AlertCircle className="w-6 h-6 text-amber-500 flex-shrink-0" />
              : <CheckCircle className="w-6 h-6 text-teal-600 flex-shrink-0" />
            }
            <div>
              <p className="font-semibold text-navy-700">Import complete</p>
              <p className="text-sm text-gray-500">{totalImported} SOP{totalImported !== 1 ? 's' : ''} imported · {totalSkipped} empty pages skipped</p>
            </div>
          </div>

          <div className="divide-y divide-gray-50 max-h-[300px] overflow-y-auto">
            {results.map((r, i) => (
              <div key={i} className="px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  {r.error
                    ? <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    : <CheckCircle className="w-4 h-4 text-teal-500 flex-shrink-0" />
                  }
                  <span className="text-sm text-navy-700 truncate">{r.docName}</span>
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0 ml-4">
                  {r.error ? r.error : `${r.imported} imported`}
                </span>
              </div>
            ))}
          </div>

          <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
            <button
              onClick={() => router.push('/sops')}
              className="flex-1 py-2 bg-navy-700 text-white text-sm font-medium rounded-lg hover:bg-navy-800 transition-colors"
            >
              View SOPs
            </button>
            <button
              onClick={() => { setStep('browse'); setResults([]); setDocs([]); setSelectedDocIds(new Set()) }}
              className="px-4 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              Import More
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
