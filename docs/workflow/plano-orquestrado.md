# PLANO DE EXECUÇÃO ORQUESTRADO
## Plataforma B2B de Oportunidades e Repasse de Veículos

**Fontes:** `operacao-repasse-origem.md` (especificação v1.0) e `model-orchestration.md` (regras de orquestração)  
**Status:** plano inicial, antes da Sprint 0  
**Atualizado em:** 2026-10-22  
**Responsável pelo aceite:** orquestrador (T2), com aprovação da pessoa responsável pelo produto (H) onde indicado

Este plano não altera a especificação. Ele traduz cada sprint do §12 em subtarefas despacháveis, com nível de execução, arquivos permitidos, aceite e verificação. Em conflito, a especificação prevalece sobre este plano quanto às regras de negócio, e o `model-orchestration.md` prevalece quanto ao despacho, ao escalonamento e ao paralelismo.

Referências como §6.2 apontam para seções da especificação.

---

# 1. COMO USAR ESTE PLANO

1. No início de cada sessão, o orquestrador lê `CLAUDE.md`, `docs/workflow/current-task.md`, a sprint atual neste plano, as seções da especificação citadas na subtarefa e o estado do Git.
2. Copia a subtarefa da vez para `current-task.md`: escopo, arquivos permitidos, entrega, aceite e verificação.
3. Despacha conforme a coluna **Nível**. Quando o nível é T2, o próprio orquestrador executa.
4. Ao concluir, registra a evidência real (comandos, saídas, diff) em `current-task.md` e atualiza o quadro de progresso abaixo.
5. A sprint só fecha quando o gate de saída for cumprido com evidência observada.

**Níveis:**

| Código | Perfil | Quem executa |
|---|---|---|
| T0 | `fast-helper` | subagente somente leitura |
| T1 | `builder` | subagente com escrita em worktree isolado |
| T2 | `orchestrator` | sessão principal do Claude Code |
| T3 | `reasoning-review` | subagente revisor, somente leitura, de preferência com modelo independente do T2 |
| TV | `vision-review` | subagente com entrada de imagem confirmada |
| H | pessoa responsável | ação humana obrigatória |

## Quadro de progresso

| Etapa | Status | Gate de saída |
|---|---|---|
| Pré-requisitos P1–P6 | não iniciado | worktree funcional e perfis validados ou fallback documentado |
| Sprint 0: Fundação | não iniciado | app local e em homologação |
| Sprint 1: Identidade e organizações | não iniciado | isolamento entre empresas comprovado |
| Sprint 2: Veículos e ofertas | não iniciado | publicar e retirar com histórico |
| Sprint 3: Planos e antecipação | não iniciado | não elegível não obtém dados restritos |
| Sprint 4: Negociação | não iniciado | rastreio da visualização até a negociação |
| Sprint 5: Monetização | não iniciado | estados financeiros só mudam por evento confirmado |
| Sprint 6: Piloto | não iniciado | critérios críticos de produção atendidos |

---

# 2. CLASSIFICAÇÃO DE RISCO POR MÓDULO

A classificação segue o algoritmo de despacho: risco, reversibilidade, ambiguidade, abrangência e ferramentas, não número de linhas.

