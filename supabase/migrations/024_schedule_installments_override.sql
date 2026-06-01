-- ================================================================
-- 024_schedule_installments_override.sql
-- Adiciona parâmetro opcional p_total_installments à função
-- generate_payment_schedule, permitindo sobrescrever o total de
-- parcelas derivado do plano (ex: crédito em 2x num plano semestral,
-- ou à vista/pix/débito com apenas 1 parcela).
-- ================================================================

CREATE OR REPLACE FUNCTION public.generate_payment_schedule(
  p_student_id         uuid,
  p_plan_end           date,
  p_plan_type          text,
  p_amount_per_inst    numeric,
  p_total_installments integer DEFAULT NULL
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

  DELETE FROM public.payments
  WHERE student_id = p_student_id
    AND source = 'scheduled'
    AND status = 'pending'
    AND due_date >= current_date;

  -- p_total_installments sobrescreve o padrão do plano quando fornecido
  v_months := COALESCE(p_total_installments, CASE p_plan_type
    WHEN 'monthly'    THEN 1
    WHEN 'quarterly'  THEN 3
    WHEN 'semiannual' THEN 6
    WHEN 'annual'     THEN 12
    ELSE 1
  END);

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

GRANT EXECUTE ON FUNCTION public.generate_payment_schedule TO authenticated;
