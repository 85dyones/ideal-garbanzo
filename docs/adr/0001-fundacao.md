# ADR-0001: Fundação técnica

**Status:** aceito pelo T2 dentro do escopo aprovado (D1, D2). As dependências externas estão na seção 5.  
**Data:** 2026-10-26, revisado em 2026-10-27  
**Subtarefa:** I0.2 do plano orquestrado v2  
**Base:** especificação v1.1 (§4, §7, §15, §16), gates transversais do plano (seção 3), levantamento da I0.1  
**Histórico da infraestrutura (D1):**
- 26/10: Supabase Cloud e Vercel;
- 26/10: revista para Easypanel na VPS `srv904277`;
- **27/10, decisão final:** Supabase Cloud em `sa-east-1` e aplicação na Vercel, com a `main` gerando deploys de preview.
- Em todas as versões, a pessoa responsável decidiu não instalar Docker na máquina local.

---

## 1. Contexto

### 1.1. Máquina de desenvolvimento (I0.1, observado por comando em 26/10/2026)

| Ferramenta | Situação |
|---|---|
| Windows 11, build 26300; 8 núcleos; 11,9 GB de RAM | — |
| Node.js | 24.22.1 |
| npm | 11.19.1 |
| corepack | 0.36.0 |
| Git | 2.55.0 (inclui cliente `ssh`) |
| pnpm, yarn, bun | não instalados |
| Supabase CLI | não instalado |
| Docker, `psql` | não instalados; Docker local descartado pela pessoa responsável |
| Vercel CLI | não instalado; o projeto da Vercel é gerido pela integração disponível na sessão |
| WSL | presente, sem distribuição |
| Vercel CLI, `gh` | não instalados |

### 1.2. Contas de infraestrutura (consultadas em 27/10/2026)

- **Vercel:** um único time, `dyones-projects` (`team_AKoHgpGHOfOR0YOGxDOQIgod`). A integração com o GitHub cobre a conta `85dyones` sem restrição de repositório.
- **Supabase:** a organização atual hospeda `motors-oficial`, `v2o5-site`, `rede-auto` e `16-vara-civel` (inativo).

### 1.3. Versões estáveis no registro do npm (26/10/2026)

| Pacote | Versão |
|---|---|
| next | 16.4.3 |
| react | 19.3.1 |
| typescript | 7.0.2 |
| @supabase/supabase-js | 2.118.0 |
| @supabase/ssr | 0.12.7 |
| supabase (CLI) | 2.122.0 |
| vitest | 5.0.5 |
| @playwright/test | 1.64.1 |
| eslint | 10.13.0 (adotado: 9.39.5, ver §2.4) |
| eslint-config-next | 16.4.3 |
| prettier | 3.9.10 |
| zod | 4.6.7 |

### 1.4. Requisitos que pesam na escolha

- Migrações executadas de verdade em banco limpo. Teste que só confere o texto do SQL não conta (gate 1).
- RLS, Storage e Auth testados contra o comportamento real do Supabase (testes negativos da §7.4).
- Ambientes separados, com credenciais e banco próprios (§4.4).
- Linguagem proibida verificada automaticamente (gate 5).
- Código portado do `motors-site-oficial`: Next 16, Supabase, Vitest e npm.

---

## 2. Decisões de aplicação

### 2.1. Runtime: Node.js 24 LTS

- **Decisão:** `engines.node = "24.x"` e `.nvmrc` com `24`. O projeto da Vercel usa Node 24.x.
- **Motivo:** já instalado; atende o mínimo do Next (`>=20.9.0`).

### 2.2. Gerenciador de pacotes: npm

- **Decisão:** npm, com `package-lock.json` versionado e `npm ci` no CI e no build.
- **Motivo:** já instalado e é o mesmo do código a portar.
- **Alternativa descartada:** pnpm via corepack (ferramenta a mais sem ganho relevante).

### 2.3. Framework: Next.js 16 com App Router, React 19 e TypeScript estrito

- **Decisão:**
  - Next.js 16.x e React 19.x, com versões exatas fixadas na I0.4;
  - `strict: true`, `noUncheckedIndexedAccess: true`;
  - operações que alteram estado ficam em código de servidor;
  - módulos com segredo importam `server-only`;
  - build com `output: "standalone"`, mantido da I0.4 (ver §3.2).
