# ESPECIFICAÇÃO TÉCNICA DO PRODUTO
## Plataforma B2B de Oportunidades e Repasse de Veículos

**Versão:** 1.0  
**Status:** Documento-base para implementação do MVP  
**Tipo:** Marketplace B2B de oportunidades automotivas  
**Arquitetura:** Monólito modular com serviços gerenciados  
**Stack de referência:** Next.js, TypeScript, Supabase e n8n

---

# 1. VISÃO DO PRODUTO

## 1.1. Objetivo

Construir uma plataforma digital que conecte fornecedores de veículos a lojistas compradores, permitindo publicar oportunidades comerciais, controlar acesso antecipado, registrar manifestações de interesse e acompanhar negociações até a conclusão.

A plataforma deverá gerar receita por meio de:

1. Comissão por venda concluída.
2. Assinaturas de lojistas.
3. Futuramente, acesso premium a lotes, pré-lançamentos e serviços adicionais.

A plataforma não comprará veículos para revenda, não manterá estoque próprio e não assumirá a propriedade dos veículos.

O fluxo financeiro do veículo será definido contratualmente entre as partes. A plataforma registrará as operações e as obrigações comerciais associadas, sem presumir que receberá o preço integral do veículo.

## 1.2. Problema a resolver

Os lojistas precisam descobrir boas oportunidades de compra, avaliar rapidamente as condições dos veículos e negociar com fornecedores confiáveis.

Os fornecedores precisam alcançar compradores qualificados, reduzir o tempo entre a disponibilização do veículo e a negociação e manter controle sobre as oportunidades publicadas.

A plataforma deverá reduzir a fricção entre esses dois lados, proporcionando informações organizadas, distribuição controlada de ofertas e rastreabilidade comercial.

## 1.3. Proposta de valor

**Para lojistas:**
- Acesso organizado a oportunidades de aquisição.
- Alertas por perfil de compra.
- Acesso antecipado conforme as condições do plano.
- Histórico de ofertas e propostas.
- Acompanhamento das negociações.

**Para fornecedores:**
- Distribuição de oportunidades a compradores qualificados.
- Registro de manifestações de interesse.
- Visibilidade sobre o andamento das negociações.
- Histórico de ofertas e resultados.

**Para o operador da plataforma:**
- Controle centralizado da operação.
- Rastreabilidade das oportunidades.
- Receita por comissão e assinatura.
- Indicadores para melhorar a liquidez do marketplace.

## 1.4. Princípios do produto

1. A confiabilidade das ofertas é mais importante do que a quantidade anunciada.
2. Nenhum acesso premium poderá ser concedido apenas por uma regra visual no frontend.
3. A origem das negociações deverá ser registrada.
4. Nenhuma comissão será marcada como recebida sem evidência operacional.
5. Os dados de cada empresa serão isolados.
6. As regras comerciais deverão ser configuráveis sem reescrever o sistema.
7. A operação básica não dependerá de automações externas para preservar a integridade dos dados.
8. Toda funcionalidade deverá ter critérios de aceite verificáveis.

---

# 2. ESCOPO DO MVP

## 2.1. Funcionalidades obrigatórias

### A. Autenticação e contas
- Cadastro e autenticação de usuários.
- Recuperação de acesso.
- Cadastro de empresas.
- Associação de usuários a empresas.
- Papéis e permissões.
- Suspensão e reativação de contas.

### B. Cadastro de veículos e ofertas
- Cadastro de veículos.
- Upload e organização de fotos.
- Registro do fornecedor.
- Preço anunciado e condições comerciais.
- Ano de fabricação e modelo.
- Quilometragem.
- Marca, modelo, versão e transmissão.
- Combustível e localização.
- Observações sobre estado e documentação.
- Datas de publicação e validade.
- Status operacional.
- Histórico de alterações relevantes.

### C. Catálogo
- Listagem de ofertas elegíveis.
- Pesquisa textual.
- Filtros por preço, marca, modelo, ano, quilometragem e localização.
- Ordenação.
- Paginação.
- Visualização detalhada.
- Favoritos.
- Identificação de ofertas indisponíveis.

