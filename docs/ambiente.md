# Variáveis de ambiente

**Subtarefa:** I0.7 do plano orquestrado.  
**Base:** ADR-0001 §3 e especificação v1.1 §4.4 e §7.1.

Valores reais nunca entram no Git, no chat nem em issue. O `.env.example` lista os nomes; cada ambiente recebe os valores no lugar indicado abaixo.

## 1. Variáveis

| Variável | Visibilidade | O que é | Onde obter |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | pública | URL da API do projeto Supabase | painel do Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | pública | chave publicável (`sb_publishable_…`); em projetos antigos, a chave `anon` | painel do Supabase → Project Settings → API Keys |
| `SUPABASE_SECRET_KEY` | **somente servidor** | chave secreta (`sb_secret_…`), equivalente à antiga `service_role`; ignora o RLS | painel do Supabase → Project Settings → API Keys |
| `SUPABASE_PROJECT_REF` | ferramenta local | identificador do projeto (ex.: `ralmlmuewullugeqtgoz`) | URL do painel do projeto |
| `SUPABASE_DB_URL` | **ferramenta local, secreta** | conexão Postgres para migrações e testes de banco | painel do Supabase → Connect → *Session pooler* (host `aws-<n>-sa-east-1.pooler.supabase.com`), com a senha do banco codificada para URL e **sem** `sslmode`: o TLS é configurado no cliente com o certificado de CA do Supabase (`prod-ca-2021.crt`) |

## 2. Onde cada ambiente recebe os valores

| Ambiente | Projeto Supabase | Onde os valores ficam | Variáveis |
|---|---|---|---|
| Local (`dev`) | `ralmlmuewullugeqtgoz` | `.env` ou `.env.local` na raiz, ambos ignorados pelo Git | todas |
| Homologação (previews da Vercel, branch `main`) | `ralmlmuewullugeqtgoz` | Vercel → projeto `ideal-garbanzo` → Environment Variables → **Preview** | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e, quando o código precisar, `SUPABASE_SECRET_KEY` |
| Produção (branch `producao`) | `repasse-prod`, a criar no Inc. 6 | Vercel → **Production** | **nenhuma até o Inc. 6** |
| CI (GitHub Actions) | Supabase efêmero no runner | gerado pelo próprio job | nenhuma cadastrada |

**Produção sem variáveis até o Inc. 6:** assim, o deploy de produção não consegue falar com o banco de desenvolvimento e homologação.

## 3. Regras

- **Prefixo `NEXT_PUBLIC_`:** só para valores que podem ir para o navegador. A chave secreta e a URL do banco nunca levam esse prefixo.
- **`SUPABASE_SECRET_KEY`:** só em módulos que importam `server-only`. Na Vercel, cadastrar como *Sensitive*.
- **`SUPABASE_DB_URL`:** só na máquina de quem roda migrações e testes de banco (T2). Não vai para a Vercel.
- **Novas variáveis:** cada variável nova entra no `.env.example` e nesta página, na mesma mudança que a usa.
- **Vazamento:** se um segredo vazar, gire a chave no painel do Supabase e atualize os lugares acima.

## 4. Projeto único no plano gratuito

Por decisão da pessoa responsável (27/10), `dev` e homologação usam o mesmo projeto, no plano gratuito.

- **Reset e testes de banco** apagam também os dados de homologação. Por isso o projeto só guarda dados de teste identificados.
- **Pausa por inatividade:** projetos gratuitos pausam depois de um período sem uso; reativar pelo painel. Conferir os limites atuais do plano na página de preços do Supabase.
- **Produção:** exige um projeto próprio (`repasse-prod`) no Inc. 6.
