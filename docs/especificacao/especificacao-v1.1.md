# ESPECIFICAÇÃO DO PRODUTO v1.1
## Plataforma privada de oportunidades de repasse de veículos

**Versão:** 1.1  
**Data:** 2026-10-26  
**Status:** rascunho para aprovação  
**Substitui:** `operacao-repasse-origem.md` (v1.0), mantida como histórico  
**Fontes:** briefing "Missão 001", diagnóstico `docs/diagnostico/2026-10-26-missao-001.md`, decisões D1 a D4 aprovadas em 26/10/2026  
**Stack (D2):** Next.js, TypeScript e Supabase. n8n e provedores de mensagem são apoio, nunca fonte da verdade.  
**Repositório e ambientes (D1, decisão final de 27/10/2026):** `85dyones/ideal-garbanzo`. Supabase Cloud em `sa-east-1`, com projetos separados para `dev`, `homolog` e `prod`. Aplicação na Vercel: a `main` gera deploys de homologação (preview), e a produção sai da branch `producao` no Inc. 6. Detalhes no ADR-0001 §3. Nada é compartilhado com a Motors.

**Revisões:** 26/10/2026, aprovação da v1.1; 26/10/2026, D1 revista (Easypanel no lugar de Supabase Cloud e Vercel); 27/10/2026, D1 final (Supabase Cloud e Vercel, sem Docker local), com ajuste nas seções 0, 4.2, 4.4, 4.5, 7.1 e 12.

---

# 0. MUDANÇAS EM RELAÇÃO À v1.0

| Tema | v1.0 | v1.1 | Motivo |
|---|---|---|---|
| Centro do produto | catálogo, acesso antecipado e monetização | transparência documental, ciência do comprador e negociação rastreável | briefing §1, §3-§5 |
| Acesso antecipado, planos pagos, assinaturas, integração de cobrança | no MVP | fora do MVP (seção 2.3) | briefing §6; brief da Torre de Controle |
| Domínio documental | só `documentation_status` | declarações, anexos, consultas, evidências, estados por categoria, origem da informação | briefing §4 |
| Ciência do comprador | inexistente | obrigatória, vinculada à versão da oferta | briefing §5 |
| Pendência documental | não tratada | obrigatória de preencher, nunca bloqueia a publicação | briefing §3 |
| Consultas | — | registro manual com evidência; integração só depois de escolher fornecedor | D4; diagnóstico §5 |
| Propostas | tabela própria com estados | eventos da negociação | menor modelo que cobre o fluxo |
| Favoritos | no MVP | fora do MVP | não constam no briefing |
| Papéis de plataforma | não modelados | tabela própria, não editável pelo usuário | lacuna L5 da v1.0 |
| Auditoria | Sprint 5 | desde o primeiro incremento | lacuna L3 da v1.0 |
| Roteiro | sete sprints | seis incrementos até o piloto (seção 12) | diagnóstico §10 |
| Notificações | e-mail e depois WhatsApp | e-mail no piloto; WhatsApp depende de D6 | briefing §6, item 12 |
| Infraestrutura | Supabase gerenciado e hospedagem não definida | Supabase Cloud (`sa-east-1`) e Vercel, um projeto do Supabase por ambiente; homologação em deploys de preview | D1 final da pessoa responsável (27/10) |

**Decisões posteriores à v1.1.** São da pessoa responsável e já estão no texto das seções indicadas.

| Data | Tema | Decisão | Seções |
|---|---|---|---|
| 30/10/2026 | Entrada das empresas | O cadastro público cria só empresa compradora. A fornecedora entra por convite do administrador da plataforma, que libera o pedido de adesão; a aprovação continua a mesma. A empresa que compra e fornece também depende de convite. | §1.3, §3.1, §5.1, §6.1, §9 |
| 31/10/2026 | Compradora que passa a fornecer | O aceite do convite por um administrador ativo da compradora basta, sem nova aprovação: a adesão como compradora já registrou a conferência de CNPJ. Se a C5 exigir documento próprio de fornecedora, a regra volta a ser decidida. | §6.1 |

---

# 1. VISÃO DO PRODUTO

## 1.1. Objetivo

Uma rede privada de oportunidades de veículos de repasse para compradores profissionais, com ofertas padronizadas, informações transparentes, histórico documental demonstrável e negociações rastreáveis.

O produto substitui a desorganização dos grupos de WhatsApp por um registro oficial da oferta. Ele permite identificar oportunidades, avaliar as informações disponíveis, registrar decisões e acompanhar cada negócio até o desfecho.

A fase atual valida o modelo com o menor software capaz de demonstrar o fluxo completo com dados reais.

## 1.2. Problemas que o produto ataca

1. Grupos de WhatsApp desorganizados e informações dispersas.
2. Ofertas e disponibilidades desatualizadas.
3. Falta de confiança entre fornecedores e compradores.
4. Documentação confusa, incompleta ou difícil de conferir.
5. Débitos, restrições, sinistros e passagens por leilão não declarados ou não identificados antes da negociação.

## 1.3. Modelo de operação

