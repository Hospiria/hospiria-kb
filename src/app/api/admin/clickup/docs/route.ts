import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

async function fetchDocs(workspaceId: string, token: string, parentId?: string, parentType?: string) {
  const allDocs: unknown[] = []
  let cursor: string | null = null

  do {
    const url = new URL(`https://api.clickup.com/api/v3/workspaces/${workspaceId}/docs`)
    url.searchParams.set('limit', '100')
    if (cursor) url.searchParams.set('cursor', cursor)
    if (parentId && parentType) {
      url.searchParams.set('parent_id', parentId)
      url.searchParams.set('parent_type', parentType)
    }

    const res = await fetch(url.toString(), { headers: { Authorization: token } })
    if (!res.ok) return null

    const data = await res.json()
    allDocs.push(...(data.docs ?? []))
    cursor = data.cursor ?? null
  } while (cursor)

  return allDocs
}

export async function GET(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const token = request.headers.get('x-clickup-token')
  const { searchParams } = new URL(request.url)
  const workspaceId = searchParams.get('workspaceId')
  const spaceId = searchParams.get('spaceId')
  const folderId = searchParams.get('folderId')

  if (!token || !workspaceId) return NextResponse.json({ error: 'Token and workspaceId required' }, { status: 400 })

  let docs: unknown[] | null = null

  if (folderId) {
    // Try folder filter first
    docs = await fetchDocs(workspaceId, token, folderId, 'FOLDER')
    // If empty, fall back to space level
    if (!docs?.length && spaceId) {
      docs = await fetchDocs(workspaceId, token, spaceId, 'SPACE')
    }
  } else if (spaceId) {
    // Try space filter
    docs = await fetchDocs(workspaceId, token, spaceId, 'SPACE')
  }

  // Final fallback: get ALL workspace docs (no parent filter)
  if (!docs?.length) {
    docs = await fetchDocs(workspaceId, token)
  }

  if (docs === null) return NextResponse.json({ error: 'Failed to fetch docs' }, { status: 500 })

  return NextResponse.json({ docs, fallback: !folderId && !spaceId })
}
