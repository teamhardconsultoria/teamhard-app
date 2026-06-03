do $$
begin
  if not exists (select 1 from pg_type where typname = 'lead_status') then
    create type lead_status as enum ('new', 'contacted', 'interested', 'converted', 'lost');
  end if;
  if not exists (select 1 from pg_type where typname = 'lead_source') then
    create type lead_source as enum ('instagram', 'referral', 'whatsapp', 'website', 'other');
  end if;
end $$;

create table if not exists public.leads (
  id                   uuid primary key default uuid_generate_v4(),
  coach_id             uuid not null references public.coaches(id) on delete cascade,
  name                 text not null,
  phone                text,
  email                text,
  source               lead_source,
  status               lead_status not null default 'new',
  notes                text,
  next_contact_at      date,
  converted_student_id uuid references public.students(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.leads enable row level security;

drop policy if exists "coaches_manage_own_leads" on public.leads;
create policy "coaches_manage_own_leads"
  on public.leads
  for all
  using (coach_id = (select id from public.coaches where user_id = auth.uid()))
  with check (coach_id = (select id from public.coaches where user_id = auth.uid()));

drop trigger if exists trg_leads_updated_at on public.leads;
create trigger trg_leads_updated_at
  before update on public.leads
  for each row execute function public.handle_updated_at();