### D. Acesso antecipado
- Cadastro de planos e benefícios.
- Definição de janela de acesso por oferta.
- Verificação de elegibilidade no servidor.
- Registro de acessos.
- Liberação automática conforme data e horário.
- Bloqueio de ofertas ainda não liberadas.
- Registro de tentativas de acesso não autorizado.

### E. Negociação
- Manifestação de interesse.
- Registro de proposta, quando habilitado.
- Histórico de alterações de proposta.
- Status da negociação.
- Registro de contato entre as partes.
- Identificação da empresa compradora.
- Confirmação operacional do resultado.

### F. Monetização
- Cadastro de planos.
- Associação entre empresa e assinatura.
- Registro de status da assinatura.
- Integração com provedor de cobrança.
- Registro da comissão associada à venda.
- Controle de comissões pendentes, devidas, pagas e contestadas.
- Histórico de eventos financeiros.

### G. Administração
- Gestão de usuários e empresas.
- Gestão de fornecedores.
- Aprovação e retirada de ofertas.
- Gestão de planos.
- Consulta a propostas e negociações.
- Gestão de comissões.
- Auditoria.
- Indicadores básicos da operação.

### H. Notificações
- Confirmação de cadastro.
- Notificação de nova oferta elegível.
- Alertas de favoritos e critérios de busca, se habilitados.
- Atualizações de propostas.
- Avisos sobre status de negociação.
- Notificações operacionais de assinatura.

As notificações poderão ser enviadas por e-mail inicialmente. WhatsApp será integrado depois de validado o fluxo principal.

## 2.2. Fora do MVP

Não desenvolver na primeira versão:

- Aplicativo nativo para iOS ou Android.
- Carteira digital própria.
- Custódia ou liquidação do valor integral do veículo.
- Financiamento.
- Emissão de crédito.
- Sistema de leilão com lances em tempo real.
- Avaliação automática de veículos por inteligência artificial.
- Integração com dezenas de fornecedores.
- Integrações automotivas não essenciais.
- CRM genérico completo.
- Gestão de estoque da loja compradora.
- Emissão fiscal complexa.
- Programa multinível de indicações.
- Exclusividade nacional.
- Precificação dinâmica sofisticada.

Novas funcionalidades só entrarão no escopo mediante decisão explícita e análise de impacto.

---

# 3. PERFIS E PERMISSÕES

## 3.1. Papéis

### Administrador da plataforma
Responsável pela gestão global.

Pode:
- Gerenciar empresas e usuários.
- Aprovar fornecedores.
- Criar, editar, publicar e retirar ofertas.
- Configurar planos e regras de acesso.
- Consultar propostas e negociações.
- Registrar e revisar comissões.
- Consultar logs de auditoria.

Não pode apagar silenciosamente evidências comerciais ou modificar o histórico sem deixar registro.

### Operador comercial
Responsável pela operação diária.

Pode:
- Cadastrar e revisar ofertas.
- Atualizar disponibilidade.
- Acompanhar manifestações de interesse.
- Atualizar estados operacionais conforme sua autorização.
- Registrar contatos e observações.

Não pode modificar configurações críticas de segurança ou alterar pagamentos confirmados sem processo autorizado.

### Fornecedor
Representa a empresa responsável pela disponibilização dos veículos.

Pode:
- Visualizar suas ofertas.
- Cadastrar ou enviar informações de veículos, caso essa função esteja habilitada.
- Atualizar dados permitidos.
- Acompanhar manifestações de interesse associadas às suas ofertas.
- Consultar o andamento das negociações de sua responsabilidade.

Não pode acessar ofertas privadas de outros fornecedores nem dados internos de outros compradores.

### Lojista administrador
Representa a empresa compradora.

Pode:
- Gerenciar membros de sua empresa.
- Consultar ofertas autorizadas.
- Salvar favoritos.
- Manifestar interesse.
- Registrar propostas.
- Consultar suas negociações.
- Gerenciar a assinatura da empresa conforme permissões.

### Lojista membro
Pode consultar ofertas autorizadas, salvar favoritos e operar negociações dentro das permissões concedidas pela empresa.

Não pode administrar usuários ou dados de cobrança da empresa, salvo autorização expressa.

## 3.2. Matriz resumida

