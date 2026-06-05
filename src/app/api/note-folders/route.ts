import { createClient } from '@/lib/supabase/server'
import { getEffectiveSession } from '@/lib/impersonation'
import { requireFeature } from '@/lib/permissions-guard'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const auth = await requireFeature('notes', 'view')
  if ('error' in auth) return auth.error
  const session = await getEffectiveSession()
  const effectiveUserId = session?.effectiveUserId ?? auth.userId
  const supabase = createClient()
  const { searchParams } = new URL(request.url)
  const space = searchParams.get('space')
  const teamId = searchParams.get('teamId')

  let query = supabase.from('note_folders').select('*').is('deleted_at', null)
    .order('position').order('created_at')
  if (space === 'personal') query = query.is('team_id', null).eq('owner_id', effectiveUserId)
  else if (teamId) query = query.eq('team_id', teamId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ folders: data ?? [] })
}

export async function POST(request: Request) {
  const auth = await requireFeature('notes', 'edit')
  if ('error' in auth) return auth.error
  const supabase = createClient()
  const b = await request.json().catch(() => ({}))
  const name = (b.name ?? '').toString().trim().slice(0, 60)
  if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 })
  const { data, error } = await supabase.from('note_folders').insert({
    owner_id: auth.userId, team_id: b.teamId || null,
    name, color: b.color || '#14b8a6', icon: b.icon || null,
  }).select('*').single()
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Failed' }, { status: 500 })
  return NextResponse.json({ folder: data })
}
