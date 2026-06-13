-- TEAM HARD — Fotos de refeições do aluno

-- Bucket público para fotos de refeições
insert into storage.buckets (id, name, public)
values ('meal-photos', 'meal-photos', true)
on conflict (id) do update set public = true;

create policy "meal_photos: upload autenticado"
  on storage.objects for insert
  with check (bucket_id = 'meal-photos' and auth.role() = 'authenticated');

create policy "meal_photos: update autenticado"
  on storage.objects for update
  using (bucket_id = 'meal-photos' and auth.role() = 'authenticated');

create policy "meal_photos: delete autenticado"
  on storage.objects for delete
  using (bucket_id = 'meal-photos' and auth.role() = 'authenticated');

create policy "meal_photos: leitura pública"
  on storage.objects for select
  using (bucket_id = 'meal-photos');

-- Tabela de fotos por refeição (uma foto por refeição por dia)
create table public.meal_photos (
  id           uuid        primary key default gen_random_uuid(),
  diet_log_id  uuid        not null references public.diet_logs(id) on delete cascade,
  meal_id      uuid        not null references public.meals(id)     on delete cascade,
  photo_url    text        not null,
  created_at   timestamptz not null default now(),
  unique (diet_log_id, meal_id)
);

alter table public.meal_photos enable row level security;

-- Aluno gerencia suas próprias fotos
create policy "meal_photos: student crud"
  on public.meal_photos for all
  using (
    diet_log_id in (
      select id from public.diet_logs
      where student_id in (
        select id from public.students where user_id = auth.uid()
      )
    )
  );

-- Coach pode visualizar fotos dos seus alunos
create policy "meal_photos: coach read"
  on public.meal_photos for select
  using (
    diet_log_id in (
      select dl.id from public.diet_logs dl
      join public.students s  on s.id  = dl.student_id
      join public.coaches  c  on c.id  = s.coach_id
      where c.user_id = auth.uid()
    )
  );
