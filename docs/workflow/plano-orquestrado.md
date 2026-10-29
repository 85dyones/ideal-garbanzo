# PLANO DE EXECUÇÃO ORQUESTRADO v2
## Plataforma privada de oportunidades de repasse de veículos

**Fontes:** `docs/especificacao/especificacao-v1.1.md` (aprovada em 26/10/2026), `docs/diagnostico/2026-10-26-missao-001.md` e `model-orchestration.md`  
**Substitui:** o plano v1, baseado na especificação v1.0 (disponível no histórico do Git, commit `b34f01e`)  
**Atualizado em:** 2026-10-28  
**Responsável pelo aceite:** orquestrador (T2), com aprovação da pessoa responsável (H) onde indicado

Este plano traduz o roteiro da seção 12 da v1.1 em subtarefas despacháveis. Em caso de conflito, a v1.1 prevalece nas regras de negócio, e o `model-orchestration.md` prevalece no despacho, no escalonamento e no paralelismo. "§" indica uma seção da v1.1.

---

# 1. COMO USAR

1. No início de cada sessão, o orquestrador lê `CLAUDE.md`, `docs/workflow/current-task.md`, o incremento atual deste plano, as seções da v1.1 citadas na subtarefa e o estado do Git.
2. Copia a subtarefa da vez para `current-task.md`: escopo, arquivos permitidos, entrega, aceite e verificação.
3. Despacha conforme a coluna **Nível**. Quando o nível é T2, o próprio orquestrador executa.
4. Ao concluir, registra em `current-task.md` a evidência real (comandos, saídas, diff) e atualiza o quadro de progresso.
5. O incremento só fecha quando o gate de saída for cumprido com evidência observada.

**Níveis:**

| Código | Quem | Uso |
|---|---|---|
| T0 | `fast-helper` | leitura, extração de regras, inventário de código a portar, rascunho de casos de teste |
| T1 | `builder` | escrita em worktree isolado: telas, testes a partir de tabela aprovada, portes de baixo risco, documentação |
| T2 | sessão principal | ADRs, migrações, RLS, Storage, operações de servidor críticas, integração de worktrees |
| T3 | `reasoning-review` | revisão independente, somente leitura, de preferência com modelo diferente do T2 |
| TV | `vision-review` | screenshots; só com entrada de imagem confirmada |
| AG | Antigravity | revisão independente externa (briefing §8): riscos, permissões, exposição de documentos, estados documentais |
| H | pessoa responsável | decisões, credenciais, criação de projetos, deploy, produção, aceite do piloto |

## Quadro de progresso

| Etapa | Status | Gate de saída |
|---|---|---|
| Pré-requisitos P1-P6 | P1 concluída; P2-P6 pausadas | ver seção 5 |
| Inc. 0: Fundação | **concluído em 27/10** (I0.12 e I0.13 canceladas); gate cumprido, com CI verde aplicando a migração (execução 40598516010) | app local e em homologação; CI verde; testes de banco executam as migrações |
| Inc. 1: Identidade e adesão | **concluído em 28/10**: gate cumprido, com os testes 1, 2, 4, 5 e 13 com mutação no dev e a I1.7 sem crítico nem alto. As ressalvas estão no ADR-0002 §8, e as correções ficam na I1.8 | testes negativos 1, 2 (empresa), 4, 5 e 13 |
| Inc. 2: Oferta | em andamento: I2.1 entregue em 28/10; I2.2 a I2.9 entregues em 29/10 (ADR-0003 proposto; migrações, Storage, estado documental, operações de servidor, testes, telas do fornecedor e da administração, com 75 mutações verificadas no banco e na integração) | publica com pendência e mostra aviso; testes 2 (ofertas e documentos), 6, 11 e 12 (preço) |
| Inc. 3: Domínio documental | não iniciado | estados conforme §6.4; testes 7 e 10; revisão AG |
| Inc. 4: Catálogo privado | não iniciado | critérios 4, 6, 7 e 10 da §10 |
| Inc. 5: Ciência e negociação | não iniciado | critérios 8 e 9; testes 2 (negociações), 3, 8 e 9 |
| Inc. 6: Piloto | não iniciado | os 13 critérios da §10; go/no-go de H |

---

# 2. RISCO POR MÓDULO

| Módulo (§15) | Risco | Motivo | Implementação | Revisão |
|---|---|---|---|---|
| `auth` | Crítico | sessão, usuário suspenso, papéis de plataforma (§3.1, §6.1) | T2 | T3 obrigatório |
| `organizations`, `membership` | Crítico | isolamento entre empresas; aprovação | T2; telas T1 | T3 obrigatório |
| `vehicles` | Alto | placa, RENAVAM e chassi restritos (§7.2) | T2 nas políticas; T1 nas telas | T3 |
| `offers` | Alto | ciclo de estados, versões, histórico (§6.2, §6.7) | T2 nas regras; T1 nas telas | T3 obrigatório |
| `documental` | Crítico | estados documentais, origem da informação, nunca simular (§6.3-§6.6) | T2 | T3 e AG obrigatórios |
| `acknowledgments` | Crítico | ciência vinculada à versão (§6.7) | T2 | T3 obrigatório |
| `negotiations` | Alto | isolamento entre compradores; eventos só de inclusão (§6.8) | T2 nas regras; T1 nas telas | T3 obrigatório |
| `outcomes`, `commissions` | Crítico | valores; dependem de C1-C4 | T2 (pós-piloto) | T3 obrigatório |
| `notifications` | Médio | nunca levar dado restrito (§6.13) | T2 na outbox; T1 nos templates | T3 se tocar dado pessoal |
| `audit` | Alto | só inclusão; sem segredos (§5.6) | T2 | junto com cada módulo crítico |
| Infraestrutura (Supabase Cloud e Vercel) | Alto | proteção dos deploys, separação de projetos e variáveis, backup (ADR-0001 §5.1) | H e T2 | T3 (I6.9) |
| Telas (§9) | Médio | estados obrigatórios; linguagem proibida (§6.6) | T1 | TV quando houver screenshot |

