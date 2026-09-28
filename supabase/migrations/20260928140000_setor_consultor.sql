-- Novo setor na lista do formulário: Consultor, logo antes de "Outro".
-- Precisa bater com src/config/evento.ts.
INSERT INTO public.convite_setores (nome, ordem) VALUES ('Consultor', 12)
ON CONFLICT (nome) DO UPDATE SET ativo = true, ordem = 12;
UPDATE public.convite_setores SET ordem = 13 WHERE nome = 'Outro';
