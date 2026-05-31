-- ================================================================
-- 021_fix_payment_schedule.sql
-- Corrige cálculo de parcelas: usa plan_start (meses a partir da
-- entrada do aluno) em vez de retroativo pelo plan_end.
-- Também gera retroativamente as parcelas futuras para todos os
-- alunos ativos que já têm histórico de pagamentos manuais.
-- ================================================================

-- ================================================================
-- 1. Atualiza generate_payment_schedule para usar plan_start
--    Lógica: parcela i vence em plan_start + (i-1) meses
--    Ex: semestral plan_start=20/03 → 20/03, 20/04, 20/05, 20/06, 20/07, 20/08
-- ================================================================
CREATE OR REPLACE FUNCTION public.generate_payment_schedule(
  p_student_id      uuid,
  p_plan_end        date,
  p_plan_type       text,
  p_amount_per_inst numeric
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_months     integer;
  v_i          integer;
  v_due        date;
  v_count      integer := 0;
  v_plan_start date;
BEGIN
  -- Autorização: coach do aluno ou super_admin
  IF NOT (
    EXISTS (SELECT 1 FROM public.students WHERE id = p_student_id AND coach_id = public.get_my_coach_id())
    OR public.get_my_role() = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Não autorizado';
  END IF;

  -- Busca plan_start diretamente do aluno
  SELECT plan_start INTO v_plan_start FROM public.students WHERE id = p_student_id;

  -- Remove parcelas futuras agendadas e ainda pendentes
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

  -- Parcela i vence em plan_start + (i-1) meses
  FOR v_i IN 1..v_months LOOP
    v_due := (v_plan_start + make_interval(months := v_i - 1))::date;
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

-- ================================================================
-- 2. Gera parcelas futuras para todos os alunos ativos
--    Valor por parcela = média dos pagamentos manuais já pagos
--    Só insere datas futuras que ainda não existem como scheduled
-- ================================================================
INSERT INTO public.payments (
  student_id, amount, status, plan_type, due_date,
  source, installment_number, total_installments
)
SELECT
  s.id,
  avg_paid.amount,
  'pending',
  s.plan_type,
  (s.plan_start + make_interval(months := g.i - 1))::date,
  'scheduled',
  g.i,
  n.months
FROM public.students s
JOIN LATERAL (
  SELECT CASE s.plan_type
    WHEN 'monthly'    THEN 1
    WHEN 'quarterly'  THEN 3
    WHEN 'semiannual' THEN 6
    WHEN 'annual'     THEN 12
    ELSE 1
  END AS months
) n ON true
CROSS JOIN LATERAL generate_series(1, n.months) AS g(i)
-- Infere o valor por parcela a partir da média dos manuais pagos
JOIN LATERAL (
  SELECT ROUND(AVG(p.amount)::numeric, 2) AS amount
  FROM public.payments p
  WHERE p.student_id = s.id
    AND p.status = 'paid'
    AND p.source = 'manual'
) avg_paid ON avg_paid.amount IS NOT NULL AND avg_paid.amount > 0
WHERE
  s.plan_end >= current_date
  AND (s.plan_start + make_interval(months := g.i - 1))::date >= current_date
  AND NOT EXISTS (
    SELECT 1 FROM public.payments p2
    WHERE p2.student_id = s.id
      AND p2.due_date = (s.plan_start + make_interval(months := g.i - 1))::date
      AND p2.source = 'scheduled'
  );
