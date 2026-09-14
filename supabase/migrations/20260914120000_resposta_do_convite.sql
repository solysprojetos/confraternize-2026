-- Resposta ao convite: a pessoa pode confirmar presença ou avisar que não vai.
-- Antes desta migração a tabela só guardava quem confirmava; agora ela guarda
-- também as recusas, que são informação útil para a organização.

ALTER TABLE public.inscricoes
  ADD COLUMN comparecera boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.inscricoes.comparecera IS
  'true = confirmou presença; false = avisou que não poderá comparecer';

-- A função de inscrição passa a aceitar a resposta. O parâmetro tem valor
-- padrão, então chamadas antigas continuam válidas e gravam como confirmação.
CREATE OR REPLACE FUNCTION public.convite_inscrever(
  p_sessao uuid,
  p_id uuid,
  p_nome text,
  p_telefone text,
  p_email text,
  p_grupo text,
  p_comparecera boolean DEFAULT true
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

  INSERT INTO public.inscricoes (id, nome_completo, telefone, email, grupo, comparecera)
  VALUES (v_id, v_nome, v_telefone, v_email, p_grupo, coalesce(p_comparecera, true));

  UPDATE public.convite_sessoes SET inscricao_id = v_id WHERE id = p_sessao;

  RETURN jsonb_build_object('id', v_id, 'comparecera', coalesce(p_comparecera, true));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.convite_inscrever(uuid, uuid, text, text, text, text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.convite_inscrever(uuid, uuid, text, text, text, text, boolean)
  TO anon, authenticated;

-- Quem avisou que não vai não precisa receber o convite com QR code
DROP TRIGGER IF EXISTS trg_limita_inscricoes ON public.inscricoes;
CREATE TRIGGER trg_limita_inscricoes
  BEFORE INSERT ON public.inscricoes
  FOR EACH ROW EXECUTE FUNCTION public.limita_inscricoes();
