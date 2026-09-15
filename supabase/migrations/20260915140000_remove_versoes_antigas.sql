-- Remove as versões antigas de convite_inscrever.
--
-- Cada uma das três migrações anteriores criou convite_inscrever com uma
-- assinatura diferente (6, 7, 8 e 9 argumentos). No Postgres isso não
-- substitui a função: cria uma sobrecarga. Depois de aplicar todas, as quatro
-- versões conviviam no banco.
--
-- Isso é um buraco: as três primeiras não exigem setor nem cargo — a de seis
-- argumentos nem sequer registra a recusa — e continuavam liberadas para
-- anon. Quem chamasse a API na mão escolheria a versão sem as regras.
--
-- O site sempre chama a versão completa, de nove argumentos, e só recorreria
-- às antigas se ela não existisse. Então as antigas saem.
DROP FUNCTION IF EXISTS public.convite_inscrever(uuid, uuid, text, text, text, text);
DROP FUNCTION IF EXISTS public.convite_inscrever(uuid, uuid, text, text, text, text, boolean);
DROP FUNCTION IF EXISTS public.convite_inscrever(uuid, uuid, text, text, text, text, boolean, text);
