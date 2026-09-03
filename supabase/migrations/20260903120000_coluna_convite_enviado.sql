-- Marca quais inscricoes ja receberam o e-mail de convite (fila de reenvio)
ALTER TABLE public.inscricoes ADD COLUMN convite_enviado boolean NOT NULL DEFAULT false;
