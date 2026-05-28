export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { SopEditor } from '@/components/sops/SopEditor'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

export default async function EditSopPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || !['junior_team_leader', 'team_leader', 'approver', 'super_admin'].includes(profile.role)) redirect('/sops')

  const [
    { data: sop },
    { data: categories },
    { data: teams },
    { data: companies },
    { data: platforms },
    { data: profiles },
  ] = await Promise.all([
    supabase
      .from('sops')
      .select('*, sop_teams(team_id), sop_companies(company_id), sop_platforms(platform_id)')
      .eq('id', params.id)
      .single(),
    supabase.from('categories').select('*, teams(name)').order('display_order'),
    supabase.from('teams').select('*').order('name'),
    supabase.from('companies').select('id, name, is_active').order('name'),
    supabase.from('platforms').select('id, name, is_active').order('name'),
    supabase.from('profiles').select('id, full_name, role').order('full_name'),
  ])

  if (!sop) notFound()

  const initialTeamIds = (sop.sop_teams as { team_id: string }[] | null)?.map(t => t.team_id) ?? []
  const initialCompanyIds = (sop.sop_companies as { company_id: string }[] | null)?.map(c => c.company_id) ?? []
  const initialPlatformIds = (sop.sop_platforms as { platform_id: string }[] | null)?.map(p => p.platform_id) ?? []

  return (
    <div>
      <Link href={`/sops/${params.id}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-navy-700 mb-6 transition-colors">
        <ChevronLeft className="w-4 h-4" />
        Back to SOP
      </Link>
      <h1 className="text-2xl font-bold text-navy-700 mb-6">Edit SOP</h1>
      <SopEditor
        sopId={params.id}
        initialTitle={sop.title}
        initialContent={sop.content}
        initialCategoryId={sop.category_id}
        initialTeamIds={initialTeamIds}
        initialCompanyIds={initialCompanyIds}
        initialPlatformIds={initialPlatformIds}
        initialStatus={sop.status}
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
