export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getWorkspaceData } from '@/lib/workspace-data'
import { NotesClient } from '@/components/notes/NotesClient'

export default async function NotesPage() {
  const data = await getWorkspaceData()
  if (!data) redirect('/login')
  return (
    <Suspense>
      <NotesClient currentUserId={data.currentUserId} people={data.people} myTeams={data.myTeams} />
    </Suspense>
  )
}
