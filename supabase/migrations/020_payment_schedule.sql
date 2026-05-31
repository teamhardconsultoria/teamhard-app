-- ================================================================
-- 020_payment_schedule.sql
-- Cronograma automático de vencimentos por tipo de plano
-- ================================================================

-- 1. Colunas de rastreamento na tabela payments
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual','scheduled','asaas')),
  ADD COLUMN IF NOT EXISTS installment_number integer,
  ADD COLUMN IF NOT EXISTS total_installments integer;

-- Índice para busca eficiente de próximos vencimentos agendados
CREATE INDEX IF NOT EXISTS idx_payments_upcoming
  ON public.payments (due_date, source, status)
  WHERE source = 'scheduled';

-- ================================================================
-- 2. Função: gera (ou regenera) o cronograma de vencimentos
--
--    Lógica: para um plano com N parcelas e vencimento em plan_end,
--    a parcela i vence (N - i + 1) meses ANTES do fim do plano.
--
--    Exemplo — trimestral (N=3) com plan_end = 30/09:
--      Parcela 1 → vence 30/06  (3 meses antes)
--      Parcela 2 → vence 31/07  (2 meses antes)
--      Parcela 3 → vence 31/08  (1 mês antes)
-- ================================================================
CREATE OR REPLACE FUNCTION public.generate_payment_schedule(
  p_student_id      uuid,
  p_plan_end        date,
  p_plan_type       text,
  p_amount_per_inst numeric
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_months  integer;
  v_i       integer;
  v_due     date;
  v_count   integer := 0;
BEGIN
  -- Autorização: apenas o coach do aluno ou super_admin
  IF NOT (
    EXISTS (
      SELECT 1 FROM public.students
      WHERE id = p_student_id
        AND coach_id = public.get_my_coach_id()
    )
    OR public.get_my_role() = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Não autorizado';
  END IF;

  -- Remove parcelas futuras agendadas ainda pendentes
  DELETE FROM public.payments
  WHERE student_id = p_student_id
    AND source = 'scheduled'
    AND status = 'pending'
    AND due_date >= current_date;

  v_months := CASE p_plan_type
    WHEN 'monthly'    THEN 1
    WHEN 'quarterly'  THEN 3
    WHEN 'semiannual' THEN 6
    WHEN 'annual'     THEN 12
    ELSE 1
  END;

  -- Gera parcelas: a i-ésima vence (v_months - i + 1) meses antes do plan_end
  FOR v_i IN 1..v_months LOOP
    v_due := (p_plan_end - make_interval(months := v_months - v_i + 1))::date;
    IF v_due >= current_date THEN
      INSERT INTO public.payments (
        student_id, amount, status, plan_type, due_date,
        source, installment_number, total_installments
      ) VALUES (
        p_student_id,
        p_amount_per_inst,
        'pending',
        p_plan_type::plan_type,
        v_due,
        'scheduled',
        v_i,
        v_months
      );
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_payment_schedule TO authenticated;

-- ================================================================
-- 3. Cron: marca parcelas vencidas como overdue e atualiza alunos
--    Executa todo dia às 08h BRT (11h UTC), junto com o cron de
--    lembretes já existente
-- ================================================================
DO $$ BEGIN
  PERFORM cron.unschedule('mark-overdue-scheduled-payments');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'mark-overdue-scheduled-payments',
  '5 11 * * *',
  $$
    -- Marca parcelas agendadas vencidas como overdue
    UPDATE public.payments
    SET status = 'overdue'
    WHERE source = 'scheduled'
      AND status = 'pending'
      AND due_date < current_date;

    -- Alunos em dia que agora têm parcela vencida → overdue
    UPDATE public.students
    SET payment_status = 'overdue', updated_at = now()
    WHERE payment_status = 'active'
      AND EXISTS (
        SELECT 1 FROM public.payments
        WHERE student_id = students.id
          AND source = 'scheduled'
          AND status  = 'overdue'
      );
  $$
);
