export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getEffectiveSession } from '@/lib/impersonation'
import { AutoTagManager } from '@/components/admin/AutoTagManager'

export default async function AutoTagPage() {
  const session = await getEffectiveSession()
  if (!session?.profile) redirect('/login')
  if (session.profile.role !== 'super_admin') redirect('/dashboard')

  return <AutoTagManager />
}
