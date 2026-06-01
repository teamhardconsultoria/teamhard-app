-- ================================================================
-- 023_add_june_mazotini.sql
-- Adiciona parcela de 20/06/2026 para Maria Eduarda Mazotini.
-- Reajusta numeração: total_installments 5→6,
-- julho (antiga 4→5) e agosto (antiga 5→6).
-- ================================================================

DO $$
DECLARE
  v_student_id uuid;
BEGIN
  SELECT s.id INTO v_student_id
  FROM public.students s
  JOIN public.users u ON u.id = s.user_id
  WHERE u.name ILIKE '%Maria Eduarda%'
    AND u.name ILIKE '%Mazotini%'
  LIMIT 1;

  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Aluna Maria Eduarda Mazotini não encontrada';
  END IF;

  -- Atualiza total_installments de 5 para 6
  UPDATE public.payments
  SET total_installments = 6
  WHERE student_id = v_student_id
    AND source = 'scheduled';

  -- Julho: installment_number 4 → 5
  UPDATE public.payments
  SET installment_number = 5
  WHERE student_id = v_student_id
    AND source = 'scheduled'
    AND due_date = '2026-07-20'::date;

  -- Agosto: installment_number 5 → 6
  UPDATE public.payments
  SET installment_number = 6
  WHERE student_id = v_student_id
    AND source = 'scheduled'
    AND due_date = '2026-08-20'::date;

  -- Insere junho como parcela 4 (apenas se ainda não existe pagamento pago)
  IF NOT EXISTS (
    SELECT 1 FROM public.payments
    WHERE student_id = v_student_id
      AND due_date = '2026-06-20'::date
      AND status = 'paid'
  ) THEN
    INSERT INTO public.payments
      (student_id, amount, status, plan_type, due_date, source, installment_number, total_installments)
    VALUES
      (v_student_id, 202.75, 'pending', 'semiannual'::plan_type, '2026-06-20'::date, 'scheduled', 4, 6);
  END IF;
END $$;
