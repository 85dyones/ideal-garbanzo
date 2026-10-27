# Tarefa atual

**Etapa:** Inc. 0, Fundação (plano v2)  
**Próximas subtarefas:**
- **Push (H)** e CI verde com a migração da I0.6: fecha o gate do Inc. 0.
- **Inc. 1 (T2 + T0):** começar pela I1.1 (regras de identidade, T0) e pela I1.2 (ADR-0002, T2).

> **Repositório público:** este registro não traz segredos, dados pessoais nem detalhes internos ou de segurança de outros negócios. O registro completo fica em `notas-privadas/`, fora do Git.

## Registro

- Perfil/modelo principal:
- Subagentes e perfis utilizados:
- Fallback informado pelo gateway (com evidência):
- Testes executados e resultados:
- Critérios ainda pendentes:
- Escalonamentos e motivo:

## Histórico

<!-- Uma entrada por subtarefa concluída: data, ID, resultado, evidência. -->

### 2026-10-22 · P1 · concluída

- Repositório local na `main`, commit inicial com os documentos, `.gitignore` testado com `git check-ignore` (`.env*` ignorados; `.env.example` versionável). Remoto `origin` configurado. Identidade do Git configurada só neste repositório.

### 2026-10-26 · Missão 001 · diagnóstico

- T2 com um subagente T0 (leitura) e um de pesquisa web. Amostras do T0 conferidas pelo T2.
- Entrega: `docs/diagnostico/2026-10-26-missao-001.md` (versão pública).
- Direção da pessoa responsável: o repasse é uma operação separada; produto único, à parte.

### 2026-10-26 · Especificação v1.1 e plano v2

- D1 a D4 aprovadas. `docs/especificacao/especificacao-v1.1.md` escrita e aprovada; plano orquestrado v2 com incrementos 0 a 6.
- Conferido: os 6 estados documentais, as 5 origens da informação, a ciência versionada, os 16 itens do MVP e os 13 critérios de aceite do briefing estão cobertos; os 13 testes negativos da §7.4 têm incremento responsável.

### 2026-10-26 · I0.1 e I0.2

- I0.1 executada pelo T2 (o T0 não roda comandos): Node 24.22.1, npm 11.19.1, Git 2.55; sem Supabase CLI, Docker, `psql`, Vercel CLI e `gh`.
- I0.2: `docs/adr/0001-fundacao.md`.

### 2026-10-26 · I0.4 · concluída e integrada

- `builder` (T1) em worktree isolado.
  - Primeira tentativa: handoff correto, porque o ESLint 10 não fecha com os plugins do `eslint-config-next`. O T2 decidiu pelo ESLint 9.39.5.
  - Segunda tentativa: esqueleto Next 16, TypeScript 6.0.3, Tailwind 4, Vitest 5 e teste de linguagem proibida.
- Verificação do T2 a partir de `npm ci` limpo:
  - 0 `ERESOLVE`; `npm ls`, `lint`, `typecheck`, `test` (44), `format:check` e `build` com saída 0;
  - prova de falha do teste de linguagem proibida refeita.
- Integração por fast-forward. Risco aceito no ADR: ESLint 9 marcado como sem suporte.

### 2026-10-26 a 27 · D1 · infraestrutura

- 26/10: revista para servidor próprio com Easypanel. 27/10: **decisão final**, Supabase Cloud e Vercel, sem Docker local; a `main` gera previews e a produção sai da branch `producao`. As subtarefas I0.12 e I0.13 foram canceladas.
- Limites da automação nesta sessão: a integração da Vercel não cria projetos (403) nem lê a branch de produção; push exige ação ou liberação da pessoa responsável.

### 2026-10-27 · I0.9 · concluída (exceto variáveis do Supabase)

- Projeto `ideal-garbanzo` na Vercel, criado pela pessoa responsável; Next.js, Node 24.x.
- Primeiro deploy saiu como produção: a branch de produção ainda era a `main`. Com a proteção "Standard", o domínio de produção `.vercel.app` ficou público por alguns minutos (só a página de construção, sem dados). O T2 ligou a autenticação da Vercel em todos os deploys (`ssoProtection: all`) e trocou a região das funções para `gru1`.
- A pessoa responsável criou a branch `producao` e a definiu como branch de produção.
- Resultado verificado: push na `main` gera preview (`target: null`), em `gru1`; produção só a partir da `producao`. Endereços testados sem login: todos redirecionam para o login da Vercel.

### 2026-10-27 · I0.3, I0.7 e I0.8