- Fornecedores convidados pela plataforma e aprovados publicam veículos com preço, características, condições e informações documentais.
- Compradores profissionais aprovados acessam as oportunidades.
- A plataforma é a fonte oficial das informações da oferta. WhatsApp e e-mail distribuem avisos e apoiam a conversa, mas não substituem o registro.
- O comprador registra interesse e ciência das ressalvas. A negociação fica vinculada a veículo, comprador e fornecedor.
- O desfecho é registrado para permitir atribuição e conciliação da comissão.
- A plataforma é intermediadora: não tem custódia do veículo e não recebe o valor da compra, que é pago diretamente entre comprador e fornecedor.
- A remuneração prevista é de R$ 1.000 por veículo negociado. É um valor de configuração, sujeito a contrato e validação comercial (seção 13).

## 1.4. Princípios

1. **Transparência sem bloqueio automático.** Pendência ou ausência de consulta nunca impede publicar. Torna a condição visível.
2. **Transparência não é certificação.** Consulta sem ocorrências não prova que o veículo está livre de problemas. O produto nunca afirma procedência.
3. **Nunca simular.** Nenhuma consulta, resultado ou evidência é inventado ou de exemplo em ofertas reais.
4. **Declarado não é verificado.** Toda informação exibida mostra sua origem (seção 6.5).
5. **Histórico preservado.** Alterações relevantes nunca apagam o estado anterior.
6. **Autorização no servidor e no banco.** A interface nunca é a única barreira.
7. **Dados de cada empresa isolados.** Fornecedor não vê dados restritos de outro fornecedor; comprador não vê negociação de outro comprador.
8. **Regras comerciais configuráveis.** Valores e prazos ficam em configuração, não espalhados no código.
9. **Integridade sem automação externa.** O fluxo principal funciona sem n8n nem provedor de mensagem.
10. **Critério de aceite verificável** em toda funcionalidade.

---

# 2. ESCOPO

## 2.1. MVP

Numeração do briefing §6 preservada.

1. Autenticação e aprovação de compradores e fornecedores.
2. Perfis, permissões e painel administrativo.
3. Cadastro padronizado de veículos.
4. Registro de informações e documentos disponíveis.
5. Status documental e histórico de consultas.
6. Registro de débitos, restrições, gravame, roubo/furto, sinistro e leilão, conforme as fontes disponíveis.
7. Avisos claros para pendências e apontamentos.
8. Catálogo privado e filtros de busca.
9. Gestão de preço, validade e disponibilidade.
10. Registro de interesse e negociação.
11. Comunicação vinculada às oportunidades.
12. Notificações por e-mail; WhatsApp conforme a decisão D6.
13. Registro de ciência das ressalvas pelo comprador.
14. Histórico de alterações.
15. Registro do desfecho comercial e das comissões.
16. Guias e checklists práticos para compradores e fornecedores.

## 2.2. Primeira entrega vertical (piloto)

Fornecedor cadastra veículo → informações e documentos são registrados → status documental é preenchido → consulta é registrada manualmente → resultados e ressalvas são apresentados → oferta é publicada com o status correto → comprador encontra o veículo → vê as informações relevantes → registra interesse e ciência das ressalvas → negociação fica rastreável.

Os itens 12 (WhatsApp), 15 (comissão) e 16 (guias) entram depois do piloto, conforme a seção 12.

## 2.3. Fora do escopo

Salvo decisão expressa baseada em evidência:

- aplicativos nativos;
- custódia ou processamento do pagamento do veículo;
- ERP ou gestão de estoque do lojista;
- IA avançada para avaliação veicular;
- scraping em escala;
- SMS;
- acesso antecipado, planos pagos e assinaturas;
- integração com provedor de cobrança;
- leilão ou lances em tempo real;
- financiamento ou crédito;
- certificação própria de procedência sem metodologia e evidência adequadas.

---

# 3. PERFIS E PERMISSÕES

## 3.1. Papéis de plataforma

Ficam em tabela própria (`platform_staff`), concedidos só por um administrador e nunca por alteração do próprio usuário.

- **Administrador:** gestão global; convida empresas fornecedoras; aprova e suspende empresas, usuários e ofertas; configura parâmetros; consulta auditoria; registra e revisa desfechos e comissões. Não apaga evidências nem histórico.
- **Operador:** operação diária; revisa ofertas; registra consultas e evidências; marca análise documental; acompanha negociações. Não altera configuração crítica nem comissões confirmadas.

## 3.2. Papéis na empresa

Cada empresa tem tipo fornecedor, comprador ou ambos. Cada membro é administrador da empresa ou membro.

- **Fornecedor:** cadastra veículos e ofertas da própria empresa; declara informações; anexa documentos; registra consultas que realizou; vê interesses e negociações das próprias ofertas.
- **Comprador:** vê o catálogo privado; registra ciência e interesse; negocia; vê apenas as negociações da própria empresa.
- **Administrador da empresa:** gerencia os membros da própria empresa.

## 3.3. Matriz

| Ação | Admin | Operador | Fornecedor | Comprador |
|---|---|---|---|---|
| Aprovar empresas e usuários | sim | não | não | não |
| Cadastrar e editar oferta | sim | sim | só as próprias | não |
| Publicar e retirar oferta | sim | sim | só as próprias | não |
| Suspender oferta por fraude ou risco grave | sim | sim, com registro | não | não |
| Registrar consulta e evidência | sim | sim | só nas próprias ofertas | não |
| Ver catálogo privado | sim | sim | sim, se também for comprador | sim, se aprovado |
| Ver documentos e evidências restritos | sim | sim | só das próprias ofertas | conforme a seção 7.3 |
| Registrar ciência e interesse | não | não | não | sim |
| Ver negociação | todas | todas | das próprias ofertas | da própria empresa |
| Registrar desfecho | sim | sim | das próprias ofertas | da própria empresa |
| Alterar comissão | sim | não | não | não |
| Consultar auditoria | sim | conforme autorização | não | não |

