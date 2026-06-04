'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Loader2 } from 'lucide-react'

export function DeleteSopButton({ sopId, sopTitle }: { sopId: string; sopTitle: string }) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const router = useRouter()

  async function handleDelete() {
    setDeleting(true)
    const r = await fetch('/api/admin/sops/bulk', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sopIds: [sopId] }),
    })
    if (r.ok) {
      router.push('/sops')
      router.refresh()
    } else {
      const d = await r.json().catch(() => ({}))
      alert(d.error ?? 'Could not delete SOP. Try again.')
      setDeleting(false)
      setConfirming(false)
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
        <span className="text-xs text-red-700 font-medium max-w-[200px] truncate">
          Delete &ldquo;{sopTitle}&rdquo;?
        </span>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="flex items-center gap-1 px-2.5 py-1 bg-red-600 text-white text-xs font-semibold rounded-md hover:bg-red-700 disabled:opacity-50"
        >
          {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
          {deleting ? 'Deleting…' : 'Yes, delete'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-xs text-red-500 hover:text-red-700 px-1"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors"
      title="Delete this SOP permanently"
    >
      <Trash2 className="w-4 h-4" />
      Delete
    </button>
  )
}
