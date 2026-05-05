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
  super_admin: 'Super Admin',
  approver: 'Approver',
  author: 'Author',
  agent: 'Agent',
}
