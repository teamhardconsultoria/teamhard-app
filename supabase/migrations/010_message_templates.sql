create table public.message_templates (
  id         uuid primary key default gen_random_uuid(),
  coach_id   uuid not null references public.coaches(id) on delete cascade,
  type       text not null check (type in ('welcome', 'workout_assigned', 'diet_assigned', 'payment_pending')),
  content    text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (coach_id, type)
);

alter table public.message_templates enable row level security;

create policy "coaches_manage_own_templates"
  on public.message_templates
  for all
  using (
    coach_id in (select id from public.coaches where user_id = auth.uid())
  )
  with check (
    coach_id in (select id from public.coaches where user_id = auth.uid())
  );
