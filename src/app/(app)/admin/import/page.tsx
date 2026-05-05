export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CsvImport } from '@/components/admin/CsvImport'

export default async function AdminImportPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || profile.role !== 'super_admin') redirect('/dashboard')

  const { data: teams } = await supabase.from('teams').select('*')
  const { data: categories } = await supabase.from('categories').select('*, teams(name)').order('display_order')

  return <CsvImport teams={teams ?? []} categories={categories ?? []} authorId={user.id} />
}
