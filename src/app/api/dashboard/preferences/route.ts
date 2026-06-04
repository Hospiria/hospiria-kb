import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ hidden_cards: [] })
  const { data } = await supabase
    .from('dashboard_preferences')
    .select('hidden_cards')
    .eq('user_id', user.id)
    .single()
  return NextResponse.json({ hidden_cards: data?.hidden_cards ?? [] })
}

export async function PUT(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { hidden_cards } = await request.json().catch(() => ({ hidden_cards: [] }))
  await supabase.from('dashboard_preferences').upsert({
    user_id: user.id,
    hidden_cards: Array.isArray(hidden_cards) ? hidden_cards : [],
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
  return NextResponse.json({ success: true })
}
