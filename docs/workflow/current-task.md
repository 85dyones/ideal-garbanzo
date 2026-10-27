# Tarefa atual

**Etapa:** Inc. 0, Fundação (plano v2)  
**Próximas subtarefas:**
- **I0.9 (T2 + H, em andamento):**
  - projeto `repasse` na Vercel com autenticação em todos os deploys;
  - push da `main` e preview;
  - a pessoa responsável troca a branch de produção para `producao` no painel.
- **I0.3 (H):** `repasse-dev` e `repasse-homolog` no Supabase Cloud, em `sa-east-1`, de preferência numa organização própria.
- **I0.7 (T2):** `.env.example` e `docs/ambiente.md`.
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
- Commitado em `77f6ac4`.

### 2026-10-26 · I0.13 · concluída

- Perfil/modelo: T2, Claude Opus 5.5.
- Entrega: `docs/operacao/easypanel.md`.
  - Cobre: segredos gerados por ambiente, URLs e Auth, exposição mínima (só o Kong com domínio; firewall do provedor, porque o Docker passa por fora do `ufw`), limites de recurso, `repasse-homolog`, túnel SSH com chave restrita a encaminhamento de porta, conferência com o T2, registro e desfazer.
  - Os nomes de variáveis e os valores de exemplo do compose oficial estão marcados como "conferir no template instalado".
- Verificação: o script de chaves do roteiro foi executado numa pasta temporária. As duas chaves são assinadas com o segredo gerado, **não** batem com o segredo de exemplo e saem com `iss` igual a `supabase`. Os valores gerados foram descartados sem exibição.

### 2026-10-26 · I0.4 · concluída e integrada

- Perfil/modelo: `builder` (T1) em worktree isolado, modelo padrão herdado; T2 (Claude Opus 5.5) verificou e integrou. Fallback informado: nenhum.
- **Primeira tentativa:** handoff correto. ESLint 10 com `eslint-config-next` 16.4.3 não fecha nas dependências pares: `eslint-plugin-react`, `-import` e `-jsx-a11y` aceitam no máximo o 9. O T2 conferiu por `npm view` e decidiu pelo ESLint 9.39.5 (ADR-0001 §2.4). Também aprovou `vite` 8.3.5 e `@types/node` 24.19.2, porque o Vitest 5 exige o `vite`.
- **Segunda tentativa:** commit `b09297d`, com 35 arquivos.
  - O builder recriou sozinho o worktree e o branch, que tinham sido removidos depois do primeiro handoff. A base é a mesma (`77f6ac4`) e a operação foi só local.
- **Verificação do T2:**
  - diff só em arquivos permitidos;
  - configuração e varredor lidos;
  - a partir de `node_modules` e `.next` apagados: `npm ci` com 0 avisos `ERESOLVE`; `npm ls` 0; `lint` 0; `typecheck` 0; `test` 0 (2 arquivos, 44 testes); `format:check` 0; `build` 0, gerando `.next/standalone/server.js`;
  - prova de falha refeita: "VERIFICADO" detectado (saída 1); linha com a qualificação e linha com o marcador não acusam;
  - nenhum segredo nem `service_role` em `src/` ou `config/`.
- **Integração:** fast-forward da `main` para `b09297d`, sem commit novo.
  - `skills-lock.json` acrescentado ao `.prettierignore` (par do `.claude/`), porque fazia o `format:check` falhar na `main`. A decisão de versionar ou ignorar esse arquivo continua com a pessoa responsável.
- **Riscos registrados no ADR:**
  - ESLint 9.39.5 marcado como sem suporte (risco aceito: ferramenta de desenvolvimento);
  - o varredor trabalha por linha e não confere a parte "em [data]" da qualificação.
- O worktree do builder continua em `.claude/worktrees/agent-a49faeaf03b05404c` (ignorado pelo Git); pode ser removido.

### 2026-10-27 · D1 final · Supabase Cloud e Vercel

- A pessoa responsável pediu para "criar um github branch e hospedar na vercel ao invés do easypanel". Ela respondeu a duas perguntas:
  - banco: "Supabase Cloud (Recomendado)";
  - branch: "main com deploy de preview (Recomendado)".
- **Efeitos nos documentos:**
  - ADR-0001 §1.2, §2.1, §2.3, §2.6, §3, §4 e §5 reescritos para Supabase Cloud em `sa-east-1` e Vercel;
  - v1.1: cabeçalho e seções 0, 4.2, 4.4, 4.5, 7.1 e 12;
  - diagnóstico: D1;
  - plano: I0.3, I0.9, I0.10, I0.11, I6.1, I6.4 e I6.9, gate 12 e risco de infraestrutura; I0.12 e I0.13 canceladas;
  - `CLAUDE.md`.
- O roteiro `docs/operacao/easypanel.md` (escrito em 26/10, nunca commitado) foi removido.
- **Contas consultadas:**
  - Vercel: um time (`dyones-projects`), com integração GitHub em `85dyones` sem restrição de repositório;
  - Supabase: a organização atual hospeda os projetos da Motors e da V2O5. Por isso a recomendação é uma organização própria do repasse (decisão H na I0.3).
