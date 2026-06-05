# Gmail SMTP Email Setup Guide

How to configure a Gmail address to send transactional emails from a Next.js app hosted on Vercel.

---

## What you need

- A Gmail account to send from (can be a shared/team address like `training@yourdomain.com`)
- Google 2-Step Verification enabled on that account
- Vercel project with environment variable access

---

## Step 1 — Generate a Gmail App Password

Gmail blocks SMTP login with your regular password. You need an **App Password** instead.

1. Sign in to the Gmail account you want to send from.
2. Go to **Google Account → Security**.
3. Under *"How you sign in to Google"*, click **2-Step Verification** and enable it if not already on.
4. Go back to **Security** and search for **App passwords** (or go directly to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)).
5. Click **Create**, give it a name (e.g. `My App SMTP`), click **Create**.
6. **Copy the 16-character password** — you only see it once.

> The password looks like: `abcd efgh ijkl mnop` — use it without spaces.

---

## Step 2 — Install nodemailer

```bash
npm install nodemailer
npm install --save-dev @types/nodemailer
```

---

## Step 3 — Create the email utility file

Create `src/lib/email.ts`:

```ts
import nodemailer from 'nodemailer'

function getTransporter() {
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!user || !pass) {
    console.warn('Email skipped: SMTP_USER / SMTP_PASS not set')
    return null
  }
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,        // use TLS (port 465)
    auth: { user, pass },
  })
}

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string
  subject: string
  html: string
}) {
  const transporter = getTransporter()
  if (!transporter) return

  await transporter.sendMail({
    from: `Your App Name <${process.env.SMTP_USER}>`,
    to,
    subject,
    html,
  })
}
```

---

## Step 4 — Set environment variables

**Local development** — create `.env.local` (gitignored):

```
SMTP_USER=you@gmail.com
SMTP_PASS=abcdefghijklmnop
```

**Vercel production** — go to:
`Vercel Dashboard → Your Project → Settings → Environment Variables`

Add:

| Name | Value |
|------|-------|
| `SMTP_USER` | `you@gmail.com` |
| `SMTP_PASS` | `abcdefghijklmnop` (no spaces) |

---

## Step 5 — Use it in an API route

```ts
// src/app/api/send-welcome/route.ts
import { NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email'

export async function POST(request: Request) {
  const { to, name } = await request.json()

  await sendEmail({
    to,
    subject: 'Welcome!',
    html: `<p>Hi ${name}, welcome aboard!</p>`,
  })

  return NextResponse.json({ success: true })
}
```

---

## Step 6 — Test it

Call your API route and check the inbox:

```bash
curl -X POST http://localhost:3000/api/send-welcome \
  -H "Content-Type: application/json" \
  -d '{"to": "test@example.com", "name": "Test"}'
```

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `Username and Password not accepted` | You're using your regular Gmail password — use the App Password instead |
| `Invalid login` | 2-Step Verification is not enabled — enable it, then create the App Password |
| `Emails not arriving` | Check `SMTP_USER`/`SMTP_PASS` are set in Vercel env vars, then redeploy |
| Email goes to spam | Add SPF/DKIM records for your domain, or use a custom Google Workspace account |
| Works locally but not on Vercel | Env vars added after last deploy — trigger a new deployment |

---

## Notes

- **Port 465 + `secure: true`** is the most reliable Gmail SMTP setup. Port 587 with STARTTLS also works but is less consistent.
- If `SMTP_USER`/`SMTP_PASS` are missing the utility silently skips sending — no crash. Good for local dev without credentials.
- For high volume (1000s of emails/day) consider switching to a dedicated service like Resend, SendGrid, or Postmark.
