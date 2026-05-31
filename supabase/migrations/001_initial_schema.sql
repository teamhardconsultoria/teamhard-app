-- ================================================================
-- TEAM HARD — Schema Inicial do Banco de Dados
-- PostgreSQL via Supabase
-- ================================================================

-- Extensões
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ================================================================
-- ENUMS
-- ================================================================

create type user_role as enum ('super_admin', 'coach', 'student');
create type plan_type as enum ('monthly', 'quarterly', 'semiannual', 'annual');
create type payment_status as enum ('active', 'pending', 'overdue', 'blocked');
create type message_type as enum ('text', 'audio', 'photo', 'video');
create type assessment_angle as enum ('front', 'left', 'right', 'back');
create type recurrence_type as enum ('once', 'daily', 'weekly', 'monthly');
create type exercise_request_status as enum ('pending', 'approved', 'rejected');
create type activity_factor as enum ('sedentary', 'light', 'moderate', 'intense', 'very_intense');
create type fitness_level as enum ('beginner', 'intermediate', 'advanced');

-- ================================================================
-- TABELA: users (estende auth.users do Supabase)
-- ================================================================

create table public.users (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null unique,
  role         user_role not null default 'student',
  name         text not null,
  phone        text,
  avatar_url   text,
  first_login  boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ================================================================
-- TABELA: coaches
-- ================================================================

create table public.coaches (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null unique references public.users(id) on delete cascade,
  bio          text,
  created_by   uuid references public.users(id),
  created_at   timestamptz not null default now()
);

-- ================================================================
-- TABELA: students
-- ================================================================

create table public.students (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null unique references public.users(id) on delete cascade,
  coach_id          uuid not null references public.coaches(id),
  plan_type         plan_type not null default 'monthly',
  plan_start        date not null default current_date,
  plan_end          date not null,
  payment_status    payment_status not null default 'active',
  access_blocked    boolean not null default false,
  asaas_customer_id text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ================================================================
-- TABELA: anamnese
-- ================================================================

create table public.anamnese (
  id                     uuid primary key default uuid_generate_v4(),
  student_id             uuid not null unique references public.students(id) on delete cascade,
  -- Bloco A
  full_name              text not null,
  birth_date             date not null,
  biological_sex         text not null check (biological_sex in ('male', 'female')),
  city                   text,
  country                text,
  profession             text,
  -- Bloco B
  goal                   text not null,
  current_weight         numeric(5,2) not null,
  height                 numeric(5,1) not null,
  desired_weight         numeric(5,2),
  goal_months            integer,
  -- Bloco C
  has_disease            boolean not null default false,
  disease_description    text,
  uses_medication        boolean not null default false,
  medication_description text,
  has_injury             boolean not null default false,
  injury_description     text,
  has_limitation         boolean not null default false,
  limitation_description text,
  is_pregnant            boolean,
  -- Bloco D
  has_allergy            boolean not null default false,
  allergy_description    text,
  food_restrictions      text,
  meals_per_day          integer check (meals_per_day between 1 and 8),
  water_liters           numeric(3,1),
  alcohol_consumption    text check (alcohol_consumption in ('none', 'rarely', '1_2_week', '3_plus_week')),
  -- Bloco E
  sleep_hours            numeric(3,1) check (sleep_hours between 3 and 12),
  stress_level           integer check (stress_level between 1 and 5),
  work_type              text check (work_type in ('sedentary', 'light', 'moderate', 'intense')),
  has_busy_routine       boolean,
  preferred_workout_time text check (preferred_workout_time in ('morning', 'afternoon', 'evening', 'variable')),
  -- Bloco F
  gym_experience         text check (gym_experience in ('never', 'less_6mo', '6mo_2yr', 'more_2yr')),
  practices_sport        boolean not null default false,
  sport_description      text,
  fitness_level          text check (fitness_level in ('beginner', 'intermediate', 'advanced')),
  -- Calculados
  tmb                    numeric(8,2),
  get_value              numeric(8,2),
  activity_factor        numeric(4,3) default 1.2,
  -- Controle
  completed              boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- ================================================================
-- TABELA: exercises (biblioteca — gerenciada pelo super_admin)
-- ================================================================

create table public.exercises (
  id           uuid primary key default uuid_generate_v4(),
  name         text not null,
  muscle_groups text[] not null default '{}',
  youtube_url  text,
  instructions text,
  equipment    text,
  created_by   uuid not null references public.users(id),
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ================================================================
-- TABELA: exercise_requests (coaches solicitam novos exercícios)
-- ================================================================

create table public.exercise_requests (
  id              uuid primary key default uuid_generate_v4(),
  coach_id        uuid not null references public.coaches(id),
  exercise_name   text not null,
  youtube_url     text,
  notes           text,
  status          exercise_request_status not null default 'pending',
  reviewed_by     uuid references public.users(id),
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now()
);

-- ================================================================
-- TABELA: workout_templates (criados pelo super_admin)
-- ================================================================

create table public.workout_templates (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  description text,
  created_by  uuid not null references public.users(id),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ================================================================
-- TABELA: workouts (treino de um aluno específico)
-- ================================================================

create table public.workouts (
  id                   uuid primary key default uuid_generate_v4(),
  student_id           uuid not null references public.students(id) on delete cascade,
  coach_id             uuid not null references public.coaches(id),
  name                 text not null,
  valid_from           date not null,
  valid_to             date not null,
  based_on_template_id uuid references public.workout_templates(id),
  active               boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ================================================================
-- TABELA: workout_days (divisões A, B, C...)
-- ================================================================

create table public.workout_days (
  id               uuid primary key default uuid_generate_v4(),
  workout_id       uuid not null references public.workouts(id) on delete cascade,
  name             text not null,
  weekday_suggestion integer[] default '{}',
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now()
);

-- ================================================================
-- TABELA: workout_exercises (exercícios dentro de uma divisão)
-- ================================================================

create table public.workout_exercises (
  id             uuid primary key default uuid_generate_v4(),
  workout_day_id uuid not null references public.workout_days(id) on delete cascade,
  exercise_id    uuid not null references public.exercises(id),
  sets           integer not null,
  reps           text not null,
  rest_seconds   integer default 60,
  coach_notes    text,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now()
);

-- ================================================================
-- TABELA: training_sessions (execuções de treino)
-- ================================================================

create table public.training_sessions (
  id              uuid primary key default uuid_generate_v4(),
  student_id      uuid not null references public.students(id) on delete cascade,
  workout_day_id  uuid not null references public.workout_days(id),
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  paused          boolean not null default false,
  paused_at       timestamptz,
  duration_seconds integer,
  created_at      timestamptz not null default now()
);

-- ================================================================
-- TABELA: session_sets (séries registradas pelo aluno)
-- ================================================================

create table public.session_sets (
  id              uuid primary key default uuid_generate_v4(),
  session_id      uuid not null references public.training_sessions(id) on delete cascade,
  exercise_id     uuid not null references public.exercises(id),
  set_number      integer not null,
  weight_used     numeric(6,2),
  reps_done       integer,
  completed_at    timestamptz not null default now()
);

-- ================================================================
-- TABELA: training_feedbacks (feedback após o treino)
-- ================================================================

create table public.training_feedbacks (
  id                       uuid primary key default uuid_generate_v4(),
  session_id               uuid not null unique references public.training_sessions(id) on delete cascade,
  student_id               uuid not null references public.students(id) on delete cascade,
  fatigue_level            integer not null check (fatigue_level between 1 and 5),
  has_pain                 boolean not null default false,
  pain_description         text,
  notes                    text,
  difficult_exercise_id    uuid references public.exercises(id),
  difficult_exercise_notes text,
  read_by_coach            boolean not null default false,
  created_at               timestamptz not null default now()
);

-- ================================================================
-- TABELA: diets
-- ================================================================

create table public.diets (
  id         uuid primary key default uuid_generate_v4(),
  student_id uuid not null references public.students(id) on delete cascade,
  coach_id   uuid not null references public.coaches(id),
  name       text not null,
  valid_from date not null,
  valid_to   date not null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ================================================================
-- TABELA: diet_days (dias dentro de uma dieta)
-- ================================================================

create table public.diet_days (
  id         uuid primary key default uuid_generate_v4(),
  diet_id    uuid not null references public.diets(id) on delete cascade,
  label      text not null,
  weekday    integer[] default '{}',
  sort_order integer not null default 0,
  calorie_goal numeric(7,2),
  protein_goal numeric(6,2),
  carbs_goal   numeric(6,2),
  fat_goal     numeric(6,2),
  created_at timestamptz not null default now()
);

-- ================================================================
-- TABELA: meals (refeições dentro de um dia)
-- ================================================================

create table public.meals (
  id             uuid primary key default uuid_generate_v4(),
  diet_day_id    uuid not null references public.diet_days(id) on delete cascade,
  name           text not null,
  suggested_time time,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now()
);

-- ================================================================
-- TABELA: meal_foods (alimentos de cada refeição)
-- ================================================================

create table public.meal_foods (
  id          uuid primary key default uuid_generate_v4(),
  meal_id     uuid not null references public.meals(id) on delete cascade,
  name        text not null,
  quantity    numeric(8,2) not null,
  unit        text not null default 'g',
  calories    numeric(7,2) not null default 0,
  protein     numeric(6,2) not null default 0,
  carbs       numeric(6,2) not null default 0,
  fat         numeric(6,2) not null default 0,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

-- ================================================================
-- TABELA: diet_logs (log diário de dieta do aluno)
-- ================================================================

create table public.diet_logs (
  id          uuid primary key default uuid_generate_v4(),
  student_id  uuid not null references public.students(id) on delete cascade,
  diet_day_id uuid not null references public.diet_days(id),
  date        date not null default current_date,
  meal_notes  jsonb default '{}',
  created_at  timestamptz not null default now(),
  unique (student_id, diet_day_id, date)
);

-- ================================================================
-- TABELA: food_checks (checkboxes de alimentos consumidos)
-- ================================================================

create table public.food_checks (
  id           uuid primary key default uuid_generate_v4(),
  diet_log_id  uuid not null references public.diet_logs(id) on delete cascade,
  meal_food_id uuid not null references public.meal_foods(id) on delete cascade,
  checked      boolean not null default false,
  checked_at   timestamptz,
  unique (diet_log_id, meal_food_id)
);

-- ================================================================
-- TABELA: messages (chat individual coach ↔ aluno)
-- ================================================================

create table public.messages (
  id          uuid primary key default uuid_generate_v4(),
  sender_id   uuid not null references public.users(id),
  receiver_id uuid not null references public.users(id),
  content     text,
  type        message_type not null default 'text',
  file_url    text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index idx_messages_conversation on public.messages (
  least(sender_id::text, receiver_id::text),
  greatest(sender_id::text, receiver_id::text),
  created_at desc
);

-- ================================================================
-- TABELA: auto_messages (mensagens automáticas do coach)
-- ================================================================

create table public.auto_messages (
  id                uuid primary key default uuid_generate_v4(),
  coach_id          uuid not null references public.coaches(id) on delete cascade,
  message           text not null,
  trigger_type      text not null,
  scheduled_date    date,
  send_time         time,
  recurrence        recurrence_type not null default 'once',
  target_group      text not null default 'all',
  target_student_id uuid references public.students(id),
  active            boolean not null default true,
  last_sent_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ================================================================
-- TABELA: assessments (avaliações físicas)
-- ================================================================

create table public.assessments (
  id            uuid primary key default uuid_generate_v4(),
  student_id    uuid not null references public.students(id) on delete cascade,
  coach_id      uuid not null references public.coaches(id),
  weight        numeric(5,2) not null,
  height        numeric(5,1) not null,
  body_fat_pct  numeric(4,2),
  notes         text,
  read_by_coach boolean not null default false,
  created_at    timestamptz not null default now()
);

-- ================================================================
-- TABELA: assessment_photos
-- ================================================================

create table public.assessment_photos (
  id            uuid primary key default uuid_generate_v4(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  angle         assessment_angle not null,
  photo_url     text not null,
  created_at    timestamptz not null default now()
);

-- ================================================================
-- TABELA: questionnaires
-- ================================================================

create table public.questionnaires (
  id         uuid primary key default uuid_generate_v4(),
  coach_id   uuid not null references public.coaches(id) on delete cascade,
  title      text not null,
  questions  jsonb not null default '[]',
  created_at timestamptz not null default now()
);

-- ================================================================
-- TABELA: questionnaire_assignments (envio para alunos)
-- ================================================================

create table public.questionnaire_assignments (
  id                uuid primary key default uuid_generate_v4(),
  questionnaire_id  uuid not null references public.questionnaires(id) on delete cascade,
  student_id        uuid not null references public.students(id) on delete cascade,
  due_date          date,
  created_at        timestamptz not null default now(),
  unique (questionnaire_id, student_id)
);

-- ================================================================
-- TABELA: questionnaire_responses
-- ================================================================

create table public.questionnaire_responses (
  id               uuid primary key default uuid_generate_v4(),
  questionnaire_id uuid not null references public.questionnaires(id),
  student_id       uuid not null references public.students(id) on delete cascade,
  answers          jsonb not null default '{}',
  submitted_at     timestamptz not null default now()
);

-- ================================================================
-- TABELA: payments (histórico via Asaas)
-- ================================================================

create table public.payments (
  id               uuid primary key default uuid_generate_v4(),
  student_id       uuid not null references public.students(id) on delete cascade,
  asaas_charge_id  text unique,
  amount           numeric(10,2) not null,
  status           text not null default 'pending',
  payment_method   text,
  due_date         date not null,
  paid_at          timestamptz,
  plan_type        plan_type not null,
  created_at       timestamptz not null default now()
);

-- ================================================================
-- TABELA: receipts
-- ================================================================

create table public.receipts (
  id           uuid primary key default uuid_generate_v4(),
  payment_id   uuid not null unique references public.payments(id) on delete cascade,
  pdf_url      text,
  generated_at timestamptz not null default now()
);

-- ================================================================
-- TABELA: activity_logs (log de ações dos coaches)
-- ================================================================

create table public.activity_logs (
  id                uuid primary key default uuid_generate_v4(),
  coach_id          uuid not null references public.coaches(id),
  action_type       text not null,
  target_student_id uuid references public.students(id),
  details           jsonb default '{}',
  created_at        timestamptz not null default now()
);

-- ================================================================
-- TRIGGERS
-- ================================================================

-- Trigger: atualiza updated_at automaticamente
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_users_updated_at
  before update on public.users
  for each row execute function public.handle_updated_at();

create trigger trg_students_updated_at
  before update on public.students
  for each row execute function public.handle_updated_at();

create trigger trg_anamnese_updated_at
  before update on public.anamnese
  for each row execute function public.handle_updated_at();

create trigger trg_workouts_updated_at
  before update on public.workouts
  for each row execute function public.handle_updated_at();

create trigger trg_diets_updated_at
  before update on public.diets
  for each row execute function public.handle_updated_at();

-- Trigger: calcula TMB e GET automaticamente quando anamnese é atualizada
create or replace function public.calculate_tmb_get()
returns trigger language plpgsql as $$
declare
  v_age integer;
  v_tmb numeric;
begin
  -- Calcula idade
  v_age := date_part('year', age(new.birth_date));

  -- Fórmula Mifflin-St Jeor
  if new.biological_sex = 'male' then
    v_tmb := (10 * new.current_weight) + (6.25 * new.height) - (5 * v_age) + 5;
  else
    v_tmb := (10 * new.current_weight) + (6.25 * new.height) - (5 * v_age) - 161;
  end if;

  new.tmb := round(v_tmb, 2);
  new.get_value := round(v_tmb * coalesce(new.activity_factor, 1.2), 2);

  return new;
end;
$$;

create trigger trg_calculate_tmb
  before insert or update of current_weight, height, birth_date, biological_sex, activity_factor
  on public.anamnese
  for each row execute function public.calculate_tmb_get();

-- Trigger: bloqueia aluno automaticamente após 3 dias de inadimplência
create or replace function public.check_payment_block()
returns trigger language plpgsql as $$
begin
  if new.plan_end < current_date - interval '3 days' then
    new.payment_status := 'blocked';
    new.access_blocked := true;
  end if;
  return new;
end;
$$;

create trigger trg_payment_block
  before update of plan_end on public.students
  for each row execute function public.check_payment_block();

-- Trigger: cria registro em public.users após cadastro no Supabase Auth
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'student')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ================================================================
-- ROW LEVEL SECURITY (RLS)
-- ================================================================

alter table public.users enable row level security;
alter table public.coaches enable row level security;
alter table public.students enable row level security;
alter table public.anamnese enable row level security;
alter table public.exercises enable row level security;
alter table public.exercise_requests enable row level security;
alter table public.workout_templates enable row level security;
alter table public.workouts enable row level security;
alter table public.workout_days enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.training_sessions enable row level security;
alter table public.session_sets enable row level security;
alter table public.training_feedbacks enable row level security;
alter table public.diets enable row level security;
alter table public.diet_days enable row level security;
alter table public.meals enable row level security;
alter table public.meal_foods enable row level security;
alter table public.diet_logs enable row level security;
alter table public.food_checks enable row level security;
alter table public.messages enable row level security;
alter table public.auto_messages enable row level security;
alter table public.assessments enable row level security;
alter table public.assessment_photos enable row level security;
alter table public.questionnaires enable row level security;
alter table public.questionnaire_assignments enable row level security;
alter table public.questionnaire_responses enable row level security;
alter table public.payments enable row level security;
alter table public.receipts enable row level security;
alter table public.activity_logs enable row level security;

-- Helper functions para RLS
create or replace function public.get_my_role()
returns user_role language sql security definer stable as $$
  select role from public.users where id = auth.uid()
$$;

create or replace function public.get_my_coach_id()
returns uuid language sql security definer stable as $$
  select id from public.coaches where user_id = auth.uid()
$$;

create or replace function public.get_my_student_id()
returns uuid language sql security definer stable as $$
  select id from public.students where user_id = auth.uid()
$$;

create or replace function public.is_my_student(p_student_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.students
    where id = p_student_id
    and coach_id = public.get_my_coach_id()
  )
$$;

-- RLS: users
create policy "users: próprio registro" on public.users
  for all using (id = auth.uid());

create policy "users: coach vê alunos" on public.users
  for select using (
    public.get_my_role() = 'coach'
    and id in (
      select user_id from public.students
      where coach_id = public.get_my_coach_id()
    )
  );

create policy "users: super_admin vê tudo" on public.users
  for all using (public.get_my_role() = 'super_admin');

-- RLS: coaches
create policy "coaches: super_admin gerencia" on public.coaches
  for all using (public.get_my_role() = 'super_admin');

create policy "coaches: coach vê próprio" on public.coaches
  for select using (user_id = auth.uid());

create policy "coaches: aluno vê coach dele" on public.coaches
  for select using (
    id in (
      select coach_id from public.students
      where user_id = auth.uid()
    )
  );

-- RLS: students
create policy "students: super_admin gerencia" on public.students
  for all using (public.get_my_role() = 'super_admin');

create policy "students: coach vê e edita os seus" on public.students
  for all using (coach_id = public.get_my_coach_id());

create policy "students: aluno vê próprio" on public.students
  for select using (user_id = auth.uid());

-- RLS: anamnese
create policy "anamnese: super_admin" on public.anamnese
  for all using (public.get_my_role() = 'super_admin');

create policy "anamnese: coach do aluno" on public.anamnese
  for all using (public.is_my_student(student_id));

create policy "anamnese: própria" on public.anamnese
  for all using (student_id = public.get_my_student_id());

-- RLS: exercises (todos leem, só super_admin escreve)
create policy "exercises: todos leem" on public.exercises
  for select using (active = true);

create policy "exercises: super_admin gerencia" on public.exercises
  for all using (public.get_my_role() = 'super_admin');

-- RLS: workout_templates (todos leem, só super_admin escreve)
create policy "templates: todos leem ativos" on public.workout_templates
  for select using (active = true);

create policy "templates: super_admin gerencia" on public.workout_templates
  for all using (public.get_my_role() = 'super_admin');

-- RLS: exercise_requests
create policy "exercise_requests: super_admin" on public.exercise_requests
  for all using (public.get_my_role() = 'super_admin');

create policy "exercise_requests: coach próprio" on public.exercise_requests
  for all using (coach_id = public.get_my_coach_id());

-- RLS: workouts
create policy "workouts: super_admin" on public.workouts
  for all using (public.get_my_role() = 'super_admin');

create policy "workouts: coach dos seus alunos" on public.workouts
  for all using (coach_id = public.get_my_coach_id());

create policy "workouts: aluno próprio" on public.workouts
  for select using (student_id = public.get_my_student_id());

-- RLS: workout_days e workout_exercises (herdam do workout)
create policy "workout_days: acesso via workout" on public.workout_days
  for all using (
    workout_id in (
      select id from public.workouts
      where coach_id = public.get_my_coach_id()
      or student_id = public.get_my_student_id()
    )
  );

create policy "workout_exercises: acesso via workout_day" on public.workout_exercises
  for all using (
    workout_day_id in (
      select wd.id from public.workout_days wd
      join public.workouts w on w.id = wd.workout_id
      where w.coach_id = public.get_my_coach_id()
      or w.student_id = public.get_my_student_id()
    )
  );

-- RLS: training_sessions
create policy "sessions: super_admin" on public.training_sessions
  for all using (public.get_my_role() = 'super_admin');

create policy "sessions: coach do aluno" on public.training_sessions
  for select using (public.is_my_student(student_id));

create policy "sessions: própria" on public.training_sessions
  for all using (student_id = public.get_my_student_id());

-- RLS: session_sets
create policy "session_sets: acesso via session" on public.session_sets
  for all using (
    session_id in (
      select id from public.training_sessions
      where student_id = public.get_my_student_id()
      or public.is_my_student(student_id)
    )
  );

-- RLS: training_feedbacks
create policy "feedbacks: super_admin" on public.training_feedbacks
  for all using (public.get_my_role() = 'super_admin');

create policy "feedbacks: coach do aluno" on public.training_feedbacks
  for all using (public.is_my_student(student_id));

create policy "feedbacks: próprio" on public.training_feedbacks
  for all using (student_id = public.get_my_student_id());

-- RLS: diets, diet_days, meals, meal_foods
create policy "diets: super_admin" on public.diets
  for all using (public.get_my_role() = 'super_admin');

create policy "diets: coach" on public.diets
  for all using (coach_id = public.get_my_coach_id());

create policy "diets: aluno" on public.diets
  for select using (student_id = public.get_my_student_id());

create policy "diet_days: acesso via diet" on public.diet_days
  for all using (
    diet_id in (
      select id from public.diets
      where coach_id = public.get_my_coach_id()
      or student_id = public.get_my_student_id()
    )
  );

create policy "meals: acesso via diet" on public.meals
  for all using (
    diet_day_id in (
      select dd.id from public.diet_days dd
      join public.diets d on d.id = dd.diet_id
      where d.coach_id = public.get_my_coach_id()
      or d.student_id = public.get_my_student_id()
    )
  );

create policy "meal_foods: acesso via diet" on public.meal_foods
  for all using (
    meal_id in (
      select m.id from public.meals m
      join public.diet_days dd on dd.id = m.diet_day_id
      join public.diets d on d.id = dd.diet_id
      where d.coach_id = public.get_my_coach_id()
      or d.student_id = public.get_my_student_id()
    )
  );

-- RLS: diet_logs e food_checks
create policy "diet_logs: coach" on public.diet_logs
  for select using (public.is_my_student(student_id));

create policy "diet_logs: próprio" on public.diet_logs
  for all using (student_id = public.get_my_student_id());

create policy "food_checks: acesso via diet_log" on public.food_checks
  for all using (
    diet_log_id in (
      select id from public.diet_logs
      where student_id = public.get_my_student_id()
      or public.is_my_student(student_id)
    )
  );

-- RLS: messages
create policy "messages: próprias" on public.messages
  for all using (
    sender_id = auth.uid() or receiver_id = auth.uid()
  );

-- RLS: auto_messages
create policy "auto_messages: coach próprio" on public.auto_messages
  for all using (coach_id = public.get_my_coach_id());

create policy "auto_messages: super_admin" on public.auto_messages
  for all using (public.get_my_role() = 'super_admin');

-- RLS: assessments
create policy "assessments: super_admin" on public.assessments
  for all using (public.get_my_role() = 'super_admin');

create policy "assessments: coach" on public.assessments
  for all using (coach_id = public.get_my_coach_id());

create policy "assessments: aluno próprio" on public.assessments
  for all using (student_id = public.get_my_student_id());

create policy "assessment_photos: acesso via assessment" on public.assessment_photos
  for all using (
    assessment_id in (
      select id from public.assessments
      where student_id = public.get_my_student_id()
      or coach_id = public.get_my_coach_id()
    )
  );

-- RLS: questionnaires, assignments, responses
create policy "questionnaires: coach" on public.questionnaires
  for all using (coach_id = public.get_my_coach_id());

create policy "questionnaires: super_admin" on public.questionnaires
  for all using (public.get_my_role() = 'super_admin');

create policy "questionnaire_assignments: coach" on public.questionnaire_assignments
  for all using (
    questionnaire_id in (
      select id from public.questionnaires
      where coach_id = public.get_my_coach_id()
    )
  );

create policy "questionnaire_assignments: aluno" on public.questionnaire_assignments
  for select using (student_id = public.get_my_student_id());

create policy "questionnaire_responses: coach" on public.questionnaire_responses
  for select using (
    questionnaire_id in (
      select id from public.questionnaires
      where coach_id = public.get_my_coach_id()
    )
  );

create policy "questionnaire_responses: aluno" on public.questionnaire_responses
  for all using (student_id = public.get_my_student_id());

-- RLS: payments
create policy "payments: super_admin" on public.payments
  for all using (public.get_my_role() = 'super_admin');

create policy "payments: coach dos alunos" on public.payments
  for all using (public.is_my_student(student_id));

create policy "payments: aluno próprio" on public.payments
  for select using (student_id = public.get_my_student_id());

create policy "receipts: acesso via payment" on public.receipts
  for select using (
    payment_id in (
      select id from public.payments
      where student_id = public.get_my_student_id()
      or public.is_my_student(student_id)
    )
  );

-- RLS: activity_logs
create policy "activity_logs: super_admin" on public.activity_logs
  for all using (public.get_my_role() = 'super_admin');

create policy "activity_logs: próprio coach" on public.activity_logs
  for select using (coach_id = public.get_my_coach_id());

-- ================================================================
-- ÍNDICES (performance)
-- ================================================================

create index idx_students_coach_id on public.students (coach_id);
create index idx_students_user_id on public.students (user_id);
create index idx_workouts_student_id on public.workouts (student_id);
create index idx_workouts_coach_id on public.workouts (coach_id);
create index idx_training_sessions_student on public.training_sessions (student_id, started_at desc);
create index idx_assessments_student on public.assessments (student_id, created_at desc);
create index idx_messages_sender on public.messages (sender_id, created_at desc);
create index idx_messages_receiver on public.messages (receiver_id, created_at desc);
create index idx_payments_student on public.payments (student_id, due_date desc);
create index idx_diet_logs_student_date on public.diet_logs (student_id, date desc);
create index idx_activity_logs_coach on public.activity_logs (coach_id, created_at desc);
