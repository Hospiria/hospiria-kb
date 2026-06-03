export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { requirePage } from '@/lib/permissions-guard'
import { ClickUpImport } from '@/components/admin/ClickUpImport'

export default async function AdminClickUpPage() {
  await requirePage('import_clickup', 'edit')
  const supabase = createClient()

  const { data: teams } = await supabase.from('teams').select('*').order('name')
  const { data: categories } = await supabase.from('categories').select('*').order('display_order')

  return <ClickUpImport teams={teams ?? []} categories={categories ?? []} />
}
