import { createClient, createServiceClient } from '@/lib/supabase/server'
import { requireFeature } from '@/lib/permissions-guard'
import { getEffectiveSession } from '@/lib/impersonation'
import { NextResponse } from 'next/server'

// GET /api/todo-lists?space=personal | ?teamId=xxx
export async function GET(request: Request) {
  const auth = await requireFeature('notes', 'view')
  if ('error' in auth) return auth.error

  const session = await getEffectiveSession()
  const isImpersonating = session?.isImpersonating ?? false
  const effectiveUserId = session?.effectiveUserId ?? auth.userId
  const supabase = isImpersonating ? createServiceClient() : createClient()

  const { searchParams } = new URL(request.url)
  const space = searchParams.get('space')
  const teamId = searchParams.get('teamId')

  let query = supabase.from('todo_lists').select('*').is('deleted_at', null)
    .order('position', { ascending: true }).order('created_at', { ascending: true })

  if (space === 'personal') {
    query = query.is('team_id', null)
    if (isImpersonating) query = query.eq('owner_id', effectiveUserId)
  } else if (teamId) {
    query = query.eq('team_id', teamId)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ lists: data ?? [] })
}

// POST /api/todo-lists  { name, color?, icon?, teamId? }
export async function POST(request: Request) {
  const auth = await requireFeature('notes', 'edit')
  if ('error' in auth) return auth.error
  const supabase = createClient()

  const b = await request.json().catch(() => ({}))
  const name = (b.name ?? '').toString().trim().slice(0, 80)
  if (!name) return NextResponse.json({ error: 'List name is required' }, { status: 400 })

  const { data, error } = await supabase.from('todo_lists').insert({
    owner_id: auth.userId,
    team_id: b.teamId || null,
    name,
    color: b.color || '#14b8a6',
    icon: b.icon || null,
  }).select('*').single()

  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Create failed' }, { status: 500 })
  return NextResponse.json({ list: data })
}
