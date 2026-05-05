'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Team, Category } from '@/types'
import { Plus, Edit2, Check, X, GripVertical, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

type Approver = { id: string; full_name: string | null; primary_team_id: string | null }

interface Props {
  teams: Team[]
  categories: Category[]
  approvers: Approver[]
}

export function TeamManagement({ teams, categories, approvers }: Props) {
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(teams[0] ?? null)
  const [newCatName, setNewCatName] = useState('')
  const [addingCat, setAddingCat] = useState(false)
  const [editingCat, setEditingCat] = useState<string | null>(null)
  const [editCatName, setEditCatName] = useState('')
  const [newTeamName, setNewTeamName] = useState('')
  const [addingTeam, setAddingTeam] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const teamCats = categories.filter(c => c.team_id === selectedTeam?.id)
  const teamApprovers = approvers.filter(a => a.primary_team_id === selectedTeam?.id)

  async function addTeam() {
    if (!newTeamName.trim()) return
    await supabase.from('teams').insert({ name: newTeamName.trim() })
    setNewTeamName('')
    setAddingTeam(false)
    router.refresh()
  }

  async function addCategory() {
    if (!newCatName.trim() || !selectedTeam) return
    setAddingCat(true)
    const maxOrder = Math.max(0, ...teamCats.map(c => c.display_order))
    await supabase.from('categories').insert({
      team_id: selectedTeam.id,
      name: newCatName.trim(),
      display_order: maxOrder + 1,
    })
    setNewCatName('')
    setAddingCat(false)
    router.refresh()
  }

  async function updateCategory(id: string, name: string) {
    await supabase.from('categories').update({ name }).eq('id', id)
    setEditingCat(null)
    router.refresh()
  }

  async function deleteCategory(id: string) {
    if (!confirm('Delete this category? SOPs in this category will become uncategorised.')) return
    await supabase.from('categories').delete().eq('id', id)
    router.refresh()
  }

  async function moveCategory(id: string, direction: 'up' | 'down') {
    const idx = teamCats.findIndex(c => c.id === id)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= teamCats.length) return
    const a = teamCats[idx]
    const b = teamCats[swapIdx]
    await supabase.from('categories').update({ display_order: b.display_order }).eq('id', a.id)
    await supabase.from('categories').update({ display_order: a.display_order }).eq('id', b.id)
    router.refresh()
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy-700">Teams & Categories</h1>
        <p className="text-gray-500 text-sm mt-0.5">Manage teams and their SOP categories</p>
      </div>

      <div className="flex gap-6">
        {/* Teams panel */}
        <div className="w-56 flex-shrink-0">
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="text-sm font-semibold text-navy-700">Teams</p>
              <button onClick={() => setAddingTeam(true)} className="text-teal-600 hover:text-teal-700">
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="divide-y divide-gray-50">
              {teams.map(team => (
                <button
                  key={team.id}
                  onClick={() => setSelectedTeam(team)}
                  className={`w-full text-left px-4 py-3 text-sm transition-colors ${
                    selectedTeam?.id === team.id
                      ? 'bg-navy-700 text-white'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {team.name}
                </button>
              ))}
            </div>
            {addingTeam && (
              <div className="p-3 border-t border-gray-100">
                <input
                  autoFocus
                  value={newTeamName}
                  onChange={e => setNewTeamName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addTeam(); if (e.key === 'Escape') setAddingTeam(false) }}
                  placeholder="Team name"
                  className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <div className="flex gap-1 mt-1">
                  <button onClick={addTeam} className="flex-1 text-xs py-1 bg-navy-700 text-white rounded-lg">Add</button>
                  <button onClick={() => setAddingTeam(false)} className="flex-1 text-xs py-1 border border-gray-200 rounded-lg">Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Categories panel */}
        <div className="flex-1">
          {selectedTeam ? (
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-navy-700">
                  {selectedTeam.name} — Categories ({teamCats.length})
                </h2>
                {teamApprovers.length > 0 && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    Approver: {teamApprovers.map(a => a.full_name).join(', ')}
                  </p>
                )}
              </div>
              <div className="divide-y divide-gray-50">
                {teamCats.map((cat, idx) => (
                  <div key={cat.id} className="flex items-center gap-3 px-5 py-3">
                    <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0" />
                    <span className="text-sm text-gray-400 w-6 text-right">{cat.display_order}</span>
                    <div className="flex-1">
                      {editingCat === cat.id ? (
                        <input
                          autoFocus
                          value={editCatName}
                          onChange={e => setEditCatName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') updateCategory(cat.id, editCatName)
                            if (e.key === 'Escape') setEditingCat(null)
                          }}
                          className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-teal-500"
                        />
                      ) : (
                        <span className="text-sm text-gray-700">{cat.name}</span>
                      )}
                    </div>
                    <div className="flex gap-1">
                      {editingCat === cat.id ? (
                        <>
                          <button onClick={() => updateCategory(cat.id, editCatName)} className="p-1 text-green-600 hover:bg-green-50 rounded">
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setEditingCat(null)} className="p-1 text-gray-400 hover:bg-gray-50 rounded">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => { setEditingCat(cat.id); setEditCatName(cat.name) }}
                            className="p-1 text-gray-400 hover:text-navy-700 hover:bg-gray-100 rounded"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => deleteCategory(cat.id)} className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-5 py-3 border-t border-gray-100 flex gap-2">
                <input
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addCategory() }}
                  placeholder="New category name…"
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <button
                  onClick={addCategory}
                  disabled={addingCat || !newCatName.trim()}
                  className="flex items-center gap-1.5 px-3 py-2 bg-navy-700 text-white text-sm font-medium rounded-lg hover:bg-navy-800 transition-colors disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  Add
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center text-gray-400">
              Select a team to manage categories
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
