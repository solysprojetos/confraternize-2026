-- O admin transfere uma pessoa de empresa (ex.: de Convidados para SGroup)
-- pela lista da área restrita. Como na troca de coordenador, passa por uma
-- função para o admin só conseguir mexer na empresa, nunca nos outros dados.
CREATE OR REPLACE FUNCTION public.admin_transferir_grupo(
  p_inscricao uuid,
  p_grupo text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (auth.jwt()->>'email') IS DISTINCT FROM 'solysprojetos@gmail.com' THEN
    RAISE EXCEPTION 'Somente o admin pode transferir' USING ERRCODE = '42501';
  END IF;
  IF p_grupo NOT IN ('sgroup', 'solys', 'grupo_support', 'parceiros', 'convidados') THEN
    RAISE EXCEPTION 'Empresa inválida' USING ERRCODE = '22023';
  END IF;
  UPDATE public.inscricoes SET grupo = p_grupo WHERE id = p_inscricao;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inscrição não encontrada' USING ERRCODE = '22023';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_transferir_grupo(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_transferir_grupo(uuid, text) TO authenticated;
