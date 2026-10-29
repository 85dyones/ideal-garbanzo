# ADR-0003: Oferta

**Status:** proposto em 29/10/2026. As decisões seguem as sugestões conservadoras da I2.1. A pessoa responsável respondeu às cinco perguntas da seção 6 em 29/10, todas pela sugestão; o que depende delas está marcado com o número da pergunta (Q1 a Q5). O aceite vem no gate do Inc. 2, depois da revisão independente (I2.10).  
**Data:** 2026-10-29  
**Subtarefa:** I2.1 (anexo A) e I2.2 (decisões) do plano orquestrado v2  
**Base:** especificação v1.1 (§1.4, §3.3, §4.1 a §4.3, §5.2, §5.3, §5.6, §6.2, §6.4 a §6.11, §6.13, §7.1 a §7.4, §8, §13), ADR-0002, anexo A

---

## 1. Contexto

O Inc. 2 cria o veículo, a oferta, as versões, as fotos, os documentos e as declarações do fornecedor. O aceite é publicar com pendência e mostrar o aviso, com os testes negativos 2 (ofertas e documentos), 6, 11 e 12 (preço) e verificação de mutação.

Já existem a identidade e as empresas (ADR-0002), as tabelas de registro (`audit_logs`, `field_history`, `restricted_access_logs`), a `platform_settings`, as funções do `private` e o gatilho genérico de auditoria.

Quatro exigências pesam mais neste ADR:
- as transições são validadas no banco, não só na interface (§6.2);
- pendência documental nunca impede publicar (§1.4.1, §6.2);
- mudança em campo material cria versão nova, e a ciência grava o hash da versão exibida (§5.2, §6.7);
- status, preço, validade, disponibilidade e dados do veículo sempre deixam histórico (§5.6, §6.9).

A I2.1 levantou 32 ambiguidades (B1 a B32, anexo A.7). A seção 7 responde a cada uma.

---

## 2. Decisões

### 2.1. Estados

| Estado | No Inc. 2 | Observação |
|---|---|---|
| `draft` | sim | — |
| `under_review` | sim | só recebe oferta quando a configuração da D10 exige revisão (seção 2.2) |
| `published` | sim | — |
| `reserved` | sim | — |
| `sold` | só no domínio | nenhuma transição leva a ele no Inc. 2. Ela chega com o desfecho, no Inc. 5, porque o evento que caracteriza a venda é a decisão C2 (§13) |
| `withdrawn` | sim | não é final: o fornecedor reabre como rascunho |
| `expired` | sim | só o sistema leva a ele (seção 2.9) |
| `suspended` | sim | só o administrador tira a oferta dele (seção 2.10) |

- Não há estado de recusa na revisão. A §6.2 não prevê um, e a devolução com motivo, mais a suspensão para os casos graves, cobrem o que a revisão precisa.
- Não há DELETE em `offers` nem em `vehicles`, para ninguém. Descartar um rascunho é retirá-lo.

### 2.2. Revisão antes de publicar (D10)

- **Configuração:** `offer_review_required`, booleano em `platform_settings`. O valor definitivo é a decisão D10 (§13). Até lá, o valor é provisório e fica marcado assim na descrição da chave (gate 7). O valor provisório é "revisão exigida" (Q1).
- **A configuração vale no momento da transição.** Mudá-la não mexe nas ofertas que já estão em `under_review` ou `published`.
- **Com revisão exigida:**
  - o fornecedor envia a oferta para `under_review`. O envio exige os requisitos da publicação (seção 2.4), inclusive a autorização de divulgação;
  - em revisão, o fornecedor não edita. Ele pode cancelar o envio, e a oferta volta a `draft`;
  - o operador ou o administrador publica, ou devolve para `draft` com motivo;
  - a revisão confere completude, linguagem e indício de fraude. Pendência, apontamento ou divergência documental nunca justificam a devolução (X07);
  - cada decisão vira uma linha em `offer_reviews`, tabela nova e só de inclusão, com a versão revisada. Como o fornecedor não edita em revisão, a versão publicada é a revisada;
  - a edição de oferta já publicada não volta à revisão. Ela gera versão nova, e a plataforma acompanha pelas versões (Q1).
- **Sem revisão exigida:** o fornecedor publica direto de `draft`, e ninguém leva oferta a `under_review` (X10).
- Os testes rodam com os dois valores (seção 3).

### 2.3. Transições

**Legenda:**
- **F:** membro ativo da empresa dona, com a empresa ativa (ADR-0002 §2.2).
- **F-adm:** `org_admin` da empresa dona (Q2).
- **ST:** operador ou administrador ativo que não tenha vínculo com a empresa dona (seção 2.14).
- **AD:** só o administrador.
- **SIS:** o sistema, pela rotina de expiração do banco.

Os IDs são os do anexo A.2. T18 e T19 são novas.

| ID | De | Para | Quem | Condições | Efeitos |
|---|---|---|---|---|---|
| T01 | (nova) | `draft` | F; o staff não cria (Q3) | empresa da oferta = empresa do ator | veículo e oferta numa transação; versão 1 |
| T03 | `draft` | `under_review` | F-adm | revisão exigida; requisitos da seção 2.4 | histórico; auditoria |
| T18 | `under_review` | `draft` | F | cancelamento do envio | histórico; auditoria; a autorização de divulgação é limpa |
| T04 | `under_review` | `published` | ST | requisitos conferidos de novo; nenhum impedimento ativo | `published_at`; `offer_reviews`; histórico; auditoria |
| T05 | `under_review` | `draft` | ST | motivo | `offer_reviews` com o motivo; a autorização de divulgação é limpa |
| T06 | `draft` | `published` | F-adm | revisão não exigida; requisitos; nenhum impedimento ativo | `published_at`; histórico; auditoria |
| T08 | `published` | `reserved` | F-adm ou ST | — | histórico; auditoria |
| T09 | `reserved` | `published` | F-adm ou ST | — | histórico; auditoria |
| T11 | `draft`, `under_review`, `published`, `reserved` ou `expired` | `withdrawn` | F-adm; ST com motivo | — | `withdrawn_*`; histórico; auditoria |
| T19 | `withdrawn` | `draft` | F-adm | — | a autorização de divulgação é limpa |
| T12 | `published` ou `reserved` | `expired` | SIS | `valid_until` vencido | histórico, com o sistema como ator |
| T13 | `expired` | `draft` | F-adm | — | renovar a vencida é reabrir e publicar de novo |
| T14 | qualquer um, menos `sold` e `suspended` | `suspended` | ST | categoria e motivo (seção 2.10) | `suspended_*`; histórico; auditoria |
| T15 | `suspended` | `draft` | AD | motivo | histórico; auditoria |

- **Sem mudança de estado:** T02, T07, T16 e T17 ficam nas seções 2.5 e 2.9. T10 (`sold`) fica para o Inc. 5.
- **Banco e servidor com a mesma tabela:**
  - o gatilho `before update` de `offers` recusa todo par fora da tabela e todo ator fora da coluna "Quem";
  - o servidor tem a mesma tabela em `src/modules/offers/rules/transicoes.ts`, para responder cedo com erro previsível;
  - um teste de integração confere que as duas tabelas são iguais (seção 3).
- **Proibidas em qualquer caminho:** X01 a X15 do anexo A.2, mais estas:
  - X16: staff com vínculo na empresa dona agindo como plataforma nas ofertas dela (B25);
  - X17: qualquer transição para `sold` no Inc. 2;
  - X18: documento com `buyer_visibility` diferente de `hidden` (D5);
  - X19: mudar placa, RENAVAM ou chassi depois da primeira publicação (Q4).
- **Empresa suspensa:** o status das ofertas não muda. Elas saem da vista dos compradores e não recebem interesse pelo predicado da seção 2.9.

### 2.4. Requisitos de publicação e avisos

- **Uma função só:** `private.pendencias_de_publicacao(oferta)` devolve a lista do que falta.
  - O gatilho recusa o envio e a publicação com essa lista na mensagem.
  - O servidor chama a mesma função, por RPC com a sessão do usuário, para mostrar a lista antes de o fornecedor tentar.
- **Requisitos** (§6.2, §6.9, §6.11):
  - quem age é F-adm ativo de empresa ativa;
  - todos os dados do veículo da §5.2, com formato válido (seção 2.11);
  - cidade e UF;
  - `asking_price` maior que zero, em BRL;
  - condições comerciais com texto;
  - autorização de divulgação declarada no próprio ato de enviar ou publicar (seção 2.12);
  - declaração vigente em cada categoria da configuração, inclusive "desconhece";
  - `valid_until` no futuro e dentro do teto (seção 2.9);
  - nenhum impedimento de transferência ativo, conforme o padrão provisório da D9. A tabela de impedimentos só chega no Inc. 3, então no Inc. 2 a verificação devolve "nenhum", e o Inc. 3 a completa. A verificação vale para toda entrada em `published`, de `draft` ou de `under_review` (B27).
- **Não bloqueiam:**
  - consulta pendente ou não feita;
  - apontamento, inclusive `has_occurrence` declarado;
  - divergência;
  - falta de fotos, de documentos ou de confirmação de disponibilidade.
- **Aviso ao fornecedor:**
  - ao publicar ou enviar com categoria em `not_checked`, `declared_unverified` ou `with_findings`, a tela mostra o aviso e deixa seguir;
  - o texto passa pelo teste de linguagem proibida (I2.8).

### 2.5. Edição por estado

| Estado | Quem edita | O quê |
|---|---|---|
| `draft` | F | tudo: veículo, oferta, declarações, fotos e documentos |
| `under_review` | ninguém | o fornecedor cancela o envio para editar |
| `published`, `reserved` | F-adm | oferta, veículo (com a identidade conforme a Q4), declarações, fotos e documentos. Mudança material gera versão |
| `published`, `reserved` | F | confirmar a disponibilidade |
| `sold`, `withdrawn`, `expired`, `suspended` | ninguém | reabrir antes, onde a seção 2.3 permite |

- **Staff:** não edita conteúdo de oferta (Q3).
- **Mesma tabela no servidor e no gatilho.**
- **GRANT por coluna:** limita o que o `authenticated` escreve.
- **Colunas preenchidas pelo gatilho:**
  - ator, datas, versão e `is_test`;
  - as colunas de revisão, retirada e suspensão.
- **Campo fora da lista:** é recusado pelo esquema estrito do servidor e pelo GRANT (CT12.5).
- **Segunda camada (I2.3):** na edição sem mudança de status, o gatilho aceita só preço, condições, cidade, UF, validade e disponibilidade, mesmo que um GRANT seja ampliado por engano (mutação M10).
- **Resposta igual para oferta alheia e inexistente:** nos gatilhos de declaração, foto e documento, as duas recebem "sem permissão", sem revelar se a oferta existe (CT2.11).

