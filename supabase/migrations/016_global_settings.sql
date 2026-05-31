-- Tabela singleton de configurações globais
create table if not exists public.global_settings (
  id                         integer primary key default 1,
  constraint singleton       check (id = 1),

  -- Avaliações
  assessment_frequency_weeks integer not null default 8,
  assessment_warning_days    integer not null default 7,

  -- Pagamentos
  payment_tolerance_days     integer not null default 3,

  -- Metadados
  updated_at                 timestamptz default now(),
  updated_by                 uuid references public.users(id)
);

-- Linha padrão
insert into public.global_settings (id)
values (1)
on conflict (id) do nothing;

-- RLS
alter table public.global_settings enable row level security;

create policy "Autenticados leem configurações"
  on public.global_settings for select
  to authenticated using (true);

create policy "Super admin edita configurações"
  on public.global_settings for update
  to authenticated
  using (
    exists (select 1 from public.users where id = auth.uid() and role = 'super_admin')
  )
  with check (
    exists (select 1 from public.users where id = auth.uid() and role = 'super_admin')
  );
