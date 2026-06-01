-- ================================================================
-- 022_manual_payment_correction.sql
-- Correção manual de cronogramas para 3 alunos específicos.
-- Regras:
--   • Data com pagamento pago existente → ignora (não duplica)
--   • Data passada sem pagamento pago  → insere como 'overdue'
--   • Data futura                      → insere como 'pending'
-- ================================================================

-- Passo 1: limpa parcelas agendadas pendentes/vencidas dos 3 alunos
DELETE FROM public.payments
WHERE source = 'scheduled'
  AND status IN ('pending', 'overdue')
  AND student_id IN (
    SELECT s.id
    FROM public.students s
    JOIN public.users u ON u.id = s.user_id
    WHERE u.name ILIKE '%Renato Vialto%'
       OR (u.name ILIKE '%Maria Eduarda%'  AND u.name ILIKE '%Mazotini%')
       OR (u.name ILIKE '%Leandro%'        AND u.name ILIKE '%Pomim%')
  );

-- ----------------------------------------------------------------
-- RENATO VIALTO — semestral, 6 × R$ 202,74 (início 20/03/2026)
-- ----------------------------------------------------------------
INSERT INTO public.payments
  (student_id, amount, status, plan_type, due_date, source, installment_number, total_installments)
SELECT
  s.id,
  202.74,
  CASE WHEN v.due_date < current_date THEN 'overdue' ELSE 'pending' END,
  'semiannual'::plan_type,
  v.due_date,
  'scheduled',
  v.i,
  6
FROM public.students s
JOIN public.users u ON u.id = s.user_id
CROSS JOIN (VALUES
  (1, '2026-03-20'::date),
  (2, '2026-04-20'::date),
  (3, '2026-05-20'::date),
  (4, '2026-06-20'::date),
  (5, '2026-07-20'::date),
  (6, '2026-08-20'::date)
) AS v(i, due_date)
WHERE u.name ILIKE '%Renato Vialto%'
  AND NOT EXISTS (
    SELECT 1 FROM public.payments p
    WHERE p.student_id = s.id
      AND p.due_date = v.due_date
      AND p.status = 'paid'
  );

-- ----------------------------------------------------------------
-- MARIA EDUARDA GUITTI MAZOTINI — 5 × R$ 202,75
-- ----------------------------------------------------------------
INSERT INTO public.payments
  (student_id, amount, status, plan_type, due_date, source, installment_number, total_installments)
SELECT
  s.id,
  202.75,
  CASE WHEN v.due_date < current_date THEN 'overdue' ELSE 'pending' END,
  'semiannual'::plan_type,
  v.due_date,
  'scheduled',
  v.i,
  5
FROM public.students s
JOIN public.users u ON u.id = s.user_id
CROSS JOIN (VALUES
  (1, '2026-03-20'::date),
  (2, '2026-04-20'::date),
  (3, '2026-05-20'::date),
  (4, '2026-07-20'::date),
  (5, '2026-08-20'::date)
) AS v(i, due_date)
WHERE u.name ILIKE '%Maria Eduarda%'
  AND u.name ILIKE '%Mazotini%'
  AND NOT EXISTS (
    SELECT 1 FROM public.payments p
    WHERE p.student_id = s.id
      AND p.due_date = v.due_date
      AND p.status = 'paid'
  );

-- ----------------------------------------------------------------
-- LEANDRO HENRIQUE DE OLIVEIRA POMIM — anual, 12 × R$ 99,90
-- início 17/12/2025, último vencimento 17/11/2026
-- ----------------------------------------------------------------
INSERT INTO public.payments
  (student_id, amount, status, plan_type, due_date, source, installment_number, total_installments)
SELECT
  s.id,
  99.90,
  CASE WHEN v.due_date < current_date THEN 'overdue' ELSE 'pending' END,
  'annual'::plan_type,
  v.due_date,
  'scheduled',
  v.i,
  12
FROM public.students s
JOIN public.users u ON u.id = s.user_id
CROSS JOIN (VALUES
  (1,  '2025-12-17'::date),
  (2,  '2026-01-17'::date),
  (3,  '2026-02-17'::date),
  (4,  '2026-03-17'::date),
  (5,  '2026-04-17'::date),
  (6,  '2026-05-17'::date),
  (7,  '2026-06-17'::date),
  (8,  '2026-07-17'::date),
  (9,  '2026-08-17'::date),
  (10, '2026-09-17'::date),
  (11, '2026-10-17'::date),
  (12, '2026-11-17'::date)
) AS v(i, due_date)
WHERE u.name ILIKE '%Leandro%'
  AND u.name ILIKE '%Pomim%'
  AND NOT EXISTS (
    SELECT 1 FROM public.payments p
    WHERE p.student_id = s.id
      AND p.due_date = v.due_date
      AND p.status = 'paid'
  );
