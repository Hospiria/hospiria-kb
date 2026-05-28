export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TagManagement, type Tag } from '@/components/admin/TagManagement'

export default async function AdminCompaniesPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'super_admin') redirect('/dashboard')

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
