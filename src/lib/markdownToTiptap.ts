import { TiptapContent, TiptapNode } from '@/types'

function parseInline(text: string): TiptapNode[] {
  if (!text) return [{ type: 'text', text: '' }]
  const nodes: TiptapNode[] = []
  // Match **bold**, *italic*, `code`, or plain text
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|([^*`]+)/g
  let match
  while ((match = regex.exec(text)) !== null) {
    if (match[1] !== undefined) {
      nodes.push({ type: 'text', text: match[1], marks: [{ type: 'bold' }] })
    } else if (match[2] !== undefined) {
      nodes.push({ type: 'text', text: match[2], marks: [{ type: 'italic' }] })
    } else if (match[3] !== undefined) {
      nodes.push({ type: 'text', text: match[3], marks: [{ type: 'code' }] })
    } else if (match[4] !== undefined) {
      nodes.push({ type: 'text', text: match[4] })
    }
  }
  return nodes.length > 0 ? nodes : [{ type: 'text', text: text }]
}

function makeListItem(text: string): TiptapNode {
  return {
    type: 'listItem',
    content: [{ type: 'paragraph', content: parseInline(text) }],
  }
}

export function markdownToTiptap(markdown: string): TiptapContent {
  if (!markdown?.trim()) {
    return { type: 'doc', content: [{ type: 'paragraph', content: [] }] }
  }

  const lines = markdown.split('\n')
  const nodes: TiptapNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Skip blank lines
    if (line.trim() === '') {
      i++
      continue
    }

    // Headings — check ### before ## before #
    const h3 = line.match(/^###\s+(.+)/)
    const h2 = line.match(/^##\s+(.+)/)
    const h1 = line.match(/^#\s+(.+)/)

    if (h3) {
      nodes.push({ type: 'heading', attrs: { level: 3 }, content: parseInline(h3[1]) })
      i++
      continue
    }
    if (h2) {
      nodes.push({ type: 'heading', attrs: { level: 2 }, content: parseInline(h2[1]) })
      i++
      continue
    }
    if (h1) {
      nodes.push({ type: 'heading', attrs: { level: 1 }, content: parseInline(h1[1]) })
      i++
      continue
    }

    // Blockquote
    if (line.startsWith('> ')) {
      nodes.push({
        type: 'blockquote',
        content: [{ type: 'paragraph', content: parseInline(line.slice(2)) }],
      })
      i++
      continue
    }

    // Bullet list — collect consecutive bullet lines
    if (line.match(/^[-*]\s+/)) {
      const items: TiptapNode[] = []
      while (i < lines.length && lines[i].match(/^[-*]\s+/)) {
        items.push(makeListItem(lines[i].replace(/^[-*]\s+/, '')))
        i++
      }
      nodes.push({ type: 'bulletList', content: items })
      continue
    }

    // Ordered list — collect consecutive numbered lines
    if (line.match(/^\d+\.\s+/)) {
      const items: TiptapNode[] = []
      while (i < lines.length && lines[i].match(/^\d+\.\s+/)) {
        items.push(makeListItem(lines[i].replace(/^\d+\.\s+/, '')))
        i++
      }
      nodes.push({ type: 'orderedList', content: items })
      continue
    }

    // Horizontal rule
    if (line.match(/^---+$/)) {
      nodes.push({ type: 'horizontalRule' })
      i++
      continue
    }

    // Standalone image: ![alt](url)
    const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/)
    if (imgMatch) {
      nodes.push({ type: 'image', attrs: { src: imgMatch[2], alt: imgMatch[1] || null, title: null } })
      i++
      continue
    }

    // Regular paragraph
    nodes.push({ type: 'paragraph', content: parseInline(line) })
    i++
  }

  return {
    type: 'doc',
    content: nodes.length > 0 ? nodes : [{ type: 'paragraph', content: [] }],
  }
}

export function tiptapToPlainTextPreview(content: TiptapContent | null, maxLen = 100): string {
  if (!content) return ''
  function extract(node: TiptapNode): string {
    if (node.text) return node.text
    if (node.content) return node.content.map(extract).join('')
    return ''
  }
  const text = content.content?.map(extract).join(' ') ?? ''
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text
}
