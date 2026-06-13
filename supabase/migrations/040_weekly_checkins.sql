-- TEAM HARD — Check-ins semanais automáticos
CREATE TABLE public.weekly_checkins (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id    uuid        NOT NULL REFERENCES public.coaches(id)   ON DELETE CASCADE,
  student_id  uuid        NOT NULL REFERENCES public.students(id)  ON DELETE CASCADE,
  week_start  date        NOT NULL,
  message_id  uuid        REFERENCES public.messages(id)           ON DELETE SET NULL,
  sent_at     timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, week_start)
);

ALTER TABLE public.weekly_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coaches_manage_own_checkins" ON public.weekly_checkins
  FOR ALL USING (
    coach_id IN (SELECT id FROM public.coaches WHERE user_id = auth.uid())
  );

CREATE INDEX idx_weekly_checkins_student ON public.weekly_checkins (student_id, week_start DESC);
CREATE INDEX idx_weekly_checkins_coach   ON public.weekly_checkins (coach_id,   week_start DESC);