| Ação | Admin | Operador | Fornecedor | Lojista admin | Lojista membro |
|---|---|---|---|---|---|
| Gerenciar empresas | Sim | Limitado | Não | Própria empresa | Não |
| Publicar ofertas | Sim | Sim | Conforme autorização | Não | Não |
| Consultar ofertas liberadas | Sim | Sim | Conforme escopo | Sim | Sim |
| Manifestar interesse | Conforme necessidade | Conforme necessidade | Não | Sim | Sim |
| Gerenciar assinatura | Sim | Consulta | Não | Própria empresa | Não |
| Consultar comissões globais | Sim | Conforme autorização | Não | Não | Não |
| Consultar própria negociação | Sim | Conforme autorização | Suas ofertas | Sua empresa | Sua empresa |

A autorização final deverá ser aplicada no servidor e no banco de dados. A matriz acima define a regra de negócio, não apenas o comportamento da interface.

---

# 4. ARQUITETURA DA APLICAÇÃO

## 4.1. Frontend

**Tecnologia:** Next.js com TypeScript.

Responsabilidades:
- Interface responsiva.
- Rotas públicas e autenticadas.
- Catálogo e filtros.
- Painel de administração.
- Painel do lojista.
- Visualização de ofertas.
- Formulários e acompanhamento de propostas.
- Experiência de cobrança e assinatura.

Diretrizes:
- Componentes reutilizáveis.
- Validação de formulários.
- Estados de carregamento, erro e vazio.
- Acessibilidade básica.
- Layout mobile-first.
- Separação entre componentes visuais e regras comerciais.

## 4.2. Camada de aplicação

A camada de aplicação deverá concentrar operações que exigem validação de regras de negócio, como:

- Publicar ou retirar ofertas.
- Verificar elegibilidade.
- Registrar propostas.
- Atualizar estados de negociação.
- Confirmar vendas.
- Registrar comissões.
- Processar notificações recebidas do provedor de cobrança.

Operações críticas deverão ser executadas em ambiente confiável, não em código acessível ao navegador.

## 4.3. Banco de dados

**Tecnologia:** Supabase PostgreSQL.

Responsabilidades:
- Persistência transacional.
- Relacionamentos.
- Restrições de integridade.
- Row Level Security.
- Histórico operacional.
- Consultas e relatórios básicos.

As alterações de esquema serão versionadas por migrações. Alterações manuais diretamente no ambiente de produção não serão o procedimento normal de desenvolvimento.

## 4.4. Autenticação e arquivos

Supabase Auth será responsável pela autenticação.

Supabase Storage poderá armazenar fotos e arquivos autorizados, utilizando políticas de acesso apropriadas.

Documentos sensíveis não deverão ser disponibilizados por URLs públicas permanentes. A aplicação deverá usar armazenamento privado e URLs temporárias quando necessário.

## 4.5. Automações

O n8n será utilizado para:
- Enviar notificações.
- Integrar canais de comunicação.
- Processar eventos assíncronos.
- Executar tarefas de rotina.
- Gerar alertas operacionais.

O n8n não será a fonte oficial de verdade para propostas, vendas ou comissões. O estado persistido no banco será a referência principal.

Eventos importantes deverão ser armazenados antes de disparar uma automação externa.

## 4.6. Ambientes

Manter ambientes separados:

- Desenvolvimento local.
- Homologação.
- Produção.

Cada ambiente deverá ter suas próprias credenciais, variáveis e recursos de banco.

Dados reais de clientes não deverão ser copiados para testes sem justificativa, autorização e medidas adequadas de proteção.

---

# 5. MODELO DE DADOS

A estrutura abaixo é conceitual e constitui a base para as migrações SQL.

## 5.1. organizations

Representa empresas cadastradas.

Campos:
- id: UUID, chave primária.
- name: nome empresarial ou comercial.
- legal_name: razão social, quando aplicável.
- document_number: identificador empresarial, com acesso restrito.
- organization_type: lojista, fornecedor ou ambos.
- status: pendente, ativa, suspensa ou encerrada.
- contact_email.
- contact_phone.
- created_at.
- updated_at.

O identificador empresarial deverá ser protegido e não exposto desnecessariamente no catálogo.

## 5.2. profiles

Representa os usuários.

Campos:
- id: UUID vinculado ao identificador de autenticação.
- full_name.
- email.
- phone.
- status.
- created_at.
- updated_at.

