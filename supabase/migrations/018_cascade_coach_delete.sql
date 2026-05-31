-- Adiciona ON DELETE CASCADE nas FKs que bloqueiam a exclusão de coaches
-- Problema: ao excluir auth.users → public.users → coaches, várias tabelas
-- sem CASCADE impediam a operação com "Database error deleting user"

-- ── FKs diretas em coaches.id sem CASCADE ──────────────────────────

alter table public.students
  drop constraint if exists students_coach_id_fkey;
alter table public.students
  add constraint students_coach_id_fkey
  foreign key (coach_id) references public.coaches(id) on delete cascade;

alter table public.exercise_requests
  drop constraint if exists exercise_requests_coach_id_fkey;
alter table public.exercise_requests
  add constraint exercise_requests_coach_id_fkey
  foreign key (coach_id) references public.coaches(id) on delete cascade;

alter table public.workouts
  drop constraint if exists workouts_coach_id_fkey;
alter table public.workouts
  add constraint workouts_coach_id_fkey
  foreign key (coach_id) references public.coaches(id) on delete cascade;

alter table public.diets
  drop constraint if exists diets_coach_id_fkey;
alter table public.diets
  add constraint diets_coach_id_fkey
  foreign key (coach_id) references public.coaches(id) on delete cascade;

alter table public.assessments
  drop constraint if exists assessments_coach_id_fkey;
alter table public.assessments
  add constraint assessments_coach_id_fkey
  foreign key (coach_id) references public.coaches(id) on delete cascade;

alter table public.activity_logs
  drop constraint if exists activity_logs_coach_id_fkey;
alter table public.activity_logs
  add constraint activity_logs_coach_id_fkey
  foreign key (coach_id) references public.coaches(id) on delete cascade;

-- ── Tabelas descendentes sem CASCADE que são atingidas pela cadeia ──

-- Ao deletar workouts → workout_days → training_sessions (sem cascade no workout_day_id)
alter table public.training_sessions
  drop constraint if exists training_sessions_workout_day_id_fkey;
alter table public.training_sessions
  add constraint training_sessions_workout_day_id_fkey
  foreign key (workout_day_id) references public.workout_days(id) on delete cascade;

-- Ao deletar diets → diet_days → diet_logs (sem cascade no diet_day_id)
alter table public.diet_logs
  drop constraint if exists diet_logs_diet_day_id_fkey;
alter table public.diet_logs
  add constraint diet_logs_diet_day_id_fkey
  foreign key (diet_day_id) references public.diet_days(id) on delete cascade;

-- Ao deletar questionnaires → questionnaire_responses (sem cascade no questionnaire_id)
alter table public.questionnaire_responses
  drop constraint if exists questionnaire_responses_questionnaire_id_fkey;
alter table public.questionnaire_responses
  add constraint questionnaire_responses_questionnaire_id_fkey
  foreign key (questionnaire_id) references public.questionnaires(id) on delete cascade;

-- ── messages referencia users.id sem CASCADE ──────────────────────

alter table public.messages
  drop constraint if exists messages_sender_id_fkey;
alter table public.messages
  add constraint messages_sender_id_fkey
  foreign key (sender_id) references public.users(id) on delete cascade;

alter table public.messages
  drop constraint if exists messages_receiver_id_fkey;
alter table public.messages
  add constraint messages_receiver_id_fkey
  foreign key (receiver_id) references public.users(id) on delete cascade;
