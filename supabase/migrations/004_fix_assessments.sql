-- Torna height opcional e aumenta precisão dos campos numéricos
ALTER TABLE public.assessments
  ALTER COLUMN height DROP NOT NULL,
  ALTER COLUMN weight TYPE numeric(6,2),
  ALTER COLUMN height TYPE numeric(6,2),
  ALTER COLUMN body_fat_pct TYPE numeric(5,2);
