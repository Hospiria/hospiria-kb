// Deterministic company-name matching for the SOP auto-tagger.
// Given a SOP's title + plain-text content and the list of active companies,
// it proposes which companies the SOP is for, with a confidence level.

export interface CompanyLite {
  id: string
  name: string
}

export type Confidence = 'high' | 'low' | 'ai'

export interface CompanySuggestion {
  companyId: string
  name: string
  confidence: Confidence
  where: 'title' | 'content'
  count: number
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Reduce a company name to the part likely to appear in SOP text:
 * strips parenthetical notes and a trailing "by <management co>".
 *   "Orchard by UTDM (v3)"      -> "Orchard"
 *   "10 George Street by UTDM"  -> "10 George Street"
 *   "Veeve London by Veeve"     -> "Veeve London"
 */
export function coreName(name: string): string {
  let n = name.replace(/\([^)]*\)/g, ' ')
  n = n.replace(/\s+by\s+.+$/i, '')
  return n.replace(/\s+/g, ' ').trim()
}

// Whole-word, whitespace-flexible match pattern (no global flag here)
function matchSource(term: string): string | null {
  const t = term.trim()
  if (t.length < 3) return null
  const escaped = escapeRe(t).replace(/\s+/g, '\\s+')
  return `(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`
}

export function suggestCompanies(
  title: string,
  content: string,
  companies: CompanyLite[],
  excludeIds: Set<string>
): CompanySuggestion[] {
  const safeTitle = title ?? ''
  const safeContent = content ?? ''
  const out: CompanySuggestion[] = []

  for (const c of companies) {
    if (excludeIds.has(c.id)) continue

    const core = coreName(c.name)
    const terms = Array.from(new Set([c.name, core].filter(t => t && t.length >= 3)))

    let titleHit = false
    let fullNameHit = false
    let contentCount = 0

    for (const term of terms) {
      const src = matchSource(term)
      if (!src) continue
      if (new RegExp(src, 'i').test(safeTitle)) titleHit = true
      const matches = safeContent.match(new RegExp(src, 'gi'))
      if (matches && matches.length > 0) {
        contentCount += matches.length
        if (term === c.name) fullNameHit = true
      }
    }

    if (!titleHit && contentCount === 0) continue

    const coreWords = core.split(/\s+/).filter(Boolean).length
    let confidence: Confidence
    let where: 'title' | 'content'

    if (titleHit) {
      confidence = 'high'
      where = 'title'
    } else if (fullNameHit || coreWords >= 2 || core.length >= 7) {
      // Full client name, a multi-word client, or a long distinctive single
      // word (e.g. "Kempinski") appearing in the body — treat as confident.
      confidence = 'high'
      where = 'content'
    } else {
      // Short single-word core (e.g. "Miles") — plausible but needs a human.
      confidence = 'low'
      where = 'content'
    }

    out.push({ companyId: c.id, name: c.name, confidence, where, count: contentCount })
  }

  // Title matches first, then by frequency
  return out.sort((a, b) => {
    if (a.where !== b.where) return a.where === 'title' ? -1 : 1
    return b.count - a.count
  })
}
