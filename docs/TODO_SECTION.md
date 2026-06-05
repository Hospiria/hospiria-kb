# To-do Section — Current State & Upgrade Notes

> A reference for thinking through how to evolve the To-do section of the Hospiria KB app. Covers what exists today, how it's built, current limitations, and open ideas. **Scope: the To-do section only** (`/todos`), not Notes.

---

## 1. What it does today

The To-do section is a table-style task manager with smart views and user-created lists, available at **`/todos`**. It supports personal tasks and team-shared tasks (via a space switcher), recurring routines, custom statuses, priorities, due dates, assignees, comments, and a trash with restore/empty.

### Spaces
- **Personal** — only you see these (unless assigned to someone).
- **Team spaces** — one per team you belong to; everyone on the team sees and edits.
- A pill switcher at the top toggles between Personal and each team.

### Views (smart, computed)
Left sidebar "Views" section:
- **All tasks** — everything (templates + one-off tasks; generated recurrence instances are hidden).
- **Today** — one-off tasks due today or overdue, not done.
- **Daily** — recurring daily templates.
- **Weekly** — recurring weekly templates.

Each view shows a live open-task count.

### Custom lists (user-created)
Left sidebar "My Lists" section:
- Create lists inline (+ button), rename, delete (deleting detaches tasks → they fall back to All).
- Lists are personal or team-scoped depending on the active space.
- Each list shows an open-task count and a colour dot.
- Selecting a list filters the table to that list; new tasks added while a list is selected go into it.

### The task table
Columns: **drag handle · checkbox · title · status · priority · due · assignee · comments · delete**
- **Checkbox** — toggle done (uses the configured done status).
- **Title** — click to expand an inline editor (list, team, details, link to comments).
- **Status** — coloured pill; click opens a status picker (custom statuses from `/admin/statuses`).
- **Priority** — flag icon; click opens High/Medium/Low picker.
- **Due** — click opens an inline date picker; shows "+ date" when empty; red when overdue.
- **Assignee** — avatar/initials; click opens a searchable people picker to reassign.
- **Comments** — message icon with a count; click opens the comments drawer (right side).
- **Drag handle** — reorder rows; order persists via `position`.
- Completed tasks collapse under a "Completed (n)" section.

### Recurring tasks
- A task can be **one-off**, **daily** (optionally weekdays-only), or **weekly** (pick day of week).
- Recurring tasks are stored as templates; a daily cron (`/api/cron/recurring-todos`) generates instances.
- The schedule shows on the row as a chip: `↻ Daily`, `↻ Weekdays`, `↻ Weekly · Mon`.
- Carry-over tasks (overdue recurring instances) show a red **DUE** badge.

### Adding tasks (Quick-add, top of table)
Two modes via a toggle (AI is default):
- **AI** — type a natural sentence ("remind Sarah to chase the report every Monday — high priority") and the model (`/api/todos/ai`, Claude Haiku) extracts: title, due date, recurrence (+ day/weekdays), priority, and **auto-assigns** when a person is named. A confirmation line shows what it parsed.
- **Manual** — single-line title + Enter; a sliders icon expands the full field set (details, status, priority, recurrence + sub-options, due date, assignee, list).
- New tasks insert **at the top** instantly (optimistic — no full reload) and adopt sensible defaults from the active view/list.

### Comments
- Threaded comments per task (one level of replies), with @mentions.
- Open in a **right-hand drawer** (not inline).
- Row shows a comment count badge.

### Trash
- Soft-delete (tasks move to trash, restorable).
- Collapsible Trash section with **Restore** per item and **Empty trash** (permanent).

---

## 2. How it's built

### Data model (Postgres / Supabase)
- **`todos`** — id, owner_id, assignee_id, team_id, title, detail, due_date, priority (`low|medium|high`), status (text → custom statuses), is_done, completed_at, recurrence (`none|daily|weekly`), recurrence_parent_id, recurrence_day_of_week, recurrence_weekdays_only, **list_id**, **position**, soft-delete (deleted_at, deleted_by), created_at, updated_at.
- **`todo_lists`** — id, owner_id, team_id (null = personal), name, color, icon, position, deleted_at. *(migration 023)*
- **`todo_statuses`** — custom statuses (name, color, is_done, is_default, position). *(migration 014)*
- **`todo_comments`** — todo_id, author_id, parent_id (one level of replies), body, created_at. *(migration 014)*
- **RLS** everywhere: a row is visible to its owner, its assignee, or any member of its team (`has_team_access`). Lists follow the same model.

