export const dynamic = 'force-dynamic'

import { requirePage } from '@/lib/permissions-guard'
import { BotTrainingManager } from '@/components/admin/BotTrainingManager'

export default async function AiTrainingPage() {
  await requirePage('ai_training', 'view')

  return <BotTrainingManager />
}
