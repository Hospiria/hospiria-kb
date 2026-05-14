'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatDate, getSnippet } from '@/lib/utils'
import { GripVertical } from 'lucide-react'
import { Sop } from '@/types'

export interface GroupedCategory {
  category: string
  categoryId: string | null
  sops: (Sop & { profiles?: { full_name: string | null } })[]
}

interface Props {
  grouped: GroupedCategory[]
  search?: string
  canDrag: boolean
}

export function SopDragList({ grouped: initial, search, canDrag }: Props) {
  const [grouped, setGrouped] = useState<GroupedCategory[]>(initial)
  const dragSopId = useRef<string | null>(null)
  const dragFromCatId = useRef<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTargetCatId, setDropTargetCatId] = useState<string | null>(null)

  function handleDragStart(sopId: string, fromCategoryId: string | null) {
    dragSopId.current = sopId
    dragFromCatId.current = fromCategoryId
    setDraggingId(sopId)
  }

  function handleDragEnd() {
    setDraggingId(null)
    setDropTargetCatId(null)
    dragSopId.current = null
    dragFromCatId.current = null
  }

  function handleDragOver(e: React.DragEvent, categoryId: string | null) {
    e.preventDefault()
    if (categoryId !== dragFromCatId.current) {
      setDropTargetCatId(categoryId)
    } else {
      setDropTargetCatId(null)
    }
  }

  function handleDragLeave() {
    setDropTargetCatId(null)
  }

  async function handleDrop(e: React.DragEvent, toCategoryId: string | null, toCategoryName: string) {
    e.preventDefault()
    setDropTargetCatId(null)

    const sopId = dragSopId.current
    const fromCatId = dragFromCatId.current

    if (!sopId || toCategoryId === fromCatId) return

    // Optimistic update
    setGrouped(prev => {
      const next = prev.map(g => ({ ...g, sops: [...g.sops] }))

      // Find the SOP
      let movedSop: (Sop & { profiles?: { full_name: string | null } }) | undefined
      for (const g of next) {
        const idx = g.sops.findIndex(s => s.id === sopId)
        if (idx !== -1) {
          movedSop = g.sops.splice(idx, 1)[0]
          break
        }
      }
      if (!movedSop) return prev

      // Add to target category (or create it)
      const target = next.find(g => g.categoryId === toCategoryId)
      if (target) {
        target.sops.push(movedSop)
      } else {
        next.push({ category: toCategoryName, categoryId: toCategoryId, sops: [movedSop] })
      }

      // Remove empty categories (but keep Uncategorised if it's the only one)
      return next.filter(g => g.sops.length > 0)
    })

    // Persist to DB
    try {
      await fetch(`/api/sops/${sopId}/category`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId: toCategoryId }),
      })
    } catch {
      // silently fail — page refresh will restore correct state
    }
  }

  return (
    <div className="space-y-8">
      {grouped.map(({ category, categoryId, sops }) => (
        <div
          key={categoryId ?? '__uncategorised__'}
          onDragOver={e => handleDragOver(e, categoryId)}
          onDragLeave={handleDragLeave}
          onDrop={e => handleDrop(e, categoryId, category)}
          className={`rounded-xl transition-colors ${
            dropTargetCatId === categoryId
              ? 'ring-2 ring-teal-400 ring-offset-2 bg-teal-50/30'
              : ''
          }`}
        >
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3 px-1">
            {category}
            <span className="ml-2 font-normal normal-case text-gray-300">{sops.length}</span>
          </h2>
          <div className="space-y-2">
            {sops.map(sop => (
              <SopRow
                key={sop.id}
                sop={sop}
                search={search}
                canDrag={canDrag}
                isDragging={draggingId === sop.id}
                onDragStart={() => handleDragStart(sop.id, categoryId)}
                onDragEnd={handleDragEnd}
              />
            ))}
            {/* Drop zone hint when dragging into empty/target category */}
            {dropTargetCatId === categoryId && (
              <div className="h-12 border-2 border-dashed border-teal-300 rounded-xl flex items-center justify-center text-xs text-teal-500">
                Drop here to move to {category}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function SopRow({
  sop,
  search,
  canDrag,
  isDragging,
  onDragStart,
  onDragEnd,
}: {
  sop: Sop & { profiles?: { full_name: string | null } }
  search?: string
  canDrag: boolean
  isDragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
}) {
  const snippet = search ? getSnippet(sop.content, search) : null

  return (
    <div
      className={`flex items-stretch bg-white border border-gray-200 rounded-xl hover:border-teal-300 hover:shadow-sm transition-all group ${
        isDragging ? 'opacity-40 scale-[0.98]' : ''
      }`}
      draggable={canDrag}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      {/* Drag handle */}
      {canDrag && (
        <div className="flex items-center px-2 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-400 flex-shrink-0">
          <GripVertical className="w-4 h-4" />
        </div>
      )}

      {/* Link covers the rest */}
      <Link
        href={`/sops/${sop.id}`}
        className="flex items-start justify-between p-4 flex-1 min-w-0"
      >
        <div className="flex-1 min-w-0">
          <p className="font-medium text-navy-700 group-hover:text-teal-600 transition-colors truncate">
            {sop.title}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {sop.profiles?.full_name ?? 'Unknown'} · Updated {formatDate(sop.updated_at)}
          </p>
          {snippet && (
            <p className="text-xs text-gray-500 mt-1.5 line-clamp-2 leading-relaxed">{snippet}</p>
          )}
        </div>
        <div className="ml-4 flex-shrink-0 mt-0.5">
          <StatusBadge status={sop.status} />
        </div>
      </Link>
    </div>
  )
}