- **I0.3 (pessoa responsável):** um único projeto Supabase, `gtbncxvaghjfmzcypgul`, no plano gratuito, para `dev` e homologação. A integração desta sessão não tem acesso a ele; região e status não conferidos.
- **I0.7 (T2):** `.env.example` (cinco nomes, sem valores) e `docs/ambiente.md`. Produção sem variáveis do Supabase até o Inc. 6.
- **I0.8 (T2, parcial):** `.github/workflows/ci.yml` com os jobs `qualidade` e `build`; comandos verdes localmente; YAML validado pelo Prettier.

### 2026-10-27 · Primeiro CI no GitHub

- Push da `main` feito pela pessoa responsável.
- **CI:** os jobs "Lint, tipos, testes e formatação" e "Build do Next" terminaram com `success`.
- **Vercel:** o deploy da `main` saiu como preview; a produção continua na `producao`.
- **Repositório:** `ideal-garbanzo` é público, por decisão da pessoa responsável. Por isso, os documentos foram revisados em 27/10 para tirar detalhes internos e de segurança de outros negócios. Um achado de segurança fora do escopo do repasse foi registrado em `notas-privadas/` e tratado com a pessoa responsável.

### 2026-10-27 · I0.11 · bloqueada: credenciais do projeto errado

- A pessoa responsável colocou um `.env` na raiz, ignorado pelo Git.
- **Conferência sem exibir valores:** as cinco variáveis estão preenchidas e as chaves são do formato novo. Mas a URL, a conexão do banco e o identificador apontam para **um projeto Supabase de outro negócio, em produção**, não para o `gtbncxvaghjfmzcypgul`. Detalhes em `notas-privadas/`.
- **O T2 parou antes de qualquer conexão:** nenhuma chamada à API, nenhuma conexão ao banco, nenhum reset.
- **Outros problemas do arquivo:**
  - nome da variável repetido na linha da URL;
  - conexão direta em vez do pooler;
  - senha com caracteres que precisam de codificação na URL.
- **Pendente (H):** substituir os valores pelos do `gtbncxvaghjfmzcypgul`, seguindo `docs/ambiente.md`.
- **Segunda conferência (27/10), depois da troca:**
  - URL pública e `SUPABASE_PROJECT_REF`: corretas (`gtbncxvaghjfmzcypgul`);
  - API: `/auth/v1/health` deu 401 sem chave e **200 com a chave publicável**, então URL e chave publicável são válidas. `/rest/v1/` deu 401 com a chave publicável, o que é esperado para a raiz da API com chave publicável;
  - **ainda com problema:** a `SUPABASE_SECRET_KEY` é idêntica à chave publicável, e a `SUPABASE_DB_URL` usa a conexão direta, com senha não codificada (URL inválida);
  - **DNS:** o host direto `db.gtbncxvaghjfmzcypgul.supabase.co` só resolve em IPv6. O pooler é obrigatório, inclusive para o CI.
  - Nenhuma conexão ao banco foi feita.
- **Terceira conferência (27/10):**
  - `SUPABASE_DB_URL` válida (senha codificada), mas ainda na conexão direta, com usuário `postgres` e sem `sslmode`. A `SUPABASE_SECRET_KEY` continua idêntica à chave publicável.
  - TCP por IPv6 até a porta 5432 do host direto: conecta, a partir desta máquina.
  - Consulta de leitura com `pg` 8.23.1 instalado numa pasta temporária, fora do projeto, com TLS verificado: falhou com `SELF_SIGNED_CERT_IN_CHAIN`. O certificado do banco é assinado pela CA própria do Supabase.
  - Uma segunda tentativa, sem verificar o certificado, foi barrada pelo classificador de permissões e não foi feita. Decisão: nunca desligar a verificação; usar o certificado de CA do Supabase.
- **Pendente (H):**
  - colocar a chave `sb_secret_…` na `SUPABASE_SECRET_KEY`;
  - trocar a `SUPABASE_DB_URL` pela do pooler (Session pooler, com `?sslmode=require`), necessária para IPv4 e para o CI;
  - baixar o certificado de CA do projeto (Project Settings → Database → SSL Configuration → Download certificate).

### 2026-10-27 · I0.11 · concluída

- **Certificado:** a pessoa responsável colocou `prod-ca-2021.crt` na raiz. Conferido com `X509Certificate`: "Supabase Root 2021 CA", autoassinado, CA, válido até 26/04/2031. Ainda não versionado; o lugar definitivo é decidido na I0.5.
- **`.env`:**
  - URL e `SUPABASE_PROJECT_REF` em `gtbncxvaghjfmzcypgul`;
  - chave publicável `sb_publishable_` e chave secreta `sb_secret_`, diferentes entre si;
  - `SUPABASE_DB_URL` no pooler (Session, porta 5432), usuário `postgres.gtbncxvaghjfmzcypgul`, sem `sslmode` na URL (o TLS é configurado pelo cliente, com a CA).