| Módulo (§11.1) | Risco | Motivo | Implementação | Revisão T3 |
|---|---|---|---|---|
| `auth` | Crítico | autenticação, sessão, usuário suspenso (§7.2 #3, #6) | T2 | Obrigatória |
| `organizations` | Crítico | isolamento multiempresa, papéis, RLS (§7.1) | T2; telas em T1 | Obrigatória |
| `vehicles` | Médio | placa restrita e mídia privada (§4.4, §5.4, §5.5) | T1 nas telas; T2 nas políticas de Storage | Obrigatória para Storage |
| `offers` | Alto | máquina de estados, publicação, histórico de preço (§5.6, §6.1) | T2 nas operações e consultas; T1 nas telas | Obrigatória |
| `access-control` | Crítico | acesso premium decidido só no servidor (§1.4, princípio 2; §6.2) | T2 | Obrigatória |
| `proposals` | Alto | isolamento entre compradores, histórico imutável (§6.3) | T2 nas operações; T1 em favoritos e telas | Obrigatória |
| `transactions` | Crítico | origem do negócio e evidência de venda (§5.12, §6.4) | T2 | Obrigatória |
| `commissions` | Crítico | valores financeiros; nunca "paga" sem evidência (§1.4, princípio 4; §6.5) | T2 | Obrigatória |
| `subscriptions` | Crítico | cobrança e webhooks idempotentes (§6.6) | T2 | Obrigatória |
| `notifications` | Baixo/médio | não é fonte de verdade (§4.5) | T2 na outbox; T1 em templates e fluxos n8n | Só se tocar dados pessoais |
| `audit` | Alto | rastreabilidade; não pode registrar segredos (§5.14) | T2 | Junto com cada módulo crítico |
| Telas (§9) | Médio | estados obrigatórios, mobile-first | T1 | TV quando houver screenshot |
| Documentação | Baixo | — | T0 rascunha; T1 ou T2 escreve | Não |

**Regra derivada:** módulo crítico não aceita fallback heterogêneo silencioso. Se o modelo do T2 ficar indisponível durante uma subtarefa crítica, a subtarefa pausa com handoff (seção 9) em vez de continuar num modelo menos capaz.

---

# 3. PAPEL DE CADA NÍVEL NESTE PROJETO

| Nível | Faz neste projeto | Nunca faz |
|---|---|---|
| T0 | inventaria arquivos e ferramentas; extrai regras da especificação em tabelas de decisão; rascunha casos de teste; compara entregas com critérios de aceite; varre logs de teste em busca de segredos | escrever no repositório; decidir arquitetura; resolver requisito ambíguo |
| T1 | telas do §9; testes a partir de tabelas de decisão já aprovadas; operações de baixo risco sobre políticas já prontas; templates de e-mail e fluxos n8n; documentação técnica | migrações ou políticas de identidade, acesso, Storage ou finanças; webhooks; push; deploy; migração destrutiva |
| T2 | planeja a sprint; escreve ADRs; migrações e RLS; operações de servidor críticas; integra ou rejeita worktrees; diagnóstico difícil; mantém os handoffs | declarar pronto sem evidência; ativar módulo bloqueado pelo §14; aplicar migração em produção |
| T3 | revisa diff e evidências dos módulos críticos; tenta quebrar os testes negativos do §7.2; revisa ADRs | editar código; aprovar com base apenas no resumo do implementador |
| TV | compara screenshots com o brief visual e com os estados obrigatórios do §9 | atestar regra de negócio pela aparência da tela (§13, regra 9) |
| H | decisões do §14; credenciais; criação de projetos Supabase e hospedagem; primeiro deploy em homologação; qualquer operação em produção; aceite do piloto | — |

---

# 4. GATES TRANSVERSAIS

Valem para todas as sprints, independentemente do modelo:

1. **Migrações:** versionadas e testadas em banco limpo antes da integração (§11.2). Migração destrutiva exige plano escrito e aprovação H.
2. **Políticas de segurança:** nenhuma política RLS ou de Storage é desabilitada ou afrouxada para um teste passar (§13, regra 7). A chave `service_role` só existe em código de servidor; o T2 confirma por busca no código cliente antes de integrar.
3. **Testes negativos válidos:** todo teste de isolamento precisa falhar quando a política correspondente é removida. O T2 ou o T3 faz essa verificação de mutação. Teste que passa com e sem a política não conta como evidência.
4. **Pendências do §14:** a estrutura pode ser construída; o comportamento definitivo não. Valores comerciais ficam em configuração, marcados como provisórios.
5. **Produção, push e deploy:** somente com aprovação H explícita, por ação.
6. **Dados:** nenhum dado real de cliente em seed, fixture ou teste (§4.6). Nenhum dado de teste apresentado como evidência de venda real (§13, regra 8).
7. **Entrega de subagente:** resumo, arquivos e diff, testes executados com saída, limitações e riscos. O T2 inspeciona o diff e roda os testes antes de integrar.
8. **Definição de pronto (§15):** exige revisão por um segundo agente. Nos módulos críticos, esse segundo agente é o T3.

---

# 5. PRÉ-REQUISITOS ANTES DA SPRINT 0

**Estado atual:** a pasta não é um repositório Git, não há código e os subagentes de `.claude/agents/` ainda não foram validados contra o gateway. Sem Git não existe worktree, portanto nenhum T1 pode ser despachado antes de P1.

| ID | Item | Nível | Aceite |
|---|---|---|---|
| P1 | `git init`, `.gitignore` com `.env*` (exceto `.env.example`), commit inicial com os documentos | T2 | `git status` limpo; arquivo `.env` de teste aparece como ignorado |
| P2 | Confirmar o FreeLLMAPI real, a versão instalada e o endpoint local | H + T2 | registrado em `current-task.md` |
| P3 | Obter os IDs exatos do catálogo e associá-los aos perfis | H + T2 | nenhum ID inventado; campo `model` preenchido em `.claude/agents/*.md` |
| P4 | Validar `auto:<profile>` ou IDs exatos como `model` dos subagentes | T2 | cada subagente responde; modelo efetivo registrado, ou registrado que o gateway não o informa |
| P5 | Rodar o checklist de validação do `model-orchestration.md` | T2 + T3 | itens marcados com evidência; T3 encontra defeitos inseridos de propósito num diff de teste |
| P6 | Definir o que pode ser enviado a cada provedor (segredos e dados pessoais nunca) | H + T2 | política registrada em `CLAUDE.md` |

Enquanto P2–P5 não estiverem concluídos, os subagentes rodam sem `model` explícito e herdam o modelo padrão da instalação. Isso custa mais, mas não rebaixa a qualidade silenciosamente.

---

# 6. SPRINTS DECOMPOSTAS

Os caminhos de arquivo são provisórios até a S0.2 fixar a estrutura física; depois dela, o T2 atualiza esta seção. Convenção provisória: `app/` para rotas, `src/modules/<módulo>/` para domínio, `supabase/migrations/` e `supabase/tests/` para banco, `tests/e2e/` para ponta a ponta, `docs/adr/` para decisões.

Paralelismo segue o limite inicial de dois subagentes simultâneos, cada um com fronteira de arquivos própria.

## Sprint 0: Fundação

**Aceite da sprint (§12):** aplicação executa localmente e é publicada em homologação.  
**Seções:** §4, §11.  
**Depende de:** P1.  
**Bloqueios do §14:** nenhum. Dependências externas (H): projetos Supabase de desenvolvimento e homologação, hospedagem de homologação, credenciais em variáveis protegidas.

| ID | Subtarefa → entrega | Nível | Arquivos permitidos | Aceite e verificação |
|---|---|---|---|---|
| S0.1 | Levantar ferramentas instaladas (Node, gerenciador de pacotes, Supabase CLI, Docker) → relatório com versões | T0 | nenhum | versões observadas por comando, não presumidas |
| S0.2 | Decidir a estrutura física dos módulos do §11.1 e as ferramentas de lint, formatação, teste unitário, teste de banco e e2e → ADR-0001 | T2 | `docs/adr/0001-fundacao.md`, este plano | ADR com alternativas e motivo; caminhos deste plano atualizados |
| S0.3 | Scaffold Next.js com TypeScript estrito, lint, formatação e um teste unitário de exemplo | T1 | tudo exceto `supabase/` e `docs/` | `lint`, `typecheck`, `test` e `build` passam no worktree; saídas anexadas |
| S0.4 | Supabase local: `supabase init`, migração inicial não destrutiva, seed sem dados reais, um teste de banco de exemplo | T1 | `supabase/**` | reset do banco limpo sem erro; teste de banco passa |
| S0.5 | `.env.example` com as variáveis do §11.3, sem valores reais, separando público de somente servidor | T2 | `.env.example`, `docs/ambiente.md` | nenhuma chave real; `service_role` marcada como somente servidor. Tarefa pequena: delegar custaria mais que fazer |
| S0.6 | CI com lint, typecheck, testes e migrações em banco limpo | T2 | arquivos de CI definidos no ADR-0001 | pipeline verde num commit de teste |
| S0.7 | Configurar homologação e fazer o primeiro deploy | H + T2 | — | H fornece credenciais e aprova; T2 prepara as instruções; app abre na URL de homologação |
| S0.8 | README de instalação local | T1 | `README.md` | T2 segue o README do zero num worktree limpo e sobe a aplicação |

**Paralelismo:** S0.3 ∥ S0.4 (só a S0.4 toca `supabase/`). S0.8 depois de integrar as duas.  
**Gate de saída:** aceite do §12 observado; CI verde; T2 confirma que nenhum segredo entrou no histórico do Git. Revisão T3 não obrigatória.

## Sprint 1: Identidade e organizações

**Aceite da sprint (§12):** um usuário não acessa dados privados de outra empresa.  
**Seções:** §2.1.A, §3, §5.1–5.3, §5.14, §7.  
**Depende de:** Sprint 0.  
**Bloqueios do §14:** #8 (acesso direto de fornecedores) e #9 (documentos para aprovação). Modelar papéis e status; não codificar a lista de documentos nem habilitar login de fornecedor por padrão.

| ID | Subtarefa → entrega | Nível | Arquivos permitidos | Aceite e verificação |
|---|---|---|---|---|
| S1.1 | Extrair regras de identidade, a matriz do §3.2 e os testes negativos §7.2 #2, #3, #6 e #10 → tabela de decisão e casos de teste em texto | T0 | nenhum | cada regra cita a seção de origem; ambiguidades listadas à parte |
| S1.2 | Decidir o modelo de papéis: papéis de plataforma separados dos papéis por empresa, funções auxiliares de autorização e revalidação de usuário suspenso (lacunas L5, L10) → ADR-0002 | T2 | `docs/adr/0002-identidade.md` | ADR responde às ambiguidades da S1.1; o que muda regra comercial vai para H |
| S1.3 | Migrações de `organizations`, `profiles`, `organization_members` e `audit_logs` (antecipada, lacuna L3); restrições; sincronização segura de e-mail; bloqueio de autopromoção; RLS | T2 | `supabase/migrations/**`, `supabase/tests/**` | reset limpo; RLS ativa em toda tabela exposta ao cliente |
| S1.4 | Testes de isolamento e de papel a partir da S1.1 | T1 | `supabase/tests/identity/**`, testes em `src/modules/auth/**` e `src/modules/organizations/**` | testes passam; T2 remove cada política e confirma que o teste correspondente falha |
| S1.5 | Operações de servidor: criar empresa, vincular membro, alterar papel, suspender e reativar, todas com auditoria | T2 | `src/modules/auth/**`, `src/modules/organizations/**`, `src/modules/audit/**` | payload manipulado não altera papel (§7.2 #3); usuário suspenso é barrado na operação seguinte (§7.2 #6) |
| S1.6 | Telas de login, cadastro, recuperação de acesso, perfil da empresa e membros | T1 | rotas de autenticação e de empresa em `app/`, componentes | estados de carregamento, vazio, erro, sem permissão e inexistente (§9); nenhuma autorização só no frontend |
| S1.7 | Revisão independente do diff, das políticas RLS, do ADR-0002 e das saídas da S1.4 | T3 | leitura | relatório por severidade; achado crítico bloqueia o gate |

**Paralelismo:** S1.4 (T1) roda enquanto o T2 executa a S1.5. S1.6 começa quando os contratos da S1.5 estiverem integrados.  
**Gate de saída:** aceite do §12; §7.2 #2, #3, #6 e #10 passando com verificação de mutação; §10.3 fluxo 1; T3 sem achado crítico aberto.

## Sprint 2: Veículos e ofertas

**Aceite da sprint (§12):** operador consegue publicar e retirar uma oferta com histórico.  
**Seções:** §2.1.B–C, §4.4, §5.4–5.6, §6.1, §8.  
**Depende de:** Sprint 1.  
**Bloqueios do §14:** #10 (regiões e categorias) e #11 (dados públicos, privados e restritos). Campos de visibilidade indefinida ficam privados até decisão H.

| ID | Subtarefa → entrega | Nível | Arquivos permitidos | Aceite e verificação |
|---|---|---|---|---|
| S2.1 | Extrair campos obrigatórios para publicação (§6.1), transições de `offers.status` e campos restritos → tabela de transições e checklist | T0 | nenhum | cada transição cita a origem; as não especificadas ficam marcadas "a decidir" |
| S2.2 | Decidir máquina de estados, histórico de alterações, expiração sem depender do n8n e autorização de divulgação (lacunas L2, L7, L8) → ADR-0003 | T2 | `docs/adr/0003-ofertas.md` | cada transição tem regra e autor permitido |
| S2.3 | Migrações de `vehicles`, `vehicle_media`, `offers` e histórico; transições validadas no banco; RLS | T2 | `supabase/migrations/**`, `supabase/tests/**` | transição inválida rejeitada pelo banco, não só pela tela |
| S2.4 | Storage: bucket privado, políticas e URLs temporárias para mídia restrita | T2 | `supabase/migrations/**`, `src/modules/vehicles/**` | arquivo privado não é obtido só pelo caminho (§7.2 #7) |
| S2.5 | Testes unitários e de banco da máquina de estados aprovada na S2.2 | T1 | testes em `src/modules/offers/**`, `supabase/tests/offers/**` | todas as transições válidas e ao menos uma inválida por estado |
| S2.6 | `createOffer`, `updateOffer`, `publishOffer` e `withdrawOffer` com validações do §6.1 e auditoria de publicação, retirada e preço | T2 | `src/modules/offers/**`, `src/modules/audit/**` | publicar sem campo obrigatório falha com erro previsível; alteração de preço gera registro |
| S2.7 | `listOffers` e `getOfferDetails` com ponto único de autorização, preparado para a elegibilidade da Sprint 3 | T2 | consultas em `src/modules/offers/**` | resposta não contém placa, documento nem dados privados de outro fornecedor (§7.2 #2) |
| S2.8 | Telas de admin e operador: veículo, upload e ordem das fotos, oferta, revisão, publicar e retirar | T1 | rotas administrativas em `app/`, componentes | fluxo completo pela interface, sem editar o banco |
| S2.9 | Catálogo do lojista: busca, filtros do §2.1.C, ordenação, paginação, detalhe e indicação de indisponível | T1 | rotas do catálogo em `app/`, componentes | consome apenas `listOffers` e `getOfferDetails`; oferta retirada aparece como indisponível |
| S2.10 | Revisão de Storage, máquina de estados, vazamento de campos e auditoria de preço | T3 | leitura | sem achado crítico aberto |
| S2.11 | Screenshots de catálogo, detalhe e cadastro em mobile e desktop | TV | leitura | estados do §9 visíveis; achados viram correção T1 |

**Paralelismo:** S2.5 ∥ S2.8 depois da S2.3. S2.9 depois da S2.7.  
**Gate de saída:** aceite do §12 demonstrado com evidência; §7.2 #2 e #7 passando; §10.3 fluxos 2 e 3; T3 sem achado crítico aberto.

## Sprint 3: Planos e antecipação

**Aceite da sprint (§12):** usuários elegíveis acessam a oferta; usuários não elegíveis não obtêm os dados restritos.  
**Seções:** §2.1.D, §5.7–5.9, §6.2, §7.2 #4–#5.  
**Depende de:** Sprint 2, em especial o ponto único de autorização da S2.7.  
**Bloqueios do §14:** #6 (inadimplência), #7 (janela por plano) e #11. Política de inadimplência e janelas ficam configuráveis, com valores de desenvolvimento marcados como provisórios; os testes cobrem cada opção da política.

| ID | Subtarefa → entrega | Nível | Arquivos permitidos | Aceite e verificação |
|---|---|---|---|---|
| S3.1 | Extrair os fatores de elegibilidade do §6.2 e os estados do §5.9 → tabela de decisão com casos-limite (segundo exato da liberação, fuso, `past_due`, `canceled`, empresa suspensa) | T0 | nenhum | cada linha cita a seção; combinações que dependem do §14 marcadas |
| S3.2 | Decidir a representação estruturada de benefícios (§5.8), as regras por oferta e a resolução determinística de conflitos (§5.7) → ADR-0004 | T2 | `docs/adr/0004-acesso-antecipado.md` | regra genérica nunca amplia acesso restrito; precedência escrita |
| S3.3 | Migrações de `plans`, `subscriptions` (estrutura antecipada, porque a elegibilidade depende do status), `offer_access_rules` e registro de acessos e tentativas negadas (lacuna L6); RLS | T2 | `supabase/migrations/**`, `supabase/tests/**` | reset limpo |
| S3.4 | `checkOfferEligibility` no servidor, ligada a `listOffers`, `getOfferDetails` e às políticas de mídia; prévia sem preço, dados privados nem imagens restritas | T2 | `src/modules/access-control/**`, consultas de `src/modules/offers/**`, políticas de Storage | URL direta, chamada de API e caminho de mídia não vazam antes da liberação (§7.2 #4) |
| S3.5 | Testes da tabela de decisão da S3.1, com relógio controlável | T1 | testes em `src/modules/access-control/**`, `supabase/tests/access/**` | todas as linhas cobertas; T2 faz verificação de mutação |
| S3.6 | Telas de gestão de planos e regras de acesso (admin) e de prévia bloqueada com horário de liberação (lojista) | T1 | rotas de planos e do catálogo em `app/` | T2 confere a resposta de rede da prévia, não apenas a tela |
| S3.7 | E2E de bloqueio antecipado e liberação no horário (§10.3 fluxos 4 e 5) | T1 | `tests/e2e/acesso/**` | passam no ambiente local e em homologação |
| S3.8 | Revisão obrigatória: vazamento por qualquer canal, conflitos de regra, assinatura inativa (§7.2 #5), fuso horário | T3 | leitura | sem achado crítico aberto |

**Paralelismo:** S3.5 ∥ S3.6 depois da S3.4. S3.7 depois das duas.  
**Gate de saída:** aceite do §12 com testes positivos e negativos; §7.2 #4 e #5 passando; T3 sem achado crítico aberto.

## Sprint 4: Negociação

**Aceite da sprint (§12):** uma oportunidade pode ser rastreada desde a visualização autorizada até a negociação.  
**Seções:** §2.1.E, §2.1.H, §4.5, §5.10–5.11, §6.3–6.4.  
**Depende de:** Sprint 3.  
**Bloqueios do §14:** nenhum direto. Credenciais do serviço de e-mail e instância do n8n são providenciadas por H.

| ID | Subtarefa → entrega | Nível | Arquivos permitidos | Aceite e verificação |
|---|---|---|---|---|
| S4.1 | Extrair estados e transições de propostas, regras de duplicação e retirada e fontes de origem (§6.4) → tabela e casos de teste | T0 | nenhum | ambiguidades listadas à parte |
| S4.2 | Decidir como registrar manifestação de interesse, origem desde o primeiro contato e histórico de propostas (lacunas L1, L2) e a outbox de eventos (§4.5) → ADR-0005 | T2 | `docs/adr/0005-negociacao.md` | decisão que afete regra de comissão vai para H antes de implementar |
| S4.3 | Migrações de `favorites`, `proposals`, histórico, interesse e origem, outbox; RLS por comprador e por fornecedor | T2 | `supabase/migrations/**`, `supabase/tests/**` | proposta aceita não é sobrescrita; histórico só recebe inserções |
| S4.4 | `createProposal`, `updateProposalStatus` e registro de interesse e origem, com proteção contra envio duplicado | T2 | `src/modules/proposals/**`, `src/modules/transactions/**`, `src/modules/audit/**` | duplo envio não cria duas propostas; oferta retirada não recebe proposta (§5.6) |
| S4.5 | `createFavorite`, `removeFavorite` e tela de favoritos sobre as políticas da S4.3 | T1 | módulo de favoritos definido no ADR-0001, rota de favoritos em `app/` | favorito duplicado rejeitado; isolamento entre empresas mantido (§5.10) |
| S4.6 | Testes de transições de proposta, isolamento entre compradores (§7.2 #1) e escopo do fornecedor | T1 | testes em `src/modules/proposals/**`, `supabase/tests/proposals/**` | T2 faz verificação de mutação |
| S4.7 | Telas de propostas e negociações (lojista), manifestações e negociações (fornecedor) e histórico | T1 | rotas do lojista e do fornecedor em `app/` | estados do §9 |
| S4.8 | Templates de e-mail e fluxos n8n exportados que consomem a outbox; nenhuma credencial no repositório | T1 | `automations/n8n/**`, templates em `src/modules/notifications/**` | falha do n8n não altera estado de proposta |
| S4.9 | Revisão de isolamento, imutabilidade do histórico, idempotência e outbox | T3 | leitura | sem achado crítico aberto |
| S4.10 | Screenshots das telas de negociação | TV | leitura | estados do §9 visíveis |

**Paralelismo:** S4.5 ∥ S4.6 depois da S4.3; em seguida S4.7 ∥ S4.8.  
**Gate de saída:** rastreio demonstrado de ponta a ponta (visualização autorizada → interesse → proposta → status), com a origem consultável; §7.2 #1 passando; §10.3 fluxos 6 e 7; T3 sem achado crítico aberto.

## Sprint 5: Monetização

**Aceite da sprint (§12):** os estados financeiros refletem eventos confirmados e não podem ser alterados por usuários sem permissão.  
**Seções:** §2.1.F, §5.9, §5.12–5.14, §6.5–6.6, §7.2 #5, #8, #9.  
**Depende de:** Sprint 4.  
**Bloqueios do §14:** #1–#4 (comissão), #5 (provedor de cobrança), #6 e #12. Sem #5, a integração fica atrás de uma interface, com provedor simulado apenas nos testes. Sem #1–#4, comissões funcionam em modo estrutural: estados e evidências existem, mas a regra que faz nascer a obrigação não é ativada.

| ID | Subtarefa → entrega | Nível | Arquivos permitidos | Aceite e verificação |
|---|---|---|---|---|
| S5.1 | Extrair estados de transação, comissão e assinatura, eventos de cobrança e os testes §7.2 #5, #8 e #9 → tabelas e casos | T0 | nenhum | pendências do §14 associadas a cada estado |
| S5.2 | Decidir a configuração comercial (lacuna L9), o armazenamento de eventos para idempotência (lacuna L4), a interface do provedor e quem pode executar cada transição → ADR-0006 | T2 | `docs/adr/0006-monetizacao.md` | nenhuma regra do §14 inventada; pendências explícitas |
| S5.3 | Migrações de `transactions`, `commissions`, eventos de cobrança e configuração comercial; o banco impede `paid` sem evidência e alteração de preço ou pagador sem permissão | T2 | `supabase/migrations/**`, `supabase/tests/**` | §7.2 #9 garantido no banco |
| S5.4 | `reportTransaction`, `confirmTransaction` e `recordCommissionPayment` com evidência obrigatória e auditoria | T2 | `src/modules/transactions/**`, `src/modules/commissions/**`, `src/modules/audit/**` | comissão não vira `paid` sem confirmação ou reconciliação autorizada (§6.5) |
| S5.5 | `processBillingWebhook` com validação de assinatura, idempotência e eventos fora de ordem | T2 | `src/modules/subscriptions/**`, rota do webhook | evento duplicado não altera estado (§7.2 #8). Integração real bloqueada pelo §14 #5 |
| S5.6 | Testes das máquinas de estados financeiras e do webhook, com fixtures identificadas como teste | T1 | testes em `src/modules/transactions/**`, `src/modules/commissions/**`, `src/modules/subscriptions/**`, `supabase/tests/finance/**` | T2 faz verificação de mutação |
| S5.7 | Telas de transações, comissões (evidência e contestação) e assinaturas (admin) e de assinatura e cobrança (lojista) | T1 | rotas financeiras e de assinatura em `app/` | nenhuma ação altera estado financeiro sem passar pela operação de servidor |
| S5.8 | Consolidar a auditoria: todos os eventos do §5.14 cobertos; nenhum segredo, token ou dado pessoal desnecessário nos logs | T2 | `src/modules/audit/**` | T0 varre os logs de teste em busca de padrões de segredo |
| S5.9 | Revisão obrigatória de segurança financeira | T3 | leitura | sem achado crítico aberto |
| S5.10 | Escolher o provedor (§14 #5) e aprovar as regras de comissão (§14 #1–#4) e os termos (§14 #12) | H | — | decisões registradas antes de ativar cobrança real |

**Paralelismo:** S5.6 ∥ S5.7 depois da S5.3 e da S5.4.  
**Gate de saída:** aceite do §12; §7.2 #5, #8 e #9 passando; §10.3 fluxos 8, 9 e 10; T3 sem achado crítico aberto; módulos bloqueados permanecem desativados e documentados como tal.

## Sprint 6: Piloto

**Aceite da sprint (§12):** todos os critérios críticos de produção estão atendidos.  
**Seções:** §7, §10, §11, §15.  
**Depende de:** Sprints 0–5.

| ID | Subtarefa → entrega | Nível | Arquivos permitidos | Aceite e verificação |
|---|---|---|---|---|
| S6.1 | E2E dos dez fluxos do §10.3 | T1 | `tests/e2e/**` | T2 roda em homologação e anexa a saída |
| S6.2 | Revisão de segurança completa: §7.1, os dez testes do §7.2, rate limiting, segredos, `service_role` fora do cliente | T3 | leitura | relatório; achado crítico bloqueia o piloto |
| S6.3 | Observabilidade do §11.4 e procedimento de incidentes | T2 | configuração de observabilidade, `docs/operacao/incidentes.md` | erro provocado em homologação aparece no monitoramento |
| S6.4 | Backup configurado e teste de restauração | H + T2 | `docs/operacao/backup.md` | T2 escreve o roteiro; H executa; restauração comprovada |
| S6.5 | Documentação de instalação, deploy e variáveis | T1 | `README.md`, `docs/**` | T0 confere o texto contra o estado real do repositório |
| S6.6 | Auditar os critérios do §10.4 e do §15 contra evidências reais → relatório de lacunas | T0 | nenhum | cada critério com evidência ou marcado "pendente" |
| S6.7 | Revisão visual de todas as telas do §9 em mobile e desktop | TV | leitura | estados obrigatórios visíveis |
| S6.8 | Treinamento operacional, entrada gradual de lojistas e decisão de go/no-go | H | — | decisão registrada |

**Paralelismo:** S6.1 ∥ S6.5. S6.2 e S6.6 depois das correções.  
**Gate de saída:** T2 declara prontidão técnica com evidências; H aprova o piloto. Módulos com pendência do §14 em aberto continuam desativados.

---

# 7. PENDÊNCIAS DO §14 × SUBTAREFAS

| # | Pendência | Afeta | Pode avançar antes da decisão | Não pode avançar antes da decisão |
|---|---|---|---|---|
| 1 | Quem paga a comissão | S5.2–S5.4 | campo de pagador e estados | geração automática de comissão |
| 2 | Evento que caracteriza venda elegível | S5.3, S5.4 | estados de `transactions` | regra de nascimento da obrigação |
| 3 | Comprovação de venda fora da plataforma | S4.2, S5.4 | campo de referência de evidência | aceitar um tipo de evidência como suficiente |
| 4 | Cancelamento e contestação | S5.3, S5.4 | estado `disputed` e fluxo de contestação | prazos de contestação |
| 5 | Provedor de cobrança | S5.5 | interface e provedor simulado em teste | integração e webhooks reais |
| 6 | Acesso em inadimplência | S3.4, S5.5 | política configurável e testes de cada opção | valor de produção |
| 7 | Janela de antecipação por plano | S3.2–S3.6 | estrutura de regras | janelas definitivas |
| 8 | Acesso direto de fornecedores | S1.2, S1.5, S2.8 | papel de fornecedor modelado | habilitar login de fornecedor em produção |
| 9 | Documentos para aprovação de empresas | S1.5 | status pendente e ativa | lista de documentos obrigatórios |
| 10 | Regiões e categorias atendidas | S2.2, S2.9 | filtros genéricos | restrições geográficas e por categoria |
| 11 | Dados públicos, privados e restritos por plano | S2.7, S3.4 | campos privados por padrão | expor campo hoje privado |
| 12 | Contratos, termos e privacidade | S5.10, S6.8 | páginas com texto provisório marcado | publicar termos ou cobrar |

---

# 8. LACUNAS ENCONTRADAS NA ESPECIFICAÇÃO

A especificação exige estes itens, mas não os modela. São decisões técnicas do T2, registradas nos ADRs indicados, exceto quando alteram regra comercial: nesse caso vão para H (§13, regra 6).

| ID | Lacuna | Onde aparece | Resolver em |
|---|---|---|---|
| L1 | Manifestação de interesse e origem desde o primeiro contato não têm tabela; existe apenas `transactions.source_type` | §2.1.E, §6.4 × §5 | ADR-0005 |
| L2 | Histórico de propostas e de alterações de oferta sem estrutura definida | §2.1.B, §5.11 | ADR-0003, ADR-0005 |
| L3 | `audit_logs` aparece na Sprint 5 do roteiro, mas eventos obrigatórios (permissões, publicação, preço) começam na Sprint 1 | §5.14 × §12 | antecipada na S1.3 |
| L4 | Idempotência de webhooks exige guardar os eventos recebidos; não há tabela para isso | §6.6 | ADR-0006 |
| L5 | Papéis de plataforma (administrador, operador) não têm representação; `organization_members.role` é por empresa | §3.1, §5.3, §7.2 #3 | ADR-0002 |
| L6 | Registro de acessos e de tentativas negadas sem tabela | §2.1.D | ADR-0004 |
| L7 | Autorização de divulgação exigida para publicar, sem campo em `offers` | §6.1 × §5.6 | ADR-0003 |
| L8 | Mecanismo de expiração de ofertas não definido, e a operação básica não pode depender do n8n | §5.6, §1.4 princípio 7 | ADR-0003 |
| L9 | Local da configuração comercial (R$ 1.000) não definido | §5.13 | ADR-0006 |
| L10 | O token de sessão de um usuário suspenso continua válido até expirar; a revalidação precisa acontecer no servidor e nas políticas | §7.2 #6 | ADR-0002 |
| L11 | Não há brief visual; o TV só consegue verificar estados obrigatórios e layout mobile-first, não fidelidade visual | §9 | H, se quiser fidelidade visual |

---

# 9. REGISTRO, ESCALONAMENTO E HANDOFF

**Registro:** cada subtarefa concluída gera uma entrada em `docs/workflow/current-task.md` com perfil e modelo usados, subagentes, fallback informado pelo gateway (nunca presumido), testes e resultados, critérios pendentes e motivo de escalonamento.

**Sinais de escalonamento deste projeto**, além dos listados no `model-orchestration.md`:

- teste negativo que passa com e sem a política correspondente;
- subagente T1 que tocou migração, política RLS ou Storage de módulo crítico;
- qualquer necessidade aparente de usar `service_role` em código acessível ao navegador;
- requisito que só se resolve inventando comportamento coberto pelo §14;
- divergência entre a resposta de rede e o que a tela mostra num fluxo de acesso restrito.

**Handoff de escalonamento** (no máximo uma página, sem descartar alterações existentes):

```markdown
## Handoff: <ID da subtarefa>
- Objetivo:
- Critérios de aceite:
- Perfil/modelo que executou e motivo do escalonamento:
- Estado do `git diff --stat`:
- Arquivos alterados:
- Comandos executados e resultados:
- Erro observado:
- Próxima hipótese:
```
