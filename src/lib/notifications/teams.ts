const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://hospiria-kb.vercel.app'

export async function sendTeamsNotification({
  sopTitle,
  dueDate,
}: {
  sopTitle: string
  dueDate: Date
}) {
  const webhookUrl = process.env.TEAMS_WEBHOOK_URL
  if (!webhookUrl) return // Skip if not configured

  const dueDateStr = dueDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const quizzesUrl = `${APP_URL}/quizzes`

  // Microsoft Teams Adaptive Card (works with Incoming Webhooks)
  const body = {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body: [
            {
              type: 'Container',
              style: 'emphasis',
              items: [
                {
                  type: 'TextBlock',
                  text: '📚 New Course Assigned',
                  weight: 'Bolder',
                  size: 'Medium',
                  color: 'Accent',
                },
              ],
            },
            {
              type: 'Container',
              items: [
                {
                  type: 'TextBlock',
                  text: `A new SOP has been published and a quiz has been assigned to all staff.`,
                  wrap: true,
                },
                {
                  type: 'FactSet',
                  facts: [
                    { title: 'SOP', value: sopTitle },
                    { title: 'Due Date', value: dueDateStr },
                    { title: 'Pass Mark', value: '80%' },
                  ],
                },
                {
                  type: 'TextBlock',
                  text: 'Please log in to the Hospiria Knowledge Base and complete your course before the deadline.',
                  wrap: true,
                  color: 'Attention',
                  weight: 'Bolder',
                },
              ],
            },
          ],
          actions: [
            {
              type: 'Action.OpenUrl',
              title: 'Start Course →',
              url: quizzesUrl,
            },
          ],
        },
      },
    ],
  }

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(err => console.error('Teams webhook error:', err))
}
