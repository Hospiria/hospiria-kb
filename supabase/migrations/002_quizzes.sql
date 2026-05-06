-- Quizzes: one per SOP, AI-generated
create table if not exists quizzes (
  id uuid primary key default gen_random_uuid(),
  sop_id uuid references sops(id) on delete cascade not null,
  title text not null,
  questions jsonb not null default '[]',
  pass_mark integer not null default 80,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz default now()
);
create unique index if not exists quizzes_sop_id_key on quizzes(sop_id);

-- Quiz enrollments: per user per quiz
create table if not exists quiz_enrollments (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid references quizzes(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  enrolled_by uuid references profiles(id),
  due_date timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'passed', 'failed')),
  score integer check (score >= 0 and score <= 100),
  enrolled_at timestamptz default now(),
  completed_at timestamptz
);

-- Quiz attempts: each submission by a user
create table if not exists quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid references quiz_enrollments(id) on delete cascade not null,
  answers jsonb not null default '{}',
  score integer not null check (score >= 0 and score <= 100),
  passed boolean not null,
  completed_at timestamptz default now()
);

-- RLS
alter table quizzes enable row level security;
alter table quiz_enrollments enable row level security;
alter table quiz_attempts enable row level security;

-- Quizzes: all authenticated users can read; only super_admin can write
create policy "quizzes_select" on quizzes for select to authenticated using (true);
create policy "quizzes_insert" on quizzes for insert to authenticated with check (get_my_role() = 'super_admin');
create policy "quizzes_update" on quizzes for update to authenticated using (get_my_role() = 'super_admin');
create policy "quizzes_delete" on quizzes for delete to authenticated using (get_my_role() = 'super_admin');

-- Enrollments: users see their own; super_admin sees all
create policy "enrollments_select" on quiz_enrollments for select to authenticated
  using (user_id = auth.uid() or get_my_role() = 'super_admin');
create policy "enrollments_insert" on quiz_enrollments for insert to authenticated
  with check (get_my_role() = 'super_admin');
create policy "enrollments_update" on quiz_enrollments for update to authenticated
  using (get_my_role() = 'super_admin' or user_id = auth.uid());
create policy "enrollments_delete" on quiz_enrollments for delete to authenticated
  using (get_my_role() = 'super_admin');

-- Attempts: users see their own; super_admin sees all; users can insert for own enrollments
create policy "attempts_select" on quiz_attempts for select to authenticated
  using (
    get_my_role() = 'super_admin' or
    enrollment_id in (select id from quiz_enrollments where user_id = auth.uid())
  );
create policy "attempts_insert" on quiz_attempts for insert to authenticated
  with check (
    enrollment_id in (select id from quiz_enrollments where user_id = auth.uid())
  );
