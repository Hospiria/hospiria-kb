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
  if (!profile || !['author', 'super_admin'].includes(profile.role)) redirect('/sops')

  const { data: sop } = await supabase
    .from('sops')
    .select('*, sop_teams(team_id)')
    .eq('id', params.id)
    .single()
  if (!sop) notFound()

  // Authors can only edit their own SOPs
  if (profile.role === 'author' && sop.author_id !== user.id) redirect('/sops')

  const { data: categories } = await supabase.from('categories').select('*, teams(name)').order('display_order')
  const { data: teams } = await supabase.from('teams').select('*').order('name')

  const initialTeamIds = (sop.sop_teams as { team_id: string }[] | null)?.map(t => t.team_id) ?? []

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
        initialStatus={sop.status}
        categories={categories ?? []}
        teams={teams ?? []}
        authorId={user.id}
      />
    </div>
  )
}
