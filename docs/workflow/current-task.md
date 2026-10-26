# Tarefa atual

**Etapa:** Inc. 0, Fundação (plano v2)  
**Próximas subtarefas:**
- **I0.4 (T1, `builder`, worktree):** scaffold Next.js, TypeScript estrito, ESLint, Prettier, Vitest, `.gitattributes`, `.nvmrc` e estrutura de pastas do ADR-0001 §2.6. Arquivos permitidos: tudo exceto `supabase/` e `docs/`. Aceite: `lint`, `typecheck`, `test` e `build` passam; versões de TypeScript e ESLint registradas.
- **I0.13 (T2):** roteiro do Easypanel em `docs/operacao/easypanel.md`.
- **I0.12 (H):** capacidade, uso atual e localização da VPS `srv904277`.
- **I0.3 (H):** projetos `repasse-dev` e `repasse-homolog` no Easypanel, pelo roteiro da I0.13.
- **I0.11 (H):** chave SSH dedicada e túnel para o banco `dev`. Junto com a I0.3, bloqueia a I0.5 e a I0.6.

**Verificação da I0.4:** o T2 inspeciona o diff e roda `lint`, `typecheck`, `test` e `build` antes de integrar o worktree.

**Pausada:** P2 (confirmar o FreeLLMAPI). Volta depois da aprovação do diagnóstico.

## Registro

- Perfil/modelo principal:
- Subagentes e perfis utilizados:
- Fallback informado pelo gateway (com evidência):
- Testes executados e resultados:
- Critérios ainda pendentes:
- Escalonamentos e motivo:

## Histórico

<!-- Uma entrada por subtarefa concluída: data, ID, resultado, evidência. -->

### 2026-10-22 · P1 · concluída com ressalva

- Perfil/modelo principal: T2, Claude Opus 5.5 (`claude-opus-5-5`), sessão principal do Claude Code. Sem subagentes, sem gateway.
- Repositório local na branch `main`, que já existia vazio; commit inicial `303aa17` com os documentos, `CLAUDE.md`, `.claude/agents/` e `.gitignore`.
- Remoto `origin` = `https://github.com/85dyones/ideal-garbanzo.git`, vazio no GitHub (`git ls-remote` sem refs). Sem push.
- Identidade do Git configurada só neste repositório: `85dyones <dyones@gmail.com>`.
- Verificação: `git check-ignore -v` confirma `.env`, `.env.local`, `.env.production`, `.claude/settings.local.json` e `.claude/worktrees/` ignorados; `git check-ignore -q .env.example` retorna 1 (não ignorado).
- Ressalva: `git status` não está limpo. `skills-lock.json` e `.claude/skills/README.md` (catálogo de skills do Google Cloud, sem relação com o projeto) ficaram fora do commit, à espera de decisão: versionar ou ignorar.

### 2026-10-26 · Missão 001 · diagnóstico entregue, aguardando aprovação

- Perfil/modelo principal: T2, Claude Opus 5.5 (`claude-opus-5-5`).
- Subagentes: `fast-helper` (T0) auditou o `motors-site-oficial` em leitura; um `general-purpose` pesquisou fontes de consulta veicular na web. Ambos herdaram o modelo padrão da instalação (P3/P4 pendentes); nenhum fallback informado.
- Validação do T0: amostras conferidas pelo T2 (colunas de `repasses`, trava de dado pessoal em `consultas_de_placa`, modo de homologação da APIBrasil, estados do repasse). Todas conferem.
- Infraestrutura consultada em leitura: Supabase (lista de projetos; tabelas, migrações e catálogo do `rede-auto`), Vercel (projetos; `motors-plataforma`), n8n (workflows). Listagem de deploys da Vercel negada (403).
- Testes: nenhum (sem código).
- Direção da pessoa responsável: o repasse é uma operação separada da Motors e da "plataforma"; produto único, à parte, aproveitando o que se alinha com o briefing.

### 2026-10-26 · Especificação v1.1 · escrita, aguardando aprovação

- Decisões aprovadas pela pessoa responsável: D1 (produto separado em `ideal-garbanzo`, com Supabase e Vercel próprios), D2 (Next.js + TypeScript + Supabase), D3 (revisão da especificação e do plano), D4 (consultas começando pelo registro manual).
- Perfil/modelo: T2, Claude Opus 5.5. Sem subagentes.
- Entrega: `docs/especificacao/especificacao-v1.1.md`; v1.0 mantida como histórico; plano orquestrado marcado como suspenso; `CLAUDE.md` aponta para a v1.1.
- Conferência: os 6 estados documentais (§4.5), as 5 origens da informação (§4.4), a ciência versionada (§5), os 16 itens do MVP (§6) e os 13 critérios de aceite (§11) do briefing estão cobertos.
- Pendente: aprovação da v1.1; decisões D5 a D10 e C1 a C7 (seção 13 da v1.1); criação dos projetos Supabase e Vercel pela pessoa responsável. Nada commitado.

