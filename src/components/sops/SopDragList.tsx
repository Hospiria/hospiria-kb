'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatDate, getSnippet } from '@/lib/utils'
import { GripVertical } from 'lucide-react'
import { Sop } from '@/types'

// Strip leading numeric prefix from SOP titles for display
// "2.1.1 Handling Guest Enquiries" → "Handling Guest Enquiries"
function cleanTitle(title: string): string {
  return title.replace(/^\d+(?:\.\d+)*\.?\s+/, '').trim() || title
}

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

  function handleDragStart(e: React.DragEvent, sopId: string, fromCategoryId: string | null) {
    // Required for drag to work in all browsers
    e.dataTransfer.setData('text/plain', sopId)
    e.dataTransfer.effectAllowed = 'move'
    dragSopId.current = sopId
    dragFromCatId.current = fromCategoryId
    // Small delay so the element renders as dragging after the ghost image is captured
    setTimeout(() => setDraggingId(sopId), 0)
  }

  function handleDragEnd() {
    setDraggingId(null)
    setDropTargetCatId(null)
    dragSopId.current = null
    dragFromCatId.current = null
  }

  function handleDragOver(e: React.DragEvent, categoryId: string | null) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (categoryId !== dragFromCatId.current) {
      setDropTargetCatId(categoryId)
    } else {
      setDropTargetCatId(null)
    }
  }

  function handleDragLeave(e: React.DragEvent) {
    // Only clear if leaving the category container entirely (not a child element)
    const related = e.relatedTarget as Node | null
    if (!e.currentTarget.contains(related)) {
      setDropTargetCatId(null)
    }
  }

  async function handleDrop(e: React.DragEvent, toCategoryId: string | null, toCategoryName: string) {
    e.preventDefault()
    setDropTargetCatId(null)

    const sopId = dragSopId.current ?? e.dataTransfer.getData('text/plain')
    const fromCatId = dragFromCatId.current

    if (!sopId || toCategoryId === fromCatId) return

    // Optimistic update
    setGrouped(prev => {
      const next = prev.map(g => ({ ...g, sops: [...g.sops] }))

      let movedSop: (Sop & { profiles?: { full_name: string | null } }) | undefined
      for (const g of next) {
        const idx = g.sops.findIndex(s => s.id === sopId)
        if (idx !== -1) {
          movedSop = g.sops.splice(idx, 1)[0]
          break
        }
      }
      if (!movedSop) return prev

      const target = next.find(g => g.categoryId === toCategoryId)
      if (target) {
        target.sops.push(movedSop)
      } else {
        next.push({ category: toCategoryName, categoryId: toCategoryId, sops: [movedSop] })
      }

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
          className={`rounded-xl transition-all duration-150 ${
            dropTargetCatId === categoryId
              ? 'ring-2 ring-teal-400 ring-offset-2 bg-teal-50/40'
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
                onDragStart={e => handleDragStart(e, sop.id, categoryId)}
                onDragEnd={handleDragEnd}
              />
            ))}
            {dropTargetCatId === categoryId && draggingId && (
              <div className="h-12 border-2 border-dashed border-teal-300 rounded-xl flex items-center justify-center text-xs text-teal-500 font-medium">
                Drop here → {category}
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
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
}) {
  const snippet = search ? getSnippet(sop.content, search) : null

  return (
    <div
      className={`flex items-stretch bg-white border border-gray-200 rounded-xl hover:border-teal-300 hover:shadow-sm transition-all group ${
        isDragging ? 'opacity-30 scale-[0.98]' : ''
      }`}
      draggable={canDrag}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      {/* Drag handle — visual cue only */}
      {canDrag && (
        <div
          className="flex items-center px-2.5 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 flex-shrink-0 border-r border-gray-100"
          onMouseDown={e => e.stopPropagation()} // prevent accidental text selection
        >
          <GripVertical className="w-4 h-4" />
        </div>
      )}

      {/* Link — explicitly not draggable so it doesn't compete */}
      <Link
        href={`/sops/${sop.id}`}
        draggable={false}
        className="flex items-start justify-between p-4 flex-1 min-w-0"
        onClick={e => { if (isDragging) e.preventDefault() }}
      >
        <div className="flex-1 min-w-0">
          <p className="font-medium text-navy-700 group-hover:text-teal-600 transition-colors truncate">
            {cleanTitle(sop.title)}
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
