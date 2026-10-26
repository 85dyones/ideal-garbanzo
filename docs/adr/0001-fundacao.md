# ADR-0001: Fundação técnica

**Status:** aceito pelo T2 dentro do escopo aprovado (D1 revista, D2). As dependências externas estão na seção 5.  
**Data:** 2026-10-26  
**Subtarefa:** I0.2 do plano orquestrado v2  
**Base:** especificação v1.1 (§4, §7, §15, §16), gates transversais do plano (seção 3), levantamento da I0.1  
**Revisão do mesmo dia:** a pessoa responsável decidiu (D1 revista) que tudo roda no Easypanel da VPS atual (`srv904277`), inclusive produção, em vez de Supabase Cloud e Vercel. Também decidiu não instalar Docker na máquina local.

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
| WSL | presente, sem distribuição |
| Vercel CLI, `gh` | não instalados |

### 1.2. Servidor

- VPS `srv904277`, com Easypanel. Já atende serviços de produção de outros negócios: Chatwoot e Postgres do projeto `automations`, `v2o5-autopilot` e Evolution.
- Capacidade (RAM, disco, CPU), uso atual e localização do datacenter: **não levantados** (I0.12).

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
| eslint | 10.13.0 |
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

- **Decisão:** `engines.node = "24.x"` e `.nvmrc` com `24`. A imagem de produção usa Node 24.
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
  - build com `output: "standalone"` para a imagem de produção.
- **TypeScript: 6.0.x (6.0.3 em 26/10).** O `typescript-eslint` 8.72.1 declara suporte a `typescript >=4.8.4 <6.1.0`, então a 7.x quebraria o lint com regras de tipo. Rever quando o `typescript-eslint` aceitar a 7.x.

### 2.4. Lint e formatação

- **Decisão:** ESLint 10 em configuração flat, com as regras do Next (`eslint-config-next`, que aceita `eslint >=9`) e regras de tipo do `typescript-eslint` (que aceita ESLint 10), mais Prettier com `eslint-config-prettier`.
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
  operacao/               roteiros do Easypanel, backup e incidente
Dockerfile                imagem de produção da aplicação
```

**Módulos (§15):** `auth`, `organizations`, `membership`, `vehicles`, `offers`, `documental`, `acknowledgments`, `negotiations`, `outcomes`, `commissions`, `notifications`, `audit`.

**Regra de dependência:** um módulo não lê tabela de outro diretamente na camada de servidor; usa uma função pública do outro módulo ou a política do banco.

### 2.7. Convenções

- **Fim de linha:** `.gitattributes` com `* text=auto eol=lf`.
- **Datas:** banco em `timestamptz`; servidor em UTC; exibição em `America/Sao_Paulo`.
- **Dinheiro:** `numeric(12,2)` no banco; nunca ponto flutuante no cálculo.
- **Nomes:** tabelas e colunas em inglês, como na §5 da v1.1; textos da interface em português.

---

## 3. Decisões de infraestrutura (D1 revista)

### 3.1. Onde cada coisa roda

| Ambiente | Banco e serviços Supabase | Aplicação | Dados | Quando |
|---|---|---|---|---|
| `dev` | Supabase self-hosted no Easypanel, projeto `repasse-dev` | máquina local (`npm run dev`) | só de teste; reset livre | Inc. 0 |
| `homolog` | Supabase self-hosted, projeto `repasse-homolog` | Easypanel, deploy do GitHub | só de teste, identificados; estável entre resets | Inc. 0 (I0.9) |
| `prod` | Supabase self-hosted, projeto `repasse-prod` | Easypanel | reais | Inc. 6 |
| CI | Supabase CLI efêmero no runner do GitHub Actions (que tem Docker) | runner | de teste, descartados a cada execução | Inc. 0 (I0.8) |

- Cada ambiente é um projeto separado no Easypanel, com chaves, senhas, banco, volumes e rede próprios.
- Nada é compartilhado com os projetos da Motors, da V2O5 ou da 16VC além do servidor físico.
- Se a I0.12 mostrar que a VPS não comporta `dev` e `homolog` ao mesmo tempo, o `homolog` sobe só quando for necessário (I0.9) e o `dev` fica parado fora das sessões de trabalho. O `prod` não divide recursos com teste: no Inc. 6, a capacidade será reavaliada.

### 3.2. Supabase self-hosted

**Base e chaves**
- **Base:** template oficial do Supabase no Easypanel (Postgres, Auth, PostgREST, Storage, Realtime, Kong, Studio), com versão das imagens fixada e registrada.
- **Chaves:** `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, senha do Postgres e senha do Studio são **geradas para cada ambiente**. As chaves de exemplo do template são públicas e nunca podem ser usadas. A I0.3 só fecha com essa troca comprovada (assinatura do JWT conferida contra o novo segredo).

**Exposição**
- Só a API (Kong) fica pública, por HTTPS com domínio próprio.
- O Studio fica atrás de senha forte, sem domínio público, ou é desligado em `prod`.
- A porta do Postgres não é publicada na internet.

**Acesso ao banco pela máquina local**
- Por túnel SSH (`ssh -L`), com chave dedicada.
- A senha do banco e as chaves ficam em `.env.local`, fora do Git.

**Auth**
- E-mail transacional por SMTP próprio do repasse (H).
- Em `dev`, os usuários de teste são confirmados pela API administrativa dentro dos testes.

**Storage**
- Backend em disco do volume do projeto. Entra no backup junto com o banco.

**Recursos**
- Limite de memória e CPU por serviço no Easypanel, para não afetar os outros projetos da VPS.

### 3.3. Migrações