A matriz é regra de negócio. A autorização final é aplicada no servidor e nas políticas do banco.

---

# 4. ARQUITETURA

## 4.1. Aplicação

- Next.js com TypeScript, mobile-first, componentes reutilizáveis, validação de formulário, estados de carregamento, vazio, erro, sem permissão e registro inexistente em toda tela.
- Operações que alteram estado ou exigem regra de negócio rodam em código de servidor: publicar, retirar, suspender, registrar consulta, registrar ciência, registrar interesse, mudar status de negociação, registrar desfecho e comissão.
- Regras comerciais separadas dos componentes visuais.

## 4.2. Banco, autenticação e arquivos

- Supabase PostgreSQL com migrações versionadas, restrições de integridade e Row Level Security em toda tabela acessível ao cliente.
- Supabase Auth para autenticação.
- Supabase Storage **privado** para fotos, documentos e evidências. O catálogo é privado, então até as fotos usam URL temporária.
- Supabase Cloud em `sa-east-1` (ADR-0001 §3), um projeto por ambiente, com chaves próprias. Chave `service_role` só no servidor e nas variáveis protegidas da Vercel.
- Documentos sensíveis nunca recebem URL pública permanente.

## 4.3. Automações

- n8n, se usado, só envia notificações e executa rotinas. O evento é gravado no banco (outbox) antes de qualquer envio.
- Expiração de ofertas e tarefas de integridade rodam no banco ou no servidor, não no n8n.

## 4.4. Ambientes

Cada ambiente tem credenciais e banco próprios:
- **`dev`:** projeto `repasse-dev` no Supabase Cloud, com reset livre; aplicação na máquina local.
- **`homolog`:** projeto `repasse-homolog`; aplicação nos deploys de preview da Vercel, protegidos por autenticação; dados de teste identificados.
- **`prod`:** projeto `repasse-prod`; deploy de produção da Vercel a partir da branch `producao`, criados no Inc. 6.
- **CI:** Supabase efêmero no GitHub Actions.

Dado real de cliente não vai para teste sem justificativa, autorização e proteção.

## 4.5. Separação da Motors

O produto não usa banco, projeto, credenciais, contas de provedor nem dados da Motors ou de outros negócios. Padrões e trechos de código de projetos internos podem ser portados (diagnóstico §4), sempre reescritos para o modelo multiempresa e revisados.

A organização do Supabase e o time da Vercel podem ser da pessoa responsável, desde que os projetos e as variáveis sejam próprios do repasse. Recomenda-se uma organização própria do repasse no Supabase (ADR-0001 §3.1). Contas de provedor de outros negócios não são usadas.

---

# 5. MODELO DE DADOS

Modelo conceitual, base para as migrações. Toda tabela tem `id` UUID, `created_at` e `updated_at`, salvo indicação. As marcadas como **só inclusão** recebem apenas INSERT; correção é uma nova linha que substitui a anterior.

## 5.1. Identidade e empresas

**organizations**
- `name`, `legal_name`, `cnpj` (acesso restrito), `cnpj_root`
- `kind`: `supplier`, `buyer` ou `both`
- `status`: `pending`, `active`, `suspended` ou `closed`
- `contact_email`, `contact_phone`

**profiles**
- `id` vinculado ao usuário de autenticação
- `full_name`, `email` (sincronizado por procedimento seguro), `phone`
- `status`: `active` ou `suspended`

**organization_members**
- `organization_id`, `profile_id`
- `role`: `org_admin` ou `member`
- `status`
- único por (`organization_id`, `profile_id`)

**platform_staff**
- `profile_id`
- `role`: `admin` ou `operator`
- `status`, `granted_by`, `granted_at`
- escrita só por administrador

**membership_applications**
- dados da empresa enviados, `requested_kind`, `applicant_profile_id`
- `status`: `submitted`, `under_review`, `approved` ou `rejected`
- `reviewed_by`, `reviewed_at`, `decision_reason`
- `cnpj_checked_at`, `cnpj_check_source`, `cnpj_check_evidence_id`
- `requested_kind` `supplier` ou `both` só com convite de fornecedora válido (seção 6.1)

**Convite de fornecedora**
- e-mail convidado, quem convidou (administrador da plataforma), validade e situação
- o pedido de adesão que usou o convite

## 5.2. Veículo e oferta

**vehicles**
- `make`, `model`, `version`, `manufacture_year`, `model_year`, `mileage_km`
- `fuel_type`, `transmission`, `color`, `body_type`
- `plate`, `renavam`, `chassis`: acesso restrito; nunca no catálogo nem em notificação

**offers**
- `vehicle_id`, `supplier_organization_id`, `created_by`
- `status`: ver seção 6.2
- `asking_price`, `currency`, `commercial_conditions`, `location_city`, `location_state`
- `publication_authorized_by`, `publication_authorized_at`: declaração do fornecedor de que pode divulgar o veículo
- `published_at`, `valid_until`, `availability_confirmed_at`
- `current_version`
- `suspended_reason`, `suspended_by`, `suspended_at`
- `is_test`: oferta de teste, nunca exibida a comprador real

