-- Projetos gratuitos do Supabase hibernam após ~7 dias sem uso, e o robô
-- diário do GitHub (keep-alive.yml) é desligado pelo próprio GitHub depois de
-- 60 dias sem commits no repositório. Para os lembretes de dezembro não
-- dependerem disso, o banco faz a própria consulta diária pela API, às 07h41
-- de Fortaleza.
SELECT cron.unschedule('mantem-ativo-confra-2026')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mantem-ativo-confra-2026');

SELECT cron.schedule(
  'mantem-ativo-confra-2026',
  '41 10 * * *',
  $$
  SELECT net.http_get(
    url := 'https://qozuvdhqhpzpreusvkkr.supabase.co/rest/v1/convite_setores?select=nome&limit=1',
    headers := '{"apikey": "sb_publishable_BG6LttsyALYbyKjxASE9ag_xxAJMAge"}'::jsonb
  );
  $$
);
