import nodemailer from 'nodemailer'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://hospiria-kb.vercel.app'

// Office 365 SMTP transporter — requires SMTP_USER and SMTP_PASS in env vars
function getTransporter() {
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!user || !pass) return null
  return nodemailer.createTransport({
    host: 'smtp.office365.com',
    port: 587,
    secure: false, // STARTTLS
    auth: { user, pass },
    tls: { ciphers: 'SSLv3' },
  })
}

const FROM_NAME = 'Hospiria Training'

async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  const transporter = getTransporter()
  if (!transporter) {
    console.warn('Email skipped: SMTP_USER / SMTP_PASS not configured')
    return
  }
  const from = `${FROM_NAME} <${process.env.SMTP_USER}>`
  await transporter.sendMail({ from, to, subject, html })
}

export async function sendQuizAssignedEmail({
  to,
  name,
  sopTitle,
  dueDate,
}: {
  to: string
  name: string
  sopTitle: string
  dueDate: Date
}) {
  const dueDateStr = dueDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const quizzesUrl = `${APP_URL}/quizzes`

  await sendEmail({
    to,
    subject: `📚 New course assigned: "${sopTitle}"`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 20px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
        <!-- Header -->
        <tr><td style="background:#0f1f40;padding:32px 40px">
          <p style="margin:0;color:#5eead4;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase">Hospiria Knowledge Base</p>
          <h1 style="margin:8px 0 0;color:#ffffff;font-size:24px;font-weight:700">New Course Assigned</h1>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:40px">
          <p style="margin:0 0 16px;color:#374151;font-size:16px">Hi ${name},</p>
          <p style="margin:0 0 24px;color:#374151;font-size:16px;line-height:1.6">
            A new SOP has been published and you have been assigned a course to complete. Please read through the SOP and complete the quiz below.
          </p>

          <!-- Course card -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;margin-bottom:24px">
            <tr><td style="padding:24px">
              <p style="margin:0 0 4px;color:#166534;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">SOP Published</p>
              <p style="margin:0 0 16px;color:#0f1f40;font-size:20px;font-weight:700">${sopTitle}</p>
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-right:24px">
                    <p style="margin:0;color:#6b7280;font-size:12px">Due date</p>
                    <p style="margin:4px 0 0;color:#0f1f40;font-size:14px;font-weight:600">${dueDateStr}</p>
                  </td>
                  <td>
                    <p style="margin:0;color:#6b7280;font-size:12px">Pass mark</p>
                    <p style="margin:4px 0 0;color:#0f1f40;font-size:14px;font-weight:600">80%</p>
                  </td>
                </tr>
              </table>
            </td></tr>
          </table>

          <a href="${quizzesUrl}" style="display:inline-block;background:#0f1f40;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600">
            Start Your Course →
          </a>

          <p style="margin:32px 0 0;color:#9ca3af;font-size:13px;line-height:1.6">
            You have 7 days to complete this course. If you have any questions, contact your team leader.
          </p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e5e7eb">
          <p style="margin:0;color:#9ca3af;font-size:12px">Hospiria · This is an automated notification from the Hospiria Knowledge Base</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  }).catch(err => console.error('Email send error:', err))
}

export async function sendQuizReminderEmail({
  to,
  name,
  sopTitle,
  dueDate,
}: {
  to: string
  name: string
  sopTitle: string
  dueDate: Date
}) {
  const dueDateStr = dueDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const quizzesUrl = `${APP_URL}/quizzes`

  await sendEmail({
    to,
    subject: `⏰ Reminder: Course due in 3 days — "${sopTitle}"`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 20px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
        <tr><td style="background:#b45309;padding:32px 40px">
          <p style="margin:0;color:#fef3c7;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase">Action Required</p>
          <h1 style="margin:8px 0 0;color:#ffffff;font-size:24px;font-weight:700">Course Due in 3 Days</h1>
        </td></tr>
        <tr><td style="padding:40px">
          <p style="margin:0 0 16px;color:#374151;font-size:16px">Hi ${name},</p>
          <p style="margin:0 0 24px;color:#374151;font-size:16px;line-height:1.6">
            This is a reminder that your course for <strong>"${sopTitle}"</strong> is due on <strong>${dueDateStr}</strong>. Please complete it before the deadline.
          </p>
          <a href="${quizzesUrl}" style="display:inline-block;background:#b45309;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600">
            Complete Your Course →
          </a>
          <p style="margin:32px 0 0;color:#9ca3af;font-size:13px">Hospiria · Automated reminder from the Hospiria Knowledge Base</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  }).catch(err => console.error('Reminder email error:', err))
}
