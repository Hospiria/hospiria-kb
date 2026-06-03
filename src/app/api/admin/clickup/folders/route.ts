import { requireFeature } from '@/lib/permissions-guard'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const auth = await requireFeature('import_clickup', 'edit')
  if ('error' in auth) return auth.error

  const token = request.headers.get('x-clickup-token')
  const { searchParams } = new URL(request.url)
  const spaceId = searchParams.get('spaceId')

  if (!token || !spaceId) return NextResponse.json({ error: 'Token and spaceId required' }, { status: 400 })

  const res = await fetch(`https://api.clickup.com/api/v2/space/${spaceId}/folder?archived=false`, {
    headers: { Authorization: token },
  })

  if (!res.ok) return NextResponse.json({ error: 'Failed to fetch folders' }, { status: res.status })

  const data = await res.json()
  return NextResponse.json({ folders: data.folders ?? [] })
}