O e-mail autenticado deverá ser sincronizado por procedimento seguro. Não permitir que um usuário altere livremente sua identidade privilegiada.

## 5.3. organization_members

Relaciona usuários e empresas.

Campos:
- id.
- organization_id.
- profile_id.
- role.
- status.
- created_at.

Restrições:
- Impedir vínculos duplicados.
- Validar papéis permitidos.
- Impedir que um membro obtenha privilégios administrativos por alteração direta de dados.
- Preservar o histórico de associação quando necessário para auditoria.

## 5.4. vehicles

Representa o cadastro do veículo.

Campos:
- id.
- make.
- model.
- version.
- manufacture_year.
- model_year.
- mileage.
- fuel_type.
- transmission.
- color.
- plate, se necessária e com acesso restrito.
- description.
- created_at.
- updated_at.

Não armazenar informações pessoais do proprietário em campos públicos.

## 5.5. vehicle_media

Representa as mídias do veículo.

Campos:
- id.
- vehicle_id.
- storage_path.
- media_type.
- display_order.
- created_at.

As políticas de armazenamento deverão garantir que arquivos privados não se tornem públicos por configuração acidental.

## 5.6. offers

Representa uma oportunidade comercial.

Campos:
- id.
- vehicle_id.
- supplier_organization_id.
- created_by.
- title.
- asking_price.
- currency.
- location_city.
- location_state.
- condition_notes.
- documentation_status.
- status.
- published_at.
- expires_at.
- created_at.
- updated_at.

Status permitidos:
- draft.
- pending_review.
- scheduled.
- published.
- reserved.
- sold.
- withdrawn.
- expired.

A transição entre estados deverá ser validada. Por exemplo, uma oferta retirada não poderá receber novas propostas sem ser republicada conforme as regras operacionais.

## 5.7. offer_access_rules

Define as condições de acesso de uma oferta.

Campos:
- id.
- offer_id.
- plan_id, quando aplicável.
- audience_type.
- access_start_at.
- access_end_at, quando necessário.
- priority_level.
- created_at.
- updated_at.

A regra deve permitir configurar uma janela de antecipação sem duplicar o cadastro do veículo.

A implementação deverá resolver conflitos entre regras de forma determinística. Uma regra genérica não poderá ampliar silenciosamente o acesso de uma oferta restrita.

## 5.8. plans

Representa os planos comerciais.

Campos:
- id.
- name.
- monthly_price.
- billing_interval.
- status.
- features.
- created_at.
- updated_at.

Os benefícios relevantes para autorização não deverão depender apenas de texto livre em `features`. Regras críticas, como janela de acesso, deverão possuir representação estruturada e validação no servidor.

## 5.9. subscriptions

Representa a assinatura de uma empresa.

Campos:
- id.
- organization_id.
- plan_id.
- provider.
- provider_customer_id.
- provider_subscription_id.
- status.
- current_period_start.
- current_period_end.
- cancel_at_period_end.
- created_at.
- updated_at.

Estados previstos:
- pending.
- trialing, se houver teste gratuito.
- active.
- past_due.
- canceled.
- expired.

A elegibilidade de acesso deverá ser definida por política explícita, especialmente nos estados de inadimplência, cancelamento e período de carência.

## 5.10. favorites

Campos:
- id.
- organization_id.
- profile_id.
- offer_id.
- created_at.

Restrições:
- Impedir favoritos duplicados.
- Garantir que a empresa e o usuário possuam vínculo válido.
- Respeitar o isolamento entre organizações.

## 5.11. proposals

Representa uma proposta comercial.

Campos:
- id.
- offer_id.
- buyer_organization_id.
- created_by.
- amount.
- message.
- status.
- created_at.
- updated_at.

Estados:
- submitted.
- under_review.
- countered.
- accepted.
- rejected.
- withdrawn.
- expired.

Cada mudança relevante deverá gerar um registro histórico. Não sobrescrever silenciosamente uma proposta aceita por uma nova proposta.

## 5.12. transactions

Representa o acompanhamento da conclusão comercial.

