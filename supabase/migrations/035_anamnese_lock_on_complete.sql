drop policy "anamnese: própria" on public.anamnese;

create policy "anamnese: própria select" on public.anamnese
  for select using (student_id = public.get_my_student_id());

create policy "anamnese: própria insert" on public.anamnese
  for insert with check (student_id = public.get_my_student_id());

create policy "anamnese: própria update" on public.anamnese
  for update using (student_id = public.get_my_student_id() and completed = false);
