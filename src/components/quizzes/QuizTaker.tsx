'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { TiptapViewer } from '@/components/sops/TiptapViewer'
import { TiptapContent, QuizQuestion } from '@/types'
import { BookOpen, ArrowRight, CheckCircle, XCircle, ChevronLeft, Award } from 'lucide-react'
import Link from 'next/link'

interface Props {
  enrollmentId: string
  enrollmentStatus: string
  existingScore: number | null
  quiz: { id: string; title: string; questions: unknown[]; pass_mark: number }
  sopContent: TiptapContent | null
  sopTitle: string
  sopId: string
}

type Phase = 'reading' | 'taking' | 'result'

export function QuizTaker({ enrollmentId, enrollmentStatus, existingScore, quiz, sopContent, sopTitle, sopId }: Props) {
  const questions = quiz.questions as QuizQuestion[]
  const router = useRouter()

  // If already completed, jump straight to result
  const [phase, setPhase] = useState<Phase>(
    enrollmentStatus !== 'pending' ? 'result' : 'reading'
  )
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [result, setResult] = useState<{ score: number; passed: boolean; correctCount: number; totalQuestions: number } | null>(
    enrollmentStatus !== 'pending' && existingScore !== null
      ? { score: existingScore, passed: enrollmentStatus === 'passed', correctCount: 0, totalQuestions: questions.length }
      : null
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const allAnswered = questions.every(q => answers[q.id] !== undefined)

  async function handleSubmit() {
    if (!allAnswered) { setError('Please answer all questions before submitting.'); return }
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/quizzes/${enrollmentId}/attempt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Submission failed'); return }
      setResult(data)
      setPhase('result')
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── Phase: Result ──────────────────────────────────────────────
  if (phase === 'result' && result) {
    const passed = result.passed
    return (
      <div className="max-w-2xl mx-auto">
        <Link href="/quizzes" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-navy-700 mb-6 transition-colors">
          <ChevronLeft className="w-4 h-4" /> Back to My Quizzes
        </Link>
        <div className={`bg-white border-2 rounded-2xl p-10 text-center ${passed ? 'border-green-200' : 'border-red-200'}`}>
          {passed ? (
            <Award className="w-16 h-16 text-green-500 mx-auto mb-4" />
          ) : (
            <XCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          )}
          <h1 className="text-3xl font-bold text-navy-700 mb-2">
            {passed ? '🎉 You Passed!' : 'Not Quite'}
          </h1>
          <div className={`text-6xl font-black my-6 ${passed ? 'text-green-500' : 'text-red-400'}`}>
            {result.score}%
          </div>
          <p className="text-gray-500 text-sm mb-2">Pass mark: {quiz.pass_mark}%</p>
          {passed ? (
            <p className="text-green-700 font-medium text-lg">Well done! You've completed this quiz.</p>
          ) : (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-red-700 font-medium">You need {quiz.pass_mark}% to pass.</p>
              <p className="text-red-600 text-sm mt-1">
                Please re-read the SOP carefully and ask your manager to re-enrol you in this quiz.
              </p>
              <Link
                href={`/sops/${sopId}`}
                className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 bg-navy-700 text-white text-sm font-medium rounded-lg hover:bg-navy-800 transition-colors"
              >
                <BookOpen className="w-4 h-4" />
                Re-read SOP
              </Link>
            </div>
          )}
          {passed && (
            <Link
              href="/quizzes"
              className="inline-flex items-center gap-2 mt-6 px-6 py-2.5 bg-teal-600 text-white font-medium rounded-xl hover:bg-teal-700 transition-colors"
            >
              Back to My Quizzes
            </Link>
          )}
        </div>
      </div>
    )
  }

  // ── Phase: Reading ──────────────────────────────────────────────
  if (phase === 'reading') {
    return (
      <div className="max-w-4xl mx-auto">
        <Link href="/quizzes" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-navy-700 mb-4 transition-colors">
          <ChevronLeft className="w-4 h-4" /> Back to My Quizzes
        </Link>

        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-4 flex items-start gap-3">
          <BookOpen className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-800">Step 1 of 2 — Read the SOP</p>
            <p className="text-sm text-amber-700 mt-0.5">
              Read the full SOP below carefully before starting the quiz. You need {quiz.pass_mark}% or more to pass.
            </p>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl mb-5">
          <div className="p-5 border-b border-gray-100">
            <h1 className="text-xl font-bold text-navy-700">{sopTitle}</h1>
          </div>
          {sopContent ? (
            <TiptapViewer content={sopContent} />
          ) : (
            <p className="p-8 text-center text-gray-400">No content available.</p>
          )}
        </div>

        <div className="flex justify-end">
          <button
            onClick={() => setPhase('taking')}
            className="flex items-center gap-2 px-6 py-3 bg-teal-600 text-white font-semibold rounded-xl hover:bg-teal-700 transition-colors"
          >
            I've read this — Start Quiz
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    )
  }

  // ── Phase: Taking ──────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setPhase('reading')}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-navy-700 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Back to SOP
        </button>
        <span className="text-sm text-gray-400">{Object.keys(answers).length} / {questions.length} answered</span>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-100 rounded-full h-1.5 mb-6">
        <div
          className="bg-teal-500 h-1.5 rounded-full transition-all"
          style={{ width: `${(Object.keys(answers).length / questions.length) * 100}%` }}
        />
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4">
        <div className="flex items-center gap-2 mb-1">
          <CheckCircle className="w-4 h-4 text-teal-500" />
          <h2 className="font-bold text-navy-700">Quiz: {quiz.title}</h2>
        </div>
        <p className="text-xs text-gray-400">{questions.length} questions · {quiz.pass_mark}% to pass</p>
      </div>

      <div className="space-y-4 mb-6">
        {questions.map((q, idx) => (
          <div
            key={q.id}
            className={`bg-white border rounded-xl p-5 transition-colors ${answers[q.id] !== undefined ? 'border-teal-200' : 'border-gray-200'}`}
          >
            <p className="font-medium text-navy-700 mb-3">
              <span className="text-teal-500 font-bold mr-2">Q{idx + 1}.</span>
              {q.question}
            </p>
            <div className="space-y-2">
              {q.options.map((opt, optIdx) => (
                <label
                  key={optIdx}
                  className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors border ${
                    answers[q.id] === optIdx
                      ? 'bg-teal-50 border-teal-300 text-teal-800'
                      : 'bg-gray-50 border-gray-100 hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  <input
                    type="radio"
                    name={q.id}
                    value={optIdx}
                    checked={answers[q.id] === optIdx}
                    onChange={() => setAnswers(prev => ({ ...prev, [q.id]: optIdx }))}
                    className="accent-teal-600"
                  />
                  <span className="text-sm">{opt}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      <div className="flex justify-end">
        <button
          onClick={handleSubmit}
          disabled={loading || !allAnswered}
          className="flex items-center gap-2 px-8 py-3 bg-navy-700 text-white font-semibold rounded-xl hover:bg-navy-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Submitting…' : 'Submit Quiz'}
          {!loading && <ArrowRight className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )
}