- Escritas em `supabase/migrations/` com a Supabase CLI (`npx supabase migration new`).
- Aplicadas com conexão direta ao banco (`npx supabase db push --db-url` ou o script `scripts/db-migrar`), nunca por edição manual.
- **Em `dev`:** um reset reproduzível remove os objetos do projeto e os usuários de teste e reaplica todas as migrações. A I0.5 escolhe e prova o mecanismo sem Docker local: `supabase db reset --db-url` se funcionar sem Docker, ou script próprio.
- **Em `homolog` e `prod`:** só `push` de migrações novas, nunca reset. Migração destrutiva exige plano e aprovação H.

### 3.4. Hospedagem da aplicação no Easypanel

- **Imagem:** `Dockerfile` com build `standalone` do Next em Node 24, construída pelo Easypanel a partir do GitHub.
- **Deploy:**
  - `homolog` acompanha a branch de homologação;
  - `prod` só recebe deploy com aprovação H, por ação;
  - todo deploy exige o repositório no GitHub, e cada push exige aprovação H.
- **Domínios e HTTPS:** domínios e subdomínios da aplicação e da API de cada ambiente, com certificado gerenciado pelo Easypanel (H).
- **Variáveis:** cadastradas no Easypanel por ambiente. O `.env.example` lista os nomes.

---

## 4. Testes

| Camada | Ferramenta | Onde roda | Cobre |
|---|---|---|---|
| Unitário | Vitest | local e CI | funções puras: transições, estado documental, hash do snapshot, validação |
| Banco | pgTAP | local contra `dev` (pelo túnel); CI contra o Supabase efêmero | restrições, RLS com `set local role` e claims de JWT, tabelas só de inclusão, `is_test`, trava de dado pessoal |
| Integração | Vitest com usuários de teste reais | local contra `dev`; CI contra o efêmero | autorização das operações de servidor; testes negativos da §7.4 pela API |
| E2E | Playwright | local contra `dev`; CI e `homolog` a partir do Inc. 4 | fluxos da §2.2 e catálogo |
| Linguagem proibida | Vitest | local e CI | textos de `src/`, templates de e-mail e guias, contra `config/linguagem-proibida.json` |

**Regras:**
- **Falhar, nunca pular:** as suítes de banco e de integração falham quando o banco não está acessível. A mensagem explica como abrir o túnel.
- **Uma execução por vez em `dev`:** o banco `dev` é um só para todos os agentes, então o runner pega um `pg_advisory_lock` antes do reset e dos testes. Uma segunda execução espera ou falha com mensagem clara. Subagentes `builder` rodam unitários, lint e typecheck; testes de banco em `dev` ficam com o T2, um de cada vez.
- **pgTAP sem Docker local:** se `supabase test db --db-url` exigir Docker, um script Node (`scripts/testes-de-banco`) executa os arquivos `.test.sql` pela conexão direta e interpreta a saída TAP. A I0.5 decide e registra.
- **CI é a referência:** o resultado verde no CI, contra um Supabase limpo, é exigido para integrar na branch principal.
- **Verificação de mutação** dos testes negativos: procedimento em `supabase/tests/README.md`.

**Alternativas descartadas:**
- **Docker local:** descartado pela pessoa responsável.
- **PGlite:** sem os schemas `auth` e `storage` reais.
- **Testes de banco só no CI:** deixaria os agentes sem validação local e cada verificação dependendo de push.

---

## 5. Riscos do self-hosted e dependências externas

### 5.1. Riscos aceitos com a D1 revista

| Risco | Mitigação obrigatória | Quando |
|---|---|---|
| Chaves de exemplo do template em uso | geração por ambiente e conferência da assinatura | I0.3 |
| Studio, Postgres ou Kong expostos além do necessário | só a API pública; Studio protegido ou desligado; Postgres sem porta pública | I0.3; revisão T3 na I6.9 |
| Sem backup automático nem PITR, que o Supabase Cloud oferecia | `pg_dump` diário e cópia do volume de Storage para fora da VPS; teste de restauração | antes do piloto (I6.4) |
| VPS compartilhada com produção de clientes (16VC, V2O5, Motors) | limites de recurso por serviço; projetos e redes separados; monitoramento de memória e disco | I0.3; reavaliar na I6.9 |
| Atualizações de segurança do Supabase e do sistema | rotina de atualização com janela e registro | I6.9 |
| Ponto único de falha: a VPS cai e tudo para | aceito para o piloto; roteiro de recuperação a partir do backup externo | I6.4 |
| Localização do datacenter e LGPD | levantar na I0.12; registrar na política de privacidade (D5) | I0.12 |

### 5.2. Dependências externas

| Item | Quem | Bloqueia |
|---|---|---|
| Capacidade e uso atual da VPS (RAM, disco, CPU) e localização do datacenter | H (I0.12) | I0.3 |
| Projetos `repasse-dev` e `repasse-homolog` no Easypanel, com chaves novas, Studio protegido e limites de recurso | H, com roteiro escrito pelo T2 (I0.3) | I0.5, I0.6, I0.9 |
| Acesso do T2 ao banco `dev` por túnel SSH, com chave dedicada e credenciais em `.env.local` | H (I0.11) | testes de banco locais |
| Domínios, DNS e HTTPS de `homolog` | H | I0.9 |
| SMTP para o Auth | H | e-mails de Auth fora de teste |
| Push do repositório para o GitHub | H, por ação | I0.8 e I0.9 |
| Confirmar na prática TypeScript 6.0 e ESLint 10 com o Next 16.4 (`lint`, `typecheck`, `build`) | T1 na I0.4 | integração da I0.4 |