### 2026-10-26 · Plano orquestrado v2 · escrito

- v1.1 aprovada pela pessoa responsável.
- Perfil/modelo: T2, Claude Opus 5.5. Sem subagentes.
- Entrega: `docs/workflow/plano-orquestrado.md` reescrito. Tem incrementos 0 a 6 com 56 subtarefas, gates transversais, mapa do que portar do `motors-site-oficial` e decisões pendentes × subtarefas. O plano v1 fica no commit `b34f01e`.
- Conferência: os 13 testes negativos da §7.4 e os 13 critérios da §10 têm incremento responsável. O teste 12 (comissão) fica para depois do piloto, com o bloco de comissão.
- Ajuste na v1.1: §12 alinhada aos testes que o plano atribui aos incrementos 1, 2 e 5.
- Commitado em `9300386`, junto com o diagnóstico e a v1.1.

### 2026-10-26 · I0.1 e I0.2 · concluídas

- Perfil/modelo: T2, Claude Opus 5.5. Sem subagentes.
- Desvio de nível na I0.1: o plano previa T0, mas o `fast-helper` só tem Read, Grep e Glob e a subtarefa exige rodar comandos. Como era pequena, o T2 executou. Plano corrigido.
- Resultado da I0.1:
  - instalados: Node 24.22.1, npm 11.19.1, corepack 0.36.0, Git 2.55.0;
  - não instalados: Supabase CLI, Docker, `psql`, pnpm, Vercel CLI, `gh`;
  - WSL presente, sem distribuição; hypervisor ativo; 11,9 GB de RAM.
- Versões no registro do npm consultadas em 26/10 (ADR-0001 §1.2).
- Entrega da I0.2: `docs/adr/0001-fundacao.md`.
  - Escolhas: Node 24, npm, Next 16 com React 19, TypeScript estrito (7.x só se for compatível), ESLint e Prettier, Zod 4.
  - Testes: Supabase CLI com Docker; pgTAP; integração contra o Supabase local; Playwright; teste de linguagem proibida.
  - Infraestrutura: CI no GitHub Actions; Vercel só com homologação até o Inc. 6.
- Nova dependência H: I0.11 (Docker ou runtime compatível), que bloqueia os testes de banco locais. Contingência documentada: testes de banco só no CI, com aceite H.
- Plano atualizado: nível da I0.1, texto da I0.3 (homologação obrigatória, `sa-east-1`), I0.4 detalhada, I0.5 dependente da I0.11, nova I0.11, caminhos fixados.
- Testes: nenhum (sem código).

### 2026-10-26 · D1 revista · Easypanel

- Decisão da pessoa responsável, respondendo a duas perguntas:
  - escopo: "Tudo no Easypanel", inclusive produção;
  - servidor: "VPS atual (srv904277)".
- Contexto: a pessoa responsável não quer Docker local.
- Efeito no ADR-0001, reescrito antes do commit:
  - Supabase self-hosted e aplicação no Easypanel, um projeto por ambiente (`repasse-dev`, `repasse-homolog`, `repasse-prod`);
  - CI com Supabase efêmero no GitHub Actions;
  - testes de banco locais contra o `dev` pelo túnel SSH, uma execução por vez (`pg_advisory_lock`);
  - riscos do self-hosted e mitigações na §5.1: chaves de exemplo, exposição, backup fora da VPS, VPS compartilhada com produção de clientes, atualizações, localização.
- Especificação v1.1 ajustada: cabeçalho, seções 0, 4.2, 4.4, 4.5, 7.1 e 12. O diagnóstico registra a revisão no D1.
- Plano ajustado:
  - I0.3 (projetos no Easypanel), I0.5 (passa a T2, por ser banco compartilhado), I0.8, I0.9, I0.10, I0.11 (túnel SSH), I0.12 (capacidade da VPS) e I0.13 (roteiro);
  - I6.1, I6.4 (backup externo) e I6.9 (revisão do self-hosted);
  - gate 12; risco "Infraestrutura self-hosted".
- Evidência sobre o Easypanel atual: documentos locais citam o Easypanel na VPS `srv904277`, com os projetos `automations` (Chatwoot e Postgres 17) e `v2o5-autopilot`, além da Evolution. Capacidade da VPS não levantada.
