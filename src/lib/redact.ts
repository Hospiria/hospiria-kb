// Deterministic, server-side PII scrubbing for conversation ingestion.
// Runs BEFORE any text is sent to the AI, so raw contact details never leave
// our infrastructure. It is intentionally conservative on the high-confidence
// patterns (emails, phones, links); fuzzier PII (guest names, addresses, door
// codes) is handled by instructing the model during extraction.

export interface RedactionResult {
  text: string
  counts: Record<string, number>
}

const PATTERNS: { label: string; re: RegExp; replace: string }[] = [
  { label: 'email', re: /[\w.+-]+@[\w-]+\.[\w.-]+/g, replace: '[email]' },
  { label: 'link', re: /https?:\/\/\S+/gi, replace: '[link]' },
  // UK postcodes e.g. "SW1A 1AA", "M1 1AE"
  { label: 'postcode', re: /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi, replace: '[postcode]' },
  // Phone-like runs: 9+ digits possibly with +, spaces, (), -, .
  { label: 'phone', re: /\+?\d(?:[\d\s().-]{7,})\d/g, replace: '[phone]' },
]

/**
 * Scrub high-confidence PII from a transcript. Returns the cleaned text plus a
 * count of how many of each type were removed (handy to show the admin).
 */
export function redactPII(input: string): RedactionResult {
  let text = input
  const counts: Record<string, number> = {}

  for (const { label, re, replace } of PATTERNS) {
    let n = 0
    text = text.replace(re, () => { n++; return replace })
    if (n > 0) counts[label] = n
  }

  return { text, counts }
}
