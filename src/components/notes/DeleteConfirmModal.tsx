'use client'

import { Trash2, X, AlertTriangle } from 'lucide-react'

export interface DeleteTarget {
  type: 'note' | 'todo'
  id: string
  title: string
  mine: boolean
  ownerName: string | null
  canDelete: boolean  // false = personal item owned by someone else
}

interface Props {
  target: DeleteTarget
  onConfirm: () => void
  onCancel: () => void
}

export function DeleteConfirmModal({ target, onConfirm, onCancel }: Props) {
  const label = target.type === 'note' ? 'note' : 'to-do'
  const shortTitle = (target.title || 'Untitled').slice(0, 60)

  if (!target.canDelete) {
    // Personal item owned by someone else — explain and block
    return (
      <Backdrop onClick={onCancel}>
        <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-sm p-6 space-y-4" onClick={e => e.stopPropagation()}>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="font-semibold text-navy-700">Can&apos;t delete this {label}</p>
              <p className="text-sm text-gray-500 mt-1">
                <strong>{target.ownerName ?? 'Another team member'}</strong> created this {label}.
                Personal items can only be deleted by their owner.
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="w-full py-2 rounded-xl bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200"
          >
            Got it
          </button>
        </div>
      </Backdrop>
    )
  }

  if (!target.mine) {
    // Team item owned by someone else — allow but warn + notify
    return (
      <Backdrop onClick={onCancel}>
        <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-sm p-6 space-y-4" onClick={e => e.stopPropagation()}>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
              <Trash2 className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="font-semibold text-navy-700">Delete team {label}?</p>
              <p className="text-sm text-gray-500 mt-1">
                &ldquo;{shortTitle}&rdquo; was created by{' '}
                <strong>{target.ownerName ?? 'a team member'}</strong>.
                They will be notified you deleted it. You can restore it from Trash if needed.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={onCancel} className="flex-1 py-2 rounded-xl bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200">
              Cancel
            </button>
            <button onClick={onConfirm} className="flex-1 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700">
              Delete &amp; notify
            </button>
          </div>
        </div>
      </Backdrop>
    )
  }

  // Own item — simple confirm
  return (
    <Backdrop onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-sm p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <Trash2 className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <p className="font-semibold text-navy-700">Delete this {label}?</p>
            <p className="text-sm text-gray-500 mt-1">
              &ldquo;{shortTitle}&rdquo; will be moved to Trash. You can restore it later.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-2 rounded-xl bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200">
            Cancel
          </button>
          <button onClick={onConfirm} className="flex-1 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700">
            Move to Trash
          </button>
        </div>
      </div>
    </Backdrop>
  )
}

function Backdrop({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClick}
    >
      {children}
    </div>
  )
}
