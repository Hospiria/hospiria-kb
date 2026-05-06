import { TiptapContent, TiptapNode } from '@/types'

// Unescape markdown backslash escapes: \. \( \) \[ \] \- etc.
function unescapeMarkdown(text: string): string {
  return text.replace(/\\([^\s])/g, '$1')
}

function parseInline(text: string): TiptapNode[] {
  if (!text) return [{ type: 'text', text: '' }]
  const unescaped = unescapeMarkdown(text)
  const nodes: TiptapNode[] = []
  // Match **bold**, *italic*, `code`, [link](url), or plain text
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[([^\]]+)\]\(([^)]+)\)|([^*`[\]]+)/g
  let match
  while ((match = regex.exec(unescaped)) !== null) {
    if (match[1] !== undefined) {
      nodes.push({ type: 'text', text: match[1], marks: [{ type: 'bold' }] })
    } else if (match[2] !== undefined) {
      nodes.push({ type: 'text', text: match[2], marks: [{ type: 'italic' }] })
    } else if (match[3] !== undefined) {
      nodes.push({ type: 'text', text: match[3], marks: [{ type: 'code' }] })
    } else if (match[4] !== undefined && match[5] !== undefined) {
      // Link — render as text with link mark
      nodes.push({ type: 'text', text: match[4], marks: [{ type: 'link', attrs: { href: match[5] } }] })
    } else if (match[6] !== undefined) {
      nodes.push({ type: 'text', text: match[6] })
    }
  }
  return nodes.length > 0 ? nodes : [{ type: 'text', text: unescaped }]
}

function makeListItem(text: string): TiptapNode {
  return {
    type: 'listItem',
    content: [{ type: 'paragraph', content: parseInline(text) }],
  }
}

/** Peek ahead past blank lines to see if the next content line matches a pattern */
function peekNextContentLine(lines: string[], from: number): string | null {
  for (let j = from; j < lines.length; j++) {
    if (lines[j].trim() !== '') return lines[j]
  }
  return null
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

    // Bullet list — collect consecutive bullet lines (skip blank lines between items)
    if (line.match(/^[-*]\s+/)) {
      const items: TiptapNode[] = []
      while (i < lines.length) {
        if (lines[i].match(/^[-*]\s+/)) {
          items.push(makeListItem(lines[i].replace(/^[-*]\s+/, '')))
          i++
        } else if (lines[i].trim() === '') {
          // Only continue if the next content line is also a bullet
          const next = peekNextContentLine(lines, i + 1)
          if (next?.match(/^[-*]\s+/)) { i++; continue }
          break
        } else {
          break
        }
      }
      nodes.push({ type: 'bulletList', content: items })
      continue
    }

    // Ordered list — collect consecutive numbered lines (skip blank lines between items)
    if (line.match(/^\d+\.\s+/)) {
      const items: TiptapNode[] = []
      while (i < lines.length) {
        if (lines[i].match(/^\d+\.\s+/)) {
          items.push(makeListItem(lines[i].replace(/^\d+\.\s+/, '')))
          i++
        } else if (lines[i].trim() === '') {
          const next = peekNextContentLine(lines, i + 1)
          if (next?.match(/^\d+\.\s+/)) { i++; continue }
          break
        } else {
          break
        }
      }
      nodes.push({ type: 'orderedList', content: items })
      continue
    }

    // Horizontal rule
    if (line.match(/^---+$/) && !(lines[i - 1]?.match(/^\|/) || lines[i + 1]?.match(/^\|/))) {
      nodes.push({ type: 'horizontalRule' })
      i++
      continue
    }

    // Markdown table — collect | lines, skipping blank lines between rows
    if (line.match(/^\|.+\|/)) {
      const tableLines: string[] = []

      while (i < lines.length) {
        const cur = lines[i]
        if (cur.match(/^\|.+\|/)) {
          tableLines.push(cur)
          i++
        } else if (cur.trim() === '') {
          // Skip blank lines only if the next content line is also a table row
          const next = peekNextContentLine(lines, i + 1)
          if (next?.match(/^\|.+\|/)) { i++; continue }
          break
        } else {
          break
        }
      }

      // Filter out pure separator rows (|---|---|) for detection
      const isSeparator = (row: string) => row.replace(/[|\-:\s]/g, '').length === 0
      const nonSepLines = tableLines.filter(r => !isSeparator(r))
      const hasSeparator = tableLines.length > 1 && isSeparator(tableLines[1])

      function parseRow(rowLine: string): string[] {
        return rowLine.split('|').slice(1, -1).map(c => c.trim())
      }

      const rows: TiptapNode[] = []
      for (let r = 0; r < tableLines.length; r++) {
        if (isSeparator(tableLines[r])) continue // skip separator rows
        const isHeaderRow = hasSeparator && tableLines.indexOf(tableLines[r]) === 0
        const cells = parseRow(tableLines[r]).map(cellText => ({
          type: isHeaderRow ? 'tableHeader' : 'tableCell',
          attrs: { colspan: 1, rowspan: 1 },
          content: [{ type: 'paragraph', content: parseInline(cellText) }],
        }))
        if (cells.length > 0) rows.push({ type: 'tableRow', content: cells })
      }

      if (rows.length > 0) nodes.push({ type: 'table', content: rows })
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