### 2.6. Versão e snapshot

- **Quando nasce a versão:** sempre que o snapshot material muda, em qualquer estado (§5.2). A versão 1 nasce com a oferta.
- **Como:**
  - cada tabela que alimenta o snapshot tem um gatilho de restrição adiado (`constraint trigger ... deferrable initially deferred`);
  - no fim da transação, esse gatilho chama `private.versionar_oferta(oferta)`;
  - a função monta o snapshot e o compara com o da versão vigente, sem o número da versão. Se mudou, ela grava a versão nova e atualiza `current_version`;
  - assim, uma operação que muda preço e quilometragem na mesma transação gera uma versão só.
- **Tabelas que alimentam o snapshot:** no Inc. 2, `offers`, `vehicles` e `supplier_declarations`. O Inc. 3 acrescenta `vehicle_checks`, `documental_reviews` e `transfer_impediments`.
- **Operações em mais de uma tabela** (`createOffer`, `updateOffer`): usam uma RPC `security invoker`, para caber numa transação e numa versão. É o padrão de `reconvidar_membro` (ADR-0002, R3).
- **Ninguém insere versão diretamente:**
  - `offer_versions` não tem INSERT para `authenticated` nem para `service_role`;
  - só a função, `security definer`, grava;
  - a tabela é só de inclusão (teste 11).
- **`created_by`:** quem fez a mudança.
- **`change_summary`:** os caminhos do snapshot que mudaram, calculados pela função.

**Estrutura do snapshot** (`schema_version` 1). Não leva datas nem números, para o hash não depender da forma de escrever um número:

```json
{
  "schema_version": "1",
  "offer_id": "<uuid>",
  "version_number": "3",
  "fields": {
    "asking_price": "150000.00",
    "commercial_conditions": "…",
    "mileage_km": "45000"
  },
  "categories": {
    "auction": {
      "declaration": { "value": "no_known_occurrence", "detail": null },
      "state": "declared_unverified"
    }
  },
  "transfer_impediments": [],
  "notices": ["declarado_sem_comprovacao.v1"]
}
```

- **`fields`:** os campos materiais que são colunas, conforme a lista da configuração (`material_fields`). Os outros itens da lista (estados documentais, apontamentos, impedimentos e declarações) ligam as seções `categories` e `transfer_impediments`.
- **`categories`:**
  - entram as categorias da configuração e também as que já têm declaração na oferta. Assim, remover uma categoria da configuração nunca esconde uma declaração feita;
  - categoria sem declaração só acontece depois de mudança na configuração. Ela entra com `declaration: null` e estado `not_checked`, mostrada com a origem "não confirmada" (§6.5).
- **`notices`:**
  - são as ressalvas exibidas (§5.2), registradas como códigos com a versão do texto;
  - o texto fica num catálogo no código (`src/modules/documental/rules/avisos.ts`);
  - mudar um texto cria um código novo, e o antigo continua no catálogo;
  - assim, a ciência fica presa ao texto exato que foi mostrado.
- **`transfer_impediments`:** lista vazia no Inc. 2.
- **Mudança das listas da configuração:** mudar a lista de campos materiais ou de categorias vale para frente. A versão seguinte usa a lista nova, e as antigas não mudam.

### 2.7. Hash do snapshot

- **Algoritmo:** SHA-256 do JSON canônico do snapshot em UTF-8, em hexadecimal minúsculo. São 64 caracteres, conferidos por CHECK.
- **JSON canônico:**
  - segue a forma do JCS (RFC 8785), num subconjunto;
  - chaves ASCII em ordem de código, sem espaços;
  - valores só de texto, nulo, objeto e lista, com as listas já ordenadas pela função;
  - como não há números, a parte difícil do JCS, a serialização numérica, não entra.
- **Onde se calcula:**
  - no banco, dentro de `private.versionar_oferta`, com o `sha256()` do Postgres e uma função `private.json_canonico(jsonb)`;
  - `jsonb::text` não serve, porque ordena as chaves primeiro por tamanho e não é uma forma que terceiros reproduzam.
- **Conferência independente:**
  - `src/modules/offers/rules/snapshot.ts` implementa o mesmo JSON canônico e o mesmo hash;
  - um teste de integração recalcula o hash de snapshots gravados (com acento, aspas, barra invertida e emoji) e compara com o do banco;
  - qualquer pessoa consegue recalcular o hash a partir do snapshot.
- **Textos de entrada:**
  - chegam sem espaços nas pontas e sem caracteres invisíveis ou de controle (seção 2.12);
  - conferido na I2.3: o `300-ofertas-estrutura` compara o JSON canônico e o hash do banco com valores calculados em Node, com aspas, barra invertida, quebra de linha, caractere de controle, acento e emoji.
- **Uso:** a ciência (Inc. 5) grava a versão e o hash. O servidor recusa a ciência se a versão não for a vigente ou se o hash não for o dela (§6.7, teste 8).

### 2.8. Histórico e auditoria

- **`field_history`:**
  - gatilho `after update` em `offers` e `vehicles`, uma linha por coluna que mudou;
  - grava o valor anterior e o novo em jsonb e o autor (`auth.uid()`, nulo para o sistema);
  - a comparação é pelo valor em jsonb. O texto já chega normalizado e o preço tem escala fixa, então "150000" e "150000.00" não contam como mudança;
  - só ficam de fora as colunas técnicas `updated_at` e `current_version`; a versão tem registro próprio em `offer_versions`;
  - o histórico roda na mesma transação: se falhar, a escrita falha junto. O padrão do projeto interno fazia o contrário: a falha do histórico só virava aviso no log (A.8).
- **`audit_logs`:**
  - o gatilho `private.registrar_auditoria()` passa a cobrir `offers`, `vehicles`, `offer_versions`, `offer_media`, `offer_documents`, `supplier_declarations` e `offer_reviews`;
  - a empresa dona entra como `actor_organization_id`;
  - a `metadata` leva os nomes dos campos e as transições de status. Nunca leva placa, RENAVAM, chassi nem valor de texto livre.
- **Motivo:**
  - a devolução, a retirada pelo staff, a suspensão e a reativação exigem o cabeçalho `x-audit-reason` (`private.exigir_motivo()`);
  - o gatilho copia o motivo para a coluna que o fornecedor vê: `offer_reviews.reason`, `withdrawn_reason` ou `suspended_reason`;
  - o usuário não escreve essas colunas diretamente.
- **Expiração:** o sistema é o ator. A auditoria registra o ator nulo e a origem `expiracao` na `metadata`.

### 2.9. Validade, expiração e disponibilidade

**Validade (`valid_until`):**
- **Obrigatória para enviar e publicar,** no futuro e no máximo `offer_max_validity_days` dias à frente.
- **Valor sugerido:** o formulário sugere `offer_default_validity_days`.
- **Fim do dia:** a data escolhida vale até 23:59:59 do horário de Brasília (`America/Sao_Paulo`).
- **Valores:** 15 dias de padrão e 30 de teto (Q5).
- **Extensão:** F-adm estende a validade em `draft`, `published` e `reserved`, sem mudar o estado. A extensão gera histórico, mas não versão, porque a validade não é campo material (§6.7).
- **Depois de vencida:** renovar é reabrir como rascunho (T13) e publicar de novo, passando pelos requisitos e, com revisão exigida, pela revisão.

**Expiração no banco** (§4.3):
- **Função:** `private.expirar_ofertas()` leva a `expired` toda oferta `published` ou `reserved` com `valid_until` vencido.
- **Job:** o `pg_cron` roda a função a cada 10 minutos, como `postgres`.
  - O gatilho só aceita a transição para `expired` nesse caminho (`private.manutencao()`) e com a validade de fato vencida. Nenhum usuário leva a oferta a esse estado (X04).
  - O intervalo é técnico e provisório.
- **Disponibilidade da extensão:**
  - o `pg_cron` 1.6.4 está disponível no projeto de desenvolvimento, mas ainda não foi ligado. Conferi em 29/10 em `pg_available_extensions`, no Postgres 17.11;
  - a I2.3 liga a extensão por migração (`20261029120100_expiracao_das_ofertas`), no schema `pg_catalog`, como manda a documentação do Supabase;
  - a migração não faz GRANT no schema `cron`. O gatilho de eventos do próprio Supabase dá o acesso ao `postgres` ao criar a extensão e repete a revogação e a concessão a cada `create extension`. Um GRANT do `postgres` para ele mesmo fica dependente desse acesso, e o reset seguinte falha com "dependent privileges exist" (conferido em 29/10; os GRANTs da primeira versão foram removidos do `dev`);
  - a migração é reaplicável: `cron.schedule` com o mesmo nome atualiza o job, e dois resets seguidos passaram. O CI ainda não rodou essa migração.
- **Entre duas rodadas:**
  - a oferta vencida já se comporta como expirada;
  - catálogo (Inc. 4) e interesse (Inc. 5) usam o predicado `private.oferta_aberta(oferta)`: status `published` ou `reserved`, `valid_until` no futuro e empresa dona ativa;
  - o job só grava o status e o histórico.

**Disponibilidade:**
- **Quem confirma:** qualquer F, em `published` e `reserved`.
- **Data:** o gatilho grava `now()`, qualquer que seja o valor enviado.
- **Efeitos:** a confirmação gera histórico. Não gera versão e não mexe na validade nem no estado.
- **Ficha:** mostra a data.
- **Lembretes:** o período de confirmação e os lembretes entram com a outbox, no Inc. 5.

### 2.10. Suspensão e reativação

- **Quem suspende:** ST (§6.10), de qualquer estado menos `sold` e `suspended`.
- **Motivo:** categoria fechada e texto obrigatório. As categorias são as quatro da §6.10:
  - `fraud_indication`: indício de fraude;
  - `forgery`: falsificação;
  - `deliberately_misleading`: informação deliberadamente enganosa;
  - `serious_risk`: risco grave.

  Não há categoria de pendência documental, e a tela lembra que ela, sozinha, não é motivo (X09).
- **Colunas:**
  - o staff envia `suspended_category`;
  - o gatilho preenche `suspended_reason`, `suspended_by` e `suspended_at`;
  - a última suspensão fica na linha, e as anteriores ficam em `field_history`;
  - a nova suspensão de uma oferta reativada aceita a mesma categoria da anterior. Corrigido na I2.6: o gatilho exigia que a categoria aparecesse entre as colunas alteradas e recusava a mesma categoria. Agora exige só a categoria preenchida, e o servidor sempre envia a categoria escolhida. A correção foi feita na própria migração da I2.3, que ainda não tinha saído do repositório local.
