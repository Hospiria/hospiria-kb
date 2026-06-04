import { createClient } from '@/lib/supabase/server'
import { requireFeature } from '@/lib/permissions-guard'
import { NextResponse } from 'next/server'

// POST — create a new status (super_admin only via RLS)
export async function POST(request: Request) {
  const auth = await requireFeature('users', 'edit') // admin-only gate
  if ('error' in auth) return auth.error
  const supabase = createClient()
  const b = await request.json().catch(() => ({}))
  const { name, color = '#94a3b8', is_done = false } = b
  if (!name?.toString().trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })

  // Get max position
  const { data: existing } = await supabase.from('todo_statuses').select('position').order('position', { ascending: false }).limit(1)
  const position = ((existing?.[0]?.position ?? 0) as number) + 10

  const { data, error } = await supabase.from('todo_statuses')
    .insert({ name: name.toString().trim(), color: color.toString(), is_done: !!is_done, position })
    .select('id, name, color, position, is_done, is_default').single()
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Create failed' }, { status: 500 })
  return NextResponse.json({ status: data })
}
