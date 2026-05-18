# Hospiria Knowledge Base

An internal knowledge management and training platform for Hospiria staff. Built with Next.js 14, Supabase, and Tailwind CSS.

**Live app:** https://hospiria-kb.vercel.app

---

## What it does

- **SOP Library** — Structured Standard Operating Procedures organised by team and category. Authors write SOPs, approvers review them, agents read them.
- **Training & Quizzes** — AI-generated quizzes attached to SOPs. Admins assign quizzes to agents with due dates. Pass mark is 80%.
- **Analytics Dashboard** — Score distributions, team completion rates, topic failure analysis, and per-agent performance stats.

---

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Database & Auth:** Supabase (PostgreSQL)
- **Styling:** Tailwind CSS
- **Hosting:** Vercel
- **Email:** Gmail SMTP via Nodemailer
- **Charts:** Recharts
- **Rich text:** Tiptap

---

## Getting Started (Local Development)

### 1. Clone the repo

```bash
git clone https://github.com/Hospiria/hospiria-kb.git
cd hospiria-kb
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Create a `.env.local` file in the root:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
SMTP_USER=hospiria.training@gmail.com
SMTP_PASS=your_gmail_app_password
TEAMS_WEBHOOK_URL=your_teams_webhook_url
CRON_SECRET=your_cron_secret
```

### 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## User Roles

| Role | Access |
|---|---|
| `super_admin` | Full access — all SOPs, users, admin panel, analytics |
| `approver` | Reviews and approves/rejects submitted SOPs |
| `team_leader` | Own team's SOPs only |
| `junior_team_leader` | Own team's SOPs only |
| `agent` | Reads live SOPs for their team, completes assigned quizzes |

---

## Deployment

The app auto-deploys to Vercel on every push to `main`.

```bash
git add -A
git commit -m "Your change"
git push origin main
```

---

## Project Structure

```
src/
├── app/
│   ├── (app)/          # Authenticated pages (dashboard, SOPs, quizzes, admin)
│   ├── api/            # API routes (enrolments, invites, cron jobs)
│   ├── auth/           # Auth callback + set-password page
│   └── login/          # Login page
├── components/
│   ├── admin/          # Admin UI (dashboard, user management, quiz management)
│   ├── layout/         # Sidebar, Topbar
│   ├── sops/           # SOP editor, viewer, approval workflow
│   └── quizzes/        # Quiz taker
├── lib/
│   ├── supabase/       # Supabase clients (server + client)
│   ├── notifications/  # Email (Gmail SMTP) + Teams webhook
│   └── utils.ts        # Helpers
└── types/index.ts      # TypeScript types
```

---

## Full Handover Documentation

For a complete handover guide covering environment variables, database schema, known issues, and operational instructions, see [HANDOVER.md](./HANDOVER.md).

---

## License

Private — Hospiria internal use only.