- **Limite da automação:** a ferramenta da Vercel nesta sessão não altera a branch de produção. Mitigação: autenticação da Vercel em todos os deploys; a troca para `producao` fica com a pessoa responsável, no painel.
- Commit `23cdf29` com a D1 final e o registro da I0.4.
- **I0.9, tentativas do T2 em 27/10:**
  - criar o projeto `repasse` pela integração da Vercel: **403** ("You don't have permission to create the project"). Não repetido;
  - `git push -u origin main`: **negado** pelo classificador de permissões do modo automático ("Out-of-Place Publication"). Não contornado.
  - O push e a criação do projeto na Vercel passam para a pessoa responsável. O T2 confere depois, pela leitura do projeto na Vercel e do remoto.
- **Push feito pela pessoa responsável (27/10):** `git ls-remote origin` mostra `refs/heads/main` e `HEAD` em `23cdf29`, igual à `main` local, que agora acompanha `origin/main`.
- **Projeto na Vercel:** ainda não existe. Não aparece buscando por "repasse" nem pelo repositório, e `get_project` devolve 404 para `repasse` e `ideal-garbanzo`.
- **Projeto criado pela pessoa responsável (27/10):** `ideal-garbanzo` (`prj_tjGFghO2iZmZik0rhaWnAaiuZSxY`), no time `dyones-projects`.
  - Leitura pelo ID: framework `nextjs`; Node `24.x`; `ssoProtection` ligada com `all_except_custom_domains` ("Standard"); nenhum domínio; nenhum deploy (`latestDeployment: null`; `list_deployments` vazio).
  - Pelo nome com `teamId`, a leitura devolve 404. Só funciona pelo ID ou pela listagem sem `teamId`; a integração parece ter acesso restrito por projeto.
  - **Não verificáveis pela integração:** a ligação com o Git e a branch de produção. Hipótese: a branch de produção já foi trocada para `producao`, e por isso nenhum deploy saiu ainda. O próximo push na `main` deve gerar o primeiro preview.
  - **Nome:** o projeto ficou `ideal-garbanzo`, não `repasse` como no ADR-0001 §3.2. Sem impacto técnico; o ADR passa a citar `ideal-garbanzo`.
- **Primeiro deploy (27/10):** push do `32964c4` feito pela pessoa responsável. Deploy `dpl_TVNF9iUbxg4QDVb3BWFoAjYRnUXi`:
  - origem `git`, commit `32964c4`;
  - `READY` em uns 23 segundos;
  - `target: production`, ou seja, a branch de produção ainda é a `main`;
  - região `iad1`.
- **Teste de acesso sem login (`curl`), com a proteção "Standard":**
  - o domínio de produção `ideal-garbanzo-six.vercel.app` respondeu **HTTP 200, público**, com a página "Plataforma em construção.";
  - os outros três endereços responderam 302 para `vercel.com/sso-api`.
- **Correção pelo T2:** `update_project` com `ssoProtection: all`, aceito pela integração.
  - **Novo teste:** os quatro endereços respondem 302 para o login, e a página não aparece em nenhum.
  - Ficou público por uns minutos, só com a página de construção e sem dado nenhum.
- **Região:** `update_project` com `functionDefaultRegions: ["gru1"]`, aceito pela integração. A resposta não mostra o campo; a confirmação vem no próximo deploy.
- **Pendências da I0.9:**
  - a pessoa responsável troca a branch de produção para `producao` (Settings → Environments → Production). Isso precisa ser feito antes de cadastrar variáveis do Supabase; com a `main` como produção, a homologação usaria as variáveis de produção;
  - confirmar `gru1` no próximo deploy.
- **Segundo deploy (27/10):** a pessoa responsável informou que trocou a branch de produção para `producao` e fez o push do `0988a21`. Deploy `dpl_B9dbjD6kuDGKcsXmKiDmhv22aGBf`:
  - `READY` em uns 12 segundos;
  - **região `gru1` confirmada**;
  - **ainda `target: production`**, com o alias de produção `ideal-garbanzo-six.vercel.app`.
- **Teste sem login (`curl`):** os cinco endereços (três aliases e as URLs dos dois deploys) respondem 302 para `vercel.com/sso-api`, sem a página. A proteção `all` se mantém.
- **Branch de produção não pegou:** a branch `producao` não existe no GitHub (`git ls-remote origin producao` vazio). Hipótese: a Vercel não aceita acompanhar uma branch inexistente, ou a troca não foi salva. A integração não lê esse campo.
- **Próximo passo proposto:**
  1. criar a `producao` no GitHub apontando para a `main` atual. Enquanto a produção for a `main`, esse push gera um deploy de preview;
  2. trocar a branch de produção no painel;
  3. o próximo push na `main` precisa sair como preview.
  - A `producao` só recebe código novo no Inc. 6, com aprovação H.
