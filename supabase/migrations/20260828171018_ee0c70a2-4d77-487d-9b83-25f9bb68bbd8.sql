CREATE TABLE public.inscricoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_completo text NOT NULL,
  telefone text NOT NULL,
  email text NOT NULL,
  grupo text NOT NULL CHECK (grupo IN ('sgroup','solys','grupo_support')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.inscricoes TO anon, authenticated;
GRANT ALL ON public.inscricoes TO service_role;
ALTER TABLE public.inscricoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Qualquer pessoa pode se inscrever" ON public.inscricoes FOR INSERT TO anon, authenticated WITH CHECK (true);