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

  const [
    { data: categories },
    { data: teams },
    { data: companies },
    { data: platforms },
    { data: profiles },
  ] = await Promise.all([
    supabase.from('categories').select('*, teams(name)').order('display_order'),
    supabase.from('teams').select('*').order('name'),
    supabase.from('companies').select('id, name, is_active').order('name'),
    supabase.from('platforms').select('id, name, is_active').order('name'),
    supabase.from('profiles').select('id, full_name, role').order('full_name'),
  ])

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
        companies={(companies ?? []) as { id: string; name: string; description: null; is_active: boolean; created_at: string; updated_at: string }[]}
        platforms={(platforms ?? []) as { id: string; name: string; description: null; is_active: boolean; created_at: string; updated_at: string }[]}
        profiles={profiles ?? []}
        authorId={user.id}
        userRole={profile.role}
      />
    </div>
  )
}
