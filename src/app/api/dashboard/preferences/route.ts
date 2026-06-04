import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getEffectiveSession } from '@/lib/impersonation'
import { NextResponse } from 'next/server'

// Resolve which user's prefs we're reading/writing, and which client to use.
// When masquerading, target the impersonated user via the service client
// (RLS would otherwise block reading/writing another user's row).
async function resolveTarget() {
  const session = await getEffectiveSession()
  const isImpersonating = session?.isImpersonating ?? false
  if (isImpersonating && session?.effectiveUserId) {
    return { userId: session.effectiveUserId, db: createServiceClient() }
  }
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { userId: user?.id ?? null, db: supabase }
}

export async function GET() {
  const { userId, db } = await resolveTarget()
  if (!userId) return NextResponse.json({ hidden_cards: [], card_layout: {} })
  const { data } = await db
    .from('dashboard_preferences')
    .select('hidden_cards, card_layout')
    .eq('user_id', userId)
    .single()
  return NextResponse.json({
    hidden_cards: data?.hidden_cards ?? [],
    card_layout: data?.card_layout ?? {},
  })
}

export async function PUT(request: Request) {
  const { userId, db } = await resolveTarget()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const update: Record<string, unknown> = { user_id: userId, updated_at: new Date().toISOString() }

  // Patch only the fields provided so callers can save layout and visibility independently.
  if (Array.isArray(body.hidden_cards)) update.hidden_cards = body.hidden_cards
  if (body.card_layout && typeof body.card_layout === 'object') update.card_layout = body.card_layout

  await db.from('dashboard_preferences').upsert(update, { onConflict: 'user_id' })
  return NextResponse.json({ success: true })
}
