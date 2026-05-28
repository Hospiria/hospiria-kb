'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Clock, AlertTriangle, Trash2 } from 'lucide-react'

export type PendingEnrollment = {
  id: string
  quiz_id: string
  due_date: string
  status: string
  score: number | null
  enrolled_at: string
  quizzes: { id: string; title: string; pass_mark: number; sops: { id: string; title: string } }
}

function getDueStatus(dueDate: string) {
  const due = new Date(dueDate)
  const now = new Date()
  const daysLeft = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (daysLeft < 0) return { label: `Overdue by ${Math.abs(daysLeft)} days`, color: 'text-red-600' }
  if (daysLeft === 0) return { label: 'Due today', color: 'text-red-500' }
  if (daysLeft <= 2) return { label: `Due in ${daysLeft} day${daysLeft > 1 ? 's' : ''}`, color: 'text-amber-600' }
  return { label: `Due in ${daysLeft} days`, color: 'text-gray-500' }
}

export function MyQuizzesPending({
  pending,
  canManage,
}: {
  pending: PendingEnrollment[]
  canManage: boolean
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isDeleting, setIsDeleting] = useState(false)

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === pending.length) setSelected(new Set())
    else setSelected(new Set(pending.map(e => e.id)))
  }

  async function handleRemove() {
    const count = selected.size
    if (count === 0) return
    if (!confirm(`Remove ${count} quiz enrolment${count > 1 ? 's' : ''} from your list? This cannot be undone.`)) return

    setIsDeleting(true)
    try {
      const res = await fetch('/api/quizzes/enrollments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrollmentIds: Array.from(selected) }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        alert(`Failed to remove: ${body.error ?? res.statusText}`)
        return
      }
      setSelected(new Set())
      router.refresh()
    } finally {
      setIsDeleting(false)
    }
  }

  const allSelected = pending.length > 0 && selected.size === pending.length

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">To Complete</h2>
        {canManage && pending.length > 0 && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleAll}
              className="text-xs text-gray-500 hover:text-navy-700 transition-colors"
            >
              {allSelected ? 'Clear selection' : 'Select all'}
            </button>
            <button
              type="button"
              onClick={handleRemove}
              disabled={selected.size === 0 || isDeleting}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {isDeleting ? 'Removing…' : `Remove${selected.size > 0 ? ` (${selected.size})` : ''}`}
            </button>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {pending.map(e => {
          const dueStatus = getDueStatus(e.due_date)
          const isOverdue = dueStatus.color === 'text-red-600'
          const isSelected = selected.has(e.id)
          return (
            <div
              key={e.id}
              className={`flex items-stretch gap-2 ${isSelected ? 'rounded-xl ring-2 ring-red-200' : ''}`}
            >
              {canManage && (
                <label className="flex items-center px-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(e.id)}
                    aria-label={`Select ${e.quizzes.title} for removal`}
                    className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500 cursor-pointer"
                  />
                </label>
              )}
              <Link
                href={`/quizzes/${e.id}`}
                className={`flex-1 block p-5 bg-white border rounded-xl hover:shadow-sm transition-all group ${isOverdue ? 'border-red-200 hover:border-red-300' : 'border-gray-200 hover:border-teal-300'}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-navy-700 group-hover:text-teal-600 transition-colors">{e.quizzes.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Read the SOP, then take the quiz · Pass mark: {e.quizzes.pass_mark}%</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className={`flex items-center gap-1 text-xs font-medium ${dueStatus.color}`}>
                      {isOverdue ? <AlertTriangle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                      {dueStatus.label}
                    </span>
                    <span className="text-xs px-2.5 py-1 bg-amber-100 text-amber-700 rounded-full font-medium">Pending</span>
                  </div>
                </div>
              </Link>
            </div>
          )
        })}
      </div>
    </div>
  )
}
