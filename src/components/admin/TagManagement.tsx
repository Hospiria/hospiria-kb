'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Plus, Edit2, Check, X, EyeOff, Eye, Trash2, Upload } from 'lucide-react'

/**
 * Generic admin manager for simple "tag" entities (companies, platforms).
 * Both tables share the shape { id, name, description, is_active, ... } so
 * a single component covers both. If the entities ever diverge, split this.
 */

export type Tag = {
  id: string
  name: string
  description: string | null
  is_active: boolean
}

type TableName = 'companies' | 'platforms'

interface Props {
  tableName: TableName
  /** "Company" / "Platform" — used in headings and modal copy. */
  singular: string
  /** "Companies" / "Platforms". */
  plural: string
  /** One-line page subtitle. */
  description: string
  /** Initial server-fetched rows. */
  initialTags: Tag[]
}

export function TagManagement({ tableName, singular, plural, description, initialTags }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // CSV import
  const [csvPreview, setCsvPreview] = useState<string[]>([])
  const [csvImporting, setCsvImporting] = useState(false)
  const [csvResult, setCsvResult] = useState<{ added: number; skipped: number } | null>(null)

  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = evt => {
      const text = evt.target?.result as string
      const names = text
        .split(/\r?\n/)
        .map(line => line.split(',')[0].trim().replace(/^["']|["']$/g, ''))
        .filter(name => name && name.toLowerCase() !== 'name')
      setCsvPreview(names)
      setError(null)
    }
    reader.readAsText(file)
    e.target.value = '' // allow re-upload of same file
  }

  async function importFromCsv() {
    if (csvPreview.length === 0) return
    setCsvImporting(true)
    setError(null)
    setCsvResult(null)

    // Fetch existing names so we can skip duplicates without needing a DB unique constraint
    const { data: existing } = await supabase.from(tableName).select('name')
    const existingNames = new Set((existing ?? []).map((r: { name: string }) => r.name.toLowerCase().trim()))

    const toInsert = csvPreview.filter(n => !existingNames.has(n.toLowerCase().trim()))
    const skipped = csvPreview.length - toInsert.length

    if (toInsert.length > 0) {
      const { error: err } = await supabase
        .from(tableName)
        .insert(toInsert.map(name => ({ name, is_active: true })))
      if (err) { setCsvImporting(false); setError(err.message); return }
    }

    setCsvImporting(false)
    setCsvPreview([])
    setCsvResult({ added: toInsert.length, skipped })
    router.refresh()
  }

  const active = initialTags.filter(t => t.is_active)
  const inactive = initialTags.filter(t => !t.is_active)

  async function addTag() {
    if (!newName.trim()) return
    setBusy(true)
    setError(null)
    const { error: err } = await supabase
      .from(tableName)
      .insert({ name: newName.trim(), description: newDescription.trim() || null })
    setBusy(false)
    if (err) {
      setError(err.message)
      return
    }
    setNewName('')
    setNewDescription('')
    setAdding(false)
    router.refresh()
  }

  function startEdit(tag: Tag) {
    setEditingId(tag.id)
    setEditName(tag.name)
    setEditDescription(tag.description ?? '')
    setError(null)
  }

  async function saveEdit(id: string) {
    if (!editName.trim()) return
    setBusy(true)
    setError(null)
    const { error: err } = await supabase
      .from(tableName)
      .update({ name: editName.trim(), description: editDescription.trim() || null })
      .eq('id', id)
    setBusy(false)
    if (err) {
      setError(err.message)
      return
    }
    setEditingId(null)
    router.refresh()
  }

  async function toggleActive(tag: Tag) {
    setBusy(true)
    setError(null)
    const { error: err } = await supabase
      .from(tableName)
      .update({ is_active: !tag.is_active })
      .eq('id', tag.id)
    setBusy(false)
    if (err) {
      setError(err.message)
      return
    }
    router.refresh()
  }

  async function hardDelete(tag: Tag) {
    if (!confirm(`Permanently delete "${tag.name}"? This will untag it from all SOPs and cannot be undone. To keep SOP history intact, use Deactivate instead.`)) {
      return
    }
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.from(tableName).delete().eq('id', tag.id)
    setBusy(false)
    if (err) {
      setError(err.message)
      return
    }
    router.refresh()
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-700">{plural}</h1>
          <p className="text-gray-500 text-sm mt-0.5">{description}</p>
        </div>
        {!adding && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <label className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors">
              <Upload className="w-4 h-4" />
              Import CSV
              <input type="file" accept=".csv,.txt" className="hidden" onChange={handleCsvFile} />
            </label>
            <button
              onClick={() => { setAdding(true); setError(null) }}
              className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg bg-teal-500 text-white hover:bg-teal-600 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add {singular.toLowerCase()}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
          {error}
        </div>
      )}

      {csvResult && (
        <div className="bg-teal-50 border border-teal-200 text-teal-800 text-sm px-3 py-2 rounded-lg flex items-center justify-between">
          <span>
            ✓ Imported {csvResult.added} {csvResult.added === 1 ? singular.toLowerCase() : plural.toLowerCase()}
            {csvResult.skipped > 0 && ` — ${csvResult.skipped} duplicate${csvResult.skipped > 1 ? 's' : ''} skipped`}
          </span>
          <button onClick={() => setCsvResult(null)} className="ml-3 text-teal-600 hover:text-teal-800">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {csvPreview.length > 0 && (
        <div className="bg-white border border-teal-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-navy-700">
                Ready to import {csvPreview.length} {csvPreview.length === 1 ? singular.toLowerCase() : plural.toLowerCase()}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">Duplicates will be skipped automatically.</p>
            </div>
            <button onClick={() => setCsvPreview([])} className="p-1.5 text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <ul className="max-h-48 overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-lg text-sm">
            {csvPreview.map((name, i) => (
              <li key={i} className="px-3 py-1.5 text-gray-700">{name}</li>
            ))}
          </ul>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setCsvPreview([])}
              className="text-sm px-3 py-1.5 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={importFromCsv}
              disabled={csvImporting}
              className="text-sm font-medium px-3 py-1.5 bg-teal-500 text-white rounded-lg hover:bg-teal-600 disabled:opacity-40"
            >
              {csvImporting ? 'Importing…' : `Import ${csvPreview.length} ${csvPreview.length === 1 ? singular.toLowerCase() : plural.toLowerCase()}`}
            </button>
          </div>
        </div>
      )}

      {adding && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Name</label>
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addTag(); if (e.key === 'Escape') setAdding(false) }}
              placeholder={`e.g. ${singular === 'Company' ? 'Get Living' : 'Pricelabs'}`}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Description <span className="font-normal text-gray-400">(optional)</span></label>
            <input
              value={newDescription}
              onChange={e => setNewDescription(e.target.value)}
              placeholder="Short context shown in dropdowns"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setAdding(false); setNewName(''); setNewDescription(''); setError(null) }}
              className="text-sm px-3 py-1.5 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={addTag}
              disabled={busy || !newName.trim()}
              className="text-sm font-medium px-3 py-1.5 bg-navy-700 text-white rounded-lg hover:bg-navy-800 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? 'Adding…' : `Add ${singular.toLowerCase()}`}
            </button>
          </div>
        </div>
      )}

      {/* Active */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
          Active ({active.length})
        </h2>
        {active.length === 0 ? (
          <p className="text-sm text-gray-400 italic px-1">No active {plural.toLowerCase()} yet.</p>
        ) : (
          <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100 overflow-hidden">
            {active.map(tag => (
              <TagRow
                key={tag.id}
                tag={tag}
                isEditing={editingId === tag.id}
                editName={editName}
                editDescription={editDescription}
                onEditNameChange={setEditName}
                onEditDescriptionChange={setEditDescription}
                onStartEdit={() => startEdit(tag)}
                onCancelEdit={() => setEditingId(null)}
                onSaveEdit={() => saveEdit(tag.id)}
                onToggleActive={() => toggleActive(tag)}
                onHardDelete={() => hardDelete(tag)}
                busy={busy}
              />
            ))}
          </div>
        )}
      </div>

      {/* Inactive */}
      {inactive.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
            Inactive ({inactive.length})
          </h2>
          <div className="bg-gray-50 border border-gray-200 rounded-2xl divide-y divide-gray-100 overflow-hidden">
            {inactive.map(tag => (
              <TagRow
                key={tag.id}
                tag={tag}
                isEditing={editingId === tag.id}
                editName={editName}
                editDescription={editDescription}
                onEditNameChange={setEditName}
                onEditDescriptionChange={setEditDescription}
                onStartEdit={() => startEdit(tag)}
                onCancelEdit={() => setEditingId(null)}
                onSaveEdit={() => saveEdit(tag.id)}
                onToggleActive={() => toggleActive(tag)}
                onHardDelete={() => hardDelete(tag)}
                busy={busy}
                dimmed
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function TagRow({
  tag,
  isEditing,
  editName,
  editDescription,
  onEditNameChange,
  onEditDescriptionChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onToggleActive,
  onHardDelete,
  busy,
  dimmed,
}: {
  tag: Tag
  isEditing: boolean
  editName: string
  editDescription: string
  onEditNameChange: (v: string) => void
  onEditDescriptionChange: (v: string) => void
  onStartEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: () => void
  onToggleActive: () => void
  onHardDelete: () => void
  busy: boolean
  dimmed?: boolean
}) {
  if (isEditing) {
    return (
      <div className="px-4 py-3 bg-teal-50/30 space-y-2">
        <input
          autoFocus
          value={editName}
          onChange={e => onEditNameChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onSaveEdit(); if (e.key === 'Escape') onCancelEdit() }}
          className="w-full text-sm font-medium border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
        <input
          value={editDescription}
          onChange={e => onEditDescriptionChange(e.target.value)}
          placeholder="Description (optional)"
          className="w-full text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
        <div className="flex justify-end gap-1">
          <button
            onClick={onCancelEdit}
            className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-md"
            title="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
          <button
            onClick={onSaveEdit}
            disabled={busy || !editName.trim()}
            className="p-1.5 text-teal-600 hover:bg-teal-50 rounded-md disabled:opacity-40"
            title="Save"
          >
            <Check className="w-4 h-4" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`px-4 py-3 flex items-center gap-3 ${dimmed ? 'opacity-60' : ''}`}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-navy-700">{tag.name}</p>
        {tag.description && (
          <p className="text-xs text-gray-500 mt-0.5 truncate">{tag.description}</p>
        )}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={onStartEdit}
          className="p-1.5 text-gray-500 hover:text-navy-700 hover:bg-gray-100 rounded-md"
          title="Edit"
        >
          <Edit2 className="w-4 h-4" />
        </button>
        <button
          onClick={onToggleActive}
          disabled={busy}
          className="p-1.5 text-gray-500 hover:text-navy-700 hover:bg-gray-100 rounded-md disabled:opacity-40"
          title={tag.is_active ? 'Deactivate (keeps SOP history)' : 'Reactivate'}
        >
          {tag.is_active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
        <button
          onClick={onHardDelete}
          disabled={busy}
          className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-md disabled:opacity-40"
          title="Permanently delete"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
