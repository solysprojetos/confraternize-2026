-- Os setores passam a existir no banco, e não só na lista do site.
--
-- Até agora convite_inscrever aceitava qualquer texto de até 80 caracteres
-- como setor: quem chamasse a API na mão gravaria "xyz". Agora só entram os
-- nomes cadastrados aqui.
--
-- A lista é uma TABELA, não um CHECK, de propósito: incluir, renomear ou
-- desativar um setor é editar uma linha, sem migração nova. Os nomes precisam
-- bater com os de src/config/evento.ts, que é o que o formulário mostra.
CREATE TABLE public.convite_setores (
  nome text PRIMARY KEY CHECK (length(btrim(nome)) BETWEEN 2 AND 80),
  ordem int NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true
);

ALTER TABLE public.convite_setores ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.convite_setores TO service_role;

INSERT INTO public.convite_setores (nome, ordem) VALUES
  ('Administrativo', 1),
  ('Financeiro', 2),
  ('Comercial', 3),
  ('Recursos Humanos', 4),
  ('Operações', 5),
  ('Tecnologia da Informação', 6),
  ('Marketing', 7),
  ('Jurídico', 8),
  ('Logística', 9),
  ('Atendimento', 10),
  ('Diretoria', 11),
  ('Outro', 12);

CREATE OR REPLACE FUNCTION public.convite_inscrever(
  p_sessao uuid,
  p_id uuid,
  p_nome text,
  p_telefone text,
  p_email text,
  p_grupo text,
  p_comparecera boolean DEFAULT true,
  p_cargo text DEFAULT NULL,
  p_setor text DEFAULT NULL
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
  v_setor text := nullif(btrim(coalesce(p_setor, '')), '');
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

  IF p_grupo IN ('sgroup', 'solys', 'grupo_support') THEN
    -- O setor precisa ser um dos cadastrados e ativos
    IF v_setor IS NULL
       OR NOT EXISTS (SELECT 1 FROM public.convite_setores WHERE nome = v_setor AND ativo) THEN
      RAISE EXCEPTION 'Selecione o seu setor' USING ERRCODE = '22023';
    END IF;
    IF v_cargo IS NULL OR length(v_cargo) < 2 THEN
      RAISE EXCEPTION 'Informe o seu cargo' USING ERRCODE = '22023';
    END IF;
    IF length(v_cargo) > 120 THEN
      RAISE EXCEPTION 'Cargo muito longo' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_cargo := NULL;
    v_setor := NULL;
  END IF;

  INSERT INTO public.inscricoes (id, nome_completo, telefone, email, grupo, comparecera, cargo, setor)
  VALUES (v_id, v_nome, v_telefone, v_email, p_grupo, coalesce(p_comparecera, true), v_cargo, v_setor);

  UPDATE public.convite_sessoes SET inscricao_id = v_id WHERE id = p_sessao;

  RETURN jsonb_build_object(
    'id', v_id, 'comparecera', coalesce(p_comparecera, true), 'cargo', v_cargo, 'setor', v_setor
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.convite_inscrever(uuid, uuid, text, text, text, text, boolean, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.convite_inscrever(uuid, uuid, text, text, text, text, boolean, text, text)
  TO anon, authenticated;
