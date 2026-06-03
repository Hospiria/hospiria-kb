# Hospiria KB — Project Conventions

Internal SOP/knowledge-base app. Next.js 14 App Router + React + Tailwind + Supabase + Anthropic.

## ‼️ Permissions catalogue — keep it in sync

There is a feature-level permission system (`src/lib/permissions.ts`, tables
`role_permissions` / `user_permissions`, admin UI under **Users & Permissions**).

**Whenever you add a new feature, page, or admin area to the app, you MUST add a
row to the `FEATURES` catalogue in `src/lib/permissions.ts` and set its defaults
in `DEFAULT_ROLE_PERMISSIONS`.** A feature not listed there is invisible to the
permission system and can't be granted or restricted. This is a standing
requirement from the product owner — do it every time, in the same change.

Enforcement is phased: Phase 1 = config only (catalogue + admin UI, behaviour
preserving). Phase 2 = server route guards. Phase 3 = database RLS via a
`has_perm()` function. Seed/code defaults must always reproduce current access.

## Supabase

- **Migrations are run MANUALLY by the user** in the Supabase SQL editor. Add a
  numbered file under `supabase/migrations/` AND paste the SQL inline in chat so
  they can run it. The user has no Vercel/dashboard automation access.
- **`createAdminClient()` does NOT bypass RLS** — it's the `@supabase/ssr` server
  client and attaches the user's cookies, so DB queries run as that user. For
  admin writes that must bypass RLS, use **`createServiceClient()`** (plain
  service-role client, no cookies) from `src/lib/supabase/server.ts`.
- New tables need RLS policies that actually permit the intended writers (mirror
  `sop_companies`: authenticated read, author/admin write). Don't assume the
  "admin" client bypasses RLS.

## Build / verify gates

- No test runner. Gates are `npx tsc --noEmit` (exit 0) and `npx next lint`.
- `npm run build` fails locally only on the `/auth/set-password` prerender
  (missing local Supabase env) — that's environmental, not a code error; it
  builds fine on Vercel.
- Deploys are auto from `main` on Vercel (~1–3 min). The user reviews in prod.

## Roles

Five roles: `super_admin`, `approver`, `team_leader`, `junior_team_leader`,
`agent`. `super_admin` always has full access and can't be restricted. Role
checks historically live in `src/lib/roles.ts` + RLS `get_my_role()`; the
permission system is layering over these.
