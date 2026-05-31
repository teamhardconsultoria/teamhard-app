-- Adiciona push token para notificações mobile
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS push_token text;
