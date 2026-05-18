# Hospiria Knowledge Base — Handover Document

**Last updated:** May 2026  
**GitHub repo:** https://github.com/Hospiria/hospiria-kb  
**Live app:** https://hospiria-kb.vercel.app  
**Hosted on:** Vercel (auto-deploys from `main` branch)  
**Database:** Supabase  

---

## What This App Does

The Hospiria Knowledge Base is an internal web application for Hospiria staff. It has two core modules:

1. **SOP Library** — A structured library of Standard Operating Procedures, organised by team and category. Staff can read SOPs relevant to their team.
2. **Training / Quizzes** — Each SOP can have an AI-generated quiz attached. Admins assign quizzes to agents with a due date. Agents complete the quiz and must pass (80% mark). Failed quizzes can be re-enrolled.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Database + Auth | Supabase (PostgreSQL) |
| Hosting | Vercel |
| Email | Gmail SMTP via Nodemailer (`hospiria.training@gmail.com`) |
| Team notifications | Microsoft Teams webhook |
| Charts | Recharts |
| Rich text editor | Tiptap |

---

## User Roles

| Role | What they can do |
|---|---|
| `super_admin` | Full access: all SOPs, all teams, all users, admin panel, analytics dashboard |
| `approver` | Reviews and approves/rejects submitted SOPs |
| `team_leader` | Sees their own team's SOPs only |
| `junior_team_leader` | Same as team_leader |
| `agent` | Reads live SOPs for their team, completes assigned quizzes |

> **Team visibility rule:** Agents, team leaders, and junior team leaders only see SOPs for their primary team (plus any teams explicitly granted via cross-team access). Approvers and super admins see all teams.

---

## Environment Variables

Set in Vercel → Project → Environment Variables. All marked **Sensitive**.

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (admin operations) |
| `NEXT_PUBLIC_APP_URL` | Live app URL — `https://hospiria-kb.vercel.app` |
| `SMTP_USER` | Gmail address — `hospiria.training@gmail.com` |
| `SMTP_PASS` | Gmail App Password (16-char, no spaces) |
| `TEAMS_WEBHOOK_URL` | Microsoft Teams incoming webhook URL |
| `CRON_SECRET` | Secret token to protect the quiz-reminder cron endpoint |
| `EMAIL_FROM` | (Legacy — not currently used) |
| `RESEND_API_KEY` | (Legacy — Resend replaced by Gmail SMTP) |

---

## Key Features & How They Work

### Adding a New User
1. Go to **Admin → Users**
2. Fill in full name, email, role, team → click **Create User**
3. A **login setup link** appears — copy it and send to the user via Teams or WhatsApp
4. The user clicks the link → arrives at a **Set password** page → sets their own password → lands on the dashboard
5. ⚠️ Do **not** use the Magic Link option on the login page — it hits Supabase email rate limits

### Getting a Login Link for an Existing User
- On the Users page, click the 🔗 **link icon** next to any user
- A fresh setup link is generated — copy and share it
- Useful if someone forgot their password or never set one

### Changing Password (any user)
- Click your name in the top-right corner → **Change password**
- Enter and confirm new password → saved immediately

### SOP Workflow
1. Author creates a SOP (status: `Draft`)
2. Author submits for review (status: `Submitted`)
3. Approver reviews — approves (→ `Live`) or requests changes (→ `Changes Requested`)
4. Live SOPs are visible to all agents on the relevant team

### Quiz / Training Workflow
1. Admin goes to **Admin → Manage Quizzes**
2. Either generate a quiz from a live SOP (AI) or create one manually
3. On the quiz detail page, enrol one or more users with a due date
4. Enrolled agents see the quiz under **My Courses**
5. They read the SOP then take the quiz (must score 80%+)
6. Admin can re-enrol failed agents from the quiz detail page
7. A 3-day-before-due reminder email is sent automatically via cron

### Admin Dashboard (Analytics)
- **Score Distribution** chart — how agents are scoring
- **Team Completion** chart — passed/failed/pending per team
- **Topic Failure Analysis** — which quizzes have high fail rates (≥40% = flagged for in-person training)
- **Agent Performance** table — per-user stats (total quizzes, passed, failed, avg score)

### Importing SOPs
- **Admin → Import SOPs** — CSV/Excel bulk import
- **Admin → Import from ClickUp** — pull SOPs directly from ClickUp Docs

### Impersonation (View as User)
- On the Users page, click the 👁️ **eye icon** next to any user
- You'll see the app exactly as that user sees it
- A banner appears at the top reminding you you're impersonating
- Click **Stop** on the banner to return to your own account

---

## Folder Structure