**offer_versions** (só inclusão)
- `offer_id`, `version_number` (único por oferta)
- `material_snapshot` (jsonb): campos materiais, estados documentais por categoria e ressalvas exibidas
- `snapshot_hash`, `created_by`, `change_summary`

Uma nova versão nasce sempre que muda um campo material. A lista de campos materiais fica em configuração (seção 5.6); o valor inicial está na seção 6.7.

**offer_media**
- `offer_id`, `storage_path` (bucket privado), `display_order`, `uploaded_by`

**offer_documents** (só inclusão)
- `offer_id`
- `kind`: `crlv`, `laudo_cautelar`, `certidao`, `relatorio_de_consulta`, `nota_fiscal` ou `outro`
- `storage_path` (bucket privado), `sha256`, `description`, `uploaded_by`
- `buyer_visibility`: `hidden` ou `approved_buyers`; padrão `hidden` até a decisão D5

## 5.3. Domínio documental

**Categorias documentais:**
- `debts_ipva`, `debts_licensing`, `debts_fines`
- `administrative_restrictions`, `judicial_restrictions`, `lien` (gravame)
- `theft_recovery` (roubo/furto e recuperação)
- `casualty` (sinistro e danos relevantes)
- `auction` (passagem por leilão)
- `transfer_conditions` (condições que afetam ou impedem a transferência)

A lista fica em configuração. Incluir categoria não exige mudar código.

**supplier_declarations** (só inclusão)
- `offer_id`, `category`
- `declared_value`: `no_known_occurrence`, `has_occurrence` ou `unknown`
- `detail`, `declared_by`, `declared_at`

A declaração mais recente de cada categoria é a vigente.

**vehicle_checks**: consultas, só inclusão
- `vehicle_id`, `offer_id`, `category`
- `source_name`; `source_type`: `official`, `commercial` ou `other`
- `method`: `manual` ou `integration`
- `performed_at`, `performed_by` (quem consultou), `recorded_by` (quem registrou)
- `result`: `awaiting_result`, `no_occurrence_in_source`, `has_occurrence` ou `inconclusive`
- `result_summary`
- `details` (jsonb): o banco recusa chaves de dado pessoal (padrão já testado em projeto interno)
- `evidence_document_id`, `protocol`
- `known_limitations`: obrigatório; o que a fonte não cobre
- `is_test`, `supersedes_check_id`

**documental_reviews** (só inclusão)
- `offer_id`, `category`
- `action`: `open_review` ou `close_review`
- `reason`: divergência entre declaração, documento e consulta, ou apontamento que exige avaliação
- `actor`

**transfer_impediments**
- `offer_id`, `basis`: ex.: média ou grande monta, Res. CONTRAN 810/2020, art. 14
- `source_check_id` ou `source_declaration_id`
- `status`: `identified` ou `resolved`
- `resolution_evidence_id`

O efeito sobre a publicação depende da decisão D9.

## 5.4. Ciência, interesse e negociação

**buyer_acknowledgments** (só inclusão)
- `offer_id`, `offer_version_id`, `buyer_organization_id`, `profile_id`
- `presented_snapshot_hash`: igual ao `snapshot_hash` da versão exibida
- `acknowledged_at`, `request_id`

**interests**
- `offer_id`, `buyer_organization_id`, `profile_id`, `acknowledgment_id`
- `origin`: `catalog`, `notification`, `commercial_contact`, `referral` ou `external`
- `created_at`

**negotiations**
- `offer_id`, `buyer_organization_id`, `supplier_organization_id`, `interest_id`
- `status`: `open`, `negotiating`, `agreed`, `closed_won`, `closed_lost` ou `canceled`
- `loss_reason`
- única negociação aberta por (`offer_id`, `buyer_organization_id`)

**negotiation_events** (só inclusão)
- `negotiation_id`
- `type`: `message`, `contact_logged`, `price_proposal`, `counter_proposal`, `status_change` ou `acknowledgment_renewed`
- `amount`, `body`, `actor_profile_id`, `actor_organization_id`

## 5.5. Desfecho e comissão

**deal_outcomes**
- `negotiation_id`, `reported_by`
- `outcome`: `sold` ou `not_sold`
- `agreed_vehicle_price`, `sale_date`, `evidence_document_id`
- `status`: `reported`, `confirmed` ou `disputed`
- `confirmed_by_buyer_at`, `confirmed_by_supplier_at`

**commissions**
- `deal_outcome_id`, `payer_organization_id`, `amount`, `currency`
- `status`: `pending_confirmation`, `due`, `paid`, `disputed`, `waived` ou `canceled`
- `due_at`, `paid_at`, `payment_evidence_id`, `dispute_reason`

## 5.6. Registro, auditoria e configuração

- **audit_logs** (só inclusão): ator, empresa, ação, entidade, `metadata`, `request_id`, `occurred_at`. Sem senha, token ou dado pessoal desnecessário.
- **field_history** (só inclusão): entidade, campo, valor anterior, valor novo, autor, data. Cobre preço, disponibilidade, validade, status da oferta e dados do veículo.
- **restricted_access_logs** (só inclusão): quem abriu documento ou evidência restrita, e quando.
- **notification_outbox**: evento, destinatário, canal, status, tentativas, `idempotency_key` única.
- **platform_settings**: valor da comissão; campos materiais; categorias documentais; validade padrão da oferta; exigência de revisão antes da publicação (D10).

---

# 6. REGRAS DE NEGÓCIO

## 6.1. Adesão e aprovação

