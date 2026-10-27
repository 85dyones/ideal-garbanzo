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
