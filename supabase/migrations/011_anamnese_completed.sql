alter table public.users
  add column if not exists anamnese_completed boolean not null default false;

-- Backfill: alunos que já têm anamnese preenchida
update public.users u
set anamnese_completed = true
from public.students s
join public.anamnese a on a.student_id = s.id
where s.user_id = u.id
  and a.completed = true;
