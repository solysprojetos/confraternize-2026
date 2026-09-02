# Celebra 2026 — Inscrições

Site de inscrição da Celebra 2026 da Solys / SGroup / Grupo Support.

**Este projeto é gerenciado 100% pelo GitHub + Claude.** O código mora neste
repositório; cada push no branch `main` publica o site automaticamente, sem
nenhuma dependência externa de edição.

## Endereços

| O quê | Onde |
|---|---|
| Site de inscrição (link para divulgar) | https://solysprojetos.github.io/confraternize-2026/ |
| Área restrita (lista de inscritos, requer login) | https://solysprojetos.github.io/confraternize-2026/#/admin |
| Espelho na Vercel | mesmo conteúdo, atualizado a cada push no `main` |
| Deploys | https://github.com/solysprojetos/confraternize-2026/actions |
| Banco de dados (Supabase, projeto próprio) | https://supabase.com/dashboard/project/qozuvdhqhpzpreusvkkr |

## Como funciona

1. A pessoa preenche nome, telefone, e-mail e escolhe o grupo
   (SGroup Nacional, Solys Gestão Administrativa ou Grupo Support).
2. Os dados são validados e gravados na tabela `inscricoes` do projeto
   Supabase **confraternize-2026** (conta da Solys, região São Paulo).
3. A lista só pode ser lida na área restrita, com login e senha do
   administrador — visitantes conseguem apenas se inscrever.

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

As credenciais públicas do Supabase ficam em `.env` (chave *publishable* —
segura para ser exposta; as permissões reais são as políticas de RLS do banco).
