-- O admin passa a gerenciar os setores pela área restrita (tela "Setores"):
-- criar, renomear e remover. A lista continua em convite_setores.

GRANT SELECT ON public.convite_setores TO authenticated;

DROP POLICY IF EXISTS "Somente admin le setores" ON public.convite_setores;
CREATE POLICY "Somente admin le setores" ON public.convite_setores
  FOR SELECT TO authenticated
  USING ((auth.jwt()->>'email') = 'solysprojetos@gmail.com');

-- Cria um setor novo (ou reativa um que já existiu).
CREATE OR REPLACE FUNCTION public.admin_criar_setor(p_nome text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome text := btrim(coalesce(p_nome, ''));
BEGIN
  IF (auth.jwt()->>'email') IS DISTINCT FROM 'solysprojetos@gmail.com' THEN
    RAISE EXCEPTION 'Somente o admin pode alterar' USING ERRCODE = '42501';
  END IF;
  IF length(v_nome) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'Nome de setor inválido' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.convite_setores WHERE lower(nome) = lower(v_nome) AND ativo) THEN
    RAISE EXCEPTION 'Setor já existe' USING ERRCODE = '23505';
  END IF;
  DELETE FROM public.convite_setores WHERE lower(nome) = lower(v_nome);
  INSERT INTO public.convite_setores (nome, ordem, ativo)
  VALUES (v_nome, (SELECT coalesce(max(ordem), 0) + 1 FROM public.convite_setores), true);
END;
$$;

-- Renomeia um setor e leva junto as pessoas que estão nele.
CREATE OR REPLACE FUNCTION public.admin_renomear_setor(p_de text, p_para text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_para text := btrim(coalesce(p_para, ''));
BEGIN
  IF (auth.jwt()->>'email') IS DISTINCT FROM 'solysprojetos@gmail.com' THEN
    RAISE EXCEPTION 'Somente o admin pode alterar' USING ERRCODE = '42501';
  END IF;
  IF length(v_para) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'Nome de setor inválido' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.convite_setores WHERE nome = p_de AND ativo) THEN
    RAISE EXCEPTION 'Setor não encontrado' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.convite_setores
    WHERE lower(nome) = lower(v_para) AND nome <> p_de AND ativo
  ) THEN
    RAISE EXCEPTION 'Setor já existe' USING ERRCODE = '23505';
  END IF;
  DELETE FROM public.convite_setores WHERE lower(nome) = lower(v_para) AND nome <> p_de;
  UPDATE public.convite_setores SET nome = v_para WHERE nome = p_de;
  -- Quem escolheu o setor pelo formulário tem o mesmo texto no cargo
  UPDATE public.inscricoes SET cargo = v_para WHERE setor = p_de AND cargo = p_de;
  UPDATE public.inscricoes SET setor = v_para WHERE setor = p_de;
END;
$$;

-- Remove um setor; as pessoas dele ficam sem setor.
CREATE OR REPLACE FUNCTION public.admin_remover_setor(p_nome text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (auth.jwt()->>'email') IS DISTINCT FROM 'solysprojetos@gmail.com' THEN
    RAISE EXCEPTION 'Somente o admin pode alterar' USING ERRCODE = '42501';
  END IF;
  UPDATE public.convite_setores SET ativo = false WHERE nome = p_nome AND ativo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Setor não encontrado' USING ERRCODE = '22023';
  END IF;
  UPDATE public.inscricoes SET setor = NULL WHERE setor = p_nome;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_criar_setor(text) FROM public;
REVOKE EXECUTE ON FUNCTION public.admin_renomear_setor(text, text) FROM public;
REVOKE EXECUTE ON FUNCTION public.admin_remover_setor(text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_criar_setor(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_renomear_setor(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_remover_setor(text) TO authenticated;