- **API:** a raiz REST deu 401 com a chave publicável e 200 com a secreta.
- **Banco:** conexão pelo pooler com TLS verificado pela CA do Supabase (`pg` 8.23.1, numa pasta temporária fora do projeto), dentro de `begin read only`:
  - Postgres 17.11;
  - 0 tabelas no `public`;
  - schemas `auth` e `storage` presentes;
  - `pgtap` e `pg_cron` disponíveis, não instaladas.
- **Achado:** o host do pooler é de `us-east-1`. O projeto foi criado nos EUA, e não em `sa-east-1` como previa o ADR-0001, enquanto as funções da Vercel estão em `gru1`.
  - Opções: recriar o projeto em `sa-east-1` agora, enquanto está vazio, ou mover as funções para `iad1`, perto do banco.
  - A decisão é da pessoa responsável.

### 2026-10-27 · Projeto Supabase recriado em `sa-east-1`

- A pessoa responsável recriou o projeto em `sa-east-1` e atualizou o `.env`. O projeto novo é `ralmlmuewullugeqtgoz`.
- **Conferência sem exibir valores:**
  - URL e chaves do projeto novo (`sb_publishable_` e `sb_secret_`, diferentes entre si);
  - `SUPABASE_DB_URL` no pooler `aws-1-sa-east-1.pooler.supabase.com`, porta 5432, usuário `postgres.ralmlmuewullugeqtgoz`.
  - O `SUPABASE_PROJECT_REF` ainda tinha o identificador antigo. O T2 corrigiu só essa linha, que não é segredo, com `sed`, sem ler o arquivo.
- **API:** `auth` deu 401 sem chave e 200 com a publicável; a raiz REST deu 401 com a publicável e 200 com a secreta.
- **Banco:** conexão pelo pooler com TLS verificado pela mesma CA (`prod-ca-2021.crt`), dentro de `begin read only`, em 276 ms (contra 1.487 ms no projeto de `us-east-1`). Postgres 17.11, `public` vazio, `auth` e `storage` presentes, `pgtap` e `pg_cron` disponíveis.
- O identificador antigo foi trocado pelo novo em `CLAUDE.md`, ADR-0001, `docs/ambiente.md` e plano. No histórico acima, o antigo fica como registro.
- `docs/ambiente.md`: a `SUPABASE_DB_URL` vai **sem** `sslmode`, porque o parâmetro na URL se sobrepõe à configuração de TLS do cliente e descarta a CA.
- O projeto antigo (`us-east-1`) fica a critério da pessoa responsável (pausar ou excluir); não tem dados do repasse.

### 2026-10-27 · I0.5 · concluída (job de banco no CI aguarda a primeira execução)

- **Perfil/modelo:** T2, Claude Opus 5.5. Sem subagentes, porque o banco de desenvolvimento é compartilhado.
- **Dependências** (versão exata): `supabase` 2.122.0 (CLI; binário em pacotes opcionais, sem script de instalação e sem `allowScripts`), `pg` 8.23.1, `@types/pg` 8.23.1. `npm install` sem `ERESOLVE`.
- **`npx supabase init`:** `supabase/config.toml` com `project_id = "repasse"` e Postgres 17. O certificado de CA foi para `supabase/certs/prod-ca-2021.crt`, versionado por ser público.
- **Entregas:**
  - `config/banco-dev.json` lista os destinos permitidos;
  - `scripts/lib/` contém ambiente, trava de destino, conexão com TLS e advisory lock, e leitor TAP;
  - `scripts/db-reset.mjs`, `scripts/testes-de-banco.mjs` e `scripts/ci-ambiente-supabase.mjs`;
  - `supabase/tests/database/000-fundacao.test.sql` e `supabase/tests/README.md`;
  - `vitest.integration.config.mts` e `tests/integration/`;
  - testes unitários `tests/banco-destino.test.ts` e `tests/tap.test.ts`;
  - scripts `db:reset`, `test:db` e `test:integration`;
  - job `banco` no `ci.yml`.
