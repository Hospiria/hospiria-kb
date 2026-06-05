import { createClient } from '@/lib/supabase/server'
import { requireFeature } from '@/lib/permissions-guard'
import { NextResponse } from 'next/server'

// DELETE /api/todos/trash?space=personal | ?teamId=xxx
// Permanently removes all soft-deleted todos in the given scope.
export async function DELETE(request: Request) {
  const auth = await requireFeature('notes', 'edit')
  if ('error' in auth) return auth.error
  const supabase = createClient()

  const { searchParams } = new URL(request.url)
  const space = searchParams.get('space')
  const teamId = searchParams.get('teamId')

  let query = supabase.from('todos').delete().not('deleted_at', 'is', null)
  if (space === 'personal') query = query.is('team_id', null)
  else if (teamId) query = query.eq('team_id', teamId)

  const { error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
