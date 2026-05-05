'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckSquare, Square, Loader2, CheckCircle, AlertCircle, ChevronRight, Plug, FileText, Download, Layers } from 'lucide-react'
import { Team } from '@/types'

interface Category { id: string; name: string; team_id: string }
interface ClickUpDoc { id: string; name: string }
interface Workspace { id: string; name: string }
interface Space { id: string; name: string }
type ImportResult = { docName: string; imported: number; skipped: number; error?: string }
type Step = 'connect' | 'select' | 'configure' | 'importing' | 'done'

export function ClickUpImport({ teams, categories }: { teams: Team[]; categories: Category[] }) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('connect')

  // Connect
  const [token, setToken] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState('')
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspaceId, setWorkspaceId] = useState('')

  // Space filter
  const [spaces, setSpaces] = useState<Space[]>([])
  const [selectedSpaceId, setSelectedSpaceId] = useState('')
  const [loadingSpaces, setLoadingSpaces] = useState(false)

  // Docs
  const [loadingDocs, setLoadingDocs] = useState(false)
  const [docs, setDocs] = useState<ClickUpDoc[]>([])
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set())

  // Configure
  const [teamId, setTeamId] = useState('')
  const [categoryId, setCategoryId] = useState('')

  // Results
  const [results, setResults] = useState<ImportResult[]>([])

  const filteredCategories = categories.filter(c => !teamId || c.team_id === teamId)

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
      if (wsId) {
        setWorkspaceId(wsId)
        await loadSpaces(wsId)
      }
    } catch {
      setConnectError('Could not reach ClickUp. Check your token.')
    } finally {
      setConnecting(false)
    }
  }

  async function loadSpaces(wsId: string) {
    setLoadingSpaces(true)
    try {
      const res = await fetch(`/api/admin/clickup/spaces?workspaceId=${wsId}`, {
        headers: { 'x-clickup-token': token },
      })
      const data = await res.json()
      if (res.ok) setSpaces(data.spaces ?? [])
    } finally {
      setLoadingSpaces(false)
    }
  }

  async function loadDocs() {
    setLoadingDocs(true)
    setConnectError('')
    try {
      const params = new URLSearchParams({ workspaceId })
      if (selectedSpaceId) params.set('spaceId', selectedSpaceId)

      const res = await fetch(`/api/admin/clickup/docs?${params}`, {
        headers: { 'x-clickup-token': token },
      })
      const data = await res.json()
      if (!res.ok) { setConnectError(data.error ?? 'Failed to load docs'); return }
      setDocs(data.docs ?? [])
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

  async function handleImport() {
    setStep('importing')
    try {
      const selectedDocs = docs.filter(d => selectedDocIds.has(d.id))
      const res = await fetch('/api/admin/clickup/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, workspaceId, docs: selectedDocs, teamId: teamId || null, categoryId: categoryId || null }),
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

  const selectedSpaceName = spaces.find(s => s.id === selectedSpaceId)?.name

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy-700">Import from ClickUp</h1>
        <p className="text-gray-500 text-sm mt-0.5">Pull your ClickUp Docs directly into the Knowledge Base — images included</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs text-gray-400">
        {(['connect', 'select', 'configure', 'done'] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded-full font-medium ${step === s || (step === 'importing' && s === 'configure') ? 'bg-navy-700 text-white' : 'bg-gray-100 text-gray-400'}`}>
              {i + 1}
            </span>
            <span className="capitalize hidden sm:inline">{s === 'configure' ? 'Assign' : s}</span>
            {i < 3 && <ChevronRight className="w-3 h-3" />}
          </div>
        ))}
      </div>

      {/* Step 1: Connect + Space selection */}
      {step === 'connect' && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-5">
          <div className="flex items-center gap-2">
            <Plug className="w-5 h-5 text-navy-700" />
            <h2 className="font-semibold text-navy-700">Connect to ClickUp</h2>
          </div>

          {/* Token */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ClickUp Personal API Token</label>
            <input
              type="password"
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="pk_XXXXXXXXXXXXXXXXXXXXXXXXXX"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              ClickUp → Profile avatar → Settings → Apps → API Token
            </p>
          </div>

          {/* Workspace selector (only shown after connect if multiple) */}
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

          {/* Space filter — shown after workspace is selected */}
          {workspaceId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                Filter by Space <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              {loadingSpaces ? (
                <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading spaces…
                </div>
              ) : (
                <>
                  <select
                    value={selectedSpaceId}
                    onChange={e => setSelectedSpaceId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="">All spaces (entire workspace)</option>
                    {spaces.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  {selectedSpaceId && (
                    <p className="text-xs text-teal-600 mt-1">
                      ✓ Will only import docs from <strong>{selectedSpaceName}</strong>
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {connectError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{connectError}</p>
          )}

          {/* Connect button (initial) or Load Docs button (after workspace selected) */}
          {!workspaceId ? (
            <button
              onClick={handleConnect}
              disabled={connecting || !token.trim()}
              className="w-full py-2.5 bg-navy-700 text-white text-sm font-medium rounded-lg hover:bg-navy-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
              {connecting ? 'Connecting…' : 'Connect to ClickUp'}
            </button>
          ) : (
            <button
              onClick={loadDocs}
              disabled={loadingDocs || loadingSpaces}
              className="w-full py-2.5 bg-navy-700 text-white text-sm font-medium rounded-lg hover:bg-navy-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loadingDocs ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {loadingDocs ? 'Loading docs…' : selectedSpaceId ? `Load docs from ${selectedSpaceName}` : 'Load all docs'}
            </button>
          )}
        </div>
      )}

      {/* Step 2: Select Docs */}
      {step === 'select' && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-navy-700">{docs.length} Docs found</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {selectedSpaceName ? `From space: ${selectedSpaceName} · ` : ''}{selectedDocIds.size} selected
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={selectAll} className="text-xs text-teal-600 hover:underline font-medium">
                {selectedDocIds.size === docs.length ? 'Deselect all' : 'Select all'}
              </button>
              <button
                onClick={() => setStep('connect')}
                className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-2 py-1"
              >
                Change space
              </button>
            </div>
          </div>

          <div className="divide-y divide-gray-50 max-h-[420px] overflow-y-auto">
            {docs.length === 0 ? (
              <div className="px-5 py-10 text-center text-gray-400">
                <p className="text-sm">No docs found</p>
                <button onClick={() => setStep('connect')} className="mt-2 text-xs text-teal-600 hover:underline">
                  Try a different space
                </button>
              </div>
            ) : docs.map(doc => (
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
            <button onClick={() => setStep('connect')} className="text-sm text-gray-400 hover:text-gray-600">
              ← Back
            </button>
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

      {/* Step 3: Configure */}
      {step === 'configure' && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-5">
          <h2 className="font-semibold text-navy-700">Assign to Team & Category</h2>
          <p className="text-sm text-gray-500">
            {selectedDocIds.size} doc{selectedDocIds.size !== 1 ? 's' : ''} will be imported as draft SOPs. Assign them to a team and category, or leave blank to assign individually after import.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Team</label>
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
            <strong>Images:</strong> All images in your ClickUp docs will be downloaded and stored permanently in your app — no dependency on ClickUp after import.
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

      {/* Importing */}
      {step === 'importing' && (
        <div className="bg-white border border-gray-200 rounded-2xl p-10 flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-teal-600 animate-spin" />
          <p className="font-semibold text-navy-700">Importing from ClickUp…</p>
          <p className="text-sm text-gray-400 text-center">
            Fetching pages, downloading images and saving to your app.<br />
            This may take a few minutes for large docs.
          </p>
        </div>
      )}

      {/* Done */}
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
              onClick={() => { setStep('connect'); setResults([]); setDocs([]); setSelectedDocIds(new Set()) }}
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