Campos:
- id.
- offer_id.
- proposal_id, quando houver.
- buyer_organization_id.
- supplier_organization_id.
- source_type.
- source_reference.
- status.
- agreed_vehicle_price, quando confirmado.
- sale_confirmed_at.
- confirmation_evidence_reference.
- created_at.
- updated_at.

Estados:
- reported.
- pending_confirmation.
- confirmed.
- disputed.
- canceled.

A plataforma deverá permitir registrar a origem do negócio e os elementos necessários para verificar a obrigação de comissão.

## 5.13. commissions

Representa a remuneração da plataforma.

Campos:
- id.
- transaction_id.
- payer_organization_id.
- payee_organization_id, se aplicável.
- amount.
- currency.
- status.
- due_at.
- paid_at.
- dispute_reason.
- created_at.
- updated_at.

Estados:
- pending_confirmation.
- due.
- paid.
- disputed.
- waived.
- canceled.

O valor de R$ 1.000 será uma configuração comercial inicial, não um número espalhado pelo código. A regra contratual deverá determinar quem paga, quando nasce a obrigação e como são tratados cancelamentos e divergências.

## 5.14. audit_logs

Campos:
- id.
- actor_profile_id, quando disponível.
- actor_organization_id, quando aplicável.
- action.
- entity_type.
- entity_id.
- metadata.
- occurred_at.
- request_id.

Registrar pelo menos:
- Alterações de permissões.
- Publicação e retirada de ofertas.
- Alterações de preço.
- Mudanças em propostas.
- Confirmações e contestações de venda.
- Alterações de comissões.
- Eventos de assinatura.
- Ações administrativas críticas.

Não registrar senhas, tokens secretos ou dados pessoais desnecessários nos logs.

---

# 6. REGRAS DE NEGÓCIO

## 6.1. Publicação de ofertas

Uma oferta só poderá ser publicada se:

- O fornecedor estiver ativo.
- O veículo possuir os campos obrigatórios.
- O preço estiver válido.
- A localização estiver preenchida.
- As condições comerciais estiverem registradas.
- Houver autorização de divulgação.
- O responsável pela publicação possuir permissão.

A plataforma deverá exibir a data de atualização e informar quando uma oferta não estiver mais disponível.

## 6.2. Acesso antecipado

O acesso será determinado no servidor considerando:
- Autenticação.
- Empresa ativa.
- Vínculo do usuário com a empresa.
- Status da assinatura, quando exigida.
- Plano e benefícios aplicáveis.
- Horário atual.
- Status e validade da oferta.
- Regras específicas de elegibilidade.

O horário de referência será armazenado com fuso horário e avaliado de forma consistente no servidor.

O frontend poderá mostrar uma prévia autorizada, mas não deverá receber preço, dados privados ou imagens restritas antes da liberação.

## 6.3. Propostas

Toda proposta deverá estar vinculada a uma oferta válida e a uma empresa compradora autorizada.

A aplicação deverá:
- Validar valores e formatos.
- Registrar o autor e o momento.
- Preservar o histórico.
- Impedir duplicações acidentais.
- Notificar os participantes pertinentes.
- Permitir retirar propostas conforme o estado da negociação.

Uma proposta não equivale automaticamente a uma venda concluída.

## 6.4. Origem da negociação

A origem da oportunidade deverá ser registrada desde o primeiro contato rastreável.

Fontes possíveis:
- Oferta encontrada no catálogo.
- Alerta enviado pela plataforma.
- Contato comercial registrado.
- Indicação autorizada.
- Negociação externa associada a uma oferta.

O registro de origem não será, sozinho, prova definitiva de comissão devida. A obrigação dependerá dos critérios contratuais e das evidências previstas.

## 6.5. Comissão

A comissão inicial de referência será de R$ 1.000 por venda elegível.

Antes de entrar em produção, deverão ser aprovadas as seguintes regras:
- Quem é o pagador.
- Qual evento caracteriza a venda concluída.
- Prazo para pagamento.
- Evidências exigidas.
- Tratamento de cancelamentos.
- Prazo de contestação.
- Tratamento de negócios entre partes que já se conheciam.
- Regras para vendas realizadas fora da plataforma.
- Critérios para dispensar ou estornar uma comissão.

O sistema não poderá marcar uma comissão como paga sem confirmação do pagamento ou reconciliação autorizada.

