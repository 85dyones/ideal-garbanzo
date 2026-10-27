# Tarefa atual

**Etapa:** Inc. 0, Fundação (plano v2)  
**Próximas subtarefas:**
- **I0.11 (H):** credenciais do projeto Supabase `gtbncxvaghjfmzcypgul` em `.env.local`, seguindo `docs/ambiente.md`, e teste de conexão pelo pooler.
- **I0.5 (T2):** `npx supabase init`, reset reproduzível, runner pgTAP, harness de integração e job de banco no CI. Depende da I0.11.
- **I0.6 (T2):** migração base de auditoria, histórico e configuração. Depende da I0.5.
- **I0.10 (T1):** README de instalação local.

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