**Regra derivada:** módulo crítico não aceita fallback heterogêneo silencioso. Se o modelo do T2 ficar indisponível numa subtarefa crítica, ela pausa com handoff (seção 9).

---

# 3. GATES TRANSVERSAIS

Valem para todos os incrementos, independentemente do modelo:

1. **Migrações:** versionadas e executadas de verdade num banco limpo antes da integração. Teste que só confere o texto do SQL não conta (lição de projeto interno). Migração destrutiva exige plano e aprovação H.
2. **Políticas de segurança:** nenhuma política RLS ou de Storage é desabilitada ou afrouxada para um teste passar. `service_role` só em código de servidor; o T2 confere com uma busca no código cliente antes de integrar.
3. **Testes negativos válidos:** cada teste da §7.4 precisa falhar quando a política correspondente é removida. Essa verificação de mutação é feita pelo T2 ou pelo T3.
4. **Nunca simular:** nenhuma consulta, resultado ou evidência de exemplo em oferta real. Dados de teste usam `is_test` e ficam identificados (§6.3).
5. **Linguagem proibida (§6.6):** um teste automatizado varre os textos da interface, dos e-mails e dos guias atrás dos termos proibidos sem a qualificação exigida.
6. **Separação da Motors (§4.5):** nada de banco, projeto, credencial, conta de provedor ou dado da Motors. Código portado é reescrito para multiempresa e revisado.
7. **Decisões pendentes (§13):** a estrutura pode ser construída; o comportamento definitivo, não. Padrões provisórios ficam marcados no código e na configuração.
8. **Produção, push e deploy:** só com aprovação H explícita, por ação.
9. **Dados:** nenhum dado real de cliente em seed, fixture ou teste.
10. **Entrega de subagente:** resumo, arquivos e diff, testes executados com saída, limitações e riscos. O T2 inspeciona o diff e roda os testes antes de integrar.
11. **Definição de pronto (§16):** inclui revisão por um segundo agente; nos módulos críticos, T3, e em documental e piloto, também AG.
12. **Ambientes (ADR-0001 §3):** testes de banco e reset só no projeto `ralmlmuewullugeqtgoz`, que serve a `dev` e homologação e só guarda dados de teste; nunca em produção. Produção não recebe variáveis do Supabase até o Inc. 6. Até lá, todo deploy da Vercel fica atrás da autenticação da Vercel.

---

# 4. MAPA DE REAPROVEITAMENTO

Padrões de projetos internos a portar. Portar significa reescrever no produto novo, para o modelo multiempresa, nunca importar nem compartilhar. As referências detalhadas (arquivos e linhas) ficam em `notas-privadas/`, fora do repositório público.

| Padrão | Destino | Nível do porte |
|---|---|---|
| Registro de consulta só de inclusão; trava de chaves de dado pessoal no banco; nova consulta como linha nova | I3.3 (`vehicle_checks`) | T2 |
| CHECKs de completude por estado; RLS com GRANT por coluna | I2.3, I4.1 | T2 |
| Transição decidida em função pura, espelhada no banco | I2.2, I2.6 | T2 |
| Histórico antes e depois por campo; eventos só de inclusão | I0.6 (`field_history`), I2.3 | T2 |
| Campos de declaração do vendedor (laudo, leilão, sinistro, itens de estado) como **declaração do fornecedor** | I2.8 | T1 |
| Turnstile e rate limit em formulários públicos e rotas sensíveis | I1.6 | T1, revisão T2 |
| Conferência de CNPJ com finalidade LGPD declarada | I1.5, só com contrato próprio de provedor | T2 |
| Jobs de CI e execução real das migrações | I0.8, I0.5 | T2 |
| Conteúdo de guias (laudo cautelar, leilão, sinistro, documentos) | pós-piloto | T1 |
| Versão por agregado; pedido de adesão com status | I2.2, I1.3 | T2 |

**Não portar:** modelo de uma só empresa, leitura pública do catálogo, integrações e contas de outros negócios, modos de simulação de provedor em fluxo real, cliente de WhatsApp não oficial (depende de D6).

---

# 5. PRÉ-REQUISITOS

| ID | Item | Nível | Status |
|---|---|---|---|
| P1 | Git, `.gitignore`, commit inicial, remoto `origin` | T2 | concluída em 22/10 |
| P2-P5 | Validar o gateway FreeLLMAPI e os perfis dos subagentes | H + T2 + T3 | pausadas; não bloqueiam os incrementos |
| P6 | Definir o que pode ir para cada provedor de modelo (segredos e dados pessoais nunca) | H + T2 | pendente; registrar em `CLAUDE.md` |

Enquanto P2-P5 estiverem pausadas, os subagentes herdam o modelo padrão da instalação. Isso custa mais, mas não rebaixa a qualidade silenciosamente.

---

# 6. INCREMENTOS DECOMPOSTOS

Caminhos fixados pelo ADR-0001 §2.8. Nas tabelas, "`app/`" quer dizer `src/app/` e "`supabase/tests/`" quer dizer `supabase/tests/database/`:
- `src/app/` para rotas, agrupadas por área;
- `src/modules/<módulo>/` para o domínio (§15), com `rules/`, `schemas/`, `server/`, `queries/` e `ui/`;
- `supabase/migrations/` e `supabase/tests/database/` para o banco; `tests/integration/` para integração;
- `tests/e2e/` para testes ponta a ponta;
- `docs/adr/` para decisões técnicas.

