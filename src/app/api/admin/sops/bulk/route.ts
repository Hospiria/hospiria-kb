import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { sopIds, categoryId, teamId, status } = await request.json()
  if (!sopIds?.length) return NextResponse.json({ error: 'No SOPs specified' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if (categoryId !== undefined) updates.category_id = (categoryId === '__remove__' || !categoryId) ? null : categoryId
  if (status !== undefined) updates.status = status

  // Update SOP fields
  if (Object.keys(updates).length > 0) {
    const { error } = await supabase.from('sops').update(updates).in('id', sopIds)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Update team assignment
  if (teamId !== undefined) {
    await supabase.from('sop_teams').delete().in('sop_id', sopIds)
    if (teamId && teamId !== '__remove__') {
      const rows = sopIds.map((id: string) => ({ sop_id: id, team_id: teamId }))
      await supabase.from('sop_teams').insert(rows)
    }
  }

  return NextResponse.json({ success: true, updated: sopIds.length })
}
