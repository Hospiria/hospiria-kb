import { createClient } from '@/lib/supabase/server'
import { requireFeature } from '@/lib/permissions-guard'
import { NextResponse } from 'next/server'

// POST /api/todos/reorder  { ids: string[] }  — assigns sequential positions
// in the given order. Used after a drag-to-reorder.
export async function POST(request: Request) {
  const auth = await requireFeature('notes', 'edit')
  if ('error' in auth) return auth.error
  const supabase = createClient()

  const { ids } = await request.json().catch(() => ({ ids: [] }))
  if (!Array.isArray(ids)) return NextResponse.json({ error: 'ids array required' }, { status: 400 })

  // Position increments by 10 so future single inserts can slot between if needed
  await Promise.all(
    ids.map((id: string, i: number) =>
      supabase.from('todos').update({ position: i * 10 }).eq('id', id)
    )
  )
  return NextResponse.json({ success: true })
}