Paralelismo: no máximo dois subagentes simultâneos, cada um com fronteira de arquivos própria.

## Inc. 0: Fundação

**Aceite (§12):** app sobe localmente e em homologação (preview protegido); CI verde; migrações em banco limpo.  
**Depende de:** P1. **Decisões:** D1 final de 27/10 (Supabase Cloud e Vercel, ADR-0001 §3).  
**Externo (H):** projetos no Supabase Cloud, credenciais de `dev`, branch de produção da Vercel e push.

| ID | Subtarefa → entrega | Nível | Arquivos permitidos | Aceite e verificação |
|---|---|---|---|---|
| I0.1 | Levantar ferramentas instaladas (Node, gerenciador de pacotes, Supabase CLI, Docker, `psql`) → relatório com versões | T2 (o T0 não tem Bash; tarefa pequena) | nenhum | **concluída em 26/10**: resultado no ADR-0001 §1.1 |
| I0.2 | Decidir estrutura física, gerenciador de pacotes, lint e formatação, testes unitários, testes de banco que **executem** migrações e e2e → ADR-0001 | T2 | `docs/adr/0001-fundacao.md`, este plano | **concluída em 26/10**: `docs/adr/0001-fundacao.md`; caminhos deste plano atualizados |
| I0.3 | Criar no Supabase Cloud os projetos `repasse-dev` e `repasse-homolog`, em `sa-east-1`, de preferência numa organização própria do repasse, depois de confirmar plano e custo | H | — | **concluída (27/10):** um único projeto, `ralmlmuewullugeqtgoz`, no plano gratuito, em `sa-east-1`, para `dev` e homologação. O primeiro projeto, criado em `us-east-1`, foi substituído |
| I0.4 | Scaffold Next.js, TypeScript 6.0 estrito, ESLint 9, Prettier, Tailwind 4, Vitest, `.gitattributes`, `.nvmrc`, estrutura de pastas do ADR-0001 §2.6 e teste de linguagem proibida (gate 5) | T1 | tudo exceto `supabase/` e `docs/` | **concluída em 26/10**: integrada na `main` (`b09297d`); aceite reproduzido pelo T2 a partir de `npm ci` limpo |
| I0.5 | `npx supabase init`; reset reproduzível do `dev` sem Docker local; runner pgTAP; harness de integração que falha (não pula) sem banco; trava por `pg_advisory_lock` | T2 (banco compartilhado `dev`) | `supabase/**`, `scripts/**`, `tests/integration/**` | **concluída em 27/10**: reset com trava de destino, runner pgTAP e integração comprovados no projeto de desenvolvimento, inclusive as provas de falha, e no CI (job `banco` verde) |
| I0.6 | Migração base: `audit_logs`, `field_history`, `restricted_access_logs`, `platform_settings`, função genérica que barra UPDATE e DELETE em tabela só de inclusão | T2 | `supabase/migrations/**`, `supabase/tests/**` | **concluída em 27/10**: migração `20261027224325_base_auditoria`; 29 testes pgTAP (estrutura, RLS, só inclusão, sem acesso de `anon` e `authenticated`); verificação de mutação nos dois sentidos |
| I0.7 | `.env.example` e `docs/ambiente.md`, separando público de somente servidor | T2 | `.env.example`, `docs/ambiente.md` | **concluída em 27/10**: cinco variáveis (duas públicas, uma secreta de servidor, duas de ferramenta local); produção sem variáveis até o Inc. 6 |
| I0.8 | CI no GitHub Actions com lint, typecheck, unitários, linguagem proibida, Supabase efêmero (`supabase start` no runner), testes de banco e de integração, e build | T2 | `.github/workflows/**` | **concluída em 27/10**: `qualidade`, `build` e `banco` (Supabase efêmero, reset, pgTAP, integração) verdes no GitHub (execução 40596166065) |
| I0.9 | Projeto `repasse` na Vercel ligado ao `ideal-garbanzo`, Node 24, autenticação da Vercel em todos os deploys; push da `main`; deploy de preview; troca da branch de produção para `producao` no painel (H) | T2 + H | — | **concluída em 27/10**, exceto as variáveis do Supabase, que entram depois da I0.3. Projeto `ideal-garbanzo`; push na `main` gera preview (`target: null`); `producao` é a branch de produção; região `gru1`; proteção `all`. Seis endereços testados sem login: todos 302 para o login da Vercel |
| I0.10 | README de instalação local | T1 | `README.md` | **concluída em 27/10**: escrito pelo `builder` (`175ac60`); T2 seguiu o README num clone limpo (`npm ci`, `.env.local`, lint, typecheck, test, format, build e `npm run dev` com a página respondendo 200) |
| I0.11 | Credenciais do `repasse-dev` em `.env.local` (fora do Git) e teste de conexão pelo pooler | H | — | **concluída em 27/10**: conexão pelo pooler com TLS verificado pela CA do Supabase; consulta de leitura ok (Postgres 17.11, `public` vazio, `pgtap` e `pg_cron` disponíveis). Projeto recriado em `sa-east-1` (`ralmlmuewullugeqtgoz`) e conexão refeita com sucesso |
| I0.12 | ~~Capacidade da VPS~~ | — | — | **cancelada em 27/10**: o repasse não usa mais a VPS |
| I0.13 | ~~Roteiro do Easypanel~~ | — | — | **cancelada em 27/10**: roteiro escrito em 26/10, nunca commitado e removido quando a D1 final trocou o Easypanel por Supabase Cloud e Vercel |

