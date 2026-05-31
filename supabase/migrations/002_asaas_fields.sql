-- Adiciona CPF ao usuário e customer_id do Asaas ao aluno
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS cpf text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS asaas_customer_id text;
