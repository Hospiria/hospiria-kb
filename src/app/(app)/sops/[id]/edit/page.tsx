export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { requirePage } from '@/lib/permissions-guard'
import { SopEditor } from '@/components/sops/SopEditor'
import { DeleteSopButton } from '@/components/sops/DeleteSopButton'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

export default async function EditSopPage({ params }: { params: { id: string } }) {
  await requirePage('sops', 'edit')
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile) redirect('/login')

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

  // Related SOPs — links are stored once per pair (either side), so look up
  // both directions and resolve the "other" SOP's title for the editor.
  const { data: linkRows } = await supabase
    .from('sop_links')
    .select('sop_a, sop_b')
    .or(`sop_a.eq.${params.id},sop_b.eq.${params.id}`)
  const linkedIds = (linkRows ?? []).map(l => (l.sop_a === params.id ? l.sop_b : l.sop_a))
  const { data: linkedSopRows } = linkedIds.length
    ? await supabase.from('sops').select('id, title').in('id', linkedIds)
    : { data: [] as { id: string; title: string }[] }
  const initialLinkedSops = (linkedSopRows ?? []) as { id: string; title: string }[]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <Link href={`/sops/${params.id}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-navy-700 transition-colors">
          <ChevronLeft className="w-4 h-4" />
          Back to SOP
        </Link>
        {profile.role === 'super_admin' && (
          <DeleteSopButton sopId={params.id} sopTitle={sop.title} />
        )}
      </div>
      <h1 className="text-2xl font-bold text-navy-700 mb-6">Edit SOP</h1>
      <SopEditor
        sopId={params.id}
        initialTitle={sop.title}
        initialContent={sop.content}
        initialCategoryId={sop.category_id}
        initialTeamIds={initialTeamIds}
        initialCompanyIds={initialCompanyIds}
        initialPlatformIds={initialPlatformIds}
        initialLinkedSops={initialLinkedSops}
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
