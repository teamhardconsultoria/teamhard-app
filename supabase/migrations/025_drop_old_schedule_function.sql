-- ================================================================
-- 025_drop_old_schedule_function.sql
-- Remove a versão antiga (4 parâmetros) de generate_payment_schedule
-- que ficou como sobrecarga após a migration 024 adicionar o 5º
-- parâmetro opcional. Mantém apenas a versão com p_total_installments.
-- ================================================================

DROP FUNCTION IF EXISTS public.generate_payment_schedule(uuid, date, text, numeric);