**Paralelismo:** a I0.7 e a I0.9 podem começar já. A I0.5 e a I0.6 dependem da I0.3 e da I0.11.  
**Gate:** aceite observado; CI verde; prova de que o teste de banco executa migração; nenhum deploy público.

## Inc. 1: Identidade, empresas e adesão

**Aceite:** testes negativos 1, 2 (parte de empresa), 4, 5 e 13 da §7.4.  
**Seções:** §3, §5.1, §6.1, §7.  
**Decisões:** C5 (documentos para aprovação): construir o registro da conferência sem lista fixa.

| ID | Subtarefa → entrega | Nível | Arquivos permitidos | Aceite e verificação |
|---|---|---|---|---|
| I1.1 | Extrair §3.3, §5.1, §6.1 e os testes 1, 2, 4, 5 e 13 → tabela de decisão e casos de teste em texto | T0 | nenhum | **concluída em 28/10**: 64 regras, casos de teste dos cinco testes e 35 ambiguidades; integrada ao anexo A do ADR-0002 |
| I1.2 | Funções auxiliares de autorização; revalidação de usuário suspenso no banco; adesão aprovada cria empresa e vínculo de forma atômica → ADR-0002 | T2 | `docs/adr/0002-identidade.md` | **entregue em 28/10**: o ADR responde às 35 ambiguidades (§7); aceite na I1.7; Q1 e Q2 respondidas em 28/10 (convite da empresa basta; operador prepara a revisão) |
| I1.3 | Migrações de `organizations`, `profiles`, `organization_members`, `platform_staff`, `membership_applications`, `membership_application_reviews`, `membership_evidence_files`; funções auxiliares no schema `private`; RLS; sincronização segura de e-mail; bloqueio de autopromoção; adesão atômica por gatilho; bucket privado de evidência; chaves estrangeiras de ator nas tabelas da I0.6; reset limpando o `private` e esvaziando os buckets (ADR-0002 §2.14) | T2 | `supabase/migrations/**`, `supabase/tests/**`, `scripts/**`, `config/banco-dev.json` | reset limpo; RLS ativa em toda tabela exposta. **Entregue em 28/10:** 3 migrações, reset com `private` e bucket, `100-identidade-estrutura` (34 testes), contraste de 47 casos; revisão na I1.7 |
| I1.4 | Testes de banco e de integração a partir da I1.1 (anexo A do ADR-0002) | T1 | `supabase/tests/database/1*.test.sql` a partir de `110-` (o runner não lê subpastas; o `100-` é da I1.3), `tests/integration/**`, testes de `src/modules/{auth,organizations,membership}/**` | testes passam; T2 afrouxa cada regra e confirma a falha do negativo, com o contraste passando (ADR-0002 §3). **Entregue em 28/10:** pgTAP 110 a 190 (380 asserções) e 3 arquivos de integração; no dev, 449 asserções e 47 testes de integração passando; 110 de 113 mutações detectadas, as 3 restantes registradas no anexo A; revisão na I1.7 |
| I1.5 | Operações de servidor: enviar e revisar adesão (com registro da conferência de CNPJ e evidência), suspender e reativar, gerenciar membros; auditoria | T2 | `src/modules/{auth,organizations,membership,audit}/**`; na entrega, também `src/lib/{operacao,supabase}/**` e `tests/integration/operacoes/**` | payload manipulado não concede papel (teste 4); suspenso é barrado na operação seguinte (teste 5). **Entregue em 28/10:** operações dos quatro módulos, 24 casos de integração com o servidor recusando antes de escrever, mutação da camada de servidor; revisão na I1.7 |
| I1.6 | Telas: pedido de adesão (com Turnstile e rate limit portados), login, recuperação, painel de adesões, empresa e membros | T1 | rotas de autenticação, adesão e admin em `app/`, componentes, `src/lib/` do porte | estados do §9; nenhuma autorização só na interface. **Entregue em 28/10:** telas do Inc. 1, checagem de acesso em cada página, limite de tentativas no banco (decisão de 28/10), 6 E2E passando (teste 1 com mutação); revisão na I1.7 |
| I1.7 | Revisão independente do diff, das políticas e do ADR-0002 | T3 | leitura | achado crítico bloqueia o gate. **Entregue em 28/10:** relatório externo e complemento T3 (`reasoning-review`), sem achado crítico nem alto. O ADR-0002 foi aceito, com as ressalvas R1 a R7 na §8 |
| I1.8 | Correções das ressalvas R1 a R5 da I1.7: página com botão em `/auth/confirmar` e convite ligado a perfil existente (R1); parâmetro repetido no link (R2); reconvite em duas escritas (R3); claims nos blocos pgTAP e checagem no CI (R4); lista permitida em `manutencao()` (R5) | T2 | `src/app/auth/**`, `src/app/_apoio/confirmacao.ts`, `src/modules/organizations/server/membros.ts`, `supabase/migrations/**`, `supabase/tests/**` | fora do gate do Inc. 1; R2 primeiro; tudo antes de usuários reais (Inc. 6), com teste negativo e mutação para cada correção. **R1 a R5 e R8 entregues em 28/10.** A R8 foi aberta na reavaliação do convite, confirmada no `dev` e corrigida pela opção 1 da pessoa responsável: senha só depois da confirmação |

**Paralelismo:** I1.4 roda enquanto o T2 executa a I1.5. A I1.6 começa com os contratos da I1.5 integrados.  
**Gate:** testes 1, 2 (empresa), 4, 5 e 13 com verificação de mutação; T3 sem crítico aberto.

## Inc. 2: Oferta

