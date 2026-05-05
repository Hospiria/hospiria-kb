import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const token = request.headers.get('x-clickup-token')
  const { searchParams } = new URL(request.url)
  const workspaceId = searchParams.get('workspaceId')
  const docId = searchParams.get('docId')
  if (!token || !workspaceId || !docId) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

  const res = await fetch(
    `https://api.clickup.com/api/v3/workspaces/${workspaceId}/docs/${docId}/page_listing?max_page_depth=-1`,
    { headers: { Authorization: token } }
  )
  if (!res.ok) return NextResponse.json({ error: 'Failed to fetch pages' }, { status: res.status })
  const data = await res.json()
  return NextResponse.json({ pages: data.pages ?? [] })
}
