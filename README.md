# Repasse de veículos

Plataforma B2B privada de oportunidades de repasse de veículos para compradores profissionais, com ofertas padronizadas, histórico documental e negociações rastreáveis. As regras de negócio estão na [especificação v1.1](docs/especificacao/especificacao-v1.1.md).

O projeto está em construção; o andamento fica no [plano orquestrado](docs/workflow/plano-orquestrado.md).

## Requisitos

- **Node.js 24**: versão em `.nvmrc`; no `package.json`, `engines.node` é `24.x`.
- **npm**, o que acompanha o Node 24. As dependências são instaladas com `npm ci`, a partir do `package-lock.json`.
- **Git**.
- **Sem Docker local.** A Supabase CLI vem como dependência de desenvolvimento (`npx supabase`), e o Supabase efêmero só sobe no CI.
- **Para os comandos de banco:** acesso ao projeto Supabase de desenvolvimento, de onde saem os valores do `.env` (ver [`docs/ambiente.md`](docs/ambiente.md)).

## Instalação

1. Clone o repositório:

   ```bash
   git clone https://github.com/85dyones/ideal-garbanzo.git
   cd ideal-garbanzo
   ```

2. Confira o Node: `node --version` deve começar com `v24`.

3. Instale as dependências:

   ```bash
   npm ci
   ```

4. Copie o modelo de variáveis e preencha seguindo [`docs/ambiente.md`](docs/ambiente.md):

   ```bash
   cp .env.example .env.local
   ```

   No PowerShell: `Copy-Item .env.example .env.local`. Também vale `.env`; os dois ficam fora do Git, e o `.env.local` tem prioridade. O `.env.example` traz só os nomes: valores reais nunca entram no Git.

   | Comando                               | Variáveis exigidas                                                                                           |
   | ------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
   | `npm run dev`, `npm run build`        | nenhuma por enquanto; as do Supabase passam a ser usadas quando o código da aplicação precisar delas         |
   | `npm run db:reset`, `npm run test:db` | `SUPABASE_DB_URL` e, recomendada, `SUPABASE_PROJECT_REF`                                                     |
   | `npm run test:integration`            | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_DB_URL` |

5. Suba o servidor de desenvolvimento:

   ```bash
   npm run dev
   ```

   A aplicação abre em `http://localhost:3000`.

## Comandos

Todos saem dos scripts do `package.json`. Rode `npm ci` antes, na pasta onde trabalha.

| Comando                    | O que faz                                                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`              | servidor de desenvolvimento do Next (`next dev`)                                                                                                              |
| `npm run build`            | build do Next com `output: "standalone"`, incluindo a checagem de tipos                                                                                       |
| `npm run lint`             | ESLint 9 com as regras do Next e regras de tipo do `typescript-eslint`                                                                                        |
| `npm run typecheck`        | `tsc --noEmit`                                                                                                                                                |
| `npm test`                 | Vitest: testes unitários e o teste de linguagem proibida (`config/linguagem-proibida.json`); não inclui a integração                                          |
| `npm run format:check`     | confere a formatação do Prettier; `npm run format` corrige                                                                                                    |
| `npm run db:reset`         | numa transação só, remove os objetos do schema `public`, apaga os usuários de teste, zera o histórico de migrações e reaplica `supabase/migrations/` e o seed |
| `npm run test:db`          | roda os testes pgTAP de `supabase/tests/database/*.test.sql`; falha se algum não passar ou se não houver teste                                                |
| `npm run test:integration` | roda os testes de `tests/integration/` contra a API do Supabase e o banco                                                                                     |

### Comandos de banco

`db:reset`, `test:db` e `test:integration`:

- **Destino:** só rodam contra o projeto de desenvolvimento listado em `config/banco-dev.json` ou contra banco local (`127.0.0.1`, `localhost`, `::1`, como no CI). Qualquer outro destino é recusado antes de conectar. A `SUPABASE_PROJECT_REF`, quando preenchida, precisa bater com o projeto da `SUPABASE_DB_URL`, e a URL não pode ter `sslmode`.
- **Um por vez:** o projeto de desenvolvimento é um só para todos. Não rode dois comandos de banco ao mesmo tempo. `db:reset` e `test:db` pegam a mesma trava no banco (advisory lock): uma segunda execução espera até 60 s e depois falha.
- **Sem banco, falham:** se o banco não estiver acessível, saem com erro em vez de pular os testes.
- **Homologação no mesmo projeto:** o projeto de desenvolvimento também atende às previews da Vercel, então reset e testes de banco apagam também os dados delas. Por isso o projeto só guarda dados de teste.

Detalhes, convenções de migração e o procedimento de verificação de mutação em [`supabase/tests/README.md`](supabase/tests/README.md).

## Estrutura de pastas

Resumo da [ADR-0001](docs/adr/0001-fundacao.md) §2.6. Algumas pastas só aparecem quando recebem o primeiro arquivo.

```
src/
  app/                rotas (App Router), por área: (publico), (fornecedor), (comprador), (admin)
  modules/<módulo>/   domínio: rules/, schemas/, server/, queries/, ui/
  lib/                transversais: clientes Supabase, auth, Turnstile, rate limit, datas
  components/         componentes visuais genéricos
config/               listas configuráveis versionadas (linguagem proibida, destinos de banco)
supabase/
  migrations/         migrações versionadas
  tests/database/     testes pgTAP
  seed.sql            só dados de teste, identificados como tal
tests/
  integration/        testes de integração (npm run test:integration)
  e2e/                testes de ponta a ponta
scripts/              reset do banco, runner pgTAP e apoio ao CI
docs/                 especificação, diagnóstico, plano, ADRs e ambiente
.github/workflows/    CI
```

Módulos: `auth`, `organizations`, `membership`, `vehicles`, `offers`, `documental`, `acknowledgments`, `negotiations`, `outcomes`, `commissions`, `notifications`, `audit`. Um módulo não lê tabela de outro diretamente na camada de servidor: usa uma função pública do outro módulo ou a política do banco.

## CI e deploy

**GitHub Actions** (`.github/workflows/ci.yml`), em todo pull request e em push na `main` e na `producao`:

- `qualidade`: `npm ci`, `npm ls`, lint, typecheck, testes e formatação;
- `build`: `npm run build`;
- `banco`: sobe um Supabase efêmero no runner (`npx supabase start`), roda `db:reset`, `test:db` e `test:integration` contra ele e o derruba no fim.

O CI verde é exigido para integrar na `main`.

**Vercel:**

- push na `main` gera um deploy de preview, que é a homologação;
- a produção só sai da branch `producao`;
- até o Inc. 6, todos os deploys, inclusive o de produção, ficam atrás do login da Vercel, e a produção não recebe variáveis do Supabase;
- push e deploy de produção só com aprovação explícita da pessoa responsável.

## Documentação

- [Especificação do produto v1.1](docs/especificacao/especificacao-v1.1.md): fonte das regras de negócio.
- [Plano orquestrado](docs/workflow/plano-orquestrado.md): incrementos, subtarefas e gates.
- [ADR-0001: fundação técnica](docs/adr/0001-fundacao.md): stack, infraestrutura e testes.
- [Variáveis de ambiente](docs/ambiente.md): nomes, origem e onde cada ambiente recebe os valores.
- [Testes de banco e reset](supabase/tests/README.md): comandos, trava de destino e convenções.
- [`CLAUDE.md`](CLAUDE.md): regras para os agentes que trabalham no repositório.