- **Durante a suspensão:** o fornecedor só lê. Não edita, não retira, não reabre, não declara nem anexa.
- **Reativação:**
  - só o administrador reativa, com motivo, e a oferta volta a `draft`;
  - o fornecedor publica de novo, passando pelos requisitos e, com revisão exigida, pela revisão;
  - se um operador suspendeu por engano, ele pede a reativação a um administrador.
- **Avisos** (§6.10):
  - no Inc. 2, a suspensão fica na auditoria e aparece no painel do fornecedor;
  - os e-mails ao fornecedor e aos compradores com negociação aberta entram com a outbox, no Inc. 5.

### 2.11. Veículo

- **Uma linha por oferta:**
  - `offers.vehicle_id` é único;
  - o veículo ganha `organization_id`, a empresa dona, que não muda. A coluna não está na §5.2; ela simplifica as políticas e evita veículo sem dono entre o cadastro e a oferta.
- **Sem unicidade global de placa, RENAVAM ou chassi,** porque o erro de duplicidade revelaria o estoque de outra empresa. A tela avisa quando a própria empresa já tem oferta aberta com a mesma placa.
- **Para publicar, todos os campos da §5.2 preenchidos,** com validação de formato e sem consulta externa:
  - placa no formato antigo (`AAA9999`) ou Mercosul (`AAA9A99`), guardada em maiúsculas e sem hífen;
  - RENAVAM com 11 dígitos e dígito verificador. A fonte oficial é a Portaria DENATRAN 27/2013, art. 1º, § 1º: "10 dígitos e um dígito verificador, calculado através do módulo 11, peso 9";
    - a I2.3 lê "peso 9" como pesos de 2 a 9 da direita para a esquerda, como no CNPJ; resto 0 ou 1 dá dígito 0;
    - o código antigo, de 9 dígitos, chega do servidor completado com zeros à esquerda;
    - a ordem dos pesos não está escrita na portaria. Um RENAVAM real recusado barraria a publicação, então a regra é conferida com RENAVAMs reais antes do piloto (Inc. 6);
  - chassi com 17 caracteres, sem I, O e Q;
  - ano do modelo igual ao de fabricação ou ao seguinte;
  - quilometragem inteira e não negativa.
- **Depois da primeira publicação** (Q4):
  - placa, RENAVAM e chassi não mudam;
  - marca, modelo, versão e anos mudam com versão nova, porque entram na lista de campos materiais;
  - na oferta publicada ou reservada, nenhum dado exigido para publicar volta a vazio, nem por chamada direta à API. O gatilho `proteger_veiculo` recusa, com a mesma lista das pendências de publicação (`private.dados_do_veiculo_faltando`). Corrigido na I2.6, na própria migração da I2.3.
- **Campos restritos:** placa, RENAVAM e chassi só para a empresa dona e o staff (§5.2, §7.2). O catálogo do Inc. 4 lê o veículo por uma visão sem esses campos.

### 2.12. Declarações do fornecedor e textos

- **Quem declara:** só F, qualquer que seja a resposta à Q3. A §6.5 exibe a origem como "Declarada pelo fornecedor", então o staff não declara.
- **Registro:**
  - `supplier_declarations` é só de inclusão;
  - a declaração mais recente de cada categoria é a vigente (§5.3).
- **`detail`:**
  - é obrigatório com `has_occurrence` (CHECK), com até 2.000 caracteres;
  - é opcional nos outros valores.
- **`unknown`:** escolha explícita do fornecedor, nunca valor padrão. Pergunta não respondida não gera linha.
- **Categoria:** precisa estar em `document_categories` no momento da declaração.
- **Estados da I2.5, só a partir das declarações:**
  - `unknown` → `not_checked`;
  - `no_known_occurrence` → `declared_unverified`;
  - `has_occurrence` → `with_findings`.
- **Implementado na I2.5** (migração `20261029160000_estado_documental`):
  - uma função só, `private.estados_documentais_da_oferta`, calcula o estado e a origem (§6.5) de cada categoria. O snapshot da versão e a RPC da tela, `public.estados_documentais`, usam essa mesma função. A saída do snapshot não mudou, e os hashes gravados continuam conferindo;
  - o estado de cada categoria é o candidato de maior precedência da §6.4 (`private.precedencia_documental`). No Inc. 2, o único candidato vem da declaração vigente; o Inc. 3 acrescenta consultas, revisões e impedimentos;
  - nenhuma tabela guarda o estado: ele é calculado a cada leitura;
  - o servidor (`src/modules/documental/`) acrescenta os rótulos da §6.4 e da §6.5, o catálogo de textos das ressalvas (`rules/avisos.ts`, com textos provisórios até a D5) e o resumo proporcional do catálogo;
  - documento anexado ainda não confirma categoria: a ligação entre documento e categoria não existe no modelo da §5.2 e fica para o Inc. 3.
- **Autorização de divulgação:**
  - F-adm declara a cada envio ou publicação;
  - o ator grava o próprio id em `publication_authorized_by`, e o gatilho confere que é ele mesmo e grava `publication_authorized_at`;
  - ao voltar para `draft`, a autorização é limpa, e a anterior fica no histórico.
- **Textos livres** (condições comerciais, detalhe, descrição de documento, motivos):
  - sem espaços nas pontas;
  - sem caracteres invisíveis ou de controle;
  - com tamanho máximo;
  - conferidos no servidor e no banco.

### 2.13. Fotos, documentos e buckets (antecipa parte da I2.4)

- **Buckets privados:**
  - `offer-photos`, para JPEG, PNG e WebP;
  - `offer-documents`, para PDF, JPEG, PNG e WebP;
  - os dois seguem a convenção do ADR-0002 §2.14 e entram em `bucketsDaAplicacao`;
  - os dois aceitam até 10 MiB por arquivo, como a evidência da adesão (migração `20261029140000_storage_das_ofertas`).
- **Caminho:** `<empresa>/<oferta>/<uuid>.<extensão>`. O nome original do arquivo não entra no caminho.
- **Envio:**
  - F envia pela própria sessão, nas ofertas da empresa e nos estados editáveis da seção 2.5;
  - a política de INSERT em `storage.objects` confere empresa, oferta e estado;
  - a linha em `offer_media` ou `offer_documents` exige que o objeto exista no caminho e tenha sido enviado pelo mesmo usuário (`owner_id` do objeto). Os gatilhos conferem isso desde a I2.4;
  - o servidor exige vínculo ativo com a empresa dona antes de chegar ao Storage, então o staff é recusado antes do envio (Q3).
- **Nenhum objeto é sobrescrito nem apagado:** não há política de UPDATE nem de DELETE em `storage.objects` (CT6.6). Além disso, o próprio Supabase recusa DELETE direto por SQL nessa tabela. A remoção pela API do Storage passa pela política, e é por ela que o teste de integração confere a falta de política de DELETE.
- **Fotos:**
  - a empresa dona e o staff leem pela política de SELECT e geram a URL temporária com a própria sessão. O comprador entra no Inc. 4;
  - remover uma foto marca `removed_at` e `removed_by` em `offer_media`, colunas acrescentadas à §5.2. A foto some da oferta, mas o objeto fica guardado;
  - a ordem das fotos pode mudar nos estados editáveis;
  - fotos não são campo material (§6.7);
  - fotos não entram em `restricted_access_logs`, que é para documento e evidência (§5.6);
  - a tela de envio orienta a não mostrar placa nem dado pessoal. Com revisão exigida, o operador devolve a oferta que mostrar.
- **Documentos:**
  - no bucket de documentos, não há política de SELECT em `storage.objects` para `authenticated`;
  - quem quer baixar pede ao servidor, que confere a permissão com a sessão do usuário, grava em `restricted_access_logs` e só então gera a URL temporária com a chave secreta;
  - assim, nenhum caminho baixa um documento sem deixar registro, nem o do próprio dono. É o sexto uso da chave secreta (ADR-0002 §2.12);
  - conferido na I2.4: o envio do documento funciona só com a política de INSERT, como diz a documentação do Supabase ("Storage Access Control"); o upsert exigiria também SELECT e UPDATE;
  - `buyer_visibility` só aceita `hidden` até a decisão D5. Como a tabela é só de inclusão, a forma de abrir (por linha ou por tipo, em configuração, §7.3) fica para quando a D5 for decidida;
  - o servidor calcula o `sha256` no envio. Quem chamar a API direto pode informar outro valor para o próprio arquivo. A I2.4 manteve o cálculo só no servidor; conferir o conteúdo guardado contra o `sha256` fica para antes do piloto (Inc. 6);
  - documento enviado por engano continua guardado e oculto ao comprador. A remoção por obrigação legal vira um procedimento auditado, definido com o jurídico antes do piloto (Inc. 6).
- **Prazo das URLs temporárias:** 60 segundos para documento e 10 minutos para foto. São valores técnicos e provisórios.

### 2.14. Quem lê o quê no Inc. 2

| Tabela ou objeto | Quem lê |
|---|---|
| `vehicles`, `offers`, `offer_versions`, `supplier_declarations`, `offer_media`, `offer_documents` (a linha) e `offer_reviews` | membros ativos da empresa dona, com a empresa ativa; administrador e operador |
| objeto em `offer-photos` | os mesmos |
| objeto em `offer-documents` | só pela URL do servidor, com registro (seção 2.13) |
| `field_history` da oferta e do veículo | membros ativos da empresa dona, além de quem já lê pela regra da auditoria (ADR-0002 §2.9) |
| `audit_logs` e `restricted_access_logs` | sem mudança: `private.pode_ler_auditoria()` |

- **Outras empresas:** comprador e fornecedor de outra empresa não leem nada das ofertas no Inc. 2, nem as publicadas. O catálogo e a ficha chegam no Inc. 4, para `published` e `reserved`, por `private.pode_ver_catalogo()` e por visões sem os campos restritos (B19).
- **Operador:** vê as versões e as revisões. O `field_history` ele só lê com `can_read_audit`, como hoje (A18 do ADR-0002).
- **Conflito de interesse (B25):**
  - quem tem papel na plataforma e vínculo não removido com a empresa dona age nas ofertas dela só como fornecedor;
  - o gatilho recusa a ação de plataforma nesse caso: revisar, reservar, retirar, suspender e reativar como staff.
