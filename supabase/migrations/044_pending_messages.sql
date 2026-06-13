-- TEAM HARD — Mensagens agendadas para alunos vermelhos
CREATE TABLE public.pending_messages (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id        uuid        NOT NULL REFERENCES public.coaches(id)   ON DELETE CASCADE,
  student_id      uuid        NOT NULL REFERENCES public.students(id)  ON DELETE CASCADE,
  content         text        NOT NULL,
  trigger_type    text        NOT NULL DEFAULT 'red_alert',
  scheduled_for   timestamptz NOT NULL,
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'sent', 'cancelled')),
  sent_message_id uuid        REFERENCES public.messages(id)           ON DELETE SET NULL,
  sent_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pending_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coaches_manage_own_pending_messages" ON public.pending_messages
  FOR ALL USING (
    coach_id IN (SELECT id FROM public.coaches WHERE user_id = auth.uid())
  );

CREATE INDEX idx_pending_messages_scheduled ON public.pending_messages (scheduled_for, status);
CREATE INDEX idx_pending_messages_coach     ON public.pending_messages (coach_id, status, created_at DESC);
CREATE INDEX idx_pending_messages_student   ON public.pending_messages (student_id, trigger_type, created_at DESC);
