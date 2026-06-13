-- Permite ao coach desativar a área de dieta por aluno (ex: aluno já tem nutricionista)
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS diet_enabled boolean NOT NULL DEFAULT true;
