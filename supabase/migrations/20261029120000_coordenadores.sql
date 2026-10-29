-- Coordenadores de cada grupo. Cada convidado pode ficar sob um coordenador,
-- e o admin transfere a pessoa de um coordenador para outro pela aba
-- "Coordenadores" da área restrita.
CREATE TABLE public.coordenadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL CHECK (length(btrim(nome)) BETWEEN 2 AND 120),
  grupo text NOT NULL CHECK (grupo IN ('sgroup', 'solys', 'grupo_support', 'parceiros', 'convidados')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.coordenadores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.coordenadores FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coordenadores TO authenticated;
GRANT ALL ON public.coordenadores TO service_role;

CREATE POLICY "Somente admin gerencia coordenadores" ON public.coordenadores
  FOR ALL TO authenticated
  USING ((auth.jwt()->>'email') = 'solysprojetos@gmail.com')
  WITH CHECK ((auth.jwt()->>'email') = 'solysprojetos@gmail.com');

-- Apagar um coordenador devolve as pessoas dele para "sem coordenador".
ALTER TABLE public.inscricoes
  ADD COLUMN coordenador_id uuid REFERENCES public.coordenadores (id) ON DELETE SET NULL;

-- A transferência passa por uma função, e não por UPDATE direto na tabela:
-- assim o admin só consegue mexer no coordenador, nunca nos dados da pessoa.
CREATE OR REPLACE FUNCTION public.admin_transferir_coordenador(
  p_inscricao uuid,
  p_coordenador uuid
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
  IF p_coordenador IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.coordenadores WHERE id = p_coordenador) THEN
    RAISE EXCEPTION 'Coordenador não encontrado' USING ERRCODE = '22023';
  END IF;
  UPDATE public.inscricoes SET coordenador_id = p_coordenador WHERE id = p_inscricao;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inscrição não encontrada' USING ERRCODE = '22023';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_transferir_coordenador(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_transferir_coordenador(uuid, uuid) TO authenticated;