- **`is_test`:** copiado da empresa na criação da oferta e fixo depois (B26). Oferta de teste nunca aparece a comprador real (Inc. 4).

### 2.15. Escrita pelo servidor e operações

Vale a regra do ADR-0002 §2.12: as operações escrevem com a sessão do usuário. Uma chamada direta à API com o mesmo token tem o mesmo resultado, porque quem decide é o banco. Por isso, a mudança direta do preço pela API, com o token do dono, é aceita e gera a mesma versão e o mesmo histórico (CT12.6).

| Operação | Mecanismo no banco |
|---|---|
| `createOffer` | RPC `public.criar_oferta`: veículo e oferta numa transação; versão 1 |
| `updateOffer` | RPC `public.atualizar_oferta`: oferta e veículo numa transação, com no máximo uma versão; também estende a validade |
| `declareCategory` | INSERT em `supplier_declarations`; `declararCategorias` (I2.8) inclui várias numa inclusão só, com uma versão só |
| `publishOffer` | UPDATE do status para `under_review` ou `published`, conforme a D10, com a autorização de divulgação |
| `cancelReview` (nova) | UPDATE de `under_review` para `draft`, pelo fornecedor |
| `reviewOffer` (nova) | UPDATE de `under_review` para `published` ou `draft`; o gatilho grava `offer_reviews` |
| `reserveOffer` e `releaseReservation` (novas) | UPDATE entre `published` e `reserved` |
| `withdrawOffer` | UPDATE para `withdrawn`, com motivo obrigatório para o staff |
| `reopenOffer` (nova) | UPDATE de `withdrawn` ou `expired` para `draft` |
| `suspendOffer` | UPDATE para `suspended` com a categoria, e o motivo no cabeçalho |
| `reactivateOffer` (nova) | UPDATE de `suspended` para `draft`, pelo administrador, com motivo |
| `confirmAvailability` | UPDATE de `availability_confirmed_at`; o gatilho grava `now()` |
| enviar e remover foto; enviar documento | envio ao Storage pela sessão do usuário; INSERT ou UPDATE em `offer_media`; INSERT em `offer_documents` |
| abrir documento | leitura da linha pela sessão, registro em `restricted_access_logs` e URL temporária com a chave secreta |

As operações novas seguem o padrão da §8 (B32). As RPCs são `security invoker` no `public`, com `execute` só para `authenticated`.

**Entregue na I2.6 (29/10):**
- **Tabela no servidor:** `src/modules/offers/rules/transicoes.ts` repete a tabela da seção 2.3, com o ator de cada transição, o motivo por ator e as condições da D10 e da validade. `atorDaOferta` classifica a sessão em relação à empresa dona, com o conflito de interesse da B25. `rules/edicao.ts` repete a seção 2.5 e a disponibilidade.
- **Operações** (nomes do código, com o da §8 entre parênteses):
  - em `server/ofertas.ts`: `criarOferta` (`createOffer`), `atualizarOferta` (`updateOffer`), `declararCategoria` (`declareCategory`), `confirmarDisponibilidade` (`confirmAvailability`) e `consultarPendenciasDePublicacao`;
  - em `server/transicoes.ts`: `publicarOferta` (`publishOffer`), `cancelarRevisao`, `revisarOferta`, `reservarOferta`, `liberarReserva`, `retirarOferta` (`withdrawOffer`), `reabrirOferta`, `suspenderOferta` (`suspendOffer`) e `reativarOferta`;
  - em `storage/servidor.ts`: `removerFotoDaOferta` e `ordenarFotoDaOferta`.
- **Como respondem:**
  - cada operação de transição faz só as transições dela. O servidor confere o par de estados, o ator, a D10 e o motivo antes de escrever;
  - sem papel para a ação, a resposta é "sem permissão"; com papel, mas no estado errado, é regra violada;
  - a publicação lê a D10 para escolher entre `under_review` e `published` e mostra as pendências do banco (`private.pendencias_de_publicacao`) com rótulos;
  - a validade chega como data e vai ao banco como 23:59:59 daquele dia, com o nome do fuso de Brasília, para o próprio banco converter.
- **Esquemas estritos** (`schemas/ofertas.ts`): placa, RENAVAM e chassi normalizados e conferidos; preço como texto com até duas casas; textos sem caracteres de controle nem invisíveis, como os CHECKs; ocorrência declarada com detalhe; autorização de divulgação declarada no ato.
- **Hash fora do banco:** `rules/snapshot.ts` implementa o JSON canônico e o hash da seção 2.7.

### 2.16. Configuração do Inc. 2

A I2.3 cria as chaves em `platform_settings`. Como toda configuração, só o administrador altera (ADR-0002 §2.7). Nenhuma delas é crítica, porque os formulários e o operador precisam lê-las.

| Chave | Valor inicial | Base |
|---|---|---|
| `offer_review_required` | `true`, marcado como provisório até a D10 (Q1) | §5.6; §13 |
| `material_fields` | a lista da §6.7, mais marca, modelo, versão, ano de fabricação e ano do modelo (Q4) | §5.2; §6.7 |
| `document_categories` | as dez categorias da §5.3 | §5.3 |
| `offer_default_validity_days` | 15 (Q5) | §5.6; §6.9 |
| `offer_max_validity_days` | 30 (Q5) | §6.9 |

Mudar `material_fields` ou `document_categories` vale para frente (seção 2.6).

---

## 3. Testes do Inc. 2

- **Local dos arquivos pgTAP:** os do Inc. 2 usam a faixa `300-` a `399-` em `supabase/tests/database/`. Isso corrige o caminho `supabase/tests/offers/**` da I2.7 no plano, pelo mesmo motivo da I1.4: o runner não lê subpastas.
- **Os dois valores da D10:** cada teste de transição roda com `offer_review_required` verdadeiro e falso, trocado dentro da transação do teste.
- **Recusa pela restrição certa:** nos CHECKs por estado, o teste confere o nome da restrição que recusou, e não só que houve erro (padrão portado, A.8).
- **Tabela de transições:** um teste de integração percorre todos os pares de estados e todos os tipos de ator e compara o banco com `transicoes.ts`.
- **Hash:** o teste de integração da seção 2.7, mais testes unitários do JSON canônico.
- **Expiração:** o pgTAP chama `private.expirar_ofertas()` como `postgres`, com validade vencida, e confere:
  - o estado, o histórico e a auditoria;
  - que o job existe em `cron.job`;
  - que nenhum usuário leva a oferta a `expired`.
- **Casos do anexo A.6:** valem como estão, com três leituras:
  - CT12.6 vira contraste: a mudança direta pela API gera versão e histórico (seção 2.15);
  - CT12.9 vira negativo (Q3): o operador não altera o preço;
  - CT2.12 continua com 0 linhas no Inc. 2, para qualquer empresa, porque o catálogo é do Inc. 4.
- **Lista de mutações versionada** (R6 do ADR-0002): fica em `supabase/tests/mutacoes/inc-2.md`, com a camada mutada, a mudança, os casos que devem cair e o resultado observado. Cada mutação afrouxa uma camada de cada vez, e todo negativo tem contraste (ADR-0002 §3).
- **Entregue na I2.3 (29/10):**
  - arquivos `300-ofertas-estrutura` (46 asserções), `310-ofertas-transicoes` (70), `320-ofertas-versoes` (79) e `330-ofertas-isolamento` (32);
  - o `210-manutencao` passou a fixar `proteger_oferta` entre os chamadores de `manutencao()`, só para a expiração;
  - os arquivos de oferta tornam imediatos os gatilhos de versão (`set constraints all immediate`), para cada comando gravar a própria versão, e voltam a adiá-los só no caso que confere uma versão por transação;
  - 29 mutações, todas derrubando os casos esperados sem derrubar o contraste. Uma mutação é equivalente: a política de UPDATE de `offers` sozinha não muda nada, porque o UPDATE com WHERE também aplica a de SELECT, com o mesmo predicado;
  - ficam para depois o teste 6 (I2.4) e a comparação entre o banco e `transicoes.ts` (I2.6 e I2.7).
- **Entregue na I2.4 (29/10):**
  - `340-ofertas-storage` (30 asserções): buckets privados, políticas de envio e leitura, conferência do objeto e do dono, e escrita direta em `storage.objects`;
  - `tests/integration/ofertas-storage.test.ts` (15 testes): endereço público, download e URL pelo caminho, listagem, envio ao prefixo alheio, sobrescrita, movimentação e remoção pela API, URL do documento só pelo servidor e com registro, e URL vencida (CT6.1 a CT6.7);
  - 15 mutações, 10 de banco e 5 de integração, todas derrubando os casos esperados sem derrubar o contraste (`supabase/tests/mutacoes/inc-2.md`).
- **Entregue na I2.5 (29/10):**
  - `350-estado-documental` (22 asserções): regras da §6.4 só com declarações, origem da §6.5, declaração vigente, quem lê pela RPC, snapshot com os mesmos estados e mudanças na lista de categorias;
  - `tests/integration/estado-documental.test.ts` (3 testes): o banco e as regras do servidor dizem o mesmo (mapeamento, precedência e ressalvas), e a operação devolve estados, origens, ressalvas e resumo, ou "sem permissão";
  - testes unitários das regras e do catálogo de ressalvas (9);
  - 6 mutações, todas derrubando os casos esperados sem derrubar o contraste.
- **Entregue na I2.6 (29/10):**
  - `tests/integration/ofertas-transicoes.test.ts` (3 testes): a comparação entre o banco e `transicoes.ts` desta seção. Percorre os 8 estados de origem, os 7 de destino, 8 sessões (todos os papéis, inclusive o staff com vínculo ativo e com vínculo suspenso da B25, e o sistema), os dois valores da D10, com e sem motivo, e confere 1.792 tentativas. Faz o mesmo, em cada estado, com a edição da oferta, do veículo, a declaração e a disponibilidade (256 tentativas, contra `rules/edicao.ts`). As ofertas chegam aos estados pelas operações; `expired` e `sold`, só dentro da transação do teste;
  - `tests/integration/ofertas-operacoes.test.ts` (28 testes): o critério da I2.6 (o preço novo gera versão, histórico e auditoria; a suspensão exige motivo e categoria) e as operações novas; CT2.10, CT2.11, CT12.1, CT12.5 (no esquema), CT12.6 e CT12.9; o veículo da publicada sem dado vazio; e o hash de toda versão gravada recalculado por `rules/snapshot.ts`;
  - o `310-ofertas-transicoes` ganhou 2 asserções (72): a nova suspensão de uma oferta reativada, com a mesma categoria (seção 2.10);
  - o `320-ofertas-versoes` ganhou 3 (82): a publicada não perde dado do veículo, pela RPC nem pela API direta, e o rascunho pode ficar incompleto (seção 2.11);
  - testes unitários da tabela, do ator, da edição, do veículo, do snapshot e dos esquemas (30);
  - 14 mutações, todas derrubando os casos esperados sem derrubar o contraste.
