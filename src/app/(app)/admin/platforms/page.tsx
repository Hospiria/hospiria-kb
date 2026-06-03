export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { requirePage } from '@/lib/permissions-guard'
import { TagManagement, type Tag } from '@/components/admin/TagManagement'

export default async function AdminPlatformsPage() {
  await requirePage('platforms', 'view')
  const supabase = createClient()

  const { data: platforms } = await supabase
    .from('platforms')
    .select('id, name, description, is_active')
    .order('name')

  return (
    <TagManagement
      tableName="platforms"
      singular="Platform"
      plural="Platforms"
      description="Software tools and channels that SOPs relate to (e.g. Pricelabs, Rentals United, Airbnb)."
      initialTags={(platforms ?? []) as Tag[]}
    />
  )
}
