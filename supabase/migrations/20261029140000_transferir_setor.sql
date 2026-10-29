-- O admin muda o setor de uma pessoa (Administrativo, Consultor, Gerente,
-- Diretoria) pela aba Coordenadores. NULL deixa a pessoa em "Outros".
-- Mesma regra do formulário: só entra setor cadastrado e ativo.
CREATE OR REPLACE FUNCTION public.admin_transferir_setor(
  p_inscricao uuid,
  p_setor text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_setor text := nullif(btrim(coalesce(p_setor, '')), '');
BEGIN
  IF (auth.jwt()->>'email') IS DISTINCT FROM 'solysprojetos@gmail.com' THEN
    RAISE EXCEPTION 'Somente o admin pode transferir' USING ERRCODE = '42501';
  END IF;
  IF v_setor IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.convite_setores WHERE nome = v_setor AND ativo) THEN
    RAISE EXCEPTION 'Setor inválido' USING ERRCODE = '22023';
  END IF;
  UPDATE public.inscricoes SET setor = v_setor WHERE id = p_inscricao;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inscrição não encontrada' USING ERRCODE = '22023';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_transferir_setor(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_transferir_setor(uuid, text) TO authenticated;
