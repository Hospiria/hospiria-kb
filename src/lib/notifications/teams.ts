const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://hospiria-kb.vercel.app'

// ─── Core sender ──────────────────────────────────────────────────────────────
// Uses the MessageCard format — the most widely supported format for
// Teams Incoming Webhooks (Office 365 connector format).

async function postToTeams(webhookUrl: string, card: {
  title: string
  text: string
  color?: string
  facts?: { name: string; value: string }[]
  actionUrl?: string
  actionLabel?: string
}) {
  const body: Record<string, unknown> = {
    '@type':    'MessageCard',
    '@context': 'http://schema.org/extensions',
    themeColor: card.color ?? '0078D4',
    summary:    card.title,
    sections: [{
      activityTitle: card.title,
      activityText:  card.text,
      ...(card.facts?.length ? { facts: card.facts } : {}),
    }],
  }

  if (card.actionUrl) {
    body.potentialAction = [{
      '@type': 'OpenUri',
      name: card.actionLabel ?? 'Open →',
      targets: [{ os: 'default', uri: card.actionUrl }],
    }]
  }

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(err => { console.error('Teams webhook error:', err); return null })

  if (res && !res.ok) {
    const text = await res.text().catch(() => '')
    console.error('Teams webhook rejected:', res.status, text)
  }
}

/** Resolves the webhook URL: team-specific first, then global env fallback. */
function resolveWebhook(teamWebhookUrl?: string | null): string | null {
  return teamWebhookUrl?.trim() || process.env.TEAMS_WEBHOOK_URL?.trim() || null
}

// ─── Message types ────────────────────────────────────────────────────────────

/** SOP published + quiz assigned. */
export async function sendTeamsNotification({
  sopTitle,
  dueDate,
  teamWebhookUrl,
}: {
  sopTitle: string
  dueDate: Date
  teamWebhookUrl?: string | null
}) {
  const webhookUrl = resolveWebhook(teamWebhookUrl)
  if (!webhookUrl) return

  const dueDateStr = dueDate.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  await postToTeams(webhookUrl, {
    title: '📚 New Course Assigned',
    color: '0078D4',
    text: `A new SOP has been published and a quiz has been assigned to all staff.`,
    facts: [
      { name: 'SOP',       value: sopTitle },
      { name: 'Due Date',  value: dueDateStr },
      { name: 'Pass Mark', value: '80%' },
    ],
    actionUrl:   `${APP_URL}/quizzes`,
    actionLabel: 'Start Course →',
  })
}

/** SOP published (no quiz). */
export async function sendSopPublishedNotification({
  sopId,
  sopTitle,
  authorName,
  teamWebhookUrl,
}: {
  sopId: string
  sopTitle: string
  authorName: string
  teamWebhookUrl?: string | null
}) {
  const webhookUrl = resolveWebhook(teamWebhookUrl)
  if (!webhookUrl) return

  await postToTeams(webhookUrl, {
    title: '📄 New SOP Published',
    color: '28A745',
    text: 'A new standard operating procedure is now live in the knowledge base.',
    facts: [
      { name: 'SOP',          value: sopTitle },
      { name: 'Published by', value: authorName },
    ],
    actionUrl:   `${APP_URL}/sops/${sopId}`,
    actionLabel: 'View SOP →',
  })
}

/** New team task created. */
export async function sendTodoNotification({
  todoTitle,
  todoDetail,
  assigneeName,
  creatorName,
  priority,
  dueDate,
  recurrence,
  teamWebhookUrl,
}: {
  todoTitle: string
  todoDetail?: string | null
  assigneeName?: string | null
  creatorName?: string | null
  priority?: string
  dueDate?: string | null
  recurrence?: string | null
  teamWebhookUrl?: string | null
}) {
  const webhookUrl = resolveWebhook(teamWebhookUrl)
  if (!webhookUrl) return

  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  const facts: { name: string; value: string }[] = []
  if (assigneeName)                         facts.push({ name: '👤 Assigned to', value: assigneeName })
  if (creatorName)                          facts.push({ name: 'Created by',     value: creatorName })
  if (priority)                             facts.push({ name: '🔴 Priority',    value: cap(priority) })
  if (dueDate)                              facts.push({ name: '📅 Due',         value: dueDate })
  if (recurrence && recurrence !== 'none')  facts.push({ name: '🔁 Recurrence',  value: cap(recurrence) })

  const heading = assigneeName
    ? `✅ New task assigned to ${assigneeName}`
    : '✅ New team task'

  await postToTeams(webhookUrl, {
    title: heading,
    color: '28A745',
    text: todoDetail ? `**${todoTitle}**\n\n${todoDetail}` : `**${todoTitle}**`,
    facts,
    actionUrl:   `${APP_URL}/notes`,
    actionLabel: 'Open To-dos →',
  })
}

/** SOP submitted for approval. */
export async function sendSopSubmittedNotification({
  sopId,
  sopTitle,
  authorName,
  teamWebhookUrl,
}: {
  sopId: string
  sopTitle: string
  authorName: string
  teamWebhookUrl?: string | null
}) {
  const webhookUrl = resolveWebhook(teamWebhookUrl)
  if (!webhookUrl) return

  await postToTeams(webhookUrl, {
    title: '🔍 SOP Awaiting Approval',
    color: 'FFC107',
    text: 'A new SOP has been submitted and is waiting for review.',
    facts: [
      { name: 'SOP',          value: sopTitle },
      { name: 'Submitted by', value: authorName },
    ],
    actionUrl:   `${APP_URL}/sops/${sopId}/approve`,
    actionLabel: 'Review →',
  })
}
