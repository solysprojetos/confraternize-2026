-- Lembretes por e-mail para quem confirmou presença: uma semana antes e na
-- véspera. A função enviar-convite decide pela data qual lembrete vale e
-- marca aqui quem já recebeu, para ninguém receber o mesmo lembrete duas vezes.
ALTER TABLE public.inscricoes
  ADD COLUMN IF NOT EXISTS lembrete_semana_enviado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lembrete_vespera_enviado boolean NOT NULL DEFAULT false;

-- Agendamento dentro do próprio banco: de 12 a 19 de dezembro, às 09h e às 14h
-- de Fortaleza (12h e 17h UTC). A segunda rodada pega quem confirmou no meio do
-- dia e o que tiver ficado para trás pela cota diária do Brevo. Fora das
-- datas dos lembretes a função não envia nada.
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule('lembretes-confra-2026')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'lembretes-confra-2026');

SELECT cron.schedule(
  'lembretes-confra-2026',
  '0 12,17 12-19 12 *',
  $$
  SELECT net.http_post(
    url := 'https://qozuvdhqhpzpreusvkkr.supabase.co/functions/v1/enviar-convite',
    headers := '{"content-type": "application/json"}'::jsonb,
    body := '{"lembretes": true}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
