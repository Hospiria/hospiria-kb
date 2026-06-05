import { createClient } from '@/lib/supabase/server'
import { requireFeature } from '@/lib/permissions-guard'
import { NextResponse } from 'next/server'

// GET /api/companies?q=searchTerm — returns active companies matching the query.
// Used by the company picker in the to-do editor.
export async function GET(request: Request) {
  const auth = await requireFeature('notes', 'view')
  if ('error' in auth) return auth.error
  const supabase = createClient()

  const q = new URL(request.url).searchParams.get('q')?.trim() ?? ''

  let query = supabase
    .from('companies')
    .select('id, name')
    .eq('is_active', true)
    .order('name')
    .limit(20)

  if (q.length >= 1) query = query.ilike('name', `%${q}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ companies: data ?? [] })
}
