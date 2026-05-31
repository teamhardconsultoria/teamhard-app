create table public.subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  student_id            uuid not null references public.students(id) on delete cascade,
  asaas_subscription_id text unique,
  billing_type          text not null,
  cycle                 text not null,
  amount                numeric not null,
  next_due_date         date,
  status                text not null default 'active',
  payment_link          text,
  created_at            timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

create policy "subscriptions: coach" on public.subscriptions
  for all using (public.is_my_student(student_id));

create policy "subscriptions: aluno" on public.subscriptions
  for select using (student_id = public.get_my_student_id());
