# Email Notifications — Setup, Implementation & Deployment

> **Audience:** Engineers onboarding to the Hospiria KB codebase who need to understand how transactional emails are sent and how to extend the notification system.

---

## 1. Overview

Hospiria KB sends transactional emails via **Gmail SMTP** using the `nodemailer` library. There are two categories of email:

| Category | Trigger | Sent by |
|----------|---------|---------|
| Quiz assigned | SOP published → quiz auto-enrolled | `publish-automation` API route |
| Quiz reminder | 3 days before quiz due date | Vercel Cron job (daily at 08:00 UTC) |

All emails are sent **server-side** from Next.js API routes and Vercel Cron handlers. The client never handles email credentials.

---

## 2. Gmail SMTP Setup

### 2.1 How it works

We use a dedicated Gmail account as the "From" address. Gmail supports SMTP with an **App Password** — a 16-character credential generated specifically for third-party apps that bypasses 2FA.

**Why App Password, not your regular password?**
Google blocks "less secure app" login. App Passwords are the supported way to authenticate SMTP from code without OAuth.

### 2.2 Generate a Gmail App Password (one-time setup)

1. Log in to the Gmail account you want to send from (e.g. `training@hospiria.com`).
2. Go to **Google Account → Security → 2-Step Verification** — enable it if not already on.
3. Then go to **Google Account → Security → App passwords**.
4. Click **Create app password**, give it a name (e.g. "Hospiria KB SMTP"), and click **Create**.
5. Copy the 16-character password — you will only see it once.

### 2.3 Environment variables

Add these two variables to your environment (Vercel dashboard for production, `.env.local` for local dev):

```
SMTP_USER=training@hospiria.com      # The Gmail address you send from
SMTP_PASS=xxxx xxxx xxxx xxxx        # The 16-char App Password from step 2.2
```

> **Never commit these to git.** They must only live in `.env.local` (gitignored) or in the Vercel environment variable dashboard.

---

## 3. Code Structure

```
src/
└── lib/
    └── notifications/
        ├── email.ts          ← All email logic lives here
        └── teams.ts          ← Microsoft Teams webhook notifications

src/app/api/
├── internal/
│   ├── publish-automation/route.ts   ← Sends quiz-assigned emails on SOP publish
│   └── test-email/route.ts           ← Manual test endpoint for admins
└── cron/
    └── quiz-reminders/route.ts       ← Daily cron: 3-day due-date reminders

vercel.json                           ← Declares the cron schedule
```

---

## 4. `src/lib/notifications/email.ts` — The Email Library

This file is the single source of truth for all email sending. It exports typed functions, each responsible for one email type.

### 4.1 Transport setup

```ts
function getTransporter() {
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!user || !pass) return null          // Graceful no-op if not configured
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,                          // TLS (port 465)
    auth: { user, pass },
  })
}
```

Key decisions:
- **Port 465 + `secure: true`** — uses implicit TLS (SMTPS). This is more reliable than STARTTLS (port 587) for Gmail.
- **Null-safe** — if env vars are missing (e.g. local dev without `.env.local`), it logs a warning and skips sending. No crash.

### 4.2 `sendEmail` (private)

```ts
async function sendEmail({ to, subject, html }) {
  const transporter = getTransporter()
  if (!transporter) {
    console.warn('Email skipped: SMTP_USER / SMTP_PASS not configured')
    return
  }
  const from = `Hospiria Training <${process.env.SMTP_USER}>`
  await transporter.sendMail({ from, to, subject, html })
}
```

All exported functions call this. It handles the actual SMTP connection.

### 4.3 Exported email functions

#### `sendQuizAssignedEmail({ to, name, sopTitle, dueDate })`

Sent when a user is enrolled in a quiz after a SOP is published.

- **Subject:** `📚 New course assigned: "[SOP Title]"`
- **Content:** SOP title, due date, pass mark (80%), link to `/quizzes`
- **Triggered by:** `publish-automation` API route

#### `sendQuizReminderEmail({ to, name, sopTitle, dueDate })`

Sent when a quiz is due in 3 days and the user hasn't completed it.

- **Subject:** `⏰ Reminder: Course due in 3 days — "[SOP Title]"`
- **Content:** Due date, link to `/quizzes`
- **Triggered by:** Vercel Cron (daily at 08:00 UTC)

---

## 5. When Emails Are Triggered

### 5.1 On SOP publish → Quiz assigned (`publish-automation`)

**File:** `src/app/api/internal/publish-automation/route.ts`

