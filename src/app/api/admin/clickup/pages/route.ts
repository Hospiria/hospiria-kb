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

  // Try with max_page_depth first (some versions use this)
  const url = `https://api.clickup.com/api/v3/workspaces/${workspaceId}/docs/${docId}/page_listing?max_page_depth=50`
  const res = await fetch(url, { headers: { Authorization: token } })

  if (!res.ok) {
    const text = await res.text()
    console.error('ClickUp page_listing error:', res.status, text)
    return NextResponse.json(
      { error: `ClickUp API error ${res.status}: ${text.slice(0, 200)}` },
      { status: res.status }
    )
  }

  const data = await res.json()

  // ClickUp returns a plain array OR an object with { pages: [...] }
  const pages = Array.isArray(data)
    ? data
    : (data.pages ?? data.data?.pages ?? data.data ?? [])

  return NextResponse.json({ pages, _raw_keys: Array.isArray(data) ? ['(array)'] : Object.keys(data) })
}