**Aceite:** publicação com pendência e com aviso; testes 2 (ofertas e documentos), 6, 11 e 12 (preço).  
**Seções:** §5.2, §5.3 (`supplier_declarations`), §6.2, §6.7, §6.9, §6.10.  
**Decisões:** D10 (revisão antes de publicar) vira configuração com valor provisório; D5 deixa documentos ocultos ao comprador por padrão.

| ID | Subtarefa → entrega | Nível | Arquivos permitidos | Aceite e verificação |
|---|---|---|---|---|
| I2.1 | Extrair transições da §6.2, requisitos de publicação, campos materiais da §6.7 e regras de validade; inventariar o código a portar (seção 4) | T0 | nenhum | tabela de transições com autor permitido. **Entregue em 28/10:** anexo A do ADR-0003 (rascunho), com 17 transições, 15 proibidas, requisitos de publicação, campos materiais, casos dos testes 2, 6, 11 e 12 e 32 ambiguidades (B1 a B32); inventário do porte em `notas-privadas/` |
| I2.2 | Máquina de estados com `under_review` condicionado a D10; estrutura do snapshot e algoritmo do hash; gatilhos de histórico; expiração no banco ou no servidor; buckets → ADR-0003 | T2 | `docs/adr/0003-oferta.md` | transições, versionamento e expiração definidos. **Entregue em 29/10:** ADR-0003 proposto, com estados, transições (T01 a T19), requisitos, edição por estado, snapshot e hash (JSON canônico e SHA-256 no banco), histórico, expiração pelo `pg_cron` com predicado de oferta aberta, suspensão, buckets e respostas a B1 a B32. As perguntas Q1 a Q5 (valor provisório da D10, papéis na empresa, staff, identidade do veículo, validade) foram respondidas pela pessoa responsável em 29/10, todas pela sugestão. O ADR corrige o caminho dos testes da I2.7 para `supabase/tests/database/3*` |
| I2.3 | Migrações de `vehicles`, `offers`, `offer_versions`, `offer_media`, `offer_documents`, `supplier_declarations`; transições e CHECKs no banco; RLS; só inclusão onde a §5 exige | T2 | `supabase/migrations/**`, `supabase/tests/**` | transição inválida recusada pelo banco; publicar sem declaração em todas as categorias falha. **Entregue em 29/10:** migrações `20261029120000_ofertas` (tabelas, transições, CHECKs por estado, RLS, snapshot e hash, histórico, auditoria, RPCs e configuração) e `20261029120100_expiracao_das_ofertas` (`pg_cron`); pgTAP 300 a 330 (227 asserções); 29 mutações em `supabase/tests/mutacoes/inc-2.md` (R6). Os objetos do Storage ficam para a I2.4 |
| I2.4 | Storage privado das ofertas, URLs temporárias, registro em `restricted_access_logs`, seguindo a convenção de bucket e reset do ADR-0002 §2.14 | T2 | `supabase/migrations/**`, `src/modules/offers/storage/**` | arquivo privado não é obtido só pelo caminho (teste 6). **Entregue em 29/10:** migração `20261029140000_storage_das_ofertas` (buckets `offer-photos` e `offer-documents`, políticas de envio e leitura, conferência do objeto nos gatilhos); `src/modules/offers/storage/` (envio de foto e documento, URL da foto pela sessão, URL do documento só pelo servidor, com registro em `restricted_access_logs`); pgTAP 340 (30) e integração do teste 6 (15); 15 mutações |
| I2.5 | Função de estado documental, parte das declarações (`not_checked`, `declared_unverified`, `with_findings`), base para a I3 | T2 | `supabase/migrations/**`, `src/modules/documental/**` | estados conforme as linhas da §6.4 que dependem só de declaração. **Entregue em 29/10:** migração `20261029160000_estado_documental` (estado e origem por categoria numa função só, usada pelo snapshot e pela RPC `estados_documentais`; precedência pronta para o Inc. 3); `src/modules/documental/` (rótulos, catálogo de ressalvas, resumo proporcional e operação); pgTAP 350 (22), integração (3) e unitários (9); 6 mutações |
| I2.6 | `createOffer`, `updateOffer`, `publishOffer`, `withdrawOffer`, `suspendOffer`, `confirmAvailability`, `declareCategory`, com versão nova em mudança material e auditoria | T2 | `src/modules/{offers,documental,audit}/**` | mudança de preço gera versão e histórico; suspensão exige motivo. **Entregue em 29/10:** tabela de transições e de edição no servidor (`src/modules/offers/rules/`), comparada com o banco em todos os pares de estado, atores e valores da D10; as operações da §8 e as seis novas da B32, mais a remoção e a ordem das fotos; integração (31), pgTAP 310 (+2) e 320 (+3) e unitários (30); 14 mutações. Corrigidos na migração da I2.3: a nova suspensão de oferta reativada e o veículo da publicada, que perdia dado obrigatório por chamada direta |
| I2.7 | Testes da máquina de estados, do versionamento e dos registros só de inclusão | T1 | testes de `src/modules/offers/**`, `supabase/tests/offers/**` | todas as transições válidas e ao menos uma inválida por estado; teste 11 para as tabelas deste incremento. **Entregue em 29/10** (builder em worktree, rodado e integrado pelo T2): tabela de decisão do ADR contra o servidor (22 testes, 1.536 combinações), pgTAP 360 (teste 11 sistemático, 99) e 370 (versionamento por coluna, 32); 11 mutações. O caminho dos testes de banco é `supabase/tests/database/3*` (ADR-0003 §3) |
| I2.8 | Telas do fornecedor: cadastro em etapas (veículo, fotos, condições, declarações por categoria, documentos), painel de ofertas, histórico, aviso documental | T1 | rotas do fornecedor em `app/`, componentes | fluxo completo pela interface; aviso visível ao publicar com pendência. **Entregue em 29/10** (builder em worktree; revisão TV; integrado pelo T2): rotas em `/empresa/[empresaId]/ofertas` (painel, nova, resumo e envio, cinco etapas, histórico), leituras pela sessão, ações sobre as operações da I2.6 e `declararCategorias` (uma versão por gravação); e2e com 4 testes, inclusive o fluxo completo com o aviso documental; 6 achados importantes do TV corrigidos |
| I2.9 | Telas administrativas: ofertas, suspensão, revisão (se D10) | T1 | rotas administrativas em `app/` | suspensão pede motivo. **Entregue em 29/10** (builder em worktree; revisão TV; integrado pelo T2): `/admin/ofertas` com a fila de revisão e o detalhe com leitura completa; publicar, devolver com motivo, suspender com categoria e motivo, reativar (só administrador), retirar com motivo, reservar e liberar, cada ação só quando a tabela de transições permite; conflito de interesse (B25) só com aviso; e2e com 10 testes, inclusive a suspensão sem motivo recusada; 3 achados importantes do TV corrigidos |
| I2.10 | Revisão independente | T3 | leitura | sem crítico aberto |

