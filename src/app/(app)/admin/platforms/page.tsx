export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TagManagement, type Tag } from '@/components/admin/TagManagement'

export default async function AdminPlatformsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'super_admin') redirect('/dashboard')

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