- **TypeScript: 6.0.x (6.0.3 em 26/10).** O `typescript-eslint` 8.72.1 declara suporte a `typescript >=4.8.4 <6.1.0`, então a 7.x quebraria o lint com regras de tipo. Rever quando o `typescript-eslint` aceitar a 7.x.
- **Ajustes comprovados na I0.4:** o TypeScript 6 não carrega mais os `@types` sozinho, então o `tsconfig` declara `"types": ["node"]`. O `next build` faz a checagem de tipos e passou com o 6.0.3.
- **Execução:** na Vercel, o próprio build da plataforma serve a aplicação. Fora dela, com `output: "standalone"`, a aplicação roda com `node .next/standalone/server.js`, não com `next start`.

### 2.4. Lint e formatação

- **Decisão:** ESLint **9.39.5** em configuração flat, com as regras do Next (`eslint-config-next` 16.4.3) e regras de tipo do `typescript-eslint`, mais Prettier com `eslint-config-prettier`.
- **Por que não o ESLint 10 (achado da I0.4):** o `eslint-config-next` aceita `eslint >=9`, mas instala `eslint-plugin-react` 7.37.5 (`^9.7`), `eslint-plugin-import` 2.32.0 (`^9`) e `eslint-plugin-jsx-a11y` 6.10.2 (`^9`). Com o 10, o `npm ci` sobrescreve as dependências pares e o `npm ls` sai com erro (`ELSPROBLEMS`). Rever quando os três plugins aceitarem o ESLint 10.
- **Testes:** o Vitest 5 exige o `vite` como dependência par; fixar `vite` 8.3.5 e `@types/node` 24.x como dependências de desenvolvimento exatas.
- **Scripts de instalação:** o npm 11 bloqueia `postinstall` sem liberação. Só entram em `allowScripts` os pacotes que precisam do script para funcionar, cada um com o motivo registrado.
- **Resultado da I0.4:** `allowScripts` ficou vazio. O único script pendente é o do `unrs-resolver` 1.12.2, que só age se faltar o binário nativo. O binário já vem como dependência opcional, e o lint com `import/no-unresolved` passou sem o script.
- **Risco aceito:** o npm marca o ESLint 9.39.5 como sem suporte (`deprecated`). Ele é ferramenta de desenvolvimento e não entra na imagem de produção. Rever quando `eslint-plugin-react`, `eslint-plugin-import` e `eslint-plugin-jsx-a11y` aceitarem o ESLint 10, ou se um aviso de segurança atingir a linha 9.
- **Alternativa descartada:** Biome, que não traz as regras do Next.

### 2.5. Validação de entrada: Zod 4

- **Decisão:** esquemas Zod em toda fronteira de servidor (§8) e nos formulários.

### 2.5.1. Estilo: Tailwind CSS 4

- **Decisão:** Tailwind CSS 4 (4.3.3 em 26/10) com `@tailwindcss/postcss`; layout mobile-first; sem biblioteca de componentes por enquanto.
- **Motivo:** é o mesmo dos componentes a portar do `motors-site-oficial` e atende o mobile-first da §4.1.

### 2.6. Estrutura de pastas

```
src/
  app/                    rotas (App Router), por área: (publico), (fornecedor), (comprador), (admin)
  modules/<módulo>/       domínio (§15)
    rules/                funções puras, com testes unitários ao lado
    schemas/              esquemas Zod
    server/               operações de servidor (alteram estado)
    queries/              leituras de servidor
    ui/                   componentes específicos do módulo
  lib/                    transversais: clientes Supabase, auth, Turnstile, rate limit, datas
  components/             componentes visuais genéricos
config/                   listas configuráveis versionadas (ex.: linguagem proibida)
supabase/
  migrations/             migrações versionadas
  tests/database/         testes pgTAP
  seed.sql                só dados de teste, identificados como tal
tests/
  integration/
  e2e/
scripts/                  ferramentas de banco e de teste (reset, migração, runner pgTAP)
docs/
  adr/
  operacao/               roteiros de backup e incidente
```

**Módulos (§15):** `auth`, `organizations`, `membership`, `vehicles`, `offers`, `documental`, `acknowledgments`, `negotiations`, `outcomes`, `commissions`, `notifications`, `audit`.

**Regra de dependência:** um módulo não lê tabela de outro diretamente na camada de servidor; usa uma função pública do outro módulo ou a política do banco.