## 6.6. Assinaturas

As assinaturas remuneram benefícios da plataforma, não a propriedade dos veículos nem a garantia de acesso a uma quantidade de ofertas inexistente.

O sistema deverá suportar:
- Ativação.
- Renovação.
- Falha de pagamento.
- Cancelamento.
- Expiração.
- Atualização de plano.
- Recebimento e validação de eventos do provedor.

Eventos de cobrança devem ser idempotentes: receber a mesma notificação mais de uma vez não pode duplicar cobrança, assinatura ou alteração comercial.

---

# 7. SEGURANÇA E ISOLAMENTO MULTIEMPRESA

## 7.1. Princípios obrigatórios

- Row Level Security nas tabelas expostas ao cliente.
- Políticas de acesso baseadas em vínculos e papéis verificados.
- Validação de autorização no servidor.
- Privilégio mínimo.
- Segredos apenas em variáveis protegidas do ambiente.
- Nunca expor a chave `service_role` ao navegador.
- Proteção contra alteração de papel por requisição manipulada.
- URLs temporárias para arquivos privados.
- Rate limiting em operações sensíveis.
- Logs de ações administrativas.
- Proteção contra repetição indevida de requisições.
- Backups e procedimento de recuperação.

## 7.2. Testes negativos obrigatórios

A aplicação deverá provar que:

1. Um lojista não acessa propostas de outra empresa.
2. Um lojista não consulta dados privados de fornecedores sem autorização.
3. Um usuário não se torna administrador alterando o payload de uma requisição.
4. Uma oferta antecipada não é acessível por URL direta antes da liberação.
5. Uma assinatura inativa não mantém benefícios pagos sem autorização explícita.
6. Um usuário suspenso não continua operando com uma sessão antiga sem revalidação adequada.
7. Um arquivo privado não pode ser obtido apenas conhecendo seu caminho.
8. Um evento duplicado de cobrança não altera indevidamente o estado da assinatura.
9. Um usuário não pode alterar preço, pagador ou comissão de uma transação sem permissão.
10. Um operador não pode consultar dados além do escopo de sua função.

---

# 8. CONTRATOS DE INTERFACE E API

As operações deverão possuir contratos claros, independentemente de serem implementadas por Server Actions, Route Handlers ou outro mecanismo compatível com a stack.

Operações conceituais mínimas:

- `listOffers(filters, cursor)`
- `getOfferDetails(offerId)`
- `createOffer(payload)`
- `updateOffer(offerId, payload)`
- `publishOffer(offerId)`
- `withdrawOffer(offerId)`
- `checkOfferEligibility(offerId, actor)`
- `createFavorite(offerId)`
- `removeFavorite(offerId)`
- `createProposal(offerId, payload)`
- `updateProposalStatus(proposalId, status)`
- `reportTransaction(payload)`
- `confirmTransaction(transactionId, evidence)`
- `recordCommissionPayment(commissionId, evidence)`
- `processBillingWebhook(payload, signature)`

Esses nomes representam o contrato funcional, não uma obrigação de usar exatamente essas assinaturas no código.

Toda operação deverá validar entrada, autenticação, autorização, estado atual e consistência transacional.

Respostas de erro deverão ser previsíveis, sem expor detalhes internos, credenciais ou informações de outros usuários.

---

# 9. EXPERIÊNCIA E TELAS DO MVP

## Área pública
- Página institucional.
- Apresentação do funcionamento.
- Cadastro de interesse.
- Login.
- Política de privacidade e termos.

## Área do lojista
- Dashboard.
- Catálogo.
- Busca e filtros.
- Detalhes da oferta.
- Favoritos.
- Propostas.
- Negociações.
- Assinatura e cobrança.
- Perfil da empresa e usuários.

## Área do fornecedor
- Dashboard de ofertas.
- Cadastro ou envio de informações, conforme permissão.
- Lista de ofertas publicadas.
- Manifestações de interesse.
- Negociações relacionadas.
- Histórico.

## Área administrativa
- Visão geral da operação.
- Empresas e usuários.
- Fornecedores.
- Veículos e ofertas.
- Propostas e negociações.
- Transações e comissões.
- Planos e assinaturas.
- Logs de auditoria.
- Relatórios básicos.

