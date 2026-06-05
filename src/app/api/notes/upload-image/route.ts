import { createAdminClient } from '@/lib/supabase/server'
import { requireFeature } from '@/lib/permissions-guard'
import { NextResponse } from 'next/server'

// POST (multipart/form-data) → uploads an image to Supabase Storage
// and returns the public URL for embedding in Tiptap.
export async function POST(request: Request) {
  const auth = await requireFeature('notes', 'edit')
  if ('error' in auth) return auth.error

  const form = await request.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'No form data' }, { status: 400 })

  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  // Validate type + size (max 5 MB)
  const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  if (!allowed.includes(file.type)) return NextResponse.json({ error: 'Only JPEG/PNG/GIF/WebP allowed' }, { status: 400 })
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: 'File too large (max 5 MB)' }, { status: 400 })

  const db = createAdminClient()

  // Ensure the bucket exists (public, images only)
  const { data: buckets } = await db.storage.listBuckets()
  if (!buckets?.find(b => b.name === 'note-images')) {
    await db.storage.createBucket('note-images', {
      public: true,
      allowedMimeTypes: allowed,
      fileSizeLimit: 5 * 1024 * 1024,
    })
  }

  const ext = file.name.split('.').pop() ?? 'jpg'
  const filename = `${auth.userId}/${crypto.randomUUID()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error } = await db.storage.from('note-images').upload(filename, buffer, {
    contentType: file.type, upsert: false,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: { publicUrl } } = db.storage.from('note-images').getPublicUrl(filename)
  return NextResponse.json({ url: publicUrl })
}