- Empresa e usuário só acessam o produto depois de aprovados por um administrador.
- A aprovação registra quem aprovou, quando, com qual conferência de CNPJ e qual evidência.
- O cadastro público cria só empresa compradora (decisão da pessoa responsável em 30/10/2026):
  - a empresa fornecedora entra por convite de um administrador da plataforma;
  - o convite vai para um e-mail e libera, a quem confirmar esse e-mail, o pedido de adesão como fornecedora ou como fornecedora e compradora;
  - a aprovação segue a regra acima;
  - a empresa compradora ativa passa a fornecer também só por convite: o aceite de um administrador ativo dela basta, porque a aprovação da adesão como compradora já registrou a conferência de CNPJ (decisão da pessoa responsável em 31/10/2026).
- Os documentos exigidos para aprovação dependem de decisão (seção 13). Até lá, o registro guarda o que foi conferido, sem lista fixa no código.
- Empresa suspensa perde o acesso na operação seguinte. A revalidação acontece no servidor e nas políticas do banco, não só no vencimento do token.

## 6.2. Ciclo da oferta

| Estado | Significado | Quem leva a ele |
|---|---|---|
| `draft` | em preenchimento | fornecedor |
| `under_review` | aguardando revisão da plataforma; só existe se D10 exigir revisão | fornecedor ao enviar |
| `published` | visível a compradores aprovados | fornecedor, ou operador se D10 exigir revisão |
| `reserved` | negociação em fase de acordo | fornecedor ou operador |
| `sold` | desfecho de venda registrado | fornecedor ou operador |
| `withdrawn` | retirada pelo fornecedor ou pela plataforma | fornecedor, operador |
| `expired` | passou de `valid_until` sem renovação | sistema |
| `suspended` | suspensão administrativa por indício de fraude, falsificação, informação deliberadamente enganosa ou risco grave | admin ou operador, com motivo |

As transições são validadas no banco, não só na interface. Oferta retirada, expirada ou suspensa não recebe interesse novo.

**Requisitos para publicar:** fornecedor ativo; dados do veículo e localização preenchidos; preço válido; condições comerciais registradas; autorização de divulgação declarada; **status documental preenchido em todas as categorias** (seção 6.4).

**O que nunca impede publicar:** consulta pendente, consulta não realizada, apontamento ou divergência. Essas condições geram avisos, não bloqueios. A exceção em discussão é o impedimento de transferência (D9).

## 6.3. Consultas e evidências

- Para a primeira entrega, toda consulta é registrada manualmente: fonte, data e hora, categoria, resultado, resumo, evidência anexada quando existir, responsável, limitações conhecidas.
- Integração automática só entra depois da escolha do fornecedor e com o mesmo registro.
- Nenhuma consulta é simulada. Registro marcado `is_test` só pode estar ligado a oferta `is_test`; o banco impede a mistura.
- Consulta nova não apaga a anterior; ela a substitui e o histórico fica visível.
- `known_limitations` é obrigatório. Exemplos: "fonte não cobre leilões fora do DETRAN"; "certidão válida só para a UF consultada".
- Dados pessoais do proprietário não são gravados em `details`, e o banco recusa as chaves conhecidas.

## 6.4. Estados documentais

Cada categoria de cada oferta tem um estado, calculado a partir dos registros. Ninguém o digita diretamente.

| Estado (código) | Rótulo exibido | Regra |
|---|---|---|
| `not_checked` | Não consultado | nenhuma consulta registrada e declaração do fornecedor "desconhece" |
| `declared_unverified` | Informação declarada, sem comprovação | há declaração do fornecedor, sem consulta nem documento que a confirme |
| `pending` | Pendente ou incompleto | existe consulta com `awaiting_result` ou `inconclusive` |
| `under_review` | Em análise | há revisão aberta em `documental_reviews`, ou divergência entre declaração e consulta |
| `with_findings` | Com apontamentos | a consulta vigente tem `has_occurrence`, ou o fornecedor declarou ocorrência |
| `no_findings_in_sources` | Sem apontamentos nas fontes consultadas | a consulta vigente tem `no_occurrence_in_source`, sem revisão aberta |

**Precedência quando mais de uma regra vale:** `under_review` > `with_findings` > `pending` > `no_findings_in_sources` > `declared_unverified` > `not_checked`.

**Preenchimento obrigatório:** para publicar, cada categoria precisa de declaração do fornecedor, inclusive "desconhece". `not_checked` é um estado preenchido válido.

**Exibição:**
- Na ficha da oferta, todos os estados por categoria, com fonte, data e limitações.
- No catálogo e nas notificações, um resumo proporcional (ex.: "2 com apontamentos, 3 pendentes"), nunca um selo único de "verificado".
- `no_findings_in_sources` sempre lista as fontes e a data da consulta.

A tabela de estados e a precedência são a regra proposta desta versão. O piloto deve validar se ela representa bem a avaliação do comprador.

## 6.5. Origem da informação

Toda informação documental exibida mostra uma destas origens:

1. **Declarada pelo fornecedor:** vem de `supplier_declarations`.
2. **Documento anexado:** vem de `offer_documents`.
3. **Resultado de consulta:** vem de `vehicle_checks`.
4. **Confirmada por evidência independente:** consulta de fonte oficial com evidência anexada, ou documento oficial conferido pela plataforma.
5. **Não confirmada:** nenhuma das anteriores.

