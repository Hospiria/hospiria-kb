export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SopEditor } from '@/components/sops/SopEditor'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

export default async function NewSopPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || !['junior_team_leader', 'team_leader', 'approver', 'super_admin'].includes(profile.role)) redirect('/sops')

  const { data: categories } = await supabase.from('categories').select('*, teams(name)').order('display_order')
  const { data: teams } = await supabase.from('teams').select('*').order('name')

  return (
    <div>
      <Link href="/sops" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-navy-700 mb-6 transition-colors">
        <ChevronLeft className="w-4 h-4" />
        Back to SOPs
      </Link>
      <h1 className="text-2xl font-bold text-navy-700 mb-6">New SOP</h1>
      <SopEditor
        categories={categories ?? []}
        teams={teams ?? []}
        authorId={user.id}
      />
    </div>
  )
}
