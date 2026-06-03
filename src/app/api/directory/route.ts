import { createClient, createServiceClient } from '@/lib/supabase/server'
import { requireFeature } from '@/lib/permissions-guard'
import { NextResponse } from 'next/server'

// GET — people (for assignee/share pickers) + teams (for shared to-do lists).
// People are read via the service role because profiles RLS otherwise hides
// other users from non-admins. Teams are readable by any authenticated user.
export async function GET() {
  const auth = await requireFeature('notes', 'view')
  if ('error' in auth) return auth.error
  const db = createServiceClient()
  const [{ data: profiles }, { data: teams }] = await Promise.all([
    db.from('profiles').select('id, full_name, role').order('full_name'),
    createClient().from('teams').select('id, name').order('name'),
  ])
  const people = (profiles ?? []).filter((p: { id: string }) => p.id !== auth.userId)
  return NextResponse.json({ people, teams: teams ?? [] })
}
