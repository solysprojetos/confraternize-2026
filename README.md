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

1. **Etapa 1 — convite.** A pessoa vê as informações do evento e assiste ao
   vídeo-convite. O formulário fica oculto até o vídeo terminar.
2. **Etapa 2 — inscrição.** Liberado o convite, ela preenche nome, telefone,
   e-mail e escolhe o grupo (Grupo Support, SGroup Nacional, Solys Gestão
   Administrativa, Parceiros ou Convidados).
3. Os dados são validados e gravados na tabela `inscricoes` do projeto
   Supabase **confraternize-2026** (conta da Solys, região São Paulo).
4. A lista só pode ser lida na área restrita, com login e senha do
   administrador — visitantes conseguem apenas se inscrever.

## Liberação da inscrição pelo vídeo

A trava não é só visual. O navegador informa ao banco **quais segundos do
vídeo foram realmente reproduzidos**; o banco acumula essa cobertura numa
sessão de convite e só grava a inscrição quando ela chega a 95% do vídeo.

- A barra permite rever trechos, mas não adiantar o que ainda não passou.
- Não adianta deixar o vídeo mudo em outra aba e voltar: a cobertura precisa
  acompanhar o relógio, então um vídeo de 3 minutos leva 3 minutos.
- Abrir o formulário direto, recarregar a página ou chamar a API na mão não
  grava nada: a inserção direta na tabela foi revogada e o único caminho é a
  função `convite_inscrever`, que confere a sessão.
- A liberação vale para a mesma sessão do navegador: quem já assistiu não
  precisa ver de novo se recarregar a página.

## Publicar o vídeo do convite

1. Coloque os arquivos em `public/convite/` (vídeo MP4, capa e, se houver,
   legendas em `.vtt`).
2. Aponte os caminhos em `src/config/evento.ts` (`videoConvite.src`,
   `poster` e `legendas.src`).
3. Cadastre a duração do vídeo no banco, em segundos — é ela que o servidor
   usa para validar a liberação:

   ```sql
   update public.convite_config set duracao_minima_segundos = 180;
   ```

Enquanto `videoConvite.src` estiver vazio e a duração no banco for `0`, a
página avisa que o convite chega em breve e mantém as inscrições abertas.

A data completa do evento aparece em destaque assim que for preenchida em
`evento.data` / `evento.dataExtenso` no mesmo arquivo.

### Proteções do banco (para ele não crescer sem controle)

- **E-mail único**: a mesma pessoa não consegue se inscrever duas vezes.
- **Teto de 1500 inscrições**: acima disso o banco recusa novos registros
  (ajustável quando necessário).
- **Leitura restrita**: apenas o e-mail administrador enxerga os dados.
- O banco é **separado** de qualquer outro projeto (ex.: Mulheres Curadas) —
  cada projeto Supabase tem sua própria cota, um não interfere no outro.

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
