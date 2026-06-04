'use client'

import { useState } from 'react'
import { Table2, FileText } from 'lucide-react'
import { CsvImport } from './CsvImport'
import { DocImport } from './DocImport'
import { Team, Category } from '@/types'

interface Props {
  teams: Team[]
  categories: (Category & { teams?: { name: string } | null })[]
  authorId: string
}

export function ImportTabs({ teams, categories, authorId }: Props) {
  const [tab, setTab] = useState<'csv' | 'doc'>('csv')

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy-700">Import SOPs</h1>
        <p className="text-gray-500 text-sm mt-0.5">Bulk import via CSV or upload a Word document</p>
      </div>

      {/* Tab switcher */}
      <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1">
        <button
          onClick={() => setTab('csv')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'csv' ? 'bg-navy-700 text-white' : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Table2 className="w-4 h-4" />
          CSV Bulk Import
        </button>
        <button
          onClick={() => setTab('doc')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'doc' ? 'bg-navy-700 text-white' : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <FileText className="w-4 h-4" />
          Word Document (.docx)
        </button>
      </div>

      {tab === 'csv' && <CsvImport teams={teams} categories={categories} authorId={authorId} />}
      {tab === 'doc' && <DocImport teams={teams} categories={categories} authorId={authorId} />}
    </div>
  )
}