### 2.7. Convenções

- **Fim de linha:** `.gitattributes` com `* text=auto eol=lf`.
- **Datas:** banco em `timestamptz`; servidor em UTC; exibição em `America/Sao_Paulo`.
- **Dinheiro:** `numeric(12,2)` no banco; nunca ponto flutuante no cálculo.
- **Nomes:** tabelas e colunas em inglês, como na §5 da v1.1; textos da interface em português.

---

## 3. Decisões de infraestrutura (D1, decisão final de 27/10)

### 3.1. Onde cada coisa roda

| Ambiente | Banco (Supabase Cloud, `sa-east-1`) | Aplicação (Vercel) | Dados | Quando |
|---|---|---|---|---|
| `dev` | projeto `repasse-dev` | máquina local (`npm run dev`) | só de teste; reset livre | Inc. 0 (I0.3) |
| `homolog` | projeto `repasse-homolog` | deploys de preview gerados por push na `main`, protegidos pela autenticação da Vercel | só de teste, identificados | Inc. 0 (I0.9) |
| `prod` | projeto `repasse-prod` | deploy de produção a partir da branch `producao` | reais | Inc. 6 |
| CI | Supabase CLI efêmero no runner do GitHub Actions (que tem Docker) | runner | de teste, descartados a cada execução | Inc. 0 (I0.8) |

- Cada ambiente é um projeto separado no Supabase, com chaves e banco próprios.
- Região `sa-east-1` (São Paulo): proximidade dos usuários e dados no Brasil.
- **Organização do Supabase:** recomendada uma organização própria do repasse, separada da que hospeda `motors-oficial`, `v2o5-site` e `rede-auto`. Isso separa cobrança, acesso e responsabilidade LGPD. A decisão é da pessoa responsável, na I0.3.
- **Time da Vercel:** o projeto fica no time existente (`dyones-projects`), que também hospeda projetos da Motors e da V2O5. O isolamento é por projeto, com variáveis de ambiente próprias. Reavaliar um time separado no Inc. 6.
- Nada de chave, banco ou conta de provedor da Motors (por exemplo, a conta da APIBrasil) é usado pelo repasse.

### 3.2. Vercel

- **Projeto:** `ideal-garbanzo` (`prj_tjGFghO2iZmZik0rhaWnAaiuZSxY`), ligado a `85dyones/ideal-garbanzo`, framework Next.js, Node 24.
- **Branches:**
  - a `main` gera deploys de **preview**, que são a homologação;
  - a branch de produção é `producao`. Ela é criada já no Inc. 0, apontando para o esqueleto, para a Vercel poder acompanhá-la, e só recebe código novo no Inc. 6, com aprovação H;
  - a troca da branch de produção é feita no painel da Vercel (H), porque a ferramenta de automação não tem esse campo.
- **Proteção:** autenticação da Vercel em **todos** os deploys (`ssoProtection: all`), inclusive produção, até o Inc. 6. Nada fica público antes do piloto.
- **Variáveis:** cadastradas no projeto da Vercel por ambiente. `Preview` aponta para `repasse-homolog`; `Production` aponta para `repasse-prod` no Inc. 6. O `.env.example` lista só os nomes.
- **Região das funções:** `gru1` (São Paulo), junto do banco em `sa-east-1`. O primeiro deploy (27/10) saiu no padrão, `iad1` (EUA). A troca foi aplicada pela integração em 27/10 (`functionDefaultRegions: ["gru1"]`) e se confirma no campo `regions` do próximo deploy.
- **Achado da I0.9:** a proteção "Standard" (`all_except_custom_domains`) deixou público o domínio de produção `ideal-garbanzo-six.vercel.app` (HTTP 200). Com `all`, os quatro endereços do deploy passaram a redirecionar para o login da Vercel (HTTP 302).
- **`output: "standalone"`:** fica no `next.config.ts` (I0.4). A Vercel usa o próprio empacotamento; a I0.9 confirma que o deploy funciona com essa opção.
- Push e deploy de produção sempre com aprovação H, por ação.

### 3.3. Migrações

