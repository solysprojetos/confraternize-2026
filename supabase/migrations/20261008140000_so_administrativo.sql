-- Fica só o setor "Administrativo": quem escolheu outro passa a ele (a empresa não muda)
UPDATE public.inscricoes SET setor = 'Administrativo' WHERE setor IS NOT NULL AND setor <> 'Administrativo';
UPDATE public.convite_setores SET ativo = (nome = 'Administrativo');
