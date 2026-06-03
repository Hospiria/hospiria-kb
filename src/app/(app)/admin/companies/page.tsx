export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { requirePage } from '@/lib/permissions-guard'
import { TagManagement, type Tag } from '@/components/admin/TagManagement'

export default async function AdminCompaniesPage() {
  await requirePage('companies', 'view')
  const supabase = createClient()

  const { data: companies } = await supabase
    .from('companies')
    .select('id, name, description, is_active')
    .order('name')

  return (
    <TagManagement
      tableName="companies"
      singular="Company"
      plural="Companies"
      description="Client and brand entities that SOPs can be tagged with (e.g. Get Living, Under The Doormat)."
      initialTags={(companies ?? []) as Tag[]}
    />
  )
}
