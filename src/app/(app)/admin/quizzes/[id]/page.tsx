export const dynamic = 'force-dynamic'

import { createAdminClient, createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { QuizDetailClient } from '@/components/admin/QuizDetailClient'

export default async function AdminQuizDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'super_admin') redirect('/dashboard')

  const { data: quiz } = await adminClient
    .from('quizzes')
    .select('*, sops(id, title, categories(name, teams(name)))')
    .eq('id', params.id)
    .single()

  if (!quiz) notFound()

  // Get all enrollments for this quiz
  const { data: rawEnrollments } = await adminClient
    .from('quiz_enrollments')
    .select('*')
    .eq('quiz_id', params.id)
    .order('due_date', { ascending: true })

  // Fetch profiles separately to avoid FK join dependency
  const enrolledUserIds = (rawEnrollments ?? []).map((e: { user_id: string }) => e.user_id)
  const { data: enrolledProfiles } = enrolledUserIds.length > 0
    ? await adminClient.from('profiles').select('id, full_name, role').in('id', enrolledUserIds)
    : { data: [] }
  const profileMap = new Map((enrolledProfiles ?? []).map((p: { id: string; full_name: string | null; role: string }) => [p.id, p]))

  const enrollments = (rawEnrollments ?? []).map(e => ({
    ...e,
    profiles: profileMap.get(e.user_id as string) ?? null,
  })) as unknown as (import('@/types').QuizEnrollment & { profiles?: import('@/types').Profile })[]

  // Get all profiles for enrollment selection (exclude super_admin)
  const { data: allProfilesRaw } = await adminClient
    .from('profiles')
    .select('id, full_name, role, primary_team_id, created_at, teams(id, name)')
    .in('role', ['agent', 'author', 'approver'])
    .order('full_name')
  const allProfiles = (allProfilesRaw ?? []) as unknown as (import('@/types').Profile & { teams?: { id: string; name: string } })[]

  return (
    <div className="max-w-5xl mx-auto">
      <Link href="/admin/quizzes" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-navy-700 mb-4 transition-colors">
        <ChevronLeft className="w-4 h-4" />
        Back to Quizzes
      </Link>

      <QuizDetailClient
        quiz={quiz}
        initialEnrollments={enrollments ?? []}
        allProfiles={allProfiles}
      />
    </div>
  )
}
