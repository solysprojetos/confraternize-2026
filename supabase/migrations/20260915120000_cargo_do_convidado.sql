-- Cargo de quem é do grupo. Para as três empresas (Grupo Support, SGroup
-- Nacional e Solys) o cargo é obrigatório; para parceiros e convidados não
-- faz sentido e continua vazio.

ALTER TABLE public.inscricoes
  ADD COLUMN cargo text;

COMMENT ON COLUMN public.inscricoes.cargo IS
  'Cargo de quem é de uma das empresas do grupo; nulo para parceiros e convidados';

-- A função de inscrição passa a aceitar o cargo e a exigi-lo de quem é do
-- grupo. O parâmetro tem valor padrão, então chamadas antigas continuam
-- válidas — mas, vindas do site, sempre trazem o campo.
CREATE OR REPLACE FUNCTION public.convite_inscrever(
  p_sessao uuid,
  p_id uuid,
  p_nome text,
  p_telefone text,
  p_email text,
  p_grupo text,
  p_comparecera boolean DEFAULT true,
  p_cargo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sessao public.convite_sessoes;
  v_nome text := btrim(coalesce(p_nome, ''));
  v_telefone text := btrim(coalesce(p_telefone, ''));
  v_email text := btrim(coalesce(p_email, ''));
  v_cargo text := nullif(btrim(coalesce(p_cargo, '')), '');
  v_id uuid := coalesce(p_id, gen_random_uuid());
BEGIN
  SELECT * INTO v_sessao FROM public.convite_sessoes WHERE id = p_sessao FOR UPDATE;
  IF NOT FOUND OR NOT v_sessao.concluido THEN
    RAISE EXCEPTION 'Assista ao convite até o final para confirmar sua presença' USING ERRCODE = '42501';
  END IF;
  IF v_sessao.inscricao_id IS NOT NULL THEN
    RAISE EXCEPTION 'Esta sessão de convite já registrou uma resposta' USING ERRCODE = '42501';
  END IF;

  IF length(v_nome) < 3 OR length(v_nome) > 120 THEN
    RAISE EXCEPTION 'Informe seu nome completo' USING ERRCODE = '22023';
  END IF;
  IF length(v_telefone) < 10 OR length(v_telefone) > 20 THEN
    RAISE EXCEPTION 'Informe um telefone válido com DDD' USING ERRCODE = '22023';
  END IF;
  IF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' OR length(v_email) > 255 THEN
    RAISE EXCEPTION 'E-mail inválido' USING ERRCODE = '22023';
  END IF;
  IF p_grupo NOT IN ('sgroup', 'solys', 'grupo_support', 'parceiros', 'convidados') THEN
    RAISE EXCEPTION 'Selecione a sua empresa' USING ERRCODE = '22023';
  END IF;

  -- Quem é do grupo precisa informar o cargo
  IF p_grupo IN ('sgroup', 'solys', 'grupo_support') THEN
    IF v_cargo IS NULL OR length(v_cargo) < 2 THEN
      RAISE EXCEPTION 'Informe o seu cargo' USING ERRCODE = '22023';
    END IF;
    IF length(v_cargo) > 120 THEN
      RAISE EXCEPTION 'Cargo muito longo' USING ERRCODE = '22023';
    END IF;
  ELSE
    -- Parceiros e convidados não têm cargo no grupo
    v_cargo := NULL;
  END IF;

  INSERT INTO public.inscricoes (id, nome_completo, telefone, email, grupo, comparecera, cargo)
  VALUES (v_id, v_nome, v_telefone, v_email, p_grupo, coalesce(p_comparecera, true), v_cargo);

  UPDATE public.convite_sessoes SET inscricao_id = v_id WHERE id = p_sessao;

  RETURN jsonb_build_object('id', v_id, 'comparecera', coalesce(p_comparecera, true), 'cargo', v_cargo);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.convite_inscrever(uuid, uuid, text, text, text, text, boolean, text) FROM public;
GRANT EXECUTE ON FUNCTION public.convite_inscrever(uuid, uuid, text, text, text, text, boolean, text)
  TO anon, authenticated;
