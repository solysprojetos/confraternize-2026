-- Adiciona os grupos Parceiros e Convidados
ALTER TABLE public.inscricoes DROP CONSTRAINT inscricoes_grupo_check;
ALTER TABLE public.inscricoes ADD CONSTRAINT inscricoes_grupo_check
  CHECK (grupo IN ('sgroup','solys','grupo_support','parceiros','convidados'));
