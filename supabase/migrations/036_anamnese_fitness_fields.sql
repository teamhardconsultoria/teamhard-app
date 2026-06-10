ALTER TABLE public.anamnese
  ADD COLUMN IF NOT EXISTS training_time text,
  ADD COLUMN IF NOT EXISTS has_good_technique boolean,
  ADD COLUMN IF NOT EXISTS load_progressing boolean;
