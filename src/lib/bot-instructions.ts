import type { SupabaseClient } from '@supabase/supabase-js'

type BotSection = 'principle' | 'person' | 'guardrail'

interface Row {
  section: BotSection
  content: string
  sort_order: number
}

/**
 * Load the admin-editable bot instructions and compose them into prompt
 * fragments the chat route appends to its base Hospiria context.
 *
 * Reads with whatever client is passed (the chat route uses the service-role
 * admin client, since the table is locked to super_admins). Any failure
 * returns empty strings so the bot falls back to its base prompt and never
 * breaks if the table is missing or unreadable.
 */
export async function loadBotInstructions(supabase: SupabaseClient): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('bot_instructions')
      .select('section, content, sort_order')
      .eq('is_active', true)
      .order('section')
      .order('sort_order')

    if (error || !data) return ''

    const rows = data as Row[]
    const bySection = (s: BotSection) =>
      rows.filter(r => r.section === s).map(r => `- ${r.content}`)

    const principles = bySection('principle')
    const people = bySection('person')
    const guardrails = bySection('guardrail')

    const blocks: string[] = []
    if (principles.length) blocks.push(`HOW TO BEHAVE\n${principles.join('\n')}`)
    if (people.length) blocks.push(`PEOPLE & ROLES (point users to the right human when relevant)\n${people.join('\n')}`)
    if (guardrails.length) blocks.push(`GUARDRAILS & FALLBACKS (always honour these)\n${guardrails.join('\n')}`)

    return blocks.length ? '\n\n' + blocks.join('\n\n') : ''
  } catch {
    return ''
  }
}