**Flow:**
1. A team leader or admin clicks **Publish** on a SOP in the editor.
2. The editor POSTs to `/api/internal/publish-automation` (fire-and-forget).
3. The route:
   - Creates a quiz for the SOP.
   - Determines the audience (team members, specific users, or everyone).
   - Creates `quiz_enrollments` rows for each user.
   - Sends an in-app notification + email to each enrolled user.

**Relevant code:**
```ts
// Step 5 inside publish-automation
for (const profile of allProfiles) {
  const auth = emailMap.get(profile.id)
  if (auth?.email) {
    await sendQuizAssignedEmail({
      to: auth.email,
      name: auth.name || 'there',
      sopTitle: sop.title,
      dueDate,
    })
  }
}
```

**Note:** Emails are sent one-by-one in a `for` loop. For large teams this is acceptable; if the team grows to 100+ users, switch to batched sending.

### 5.2 Daily reminder cron (`quiz-reminders`)

**File:** `src/app/api/cron/quiz-reminders/route.ts`

**Schedule:** `0 8 * * *` (08:00 UTC every day) — declared in `vercel.json`.

**Flow:**
1. Vercel invokes `GET /api/cron/quiz-reminders` at 08:00 UTC daily.
2. The route checks for pending enrollments due between now+3 days and now+4 days.
3. It skips users who already received a `quiz_reminder` notification (dedup via the `notifications` table).
4. For each eligible user it:
   - Inserts an in-app notification.
   - Sends a reminder email.

**Authentication:** The cron route verifies a `CRON_SECRET` in the `Authorization` header. Vercel sets this automatically when calling its own cron jobs. If you call it manually (e.g. during testing), include `Authorization: Bearer <CRON_SECRET>`.

```
CRON_SECRET=your-random-secret-here    # Set in Vercel env vars
```

---

## 6. `vercel.json` — Cron Schedule

```json
{
  "crons": [
    {
      "path": "/api/cron/quiz-reminders",
      "schedule": "0 8 * * *"
    },
    {
      "path": "/api/cron/recurring-todos",
      "schedule": "0 6 * * *"
    }
  ]
}
```

- Crons only run on **production deployments** (not preview deployments).
- The schedule is standard cron syntax (UTC timezone).
- Vercel's cron feature requires a **Pro plan or above**.

---

## 7. Testing Emails

### 7.1 Using the test endpoint

A manual test endpoint exists for admins to verify the email setup is working:

```
POST /api/internal/test-email
Content-Type: application/json

{
  "to": "your.address@email.com",
  "name": "Your Name"
}
```

This sends a sample "quiz assigned" email. You must be logged in as an authenticated user to call it.

**Using curl:**
```bash
curl -X POST https://hospiria-kb.vercel.app/api/internal/test-email \
  -H "Content-Type: application/json" \
  -H "Cookie: <your session cookie>" \
  -d '{"to": "test@example.com", "name": "Test User"}'
```

### 7.2 Using the Teams & Categories admin panel

In the admin area under **Teams & Categories**, each team has a **"🧪 Send test message"** button that tests the Microsoft Teams webhook for that team. This is separate from email but useful for verifying the dual-notification stack.

### 7.3 Local development (no emails)

In local dev, if `SMTP_USER` / `SMTP_PASS` are not in `.env.local`, email sending is silently skipped. This is intentional — you don't want to accidentally email real users during development. Check the terminal for the warning: `Email skipped: SMTP_USER / SMTP_PASS not configured`.

---

## 8. Vercel Deployment Checklist

When deploying a new environment, ensure these env vars are set in the **Vercel project dashboard** (`Settings → Environment Variables`):

| Variable | Value | Required for |
|----------|-------|-------------|
| `SMTP_USER` | Gmail address (e.g. `training@hospiria.com`) | All email sending |
| `SMTP_PASS` | Gmail App Password (16 chars, no spaces) | All email sending |
| `CRON_SECRET` | Any random string (e.g. `openssl rand -hex 32`) | Cron job auth |
| `NEXT_PUBLIC_APP_URL` | `https://hospiria-kb.vercel.app` | Email button links |

Missing `SMTP_USER`/`SMTP_PASS` → emails silently skipped (no crash, but no delivery).  
Missing `CRON_SECRET` → cron job returns 401, no reminders sent.

---

## 9. Notification Centre — Admin Control Panel

> **Status:** Planned feature. The infrastructure is in place; the admin UI to control settings is the next build step.

### 9.1 What it should do

The notification centre gives admins granular control over:

1. **Which events trigger emails** — toggle each email type on/off globally.
2. **Who receives each email type** — by role, by team, or individually.
3. **Timing** — change the reminder window (e.g. 3 days → 5 days) without touching code.

