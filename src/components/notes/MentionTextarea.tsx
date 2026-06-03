'use client'

/**
 * A textarea that shows an @mention picker when the user types "@".
 * Works in both the floating hub (compact) and the full notes page.
 * The picker is rendered in a Portal so it can never be clipped by any
 * overflow:hidden ancestor (the hub panel, rounded cards, etc.).
 */

import { useRef, useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'

interface Person { id: string; full_name: string | null }

interface Props {
  value: string
  onChange: (value: string) => void
  onMention?: (person: Person, newValue: string) => void
  people: Person[]
  placeholder?: string
  disabled?: boolean
  className?: string
  minRows?: number
}

export function MentionTextarea({
  value, onChange, onMention, people,
  placeholder = 'Start typing… use @ to mention someone',
  disabled = false, className = '', minRows = 4,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [range, setRange] = useState<{ start: number; end: number } | null>(null)
  const [dropPos, setDropPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const results = query
    ? people.filter(p => (p.full_name ?? '').toLowerCase().includes(query.toLowerCase()))
    : people

  // Auto-resize to content
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  function positionDropdown() {
    const el = textareaRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    // Position below the textarea, aligned left
    setDropPos({
      top: rect.bottom + window.scrollY + 4,
      left: rect.left + window.scrollX,
    })
  }

  function onInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    onChange(val)
    const cursor = e.target.selectionStart ?? val.length
    const before = val.slice(0, cursor)
    const atMatch = before.match(/@([\w ]*)$/)
    if (atMatch && atMatch[0].length < 30) {
      setQuery(atMatch[1].trim())
      setRange({ start: cursor - atMatch[0].length, end: cursor })
      positionDropdown()
      setOpen(true)
    } else {
      setOpen(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (open && e.key === 'Escape') { setOpen(false); e.preventDefault() }
  }

  const pickMention = useCallback((person: Person) => {
    if (!range || !textareaRef.current) return
    const name = person.full_name ?? 'User'
    const before = value.slice(0, range.start)
    const after = value.slice(range.end)
    const newVal = `${before}@${name} ${after}`
    onChange(newVal)
    setOpen(false)
    setRange(null)
    onMention?.(person, newVal)
    // Restore focus + cursor
    setTimeout(() => {
      if (!textareaRef.current) return
      const pos = before.length + name.length + 2 // +1 for @, +1 for space
      textareaRef.current.focus()
      textareaRef.current.setSelectionRange(pos, pos)
    }, 0)
  }, [value, range, onChange, onMention])

  const dropdown = open && results.length > 0 && mounted ? createPortal(
    <div
      style={{ position: 'absolute', top: dropPos.top, left: dropPos.left, zIndex: 9999 }}
      className="w-60 bg-white border border-gray-200 rounded-xl shadow-xl py-1.5 max-h-52 overflow-y-auto"
    >
      <p className="text-[10px] text-gray-400 px-3 pt-0.5 pb-1 uppercase tracking-wide font-semibold">Mention</p>
      {results.slice(0, 8).map(p => (
        <button
          key={p.id}
          type="button"
          onMouseDown={e => { e.preventDefault(); pickMention(p) }}
          className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-navy-700 hover:bg-teal-50 transition-colors"
        >
          <span className="w-7 h-7 rounded-full bg-navy-700 text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
            {(p.full_name ?? 'U')[0].toUpperCase()}
          </span>
          <span className="truncate">{p.full_name ?? 'User'}</span>
        </button>
      ))}
    </div>,
    document.body,
  ) : null

  return (
    <>
      <textarea
        ref={textareaRef}
        value={value}
        disabled={disabled}
        onChange={onInput}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        rows={minRows}
        className={`w-full resize-none border-0 outline-none bg-transparent leading-relaxed text-sm text-gray-700 ${className}`}
      />
      {dropdown}
    </>
  )
}
