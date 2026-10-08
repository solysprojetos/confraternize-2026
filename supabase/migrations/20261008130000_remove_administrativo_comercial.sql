-- Setor "Administrativo Comercial" sai da lista; quem se inscreveu com ele
-- passa a "Administrativo", na SGroup.
UPDATE public.inscricoes
   SET setor = 'Administrativo', grupo = 'sgroup'
 WHERE setor = 'Administrativo Comercial';
UPDATE public.convite_setores SET ativo = false WHERE nome = 'Administrativo Comercial';
