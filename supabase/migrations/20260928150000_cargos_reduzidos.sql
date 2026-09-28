-- A lista de cargos do formulário passa a ter só cinco opções, sem "Outro".
-- Os demais nomes ficam inativos (o banco recusa quem tentar usá-los), mas
-- não são apagados. Precisa bater com src/config/evento.ts.
INSERT INTO public.convite_setores (nome, ordem, ativo) VALUES
  ('Administrativo', 1, true),
  ('Administrativo Comercial', 2, true),
  ('Consultor', 3, true),
  ('Gerente', 4, true),
  ('Diretoria', 5, true)
ON CONFLICT (nome) DO UPDATE SET ordem = EXCLUDED.ordem, ativo = true;

UPDATE public.convite_setores SET ativo = false
WHERE nome NOT IN ('Administrativo', 'Administrativo Comercial', 'Consultor', 'Gerente', 'Diretoria');
