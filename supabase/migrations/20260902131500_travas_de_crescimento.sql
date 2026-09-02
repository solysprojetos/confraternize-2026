-- Impede inscricao duplicada pelo mesmo e-mail (maiusculas/minusculas nao importam)
CREATE UNIQUE INDEX inscricoes_email_unico ON public.inscricoes (lower(email));

-- Teto de inscricoes: o banco nunca cresce alem de 1500 registros
CREATE OR REPLACE FUNCTION public.limita_inscricoes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT count(*) FROM public.inscricoes) >= 1500 THEN
    RAISE EXCEPTION 'Limite de inscricoes atingido';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_limita_inscricoes
  BEFORE INSERT ON public.inscricoes
  FOR EACH ROW EXECUTE FUNCTION public.limita_inscricoes();

-- A funcao do gatilho nao deve ser chamavel pela API publica
REVOKE EXECUTE ON FUNCTION public.limita_inscricoes() FROM anon, authenticated, public;
