export const dynamic = 'force-dynamic'

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getEffectiveSession } from '@/lib/impersonation'
import { NotesPageClient } from '@/components/notes/NotesPageClient'

export default async function NotesPage() {
  const session = await getEffectiveSession()
  if (!session?.profile) redirect('/login')

  const supabase = createClient()

  // Teams and people for @mention + assignee pickers.
  const db = createServiceClient()
  const [{ data: people }, { data: teams }] = await Promise.all([
    db.from('profiles').select('id, full_name').order('full_name'),
    supabase.from('teams').select('id, name').order('name'),
  ])

  return (
    <NotesPageClient
      currentUserId={session.effectiveUserId}
      people={(people ?? []) as { id: string; full_name: string | null }[]}
      teams={(teams ?? []) as { id: string; name: string }[]}
    />
  )
}
