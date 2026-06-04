import { createClient } from '@/lib/supabase/server'
import { requireFeature } from '@/lib/permissions-guard'
import { NextResponse } from 'next/server'

// GET — all statuses ordered by position (any authenticated user)
export async function GET() {
  const auth = await requireFeature('notes', 'view')
  if ('error' in auth) return auth.error
  const supabase = createClient()
  const { data, error } = await supabase
    .from('todo_statuses')
    .select('id, name, color, position, is_done, is_default')
    .order('position')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ statuses: data ?? [] })
}
