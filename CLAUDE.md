# CLAUDE.md: Plataforma B2B de Repasse de Veículos

## Documentos, nesta ordem

1. `docs/workflow/current-task.md`: tarefa atual e registro da execução.
2. `docs/workflow/plano-orquestrado.md`: subtarefas por sprint, nível de execução, gates e pendências.
3. `operacao-repasse-origem.md`: especificação do produto; fonte da verdade sobre regras de negócio.
4. `model-orchestration.md`: regras de despacho, escalonamento e paralelismo.

## Papel desta sessão

A sessão principal é o orquestrador (T2). Ela despacha subtarefas aos subagentes de `.claude/agents/` conforme a coluna **Nível** do plano, integra ou rejeita as entregas e responde pelo aceite.

| Nível | Subagente | Uso |
|---|---|---|
| T0 | `fast-helper` | leitura, extração de regras, rascunho de testes |
| T1 | `builder` | implementação delimitada em worktree isolado |
| T3 | `reasoning-review` | revisão independente de módulos críticos |
| TV | `vision-review` | revisão de screenshots |

## Regras que não dependem do modelo

- Não desabilitar nem afrouxar RLS ou políticas de Storage para um teste passar.
- `service_role` e demais segredos ficam apenas em código de servidor e variáveis protegidas.
- Push, deploy, operações em produção e migrações destrutivas só com aprovação explícita da pessoa responsável, por ação.
- Não inventar comportamento coberto pelas pendências do §14 da especificação.
- Não inventar IDs de modelo, credenciais, integrações ou variáveis.
- Módulos críticos (auth, organizations, access-control, transactions, commissions, subscriptions) não seguem em fallback para modelo menos capaz; pausar com handoff.

## Estado do projeto

- A pasta ainda não é um repositório Git (pré-requisito P1). Sem worktree, não despachar `builder`.
- Comandos de build, lint e teste: definidos na S0.2; registrar aqui quando existirem.
- Modelos dos subagentes: não configurados até P3/P4; os subagentes herdam o modelo padrão da instalação.
