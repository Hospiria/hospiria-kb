'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Search, CheckSquare, Square, Tag, Users, BookOpen, X, ChevronDown, Check } from 'lucide-react'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { SopStatus } from '@/types'
import { formatDate } from '@/lib/utils'

interface Team { id: string; name: string }
interface Category { id: string; name: string; team_id: string }
interface Sop {
  id: string
  title: string
  status: string
  updated_at: string
  category_id: string | null
  categories?: { id: string; name: string; team_id: string } | null
  profiles?: { full_name: string | null } | null
  sop_teams?: { team_id: string; teams?: { id: string; name: string } | null }[]
}

export function BulkSopManager({
  sops, teams, categories,
}: {
  sops: Sop[]
  teams: Team[]
  categories: Category[]
}) {
  const router = useRouter()

  // Filters
  const [search, setSearch] = useState('')
  const [filterTeam, setFilterTeam] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterCategory, setFilterCategory] = useState('__none__') // '__none__' = no category, '' = all

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Bulk action state
  const [bulkCategory, setBulkCategory] = useState('')
  const [bulkTeam, setBulkTeam] = useState('')
  const [bulkStatus, setBulkStatus] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  // Filtered SOPs
  const filtered = useMemo(() => {
    return sops.filter(sop => {
      if (search && !sop.title.toLowerCase().includes(search.toLowerCase())) return false
      if (filterStatus && sop.status !== filterStatus) return false
      if (filterTeam && !sop.sop_teams?.some(t => t.team_id === filterTeam)) return false
      if (filterCategory === '__none__' && sop.category_id !== null) return false
      if (filterCategory && filterCategory !== '__none__' && sop.category_id !== filterCategory) return false
      return true
    })
  }, [sops, search, filterStatus, filterTeam, filterCategory])

  const allSelected = filtered.length > 0 && filtered.every(s => selectedIds.has(s.id))
  const someSelected = selectedIds.size > 0

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(prev => { const n = new Set(prev); filtered.forEach(s => n.delete(s.id)); return n })
    } else {
      setSelectedIds(prev => { const n = new Set(prev); filtered.forEach(s => n.add(s.id)); return n })
    }
  }

  function toggleOne(id: string) {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function clearSelection() { setSelectedIds(new Set()) }

  async function applyBulk() {
    if (!selectedIds.size) return
    setSaving(true)
    setSaveMsg('')

    const body: Record<string, unknown> = { sopIds: [...selectedIds] }
    if (bulkCategory !== '') body.categoryId = bulkCategory || null
    if (bulkTeam !== '') body.teamId = bulkTeam
    if (bulkStatus) body.status = bulkStatus

    const res = await fetch('/api/admin/sops/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    setSaving(false)

    if (data.success) {
      setSaveMsg(`✓ Updated ${data.updated} SOP${data.updated !== 1 ? 's' : ''}`)
      setBulkCategory('')
      setBulkTeam('')
      setBulkStatus('')
      setSelectedIds(new Set())
      router.refresh()
    } else {
      setSaveMsg(`Error: ${data.error}`)
    }
  }

  const filteredCategoriesForBulk = categories.filter(c => !bulkTeam || c.team_id === bulkTeam)

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy-700">Manage SOPs</h1>
          <p className="text-gray-500 text-sm mt-0.5">{sops.length} total · select SOPs to bulk-assign categories, teams, or status</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search SOPs…"
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
          />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500">
          <option value="">All statuses</option>
          {['draft', 'submitted', 'changes_requested', 'live', 'archived'].map(s => (
            <option key={s} value={s}>{s.replace('_', ' ')}</option>
          ))}
        </select>
        <select value={filterTeam} onChange={e => setFilterTeam(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500">
          <option value="">All teams</option>
          {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500">
          <option value="">All categories</option>
          <option value="__none__">No category</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Bulk action bar */}
      {someSelected && (
        <div className="bg-navy-700 text-white rounded-2xl px-5 py-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 mr-2">
            <Check className="w-4 h-4 text-teal-400" />
            <span className="font-semibold text-sm">{selectedIds.size} selected</span>
            <button onClick={clearSelection} className="ml-1 text-navy-300 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Assign Team */}
          <div className="flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-navy-300 flex-shrink-0" />
            <select value={bulkTeam} onChange={e => { setBulkTeam(e.target.value); setBulkCategory('') }}
              className="text-sm bg-navy-600 border border-navy-500 text-white rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-400">
              <option value="">Set team…</option>
              <option value="__remove__">Remove team</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          {/* Assign Category */}
          <div className="flex items-center gap-2">
            <Tag className="w-3.5 h-3.5 text-navy-300 flex-shrink-0" />
            <select value={bulkCategory} onChange={e => setBulkCategory(e.target.value)}
              className="text-sm bg-navy-600 border border-navy-500 text-white rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-400">
              <option value="">Set category…</option>
              <option value="__remove__">Remove category</option>
              {filteredCategoriesForBulk.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Assign Status */}
          <div className="flex items-center gap-2">
            <BookOpen className="w-3.5 h-3.5 text-navy-300 flex-shrink-0" />
            <select value={bulkStatus} onChange={e => setBulkStatus(e.target.value)}
              className="text-sm bg-navy-600 border border-navy-500 text-white rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-400">
              <option value="">Set status…</option>
              <option value="draft">Draft</option>
              <option value="live">Live</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          <button
            onClick={applyBulk}
            disabled={saving || (!bulkCategory && !bulkTeam && !bulkStatus)}
            className="ml-auto px-4 py-1.5 bg-teal-500 hover:bg-teal-400 text-white text-sm font-semibold rounded-lg disabled:opacity-40 transition-colors"
          >
            {saving ? 'Saving…' : 'Apply'}
          </button>

          {saveMsg && <span className="text-sm text-teal-300">{saveMsg}</span>}
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50">
          <button onClick={toggleAll} className="flex-shrink-0">
            {allSelected
              ? <CheckSquare className="w-4 h-4 text-teal-600" />
              : <Square className="w-4 h-4 text-gray-300" />
            }
          </button>
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex-1">
            {filtered.length} SOP{filtered.length !== 1 ? 's' : ''}
          </span>
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider w-36 hidden md:block">Category</span>
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider w-28 hidden lg:block">Team</span>
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">Status</span>
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider w-24 hidden sm:block">Updated</span>
        </div>

        {/* Rows */}
        <div className="divide-y divide-gray-50">
          {filtered.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-gray-400">No SOPs match your filters</p>
          ) : (
            filtered.map(sop => {
              const isSelected = selectedIds.has(sop.id)
              const teamName = sop.sop_teams?.[0]?.teams?.name ?? '—'
              const catName = sop.categories?.name ?? <span className="text-gray-300 italic">No category</span>

              return (
                <div
                  key={sop.id}
                  onClick={() => toggleOne(sop.id)}
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${isSelected ? 'bg-teal-50' : 'hover:bg-gray-50'}`}
                >
                  <div className="flex-shrink-0" onClick={e => { e.stopPropagation(); toggleOne(sop.id) }}>
                    {isSelected
                      ? <CheckSquare className="w-4 h-4 text-teal-600" />
                      : <Square className="w-4 h-4 text-gray-300" />
                    }
                  </div>
                  <span className="text-sm text-navy-700 flex-1 truncate font-medium">{sop.title}</span>
                  <span className="text-xs text-gray-500 w-36 truncate hidden md:block">{catName}</span>
                  <span className="text-xs text-gray-500 w-28 truncate hidden lg:block">{teamName}</span>
                  <div className="w-24 flex-shrink-0"><StatusBadge status={sop.status as SopStatus} /></div>
                  <span className="text-xs text-gray-400 w-24 flex-shrink-0 hidden sm:block">{formatDate(sop.updated_at)}</span>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
