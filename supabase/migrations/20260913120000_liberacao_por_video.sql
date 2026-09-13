-- Liberação da inscrição pelo vídeo-convite, validada no servidor.
--
-- O navegador informa quais SEGUNDOS do vídeo foram efetivamente
-- reproduzidos; o banco acumula essa cobertura numa sessão de convite e só
-- aceita a inscrição quando ela atinge o mínimo. Assim, abrir o formulário
-- direto (ou chamar a API na mão) não grava inscrição nenhuma.

-- Parâmetros ajustáveis sem mexer em código.
CREATE TABLE public.convite_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  -- Duração real do vídeo publicado. Enquanto for 0, o convite ainda não foi
  -- publicado e a inscrição fica liberada. Atualize junto com o vídeo:
  --   UPDATE public.convite_config SET duracao_minima_segundos = 90;
  duracao_minima_segundos int NOT NULL DEFAULT 0 CHECK (duracao_minima_segundos BETWEEN 0 AND 7200),
  cobertura_minima numeric NOT NULL DEFAULT 0.95 CHECK (cobertura_minima > 0 AND cobertura_minima <= 1),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.convite_config (id) VALUES (true);

ALTER TABLE public.convite_config ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.convite_config TO service_role;

-- Uma sessão por visitante que abre o convite.
CREATE TABLE public.convite_sessoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  duracao_segundos int NOT NULL DEFAULT 0,
  -- Um elemento por segundo do vídeo: true = segundo reproduzido
  trechos boolean[] NOT NULL DEFAULT '{}',
  segundos_assistidos int NOT NULL DEFAULT 0,
  concluido boolean NOT NULL DEFAULT false,
  concluido_em timestamptz,
  inscricao_id uuid
);
CREATE INDEX convite_sessoes_criado_em ON public.convite_sessoes (criado_em);

-- Sem políticas: a tabela só é acessível pelas funções abaixo.
ALTER TABLE public.convite_sessoes ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.convite_sessoes TO service_role;

