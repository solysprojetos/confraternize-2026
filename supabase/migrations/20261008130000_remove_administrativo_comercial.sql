-- Setor "Administrativo Comercial" sai da lista; quem se inscreveu com ele
-- passa a "Administrativo" (a empresa não muda).
UPDATE public.inscricoes
   SET setor = 'Administrativo'
 WHERE setor = 'Administrativo Comercial';
UPDATE public.convite_setores SET ativo = false WHERE nome = 'Administrativo Comercial';