Toda tela deverá contemplar estados de carregamento, ausência de resultados, falha de comunicação, falta de permissão e registro inexistente.

---

# 10. TESTES E CRITÉRIOS DE ACEITE

## 10.1. Testes unitários
Cobrir:
- Cálculo de elegibilidade.
- Transições de estados.
- Regras de comissão.
- Validação de propostas.
- Tratamento de assinatura.
- Validação de entrada.

## 10.2. Testes de integração
Cobrir:
- Autenticação e banco.
- Políticas RLS.
- Armazenamento.
- Operações de publicação.
- Criação de propostas.
- Processamento de eventos de cobrança.
- Registro de auditoria.

## 10.3. Testes ponta a ponta
Executar os fluxos:
1. Cadastro e aprovação de empresa.
2. Cadastro de veículo e publicação de oferta.
3. Consulta de oferta por lojista autorizado.
4. Bloqueio de acesso antecipado.
5. Liberação no horário previsto.
6. Manifestação de interesse.
7. Registro de proposta.
8. Confirmação de uma transação.
9. Registro da comissão.
10. Atualização de assinatura após evento validado do provedor.

## 10.4. Critérios de aceite do MVP

O MVP só será considerado pronto para o piloto quando:

- O fluxo principal puder ser concluído sem edição manual do banco.
- Empresas e usuários estiverem isolados corretamente.
- O acesso antecipado passar nos testes positivos e negativos.
- Ofertas puderem ser publicadas e retiradas.
- Propostas tiverem histórico rastreável.
- A origem das negociações puder ser consultada.
- Comissões tiverem estados e evidências.
- A cobrança de assinaturas tiver tratamento de falhas e eventos duplicados.
- Backups estiverem configurados e um teste de restauração for realizado.
- Não existirem falhas críticas ou vulnerabilidades conhecidas sem mitigação.
- A documentação de instalação e deploy estiver atualizada.

---

# 11. DEPLOY E OPERAÇÃO

## 11.1. Repositório

Organizar o código em módulos de domínio, por exemplo:
- `auth`
- `organizations`
- `vehicles`
- `offers`
- `access-control`
- `proposals`
- `transactions`
- `commissions`
- `subscriptions`
- `notifications`
- `audit`

A organização física pode variar, mas as responsabilidades devem permanecer separadas.

## 11.2. Migrações

- Toda alteração de esquema deverá ser versionada.
- Migrações deverão funcionar em banco limpo.
- Mudanças destrutivas exigirão plano de migração.
- Produção não será usada como ambiente de experimentação.
- Dados de produção não deverão ser apagados em testes.

## 11.3. Variáveis de ambiente

Manter uma lista documentada de:
- URL do projeto Supabase.
- Chave pública apropriada.
- Segredos exclusivos do servidor.
- Credenciais do provedor de cobrança.
- Segredo de validação de webhooks.
- Credenciais de serviços de notificação.
- URL de cada ambiente.

Os valores reais deverão permanecer fora do repositório.

## 11.4. Observabilidade

Registrar:
- Erros de aplicação.
- Falhas de integração.
- Eventos críticos.
- Latência das operações principais.
- Falhas de notificação.
- Eventos de cobrança rejeitados.
- Falhas de autorização relevantes.

Definir procedimento para investigar, corrigir e registrar incidentes.

---

# 12. ROADMAP DE IMPLEMENTAÇÃO

## Sprint 0: Fundação
- Repositório.
- Estrutura de aplicação.
- Ambientes.
- Configuração de lint, formatação e testes.
- Migrações iniciais.
- Pipeline de deploy.

**Aceite:** aplicação executa localmente e é publicada em homologação.

## Sprint 1: Identidade e organizações
- Autenticação.
- Perfis.
- Empresas.
- Membros.
- Papéis.
- RLS.
- Testes de isolamento.

**Aceite:** um usuário não acessa dados privados de outra empresa.

## Sprint 2: Veículos e ofertas
- Cadastro de veículos.
- Upload de fotos.
- Cadastro de ofertas.
- Revisão e publicação.
- Catálogo e filtros.
- Retirada e expiração.

**Aceite:** operador consegue publicar e retirar uma oferta com histórico.

