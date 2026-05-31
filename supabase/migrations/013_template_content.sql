-- ================================================================
-- TEAM HARD — Conteúdo de Templates de Treino
-- ================================================================

create table public.template_days (
  id                 uuid primary key default uuid_generate_v4(),
  template_id        uuid not null references public.workout_templates(id) on delete cascade,
  name               text not null,
  weekday_suggestion int[] not null default '{}',
  sort_order         int  not null default 0,
  created_at         timestamptz not null default now()
);

create table public.template_exercises (
  id               uuid primary key default uuid_generate_v4(),
  template_day_id  uuid not null references public.template_days(id) on delete cascade,
  exercise_id      uuid not null references public.exercises(id),
  sets             int  not null default 3,
  reps             text not null default '10-12',
  rest_seconds     int  not null default 60,
  coach_notes      text,
  sort_order       int  not null default 0,
  created_at       timestamptz not null default now()
);

-- RLS
alter table public.template_days enable row level security;
alter table public.template_exercises enable row level security;

create policy "super_admin_all_template_days" on public.template_days
  for all using (exists (select 1 from public.users where id = auth.uid() and role = 'super_admin'));

create policy "coaches_read_template_days" on public.template_days
  for select using (exists (select 1 from public.users where id = auth.uid() and role in ('coach', 'super_admin')));

create policy "super_admin_all_template_exercises" on public.template_exercises
  for all using (exists (select 1 from public.users where id = auth.uid() and role = 'super_admin'));

create policy "coaches_read_template_exercises" on public.template_exercises
  for select using (exists (select 1 from public.users where id = auth.uid() and role in ('coach', 'super_admin')));
