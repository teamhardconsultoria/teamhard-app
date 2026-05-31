alter table public.students
  add column if not exists assessment_scheduled_date date;
