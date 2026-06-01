export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getEffectiveSession } from '@/lib/impersonation'
import { BotTrainingManager } from '@/components/admin/BotTrainingManager'

export default async function AiTrainingPage() {
  const session = await getEffectiveSession()
  if (!session?.profile) redirect('/login')
  if (session.profile.role !== 'super_admin') redirect('/dashboard')

  return <BotTrainingManager />
}
