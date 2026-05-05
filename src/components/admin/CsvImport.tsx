'use client'

import { useState, useRef } from 'react'
import Papa from 'papaparse'
import { createClient } from '@/lib/supabase/client'
import { Team, Category } from '@/types'
import { markdownToTiptap, tiptapToPlainTextPreview } from '@/lib/markdownToTiptap'
import { Upload, CheckCircle, XCircle, AlertCircle, FileUp, Download, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface CsvRow {
  title?: string
  team?: string
  category?: string
  content?: string
  status?: string
  tags?: string
}

interface ParsedRow extends CsvRow {
  _index: number
  _valid: boolean
  _errors: string[]
  _teamId?: string
  _categoryId?: string
  _tagTeamIds?: string[]
  _preview?: string
}

const CSV_TEMPLATE = `# Hospiria Knowledge Base — SOP Import Template
# Markdown is supported in the content field:
#   # Heading 1  |  ## Heading 2  |  ### Heading 3
#   **bold**  |  *italic*  |  - bullet  |  1. numbered  |  > callout
#
title,team,category,content,status,tags
Check-in Guide,Onboarding,Policies,"# Check-in Process\n\n## Before Arrival\n\n- Confirm booking details\n- Send welcome message\n\n## On Arrival\n\n1. Greet the guest\n2. Walk through the property\n3. Hand over keys\n\n> **Important:** Always verify ID before handing over keys.",live,Guest Services
PriceLabs Setup,Onboarding,PriceLabs,"## Overview\n\nPriceLabs is used for **dynamic pricing** across all listings.\n\n## Steps\n\n1. Log in to PriceLabs\n2. Select the property\n3. Review the base price\n4. Apply seasonal adjustments\n\n### Common Issues\n\n- Sync delay: wait 15 minutes then refresh\n- Price not updating: check channel connection status",draft,`

export function CsvImport({
  teams,
  categories,
  authorId,
}: {
  teams: Team[]
  categories: (Category & { teams?: { name: string } | null })[]
  authorId: string
}) {
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [importing, setImporting] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [summary, setSummary] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()

  function findTeam(name: string) {
    return teams.find(t => t.name.toLowerCase() === name?.toLowerCase().trim())
  }

  function findCategory(name: string, teamId: string) {
    return categories.find(c =>
      c.name.toLowerCase() === name?.toLowerCase().trim() && c.team_id === teamId
    )
  }

  function validateRow(row: CsvRow, index: number): ParsedRow {
    const errors: string[] = []
    const parsed: ParsedRow = { ...row, _index: index, _valid: false, _errors: [] }

    if (!row.title?.trim()) errors.push('Title required')
    if (!row.content?.trim()) errors.push('Content required')

    const team = row.team ? findTeam(row.team) : null
    if (row.team && !team) errors.push(`Team "${row.team}" not found`)
    parsed._teamId = team?.id

    if (row.category && team) {
      const cat = findCategory(row.category, team.id)
      if (!cat) errors.push(`Category "${row.category}" not found`)
      parsed._categoryId = cat?.id
    }

    const status = row.status?.toLowerCase().trim()
    if (status && !['live', 'draft'].includes(status)) errors.push('Status must be "live" or "draft"')

    if (row.tags) {
      const tagTeamIds: string[] = []
      for (const tagName of row.tags.split(',').map(t => t.trim()).filter(Boolean)) {
        const t = findTeam(tagName)
        if (t) tagTeamIds.push(t.id)
      }
      parsed._tagTeamIds = tagTeamIds
    }

    // Generate preview from content
    if (row.content) {
      const tiptap = markdownToTiptap(row.content)
      parsed._preview = tiptapToPlainTextPreview(tiptap, 80)
    }

    parsed._errors = errors
    parsed._valid = errors.length === 0
    return parsed
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setSummary(null)
    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      comments: '#',
      complete: ({ data }) => {
        setRows(data.map((row, i) => validateRow(row, i)))
      },
    })
  }

  function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'hospiria_sop_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleClearAll() {
    if (!confirm('Are you sure? This will permanently delete ALL SOPs and cannot be undone.')) return
    if (!confirm('Second confirmation: Delete every SOP in the database?')) return
    setClearing(true)
    try {
      await supabase.from('sop_teams').delete().neq('sop_id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('sop_versions').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('approvals').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('sops').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      setSummary(null)
      setRows([])
      router.refresh()
      alert('All SOPs deleted.')
    } finally {
      setClearing(false)
    }
  }

  async function handleImport() {
    const valid = rows.filter(r => r._valid)
    if (valid.length === 0) return
    setImporting(true)
    const errors: string[] = []
    let imported = 0

    for (const row of valid) {
      try {
        const content = markdownToTiptap(row.content ?? '')
        const { data: sop } = await supabase
          .from('sops')
          .insert({
            title: row.title!.trim(),
            content,
            category_id: row._categoryId ?? null,
            status: (row.status?.toLowerCase().trim() as 'live' | 'draft') ?? 'draft',
            author_id: authorId,
          })
          .select('id')
          .single()

        if (sop?.id) {
          const teamIds = Array.from(new Set(
            [row._teamId, ...(row._tagTeamIds ?? [])].filter((id): id is string => Boolean(id))
          ))
          if (teamIds.length > 0) {
            await supabase.from('sop_teams').insert(teamIds.map(team_id => ({ sop_id: sop.id, team_id })))
          }
          imported++
        }
      } catch {
        errors.push(`Row ${row._index + 1}: "${row.title}" — failed`)
      }
    }

    setSummary({ imported, skipped: rows.filter(r => !r._valid).length, errors })
    setImporting(false)
    setRows([])
    if (fileRef.current) fileRef.current.value = ''
    router.refresh()
  }

  const validCount = rows.filter(r => r._valid).length
  const invalidCount = rows.filter(r => !r._valid).length

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy-700">Import SOPs</h1>
          <p className="text-gray-500 text-sm mt-0.5">Bulk import SOPs from a CSV file with markdown formatting</p>
        </div>
        <button
          onClick={handleClearAll}
          disabled={clearing}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          <Trash2 className="w-4 h-4" />
          {clearing ? 'Deleting…' : 'Clear All SOPs'}
        </button>
      </div>

      {/* Format guide + template download */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-navy-700">CSV Format</h2>
          <button
            onClick={downloadTemplate}
            className="flex items-center gap-2 px-3 py-1.5 border border-teal-500 text-teal-600 text-sm font-medium rounded-lg hover:bg-teal-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            Download Template
          </button>
        </div>

        {/* Sample row */}
        <div className="overflow-x-auto mb-4">
          <table className="text-sm w-full">
            <thead>
              <tr className="bg-gray-50">
                {['title', 'team', 'category', 'content (markdown)', 'status', 'tags'].map(col => (
                  <th key={col} className="text-left px-3 py-2 text-xs font-semibold text-gray-500 border border-gray-200">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-3 py-2 border border-gray-100 text-gray-600">Check-in Guide</td>
                <td className="px-3 py-2 border border-gray-100 text-gray-600">Onboarding</td>
                <td className="px-3 py-2 border border-gray-100 text-gray-600">Policies</td>
                <td className="px-3 py-2 border border-gray-100 text-gray-600 font-mono text-xs"># Title\n\n- bullet\n\n1. step</td>
                <td className="px-3 py-2 border border-gray-100 text-gray-600">live</td>
                <td className="px-3 py-2 border border-gray-100 text-gray-600">Guest Services</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Markdown reference */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs text-gray-500">
          {[
            ['# Heading 1', 'Large heading'],
            ['## Heading 2', 'Medium heading'],
            ['### Heading 3', 'Small heading'],
            ['**bold text**', 'Bold'],
            ['*italic text*', 'Italic'],
            ['- item or * item', 'Bullet list'],
            ['1. item', 'Numbered list'],
            ['> text', 'Callout / blockquote'],
            ['---', 'Horizontal divider'],
          ].map(([syntax, desc]) => (
            <div key={syntax} className="flex gap-2">
              <code className="text-teal-600 font-mono">{syntax}</code>
              <span className="text-gray-400">→ {desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Upload */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <label className="flex flex-col items-center gap-3 border-2 border-dashed border-gray-200 rounded-xl p-8 cursor-pointer hover:border-teal-400 hover:bg-teal-50 transition-all">
          <FileUp className="w-8 h-8 text-gray-400" />
          <div className="text-center">
            <p className="text-sm font-medium text-gray-700">Click to upload CSV</p>
            <p className="text-xs text-gray-400 mt-0.5">Markdown in content field will be converted automatically</p>
          </div>
          <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="hidden" />
        </label>
      </div>

      {/* Summary */}
      {summary && (
        <div className={`p-4 rounded-xl border ${summary.imported > 0 ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <p className="font-semibold text-green-800">Import complete</p>
          </div>
          <p className="text-sm text-green-700">{summary.imported} SOP{summary.imported !== 1 ? 's' : ''} imported with markdown formatting</p>
          {summary.skipped > 0 && <p className="text-sm text-gray-600">{summary.skipped} row{summary.skipped !== 1 ? 's' : ''} skipped</p>}
          {summary.errors.map((e, i) => <p key={i} className="text-sm text-red-600">{e}</p>)}
        </div>
      )}

      {/* Preview table */}
      {rows.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-navy-700">{rows.length} rows found</h2>
              <div className="flex gap-3 mt-1">
                <span className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> {validCount} valid
                </span>
                {invalidCount > 0 && (
                  <span className="text-xs text-red-600 flex items-center gap-1">
                    <XCircle className="w-3 h-3" /> {invalidCount} invalid
                  </span>
                )}
              </div>
            </div>
            {validCount > 0 && (
              <button
                onClick={handleImport}
                disabled={importing}
                className="flex items-center gap-2 px-4 py-2 bg-navy-700 text-white text-sm font-medium rounded-lg hover:bg-navy-800 transition-colors disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                {importing ? 'Importing…' : `Import ${validCount} SOP${validCount !== 1 ? 's' : ''}`}
              </button>
            )}
          </div>
          <div className="divide-y divide-gray-50">
            {rows.map(row => (
              <div key={row._index} className={`px-5 py-3.5 flex items-start gap-4 ${row._valid ? 'bg-green-50/40' : 'bg-red-50/40'}`}>
                {/* Status badge */}
                <div className="flex-shrink-0 mt-0.5">
                  {row._valid
                    ? <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-100 border border-green-200 px-2 py-0.5 rounded-full"><CheckCircle className="w-3 h-3" /> Valid</span>
                    : <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-100 border border-red-200 px-2 py-0.5 rounded-full"><XCircle className="w-3 h-3" /> Error</span>
                  }
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <p className="text-sm font-medium text-navy-700 truncate">{row.title ?? '—'}</p>
                    {row.team && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{row.team}</span>}
                    {row.category && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{row.category}</span>}
                    {row.status && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${row.status === 'live' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                        {row.status}
                      </span>
                    )}
                  </div>
                  {row._preview && (
                    <p className="text-xs text-gray-400 mt-1 truncate">{row._preview}</p>
                  )}
                  {!row._valid && row._errors.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-2">
                      {row._errors.map((e, i) => (
                        <span key={i} className="text-xs text-red-600 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> {e}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
