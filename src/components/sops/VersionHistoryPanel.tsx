'use client'

import { useState } from 'react'
import { SopVersion } from '@/types'
import { formatDateTime } from '@/lib/utils'
import { History, RotateCcw, Eye } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { TiptapViewer } from './TiptapViewer'

interface Props {
  versions: (SopVersion & { profiles?: { full_name: string | null } })[]
  currentVersion: number
  sopId: string
  isSuperAdmin: boolean
}

export function VersionHistoryPanel({ versions, currentVersion, sopId, isSuperAdmin }: Props) {
  const [previewVersion, setPreviewVersion] = useState<SopVersion | null>(null)
  const [restoring, setRestoring] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleRestore(version: SopVersion) {
    if (!confirm(`Restore version ${version.version_number}? This will create a new version snapshot.`)) return
    setRestoring(true)
    try {
      const newVersion = currentVersion + 1
      await supabase.from('sop_versions').insert({
        sop_id: sopId,
        content: version.content,
        version_number: newVersion,
        created_by: (await supabase.auth.getUser()).data.user?.id,
      })
      await supabase.from('sops').update({
        content: version.content,
        current_version: newVersion,
        status: 'live',
      }).eq('id', sopId)
      router.refresh()
    } finally {
      setRestoring(false)
    }
  }

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-4">
          <History className="w-4 h-4 text-gray-400" />
          <h3 className="text-sm font-semibold text-navy-700">Version History</h3>
        </div>
        <div className="space-y-2">
          {versions.map(v => (
            <div key={v.id} className={`p-3 rounded-lg border ${v.version_number === currentVersion ? 'border-teal-300 bg-teal-50' : 'border-gray-100 hover:border-gray-200'}`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-navy-700">v{v.version_number}</span>
                {v.version_number === currentVersion && (
                  <span className="text-xs bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full">Current</span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(v.created_at)}</p>
              <p className="text-xs text-gray-500 truncate">{v.profiles?.full_name ?? 'Unknown'}</p>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => setPreviewVersion(previewVersion?.id === v.id ? null : v)}
                  className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700"
                >
                  <Eye className="w-3 h-3" />
                  {previewVersion?.id === v.id ? 'Hide' : 'Preview'}
                </button>
                {isSuperAdmin && v.version_number !== currentVersion && (
                  <button
                    onClick={() => handleRestore(v)}
                    disabled={restoring}
                    className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 disabled:opacity-50"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Restore
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Version preview modal */}
      {previewVersion && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setPreviewVersion(null)}>
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="font-semibold text-navy-700">Version {previewVersion.version_number} Preview</h2>
              <button onClick={() => setPreviewVersion(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <TiptapViewer content={previewVersion.content} />
          </div>
        </div>
      )}
    </>
  )
}
