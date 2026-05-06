import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { TiptapContent } from '@/types'
export { markdownToTiptap } from './markdownToTiptap'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function plainTextToTiptap(text: string): TiptapContent {
  const paragraphs = text.split('\n').filter(Boolean).map(line => ({
    type: 'paragraph',
    content: [{ type: 'text', text: line }],
  }))
  return {
    type: 'doc',
    content: paragraphs.length > 0 ? paragraphs : [{ type: 'paragraph', content: [] }],
  }
}

export function tiptapToPlainText(content: TiptapContent | null): string {
  if (!content) return ''
  function extractText(node: { type: string; text?: string; content?: typeof node[] }): string {
    if (node.text) return node.text
    if (node.content) return node.content.map(extractText).join('')
    return ''
  }
  return content.content?.map(extractText).join('\n') ?? ''
}

export const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  changes_requested: 'Changes Requested',
  live: 'Live',
  archived: 'Archived',
}

export const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Admin',
  approver: 'Approver',
  team_leader: 'Team Leader',
  junior_team_leader: 'Junior Team Leader',
  agent: 'Agent',
}

/** Extract a snippet of text around the first match of `query` */
export function getSnippet(content: TiptapContent | null, query: string, length = 160): string {
  const text = tiptapToPlainText(content)
  if (!text) return ''
  if (!query) return text.slice(0, length) + (text.length > length ? '…' : '')
  const lowerText = text.toLowerCase()
  const idx = lowerText.indexOf(query.toLowerCase())
  if (idx === -1) return text.slice(0, length) + (text.length > length ? '…' : '')
  const start = Math.max(0, idx - 60)
  const end = Math.min(text.length, idx + query.length + 100)
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '')
}