### 9.2 Database schema to add (migration 022)

```sql
-- Per-event email settings controlled by super_admin
create table if not exists notification_settings (
  id            uuid primary key default gen_random_uuid(),
  event         text not null unique,
  -- e.g. 'quiz_assigned', 'quiz_reminder', 'sop_published', 'sop_approved'

  email_enabled boolean not null default true,
  teams_enabled boolean not null default true,
  -- Who receives it: 'all', 'team_only', 'specific_roles'
  recipient_scope text not null default 'team_only',
  -- JSON array of role names when scope = 'specific_roles'
  recipient_roles jsonb not null default '["agent"]',
  -- Reminder-specific: days before due to send
  reminder_days_before int not null default 3,

  updated_at    timestamptz not null default now(),
  updated_by    uuid references profiles(id)
);

-- Seed with defaults matching current hard-coded behaviour
insert into notification_settings (event, email_enabled, teams_enabled, recipient_scope, recipient_roles) values
  ('quiz_assigned',  true, true, 'team_only',      '["agent","junior_team_leader","team_leader"]'),
  ('quiz_reminder',  true, true, 'team_only',      '["agent","junior_team_leader","team_leader"]'),
  ('sop_published',  false, true, 'team_only',     '["agent"]'),
  ('sop_submitted',  false, true, 'specific_roles', '["approver","team_leader"]'),
  ('sop_approved',   false, false, 'specific_roles','["author"]');
```

### 9.3 Admin UI — `/admin/notifications`

A new page in the admin panel with a table of toggles:

```
Event                  Email   Teams   Who receives
─────────────────────────────────────────────────────────
Quiz assigned          ✅ On   ✅ On   Team members ▾
Quiz reminder (3 days) ✅ On   ✅ On   Team members ▾
SOP published          ☐ Off   ✅ On   Agents ▾
SOP submitted          ☐ Off   ✅ On   Approvers + Team leaders ▾
SOP approved           ☐ Off   ☐ Off  Author ▾
```

- **Reminder days** — a number input on the `quiz_reminder` row to change from 3 to any number.
- **Who receives** — a dropdown: All staff / Team members only / Specific roles (with role checkboxes).
- Changes save via `PATCH /api/admin/notification-settings/[event]` and apply immediately.

### 9.4 How the app layer reads settings

Replace hard-coded behaviour in `publish-automation` and `quiz-reminders` with a settings lookup:

```ts
// At the top of publish-automation
const { data: settings } = await adminClient
  .from('notification_settings')
  .select('*')
  .in('event', ['quiz_assigned', 'sop_published'])

const quizAssignedSettings = settings?.find(s => s.event === 'quiz_assigned')

// Before sending email:
if (quizAssignedSettings?.email_enabled && auth?.email) {
  await sendQuizAssignedEmail({ ... })
}
```

### 9.5 Per-user opt-out (future)

Once the centre is live, individual users can opt out of specific email types via a **Notification preferences** section in their profile (`/profile/notifications`). This adds a `user_notification_prefs` table with `user_id + event → opted_out boolean`.

---

## 10. Email Template Guidelines

All email templates use **HTML table-based layouts** (not CSS grid/flexbox) for maximum email client compatibility. Key conventions:

- Inline styles only — no `<style>` blocks.
- Max width 600px centred.
- Dark header bar (`#0f1f40`) with white text.
- Single CTA button per email (never two).
- Plain text fallback is **not** currently set — add `text:` to `sendMail()` options if needed.
- Footer always includes "This is an automated notification from the Hospiria Knowledge Base".

To add a new email type:
1. Add a new exported `send*Email()` function to `src/lib/notifications/email.ts`.
2. Call it from the relevant API route.
3. Add a row to `notification_settings` with `email_enabled: false` as the safe default.
4. Add the UI toggle in `/admin/notifications`.

---

## 11. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Emails not arriving | `SMTP_USER`/`SMTP_PASS` not set in Vercel | Add env vars, redeploy |
| "Invalid login" SMTP error | App Password wrong or account 2FA changed | Regenerate App Password in Google Account |
| "Username and Password not accepted" | Using regular Gmail password, not App Password | See §2.2 |
| Cron reminders not running | `CRON_SECRET` not set, or not on Vercel Pro | Check env vars + plan |
| Duplicate reminder emails | `notifications` dedup check failing | Check `quiz_reminder` type is inserted correctly |
| Email links point to localhost | `NEXT_PUBLIC_APP_URL` not set | Set to production URL in Vercel env vars |