- **Entregue na I2.7 (29/10),** escrito pelo builder (T1) e rodado pelo orquestrador:
  - `src/modules/offers/rules/transicoes.decisao.test.ts` (22 testes): a tabela da seção 2.3 escrita como dados no próprio teste, sem importar a do servidor, comparada com `transicaoDaOferta` e `motivoObrigatorio` em 1.536 combinações (todos os pares de estados, 6 atores, os dois valores da D10 e a validade vencida ou não); por estado, ao menos um destino que ninguém alcança; X01, X04, X10, X11 e X17 nomeados; e as tabelas da seção 2.5 e da disponibilidade. Com a comparação da I2.6 entre o servidor e o banco, o ADR, o servidor e o banco ficam amarrados;
  - `360-ofertas-so-inclusao` (99 asserções): o teste 11 sistemático. Em `supplier_declarations`, `offer_versions`, `offer_documents`, `offer_reviews` e nas linhas de `field_history` e `audit_logs` de uma operação de oferta, UPDATE, DELETE e TRUNCATE são recusados para o dono, o administrador, `service_role` e `postgres`, com a mensagem exata e as linhas conferidas intactas; CT11.5 confere no catálogo que toda chave estrangeira para `offers` e `vehicles` é `restrict`; CT11.6 para os três papéis. Para `authenticated` e `service_role`, quem recusa é o privilégio; o gatilho de só inclusão só é alcançado pelo `postgres`;
  - `370-ofertas-versionamento` (32 asserções): coluna a coluna, campo material gera exatamente uma versão, com o resumo certo; campo não material, foto, documento e transição de status geram só histórico; várias mudanças materiais numa transação geram uma versão só;
  - 11 mutações (V01 a V11), todas derrubando os casos esperados sem derrubar o contraste;
  - a asserção do CT11.5 lista as chaves estrangeiras atuais e precisa ser atualizada quando o Inc. 3 ligar tabelas novas a `offers`.
- **Entregue na I2.8 (29/10),** escrita pelo builder (T1), revisada pelo TV e integrada pelo T2:
  - telas do fornecedor em `/empresa/[empresaId]/ofertas` (painel, nova oferta, resumo e envio, cinco etapas e histórico), com leituras pela sessão em `src/modules/offers/queries/` (a chave secreta não entra em leitura de tela) e ações em `src/app/_acoes/ofertas.ts`;
  - `declararCategorias`, acrescentada pelo T2: as categorias marcadas entram numa inclusão só e geram uma versão só, em vez de uma por categoria; se uma for recusada, nenhuma é gravada (teste de integração novo);
  - `tests/e2e/ofertas.spec.mts` (4 testes): fluxo completo do `org_admin` até "Em revisão", com o aviso documental visível; o `member` sem envio (Q2); outra empresa com "Sem permissão"; empresa só compradora. Mutação: esconder o aviso documental derruba o fluxo completo.
- **Entregue na I2.9 (29/10),** escrita pelo builder (T1), revisada pelo TV e integrada pelo T2:
  - telas da equipe da plataforma em `/admin/ofertas` (lista de todas as empresas, com a fila "Em revisão") e `/admin/ofertas/[ofertaId]` (leitura completa e ações), com leituras pela sessão em `src/modules/offers/queries/plataforma.ts` e ações em `src/app/_acoes/ofertas-da-plataforma.ts`, sobre as operações da seção 2.15;
  - a tela mostra cada ação só quando a tabela da seção 2.3 permite ao ator (`src/modules/offers/ui/plataforma.ts`, com teste unitário contra `TRANSICOES` em todos os estados, para operador e administrador e os dois valores da D10). Com vínculo não removido com a empresa dona, a pessoa da equipe vê só o aviso do conflito (seção 2.14, B25). Quem decide continua sendo a operação e o gatilho;
  - a revisão lembra que pendência, apontamento ou divergência documental não justificam devolução (X07), e a suspensão, que pendência documental sozinha não é motivo (X09). O motivo da reativação vai só à auditoria, como diz a seção 2.8;
  - `tests/e2e/ofertas-admin.spec.mts` (10 testes): devolução sem e com motivo, reenvio pelo fornecedor e publicação, com a volta à fila; suspensão sem motivo recusada e, com categoria e motivo, visível ao fornecedor; reativação só pelo administrador; conflito de interesse sem ações; "Sem permissão" igual para quem não é da equipe e registro inexistente. Mutação: com a reativação visível ao operador, o caso da reativação falha.
- **Lacuna corrigida na I2.6:** com o token do `org_admin`, uma chamada direta à API apagava um dado do veículo de uma oferta publicada ou reservada (por exemplo, a marca), e a oferta continuava publicada. Conferido numa transação desfeita. O gatilho `proteger_veiculo` passou a recusar (seção 2.11).

---

## 4. Alternativas descartadas

| Alternativa | Por que não |
|---|---|
| Versão só a partir da primeira publicação | a §5.2 manda criar versão sempre que muda campo material. Comparar snapshots vale em qualquer estado e é mais simples |
| Gatilho de versão por coluna | os estados documentais são calculados e mudam por outras tabelas (Inc. 3). Comparar o snapshot cobre os dois casos |
| Hash calculado no servidor | uma chamada direta à API pularia o cálculo. No banco, a versão é gravada por qualquer caminho |
| Hash de `jsonb::text` | a ordem das chaves do `jsonb` não é uma forma reproduzível fora do Postgres |
| Estado de recusa na revisão | não existe na §6.2; devolução e suspensão bastam |
| Expiração só calculada na leitura, sem gravar o status | a §6.9 manda a oferta ir para `expired`, e o histórico exige a transição gravada |
| Expiração por cron da Vercel ou pelo n8n | a §4.3 permite banco ou servidor e proíbe o n8n. No banco, a rotina não depende de deploy nem da autenticação dos previews |
| Leitura de documento por política de SELECT no Storage | o usuário baixaria pela API sem passar pelo registro de acesso |
| Unicidade global de placa e chassi | o erro revelaria o estoque de outra empresa |
| Escrita do staff com a chave secreta | pula a RLS e esconde o ator, como no ADR-0002 |
| Remover foto apagando o objeto | apaga o registro do que foi exibido. O objeto fica, e a linha marca a remoção |

---

## 5. Consequências

- **Acréscimos à §5.2:**
  - `vehicles.organization_id`;
  - `offer_media.removed_at` e `offer_media.removed_by`;
  - `offers.withdrawn_by`, `offers.withdrawn_at`, `offers.withdrawn_reason` e `offers.suspended_category`;
  - a tabela `offer_reviews`.
- **`pg_cron`:** entra no projeto, e o reset e o CI passam a cuidar do job.
- **Chave secreta:** ganha um sexto uso, a URL temporária de documento, depois da checagem e do registro.
- **RPCs:** toda operação em mais de uma tabela da oferta passa por RPC, para caber numa versão.
- **Plano:** muda em dois pontos. O caminho dos testes da I2.7 (seção 3) e parte da I2.4 (buckets e caminhos), antecipada para este ADR.
- **Revisão:** com revisão exigida, a plataforma revisa a primeira publicação, não as edições seguintes (Q1).
- **E-mails:** nenhum sai no Inc. 2. Os avisos da §6.13 chegam com a outbox, no Inc. 5.

---

## 6. Perguntas à pessoa responsável

Respondidas pela pessoa responsável em 29/10, todas pela sugestão conservadora, que é o que as seções acima descrevem.

- **Q1 (seção 2.2): valor provisório da D10.**
  - **Pergunta:** até a decisão D10, a revisão antes de publicar fica ligada ou desligada no `dev` e na homologação?
  - **Sugestão:** ligada. Os dois caminhos são construídos e testados; o valor só define o padrão até a D10.
  - **Junto:** a edição de uma oferta já publicada deve voltar à revisão? A sugestão é que não volte: ela gera versão nova, e a plataforma acompanha pelas versões.
  - **Resposta:** ligada, e a edição de oferta publicada não volta à revisão.
- **Q2 (seções 2.3 e 2.5): papéis na empresa.**
  - **Pergunta:** o `member` faz nas ofertas tudo o que o `org_admin` faz?
  - **Sugestão:** não.
    - O `member` cadastra, edita o rascunho, declara, envia fotos e documentos e confirma a disponibilidade.
    - Só o `org_admin` publica ou envia à revisão, declara a autorização de divulgação, altera oferta publicada, reserva, retira e reabre.
  - **Leitura literal:** pela §3.2, os dois papéis seriam iguais.
  - **Resposta:** o `member` prepara, e o `org_admin` publica e altera o que o comprador vê.
- **Q3 (seções 2.3 e 2.5): staff nas ofertas.**
  - **Pergunta:** a §3.3 dá ao administrador e ao operador "cadastrar e editar oferta". O staff deve editar o conteúdo das ofertas?
  - **Sugestão:** não. O staff não cria oferta nem edita conteúdo (preço, veículo, condições, fotos e documentos).
    - Ele age só pelas transições: revisar, reservar, retirar com motivo e suspender. O administrador também reativa.
    - Assim, toda informação da oferta tem o fornecedor como origem (§6.5), e o teste 12 fica mais estrito.
  - **Alternativa:** seguir a matriz, e o staff edita com o ator registrado.
  - **Resposta:** só as transições.
- **Q4 (seção 2.11): identidade do veículo.**
  - **Pergunta:** marca, modelo, versão e anos não estão na lista de campos materiais da §6.7. Por isso, trocar o modelo de uma oferta publicada manteria vigente a ciência do comprador. Esses campos podem mudar depois da primeira publicação?
  - **Sugestão:** podem, mas entram na lista de campos materiais e mudam com versão nova e nova ciência. Placa, RENAVAM e chassi ficam fixos depois da primeira publicação.
  - **Alternativas:**
    - congelar toda a identidade depois da publicação;
    - seguir a lista literal.
  - **Resposta:** a identidade é material, e placa, RENAVAM e chassi ficam fixos.
- **Q5 (seção 2.9): validade.**
  - **Pergunta:** a especificação não traz os valores. Quantos dias valem a validade padrão e o teto?
  - **Sugestão:** padrão de 15 dias e teto de 30. Validade curta mantém o catálogo atual, e estender antes de vencer é uma ação só.
  - **Resposta:** 15 dias de padrão e 30 de teto.

