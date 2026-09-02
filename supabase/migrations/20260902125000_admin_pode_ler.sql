-- Leitura da lista somente para o e-mail administrador
GRANT SELECT ON public.inscricoes TO authenticated;
CREATE POLICY "Somente admin le inscricoes" ON public.inscricoes
  FOR SELECT TO authenticated
  USING ((auth.jwt()->>'email') = 'solysprojetos@gmail.com');
