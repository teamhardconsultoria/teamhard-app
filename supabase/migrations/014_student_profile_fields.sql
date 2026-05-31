-- Add profile fields to students table populated from anamnese/initial assessment
alter table public.students
  add column if not exists birth_date   date,
  add column if not exists height       numeric(5,1),
  add column if not exists initial_weight numeric(5,1);
