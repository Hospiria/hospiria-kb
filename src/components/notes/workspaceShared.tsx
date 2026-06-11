'use client'

import { Trash2, ChevronDown, RotateCcw, Loader2 } from 'lucide-react'

// ─── Shared types ───────────────────────────────────────────────────────────

export interface Person { id: string; full_name: string | null }
export interface Team   { id: string; name: string }
export interface TodoStatus { id: string; name: string; color: string; is_done: boolean; is_default: boolean }

export interface NoteFolder {
  id: string; owner_id: string; team_id: string | null
  name: string; color: string; icon: string | null; position: number
}

export interface Note {
  id: string; title: string; body: string; content: unknown | null; color: string | null; pinned: boolean
  updated_at: string; team_id: string | null; folder_id: string | null; mine: boolean; canEdit: boolean
  shared: boolean; deleted_at: string | null; deletedByName: string | null; ownerName: string | null
  sop_id: string | null; sopTitle: string | null
  sops?: { id: string; title: string }[]
  companies?: { id: string; name: string }[]
}

export interface Todo {
  id: string; owner_id: string; assignee_id: string | null; team_id: string | null
  title: string; detail: string | null; due_date: string | null
  priority: 'low' | 'medium' | 'high'; status: string; is_done: boolean
  recurrence: 'none' | 'daily' | 'weekly'; recurrence_parent_id: string | null; is_carry: boolean
  recurrence_day_of_week: number | null; recurrence_weekdays_only: boolean
  deleted_at: string | null; deleted_by: string | null; deletedByName: string | null
  mine: boolean; assignedToMe: boolean; ownerName: string | null
  assigneeName: string | null; teamName: string | null
  assignees?: { id: string; full_name: string | null }[]
  sops?: { id: string; title: string }[]
  companies?: { id: string; name: string }[]
  list_id: string | null; position: number
  commentCount?: number
}

export interface TodoList {
  id: string; owner_id: string; team_id: string | null
  name: string; color: string; icon: string | null; position: number
}

export type Space = 'personal' | string

export const PRIORITY_COLOR: Record<string, string> = {
  high: 'text-red-500', medium: 'text-amber-500', low: 'text-gray-300',
}

// ─── Shared UI atoms ──────────────────────────────────────────────────────────

export function SpaceBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors ${active ? 'bg-navy-700 text-white border-navy-700' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}>
      {children}
    </button>
  )
}

export function SectionHeader({ emoji, label, note }: { emoji?: string; label: string; note?: string }) {
  return (
    <div className="flex items-center gap-3">
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
        {emoji && <span>{emoji}</span>}{label}
      </p>
      <div className="flex-1 h-px bg-gray-100" />
      {note && <span className="text-[11px] text-gray-400">{note}</span>}
    </div>
  )
}

export function SpinnerRow() {
  return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>
}

export function Empty({ label }: { label: string }) {
  return <p className="text-center text-sm text-gray-400 py-16 bg-white border border-dashed border-gray-200 rounded-2xl">{label}</p>
}

// ─── Trash (works for notes OR todos) ─────────────────────────────────────────

export function TrashSection({ show, onToggle, trashNotes = [], trashTodos = [], onRestoreNote, onRestoreTodo, onEmpty }: {
  show: boolean; onToggle: () => void
  trashNotes?: Note[]; trashTodos?: Todo[]
  onRestoreNote?: (id: string) => void; onRestoreTodo?: (id: string) => void
  onEmpty?: () => void
}) {
  const total = trashNotes.length + trashTodos.length
  if (total === 0) return null
  return (
    <div className="mt-4">
      <div className="flex items-center gap-3 mb-2">
        <button onClick={onToggle} className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600 font-medium">
          <Trash2 className="w-3.5 h-3.5" /> Trash ({total}) <ChevronDown className={`w-3.5 h-3.5 transition-transform ${show ? 'rotate-180' : ''}`} />
        </button>
        {show && onEmpty && (
          <button onClick={onEmpty} className="text-xs text-red-500 hover:text-red-700 font-medium">
            Empty trash
          </button>
        )}
      </div>
      {show && (
        <div className="bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-4 space-y-2">
          {[...trashNotes.map(n => ({ id: n.id, label: n.title || 'Untitled', by: n.deletedByName, at: n.deleted_at, type: 'note' as const })),
            ...trashTodos.map(t => ({ id: t.id, label: t.title, by: t.deletedByName, at: t.deleted_at, type: 'todo' as const }))].map(item => (
            <div key={item.id} className="flex items-center justify-between gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm text-gray-500 line-through truncate">{item.label}</p>
                {item.by && <p className="text-xs text-gray-400">Deleted by {item.by}{item.at ? ` · ${new Date(item.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}</p>}
              </div>
              <button onClick={() => item.type === 'note' ? onRestoreNote?.(item.id) : onRestoreTodo?.(item.id)} className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 flex-shrink-0">
                <RotateCcw className="w-3.5 h-3.5" /> Restore
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Shared workspace hook: space switcher + accessible teams ─────────────────

export function useSpaceQuery(space: Space) {
  return space === 'personal' ? '?space=personal' : `?teamId=${space}`
}
