import { createClient, createAdminClient } from '@/lib/supabase/server'
import { markdownToTiptap } from '@/lib/markdownToTiptap'
import { NextResponse } from 'next/server'

async function ensureBucket(adminClient: ReturnType<typeof createAdminClient>) {
  const { data: buckets } = await adminClient.storage.listBuckets()
  if (!buckets?.some((b: { id: string }) => b.id === 'sop-images')) {
    await adminClient.storage.createBucket('sop-images', { public: true, fileSizeLimit: 10 * 1024 * 1024 })
  }
}

async function uploadImage(url: string, token: string, adminClient: ReturnType<typeof createAdminClient>): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { Authorization: token } })
    if (!res.ok) return null
    const buffer = await res.arrayBuffer()
    const contentType = res.headers.get('content-type') ?? 'image/png'
    const ext = contentType.split('/').pop()?.split(';')[0] ?? 'png'
    const filename = `clickup/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await adminClient.storage.from('sop-images').upload(filename, buffer, { contentType })
    if (error) return null
    const { data: { publicUrl } } = adminClient.storage.from('sop-images').getPublicUrl(filename)
    return publicUrl
  } catch { return null }
}

async function processImages(markdown: string, token: string, adminClient: ReturnType<typeof createAdminClient>): Promise<string> {
  const imageRegex = /!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g
  const matches = [...markdown.matchAll(imageRegex)]
  let result = markdown
  for (const match of matches) {
    const [full, alt, url] = match
    const newUrl = await uploadImage(url, token, adminClient)
    if (newUrl) result = result.replace(full, `![${alt}](${newUrl})`)
  }
  return result
}

export async function POST(request: Request) {
  const supabase = createClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { token, workspaceId, docId, pages } = await request.json()
  if (!token || !workspaceId || !docId || !pages?.length) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  await ensureBucket(adminClient)

  // Cache for auto-created categories: key = `${teamId}::${categoryName}`
  const categoryCache: Record<string, string> = {}

  async function resolveCategory(teamId: string | null, parentName: string | null): Promise<string | null> {
    if (!teamId || !parentName) return null
    const cacheKey = `${teamId}::${parentName}`
    if (categoryCache[cacheKey]) return categoryCache[cacheKey]

    // Look for existing category with this name under the team
    const { data: existing } = await supabase
      .from('categories')
      .select('id')
      .eq('name', parentName)
      .eq('team_id', teamId)
      .maybeSingle()

    if (existing) {
      categoryCache[cacheKey] = existing.id
      return existing.id
    }

    // Create it
    const { data: created } = await supabase
      .from('categories')
      .insert({ name: parentName, team_id: teamId, display_order: 999 })
      .select('id')
      .single()

    if (created) {
      categoryCache[cacheKey] = created.id
      return created.id
    }
    return null
  }

  const results: { name: string; status: 'imported' | 'skipped' | 'error'; error?: string }[] = []

  for (const page of pages) {
    const pageTeamId: string | null = page.teamId ?? null
    // Resolve category: explicit categoryId OR auto-create from parentName
    const pageCategoryId: string | null =
      page.categoryId ?? (await resolveCategory(pageTeamId, page.parentName ?? null))

    try {
      const res = await fetch(
        `https://api.clickup.com/api/v3/workspaces/${workspaceId}/docs/${docId}/pages/${page.id}?content_format=text/md`,
        { headers: { Authorization: token } }
      )
      if (!res.ok) { results.push({ name: page.name, status: 'error', error: `HTTP ${res.status}` }); continue }

      const data = await res.json()
      const rawContent = data.content ?? ''
      if (!rawContent.trim()) { results.push({ name: page.name, status: 'skipped' }); continue }

      const processedMarkdown = await processImages(rawContent, token, adminClient)
      const content = markdownToTiptap(processedMarkdown)

      const { data: sop, error } = await supabase
        .from('sops')
        .insert({ title: page.name, content, status: 'draft', author_id: user.id, category_id: pageCategoryId })
        .select('id').single()

      if (!error && sop) {
        if (pageTeamId) await supabase.from('sop_teams').insert({ sop_id: sop.id, team_id: pageTeamId })
        results.push({ name: page.name, status: 'imported' })
      } else {
        results.push({ name: page.name, status: 'error', error: 'Database error' })
      }
    } catch {
      results.push({ name: page.name, status: 'error', error: 'Unexpected error' })
    }
  }

  return NextResponse.json({ results })
}
