import { createClient, createAdminClient } from '@/lib/supabase/server'
import { markdownToTiptap } from '@/lib/markdownToTiptap'
import { NextResponse } from 'next/server'

type ClickUpPage = { id: string; name: string; content?: string; pages?: ClickUpPage[] }

function flattenPages(pages: ClickUpPage[]): ClickUpPage[] {
  const result: ClickUpPage[] = []
  for (const page of pages) {
    result.push(page)
    if (page.pages?.length) result.push(...flattenPages(page.pages))
  }
  return result
}

async function ensureBucket(adminClient: ReturnType<typeof createAdminClient>) {
  const { data: buckets } = await adminClient.storage.listBuckets()
  if (!buckets?.some((b: { id: string }) => b.id === 'sop-images')) {
    await adminClient.storage.createBucket('sop-images', {
      public: true,
      fileSizeLimit: 10 * 1024 * 1024,
    })
  }
}

async function uploadImage(
  url: string,
  token: string,
  adminClient: ReturnType<typeof createAdminClient>
): Promise<string | null> {
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
  } catch {
    return null
  }
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

  const { token, workspaceId, docs, teamId, categoryId } = await request.json()
  if (!token || !workspaceId || !docs?.length) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  await ensureBucket(adminClient)

  const results: { docName: string; imported: number; skipped: number; error?: string }[] = []

  for (const doc of docs) {
    try {
      const res = await fetch(
        `https://api.clickup.com/api/v3/workspaces/${workspaceId}/docs/${doc.id}/pages?content_format=text/md`,
        { headers: { Authorization: token } }
      )

      if (!res.ok) {
        results.push({ docName: doc.name, imported: 0, skipped: 0, error: 'Could not fetch pages' })
        continue
      }

      const data = await res.json()
      const pages = flattenPages(data.pages ?? [])
      let imported = 0
      let skipped = 0

      for (const page of pages) {
        const title = page.name || doc.name || 'Untitled'
        const rawContent = page.content ?? ''
        if (!rawContent.trim()) { skipped++; continue }

        // Download + re-upload images to Supabase Storage
        const processedMarkdown = await processImages(rawContent, token, adminClient)

        // Convert markdown → Tiptap JSON
        const content = markdownToTiptap(processedMarkdown)

        // Insert SOP
        const { data: sop, error } = await supabase
          .from('sops')
          .insert({ title, content, status: 'draft', author_id: user.id, category_id: categoryId || null })
          .select('id')
          .single()

        if (!error && sop) {
          if (teamId) await supabase.from('sop_teams').insert({ sop_id: sop.id, team_id: teamId })
          imported++
        } else {
          skipped++
        }
      }

      results.push({ docName: doc.name, imported, skipped })
    } catch {
      results.push({ docName: doc.name, imported: 0, skipped: 0, error: 'Unexpected error' })
    }
  }

  return NextResponse.json({ results })
}