---

## 7. Respostas às ambiguidades da I2.1

| ID | Tema | Decisão | Seção |
|---|---|---|---|
| B1 | D10 e `under_review` | configuração `offer_review_required`, com "revisão exigida" como valor provisório (Q1); envio com os requisitos; devolução com motivo; cancelamento do envio; sem recusa; sem edição em revisão; a mudança da configuração vale na transição; testes com os dois valores | 2.2 |
| B2 | staff publica direto? | só a partir de `under_review`; com revisão não exigida, só o fornecedor publica (Q3) | 2.3 |
| B3 | `org_admin` × `member` | o `member` prepara; o `org_admin` publica, altera a oferta publicada, reserva, retira e reabre (Q2) | 2.3, 2.5 |
| B4 | staff cadastra e edita | não; o staff age só pelas transições (Q3) | 2.3, 2.5 |
| B5 | declaração pelo staff | só o fornecedor declara | 2.12 |
| B6 | `reserved` | de `published`, por F-adm ou staff; volta a `published` pelos mesmos; vence como `published`; o vínculo com a negociação fica para o Inc. 5 | 2.3, 2.9 |
| B7 | `sold` | fica no domínio, sem transição no Inc. 2; chega com o desfecho (Inc. 5, C2) | 2.1 |
| B8 | `withdrawn` | de `draft`, `under_review`, `published`, `reserved` e `expired`; motivo obrigatório para o staff; não é final, e o fornecedor reabre como rascunho | 2.3 |
| B9 | validade | obrigatória para enviar e publicar; padrão de 15 dias e teto de 30, na configuração (Q5); vencem `published` e `reserved`; F-adm estende antes do vencimento; depois de vencida, reabrir e publicar de novo | 2.9 |
| B10 | disponibilidade | qualquer F, em `published` e `reserved`; a data vem do banco; sem efeito na validade nem no estado; período e lembretes no Inc. 5 | 2.9 |
| B11 | suspensão | de qualquer estado menos `sold` e `suspended`; categoria fechada e texto; o fornecedor só lê; só o administrador reativa, com motivo, e a oferta volta a `draft` | 2.10 |
| B12 | avisos no Inc. 2 | auditoria, histórico e painel; e-mails no Inc. 5; aviso de pendência na tela, com teste de linguagem | 2.4, 2.10 |
| B13 | versionamento | versão a cada mudança do snapshot, em qualquer estado e uma por transação; versão 1 com a oferta; snapshot e hash definidos | 2.6, 2.7 |
| B14 | lista de campos materiais | a identidade do veículo entra na lista, e placa, RENAVAM e chassi ficam fixos depois da primeira publicação (Q4); a mudança da lista vale para frente | 2.6, 2.11 |
| B15 | preço e condições | `asking_price` maior que zero, com duas casas, só em BRL e sem teto; condições com texto | 2.4 |
| B16 | dados do veículo | todos obrigatórios para publicar; formato validado, sem consulta externa; o algoritmo do RENAVAM é conferido em fonte oficial na I2.3 | 2.11 |
| B17 | `vehicles` sem empresa | `organization_id` no veículo; uma linha por oferta; sem unicidade global | 2.11 |
| B18 | "fornecedor ativo" | perfil, vínculo e empresa ativos; empresa suspensa tira as ofertas da vista sem mudar o status | 2.3, 2.9 |
| B19 | leitura entre empresas | ninguém de fora lê oferta no Inc. 2; o comprador lê `published` e `reserved` a partir do Inc. 4 | 2.14 |
| B20 | alcance do teste 12 | `asking_price` no Inc. 2; preço do desfecho e pagador, com o desfecho | 3 |
| B21 | visibilidade de documento | só `hidden` até a D5; a forma de abrir é decidida com a D5 | 2.13 |
| B22 | fotos | remoção marcada na linha, com o objeto mantido; ordem em estado editável; orientação sobre placa; fora dos campos materiais | 2.13 |
| B23 | documento enviado por engano | linha e objeto imutáveis, oculto ao comprador; remoção legal por procedimento com o jurídico antes do piloto | 2.13 |
| B24 | acesso às fotos | fotos fora de `restricted_access_logs`; documentos sempre registrados, inclusive para o dono | 2.13 |
| B25 | conflito de interesse do staff | staff com vínculo na empresa dona age só como fornecedor | 2.14 |
| B26 | `is_test` da oferta | copiado da empresa e fixo | 2.14 |
| B27 | impedimento no Inc. 2 | toda entrada em `published` confere impedimento ativo; a verificação devolve "nenhum" até o Inc. 3; impedimento registrado depois não muda o estado até a D9 | 2.4 |
| B28 | detalhe da declaração | obrigatório com `has_occurrence` | 2.12 |
| B29 | estados por declaração | `unknown` → `not_checked`; `no_known_occurrence` → `declared_unverified`; `has_occurrence` → `with_findings`; categoria sem declaração, que só aparece depois de mudança na configuração, é mostrada como `not_checked` | 2.6, 2.12 |
| B30 | autorização de divulgação | F-adm declara a cada envio ou publicação; a autorização é limpa ao voltar a `draft` | 2.12 |
| B31 | edição por estado | tabela da seção 2.5 | 2.5 |
| B32 | operações que faltam na §8 | `cancelReview`, `reviewOffer`, `reserveOffer`, `releaseReservation`, `reopenOffer` e `reactivateOffer` | 2.15 |

---

## Anexo A. Regras extraídas da especificação (I2.1)

**Origem:**
- **Extração:** o `fast-helper` (T0), só em leitura, em 28/10/2026.
- **Conferência do T2:**
  - a matriz da §3.3, a tabela e os requisitos da §6.2, a lista da §6.7, a §6.9, a §6.10, os testes da §7.4 e as colunas da §5.2 batem com as citações;
  - o inventário do código a portar foi conferido por amostra e está em `notas-privadas/` (a seção A.8 só resume).
- **Sem decisão:** onde a especificação não decide, a regra virou ambiguidade (A.7).

### A.1. Autores

- **F:** membro ativo de empresa ativa com `kind` `supplier` ou `both`, só nas ofertas da própria empresa (§3.3, "só as próprias"; ADR-0002 §2.2). Ainda não está decidido se vale igual para `org_admin` e `member` (B3).
- **OP:** operador ativo. **AD:** administrador ativo (§3.1).
- **SIS:** sistema, no banco ou no servidor, nunca no n8n (§4.3).
- **C:** membro de empresa `buyer`, ou de empresa `both` que não é a dona da oferta.
- **D10=sim/não:** valor da configuração "exigência de revisão antes da publicação" (§5.6; §13).

### A.2. Transições (§6.2)

| ID | De | Para | Quem pode | Pré-condições | Efeitos | Base |
|---|---|---|---|---|---|---|
| T01 | (nova) | `draft` | F; AD e OP pela §3.3 (B4) | ator ativo; com F, a empresa da oferta é a do ator | `vehicles` e `offers`; `created_by`; `field_history`; auditoria; versão: B13 | §6.2; §3.3; §8 `createOffer` |
| T02 | `draft` | `draft`, por edição, declaração, documento ou foto | F; AD e OP (B4, B5) | estado editável (B31) | `field_history`; declaração e documento entram como linha nova; versão nova se o campo for material (B13) | §5.2; §5.3; §5.6; §8 `updateOffer`, `declareCategory` |
| T03 | `draft` | `under_review` | F | só com D10=sim; não está definido se exige os requisitos de publicação (B1) | `field_history`; auditoria | §6.2; §13 D10 |
| T04 | `under_review` | `published` | OP (§6.2); AD (§3.3; B2) | D10=sim; requisitos de A.3; sem impedimento ativo (B27) | `published_at`; `field_history`; auditoria; versão vigente (B13); e-mail de nova oferta (§6.13; B12) | §6.2 |
| T05 | `under_review` | `draft` (devolução) ou recusa | não definido | — | — | ausente da §6.2 (B1) |
| T06 | `draft` | `published` | F; AD e OP pela §3.3, mas a §6.2 só cita o operador, e só com D10 (B2) | D10=não; requisitos de A.3; sem impedimento ativo | iguais aos da T04 | §6.2; §3.3; §8 `publishOffer`; §6.11 |
| T07 | `published` ou `reserved` | o mesmo estado, com mudança de campo material | F; AD e OP (B4) | estado editável (B31) | **versão nova**; `field_history`; a ciência anterior fica desatualizada; e-mail (B12) | §5.2; §6.7; §6.9; §6.13 |
| T08 | `published` | `reserved` | F; OP; AD não citado (B6) | "negociação em fase de acordo" (B6) | `field_history`; auditoria | §6.2; §6.8 |
| T09 | `reserved` | `published` | não definido | — | — | ausente (B6) |
| T10 | `published` ou `reserved` (B7) | `sold` | F; OP; AD só pela linha "Registrar desfecho" da §3.3 | "desfecho de venda registrado" (B7) | `field_history`; auditoria | §6.2; §6.12 |
| T11 | origem não definida (B8) | `withdrawn` | F; OP; AD (§3.3) | não se sabe se exige motivo (B8) | `field_history`; auditoria; a oferta deixa de receber interesse | §6.2; §3.3; §8 `withdrawOffer` |
| T12 | `published`; `reserved` talvez (B9) | `expired` | só SIS | `valid_until` vencido "sem renovação" | `field_history`, com o sistema como ator; a oferta deixa de receber interesse | §6.2; §6.9; §4.3 |
| T13 | `expired` | renovação | não definido | — | — | §6.2 (B9) |
| T14 | origem não definida (B11) | `suspended` | AD; OP "com registro"; **nunca F** | motivo obrigatório; pendência documental sozinha não é motivo | `suspended_*`; auditoria; aviso ao fornecedor e aos compradores com negociação aberta (B12) | §6.10; §3.3; §5.2; §8 `suspendOffer` |
| T15 | `suspended` | reativação | não definido | — | — | ausente da §6.10 (B11) |
| T16 | estado inalterado | confirmar a disponibilidade | F; staff não definido (B10) | estados: não definido (B10) | `availability_confirmed_at`; `field_history`; não é campo material | §6.9; §5.6; §8 `confirmAvailability` |
| T17 | estado inalterado | mudar `valid_until` | não definido (B9) | — | `field_history`; versão só se a validade entrar na lista de campos materiais | §6.9 |