```
src/
├── app/
│   ├── (app)/                  # All authenticated pages
│   │   ├── layout.tsx          # Main app shell (sidebar + topbar)
│   │   ├── dashboard/          # Role-specific dashboards
│   │   ├── sops/               # SOP list, view, edit, approve
│   │   ├── quizzes/            # Agent quiz pages (My Courses)
│   │   └── admin/              # Admin-only pages
│   │       ├── users/          # User management
│   │       ├── teams/          # Teams & categories
│   │       ├── quizzes/        # Quiz management + enrolments
│   │       ├── sops/           # Bulk SOP management
│   │       ├── import/         # CSV import
│   │       └── clickup/        # ClickUp import
│   ├── api/
│   │   ├── admin/
│   │   │   ├── invite/         # Create new user (no email)
│   │   │   ├── setup-link/     # Generate password-setup link
│   │   │   ├── impersonate/    # Set impersonation session
│   │   │   ├── quizzes/[id]/
│   │   │   │   ├── enroll/     # Enrol users in a quiz
│   │   │   │   └── reenroll/   # Re-enrol failed users
│   │   │   └── sops/bulk/      # Bulk SOP operations
│   │   ├── quizzes/[id]/attempt/ # Submit quiz answers
│   │   └── cron/quiz-reminders/  # Automated reminder emails
│   ├── auth/
│   │   ├── callback/           # Supabase auth redirect handler
│   │   └── set-password/       # Password setup page
│   └── login/                  # Login page
├── components/
│   ├── admin/                  # Admin UI components
│   ├── layout/                 # Sidebar, Topbar, ImpersonationBanner
│   ├── sops/                   # SOP editor, viewer, approval
│   ├── quizzes/                # Quiz taker component
│   └── ui/                     # Shared UI (StatusBadge etc.)
├── lib/
│   ├── supabase/               # Supabase client (server + client)
│   ├── notifications/
│   │   ├── email.ts            # Gmail SMTP email sending
│   │   └── teams.ts            # Teams webhook notifications
│   ├── impersonation.ts        # Impersonation session logic
│   ├── roles.ts                # Role permission helpers
│   └── utils.ts                # Date formatting, cn(), etc.
└── types/index.ts              # All TypeScript types
```

---

## Database (Supabase)

Key tables:

| Table | Purpose |
|---|---|
| `profiles` | User profiles (links to Supabase auth) — stores role, full_name, primary_team_id |
| `teams` | Teams (e.g. Reservations, Onboarding) |
| `categories` | SOP categories, belong to a team |
| `team_access` | Cross-team access grants for users |
| `sops` | SOP records with content (Tiptap JSON), status, author |
| `sop_teams` | Many-to-many: which teams can see each SOP |
| `sop_versions` | Version history of each SOP |
| `approvals` | Approval records per SOP submission |
| `quizzes` | Quiz definitions (questions in JSON) |
| `quiz_enrollments` | Which user is enrolled in which quiz, status, score |
| `quiz_attempts` | Individual attempt records with answers |
| `notifications` | In-app notification inbox per user |

Access Supabase at: https://supabase.com → sign in with the Hospiria account.

---

## Deployment

Every push to the `main` branch on GitHub triggers an automatic Vercel deployment. Takes ~2 minutes.

**To deploy a change:**
```bash
git add -A
git commit -m "Description of change"
git push origin main
```

Monitor the deployment at: https://vercel.com → Sonali's projects → hospiria-kb → Deployments

---

## Known Limitations / Parked Issues

| Issue | Status | Notes |
|---|---|---|
| Email delivery to Microsoft Exchange | ⚠️ Parked | Gmail SMTP sends successfully but Hospiria's Microsoft Exchange filters/blocks emails from external Gmail. Workaround: use Teams notifications + login links shared manually. IT team needs to whitelist `hospiria.training@gmail.com` if email delivery is needed. |
| Magic Link login | ⚠️ Don't use | Triggers Supabase email rate limit. Always use the password + setup link flow instead. |

---

## Cron Job (Quiz Reminders)

A cron job runs daily to send reminder emails to users whose quiz is due in 3 days.

- **Endpoint:** `POST /api/cron/quiz-reminders`
- **Auth:** Requires `Authorization: Bearer {CRON_SECRET}` header
- Set up via Vercel Cron or an external scheduler (e.g. cron-job.org)

---

## Contact / Credentials

| Item | Detail |
|---|---|
| GitHub org | https://github.com/Hospiria |
| Vercel project owner | Sonali Agarwal (sonali@hospiria.com) |
| Supabase project | `gpdlfnvriwverwlhofzs` |
| Training email | hospiria.training@gmail.com |
| App URL | https://hospiria-kb.vercel.app |
