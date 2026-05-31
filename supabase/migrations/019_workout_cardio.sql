-- Tabela de cárdio dentro de uma divisão de treino

create table public.workout_cardio (
  id             uuid primary key default uuid_generate_v4(),
  workout_day_id uuid not null references public.workout_days(id) on delete cascade,
  modality       text not null default 'corrida',
  duration_min   integer not null check (duration_min > 0),
  intensity      text not null default 'moderada' check (intensity in ('leve', 'moderada', 'intensa')),
  distance_km    numeric(6,2),
  notes          text,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now()
);

alter table public.workout_cardio enable row level security;

create policy "workout_cardio: super_admin" on public.workout_cardio
  for all using (public.get_my_role() = 'super_admin');

create policy "workout_cardio: coach e aluno" on public.workout_cardio
  for all using (
    workout_day_id in (
      select wd.id from public.workout_days wd
      join public.workouts w on w.id = wd.workout_id
      where w.coach_id = public.get_my_coach_id()
      or w.student_id = public.get_my_student_id()
    )
  );
