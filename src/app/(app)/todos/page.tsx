export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getWorkspaceData } from '@/lib/workspace-data'
import { TodosClient } from '@/components/todos/TodosClient'

export default async function TodosPage() {
  const data = await getWorkspaceData()
  if (!data) redirect('/login')
  return (
    <Suspense>
      <TodosClient currentUserId={data.currentUserId} people={data.people} myTeams={data.myTeams} />
    </Suspense>
  )
}