**Paralelismo:** I2.7 ∥ I2.8 depois da I2.3 e da I2.6. A I2.9 vem depois da I2.8.  
**Gate:** aceite demonstrado; testes 2 (ofertas e documentos), 6, 11 e 12 (preço) com verificação de mutação; T3 limpo.

## Inc. 3: Domínio documental

**Aceite:** estados conforme a §6.4; testes 7 e 10.  
**Seções:** §5.3, §6.3-§6.6, §6.11.  
**Decisões:** D9 adota o padrão provisório da §6.11 (impedimento ativo não publica); C7 mantém o registro manual.

| ID | Subtarefa → entrega | Nível | Arquivos permitidos | Aceite e verificação |
|---|---|---|---|---|
| I3.1 | Tabela de decisão com todas as combinações (declaração × resultado da consulta × revisão aberta), precedência, mapeamento das cinco origens, lista de termos proibidos e chaves de dado pessoal | T0 | nenhum | cada linha cita a §6.4, §6.5 ou §6.6 |
| I3.2 | Derivação completa dos estados, detecção de divergência, níveis de origem, isolamento de `is_test`, trava de dado pessoal, impedimento de transferência → ADR-0004 | T2 | `docs/adr/0004-documental.md` | cobre todas as linhas da I3.1 |
| I3.3 | Migrações de `vehicle_checks`, `documental_reviews`, `transfer_impediments`; trava de dado pessoal portada; CHECK de `is_test`; função de estado completa; `known_limitations` obrigatório | T2 | `supabase/migrations/**`, `supabase/tests/**` | consulta de teste não se liga a oferta real (teste 7); `no_findings_in_sources` exige consulta (teste 10) |
| I3.4 | Testes de todas as linhas da tabela de decisão e dos testes 7, 10 e 11 | T1 | testes de `src/modules/documental/**`, `supabase/tests/documental/**` | cobertura total da tabela; T2 faz verificação de mutação |
| I3.5 | `recordCheck` com upload de evidência, `openDocumentalReview` e `closeDocumentalReview`, registro de impedimento; mudança de estado documental gera versão | T2 | `src/modules/{documental,offers,audit}/**` | alteração posterior preserva o histórico e cria versão |
| I3.6 | Telas: registro de consulta (operador e fornecedor), revisão documental, ficha do fornecedor com estados e origem por informação, aviso de impedimento separado | T1 | rotas do fornecedor e admin em `app/`, componentes do estado documental | origens nunca fundidas num rótulo; teste de linguagem proibida passa |
| I3.7 | Revisão independente obrigatória | T3 | leitura | sem crítico aberto |
| I3.8 | Revisão externa: consulta pendente, apontamento, divergência, alteração posterior, falso estado de verificação, rastreabilidade | AG | leitura do diff e de um ambiente de homologação com dados de teste | relatório sem crítico aberto |

**Paralelismo:** I3.4 ∥ I3.6 depois da I3.3 e da I3.5.  
**Gate:** estados conforme a §6.4 em todas as linhas; testes 7 e 10 com verificação de mutação; T3 e AG sem crítico aberto.

## Inc. 4: Catálogo privado

**Aceite:** critérios 4, 6, 7 e 10 da §10.  
**Seções:** §6.4 (exibição), §6.6, §7.2, §7.3, §9.  
**Decisões:** D5 deixa as evidências ocultas; C6 deixa os filtros genéricos.

| ID | Subtarefa → entrega | Nível | Arquivos permitidos | Aceite e verificação |
|---|---|---|---|---|
| I4.1 | `listOffers` e `getOfferDetails`: só para comprador aprovado; sem placa, RENAVAM, chassi nem documento; resumo documental proporcional; `is_test` fora para comprador real; fotos por URL temporária | T2 | consultas de `src/modules/offers/**`, `src/modules/documental/**` | T2 confere a resposta de rede, não só a tela |
| I4.2 | Catálogo: busca, filtros (preço, marca, modelo, ano, quilometragem, localização, estado documental), ordenação, paginação; ficha com ressalvas e origem | T1 | rotas do comprador em `app/`, componentes | consome só a I4.1; estados do §9 |
| I4.3 | E2E: comprador aprovado vê; não aprovado não vê, nem por URL direta (teste 1); oferta pendente nunca aparece como verificada | T1 | `tests/e2e/catalogo/**` | passam localmente e em homologação |
| I4.4 | Revisão de exposição de dados | T3 | leitura | sem crítico aberto |
| I4.5 | Screenshots do catálogo e da ficha em mobile e desktop | TV | leitura | estados do §9 visíveis |

