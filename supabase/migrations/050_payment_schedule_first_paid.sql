-- ================================================================
-- 050_payment_schedule_first_paid.sql
-- Adiciona parâmetro p_first_paid à generate_payment_schedule.
-- Quando true, a 1ª parcela é inserida como 'paid' (já recebida)
-- independente da data de vencimento.
-- ================================================================

CREATE OR REPLACE FUNCTION public.generate_payment_schedule(
  p_student_id         uuid,
  p_plan_end           date,
  p_plan_type          text,
  p_amount_per_inst    numeric,
  p_total_installments integer DEFAULT NULL,
  p_first_paid         boolean DEFAULT false
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_months     integer;
  v_i          integer;
  v_due        date;
  v_count      integer := 0;
  v_plan_start date;
BEGIN
  IF NOT (
    EXISTS (SELECT 1 FROM public.students WHERE id = p_student_id AND coach_id = public.get_my_coach_id())
    OR public.get_my_role() = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Não autorizado';
  END IF;

  SELECT plan_start INTO v_plan_start FROM public.students WHERE id = p_student_id;

  -- Remove apenas parcelas pendentes futuras (não toca nas já pagas)
  DELETE FROM public.payments
  WHERE student_id = p_student_id
    AND source = 'scheduled'
    AND status = 'pending'
    AND due_date >= current_date;

  v_months := COALESCE(p_total_installments, CASE p_plan_type
    WHEN 'monthly'    THEN 1
    WHEN 'quarterly'  THEN 3
    WHEN 'semiannual' THEN 6
    WHEN 'annual'     THEN 12
    ELSE 1
  END);

  FOR v_i IN 1..v_months LOOP
    v_due := (v_plan_start + make_interval(months := v_i - 1))::date;

    -- 1ª parcela: sempre insere quando p_first_paid=true (mesmo se data passada)
    -- Demais: insere apenas se vencimento >= hoje
    IF v_due >= current_date OR (v_i = 1 AND p_first_paid) THEN
      INSERT INTO public.payments (
        student_id, amount, status, plan_type, due_date,
        source, installment_number, total_installments, paid_at
      ) VALUES (
        p_student_id,
        p_amount_per_inst,
        CASE WHEN v_i = 1 AND p_first_paid THEN 'paid' ELSE 'pending' END,
        p_plan_type::plan_type,
        v_due,
        'scheduled',
        v_i,
        v_months,
        CASE WHEN v_i = 1 AND p_first_paid THEN now() ELSE NULL END
      );
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_payment_schedule TO authenticated;
