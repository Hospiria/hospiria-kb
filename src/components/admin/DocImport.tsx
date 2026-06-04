'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Team, Category } from '@/types'
import { markdownToTiptap } from '@/lib/markdownToTiptap'
import { FileText, Upload, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface DocImportProps {
  teams: Team[]
  categories: (Category & { teams?: { name: string } | null })[]
  authorId: string
}

interface ParsedDoc {
  fileName: string
  title: string
  markdown: string
  teamId: string
  categoryId: string
}

export function DocImport({ teams, categories, authorId }: DocImportProps) {
  const [parsed, setParsed] = useState<ParsedDoc | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const [done, setDone] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()

  const filteredCategories = parsed?.teamId
    ? categories.filter(c => c.team_id === parsed.teamId)
    : categories

  async function handleFile(file: File) {
    if (!file) return
    setError('')
    setDone(false)
    setParsed(null)

    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext !== 'docx') {
      setError('Only .docx files are supported. Please save your document as a Word file (.docx).')
      return
    }

    setLoading(true)
    try {
      // Use mammoth browser build via dynamic import
      // @ts-expect-error mammoth browser build has no types
      const mammoth = await import('mammoth/mammoth.browser')
      const arrayBuffer = await file.arrayBuffer()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (mammoth as any).convertToMarkdown({ arrayBuffer })

      const title = file.name.replace(/\.docx$/i, '').replace(/[-_]/g, ' ')
      setParsed({
        fileName: file.name,
        title,
        markdown: result.value,
        teamId: teams[0]?.id ?? '',
        categoryId: '',
      })
    } catch (e) {
      setError('Could not read the file. Make sure it is a valid .docx Word document.')
    } finally {
      setLoading(false)
    }
  }

  async function handleImport() {
    if (!parsed) return
    setImporting(true)
    try {
      const content = markdownToTiptap(parsed.markdown)
      const { data: sop, error: sopErr } = await supabase
        .from('sops')
        .insert({
          title: parsed.title,
          content,
          status: 'draft',
          author_id: authorId,
          category_id: parsed.categoryId || null,
        })
        .select('id')
        .single()

      if (sopErr || !sop) throw new Error(sopErr?.message ?? 'Failed to create SOP')

      if (parsed.teamId) {
        await supabase.from('sop_teams').insert({ sop_id: sop.id, team_id: parsed.teamId })
      }

      setDone(true)
      setParsed(null)
      router.refresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <h2 className="font-semibold text-navy-700 mb-1 flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Import Word Document
        </h2>
        <p className="text-sm text-gray-400 mb-5">Upload a <strong>.docx</strong> file — it will be converted to a draft SOP automatically.</p>

        {/* Drop zone */}
        {!parsed && (
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
            className="border-2 border-dashed border-gray-200 rounded-xl p-12 text-center cursor-pointer hover:border-teal-400 hover:bg-teal-50/30 transition-all"
          >
            {loading ? (
              <div className="flex flex-col items-center gap-2 text-teal-600">
                <Loader2 className="w-8 h-8 animate-spin" />
                <p className="text-sm font-medium">Reading document…</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-gray-400">
                <Upload className="w-8 h-8" />
                <p className="text-sm font-medium text-gray-600">Click to upload or drag & drop</p>
                <p className="text-xs">.docx files only</p>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
            />
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {done && (
          <div className="mt-4 flex items-center gap-2 p-3 bg-teal-50 border border-teal-200 rounded-xl text-sm text-teal-700 font-medium">
            <CheckCircle className="w-4 h-4" />
            SOP imported as a draft! You can find and edit it in the SOP library.
          </div>
        )}

        {/* Parsed preview + assign */}
        {parsed && (
          <div className="mt-4 space-y-4">
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl flex items-center gap-3">
              <FileText className="w-5 h-5 text-teal-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-navy-700 truncate">{parsed.fileName}</p>
                <p className="text-xs text-gray-400">{parsed.markdown.length} characters of content extracted</p>
              </div>
              <button onClick={() => setParsed(null)} className="text-xs text-gray-400 hover:text-gray-600 underline">Remove</button>
            </div>

            {/* SOP title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">SOP Title</label>
              <input
                type="text"
                value={parsed.title}
                onChange={e => setParsed(p => p ? { ...p, title: e.target.value } : p)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            {/* Team + Category */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Team</label>
                <select
                  value={parsed.teamId}
                  onChange={e => setParsed(p => p ? { ...p, teamId: e.target.value, categoryId: '' } : p)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="">No team</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={parsed.categoryId}
                  onChange={e => setParsed(p => p ? { ...p, categoryId: e.target.value } : p)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="">No category</option>
                  {filteredCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>

            {/* Content preview */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Content preview</label>
              <pre className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-600 max-h-48 overflow-y-auto whitespace-pre-wrap font-mono leading-relaxed">
                {parsed.markdown.slice(0, 1000)}{parsed.markdown.length > 1000 ? '\n…' : ''}
              </pre>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleImport}
                disabled={importing}
                className="flex items-center gap-2 px-5 py-2.5 bg-navy-700 hover:bg-navy-800 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors"
              >
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {importing ? 'Importing…' : 'Import as Draft SOP'}
              </button>
              <button
                onClick={() => setParsed(null)}
                className="px-4 py-2.5 text-sm text-gray-500 hover:bg-gray-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