- **Verificação no projeto de desenvolvimento:**
  - lint, typecheck, `npm test` (60 testes) e `format:check`: saída 0;
  - trava de destino com URL falsa de outro projeto e com host qualquer: recusado, saída 2, sem conectar;
  - `db:reset` e `test:db`: ok (6 testes);
  - migração temporária (tabela, enum, função, view): aplicada e registrada; depois de removida, o reset tirou tudo e zerou o histórico, e os grants do `public` se mantiveram. A migração temporária não foi versionada;
  - runner contra testes ruins: `not ok`, plano não cumprido e erro de SQL deram FALHA (saída 1); pasta sem testes: saída 1;
  - `test:integration`: 3 testes ok. Sem a URL ou com destino estranho, a suíte **falha** com a mensagem explícita ("Variáveis ausentes" ou "Destino recusado");
  - advisory lock: com outro processo segurando a trava por 12 s, o `test:db` esperou e terminou depois da liberação;
  - `ci-ambiente-supabase.mjs` testado com status falso de nomes novos e antigos (ok) e incompleto (saída 1).
- **Não verificado:** o job `banco` no GitHub Actions (sem Docker local). Depende do push.

### 2026-10-27 · I0.8 · concluída; I0.5 confirmada no CI

- Push do `3139113` feito pela pessoa responsável.
- **CI** (execução 40596166065): os jobs "Lint, tipos, testes e formatação", "Build do Next" e **"Banco (Supabase efêmero, pgTAP e integração)"** terminaram com `success`.
- **Passos do job `banco`, todos `success`:**
  - `supabase start` (111 s);
  - exportação das variáveis;
  - `db:reset`, `test:db` e `test:integration`;
  - `supabase stop`.
- O log detalhado do job exige login no GitHub (HTTP 403 sem autenticação); o resultado vem das conclusões dos passos. Os scripts saem com erro quando há falha ou quando falta teste.
- **Vercel:** preview do `3139113` `READY` (`target: null`).

### 2026-10-27 · I0.6 · concluída

- **Perfil/modelo:** T2, Claude Opus 5.5. Em paralelo, a I0.10 com o `builder`.
- **Migração `supabase/migrations/20261027224325_base_auditoria.sql`**, criada com `npx supabase migration new`:
  - `audit_logs`, `field_history` e `restricted_access_logs` só de inclusão, com o gatilho genérico `impedir_alteracao_de_registro()` (UPDATE e DELETE por linha, TRUNCATE por comando);
  - `platform_settings` **vazia**, sem valor comercial inventado (gate 7);
  - RLS ligado nas quatro;
  - todos os privilégios de `anon` e `authenticated` revogados (as políticas de leitura entram no Inc. 1). O `service_role` só lê e insere nas tabelas só de inclusão;
  - campos de ator sem chave estrangeira até a `profiles` existir (I1.3).
- **Testes:** `supabase/tests/database/010-base-auditoria.test.sql`, com 29 asserções. `db:reset` aplicou a migração, e `test:db` passou (6 + 29).
- **Verificação de mutação (gate 3)**, com a migração alterada só temporariamente:
  - M1, sem o gatilho em `audit_logs`: "UPDATE recusado" e "DELETE recusado" falharam;
  - M2, sem revogar `anon` e `authenticated`: as 7 checagens de acesso falharam;
  - M3, sem RLS em `audit_logs`: "RLS ligado em audit_logs" falhou.
  - A migração foi restaurada (`cmp` idêntico), e o reset seguido dos testes voltou a passar.
- Lint, typecheck, `npm test` e `format:check`: saída 0.

### 2026-10-27 · I0.10 · concluída

- `builder` (T1) em worktree isolado, criado a partir do `98fb330`. Entregou o `README.md` (commit `a1a75f9`, integrado na `main` por cherry-pick como `175ac60`). O builder conferiu links, comandos, linguagem proibida e ausência de valores com um script próprio.
- **Verificação do T2:**
  - leitura completa;
  - varredura de dados sensíveis: nada;
  - **seguindo o README num clone limpo:** `npm ci` (0 `ERESOLVE`), `.env.local` a partir do modelo, `lint`, `typecheck`, `test`, `format:check` e `build` com saída 0;
  - `npm run dev` pelo painel de pré-visualização (`.claude/launch.json`): página "Repasse de veículos / Plataforma em construção." e `GET / 200`.
- **Achado do builder, procedente:** o `test:integration` não pega o advisory lock. Hoje ele só lê. Registrado em `supabase/tests/README.md` para o Inc. 1, quando os testes passarem a gravar dados.
- **Gate do Inc. 0:**
  - app local e em homologação (preview protegido): ok;
  - CI verde: ok, no `3139113`;
  - teste de banco executando migração: ok no projeto de desenvolvimento, e o CI com a migração da I0.6 depende do push;
  - nenhum deploy público: ok.
