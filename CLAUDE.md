# CLAUDE.md: Plataforma B2B de Repasse de Veículos

## Documentos, nesta ordem

1. `docs/workflow/current-task.md`: tarefa atual e registro da execução.
2. `docs/especificacao/especificacao-v1.1.md`: especificação do produto; fonte da verdade sobre regras de negócio.
3. `docs/diagnostico/2026-10-26-missao-001.md`: estado real, reaproveitamento e decisões D1 a D9.
4. `model-orchestration.md`: regras de despacho, escalonamento e paralelismo.
5. `docs/workflow/plano-orquestrado.md`: plano v2, com incrementos 0 a 6, subtarefas, níveis, gates e mapa de reaproveitamento.

`operacao-repasse-origem.md` é a especificação v1.0, mantida só como histórico.

## Papel desta sessão

A sessão principal é o orquestrador (T2). Ela despacha subtarefas aos subagentes de `.claude/agents/` conforme a coluna **Nível** do plano, integra ou rejeita as entregas e responde pelo aceite.

| Nível | Subagente | Uso |
|---|---|---|
| T0 | `fast-helper` | leitura, extração de regras, rascunho de testes |
| T1 | `builder` | implementação delimitada em worktree isolado |
| T3 | `reasoning-review` | revisão independente de módulos críticos |
| TV | `vision-review` | revisão de screenshots |
| AG | Antigravity (fora do Claude Code) | revisão externa no domínio documental e no piloto |

## Regras que não dependem do modelo

- Não desabilitar nem afrouxar RLS ou políticas de Storage para um teste passar.
- `service_role` e demais segredos ficam apenas em código de servidor e variáveis protegidas.
- Push, deploy, operações em produção e migrações destrutivas só com aprovação explícita da pessoa responsável, por ação.
- Não inventar comportamento coberto pelas decisões pendentes da seção 13 da especificação v1.1.
- Nunca simular consulta, resultado ou evidência. Pendência documental nunca bloqueia publicação. Nenhum rótulo de "verificado" sem a qualificação "nas fontes consultadas".
- Nada é compartilhado com a Motors: banco, projeto, credenciais, contas de provedor ou dados.
- Testes e reset de banco só no projeto Supabase `ralmlmuewullugeqtgoz`, que serve a `dev` e homologação e só guarda dados de teste; nunca em produção. A produção da Vercel não recebe variáveis do Supabase até o Inc. 6. Até lá, todo deploy da Vercel fica atrás da autenticação da Vercel.
- Não inventar IDs de modelo, credenciais, integrações ou variáveis.
- **O repositório `ideal-garbanzo` é público** (decisão da pessoa responsável, 27/10). Não versionar segredos, dados pessoais, nem detalhes internos ou de segurança de outros negócios da pessoa responsável: achados, locais de segredos, nomes e IDs de projetos deles, infraestrutura de clientes, IDs de conta. Esses registros ficam em `notas-privadas/` (no `.gitignore`), que os agentes podem ler localmente; nos arquivos versionados, só a descrição genérica.
- Módulos críticos (auth, organizations, access-control, transactions, commissions, subscriptions) não seguem em fallback para modelo menos capaz; pausar com handoff.

## Estado do projeto

- Repositório Git na branch `main`; remoto `origin` = `https://github.com/85dyones/ideal-garbanzo.git`. Push só com aprovação explícita.
- Fundação técnica: `docs/adr/0001-fundacao.md`.
  - Stack: Node 24, npm, Next 16, Vitest, pgTAP, Playwright.
  - Infraestrutura:
    - Supabase Cloud, plano gratuito: um projeto (`ralmlmuewullugeqtgoz`) para `dev` e homologação; `repasse-prod` no Inc. 6;
    - variáveis de ambiente: `.env.example` e `docs/ambiente.md`;
    - CI: `.github/workflows/ci.yml`;
    - Vercel, projeto `ideal-garbanzo`: a `main` gera previews (homologação); a produção sai da branch `producao`;
    - CI com Supabase efêmero no GitHub Actions;
    - sem Docker local.
  - Comandos (rodar `npm ci` antes, na pasta onde se trabalha):

    | Comando | O que faz |
    |---|---|
    | `npm run lint` | ESLint 9 com as regras do Next e regras de tipo |
    | `npm run typecheck` | `tsc --noEmit` |
    | `npm test` | Vitest, incluindo o teste de linguagem proibida |
    | `npm run format:check` | confere a formatação do Prettier |
    | `npm run build` | build do Next (`standalone`) |
    | `npm run db:reset` | reset do banco de desenvolvimento (só o projeto de `config/banco-dev.json` ou banco local) |
    | `npm run test:db` | testes pgTAP de `supabase/tests/database/` |
    | `npm run test:integration` | testes de integração contra a API e o banco |

  - Banco: só o T2 roda `db:reset`, `test:db` e `test:integration` no projeto de desenvolvimento, um de cada vez (advisory lock). A trava de destino recusa qualquer outro projeto. Convenções e verificação de mutação em `supabase/tests/README.md`.
  - Termos proibidos da §6.6 só aparecem com "nas fontes consultadas" na mesma linha. Uso legítimo leva `linguagem-permitida: <motivo>` na linha (ex.: "Certificado de Registro de Veículo"). A lista fica em `config/linguagem-proibida.json`.
- O subagente `fast-helper` (T0) não roda comandos; levantamentos que exigem Bash ficam com o T2 ou com o `builder`.
- Modelos dos subagentes: não configurados até P3/P4; os subagentes herdam o modelo padrão da instalação.