**Regras gerais:**
- "As transições são validadas no banco, não só na interface" (§6.2).
- Publicar, retirar e suspender rodam no servidor (§4.1).
- Oferta retirada, expirada ou suspensa não recebe interesse novo (§6.2); o interesse exige oferta publicada ou reservada (§6.8).
- **Auditoria:** a especificação a exige na suspensão (§6.10) e nas ações administrativas (§7.1). O ADR-0002 §2.11 audita toda mudança de status por gatilho.

**Transições proibidas:**

| ID | Tentativa | Resultado esperado | Base |
|---|---|---|---|
| X01 | F suspende uma oferta, mesmo a própria | recusada | §3.3 |
| X02 | C cria, edita, publica, retira ou suspende | recusada | §3.3 |
| X03 | F de outra empresa faz qualquer transição ou edição | recusada | §3.3; §1.4 |
| X04 | um usuário leva a oferta a `expired` | recusada; só o sistema faz | §6.2 |
| X05 | publicar com alguma categoria sem declaração | recusada | §6.2; §6.4 |
| X06 | publicar com impedimento de transferência ativo | recusada (padrão provisório) | §6.11; D9 (B27) |
| X07 | barrar a publicação por consulta pendente ou não feita, apontamento ou divergência | o bloqueio é proibido; a condição gera aviso | §6.2; §1.4 |
| X08 | suspender sem motivo | recusada | §6.10 |
| X09 | suspender só por pendência documental | recusada (B11) | §6.10 |
| X10 | ter `under_review` com D10=não | o estado não existe | §6.2 |
| X11 | F leva de `draft` a `published` direto com D10=sim | recusada | §6.2 (B1, B2) |
| X12 | transição inválida por chamada direta à API | recusada pelo banco | §6.2 |
| X13 | interesse novo em `draft`, `under_review`, `withdrawn`, `expired`, `suspended` ou `sold` | recusado (Inc. 5) | §6.2; §6.8 |
| X14 | membro suspenso, ou de empresa suspensa, com token antigo | recusada | §6.1; ADR-0002 §2.3 |
| X15 | mudar campo material sem versão nova, ou status, preço, validade e disponibilidade sem histórico | impossível por qualquer caminho | §5.2; §6.9; §1.4 |

### A.3. Requisitos para publicar (§6.2)

| Requisito | Base | Lacuna |
|---|---|---|
| fornecedor ativo | §6.2 | B18 |
| dados do veículo preenchidos | §6.2; §5.2 | B16 |
| localização preenchida | §6.2; §5.2 | — |
| preço válido | §6.2 | B15 |
| condições comerciais registradas | §6.2 | B15 |
| autorização de divulgação declarada | §6.2; §5.2 | B30 |
| declaração em todas as categorias da configuração, inclusive "desconhece" | §6.2; §6.4; §5.3 | B29 |
| nenhum impedimento de transferência ativo (padrão provisório) | §6.11; D9 | B27 |
| com D10=sim, passar por `under_review` e ser publicada pelo operador | §6.2 | B1 |
| `valid_until` definido | §6.9 | B9 |

- **O que não bloqueia:**
  - consulta pendente ou não feita, apontamento (inclusive `has_occurrence` declarado) e divergência (§6.2; §1.4; critério 4 da §10);
  - fotos, documentos anexados e confirmação de disponibilidade também não estão na lista.
- **Aviso:**
  - "Essas condições geram avisos, não bloqueios" (§6.2);
  - a ficha mostra todos os estados por categoria, com fonte, data e limitações;
  - catálogo e notificações mostram um resumo proporcional, nunca um selo único (§6.4);
  - o impedimento tem aviso próprio (§6.11);
  - os textos seguem a §6.6;
  - o texto do aviso ao fornecedor não está definido (B12).

### A.4. Campos materiais (§6.7)

| Campo | Material | Versão nova e nova ciência | `field_history` |
|---|---|---|---|
| preço | sim | sim | sim |
| quilometragem | sim | sim | sim |
| estado documental de qualquer categoria | sim | sim | não definido |
| apontamentos | sim | sim | não definido |
| impedimentos de transferência | sim | sim (Inc. 3) | não definido |
| declarações do fornecedor | sim | sim | não se aplica (tabela só de inclusão) |
| condições comerciais | sim | sim | não definido |
| validade, disponibilidade e status | não | não | sim |
| demais dados do veículo | não (B14) | não | sim |
| localização, moeda, fotos, documentos e autorização de divulgação | não (B14) | não | não definido |

- A lista fica em configuração, com estes valores iniciais (§5.2; §5.6; §6.7).
- **Efeitos da versão nova:**
  - a ciência anterior continua registrada, mas fica desatualizada;
  - a negociação só passa de `negotiating` para `agreed` com ciência vigente;
  - sai um e-mail de versão nova (§6.7; §6.13).
- **`offer_versions`:** só de inclusão, com `version_number` único por oferta. O `material_snapshot` leva os campos materiais, os estados documentais e as ressalvas exibidas, e há também `snapshot_hash` (§5.2).

### A.5. Preço, validade, disponibilidade e suspensão (§6.9 e §6.10)

- **Preço:**
  - é campo material, com histórico e versão nova;
  - F altera nas ofertas próprias, e a §3.3 também dá "sim" a AD e OP (B4);
  - publicar exige preço válido (B15).
- **Validade:**
  - toda oferta tem `valid_until`. Ao vencer sem renovação, vai para `expired`, levada pelo sistema;
  - o padrão fica em `platform_settings`, sem valor na especificação;
  - quem renova, o que conta como renovação e para onde volta a oferta: B9.
- **Disponibilidade:** o fornecedor confirma periodicamente, e a data aparece na ficha. A mudança gera histórico, e o campo não é material. Período, consequência e quem confirma: B10.
- **Suspensão:**
  - quem: admin e operador ("sim, com registro");
  - motivo obrigatório: indício de fraude, falsificação, informação deliberadamente enganosa ou risco grave. Pendência documental sozinha não é motivo;
  - efeitos: auditoria; aviso ao fornecedor e aos compradores com negociação aberta; nenhum interesse novo;
  - reativação: não definida (B11).

### A.6. Casos de teste dos testes 2, 6, 11 e 12 (§7.4)

**Preparo comum:**
- **Empresas ativas:** F e G (`supplier`), C (`buyer`) e A (`both`).
- **Pessoas:**
  - f1, `org_admin` de F;
  - f2, `member` de F;
  - fs, `member` de F com vínculo `suspended`;
  - g1, `org_admin` de G;
  - c1, membro de C;
  - a1, membro de A;
  - O, operador;
  - X, administrador.
- **Ofertas:**
  - R, de F, em `draft`, com declarações, documento DR e foto FR;
  - P, de F, em `published`, na versão 1, com documento DP e foto FP;
  - S, de G, em `draft`.
- **Convenções:**
  - "Recusado" quer dizer erro de permissão ou 0 linhas afetadas, e o teste confere que nada mudou;
  - cada mutação afrouxa uma camada de cada vez, e todo negativo tem contraste (ADR-0002 §3);
  - a lista de mutações deste incremento é versionada (R6 do ADR-0002 §8).

**Teste 2: ofertas e documentos**

| ID | Quem | Tenta | Esperado |
|---|---|---|---|
| CT2.7 | g1 | ler R em `offers`, pelo id ou na listagem | 0 linhas |
| CT2.8 | g1 | ler o `vehicles` de R, inclusive placa, RENAVAM e chassi | 0 linhas |
| CT2.9 | g1 | ler `offer_versions`, `supplier_declarations`, `offer_media` e `offer_documents` de R | 0 linhas em cada tabela |
| CT2.10 | g1 | operação de servidor com o id de R, e depois com id inexistente | "sem permissão" nas duas, sem dado |
| CT2.11 | g1 | inserir declaração, documento ou foto em R, ou criar oferta com a empresa F | recusado; nenhuma linha nova |
| CT2.12 | g1 | ler P (publicada) e o DP | 0 linhas, porque fornecedor só vê catálogo se também for comprador (B19) |
| CT2.13 | a1 | ler R (rascunho) e a linha do DP | 0 linhas |
| CT2.14 | c1 | ler a linha do DP | 0 linhas (`buyer_visibility = hidden`) |
| CT2.15 | fs | ler R com o token antigo | 0 linhas |

- **Contraste:** f1 e f2 leem R, P e os registros ligados; O e X leem tudo; g1 lê S.
- **Mutações:**
  - predicado `true` nos SELECT derruba CT2.7 a CT2.9;
  - tirar o filtro de empresa da função auxiliar derruba CT2.7 a CT2.12;
  - política de comprador sem `buyer_visibility` derruba CT2.14;
  - tirar a checagem do servidor derruba CT2.10;
  - tirar o status do vínculo derruba CT2.15.

**Teste 6: arquivo privado obtido só pelo caminho**

| ID | Quem | Tenta | Esperado |
|---|---|---|---|
| CT6.1 | anônimo | abrir DR e FP pelo endereço público, com o caminho | recusado (bucket privado) |
| CT6.2 | g1 | baixar o objeto de DR pelo caminho, com o próprio token | recusado |
| CT6.3 | g1 | pedir URL temporária de DR, ao Storage ou ao servidor | recusado; nada em `restricted_access_logs` |
| CT6.4 | c1 | baixar FR e DP pelo caminho | recusado |
| CT6.5 | g1 | listar o prefixo das ofertas de F | 0 objetos |
| CT6.6 | g1 e f1 | g1 envia para o prefixo de R; f1 sobrescreve ou apaga DR | recusado (B23) |
| CT6.7 | f1 | usar a URL temporária depois do prazo | recusado |

- **Contraste:**
  - f1 obtém a URL de DR pelo servidor e baixa dentro do prazo, com o registro gravado antes;
  - f1 envia uma foto nova para R.
- **Mutações:**
  - bucket público derruba CT6.1;
  - política sem filtro de empresa derruba CT6.2 a CT6.5;
  - servidor sem checagem derruba CT6.3;
  - UPDATE ou DELETE permitido em `storage.objects` derruba CT6.6;
  - prazo longo derruba CT6.7.
- O registro de acesso às fotos é a B24.

**Teste 11: registros só de inclusão** (`supplier_declarations`, `offer_versions`, `offer_documents`, mais `field_history` e `audit_logs` das ofertas)

