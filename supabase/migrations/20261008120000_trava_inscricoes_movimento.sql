-- Tabela antiga do formulário anterior (camisa/consentimento), sem uso no site:
-- deixa de aceitar gravações anônimas. Os dados continuam lá, legíveis só pelo admin.
DROP POLICY IF EXISTS "Qualquer pessoa pode se inscrever" ON public.inscricoes_movimento;
REVOKE ALL ON public.inscricoes_movimento FROM anon;
REVOKE ALL ON public.inscricoes_movimento FROM authenticated;
GRANT SELECT ON public.inscricoes_movimento TO authenticated;