**Paralelismo:** I4.2 ∥ I4.3 depois da I4.1.  
**Gate:** critérios 4, 6, 7 e 10; T3 limpo.

## Inc. 5: Ciência, interesse e negociação

**Aceite:** critérios 8 e 9 da §10; testes 2 (negociações), 3, 8 e 9.  
**Seções:** §5.4, §6.7, §6.8, §6.13.  
**Decisões:** D5 deixa o texto da ciência provisório e marcado. O provedor de e-mail transacional é dependência externa (H).

| ID | Subtarefa → entrega | Nível | Arquivos permitidos | Aceite e verificação |
|---|---|---|---|---|
| I5.1 | Extrair §5.4, §6.7, §6.8, §6.13 e os testes 3, 8 e 9 → tabelas e casos | T0 | nenhum | ambiguidades listadas |
| I5.2 | Fluxo da ciência com conferência de hash; estados da negociação; eventos; outbox; como o envio de e-mail consome a outbox sem depender do n8n → ADR-0005 | T2 | `docs/adr/0005-ciencia-e-negociacao.md` | regra de `agreed` com ciência vigente definida |
| I5.3 | Migrações de `buyer_acknowledgments`, `interests`, `negotiations`, `negotiation_events`, `notification_outbox`; RLS por comprador e fornecedor | T2 | `supabase/migrations/**`, `supabase/tests/**` | reset limpo |
| I5.4 | `acknowledgeOffer`, `registerInterest`, `addNegotiationEvent`, `changeNegotiationStatus` | T2 | `src/modules/{acknowledgments,negotiations,audit}/**` | hash diferente recusado (teste 8); `agreed` com ciência desatualizada recusado (teste 9) |
| I5.5 | Testes de isolamento entre compradores (teste 3), ciência desatualizada após versão nova e eventos só de inclusão | T1 | testes de `src/modules/{acknowledgments,negotiations}/**`, `supabase/tests/negotiations/**` | T2 faz verificação de mutação |
| I5.6 | Telas: ciência, interesse, negociações do comprador e do fornecedor, mensagens, renovação de ciência | T1 | rotas do comprador e do fornecedor em `app/` | estados do §9; ciência desatualizada visível |
| I5.7 | Templates de e-mail e envio pela outbox; nenhuma credencial no repositório; nenhum dado restrito na mensagem | T1 | `src/modules/notifications/**` | falha de envio não altera estado; teste de linguagem proibida cobre os templates |
| I5.8 | Revisão independente | T3 | leitura | sem crítico aberto |

**Paralelismo:** I5.5 ∥ I5.6 depois da I5.4; I5.7 depois da I5.5.  
**Gate:** critérios 8 e 9; testes 2 (negociações), 3, 8 e 9; T3 limpo.

## Inc. 6: Piloto

**Aceite:** os 13 critérios da §10, com evidência.  
**Seções:** §7, §10, §11, §15, §16.  
**Decisões que bloqueiam o piloto:** D5, D8, D9, D10.

| ID | Subtarefa → entrega | Nível | Arquivos permitidos | Aceite e verificação |
|---|---|---|---|---|
| I6.1 | Decisões D5 (textos jurídicos), D8 (participantes), D9 e D10; criação do projeto `repasse-prod` no Supabase Cloud e da branch `producao`; proteção da produção conforme o piloto; caixa de e-mail própria do repasse no SMTP do Auth, encerrando a exceção à §4.5 aberta em 28/10 (ADR-0002 §2.8); widget Turnstile numa conta do Cloudflare própria do repasse e captcha ligado no Auth do `repasse-prod` (ADR-0002 §2.16) | H | — | decisões registradas em `current-task.md`; variáveis de produção separadas das de `dev` e `homolog`; SMTP de produção sem caixa de outro negócio e senha da caixa provisória trocada; captcha ligado no Auth de produção, com widget sem `localhost` |
| I6.2 | Aplicar os textos aprovados e os valores de D9 e D10 na configuração | T2 | configuração, textos, `docs/**` | nenhum texto provisório restante |
| I6.3 | E2E do fluxo vertical da §2.2 com dados de teste identificados | T1 | `tests/e2e/**` | T2 roda em homologação e anexa a saída |
| I6.4 | Observabilidade (§15), roteiro de incidente; backups gerenciados do Supabase, decisão sobre PITR e cópia dos arquivos do Storage; teste de restauração | T2 + H | configuração, `scripts/**`, `docs/operacao/**` | restauração comprovada; H executa a parte de produção |
| I6.5 | Revisão de segurança completa: §7.1 e os 13 testes da §7.4 | T3 | leitura | sem crítico aberto |
| I6.6 | Revisão externa do fluxo completo | AG | leitura e homologação | sem crítico aberto |
| I6.7 | Conferir os 13 critérios da §10 contra as evidências → relatório de lacunas | T0 | nenhum | cada critério com evidência ou "pendente" |
| I6.8 | Piloto com oferta real ou de teste identificada; linha de base das métricas da §11; go/no-go | H + T2 | — | decisão registrada |
| I6.9 | Revisão da infraestrutura: avisos de segurança do Supabase, configuração do Auth, variáveis por ambiente na Vercel, proteção dos deploys, separação dos projetos de outros negócios; ressalva R7 da I1.7 (Redirect URLs sem curinga em produção, proteção de forks da Vercel, limites por IP com proxy) | T3 (+ H para conferir no painel) | leitura da configuração | sem crítico aberto; riscos do ADR-0001 §5.1 com mitigação comprovada |

