# Confraternização 2026 — Inscrições

Site de inscrição da Confraternização 2026 da Solys / SGroup / Grupo Support.

**Este projeto é gerenciado 100% pelo GitHub + Claude.** O código mora neste
repositório; cada push no branch `main` publica o site automaticamente, sem
nenhuma dependência externa de edição.

## Endereços

| O quê                                            | Onde                                                        |
| ------------------------------------------------ | ----------------------------------------------------------- |
| Site de inscrição (link para divulgar)           | https://solysprojetos.github.io/confraternize-2026/         |
| Área restrita (lista de inscritos, requer login) | https://solysprojetos.github.io/confraternize-2026/#/admin  |
| Espelho na Vercel                                | mesmo conteúdo, atualizado a cada push no `main`            |
| Deploys                                          | https://github.com/solysprojetos/confraternize-2026/actions |
| Banco de dados (Supabase, projeto próprio)       | https://supabase.com/dashboard/project/qozuvdhqhpzpreusvkkr |

## Como funciona

1. **O convite.** A pessoa abre a página, vê os dados do evento e assiste ao
   vídeo-convite, que ocupa o centro da composição.
2. **A confirmação.** Ao fim do vídeo a página abre a confirmação de presença:
   nome completo, empresa, telefone ou WhatsApp, e-mail e a resposta
   "confirmarei presença: sim ou não".
3. As respostas são gravadas na tabela `inscricoes` do projeto Supabase
   **confraternize-2026** (conta da Solys, região São Paulo). A empresa fica na
   coluna `grupo` e a resposta na coluna `comparecera`.
4. Quem confirma recebe o convite com QR code na tela e por e-mail. Quem avisa
   que não vai fica registrado, sem QR code.
5. A lista só pode ser lida na área restrita, com login e senha do
   administrador — visitantes conseguem apenas responder ao convite.

## Liberação da confirmação pelo vídeo

A trava não é só visual. O navegador informa ao banco **quais segundos do
vídeo foram realmente reproduzidos**; o banco acumula essa cobertura numa
sessão de convite e só aceita a resposta quando ela chega a 95% do vídeo.

- A barra permite rever trechos, mas não adiantar o que ainda não passou.
- A cobertura precisa acompanhar o relógio: um vídeo de 3 minutos leva 3
  minutos.
- Abrir o formulário direto, recarregar a página ou chamar a API na mão não
  grava nada: a inserção direta na tabela foi revogada e o único caminho é a
  função `convite_inscrever`, que confere a sessão.
- A liberação vale para a mesma sessão do navegador, e voltar ao convite não
  apaga o que já foi digitado.

> **Enquanto não houver vídeo cadastrado, a confirmação fica indisponível.**
> A página mostra a peça de espera e o botão permanece bloqueado.

## Migrações pendentes

Duas migrações precisam ser aplicadas no Supabase para o site funcionar por
inteiro:

| Arquivo                                  | O que faz                                      |
| ---------------------------------------- | ---------------------------------------------- |
| `20260913120000_liberacao_por_video.sql` | Valida no servidor que o convite foi assistido |
| `20260914120000_resposta_do_convite.sql` | Cria a coluna `comparecera` (sim/não)          |

Enquanto elas não forem aplicadas, o site continua recebendo confirmações pelo
caminho antigo; respostas negativas, porém, só podem ser registradas depois da
segunda migração.

## O vídeo do convite

O convite publicado é `public/convite/convite-confraternizacao-2026.mp4`:
vertical (1080x1920), 58,5 s, H.264 + AAC, com o índice no começo do arquivo
para começar a tocar sem baixar tudo. O `<video>` usa `preload="metadata"`,
então os 30 MB só descem quando a pessoa aperta play.

O banco guarda a duração real (58 s) em `convite_config`. É ela que o
servidor exige, então não adianta chamar a função à mão dizendo que o vídeo
é curto.

### Para trocar o vídeo

1. Coloque os arquivos em `public/convite/` (vídeo MP4, capa e, se houver,
   legendas em `.vtt`).
2. Aponte os caminhos em `src/config/evento.ts` (`videoConvite.src`,
   `poster` e `legendas.src`) e ajuste `proporcao` para a proporção real
   (9/16 no vídeo vertical de hoje, 16/9 num horizontal).
3. Cadastre a nova duração no banco, em segundos:

   ```sql
   update public.convite_config set duracao_minima_segundos = 58;
   ```

Os dados do evento (nome, chamada, data, horário, endereço e link do mapa)
ficam no mesmo `src/config/evento.ts`.

## Identidade visual

- Projeto editorial: azul-marinho profundo no convite, off-white nas áreas de
  leitura, dourado apenas em filetes, numerais e no botão de confirmação.
- Títulos em Instrument Serif e textos em Inter, servidos pelo próprio site
  (`src/assets/fonts/`), sem depender de servidor externo.
- Textura de papel quase imperceptível, cantos retos, sem sombras artificiais.
- Revelação discreta ao rolar, desligada para quem prefere movimento reduzido.
- Logos oficiais em WebP com PNG de reserva, abrindo a página como papel
  timbrado. As três ficam sobre o mesmo fundo claro, sem caixa atrás de
  nenhuma: a arte do Grupo Support veio branca, então o site usa a versão em
  marinho (`support-escuro`), gerada a partir dela. Os arquivos são
  recortados no limite da arte, para que a mesma altura no CSS resulte na
  mesma altura aparente das três.

## Publicação

O workflow `.github/workflows/deploy-pages.yml` roda a cada push no `main`:
builda o site estático (`bun run build:pages`) e publica no GitHub Pages
(artefato do Actions + espelho no branch `gh-pages`). A Vercel, conectada ao
repositório, builda o mesmo commit com o `vercel.json`.

## Desenvolvimento local

```sh
bun install
bun run dev            # app completo (TanStack Start)
bun run build:pages    # build estático publicado (raiz em pages-static/)
bun run preview:pages  # serve o build estático localmente
```

As credenciais públicas do Supabase ficam em `.env` (chave _publishable_ —
segura para ser exposta; as permissões reais são as políticas de RLS do banco).
