import { requireFeature } from '@/lib/permissions-guard'
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
  const auth = await requireFeature('import_clickup', 'edit')
  if ('error' in auth) return auth.error

  const token = request.headers.get('x-clickup-token')
  const { searchParams } = new URL(request.url)
  const workspaceId = searchParams.get('workspaceId')
  const spaceId = searchParams.get('spaceId')
  const folderId = searchParams.get('folderId')
  if (!token || !workspaceId) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

  // Step 1: Try folder filter
  if (folderId) {
    const docs = await fetchDocs(workspaceId, token, folderId, 'FOLDER')
    if (docs?.length) return NextResponse.json({ docs, source: 'folder' })
  }

  // Step 2: Try space filter
  if (spaceId) {
    const docs = await fetchDocs(workspaceId, token, spaceId, 'SPACE')
    if (docs?.length) return NextResponse.json({ docs, source: 'space' })
  }

  // Step 3: Get all workspace docs, then filter by space ID client-side using parent field
  const allDocs = await fetchDocs(workspaceId, token)
  if (!allDocs) return NextResponse.json({ error: 'Failed to fetch docs' }, { status: 500 })

  // Try to filter by space using the parent field in each doc
  if (spaceId) {
    const spaceDocs = allDocs.filter((d: unknown) => {
      const doc = d as Record<string, unknown>
      const parent = doc.parent as Record<string, unknown> | undefined
      return parent?.id === spaceId || doc.space_id === spaceId
    })
    if (spaceDocs.length) return NextResponse.json({ docs: spaceDocs, source: 'space-filtered' })
  }

  // Final fallback: return all docs with flag so UI can show search
  return NextResponse.json({ docs: allDocs, source: 'all', showSearch: true })
}
