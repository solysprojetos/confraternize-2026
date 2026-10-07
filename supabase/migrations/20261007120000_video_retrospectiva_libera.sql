-- O vídeo que libera a inscrição passa a ser a Retrospectiva 2025 / "Em breve
-- 2026" (21,6 s). O convite do casal (58,5 s) virou a abertura em tela cheia.
-- Com a duração antiga (58 s) o servidor exigiria mais segundos do que o
-- vídeo tem e ninguém conseguiria se inscrever.
UPDATE public.convite_config SET duracao_minima_segundos = 21 WHERE id;
