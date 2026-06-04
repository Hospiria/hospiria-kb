const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://hospiria-kb.vercel.app'

// ─── Core sender ──────────────────────────────────────────────────────────────

async function postToTeams(webhookUrl: string, card: object) {
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'message',
      attachments: [{
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          ...card,
        },
      }],
    }),
  }).catch(err => console.error('Teams webhook error:', err))
}

/** Resolves the webhook URL to use: team-specific first, then global env fallback. */
function resolveWebhook(teamWebhookUrl?: string | null): string | null {
  return teamWebhookUrl?.trim() || process.env.TEAMS_WEBHOOK_URL?.trim() || null
}

// ─── Message types ────────────────────────────────────────────────────────────

/** Sent when a SOP is published and a quiz is assigned. */
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
    body: [
      {
        type: 'Container',
        style: 'emphasis',
        items: [{ type: 'TextBlock', text: '📚 New Course Assigned', weight: 'Bolder', size: 'Medium', color: 'Accent' }],
      },
      {
        type: 'Container',
        items: [
          { type: 'TextBlock', text: 'A new SOP has been published and a quiz has been assigned to all staff.', wrap: true },
          { type: 'FactSet', facts: [
            { title: 'SOP', value: sopTitle },
            { title: 'Due Date', value: dueDateStr },
            { title: 'Pass Mark', value: '80%' },
          ]},
          { type: 'TextBlock', text: 'Please complete your course before the deadline.', wrap: true, color: 'Attention', weight: 'Bolder' },
        ],
      },
    ],
    actions: [{ type: 'Action.OpenUrl', title: 'Start Course →', url: `${APP_URL}/quizzes` }],
  })
}

/** Sent when a SOP is published (without quiz). */
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
    body: [
      {
        type: 'Container',
        style: 'emphasis',
        items: [{ type: 'TextBlock', text: '📄 New SOP Published', weight: 'Bolder', size: 'Medium', color: 'Good' }],
      },
      {
        type: 'Container',
        items: [
          { type: 'FactSet', facts: [
            { title: 'SOP', value: sopTitle },
            { title: 'Published by', value: authorName },
          ]},
          { type: 'TextBlock', text: 'A new standard operating procedure is now live in the knowledge base.', wrap: true },
        ],
      },
    ],
    actions: [{ type: 'Action.OpenUrl', title: 'View SOP →', url: `${APP_URL}/sops/${sopId}` }],
  })
}

/** Sent to a team channel when a team to-do is created or assigned. */
export async function sendTodoNotification({
  todoTitle,
  assigneeName,
  priority,
  dueDate,
  teamWebhookUrl,
}: {
  todoTitle: string
  assigneeName?: string | null
  priority?: string
  dueDate?: string | null
  teamWebhookUrl?: string | null
}) {
  const webhookUrl = resolveWebhook(teamWebhookUrl)
  if (!webhookUrl) return

  const facts = []
  if (assigneeName) facts.push({ title: 'Assigned to', value: assigneeName })
  if (priority) facts.push({ title: 'Priority', value: priority.charAt(0).toUpperCase() + priority.slice(1) })
  if (dueDate) facts.push({ title: 'Due', value: dueDate })

  await postToTeams(webhookUrl, {
    body: [
      {
        type: 'Container',
        style: 'emphasis',
        items: [{ type: 'TextBlock', text: '✅ New Task', weight: 'Bolder', size: 'Medium' }],
      },
      {
        type: 'Container',
        items: [
          { type: 'TextBlock', text: todoTitle, wrap: true, weight: 'Bolder' },
          ...(facts.length ? [{ type: 'FactSet', facts }] : []),
        ],
      },
    ],
    actions: [{ type: 'Action.OpenUrl', title: 'View tasks →', url: `${APP_URL}/notes` }],
  })
}

/** Sent when a SOP is submitted for approval. */
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
    body: [
      {
        type: 'Container',
        style: 'attention',
        items: [{ type: 'TextBlock', text: '🔍 SOP Awaiting Approval', weight: 'Bolder', size: 'Medium' }],
      },
      {
        type: 'Container',
        items: [
          { type: 'FactSet', facts: [
            { title: 'SOP', value: sopTitle },
            { title: 'Submitted by', value: authorName },
          ]},
        ],
      },
    ],
    actions: [{ type: 'Action.OpenUrl', title: 'Review →', url: `${APP_URL}/sops/${sopId}/approve` }],
  })
}
