-- Permite que o aluno atualize sua própria anamnese mesmo após completed = true
drop policy if exists "anamnese: própria update" on public.anamnese;

create policy "anamnese: própria update" on public.anamnese
  for update using (student_id = public.get_my_student_id());
