-- ================================================================
-- 047: Biblioteca de Alimentos (food_library)
-- ================================================================

create table public.food_library (
  id                uuid primary key default uuid_generate_v4(),
  name              text not null,
  category          text not null default 'outros',
  calories_per_100g numeric(7,2) not null,
  protein_per_100g  numeric(6,2) not null default 0,
  carbs_per_100g    numeric(6,2) not null default 0,
  fat_per_100g      numeric(6,2) not null default 0,
  active            boolean not null default true,
  created_by        uuid references public.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.food_library enable row level security;

-- Todos os usuários autenticados leem alimentos ativos
create policy "food_library: todos leem ativos" on public.food_library
  for select using (active = true);

-- Super admin gerencia tudo (inclusive inativos)
create policy "food_library: super_admin gerencia" on public.food_library
  for all using (public.get_my_role() = 'super_admin');

create trigger trg_food_library_updated_at
  before update on public.food_library
  for each row execute function public.handle_updated_at();

create index idx_food_library_name on public.food_library (lower(name));
create index idx_food_library_category on public.food_library (category);
