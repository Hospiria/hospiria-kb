import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Allows a super_admin to remove (hard delete) their own quiz enrolments.
// Two-layer security:
//   1. role === 'super_admin' (only super admins can call this at all)
//   2. user_id = caller.id in the delete query (can only ever delete own rows,
//      so even a malicious super_admin can't wipe other users' enrolments)
export async function DELETE(request: Request) {
  const supabase = createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { enrollmentIds?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const ids = Array.isArray(body.enrollmentIds) ? body.enrollmentIds : []
  if (ids.length === 0) {
    return NextResponse.json({ error: 'No enrollments selected' }, { status: 400 })
  }
  if (!ids.every(id => typeof id === 'string')) {
    return NextResponse.json({ error: 'enrollmentIds must be strings' }, { status: 400 })
  }

  const { data, error } = await adminClient
    .from('quiz_enrollments')
    .delete()
    .in('id', ids as string[])
    .eq('user_id', user.id) // critical: scopes delete to the caller's own rows
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ deleted: data?.length ?? 0 })
}