## Sprint 3: Planos e antecipação
- Estrutura de planos.
- Regras de acesso.
- Janela antecipada.
- Verificação no servidor.
- Testes de acesso direto.

**Aceite:** usuários elegíveis acessam a oferta; usuários não elegíveis não obtêm os dados restritos.

## Sprint 4: Negociação
- Favoritos.
- Manifestação de interesse.
- Propostas.
- Histórico.
- Status.
- Notificações básicas.

**Aceite:** uma oportunidade pode ser rastreada desde a visualização autorizada até a negociação.

## Sprint 5: Monetização
- Integração com cobrança.
- Assinaturas.
- Webhooks idempotentes.
- Transações.
- Comissões.
- Evidências.
- Auditoria.

**Aceite:** os estados financeiros refletem eventos confirmados e não podem ser alterados por usuários sem permissão.

## Sprint 6: Piloto
- Testes completos.
- Revisão de segurança.
- Backup e restauração.
- Documentação.
- Monitoramento.
- Treinamento operacional.
- Entrada gradual de lojistas.

**Aceite:** todos os critérios críticos de produção estão atendidos.

---

# 13. DIRETRIZES PARA AGENTES DE PROGRAMAÇÃO

Qualquer agente que implemente o projeto deverá seguir estas regras:

1. Ler este documento antes de alterar código.
2. Inspecionar o repositório antes de propor mudanças.
3. Apresentar um plano pequeno e verificável para cada sprint.
4. Não implementar funcionalidades fora do escopo sem aprovação.
5. Não inventar credenciais, integrações ou variáveis.
6. Não alterar contratos comerciais silenciosamente.
7. Não desabilitar políticas de segurança para fazer um teste passar.
8. Não usar dados falsos como evidência de venda real.
9. Não considerar uma tela visualmente pronta como prova de que a regra de negócio funciona.
10. Executar testes e apresentar os resultados observados.
11. Criar ou atualizar migrações e documentação junto com as mudanças.
12. Informar claramente o que foi implementado, o que não foi e o que ainda depende de configuração externa.

Para cada entrega, produzir:
- Resumo das alterações.
- Arquivos criados ou modificados.
- Migrações.
- Testes executados e resultados.
- Riscos identificados.
- Pendências.
- Instruções para validar manualmente.

O agente revisor deverá avaliar segurança, consistência dos dados, tratamento de erros, aderência ao escopo e possibilidade de regressão.

---

# 14. PENDÊNCIAS DE NEGÓCIO QUE BLOQUEIAM A PRODUÇÃO

As decisões abaixo precisam ser formalizadas antes de ativar os respectivos módulos:

1. Quem paga a comissão de R$ 1.000.
2. Qual evento caracteriza uma venda elegível.
3. Como comprovar vendas realizadas fora da plataforma.
4. Qual é a política de cancelamento e contestação.
5. Qual fornecedor de cobrança será utilizado.
6. Qual é a regra de acesso em caso de inadimplência.
7. Qual será a janela de antecipação de cada plano.
8. Se fornecedores terão acesso direto à plataforma no lançamento.
9. Quais documentos serão exigidos para aprovação de empresas.
10. Quais regiões e categorias de veículos serão atendidas inicialmente.
11. Quais dados serão públicos, privados ou restritos por plano.
12. Quais contratos, termos e políticas de privacidade serão aprovados juridicamente.

Enquanto essas decisões não estiverem definidas, desenvolver as estruturas técnicas é possível, mas não se deve inventar comportamento definitivo para produção.

---

# 15. DEFINIÇÃO DE PRONTO

Uma funcionalidade será considerada pronta quando:

- Atender aos critérios de aceite documentados.
- Possuir validação de entrada.
- Respeitar autenticação e autorização.
- Ter testes adequados.
- Registrar eventos relevantes.
- Tratar erros de forma previsível.
- Estar documentada.
- Não introduzir regressões conhecidas.
- Ter sido revisada por um segundo agente ou responsável técnico.

O MVP será considerado operacional quando o ciclo de oferta, acesso, interesse, negociação e registro da transação puder ser executado de ponta a ponta, com dados consistentes e sem depender de intervenção direta no banco.

**Princípio final:** construir primeiro uma operação comercial confiável; depois automatizar e escalar o que comprovadamente funciona.
