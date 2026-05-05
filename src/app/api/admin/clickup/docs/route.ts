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

  if (!token || !workspaceId) return NextResponse.json({ error: 'Token and workspaceId required' }, { status: 400 })

  const allDocs: unknown[] = []
  let cursor: string | null = null

  do {
    const url = new URL(`https://api.clickup.com/api/v3/workspaces/${workspaceId}/docs`)
    url.searchParams.set('limit', '100')
    if (cursor) url.searchParams.set('cursor', cursor)

    const res = await fetch(url.toString(), { headers: { Authorization: token } })
    if (!res.ok) return NextResponse.json({ error: 'Failed to fetch docs' }, { status: res.status })

    const data = await res.json()
    allDocs.push(...(data.docs ?? []))
    cursor = data.cursor ?? null
  } while (cursor)

  return NextResponse.json({ docs: allDocs })
}