A interface nunca funde origens diferentes num mesmo rótulo.

## 6.6. Linguagem proibida

A interface, as notificações e os guias não usam, para o veículo ou a oferta, termos como "verificado", "aprovado", "certificado", "garantido", "procedência garantida", "livre de problemas" ou "nada consta" sem a qualificação "nas fontes consultadas, em [data]".

## 6.7. Ciência do comprador e versões

- Antes de registrar interesse, o comprador vê as informações e ressalvas da versão vigente e registra ciência dessa versão.
- A ciência grava a versão e o `snapshot_hash` exibido. O servidor recusa a ciência se o hash não for o da versão vigente.
- Mudança em campo material cria versão nova. A ciência anterior continua registrada, mas aparece como desatualizada.
- A negociação só avança de `negotiating` para `agreed` com ciência vigente. A renovação vira evento da negociação.
- **Campos materiais iniciais (configuráveis):** preço, quilometragem, estado documental de qualquer categoria, apontamentos, impedimentos de transferência, declarações do fornecedor e condições comerciais.
- A ciência não autoriza ocultar informação nem exonera responsabilidade. O texto da ciência depende da decisão D5.

## 6.8. Interesse e negociação

- O interesse exige comprador aprovado, oferta publicada ou reservada e ciência vigente.
- A origem do interesse é registrada no primeiro contato rastreável (seção 5.4).
- Um interesse abre uma negociação. Mensagens, contatos registrados, propostas de valor e mudanças de status são eventos que só recebem inclusão.
- Fornecedor e comprador veem só as negociações em que participam. Operador e admin veem todas.

## 6.9. Preço, validade e disponibilidade

- Toda oferta tem `valid_until`. Ao vencer sem renovação, vai para `expired`.
- O fornecedor confirma a disponibilidade periodicamente, e a data aparece na ficha.
- Mudança de preço, validade e disponibilidade gera histórico e, se o campo for material, versão nova.

## 6.10. Suspensão administrativa

- Admin e operador podem suspender uma oferta diante de indício de fraude, falsificação, informação deliberadamente enganosa ou risco grave.
- A suspensão exige motivo, fica auditada e avisa o fornecedor e os compradores com negociação aberta.
- Pendência documental, sozinha, não é motivo de suspensão.

## 6.11. Impedimento de transferência

- Quando uma consulta ou declaração indica condição que impede a transferência ao comprador profissional, o sistema registra o impedimento. Exemplo: dano de média ou grande monta não regularizado, Res. CONTRAN 810/2020, art. 14.
- O impedimento aparece como aviso próprio, separado das pendências documentais.
- Publicar ou recusar a oferta nessa condição depende da decisão D9. Até lá, a oferta com impedimento ativo não sai de `draft` para `published`, e o fornecedor vê o motivo.

## 6.12. Desfecho e comissão

- O desfecho é informado por fornecedor, comprador ou operador e confirmado pelas partes ou pela plataforma, com evidência.
- A comissão nasce de um desfecho `sold` confirmado, com o valor de `platform_settings` no momento do nascimento.
- Comissão só fica `paid` com comprovante ou reconciliação autorizada.
- Quem paga, prazos, cancelamentos, contestação e negócios fora da plataforma dependem da seção 13. Até lá, a geração da comissão fica desativada em produção.

## 6.13. Notificações

- E-mail no piloto: aprovação da empresa; nova oferta publicada, para compradores aprovados que optaram por receber; novo interesse; mudança de status da negociação; suspensão de oferta; versão nova de oferta com ciência desatualizada.
- WhatsApp depende de D6, e o canal precisa respeitar a política do provedor.
- Notificação nunca leva placa, RENAVAM, chassi, documento nem dado pessoal. Mostra o resumo documental proporcional e o link para a ficha.

## 6.14. Guias e checklists

Material para compradores (como ler os estados documentais, limites das consultas, conferências antes de fechar) e para fornecedores (como declarar, que evidência anexar). Conteúdo interno já produzido sobre laudo cautelar, leilão, sinistro e chassi remarcado serve de fonte, adaptado ao comprador profissional e sem linguagem de garantia.

---

# 7. SEGURANÇA, PRIVACIDADE E LGPD

## 7.1. Princípios obrigatórios

- RLS em toda tabela acessível ao cliente, com políticas baseadas em vínculo e papel verificados.
- Autorização no servidor em toda operação que altera estado.
- Privilégio mínimo. `service_role` só em código de servidor.
- Segredos só em variáveis protegidas. Credenciais de terceiros (gov.br, DETRAN) nunca são pedidas nem guardadas.
- Storage privado e URL temporária para fotos, documentos e evidências.
- Rate limiting e proteção contra robô nas rotas sensíveis e nos formulários públicos.
- Auditoria das ações administrativas e dos acessos a documento restrito.
- Backup e procedimento de restauração testado antes do piloto. Usar os backups gerenciados do Supabase, decidir sobre PITR em produção e incluir os arquivos do Storage.

## 7.2. Dados pessoais

- Placa, RENAVAM e chassi ligados a proprietário pessoa física são tratados como dado pessoal: acesso restrito, fora do catálogo e das notificações.
- Dados do proprietário retornados por uma fonte não são gravados.
- Retenção e base legal de cada dado são definidas com o jurídico antes do piloto.

## 7.3. Exibição de resultados e evidências ao comprador

A Portaria SENATRAN 139/2025 restringe ceder acesso a dados a terceiros, e cada fonte comercial tem seus termos. Até a decisão D5:

