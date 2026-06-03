export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { requirePage } from '@/lib/permissions-guard'
import { CsvImport } from '@/components/admin/CsvImport'

export default async function AdminImportPage() {
  await requirePage('import_sops', 'edit')
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: teams } = await supabase.from('teams').select('*')
  const { data: categories } = await supabase.from('categories').select('*, teams(name)').order('display_order')

  return <CsvImport teams={teams ?? []} categories={categories ?? []} authorId={user.id} />
}