- Escritas em `supabase/migrations/` com a Supabase CLI (`npx supabase migration new`).
- Aplicadas com a CLI pela conexão do projeto (`npx supabase db push`, com `--db-url` ou projeto vinculado), nunca por edição no painel.
- **Em `dev`:** um reset reproduzível reaplica todas as migrações e remove os usuários de teste. A I0.5 escolhe e prova o mecanismo sem Docker local: `supabase db reset --linked` ou `--db-url` se funcionar sem Docker; senão, script próprio.
- **Em `homolog` e `prod`:** só `push` de migrações novas, nunca reset. Migração destrutiva exige plano e aprovação H.
- **Conexão a partir da máquina local:** pelo *pooler* do Supabase em modo sessão, com SSL. A conexão direta do Supabase Cloud costuma ser só IPv6; conferir na I0.11. A senha do banco fica em `.env.local`, fora do Git.

---

## 4. Testes

| Camada | Ferramenta | Onde roda | Cobre |
|---|---|---|---|
| Unitário | Vitest | local e CI | funções puras: transições, estado documental, hash do snapshot, validação |
| Banco | pgTAP | local contra `repasse-dev`; CI contra o Supabase efêmero | restrições, RLS com `set local role` e claims de JWT, tabelas só de inclusão, `is_test`, trava de dado pessoal |
| Integração | Vitest com usuários de teste reais | local contra `repasse-dev`; CI contra o efêmero | autorização das operações de servidor; testes negativos da §7.4 pela API |
| E2E | Playwright | local contra `dev`; previews da Vercel a partir do Inc. 4 | fluxos da §2.2 e catálogo |
| Linguagem proibida | Vitest | local e CI | textos de `src/`, templates de e-mail e guias, contra `config/linguagem-proibida.json` |

**Regras:**
- **Falhar, nunca pular:** as suítes de banco e de integração falham quando o banco não está acessível.
- **Uma execução por vez em `dev`:** o banco `repasse-dev` é um só para todos os agentes. O runner pega um `pg_advisory_lock` antes do reset e dos testes; os testes de banco em `dev` ficam com o T2, um de cada vez. Subagentes `builder` rodam unitários, lint e typecheck.
- **pgTAP sem Docker local:** se `supabase test db` exigir Docker, um script Node (`scripts/testes-de-banco`) executa os arquivos `.test.sql` pela conexão e interpreta a saída TAP. A I0.5 decide e registra.
- **CI é a referência:** o resultado verde no CI, contra um Supabase limpo, é exigido para integrar na `main`.
- **Verificação de mutação** dos testes negativos: procedimento em `supabase/tests/README.md`.

**Alternativas descartadas:**
- **Docker local:** descartado pela pessoa responsável.
- **Supabase self-hosted no Easypanel:** considerado em 26/10 e descartado em 27/10 pela pessoa responsável, em favor de Supabase Cloud e Vercel.
- **PGlite:** sem os schemas `auth` e `storage` reais.

---

## 5. Riscos e dependências externas

### 5.1. Riscos

| Risco | Mitigação | Quando |
|---|---|---|
| Deploy público antes do piloto | `ssoProtection: all` na Vercel; branch de produção `producao`, que só existe no Inc. 6 | I0.9 |
| Banco `dev` compartilhado entre agentes | `pg_advisory_lock` no runner; só o T2 roda testes de banco em `dev` | I0.5 |
| Mistura com projetos da Motors e da V2O5 na mesma organização ou time | projetos e variáveis próprios; organização própria no Supabase (recomendada) | I0.3 |
| Custo mensal dos projetos do Supabase | a pessoa responsável confirma o plano e o custo antes de criar | I0.3 |
| Backup e restauração | backups gerenciados do Supabase; decidir PITR para `prod`; testar a restauração antes do piloto | I6.4 |

### 5.2. Dependências externas

| Item | Quem | Bloqueia |
|---|---|---|
| Projetos `repasse-dev` e `repasse-homolog` no Supabase Cloud, em `sa-east-1`, de preferência numa organização própria | H (I0.3) | I0.5, I0.6, I0.9 |
| Senha do banco e chaves de `dev` em `.env.local`; teste de conexão pelo pooler | H (I0.11) | testes de banco locais |
| Trocar a branch de produção da Vercel para `producao` | H, no painel da Vercel | deploy de produção acidental (mitigado pela proteção) |
| Push do repositório para o GitHub | H, por ação | I0.8 e I0.9 |
| SMTP para o Auth em homologação | H | e-mails de Auth fora de teste |
