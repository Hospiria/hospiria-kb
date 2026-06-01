// Normalises a pasted conversation or an exported WhatsApp .txt into a clean
// "Sender: message" transcript, dropping timestamps and system noise so the
// extraction prompt stays focused (and cheaper).

// Matches the start of a WhatsApp message line in both common export formats:
//   iOS:     [2023-05-12, 2:32:01 PM] Josef: hi
//   Android: 12/05/2023, 14:32 - Josef: hi
const IOS_LINE = /^\[(?:\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}),?\s+[\d:apAPmM\s]+\]\s*([^:]{1,60}):\s?(.*)$/
const ANDROID_LINE = /^\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4},?\s+[\d:apAPmM\s]+\s-\s([^:]{1,60}):\s?(.*)$/

const SYSTEM_NOISE = [
  /Messages and calls are end-to-end encrypted/i,
  /<Media omitted>/i,
  /image omitted|video omitted|audio omitted|sticker omitted|GIF omitted|document omitted/i,
  /This message was deleted|You deleted this message/i,
  /Missed (voice|video) call/i,
  /changed the subject|changed this group's icon|added|left|removed|created group/i,
]

function isNoise(text: string): boolean {
  const t = text.trim()
  if (!t) return true
  return SYSTEM_NOISE.some(re => re.test(t))
}

interface Msg { sender: string; text: string }

/**
 * Parse a WhatsApp export. If the text doesn't look like an export (no matching
 * timestamped lines), returns null so the caller can treat it as a plain paste.
 */
export function parseWhatsApp(raw: string): string | null {
  const lines = raw.split(/\r?\n/)
  const msgs: Msg[] = []
  let matched = 0

  for (const line of lines) {
    const m = line.match(IOS_LINE) || line.match(ANDROID_LINE)
    if (m) {
      matched++
      const sender = m[1].trim()
      const text = m[2] ?? ''
      if (!isNoise(text)) msgs.push({ sender, text })
    } else if (msgs.length > 0 && line.trim()) {
      // Continuation of the previous multi-line message
      msgs[msgs.length - 1].text += '\n' + line.trim()
    }
  }

  // Heuristic: if almost nothing matched the WhatsApp shape, it's not an export.
  if (matched < 3) return null

  return msgs
    .filter(m => !isNoise(m.text))
    .map(m => `${m.sender}: ${m.text}`)
    .join('\n')
}

/**
 * Normalise any input into a transcript: WhatsApp export if detected, otherwise
 * the pasted text trimmed as-is.
 */
export function normaliseConversation(raw: string): { transcript: string; source: 'whatsapp' | 'paste' } {
  const wa = parseWhatsApp(raw)
  if (wa) return { transcript: wa, source: 'whatsapp' }
  return { transcript: raw.trim(), source: 'paste' }
}