- o comprador vê o estado de cada categoria, a fonte, a data, as limitações e o resumo escrito por quem registrou;
- documentos e evidências ficam com `buyer_visibility = hidden`;
- abrir a visibilidade é decisão por tipo de documento, registrada em configuração.

## 7.4. Testes negativos obrigatórios

A aplicação precisa provar que:

1. Usuário de empresa não aprovada não vê o catálogo nem a ficha, nem por URL direta.
2. Fornecedor não lê oferta em rascunho, documento, evidência ou negociação de outro fornecedor.
3. Comprador não lê negociação, interesse ou ciência de outra empresa.
4. Usuário não ganha papel de plataforma alterando o payload.
5. Usuário suspenso não opera com sessão antiga.
6. Documento ou foto privada não é obtido só pelo caminho.
7. Consulta `is_test` não se liga a oferta real.
8. Ciência com hash diferente da versão vigente é recusada.
9. Negociação não chega a `agreed` com ciência desatualizada.
10. Estado `no_findings_in_sources` não existe sem consulta registrada.
11. Nenhum caminho apaga ou altera registro só de inclusão (declarações, consultas, versões, ciências, eventos, auditoria).
12. Usuário não altera preço, pagador ou comissão de desfecho sem permissão.
13. Operador não acessa configuração crítica.

Cada teste negativo precisa falhar quando a política correspondente é removida.

---

# 8. CONTRATOS DE OPERAÇÃO

Contratos funcionais, não assinaturas obrigatórias no código. Toda operação valida entrada, autenticação, autorização, estado atual e consistência transacional, e responde com erro previsível sem expor detalhes internos.

- `submitMembershipApplication(payload)`, `reviewMembershipApplication(id, decision, evidence)`
- `createOffer(payload)`, `updateOffer(offerId, payload)`, `publishOffer(offerId)`, `withdrawOffer(offerId)`, `suspendOffer(offerId, reason)`, `confirmAvailability(offerId)`
- `declareCategory(offerId, category, value, detail)`
- `recordCheck(offerId, payload, evidenceFile)`, `openDocumentalReview(offerId, category, reason)`, `closeDocumentalReview(...)`
- `listOffers(filters, cursor)`, `getOfferDetails(offerId)`: só para comprador aprovado; sem campos restritos
- `acknowledgeOffer(offerId, versionId, snapshotHash)`
- `registerInterest(offerId, acknowledgmentId, origin)`
- `addNegotiationEvent(negotiationId, event)`, `changeNegotiationStatus(negotiationId, status)`
- `reportOutcome(negotiationId, payload, evidence)`, `confirmOutcome(outcomeId)`, `recordCommissionPayment(commissionId, evidence)`

---

# 9. TELAS

**Pública:** apresentação, pedido de adesão (de compradora; de fornecedora, só com convite), login, recuperação de acesso, termos e privacidade.

**Fornecedor:**
- painel de ofertas;
- cadastro em etapas: veículo, fotos, condições, declarações por categoria, documentos, consultas;
- ficha com estados documentais;
- interesses e negociações;
- histórico.

**Comprador:**
- catálogo com filtros (preço, marca, modelo, ano, quilometragem, localização, estado documental);
- ficha da oferta com ressalvas e origem de cada informação;
- tela de ciência;
- interesses e negociações.

**Administrativa:**
- adesões;
- convites de fornecedoras;
- empresas e usuários;
- ofertas (revisão, suspensão);
- registro de consultas e revisões documentais;
- negociações;
- desfechos e comissões;
- configuração;
- auditoria;
- indicadores (seção 11).

Toda tela trata carregamento, vazio, erro, sem permissão e registro inexistente. Não há brief visual; a fidelidade visual fica fora dos critérios até existir um.

---

# 10. CRITÉRIOS DE ACEITE DO PILOTO

Do briefing §11. O piloto é válido quando:

1. Um fornecedor autorizado cadastra um veículo.
2. Os campos e identificadores necessários são validados.
3. O status documental é obrigatório.
4. A publicação acontece com consulta pendente ou apontamentos, com os avisos adequados.
5. O sistema registra fonte, data, resultado e evidências disponíveis.
6. O sistema distingue declarações, anexos e resultados de consulta.
7. O comprador autorizado vê as ressalvas relevantes.
8. A ciência do comprador fica vinculada à versão das informações apresentadas.
9. Alterações posteriores preservam o histórico.
10. Dados e documentos restritos não ficam acessíveis a usuários não autorizados.
11. Não há consulta simulada nem estado de verificação sem evidência.
12. Os testes demonstram os comportamentos esperados e suas limitações.
13. O fluxo é demonstrado com uma oferta real ou com dados de teste claramente identificados.

Valem também os testes negativos da seção 7.4 e a definição de pronto da seção 16.

---

# 11. MÉTRICAS

**Principal:** negócios concluídos, comissões efetivamente recebidas e rastreabilidade da origem das oportunidades.

**Auxiliares:**
- percentual de ofertas com status documental preenchido;
- percentual de ofertas com consultas e evidências registradas;
- apontamentos identificados antes da negociação;
- percentual de ofertas desatualizadas;
- tempo entre cadastro e publicação;
- tempo para atualizar ou retirar uma oferta;
- interesses e negociações por veículo;
- negócios concluídos e comissões conciliadas;
- divergências entre declarações, documentos e consultas.