| ID | Quem | Tenta | Esperado |
|---|---|---|---|
| CT11.1 | f1 (dono) | UPDATE de valor, snapshot, hash, caminho ou visibilidade | recusado; linha inalterada |
| CT11.2 | f1 | DELETE | recusado |
| CT11.3 | X | UPDATE ou DELETE | recusado (§3.1) |
| CT11.4 | `service_role` | UPDATE, DELETE ou TRUNCATE | recusado pelo gatilho |
| CT11.5 | f1 e X | DELETE de `offers` ou `vehicles` com linhas nessas tabelas | recusado; sem cascata |
| CT11.6 | f1 | `version_number` repetido na mesma oferta | recusado |
| CT11.7 | f1 | alterar `field_history` ou `audit_logs` de uma operação de oferta | recusado (I0.6) |

- **Contraste:**
  - uma declaração nova da mesma categoria vira a vigente, e a anterior continua legível (§5.3);
  - mudar o preço de P cria a versão 2, e a versão 1 fica intacta.
- **Mutações:**
  - desligar o gatilho de só inclusão derruba CT11.1 a CT11.4;
  - cascata derruba CT11.5;
  - tirar o índice único derruba CT11.6.

**Teste 12: preço** (o `agreed_vehicle_price` do desfecho fica com o desfecho; B20)

| ID | Quem | Tenta | Esperado |
|---|---|---|---|
| CT12.1 | g1 | alterar o preço de P, pela API e pelo servidor | recusado; preço, versão, histórico e versões inalterados |
| CT12.2 | c1 | alterar o preço de P | recusado |
| CT12.3 | a1 (`both`, não é dono) | alterar o preço de P | recusado |
| CT12.4 | fs, ou f1 com F suspensa, com token antigo | alterar o preço | recusado |
| CT12.5 | f1 | enviar o preço junto com `status`, empresa, `current_version`, `published_at` ou `suspended_*` | recusado inteiro (esquema estrito e GRANT por coluna) |
| CT12.6 | f1 | UPDATE direto do preço pela API | recusado, ou aceito com a mesma versão e o mesmo histórico; nunca sem eles (decisão da I2.2) |
| CT12.7 | f1 | preço 0, negativo ou não numérico | recusado (B15) |
| CT12.8 | f1 | alterar o preço de oferta `sold` ou `suspended` | recusado, pela sugestão de B31 |
| CT12.9 | O | alterar o preço de P | a §3.3 diz "sim"; só vira negativo se B4 decidir o contrário |

- **Contraste:** f1 altera o preço de P, e o resultado tem versão 2, com snapshot e hash novos; `current_version` = 2; `field_history` com valor anterior, novo e autor; auditoria; e a versão 1 intacta.
- **Mutações:**
  - USING `true` no UPDATE derruba CT12.1 a CT12.3;
  - tirar o status da empresa ou do vínculo derruba CT12.4;
  - esquema sem `.strict()` ou GRANT ampliado derruba CT12.5;
  - desligar o gatilho de versão ou de histórico derruba o contraste e o CT12.6;
  - tirar o CHECK do preço derruba CT12.7.

### A.7. Ambiguidades

As sugestões são as mais conservadoras e não são decisões; as decisões estão na seção 7. As que dependem da §13: B1, B2 e B32 (D10); B7 (C2); B20 (C1 a C4); B21 (D5); B27 (D9).

| ID | Tema | O que a especificação não decide | Sugestão |
|---|---|---|---|
| B1 | D10 e `under_review` | valor provisório; se enviar exige os requisitos; o que o operador confere; devolução ou recusa; edição em `under_review`; mudança da configuração | "revisão exigida" como provisório; enviar exige os requisitos; `under_review` → `draft` com motivo; testes para os dois valores |
| B2 | staff publica direto? | a §6.2 só cita o operador com D10; a §3.3 dá "Publicar e retirar" a AD e OP | staff publica só a partir de `under_review`; com D10=não, só F |
| B3 | `org_admin` × `member` | a §3.2 dá as ações de oferta ao "Fornecedor", que é a empresa | `member` cadastra, edita e declara; só o `org_admin` publica, retira e autoriza a divulgação. Pela leitura literal, os dois papéis seriam iguais |
| B4 | staff cadastra e edita | a §3.3 diz "sim", sem dizer para qual empresa nem se inclui preço | staff não cria oferta nem altera campo material; só as transições da §6.2 |
| B5 | declaração pelo staff | `declared_by` livre, mas a origem exibida é "Declarada pelo fornecedor" (§6.5) | só F declara |
| B6 | `reserved` | origem; o que é "fase de acordo"; AD; volta a `published`; vencimento | só de `published`, por F ou OP até o Inc. 5; volta a `published` por F ou OP; vence como `published` |
| B7 | `sold` | o desfecho é pós-piloto; se o estado é final | de `published` ou `reserved`, manual e auditado; final |
| B8 | `withdrawn` | origens; motivo; se é final | de qualquer estado não final, menos `suspended`; motivo quando a plataforma retira; volta só para `draft` |
| B9 | validade | quando nasce; padrão e teto; quais estados vencem; quem renova; para onde volta | obrigatória para publicar; vencem `published` e `reserved`; só F renova, com nova checagem de publicação |
| B10 | disponibilidade | período; efeito de não confirmar; relação com a validade; quem confirma | período em configuração; sem confirmação, só aviso; não mexe na validade; só F, em `published` e `reserved` |
| B11 | suspensão | origens; o que F faz; reativação; `suspended_*`; recusa da "pendência sozinha" | qualquer estado menos `sold`; F não edita nem retira; só AD reativa, com motivo, para `draft`; motivo com categoria fechada mais texto |
| B12 | avisos no Inc. 2 | e-mails da §6.13 dependem da outbox (Inc. 5); efeito nas negociações abertas; texto do aviso de pendência | no Inc. 2, só auditoria e histórico; e-mail pendente do Inc. 5; aviso na tela do fornecedor |
| B13 | versionamento | quando nasce a versão 1; mudança material no `draft`; "ressalvas exibidas"; algoritmo do hash | versão a cada mudança material, inclusive no `draft`; hash definido neste ADR |
| B14 | lista de campos materiais | marca, modelo, anos, localização e fotos ficam fora; trocar o modelo manteria a ciência "vigente"; mudar a lista vale para trás? | proibir mudar a identidade do veículo depois da primeira publicação, ou incluí-la na lista (decisão H); mudança da lista só para frente |
| B15 | preço e condições | mínimo, teto, moeda; o que é "condição registrada" | `asking_price > 0`, só em BRL; condições com texto não vazio |
| B16 | dados do veículo | obrigatórios; validação de placa, RENAVAM e chassi | todos os de `vehicles` obrigatórios para publicar; formato validado, sem consulta externa |
| B17 | `vehicles` sem empresa | o mesmo veículo em dois fornecedores; unicidade revelaria estoque alheio | lido pela empresa da oferta; sem unicidade global visível |
| B18 | "fornecedor ativo" | empresa, vínculo ou os dois; ofertas de empresa suspensa | os dois; as ofertas da empresa suspensa saem da vista e não recebem interesse, sem mudar o status |
| B19 | leitura entre empresas | a §7.4.2 só cita o rascunho; quais estados o comprador vê | fornecedor puro não lê oferta alheia; comprador lê `published` e `reserved` (Inc. 4) |
| B20 | alcance do teste 12 | pode se referir ao preço do desfecho | `asking_price` no Inc. 2; `agreed_vehicle_price` com o desfecho |
| B21 | visibilidade de documento | `buyer_visibility` em tabela só de inclusão × decisão por tipo em configuração (§7.3) | `hidden` fixo no Inc. 2 |
| B22 | fotos | `offer_media` não é só de inclusão; remoção e ordem; placa visível na foto | remoção com histórico ou auditoria; placa como orientação (decisão H) |
| B23 | documento enviado por engano | sem substituição; dado pessoal não pode ser apagado; objeto imutável? | linha e objeto imutáveis; remoção legal só por procedimento de H com o jurídico, auditado |
| B24 | acesso às fotos | `restricted_access_logs` cita documento e evidência | registrar também as fotos, avaliando o volume |
| B25 | conflito de interesse do staff | staff membro da empresa fornecedora age nas ofertas dela | staff não age como plataforma nas ofertas da própria empresa |
| B26 | `is_test` da oferta | quem marca; herança; mudança | herdado da empresa e imutável; só AD altera |
| B27 | impedimento no Inc. 2 | `transfer_impediments` só no Inc. 3; outras entradas em `published`; impedimento depois de publicar | barrar toda entrada em `published` com impedimento ativo; impedimento novo não muda o estado sem decisão |
| B28 | detalhe da declaração | `detail` não é obrigatório com `has_occurrence` | obrigatório com `has_occurrence` |
| B29 | `not_checked` × `declared_unverified` | "desconhece" é declaração; categoria sem declaração; documento sem categoria | `unknown` → `not_checked`; `no_known_occurrence` → `declared_unverified`; `has_occurrence` → `with_findings`; sem declaração só no rascunho (I2.5) |
| B30 | autorização de divulgação | quem declara; validade | F declara a cada publicação |
| B31 | edição por estado | `under_review`, `reserved`, `sold`, `withdrawn`, `expired` e `suspended` | editar em `draft`, `published` e `reserved`, com versão; nunca em `under_review`, `sold` e `suspended`; nos demais estados, só voltando a `draft` |
| B32 | operações que faltam na §8 | enviar à revisão, revisar ou devolver, reservar, vender, reativar e renovar | operações próprias, no padrão da §8 |

### A.8. Código a portar (resumo)

São os padrões da seção 4 do plano que servem ao Inc. 2. As referências detalhadas, com arquivo e linha, ficam em `notas-privadas/`, fora do repositório público.

| Padrão | Uso no Inc. 2 |
|---|---|
| máquina de estados com CHECKs de completude por estado | CHECKs por estado em `offers`; a regra entre tabelas ("declaração em todas as categorias") pede gatilho ou função; o pgTAP confere a restrição que recusou |
| transição em função pura, espelhada no banco | a mesma tabela de pares (de, para) e autor no servidor e num gatilho do banco, com a sessão do usuário |
| histórico por campo e eventos só de inclusão | o `field_history` existente, com comparação por valor normalizado no gatilho; motivo obrigatório por CHECK nas correções |
| declaração do vendedor como declaração do fornecedor | `supplier_declarations` por categoria, com "desconhece" explícito e detalhe obrigatório com ocorrência; nenhum termo da §6.6 |
| RLS com GRANT por coluna | no multiempresa, a separação entre dono e comprador vem por tabela ou visão; um teste confere que toda coluna está classificada |
| versão por agregado | `current_version` com `offer_versions` e `snapshot_hash` |

Não portar: o modelo de uma empresa só, a leitura pública do catálogo, a escrita com chave de serviço e os termos da §6.6.