-- ---------------------------------------------------------------------------
-- 1) Abre a sessão do convite
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.convite_iniciar(p_duracao int DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_minima int;
  v_duracao int;
  v_id uuid;
  v_concluido boolean;
BEGIN
  SELECT duracao_minima_segundos INTO v_minima FROM public.convite_config WHERE id;

  -- O visitante nunca consegue encurtar o vídeo: vale a maior duração entre a
  -- informada pelo navegador e a cadastrada no banco.
  v_duracao := greatest(coalesce(p_duracao, 0), coalesce(v_minima, 0));
  IF v_duracao > 7200 THEN
    RAISE EXCEPTION 'Duração de convite inválida' USING ERRCODE = '22023';
  END IF;

  -- Higiene: sessões antigas não se acumulam no banco.
  DELETE FROM public.convite_sessoes WHERE criado_em < now() - interval '2 days';

  v_concluido := v_duracao = 0;

  INSERT INTO public.convite_sessoes (
    duracao_segundos, trechos, concluido, concluido_em
  ) VALUES (
    v_duracao,
    CASE WHEN v_duracao > 0 THEN array_fill(false, ARRAY[v_duracao]) ELSE '{}'::boolean[] END,
    v_concluido,
    CASE WHEN v_concluido THEN now() END
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'sessao', v_id,
    'duracao', v_duracao,
    'concluido', v_concluido,
    'segundos', 0
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 2) Registra os trechos reproduzidos
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.convite_progresso(
  p_sessao uuid,
  p_trechos int[],
  p_duracao int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sessao public.convite_sessoes;
  v_trechos boolean[];
  v_cobertura numeric;
  v_limite int;
  v_novos int := 0;
  v_indice int;
  v_assistidos int;
  v_necessarios int;
  v_concluido boolean;
BEGIN
  SELECT cobertura_minima INTO v_cobertura FROM public.convite_config WHERE id;

  SELECT * INTO v_sessao FROM public.convite_sessoes WHERE id = p_sessao FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sessão do convite não encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF v_sessao.concluido THEN
    RETURN jsonb_build_object(
      'concluido', true,
      'segundos', v_sessao.segundos_assistidos,
      'duracao', v_sessao.duracao_segundos
    );
  END IF;

  -- Sessão aberta antes de o navegador saber a duração do vídeo
  IF v_sessao.duracao_segundos = 0 AND coalesce(p_duracao, 0) > 0 THEN
    v_sessao.duracao_segundos := least(p_duracao, 7200);
    v_sessao.trechos := array_fill(false, ARRAY[v_sessao.duracao_segundos]);
  END IF;

  IF v_sessao.duracao_segundos = 0 THEN
    RETURN jsonb_build_object('concluido', false, 'segundos', 0, 'duracao', 0);
  END IF;

  v_trechos := v_sessao.trechos;

  -- Um vídeo não pode ser assistido mais rápido do que o relógio: por chamada,
  -- só entram tantos segundos novos quanto o tempo real decorrido (com folga).
  v_limite := ceil(extract(epoch FROM (now() - v_sessao.atualizado_em)))::int + 3;

  FOREACH v_indice IN ARRAY coalesce(p_trechos, ARRAY[]::int[]) LOOP
    EXIT WHEN v_novos >= v_limite;
    IF v_indice >= 0 AND v_indice < v_sessao.duracao_segundos AND NOT coalesce(v_trechos[v_indice + 1], false) THEN
      v_trechos[v_indice + 1] := true;
      v_novos := v_novos + 1;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_assistidos FROM unnest(v_trechos) AS t WHERE t;
  v_necessarios := ceil(v_sessao.duracao_segundos * v_cobertura);

  -- Além da cobertura, o tempo real desde a abertura precisa ser compatível
  -- com a duração do vídeo.
  v_concluido :=
    v_assistidos >= v_necessarios
    AND extract(epoch FROM (now() - v_sessao.criado_em)) >= v_sessao.duracao_segundos * 0.8;

  UPDATE public.convite_sessoes
     SET trechos = v_trechos,
         duracao_segundos = v_sessao.duracao_segundos,
         segundos_assistidos = v_assistidos,
         atualizado_em = now(),
         concluido = v_concluido,
         concluido_em = CASE WHEN v_concluido THEN now() ELSE concluido_em END
   WHERE id = p_sessao;

  RETURN jsonb_build_object(
    'concluido', v_concluido,
    'segundos', v_assistidos,
    'duracao', v_sessao.duracao_segundos
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) Grava a inscrição — só com o convite assistido
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.convite_inscrever(
  p_sessao uuid,
  p_id uuid,
  p_nome text,
  p_telefone text,
  p_email text,
  p_grupo text
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
    RAISE EXCEPTION 'Assista ao convite até o final para se inscrever' USING ERRCODE = '42501';
  END IF;
  IF v_sessao.inscricao_id IS NOT NULL THEN
    RAISE EXCEPTION 'Esta sessão de convite já registrou uma inscrição' USING ERRCODE = '42501';
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
    RAISE EXCEPTION 'Selecione seu grupo' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.inscricoes (id, nome_completo, telefone, email, grupo)
  VALUES (v_id, v_nome, v_telefone, v_email, p_grupo);

  UPDATE public.convite_sessoes SET inscricao_id = v_id WHERE id = p_sessao;

  RETURN jsonb_build_object('id', v_id);
END;
$$;

-- Permissões: as funções são o único caminho público de inscrição.
REVOKE EXECUTE ON FUNCTION public.convite_iniciar(int) FROM public;
REVOKE EXECUTE ON FUNCTION public.convite_progresso(uuid, int[], int) FROM public;
REVOKE EXECUTE ON FUNCTION public.convite_inscrever(uuid, uuid, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.convite_iniciar(int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.convite_progresso(uuid, int[], int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.convite_inscrever(uuid, uuid, text, text, text, text) TO anon, authenticated;

-- Fecha a inserção direta: sem passar pelo convite, não há inscrição.
-- (Os registros já existentes continuam intactos; muda só quem pode inserir.)
DROP POLICY IF EXISTS "Qualquer pessoa pode se inscrever" ON public.inscricoes;
REVOKE INSERT ON public.inscricoes FROM anon, authenticated;
