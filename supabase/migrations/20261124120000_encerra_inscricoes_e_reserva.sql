-- Encerramento das inscrições e cadastro reserva.
--
-- 1) As 309 primeiras inscrições (por ordem de chegada) formam a lista
--    principal; as demais ficam no cadastro reserva.
-- 2) O banco deixa de aceitar inscrições novas.
-- 3) O admin pode mover uma pessoa entre a lista e a reserva (ex.: alguém da
--    lista desistiu e entra a primeira da reserva).

ALTER TABLE public.inscricoes
  ADD COLUMN IF NOT EXISTS cadastro_reserva boolean NOT NULL DEFAULT false;

UPDATE public.inscricoes i
SET cadastro_reserva = (o.posicao > 309)
FROM (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS posicao
  FROM public.inscricoes
) o
WHERE o.id = i.id;

-- Inscrições encerradas: o gatilho que já limitava o total agora recusa tudo.
CREATE OR REPLACE FUNCTION public.limita_inscricoes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Inscrições encerradas' USING ERRCODE = 'P0001';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.limita_inscricoes() FROM anon, authenticated, public;

-- Mover entre lista principal e cadastro reserva (somente o admin).
CREATE OR REPLACE FUNCTION public.admin_definir_reserva(
  p_inscricao uuid,
  p_reserva boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (auth.jwt()->>'email') IS DISTINCT FROM 'solysprojetos@gmail.com' THEN
    RAISE EXCEPTION 'Somente o admin pode alterar' USING ERRCODE = '42501';
  END IF;
  UPDATE public.inscricoes SET cadastro_reserva = p_reserva WHERE id = p_inscricao;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inscrição não encontrada' USING ERRCODE = '22023';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_definir_reserva(uuid, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_definir_reserva(uuid, boolean) TO authenticated;
