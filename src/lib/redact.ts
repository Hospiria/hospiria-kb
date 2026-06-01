// Deterministic, server-side PII scrubbing for conversation ingestion.
// Runs BEFORE any text is sent to the AI, so raw contact details never leave
// our infrastructure. It is intentionally conservative on the high-confidence
// patterns (emails, phones, links); fuzzier PII (guest names, addresses, door
// codes) is handled by instructing the model during extraction.

export interface RedactionResult {
  text: string
  counts: Record<string, number>
}

// A replacement is either a fixed token or a function that can keep part of the
// match (e.g. keep the keyword "lockbox", mask only the value after it).
type Replacer = string | ((match: string, ...groups: string[]) => string)

const PATTERNS: { label: string; re: RegExp; replace: Replacer }[] = [
  { label: 'email', re: /[\w.+-]+@[\w-]+\.[\w.-]+/g, replace: '[email]' },
  { label: 'link', re: /https?:\/\/\S+/gi, replace: '[link]' },
  // UK postcodes e.g. "SW1A 1AA", "M1 1AE"
  { label: 'postcode', re: /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi, replace: '[postcode]' },
  // Phone-like runs: 9+ digits possibly with +, spaces, (), -, .
  { label: 'phone', re: /\+?\d(?:[\d\s().-]{7,})\d/g, replace: '[phone]' },
  // Booking references e.g. "B66466", "B69059"
  { label: 'booking-ref', re: /\bB\d{4,}\b/gi, replace: '[booking-ref]' },
  // Access / door / lockbox / wifi codes stated with a keyword, e.g.
  // "code is 1894", "lockbox: 7421", "wifi password Abc123". Keep the keyword,
  // mask only the value. The value must contain at least one digit so we don't
  // redact ordinary sentences like "the code is broken".
  {
    label: 'code',
    re: /\b(codes?|pin|otp|passcode|password|lock\s?box|key\s?code|door\s?code|access\s?code|gate\s?code|wi-?fi)\b(\s*(?:is|are|:|=|-|–)?\s*)((?=[A-Za-z0-9-]*\d)[A-Za-z0-9-]{3,})/gi,
    replace: (_m, kw: string, sep: string) => `${kw}${sep}[code]`,
  },
  // Bare 6-digit runs — in an ops chat these are almost always access/booking
  // codes (phones are caught above; years/prices are shorter). Codes carry no
  // reusable knowledge, so masking them is safe.
  { label: 'code', re: /\b\d{6}\b/g, replace: '[code]' },
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
    text = typeof replace === 'string'
      ? text.replace(re, () => { n++; return replace })
      : text.replace(re, (...args: string[]) => { n++; return replace(args[0], ...args.slice(1)) })
    if (n > 0) counts[label] = (counts[label] ?? 0) + n
  }

  return { text, counts }
}
