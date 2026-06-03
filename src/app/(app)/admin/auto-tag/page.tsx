export const dynamic = 'force-dynamic'

import { requirePage } from '@/lib/permissions-guard'
import { AutoTagManager } from '@/components/admin/AutoTagManager'

export default async function AutoTagPage() {
  await requirePage('autotag', 'edit')

  return <AutoTagManager />
}
