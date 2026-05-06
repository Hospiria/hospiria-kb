'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Zap, Loader2 } from 'lucide-react'

interface Props {
  missingCount?: number
  sopId?: string
  sopTitle?: string
  single?: boolean
}

export function QuizGenerateAllButton({ missingCount = 0, sopId, sopTitle, single }: Props) {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  async function handleGenerate() {
    setLoading(true)
    setError('')
    try {
      const body = sopId ? { sopId } : { generateAll: true }
      const res = await fetch('/api/admin/quizzes/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Generation failed'); return }
      setDone(true)
      router.refresh()
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  if (single) {
    return (
      <button
        onClick={handleGenerate}
        disabled={loading || done}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 text-navy-700 transition-colors disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3 text-amber-500" />}
        {done ? 'Generated!' : loading ? 'Generating…' : 'Generate Quiz'}
      </button>
    )
  }

  if (missingCount === 0) return null

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleGenerate}
        disabled={loading || done}
        className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
        {done ? 'All Generated!' : loading ? 'Generating…' : `Generate ${missingCount} Missing Quiz${missingCount !== 1 ? 'zes' : ''}`}
      </button>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