Quantidade de código, telas ou funcionalidades não é resultado.

---

# 12. ROTEIRO

Cada incremento termina com teste e evidência observada. O detalhamento por subtarefa e nível de execução fica no plano orquestrado.

| Inc. | Entrega | Aceite |
|---|---|---|
| 0 | Fundação: scaffold, CI, projetos `repasse-dev` e `repasse-homolog` no Supabase Cloud (criados pela pessoa responsável), projeto na Vercel, migração inicial, auditoria | app sobe localmente e em homologação (preview protegido); CI verde; migrações em banco limpo |
| 1 | Adesão, empresas, usuários, papéis de plataforma e de empresa, aprovação manual; RLS | testes negativos 1, 2 (parte de empresa), 4, 5 e 13 |
| 2 | Oferta: veículo, fotos, condições, declarações por categoria, documentos privados, versões, histórico, ciclo de estados | publica com pendência e mostra aviso; testes 2 (ofertas e documentos), 6, 11 e 12 (preço) |
| 3 | Consultas manuais, revisões documentais, estados calculados, origem da informação, impedimento de transferência | estados conforme a seção 6.4; testes 7 e 10 |
| 4 | Catálogo privado, filtros, ficha com ressalvas | critérios 4, 6, 7 e 10 da seção 10 |
| 5 | Ciência versionada, interesse, negociação com eventos, e-mail mínimo | critérios 8 e 9; testes 2 (negociações), 3, 8 e 9 |
| 6 | Piloto com oferta real ou de teste identificada; revisão independente | os 13 critérios da seção 10 |

**Depois do piloto, conforme evidência:** desfecho e comissão (seção 6.12), WhatsApp (D6), integração automática de consulta, guias e checklists, indicadores no painel.

---

# 13. DECISÕES PENDENTES

Estruturas técnicas podem ser construídas antes. O comportamento definitivo em produção, não.

| ID | Decisão | Bloqueia |
|---|---|---|
| D5 | Jurídico: modelo de intermediação, termos de uso, texto da ciência, política de privacidade, visibilidade de resultados e evidências ao comprador (Portaria 139/2025) | piloto; seção 7.3 |
| D6 | WhatsApp: API oficial ou outro provedor | notificações por WhatsApp |
| D7 | Destino de projetos de tentativas anteriores (banco e aplicação) | nada neste produto; é limpeza |
| D8 | Primeiros fornecedores e compradores reais | incremento 6 |
| D9 | Oferta com impedimento de transferência: publicar com aviso ou recusar | seção 6.11 |
| D10 | Revisão da plataforma antes de publicar: sim ou não no piloto | uso do estado `under_review` |
| C1 | Quem paga a comissão | geração de comissão |
| C2 | Evento que caracteriza a venda concluída | geração de comissão |
| C3 | Prazo de pagamento, cancelamento, contestação e estorno | comissão |
| C4 | Comprovação de venda fechada fora da plataforma e negócio entre partes que já se conheciam | comissão |
| C5 | Documentos exigidos para aprovar empresas | regra final da seção 6.1 |
| C6 | Regiões e categorias de veículo atendidas no início | filtros e operação |
| C7 | Fornecedor de consulta para integração automática | integração (D4: manual primeiro) |

---

# 14. AGENTES E REVISÃO

- **Claude Code:** auditoria e implementação, conforme o `model-orchestration.md` e o plano orquestrado. Implementa só depois de aprovado o plano de cada incremento.
- **Antigravity:** revisão independente de risco, segurança, permissões, exposição de documentos e comportamento dos estados documentais (pendente, apontamento, divergência, alteração posterior).
- **ChatGPT (Torre de Controle):** consolida decisões e pendências e protege o foco no fluxo principal.
- **Claude Desktop:** estratégia, jornadas e critérios de aceite.

Toda entrega informa: o que foi feito, arquivos alterados, migrações, testes executados com resultado, riscos, pendências, o que não foi feito e como validar manualmente. O agente não declara aprovado nenhum teste sem evidência, não simula consulta e não desabilita política de segurança para um teste passar.

---

# 15. OPERAÇÃO

- **Organização do código por domínio:** `auth`, `organizations`, `membership`, `vehicles`, `offers`, `documental`, `acknowledgments`, `negotiations`, `outcomes`, `commissions`, `notifications`, `audit`.
- **Migrações:** versionadas, funcionam em banco limpo; mudança destrutiva exige plano e aprovação; produção não é ambiente de experimento.
- **Variáveis de ambiente:** lista documentada em `.env.example`, sem valores reais. Separar o que é público do que é só do servidor.
- **Observabilidade:**
  - erros de aplicação, falhas de autorização relevantes, falhas de notificação e latência das operações principais;
  - acessos a documentos restritos;
  - procedimento de incidente documentado.

---

# 16. DEFINIÇÃO DE PRONTO

Uma funcionalidade está pronta quando:

- atende aos critérios de aceite;
- valida entrada;
- respeita autenticação e autorização;
- tem testes, incluindo os negativos aplicáveis;
- registra os eventos relevantes;
- trata erros de forma previsível;
- está documentada;
- não introduz regressão conhecida;
- foi revisada por um segundo agente ou responsável técnico (revisão independente nos módulos de identidade, documental, ciência e comissão).

**Princípio final:** primeiro uma operação comercial confiável e transparente; depois, automatizar e escalar o que comprovadamente funciona.
