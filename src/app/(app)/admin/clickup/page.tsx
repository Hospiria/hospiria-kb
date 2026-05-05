export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ClickUpImport } from '@/components/admin/ClickUpImport'

export default async function AdminClickUpPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || profile.role !== 'super_admin') redirect('/dashboard')

  const { data: teams } = await supabase.from('teams').select('*').order('name')
  const { data: categories } = await supabase.from('categories').select('*').order('display_order')

  return <ClickUpImport teams={teams ?? []} categories={categories ?? []} />
}
