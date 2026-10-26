# Tarefa atual

**Etapa:** Inc. 0, Fundação (plano v2)  
**Próximas subtarefas:**
- **I0.1 (T0):** levantar as ferramentas instaladas (Node, gerenciador de pacotes, Supabase CLI, Docker, `psql`), com versões observadas por comando.
- **I0.2 (T2):** ADR-0001 de fundação, que depende da I0.1.
- **I0.3 (H, em paralelo):** criar os projetos Supabase (desenvolvimento e homologação) e Vercel próprios e cadastrar as credenciais nas variáveis protegidas.

**Arquivos permitidos na I0.2:** `docs/adr/0001-fundacao.md`, `docs/workflow/plano-orquestrado.md`  
**Aceite:** ver a seção 6 do plano, Inc. 0  
**Verificação:** a I0.1 traz saídas de comando; o ADR-0001 registra alternativas e motivo

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
- Nada commitado.