**Gate:** T2 declara prontidão técnica com evidências; H aprova o piloto.

## Depois do piloto, conforme evidência

| Bloco | Depende de | Observação |
|---|---|---|
| Desfecho e comissão (§5.5, §6.12) | C1-C4 | geração desativada em produção até as decisões; teste 12 (pagador e comissão) |
| WhatsApp | D6 | só em canal conforme à política do provedor |
| Integração automática de consulta | C7; contrato próprio; autorização do provedor pela Portaria 139/2025 | mesmo registro de `vehicle_checks`, com `method = integration` |
| Guias e checklists (§6.14) | — | conteúdo portado e adaptado; teste de linguagem proibida |
| Indicadores no painel (§11) | dados do piloto | — |
| Perfil de interesse com alerta (pedido de 29/10) | catálogo e filtros (Inc. 4, C6); outbox e e-mail (Inc. 5); WhatsApp, D6 | o comprador define o perfil (marca, modelo, ano, preço, quilometragem, região, estado documental) e é avisado quando uma oferta entra nele. A base já está na §6.13: e-mail de oferta nova a quem optou por receber (I5.7); o perfil refina esse aviso. Segue as regras do catálogo: só comprador aprovado, só oferta `published` ou `reserved` de empresa ativa, sem `is_test` para comprador real. A mensagem nunca leva placa, RENAVAM, chassi, documento nem dado pessoal (§6.13). Adesão e saída a qualquer momento pelo próprio comprador. Por WhatsApp, só depois da D6 e com modelo de mensagem aceito pelo provedor |
| Copiloto de decisões e busca (pedido de 29/10) | catálogo (Inc. 4); escopo a definir pela pessoa responsável | ajuda o comprador a achar e comparar opções dentro da plataforma. Trabalha só com o que o comprador já vê no catálogo e na ficha. Não avalia o veículo, não afirma procedência e não usa os termos da §6.6 (§1.4; a §2.3 deixa fora a IA avançada para avaliação veicular). Antes de começar: o que ele faz (busca em texto livre, comparação, resumo das ressalvas), se usa modelo de linguagem, qual provedor e quais dados saem da plataforma |

---

# 7. DECISÕES PENDENTES × SUBTAREFAS

| Decisão | Afeta | Pode avançar antes | Não pode antes |
|---|---|---|---|
| D5 (jurídico) | I2.3, I4.1, I5.2, I6.1 | documentos ocultos ao comprador; texto provisório marcado | piloto; abrir evidência ao comprador |
| D6 (WhatsApp) | pós-piloto | e-mail | qualquer envio por WhatsApp |
| D7 (projetos de tentativas anteriores) | nenhuma | — | usar esses projetos |
| D8 (participantes) | I6.8 | dados de teste identificados | piloto com dados reais |
| D9 (impedimento de transferência) | I3.2, I3.3, I6.2 | padrão provisório: impedimento ativo não publica | valor definitivo |
| D10 (revisão antes de publicar) | I2.2, I2.9, I6.2 | configuração com valor provisório | valor do piloto |
| C1-C4 (comissão) | pós-piloto | — | gerar comissão em produção |
| C5 (documentos para aprovação) | I1.5 | registro da conferência sem lista fixa | lista obrigatória |
| C6 (regiões e categorias) | I4.2 | filtros genéricos | restrição por região ou categoria |
| C7 (fornecedor de consulta) | pós-piloto | registro manual | integração automática |

---

# 8. PAPEL DE CADA NÍVEL NESTE PROJETO

| Nível | Faz | Nunca faz |
|---|---|---|
| T0 | extrai regras da v1.1 em tabelas de decisão; inventaria código a portar; rascunha testes; confere entregas contra critérios | escrever no repositório; decidir arquitetura; resolver ambiguidade; rodar comandos (não tem Bash) |
| T1 | telas; testes a partir de tabela aprovada; portes de baixo risco (Turnstile, componentes, CI sob revisão); templates; documentação | migrações, RLS, Storage, estado documental, ciência, comissão; push; deploy |
| T2 | ADRs; migrações; RLS; Storage; regras de estado; operações críticas; integração de worktrees; handoffs | declarar pronto sem evidência; aplicar comportamento de decisão pendente como definitivo; produção sem H |
| T3 | revisa diff e evidências; tenta quebrar os testes da §7.4 | editar; aprovar só pelo resumo |
| TV | confere estados obrigatórios e layout | atestar regra de negócio pela tela |
| AG | revisão externa de riscos, permissões, documentos e estados documentais | substituir o T3 nos módulos críticos |
| H | decisões, credenciais, projetos, deploy, produção, aceite | — |

---

# 9. REGISTRO, ESCALONAMENTO E HANDOFF

**Registro:** cada subtarefa concluída gera uma entrada em `docs/workflow/current-task.md` com:
- perfil e modelo usados;
- subagentes;
- fallback informado pelo gateway (nunca presumido);
- testes e resultados;
- critérios pendentes;
- motivo de escalonamento.

**Sinais de escalonamento deste projeto**, além dos do `model-orchestration.md`:
- teste negativo que passa com e sem a política correspondente;
- teste de banco pulado ou que só confere texto de SQL;
- T1 que tocou migração, RLS, Storage, estado documental ou ciência;
- qualquer necessidade aparente de `service_role` no navegador;
- resultado de consulta sem fonte, data ou limitações;
- rótulo de verificação sem a qualificação exigida;
- requisito que só se resolve inventando comportamento de decisão pendente;
- divergência entre a resposta de rede e a tela num fluxo de dado restrito.

**Handoff** (no máximo uma página, sem descartar alterações):

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