### API routes
- `GET/POST /api/todos` — list (filtered by space/team/list; ordered `is_done → position → created_at desc`) / create. GET also returns resolved names + **commentCount**.
- `PATCH/DELETE /api/todos/[id]` — edit fields (title, detail, due, priority, assignee, team, list, status) / soft-delete / restore.
- `POST /api/todos/reorder` — bulk position assignment after drag.
- `DELETE /api/todos/trash` — empty trash for a scope.
- `POST /api/todos/ai` — natural-language parse → draft (Claude Haiku, with the people directory for name resolution).
- `GET/POST /api/todos/[id]/comments`, `PATCH/DELETE /api/todo-comments/[id]`.
- `GET/POST /api/todo-lists`, `PATCH/DELETE /api/todo-lists/[id]`.
- `GET /api/todo-statuses` — custom statuses.

### Frontend
- **`/todos/page.tsx`** (server) loads the people directory + accessible teams via `getWorkspaceData()`, renders `TodosClient`.
- **`TodosClient.tsx`** (client) holds all state and the UI: sidebar (views + lists), toolbar (search + filter popover), QuickAdd, TaskTable/TaskRow, pickers (Status, Priority, Assignee, Due), comments drawer, trash.
- Shared atoms/types in `components/notes/workspaceShared.tsx`.
- Most mutations are **optimistic** (update local state immediately, PATCH in the background).

---

## 3. Current limitations / rough edges

- **Sidebar hidden on mobile** (`md:` breakpoint) — no list navigation on phones yet.
- **No sort options** in the UI — order is manual position or insert order; can't sort by due/priority on demand.
- **No grouping inside a view** — e.g. can't group "All" by list, status, or assignee.
- **Reorder is global** — dragging in a filtered view rewrites global positions; could be surprising across views.
- **No bulk actions** — can't multi-select to complete/delete/move/reassign several at once.
- **No subtasks / checklists** within a task (comments table supports one level of replies, but tasks themselves are flat).
- **Recurrence is limited** to daily/weekly; no "every N weeks", monthly, specific dates, or end dates.
- **No due time**, only due date.
- **No attachments** on tasks.
- **No keyboard shortcuts** (e.g. press `n` to add, `e` to edit).
- **Comment counts** refresh only on drawer close / list reload, not real-time.
- **No activity log / audit** of who changed what.
- **No saved filters / custom views** beyond the four built-ins.
- **AI add** is single-task; can't paste a paragraph and create several tasks.

---

## 4. Open ideas to explore

Grouped by theme — use these as prompts for deeper design thinking.

### Organisation & navigation
- Group-by (list / status / assignee / due) and sort-by controls per view.
- Saved/custom smart views with their own filter rules (like ClickUp/Linear).
- A board (Kanban) view by status, alongside the list view.
- A calendar view for due dates.
- Sections/headers within a list (sub-grouping).
- Pin / favourite lists; reorder lists in the sidebar (drag).

### Task richness
- Subtasks / checklists with their own progress.
- Due time + reminders; start date + duration.
- Richer recurrence (every N days/weeks, monthly, specific weekdays, end conditions).
- Attachments and links on a task.
- Labels/tags separate from lists.
- Dependencies ("blocked by").

### Collaboration
- Real-time updates (Supabase Realtime) so team lists sync live.
- Bulk select + bulk actions (complete, delete, move to list, reassign, set due).
- @mention notifications already exist for comments — extend to assignment changes, due-soon, status changes (tie into the Notification Settings hub).
- Activity feed per task.

### Speed & UX
- Command palette / keyboard-first interactions.
- Inline title editing (double-click to rename without expanding).
- Multi-task AI capture (paste notes → many tasks).
- Templates (e.g. "new property onboarding" spawns a checklist).
- Drag tasks between lists in the sidebar.

### Reporting
- Per-person workload view (how many open/overdue each assignee has).
- Completion trends over time.
- Surface team to-do stats on the dashboard (some of this exists for SOPs/quizzes).

---

## 5. Questions worth answering before building more

1. Is the primary use **personal productivity**, **team coordination**, or both equally? (Drives whether board/calendar/workload views matter most.)
2. How important is **real-time team sync** vs. refresh-on-load?
3. Should lists be shareable/assignable as a unit (a "project"), or stay lightweight folders?
4. Do recurring routines need richer schedules, or is daily/weekly enough for ops?
5. Where should task notifications live — in-app only, or also email/Teams via the existing Notification Settings?
6. What's the mobile story — responsive web, or is desktop the main surface?

---

*Generated as a working reference. The implementation lives in `src/components/todos/TodosClient.tsx`, `src/app/(app)/todos/`, and `src/app/api/todos/` + `src/app/api/todo-lists/`.*
