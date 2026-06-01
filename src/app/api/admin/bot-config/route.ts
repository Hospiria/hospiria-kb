import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export type BotSection = 'principle' | 'person' | 'guardrail'
const SECTIONS: BotSection[] = ['principle', 'person', 'guardrail']

interface BotInstruction {
  id: string
  section: BotSection
  content: string
  sort_order: number
  is_active: boolean
}

async function requireSuperAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'super_admin') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { userId: user.id }
}

// GET — return all instructions grouped by section
export async function GET() {
  const auth = await requireSuperAdmin()
  if (auth.error) return auth.error

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('bot_instructions')
    .select('id, section, content, sort_order, is_active')
    .order('section')
    .order('sort_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []) as BotInstruction[]
  const grouped: Record<BotSection, BotInstruction[]> = { principle: [], person: [], guardrail: [] }
  for (const r of rows) grouped[r.section]?.push(r)

  return NextResponse.json({ sections: grouped })
}

// PUT — replace one section's items wholesale.
// Body: { section, items: [{ content, is_active }] }
// We delete the section's rows and re-insert in order — simplest way to keep
// the editor's add/remove/reorder in sync without per-row id juggling.
export async function PUT(request: Request) {
  const auth = await requireSuperAdmin()
  if (auth.error) return auth.error

  const body = await request.json().catch(() => ({}))
  const section = body.section as BotSection
  if (!SECTIONS.includes(section)) {
    return NextResponse.json({ error: 'Invalid section' }, { status: 400 })
  }

  const items = (Array.isArray(body.items) ? body.items : [])
    .map((it: { content?: string; is_active?: boolean }) => ({
      content: (it?.content ?? '').toString().trim(),
      is_active: it?.is_active !== false,
    }))
    .filter((it: { content: string }) => it.content.length > 0)

  const admin = createAdminClient()

  const { error: delError } = await admin.from('bot_instructions').delete().eq('section', section)
  if (delError) return NextResponse.json({ error: delError.message }, { status: 500 })

  if (items.length > 0) {
    const rows = items.map((it: { content: string; is_active: boolean }, i: number) => ({
      section,
      content: it.content,
      is_active: it.is_active,
      sort_order: (i + 1) * 10,
      updated_by: auth.userId,
      updated_at: new Date().toISOString(),
    }))
    const { error: insError } = await admin.from('bot_instructions').insert(rows)
    if (insError) return NextResponse.json({ error: insError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, section, count: items.length })
}
