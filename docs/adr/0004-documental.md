# ADR-0004: Domínio documental

**Status:** proposto em 30/10/2026. O anexo A (I3.1) traz as regras extraídas da especificação; as decisões (I3.2) seguem as leituras conservadoras dele, menos as quatro perguntas respondidas pela pessoa responsável em 30/10 (seção 6, P1 a P4). O aceite vem no gate do Inc. 3, depois da revisão independente (I3.7) e da revisão externa (I3.8).  
**Data:** 2026-10-30  
**Subtarefa:** I3.1 (anexo A) e I3.2 (decisões) do plano orquestrado v2  
**Base:** especificação v1.1 (§3.1 a §3.3, §5.2, §5.3, §6.3 a §6.7, §6.11, §7.2 a §7.4, §8, §10, §13), ADR-0003, anexo A

---

## 1. Contexto

O Inc. 3 completa o estado documental que o Inc. 2 calcula só pela declaração do fornecedor (I2.5; ADR-0003 §2.6 e §2.12). Entram as consultas (`vehicle_checks`), as revisões documentais (`documental_reviews`) e os impedimentos de transferência (`transfer_impediments`). O aceite é ter os estados conforme a §6.4 em todas as linhas e os testes 7 e 10, com verificação de mutação.

## 2. Decisões

As decisões seguem as leituras conservadoras do anexo A (A.9). A exceção são as quatro perguntas respondidas pela pessoa responsável em 30/10 (seção 6, P1 a P4), que estão marcadas.

### 2.1. Estado da categoria

- **Cálculo, nunca digitado (§6.4):** uma função do banco, `private.estado_documental(oferta, categoria)`, calcula o estado a partir dos registros. O servidor tem a mesma regra em `src/modules/documental/rules/estados.ts`, e um teste de integração confere os dois lados em todas as combinações (seção 3). Nenhuma tabela guarda o estado.
- **Candidatos:** a função junta os estados candidatos e devolve o de maior precedência (seção 2.2). Se não houver candidato, o resultado é `not_checked` (F0 do anexo A.2).

| Candidato | Vem de | Estado |
|---|---|---|
| declaração vigente `no_known_occurrence` | `supplier_declarations` | `declared_unverified` |
| declaração vigente `has_occurrence` | `supplier_declarations` | `with_findings` |
| declaração vigente `unknown` | `supplier_declarations` | nenhum (B29) |
| consulta vigente `awaiting_result` ou `inconclusive` | `vehicle_checks` | `pending` |
| consulta vigente `has_occurrence` | `vehicle_checks` | `with_findings` |
| consulta vigente `no_occurrence_in_source` | `vehicle_checks` | `no_findings_in_sources`, só sem revisão aberta |
| revisão aberta | `documental_reviews` | `under_review` |
| divergência (seção 2.4) | declaração e consulta vigentes | `under_review` |

- **A R2 ("sem consulta nem documento que a confirme"):** a declaração `no_known_occurrence` só fica como candidata enquanto nenhuma consulta vigente a confirma. Na prática, a precedência já resolve todas as linhas do anexo A.2: onde há consulta, sempre vale uma regra maior.
- **Documento anexado não muda o estado** (seção 2.6).
- **Tabela vigente:** as 40 linhas do anexo A.2 valem como estão, com uma exceção, a P1 da seção 6: na linha 25 (declaração `has_occurrence` com consulta `no_occurrence_in_source`, sem revisão), não há divergência, e o estado é `with_findings`. A linha 26, com revisão aberta, continua `under_review`. Em relação ao Inc. 2, mudam 32 linhas.
- **Teste 10:** `no_findings_in_sources` só sai do candidato de consulta vigente `no_occurrence_in_source`. Sem consulta registrada, ele não existe (linhas 5, 15 e 35 são as únicas).

### 2.2. Precedência

- **Ordem (§6.4):** `under_review` > `with_findings` > `pending` > `no_findings_in_sources` > `declared_unverified` > `not_checked`. Já está em `private.precedencia_documental` e em `PRECEDENCIA` desde a I2.5.
- **Mais de uma consulta vigente na mesma categoria** (seção 2.3): cada uma é um candidato. `no_findings_in_sources` só vence quando todas as vigentes são `no_occurrence_in_source`.
- **Provisória:** a §6.4 chama a tabela e a precedência de regra proposta, a validar no piloto. Mudar a ordem é mudar uma função e a tabela do servidor, com o teste de paridade.

### 2.3. Consulta vigente e substituição (E1 a E3)

- **Vigente:** toda consulta da categoria que nenhuma outra substituiu (`supersedes_check_id`). Fontes diferentes na mesma categoria convivem, cada uma vigente (E1). A tela as ordena pela data da consulta, da mais recente para a mais antiga.
- **`pending` só pela vigente (E2):** a consulta `awaiting_result` substituída pelo resultado deixa de contar.
- **Substituição (E3):**
  - a consulta nova aponta para uma consulta da mesma oferta, da mesma categoria e do mesmo lado de `is_test`, que ainda esteja vigente. Uma consulta é substituída uma vez só (índice único em `supersedes_check_id`);
  - o fornecedor só substitui consulta registrada pela própria empresa; a equipe da plataforma substitui qualquer uma;
  - a anterior continua legível e intacta (§6.3; CT11.13).
- **Resultado que chega depois:** a consulta `awaiting_result` é substituída por uma linha nova com o resultado. A tabela é só de inclusão.

### 2.4. Divergência (E4 a E7)

- **Automática só pelo valor (E6):** há divergência quando a declaração vigente é `no_known_occurrence` e uma consulta vigente da mesma categoria tem `has_occurrence` (linhas 17 e 18).
- **Não é divergência:**
  - **P1 (E4):** declaração `has_occurrence` com consulta `no_occurrence_in_source`. Vale o apontamento declarado, porque a fonte pode não cobrir a ocorrência (`known_limitations`, §6.3);
  - **E5:** `unknown` com qualquer resultado, porque "desconhece" não afirma nada;
  - consulta `awaiting_result` ou `inconclusive`, porque não há resultado a comparar.
- **Diferença no detalhe ou com documento (E6):** não é automática. A equipe abre uma revisão (seção 2.5), com o motivo.
- **Fim da divergência (E7):** fechar a revisão não a desfaz. Ela acaba quando chega declaração ou consulta nova que concorde, porque a regra olha só os registros vigentes.

### 2.5. Revisão documental (E8, E19)

- **Quem:** operador ou administrador sem vínculo não removido com a empresa dona (B25 do ADR-0003). O fornecedor vê a revisão, o motivo e quem a fechou.
- **Aberta:** a última ação da (oferta, categoria) é `open_review`.
- **Regras:** o banco recusa fechar sem revisão aberta e abrir de novo com uma aberta. O motivo é obrigatório nas duas ações, pelo cabeçalho `x-audit-reason`, como no ADR-0002 §2.11.
- **Só inclusão:** fechar é linha nova (CT11.11).

### 2.6. Documento anexado (E9, E11)

- **Não muda o estado (E9):** `offer_documents` não tem categoria, e a especificação não diz como um documento confirma uma categoria. A linha 11 do anexo A.2 continua `declared_unverified` com documento anexado.
- **Aparece à parte:** o documento é mostrado com a origem 2 ("Documento anexado"), nunca fundido com a declaração.
- **Nunca leva a `no_findings_in_sources`** (teste 10; CT10.4).
- **Origem 4 por documento (E11):** nenhum documento chega lá no Inc. 3. Conferência de documento oficial pela plataforma fica para depois do piloto.

### 2.7. Origens (E10, E12, E13)

- **Cada informação mostra a própria origem (§6.5):** a declaração (O1), cada documento (O2) e cada consulta vigente (O3 ou O4). O estado da categoria não é origem e não leva rótulo de origem. Categoria sem nenhuma informação mostra "Não confirmada" (O5).
- **O4 por consulta (E10):** "Confirmada por evidência independente" exige as três condições:
  - `source_type = official`;
  - evidência anexada;
  - consulta registrada pela equipe da plataforma, sem vínculo com a empresa dona.

  A consulta registrada pelo próprio fornecedor fica sempre O3, porque não é independente.
- **Revisão aberta (E12):** aparece como fato da categoria ("Em análise", com o motivo), sem rótulo de origem.
- **Consulta sem resultado (E13):** `awaiting_result` e `inconclusive` aparecem como O3, com o resultado por extenso, nunca como O4.

### 2.8. Evidência e "sem apontamentos nas fontes consultadas" (E14, E18)

- **P2 (E14):** a evidência não é exigida para `no_findings_in_sources`. A consulta precisa de fonte, data e `known_limitations`. Sem evidência, a tela mostra "sem evidência anexada" ao lado do resultado. O critério 11 da §10 fica atendido, porque toda consulta é registro real, com fonte e data, e nenhuma é simulada.
- **Arquivo da evidência (E18):**
  - fica num bucket privado próprio, `check-evidence`, com uma tabela só de inclusão, `check_evidence_files` (oferta, caminho, sha256, tipo, tamanho, quem enviou). `vehicle_checks.evidence_document_id` aponta para ela;
  - quem registra a consulta envia a evidência, com a própria sessão. A chave secreta não envia arquivo sem ator;
  - a equipe da plataforma pode enviar evidência de consulta. A Q3 do ADR-0003 continua valendo para o conteúdo da oferta: o staff não envia foto nem documento da oferta;
  - a leitura é só pelo servidor, com registro em `restricted_access_logs`, como o documento da oferta (ADR-0003 §2.13). Para o comprador, fica oculta até a D5 (§7.3).

### 2.9. Registro da consulta (E15 a E17, E34)

- **Quem registra (E16; §3.3):**
  - **equipe da plataforma:** operador ou administrador sem vínculo com a empresa dona;
  - **fornecedor:** só nas próprias ofertas, conforme a tabela de edição do ADR-0003 §2.5: o `member` no rascunho, o `org_admin` também na publicada ou reservada dentro da validade;
  - **comprador:** nunca.
- **Autoria:** `recorded_by` vem da sessão, pelo gatilho. No piloto, `performed_by` é a mesma pessoa: quem registra declara que fez a consulta. Consulta feita por terceiro fica para depois, e a limitação vai em `known_limitations`.
- **Estados da oferta (E17):**
  - **fornecedor:** os da tabela de edição;
  - **equipe:** `draft`, `under_review`, `published`, `reserved` e `suspended`. A suspensão entra porque a apuração costuma precisar de consulta;
  - **ninguém:** `sold`, `withdrawn` e `expired`, nem a publicada ou reservada vencida (seção 2.9 do ADR-0003).
- **`is_test` (E15):** o gatilho copia o valor da oferta, e o payload não o leva. O banco exige igualdade nos dois sentidos: consulta de teste só em oferta de teste, e consulta real só em oferta real (teste 7; CT7.4 é negativo).
- **Integridade (E34):**
  - `offer_id` obrigatório; `vehicle_id` é o veículo da oferta, gravado pelo gatilho;
  - a categoria precisa estar em `document_categories`;
  - `method = manual` até a C7;
  - `performed_at` não pode estar no futuro;
  - `source_name`, `performed_at` e `known_limitations` obrigatórios, com o filtro de texto de linha ou livre do Inc. 2.

### 2.10. Dado pessoal (E29 a E31)

- **CHECK no banco (E29):** a lista de chaves fica numa função imutável da migração, porque um CHECK não lê tabela. A comparação:
  - ignora maiúsculas e acentos;
  - vale em qualquer nível do jsonb, dentro de objetos e de listas;
  - recusa também a chave composta que contenha um identificador da lista, por exemplo `cpf_proprietario`.
- **Lista:** a do código a portar (descrita no anexo A.6), mais identificadores genéricos do proprietário e de contato. O nome do provedor daquele projeto não entra.
- **Placa, RENAVAM e chassi em `details` (E30):** recusados. Esses dados ficam só em `vehicles`.
- **Servidor (E31):** monta `details` por lista positiva de chaves, com esquema estrito, e nunca grava a resposta crua de uma fonte. A tela orienta a não pôr dado do proprietário nos textos livres. Evidência que traga dado do proprietário depende da D5 e fica oculta ao comprador.
- **Vale para todo papel:** o CHECK recusa também pela `service_role` e pelo `postgres`.

### 2.11. Impedimento de transferência (E20 a E24)

- **P3: registro automático (E20):** o banco cria o impedimento quando uma ocorrência aparece na categoria `transfer_conditions`. A ocorrência pode vir de duas fontes:
  - de uma declaração `has_occurrence`, e o impedimento aponta para ela (`source_declaration_id`);
  - de uma consulta vigente `has_occurrence`, e o impedimento aponta para ela (`source_check_id`).

  Há no máximo um impedimento por registro de origem. O `basis` traz a categoria e o detalhe do registro de origem.
- **Outras categorias:** o dano de média ou grande monta da §6.11 (Res. CONTRAN 810/2020, art. 14) só gera impedimento se aparecer também em `transfer_conditions`. A tela de declarações orienta o fornecedor a fazer isso, e a revisão da plataforma confere.
- **Resolução (E21):**
  - só o administrador resolve, com motivo e evidência da regularização, um arquivo de `check_evidence_files` da mesma oferta;
  - a resolução não é automática: declaração ou consulta nova que não aponte mais a ocorrência não resolve o impedimento sozinha;
  - uma ocorrência nova depois da resolução gera um impedimento novo.
- **Imutável (E22):** a linha só muda de `identified` para `resolved`, uma vez, com `resolved_by`, `resolved_at`, motivo e evidência. Não há DELETE nem volta (CT11.14).
- **Efeito (D9; P4, E23):**
  - **no rascunho ou em revisão:** a oferta não é enviada nem publicada; o motivo entra nas pendências como `transfer_impediment` (ADR-0003 §2.4, B27);
  - **na publicada ou reservada:** a oferta sai do catálogo enquanto houver impedimento ativo, porque `private.oferta_aberta` passa a exigir que não haja nenhum. O status não muda. O fornecedor vê o motivo, e a oferta volta quando o impedimento for resolvido;
  - **reserva:** a T08 é recusada com impedimento ativo; a liberação (T09) continua;
  - **versão:** registrar ou resolver um impedimento gera versão nova, porque `transfer_impediments` é campo material (§6.7). A ciência do comprador fica desatualizada (Inc. 5).
- **Fora do estado (E24):** o impedimento não entra no cálculo da seção 2.1. Ele tem aviso próprio, separado das pendências documentais (§6.11). O comentário da migração da I2.5 que o previa como candidato será corrigido.

### 2.12. Linguagem proibida (E25 a E28)

- **Lista (E25):** entra "sem ocorrências", com as flexões. "100% liberado" não aparece em tela. Outros termos, se surgirem, vão para a pessoa responsável.
- **Data (E26):** o varredor continua aceitando a qualificação sem a data. A regra fica na tela: onde aparece `no_findings_in_sources`, a data da consulta e a fonte aparecem ao lado (§6.4, "Exibição"). Um teste da I3.6 confere isso.
- **Alcance do varredor (E27):** passa a ler também os modelos de `supabase/templates/` e as mensagens de `raise exception` das migrações, que chegam à tela. As notificações do Inc. 5 ficam em pastas varridas.
- **Texto livre gravado na hora (E28):** `result_summary`, `known_limitations` e os motivos das revisões e dos impedimentos passam pela mesma lista. A conferência é feita no servidor e num gatilho. A lista do banco fica numa chave de `platform_settings`, e um teste confere que ela é igual a `config/linguagem-proibida.json`.

### 2.13. Snapshot e versão (E32, E33)

- **Tabelas novas no versionamento:** `vehicle_checks`, `documental_reviews` e `transfer_impediments` ganham o gatilho de versão adiado do ADR-0003 §2.6.
- **O que entra (E32):** tudo o que o comprador vê da consulta (§7.3).
  - Para cada consulta vigente da categoria: fonte, tipo de fonte, data da consulta (texto no formato `AAAA-MM-DDTHH:MM:SSZ`, em UTC), resultado, resumo, limitações e se há evidência anexada. Isso fica sob o campo material `findings`.
  - A revisão aberta entra como fato da categoria.
  - A seção `transfer_impediments` passa a listar cada impedimento, com base, situação e data.
- **`schema_version` 2:** as versões criadas depois da migração do Inc. 3 usam o formato novo. As anteriores continuam com o snapshot e o hash gravados.
- **Ressalvas novas (E33):** códigos `.v1` para `pending`, `under_review` e o impedimento, e um para `no_findings_in_sources`, que lembra que o resultado vale só para as fontes consultadas. Os textos são provisórios até a D5 e passam pelo teste de linguagem.
- **Conferência de quem chama (R-I2.11-07 do ADR-0003):** no Inc. 3, todos os escritores leem a oferta (fornecedor, equipe, ou o gatilho do impedimento dentro da sessão de um deles). A variante interna sem conferência fica para antes do Inc. 4 ou 5, como registrado.

### 2.14. O que o comprador vê (E35)

- **Até a D5 (§7.3):** o estado de cada categoria, a fonte, a data, as limitações e o resumo de quem registrou.
- **Fica oculto:** `details`, `protocol`, os autores e os arquivos de evidência. O catálogo chega no Inc. 4.

### 2.15. Operações de servidor

- **`recordCheck`:** consulta e evidência numa operação. O arquivo vai antes, pela sessão, e a linha da consulta depois, como o envio de documento da I2.4.
- **`openDocumentalReview` e `closeDocumentalReview`:** com motivo.
- **`resolveTransferImpediment` (nova):** só o administrador, com motivo e evidência.
- **Regras gerais:** o mesmo padrão das operações da I2.6, isto é, esquema estrito, ator da sessão, resposta igual para oferta alheia e inexistente, e o banco como quem decide.

### 2.16. Tabelas (para a I3.3)

- **`vehicle_checks`:**
  - colunas da §5.3, mais `recorded_at`;
  - só inclusão, com o gatilho do I0.6, que barra também `service_role` e `postgres`;
  - CHECKs com nome próprio: resultado, tipo de fonte, método, data e dado pessoal;
  - chaves estrangeiras compostas que garantem a mesma oferta e o mesmo `is_test` em `supersedes_check_id` e `evidence_document_id`.
- **`documental_reviews`:** colunas da §5.3, mais `created_at`; só inclusão.
- **`transfer_impediments`:**
  - colunas da §5.3, mais `identified_at`, `resolved_by`, `resolved_at` e `resolution_reason`;
  - exatamente uma origem (`source_check_id` ou `source_declaration_id`), da mesma oferta;
  - gatilho que só aceita a passagem para `resolved`.
- **`check_evidence_files`:** como `offer_documents` da I2.4, no bucket `check-evidence`.
- **Leitura:** a empresa dona e a equipe da plataforma, pela RLS. A evidência sai só pelo servidor.

## 3. Testes do Inc. 3

- **Tabela de decisão:**
  - **unitário:** as 40 linhas do anexo A.2, com a exceção da P1, escritas como dados no próprio teste, como na I2.7;
  - **integração:** a paridade entre `private.estado_documental` e `rules/estados.ts`, em todas as linhas e nos casos com mais de uma consulta vigente.
- **Testes 7, 10 e 11:** os casos do anexo A.8, com contraste e mutação. Mudanças pelas respostas da seção 6:
  - o CT7.4 é negativo (E15);
  - o CT10.8 espera `with_findings` (P1);
  - CT10.12, novo: `no_findings_in_sources` sem evidência aparece com "sem evidência anexada" (P2).
- **Dado pessoal:** os casos do anexo A.6, inclusive pela `service_role`.
- **Impedimento:**
  - criação automática por declaração e por consulta em `transfer_conditions`, sem impedimento em outras categorias;
  - a oferta não é enviada nem publicada com impedimento ativo;
  - a publicada sai de `private.oferta_aberta`, e a T08 é recusada;
  - a resolução só pelo administrador, com evidência;
  - a imutabilidade.
- **Linguagem:** os modelos de e-mail e as mensagens do banco no varredor; o texto livre recusado no servidor e no gatilho; a paridade da lista entre a configuração e o banco.
- **Revisão independente (I3.7) e revisão externa (I3.8):** as do plano.

## 4. Alternativas descartadas

- **Guardar o estado numa coluna:** a §6.4 proíbe digitar o estado. Um cache deixaria duas verdades.
- **Divergência também entre ocorrência declarada e consulta sem ocorrência:** descartada pela P1.
- **Exigir evidência para "sem apontamentos nas fontes consultadas":** descartada pela P2.
- **Impedimento registrado à mão pela equipe:** descartado pela P3. A equipe continua podendo abrir revisão documental.
- **Oferta com impedimento ativo publicada só com aviso:** descartada pela P4 e pela D9.
- **Evidência de consulta em `offer_documents`:** misturaria arquivo da plataforma com conteúdo do fornecedor e furaria a Q3 do ADR-0003.
- **Lista de chaves de dado pessoal em configuração:** um CHECK não lê tabela, e um gatilho no lugar do CHECK não vale para todo caminho do mesmo jeito.

## 5. Consequências

- **O estado da I2.5 muda em 32 das 40 linhas** quando as consultas e as revisões entrarem. Ofertas já publicadas no `dev` ganham versão nova só quando algum registro novo mudar o snapshot.
- **Formato 2 do snapshot:** as telas e a ciência (Inc. 5) leem as duas versões.
- **Catálogo (Inc. 4):** usa `private.oferta_aberta`, que já sabe do impedimento ativo.
- **Mais um bucket privado** (`check-evidence`) no reset e na trava de destino (ADR-0002 §2.14).
- **O varredor de linguagem fica maior:** lê modelos HTML e migrações.
- **Declaração por engano em `transfer_conditions`:** o impedimento nasce na hora e só sai com o administrador, mesmo que o fornecedor corrija a declaração. É o custo de não haver resolução automática (seção 2.11).

## 6. Perguntas à pessoa responsável

Respondidas em 30/10:

| # | Pergunta | Resposta | Seção |
|---|---|---|---|
| P1 | O fornecedor declara ocorrência, e a consulta não encontra nada: "Em análise" ou "Com apontamentos"? | **Com apontamentos:** vale a declaração; não é divergência | 2.4 |
| P2 | "Sem apontamentos nas fontes consultadas" exige evidência anexada? | **Não exige:** basta a consulta com fonte, data e limitações; a tela mostra "sem evidência anexada" | 2.8 |
| P3 | Quem registra e quem resolve o impedimento? | **Automático por categoria:** ocorrência em `transfer_conditions` gera o impedimento; só o administrador resolve, com evidência | 2.11 |
| P4 | Impedimento numa oferta já publicada ou reservada? | **Sai do catálogo** enquanto o impedimento estiver ativo; o fornecedor vê o motivo; volta quando resolvido | 2.11 |

## 7. Respostas às ambiguidades da I3.1

| ID | Decisão | Seção |
|---|---|---|
| E1 | todas as não substituídas são vigentes; `no_findings_in_sources` só com todas `nos` | 2.3 |
| E2 | `pending` só pela vigente | 2.3 |
| E3 | mesma oferta, categoria e `is_test`; anterior vigente; uma substituição só; o fornecedor só substitui consulta da própria empresa | 2.3 |
| E4 | não é divergência (P1) | 2.4 |
| E5 | `unknown` não diverge | 2.4 |
| E6 | automática só pelo valor; o resto por revisão | 2.4 |
| E7 | fechar a revisão não desfaz a divergência | 2.4 |
| E8 | aberta = última ação `open_review`; sem fechar sem abrir nem abrir duas vezes; motivo nas duas | 2.5 |
| E9 | documento não muda o estado | 2.6 |
| E10 | O4 só com fonte oficial, evidência e registro pela equipe sem vínculo | 2.7 |
| E11 | nenhum documento chega à O4 no Inc. 3 | 2.6 |
| E12 | a revisão é fato, sem rótulo de origem; sem informação, O5 | 2.7 |
| E13 | `awaiting_result` e `inconclusive` como O3, por extenso | 2.7 |
| E14 | evidência não exigida (P2) | 2.8 |
| E15 | copiado da oferta; igualdade nos dois sentidos | 2.9 |
| E16 | equipe sem vínculo, ou fornecedor pela tabela de edição; `performed_by` = quem registra no piloto | 2.9 |
| E17 | equipe em `draft`, `under_review`, `published`, `reserved` e `suspended`; fornecedor pela tabela de edição | 2.9 |
| E18 | bucket e tabela próprios para a evidência; a equipe envia com a própria sessão | 2.8 |
| E19 | operador ou administrador sem vínculo | 2.5 |
| E20 | automático por `transfer_conditions` (P3) | 2.11 |
| E21 | só o administrador, com motivo e evidência; sem resolução automática | 2.11 |
| E22 | só a passagem para `resolved`, uma vez; sem DELETE | 2.11 |
| E23 | sai do catálogo; T08 recusada; versão nova (P4) | 2.11 |
| E24 | fora do estado, com aviso próprio | 2.11 |
| E25 | "sem ocorrências" na lista; "100% liberado" fora da tela | 2.12 |
| E26 | data e fonte sempre ao lado de `no_findings_in_sources`; o varredor não muda | 2.12 |
| E27 | varredor também em `supabase/templates/` e nas mensagens das migrações | 2.12 |
| E28 | texto livre conferido no servidor e num gatilho, com a lista em `platform_settings` | 2.12 |
| E29 | lista numa função imutável; sem maiúsculas nem acentos; qualquer nível; chave composta | 2.10 |
| E30 | placa, RENAVAM e chassi recusados em `details` | 2.10 |
| E31 | lista positiva no servidor; orientação na tela; evidência com a D5 | 2.10 |
| E32 | tudo o que o comprador vê da consulta entra no snapshot | 2.13 |
| E33 | códigos `.v1` novos, provisórios até a D5 | 2.13 |
| E34 | oferta obrigatória; veículo pelo gatilho; categoria configurada; só `manual`; data não futura | 2.9 |
| E35 | o que a §7.3 lista; o resto oculto até a D5 | 2.14 |

---

## Anexo A. Regras extraídas da especificação (I3.1)

**Origem:**
- **Extração:** o `fast-helper` (T0), só em leitura, em 30/10/2026.
- **Conferência do T2** (30/10):
  - as citações da §3.1, da §3.3 (linha "Registrar consulta e evidência"), da §5.3, da §6.3 a §6.6, da §7.2 ("Dados do proprietário retornados por uma fonte não são gravados") e dos critérios 6 e 11 da §10 batem com o texto;
  - a tabela A.2 foi refeita à mão nas linhas 2, 13, 15, 17, 23, 25, 31 e 35, com o mesmo resultado;
  - as referências ao código do Inc. 2 (`private.estado_pela_declaracao`, `private.tem_impedimento_ativo`, a trava de `is_test` em `proteger_oferta`) e a ausência de "sem ocorrências" em `config/linguagem-proibida.json` foram conferidas;
  - as referências ao código a portar ficam em `notas-privadas/`, e a seção A.10 só resume.
- **Sem decisão:** onde a especificação não decide, a regra virou ambiguidade (A.9, E1 a E35).
- **Decisões que já valem:**
  - D9: impedimento ativo não publica (plano, Inc. 3, "Decisões"; confirmação da pessoa responsável em 29/10);
  - C7: registro manual;
  - respostas B5, B25, B26, B27 e B29 do ADR-0003 §7.
- **Legenda dos atores:** a do ADR-0003 (A.1 e §2.3): F, F-adm, ST, AD, OP, SIS e C.

### A.1. Insumos e autores

| Insumo | Tabela | O que entra no cálculo | Quem cria | Base | Lacuna |
|---|---|---|---|---|---|
| Declaração | `supplier_declarations`, só inclusão | a vigente, que é a mais recente da categoria (maior `seq`, como a I2.5 já faz) | só F (ADR-0003 §2.12, B5). O `member` declara no rascunho; o F-adm, na oferta publicada ou reservada (ADR-0003 §2.5, Q2) | §5.3; §3.2 ("declara informações"); §6.5 item 1 | — |
| Consulta | `vehicle_checks`, só inclusão | a vigente da categoria: a que não foi substituída por `supersedes_check_id` | AD e OP; F "só nas próprias ofertas" e só "consultas que realizou"; C não. `performed_by` é quem consultou, `recorded_by` é quem registrou. A I3.6 prevê tela para OP e para F | §3.3, linha "Registrar consulta e evidência"; §3.1 (o operador "registra consultas e evidências"); §3.2; §5.3; §8 `recordCheck` | E1, E3, E15 a E18, E34 |
| Evidência da consulta | `vehicle_checks.evidence_document_id` e `protocol` | só a origem 4 (A.4) | quem registra a consulta | §5.3; §6.3 ("evidência anexada quando existir") | E10, E14, E18 |
| Documento anexado | `offer_documents`, só inclusão e sem coluna de categoria | só a R2 ("nem documento que a confirme") e as origens 2 e 4 | F. O staff não envia (ADR-0003 §2.13, Q3) | §5.2; §6.4; §6.5 itens 2 e 4 | E9, E11, E18 |
| Revisão documental | `documental_reviews`, só inclusão (`open_review` ou `close_review`, `reason`, `actor`) | revisão aberta na categoria | OP ("marca análise documental"); AD (gestão global). O F não é citado, e a §3.3 não tem linha própria para revisão | §3.1; §5.3; §9 (tela administrativa de "registro de consultas e revisões documentais"); §8 `openDocumentalReview`, `closeDocumentalReview` | E7, E8, E19 |
| Impedimento | `transfer_impediments`, sem marca de só inclusão | não entra no estado (E24). Com `identified`, barra a entrada em `published` | "o sistema registra"; quem resolve não está definido; a §8 não tem operação para isso | §5.3; §6.11; D9 | E20 a E24 |
| Marca de teste | `vehicle_checks.is_test` | consulta de teste só se liga a oferta de teste | não definido | §6.3; §7.4, teste 7 | E15 |

### A.2. Tabela de decisão (§6.4)

**Regras da §6.4, com os códigos usados na tabela:**
- **R1 (`not_checked`):** nenhuma consulta registrada, e a declaração é "desconhece".
- **R2 (`declared_unverified`):** há declaração, sem consulta nem documento que a confirme.
  - O ADR-0003 (B29) tira o `unk` da R2. Sem isso a R1 nunca valeria, porque `declared_unverified` vence `not_checked`.
  - **R2\*:** a R2 só vale se "sem consulta" for lido como "sem consulta que a confirme". Na leitura "sem consulta alguma", não vale. Nas 40 linhas, a escolha não muda o resultado, porque sempre há uma regra de precedência maior.
- **R3 (`pending`):** consulta com `awaiting_result` ou `inconclusive`. A tabela conta só a vigente (E2).
- **R4a (`under_review`):** há revisão aberta.
- **R4b (`under_review`):** há divergência entre a declaração e a consulta.
- **R5a (`with_findings`):** a consulta vigente tem `has_occurrence`.
- **R5b (`with_findings`):** o fornecedor declarou ocorrência.
- **R6 (`no_findings_in_sources`):** a consulta vigente tem `no_occurrence_in_source`, sem revisão aberta.
- **F0:** nenhuma regra vale, e o resultado é `not_checked`. Isso não está na §6.4; vem da B29 e do `coalesce` de `private.estado_documental` (migração `20261029160000`).

**Abreviações:**
- **Declaração:** `—` (nenhuma), `nko` (`no_known_occurrence`), `dho` (`has_occurrence` declarado), `unk` (`unknown`).
- **Consulta vigente:** `—` (nenhuma), `aw` (`awaiting_result`), `nos` (`no_occurrence_in_source`), `cho` (`has_occurrence` da consulta), `inc` (`inconclusive`).
- **Origens:** O1 a O5, conforme A.4. "O3/O4" quer dizer O4 quando valem as condições da A.4 (E10), e só com `nos` ou `cho` (E13).
- **Coluna "Inc. 2":** o estado que a I2.5 calcula hoje, só pela declaração (`private.estado_pela_declaracao`).
- **Linhas com declaração `—`:** só existem no rascunho (§6.2) ou depois de mudar a lista de categorias (ADR-0003 §2.6).

| # | Decl. | Consulta | Rev. aberta | Regras que valem | Diverg. | Estado | Origens | Inc. 2 | Muda | Base |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | — | — | não | nenhuma (F0) | não | `not_checked` | O5 | `not_checked` | não | §6.4; §6.5 item 5; B29 |
| 2 | — | — | sim | R4a | não | `under_review` | O5 (E12) | `not_checked` | sim | §6.4; §6.5 |
| 3 | — | aw | não | R3 | não | `pending` | O3 (E13) | `not_checked` | sim | §6.4; §6.5 item 3 |
| 4 | — | aw | sim | R3, R4a | não | `under_review` | O3 | `not_checked` | sim | §6.4 |
| 5 | — | nos | não | R6 | não | `no_findings_in_sources` | O3/O4 | `not_checked` | sim | §6.4; §6.5 |
| 6 | — | nos | sim | R4a (a R6 cai por "sem revisão aberta") | não | `under_review` | O3/O4 | `not_checked` | sim | §6.4 |
| 7 | — | cho | não | R5a | não | `with_findings` | O3/O4 | `not_checked` | sim | §6.4 |
| 8 | — | cho | sim | R4a, R5a | não | `under_review` | O3/O4 | `not_checked` | sim | §6.4 |
| 9 | — | inc | não | R3 | não | `pending` | O3 (E13) | `not_checked` | sim | §6.4 |
| 10 | — | inc | sim | R3, R4a | não | `under_review` | O3 | `not_checked` | sim | §6.4 |
| 11 | nko | — | não | R2 | não | `declared_unverified` | O1 (O2 à parte, E9) | `declared_unverified` | não | §6.4; §6.5 item 1 |
| 12 | nko | — | sim | R2, R4a | não | `under_review` | O1 | `declared_unverified` | sim | §6.4 |
| 13 | nko | aw | não | R2\*, R3 | não | `pending` | O1, O3 | `declared_unverified` | sim | §6.4 |
| 14 | nko | aw | sim | R2\*, R3, R4a | não | `under_review` | O1, O3 | `declared_unverified` | sim | §6.4 |
| 15 | nko | nos | não | R6 (a R2 cai porque a consulta confirma) | não | `no_findings_in_sources` | O1, O3/O4 | `declared_unverified` | sim | §6.4 |
| 16 | nko | nos | sim | R4a | não | `under_review` | O1, O3/O4 | `declared_unverified` | sim | §6.4 |
| 17 | nko | cho | não | R2\*, R4b, R5a | **sim** | `under_review` | O1, O3/O4 | `declared_unverified` | sim | §6.4 |
| 18 | nko | cho | sim | R2\*, R4a, R4b, R5a | sim | `under_review` | O1, O3/O4 | `declared_unverified` | sim | §6.4 |
| 19 | nko | inc | não | R2\*, R3 | não | `pending` | O1, O3 | `declared_unverified` | sim | §6.4 |
| 20 | nko | inc | sim | R2\*, R3, R4a | não | `under_review` | O1, O3 | `declared_unverified` | sim | §6.4 |
| 21 | dho | — | não | R2, R5b | não | `with_findings` | O1 | `with_findings` | não | §6.4 |
| 22 | dho | — | sim | R2, R4a, R5b | não | `under_review` | O1 | `with_findings` | sim | §6.4 |
| 23 | dho | aw | não | R2\*, R3, R5b | não | `with_findings` | O1, O3 | `with_findings` | não (a O3 entra) | §6.4 |
| 24 | dho | aw | sim | R2\*, R3, R4a, R5b | não | `under_review` | O1, O3 | `with_findings` | sim | §6.4 |
| 25 | dho | nos | não | R2\*, R4b (E4), R5b, R6 | **sim (E4)** | `under_review`; sem divergência, seria `with_findings` | O1, O3/O4 | `with_findings` | sim (não, se a E4 disser que não há divergência) | §6.4 |
| 26 | dho | nos | sim | R2\*, R4a, R4b (E4), R5b | sim (E4) | `under_review` | O1, O3/O4 | `with_findings` | sim | §6.4 |
| 27 | dho | cho | não | R5a, R5b | não (E6) | `with_findings` | O1, O3/O4 | `with_findings` | não (a O3/O4 entra) | §6.4 |
| 28 | dho | cho | sim | R4a, R5a, R5b | não | `under_review` | O1, O3/O4 | `with_findings` | sim | §6.4 |
| 29 | dho | inc | não | R2\*, R3, R5b | não | `with_findings` | O1, O3 | `with_findings` | não (a O3 entra) | §6.4 |
| 30 | dho | inc | sim | R2\*, R3, R4a, R5b | não | `under_review` | O1, O3 | `with_findings` | sim | §6.4 |
| 31 | unk | — | não | R1 (a R2 fica fora pela B29) | não | `not_checked` | O1 | `not_checked` | não | §6.4; B29 |
| 32 | unk | — | sim | R1, R4a | não | `under_review` | O1 | `not_checked` | sim | §6.4 |
| 33 | unk | aw | não | R3 (a R1 cai porque há consulta) | não | `pending` | O1, O3 | `not_checked` | sim | §6.4 |
| 34 | unk | aw | sim | R3, R4a | não | `under_review` | O1, O3 | `not_checked` | sim | §6.4 |
| 35 | unk | nos | não | R6 | não (E5) | `no_findings_in_sources` | O1, O3/O4 | `not_checked` | sim | §6.4 |
| 36 | unk | nos | sim | R4a | não (E5) | `under_review` | O1, O3/O4 | `not_checked` | sim | §6.4 |
| 37 | unk | cho | não | R5a | não (E5) | `with_findings` | O1, O3/O4 | `not_checked` | sim | §6.4 |
| 38 | unk | cho | sim | R4a, R5a | não (E5) | `under_review` | O1, O3/O4 | `not_checked` | sim | §6.4 |
| 39 | unk | inc | não | R3 | não | `pending` | O1, O3 | `not_checked` | sim | §6.4 |
| 40 | unk | inc | sim | R3, R4a | não | `under_review` | O1, O3 | `not_checked` | sim | §6.4 |

**Divergência (R4b, §6.4):**
- **Lida como divergência:**
  - **`nko` × `cho` (linhas 17 e 18):** o fornecedor diz que não conhece ocorrência, e a fonte aponta uma. É a leitura direta do texto.
  - **`dho` × `nos` (linhas 25 e 26):** é divergência na letra do texto, porque um afirma a ocorrência e o outro não a encontra. Mas a fonte pode não cobrir a ocorrência (`known_limitations`, §6.3). A tabela segue a letra; a decisão fica para a E4.
- **Não lida como divergência:**
  - `unk` com qualquer resultado, porque "desconhece" não afirma nada (E5);
  - qualquer declaração com `aw` ou `inc`, porque não há resultado a comparar;
  - declaração `—`, porque não há o que comparar;
  - `nko` × `nos` e `dho` × `cho`, porque o valor concorda. Diferença no detalhe é a E6.
- **Divergência com documento:** a §5.3 a cita no motivo da revisão (`reason`), mas a R4b fala só de declaração e consulta. Pela letra, ela só entra por revisão aberta (E6).
- **Revisão fechada:** fechar a revisão não desfaz a R4b (E7).

**Documento anexado:**
- **Onde entra:** só na R2 ("sem consulta nem documento que a confirme") e nas origens 2 e 4 (§6.5).
- **Ligação com a categoria:** `offer_documents` não tem categoria (§5.2), e a especificação não diz como um documento confirma uma categoria (E9). O ADR-0003 §2.12 já registrou que documento anexado ainda não confirma categoria.
- **Efeito nas 40 linhas:** o documento só mudaria a linha 11. Ali a R2 deixaria de valer, e nenhuma outra regra vale. A F0 levaria a `not_checked`, o que rebaixa a informação (E9).
- **Teste 10:** documento nunca leva a `no_findings_in_sources`, porque esse estado só vem da R6, que exige consulta.

**Consulta substituída:**
- **Só a vigente conta:** "Consulta nova não apaga a anterior; ela a substitui" (§6.3). As R5 e R6 falam em "a consulta vigente" (§6.4).
- **O que a especificação não diz:** a §5.3 traz `supersedes_check_id`, mas não diz como escolher a vigente sem esse vínculo, nem o que fazer com duas consultas não substituídas na mesma categoria, de fontes diferentes (E1). A R3 diz "existe consulta" (E2). As regras do vínculo de substituição estão em aberto (E3).
- **Com mais de uma vigente (leitura da E1):** cada uma entra como candidata, e a precedência decide. `no_findings_in_sources` só vale quando todas as vigentes são `nos`.
- **Resultado que chega depois de `awaiting_result`:** vira linha nova com `supersedes_check_id`, porque a tabela é só de inclusão (§5.3).

**Teste 10 (§7.4): `no_findings_in_sources` não existe sem consulta registrada:**
- O estado só vem da R6 e aparece apenas nas linhas 5, 15 e 35, todas com consulta vigente `nos` e sem revisão aberta.
- As linhas sem consulta (1, 2, 11, 12, 21, 22, 31 e 32) nunca chegam a esse estado.
- A mesma consulta `nos` também não chega a ele com revisão aberta (linhas 6, 16 e 36) nem com ocorrência declarada (linha 25).
- Três condições fecham o teste:
  - consulta de teste não se liga a oferta real (teste 7);
  - consulta substituída não conta (E1 a E3);
  - toda consulta tem fonte, data e `known_limitations` (§5.3; §6.3), então o estado sempre tem "as fontes e a data da consulta" para mostrar (§6.4, "Exibição").

**Comparação com o Inc. 2:**
- **O que existe hoje:**
  - um candidato só, que vem da declaração vigente (`unk` ou nenhuma → `not_checked`; `nko` → `declared_unverified`; `dho` → `with_findings`);
  - a precedência já pronta (`private.precedencia_documental`).
- **Linhas que não mudam:**
  - 1, 11, 21 e 31, sem consulta e sem revisão;
  - 23, 27 e 29, em que o estado é o mesmo, mas entra a origem da consulta.
- **Linhas que mudam:** as outras 33. São 32 se a E4 disser que não há divergência entre `dho` e `nos`.
- **O que muda no código atual:**
  - `private.estado_documental` precisa receber como candidatos a consulta, a revisão e a divergência;
  - `estados_documentais_da_oferta` devolve uma origem por categoria, e a §6.5 pede a origem de cada informação (E12);
  - `private.aviso_do_estado` e `AVISOS` só têm códigos para `not_checked`, `declared_unverified` e `with_findings`. `pending`, `under_review` e `no_findings_in_sources` não geram ressalva (E33);
  - o snapshot ganha o que for material na consulta (E32), e a seção `transfer_impediments` deixa de ser sempre `[]`;
  - `private.tem_impedimento_ativo` hoje devolve `false`;
  - `vehicle_checks`, `documental_reviews` e `transfer_impediments` passam a disparar o versionamento (ADR-0003 §2.6), e a conferência de quem chama roda dentro dele (R-I2.11-07 do ADR-0003 §8).
- **Mesmo nome, duas coisas:** `under_review` é estado documental ("Em análise", §6.4) e também status da oferta (§6.2, D10).

### A.3. Precedência (§6.4)

1. `under_review`
2. `with_findings`
3. `pending`
4. `no_findings_in_sources`
5. `declared_unverified`
6. `not_checked`

- **Onde já está:** no banco (`private.precedencia_documental`) e no servidor (`PRECEDENCIA`, `src/modules/documental/rules/estados.ts`), na mesma ordem.
- **Caráter provisório:** a §6.4 chama a tabela e a precedência de "regra proposta desta versão", a ser validada no piloto.

**Exemplos da tabela em que duas regras valem ao mesmo tempo:**
- **Linha 17 (`nko` × `cho`):** valem R4b e R5a, e `under_review` vence `with_findings`.
- **Linha 23 (`dho` × `aw`):** valem R5b e R3, e `with_findings` vence `pending`.
- **Linha 13 (`nko` × `aw`):** valem R3 e R2\*, e `pending` vence `declared_unverified`.
- **Linha 6 (`—` × `nos`, com revisão):** vale R4a; a R6 cai pela própria condição.
- **Linha 25 (`dho` × `nos`):** valem R4b, R5b e R6, e o resultado é `under_review` (ou `with_findings` sem divergência), nunca `no_findings_in_sources`.
- **Linha 31 (`unk` × `—`):** pela letra, valeriam R1 e R2, e `declared_unverified` venceria. A B29 tira o `unk` da R2, e o resultado é `not_checked`.

### A.4. Origens (§6.5)

| # | Origem (rótulo em `estados.ts`) | De onde vem | Condição exata | O que a tela mostra | Base | Lacuna |
|---|---|---|---|---|---|---|
| 1 | Declarada pelo fornecedor | `supplier_declarations` | há declaração vigente na categoria, inclusive "desconhece" (como na I2.5) | valor declarado, detalhe e data | §6.5 item 1; §5.3 | — |
| 2 | Documento anexado | `offer_documents` | documento da oferta que trata da categoria; a tabela não tem categoria | tipo, descrição e data. O arquivo fica oculto ao comprador (`hidden`) até a D5 | §6.5 item 2; §5.2; §7.3 | E9 |
| 3 | Resultado de consulta | `vehicle_checks` vigente | consulta vigente na categoria que não cumpre a condição da origem 4 | fonte (`source_name`, `source_type`), data (`performed_at`), resultado, resumo e limitações. Ao comprador, o que a §7.3 lista | §6.5 item 3; §6.3; §6.4 ("Exibição"); §7.3 | E13, E35 |
| 4a | Confirmada por evidência independente: consulta | `vehicle_checks` | pela letra, "consulta de fonte oficial com evidência anexada": `source_type = official` com `evidence_document_id`. Não está definido quem confere a evidência nem onde isso fica registrado | o mesmo da origem 3, com a indicação da evidência; o arquivo fica oculto até a D5 | §6.5 item 4; §5.3 | E10 |
| 4b | Confirmada por evidência independente: documento | `offer_documents`, mais uma conferência | "documento oficial conferido pela plataforma". Não estão definidos quem confere, onde fica o registro (não há coluna nem tabela na §5) nem quais tipos de documento contam como oficiais | não definido | §6.5 item 4; §3.1 | E11 |
| 5 | Não confirmada | — | nenhuma das anteriores na categoria | o rótulo | §6.5 item 5 | E12 |

**"A interface nunca funde origens diferentes num mesmo rótulo" (§6.5):**
- cada informação mostra a sua própria origem. Declaração e consulta da mesma categoria são duas informações (linhas 13 a 40 da A.2);
- o rótulo do estado (§6.4) não é rótulo de origem;
- não existe rótulo combinado, como "declarado e consultado";
- o resumo proporcional conta estados, não origens (§6.4; `estados.ts`);
- o critério 6 da §10 também pede isso: "O sistema distingue declarações, anexos e resultados de consulta".

### A.5. Linguagem proibida (§6.6)

| Termo citado na §6.6 | Está em `config/linguagem-proibida.json` | Variantes buscadas |
|---|---|---|
| "verificado" | sim | 4 flexões |
| "aprovado" | sim | 4 flexões |
| "certificado" | sim | 4 flexões |
| "garantido" | sim | 4 flexões |
| "procedência garantida" | sim | 2 |
| "livre de problemas" | sim | 4, inclusive "problema" no singular |
| "nada consta" | sim | também com hífen |
| "sem ocorrências" (diagnóstico §5.3, para sinistro e leilão) | não | — |

- **Qualificação:**
  - a §6.6 pede "nas fontes consultadas, em [data]";
  - a configuração aceita "nas fontes consultadas", sem a data.
- **Marcador `linguagem-permitida:` seguido de motivo:** está na configuração e no `CLAUDE.md`, não na §6.6.
- **Alcance:**
  - a §6.6 vale para "interface, notificações e guias", "para o veículo ou a oferta", e cita "termos como", ou seja, a lista não é fechada;
  - o varredor recusa todo uso, com qualquer sujeito, salvo com o marcador. Isso é mais estrito que a §6.6.

**O que o teste cobre** (`tests/linguagem-proibida.test.ts`; `src/lib/linguagem-proibida.ts`):
- arquivos `.ts`, `.tsx`, `.md` e `.json` em `src/` e `config/`, menos a própria lista e o teste do varredor;
- busca sem diferenciar maiúsculas nem acentos, por palavra inteira, aceitando espaços repetidos e as flexões da lista;
- a linha que tem a qualificação ou o marcador com motivo não conta.

**O que o teste não cobre:**
- **Modelos de e-mail do Auth:** os quatro arquivos de `supabase/templates/` são `.html` e ficam fora das pastas e das extensões. Hoje nenhum traz termo da lista (busca feita nesta extração); o ponto já estava registrado no `current-task.md` (levantamento do pacote da D5).
- **Notificações:** o módulo ainda não existe (Inc. 5, I5.7). Se os modelos não forem `.ts` ou `.tsx` dentro de `src/`, ficam de fora.
- **Guias (§6.14):** são do pós-piloto e não têm local definido.
- **Outras pastas:** `docs/`, `public/` e as migrações SQL, inclusive mensagens de erro que chegam à tela.
- **Texto gravado na hora do uso:** `result_summary`, `known_limitations`, `detail`, `description`, motivos e textos de `platform_settings` (E28).
- **A data:** o varredor aceita a qualificação sem data (E26).
- **Linha inteira:** a qualificação libera todos os termos da mesma linha, mesmo os que não têm relação com ela.

### A.6. Chaves de dado pessoal em `details` (§5.3 e §6.3)

**A trava do código a portar:**
- **Forma:** um CHECK com nome próprio na tabela de consultas. Ele olha a coluna jsonb do resultado e, numa segunda versão, todas as colunas jsonb da linha juntas.
- **Lista:** 17 chaves fixas, acrescentadas em duas etapas:
  - o proprietário (como objeto) e o nome do proprietário atual e do anterior;
  - CPF, e CPF ou CNPJ;
  - documento e nome do financiado, e CPF ou CNPJ do financiado;
  - dois campos do arrendatário;
  - e-mail e celular;
  - nome ou razão social do dono;
  - identificação do faturado;
  - código de segurança do CRV;
  - as chaves genéricas "nome" e "documento".
- **Origem dos nomes:** as chaves seguem os nomes de campo do provedor daquele projeto.
- **Fica de fora de propósito:** chassi, motor e RENAVAM ("são do veículo") e o CNPJ de faturamento ("de empresa").
- **Como compara:**
  - o jsonb vira texto, e a chave inteira entre aspas, seguida de dois-pontos, é comparada à lista sem diferenciar maiúsculas;
  - por isso pega a chave em qualquer nível, dentro de objetos e de listas;
  - escape Unicode na chave não passa, porque o jsonb guarda a chave já decodificada;
  - texto dentro de um valor não gera falso positivo;
  - a comparação não trata acento, chave composta que contém o identificador, outro idioma, nem dado pessoal guardado no valor de uma chave neutra (E29, E31).
- **Duas camadas:** o servidor monta o jsonb por lista positiva e nunca grava a resposta crua do provedor; o CHECK é a segunda trava.
- **Testes do código de origem:** cada chave proibida, aninhada em objeto ou em lista, é recusada pela restrição certa, conferida pelo nome.

**O que a especificação exige além disso:**
- **No dado, não só na chave:** "Dados pessoais do proprietário não são gravados em `details`" (§6.3). O banco recusa "as chaves conhecidas", mas a especificação não diz quais são (E29).
- **Placa, RENAVAM e chassi:** ligados a proprietário pessoa física, são dado pessoal (§7.2). O código de origem aceita esses campos (E30).
- **Em qualquer lugar:** "Dados do proprietário retornados por uma fonte não são gravados" (§7.2). Isso inclui `result_summary`, `known_limitations`, `protocol` e o arquivo de evidência (E31). Retenção e base legal se definem com o jurídico antes do piloto (§7.2).
- **Auditoria:** sem dado pessoal desnecessário (§5.6). A `metadata` da auditoria da consulta não leva `details`.
- **Todos os caminhos:** a recusa é do banco (§5.3), então vale também para `service_role` e `postgres`. Um CHECK vale para todo papel.

**Casos sugeridos** (fora dos testes 7, 10 e 11):
- chave proibida no primeiro nível, aninhada em objeto e dentro de lista, em maiúsculas: recusada pela restrição nomeada;
- o mesmo pela `service_role`;
- contraste: `details` com chaves neutras é aceito;
- acento, chave composta e valor com dado pessoal seguem o que a E29 e a E31 decidirem.

### A.7. Impedimento de transferência (§6.11, D9)

- **De onde nasce:**
  - "quando uma consulta ou declaração indica condição que impede a transferência ao comprador profissional, o sistema registra o impedimento" (§6.11);
  - a linha guarda `source_check_id` ou `source_declaration_id` e o `basis` (§5.3);
  - exemplo da especificação: dano de média ou grande monta não regularizado (Res. CONTRAN 810/2020, art. 14);
  - o diagnóstico (§5.3) diz que isso "não é pendência documental, é impedimento de transferência", resolvido pela regularização do art. 7º.
- **Categorias:**
  - a §5.3 tem `transfer_conditions` ("condições que afetam ou impedem a transferência") e `casualty`;
  - não está dito quais categorias geram impedimento, nem com qual critério (E20).
- **Estados:**
  - `identified` (ativo) e `resolved`, com `resolution_evidence_id` (§5.3);
  - a tabela não é marcada como só inclusão (E22).
- **Efeito na publicação, com a D9 decidida:**
  - impedimento ativo não publica; a oferta não sai de `draft` para `published`, e o fornecedor vê o motivo (§6.11; plano, Inc. 3);
  - o ADR-0003 §2.4 já confere isso em toda entrada em `published`, vinda de `draft` ou de `under_review`, e no envio à revisão (B27);
  - no código, o motivo entra nas pendências como `transfer_impediment`, e `private.tem_impedimento_ativo` ainda devolve `false`;
  - pendência documental continua sem bloquear (§1.4; §6.2).
- **Aviso separado:**
  - o impedimento tem "aviso próprio, separado das pendências documentais" (§6.11);
  - não é estado da §6.4 (E24);
  - é campo material (§6.7) e tem seção no snapshot (ADR-0003 §2.6). Registrar ou resolver um impedimento gera versão nova e deixa a ciência do comprador desatualizada.
- **Em aberto:**
  - E20: quem registra, e a partir de quê;
  - E21: quem resolve e com qual evidência; a §8 também não tem operação para isso;
  - E22: se a tabela é só de inclusão;
  - E23: impedimento que aparece depois da publicação, e a T09;
  - E24: se o impedimento entra no cálculo do estado.

### A.8. Casos de teste dos testes 7, 10 e 11 (§7.4)

**Preparo:**
- **Elenco do ADR-0003 A.6:**
  - empresas F e G (`supplier`), C (`buyer`) e A (`both`);
  - f1 (`org_admin` de F), f2 (`member` de F), g1, c1 e a1;
  - O, operador sem vínculo com empresa; X, administrador.
- **Acréscimos:**
  - T, empresa `supplier` com `is_test = true`, e t1, `org_admin` de T;
  - ofertas R (de F, em `draft`), P (de F, em `published`) e PT (de T, em `draft`, com `is_test` herdado da empresa, B26).
- **Dados de referência:**
  - categoria de referência: `auction`;
  - declaração `nko` em todas as categorias, salvo indicação.
- **Convenções do ADR-0003 A.6:**
  - "recusado" quer dizer erro ou 0 linhas, e o teste confere que linha, estado e versão não mudaram;
  - cada mutação afrouxa uma camada só;
  - todo negativo tem contraste;
  - a restrição que recusou é conferida pelo nome.

**Teste 7: consulta `is_test` não se liga a oferta real**

| ID | Quem | Tenta | Esperado |
|---|---|---|---|
| CT7.1 | O | INSERT direto em `vehicle_checks` com `is_test = true` em P | recusado pelo banco; nenhuma linha |
| CT7.2 | f1 | `recordCheck` em P com `is_test = true` no payload | recusado pelo servidor e pelo banco, conferidos em separado (E15) |
| CT7.3 | X | o mesmo do CT7.1, em R, que está em rascunho | recusado, em qualquer estado da oferta |
| CT7.4 | O | consulta real (`is_test = false`) em PT | recusada se a E15 valer nos dois sentidos; senão, vira contraste |
| CT7.5 | O | consulta em P com `supersedes_check_id` de uma consulta de PT, e o inverso | recusado (E3) |
| CT7.6 | O | consulta com `offer_id` de PT e `vehicle_id` do veículo de P | recusado (E34) |
| CT7.7 | O | consulta em P com `evidence_document_id` de documento de PT ou de outra oferta | recusado |
| CT7.8 | O | impedimento em P com `source_check_id` de consulta de PT | recusado (E20) |
| CT7.9 | X | UPDATE de `offers.is_test` com consultas ligadas, em PT e em P | recusado (B26; gatilho `proteger_oferta`) |
| CT7.10 | X, `service_role`, `postgres` | UPDATE de `vehicle_checks.is_test` | recusado (só inclusão) |
| CT7.11 | — | estado e versões de P depois das tentativas acima | inalterados; nenhum `no_findings_in_sources` em P vindo de PT |

- **Contraste:**
  - t1 ou O grava em PT uma consulta de teste: aceita, com estado e versão novos em PT;
  - O grava uma consulta real em P: aceita.
- **Mutações:**
  - tirar a restrição de `is_test` derruba os CT7.1 a CT7.3;
  - tirar a conferência do servidor derruba o CT7.2 só na camada do servidor;
  - tirar a regra de mesma oferta derruba os CT7.5 a CT7.8;
  - liberar o `is_test` da oferta derruba o CT7.9.

**Teste 10: `no_findings_in_sources` não existe sem consulta registrada**

| ID | Quem | Situação ou tentativa | Esperado |
|---|---|---|---|
| CT10.1 | f1 | P com `nko` em todas as categorias e sem consulta | nenhuma categoria em `no_findings_in_sources`; estado `declared_unverified` (linha 11) |
| CT10.2 | f1 | `unk` sem consulta | `not_checked` (linha 31) |
| CT10.3 | f1 | R sem declaração e sem consulta | `not_checked` (linha 1) |
| CT10.4 | f1 | `nko` com certidão e relatório de consulta anexados em `offer_documents`, sem consulta | não chega a `no_findings_in_sources` (E9) |
| CT10.5 | f1 e O | gravar o estado: `state` no payload, UPDATE do snapshot, INSERT em `offer_versions`, chamada direta ao `private` | recusado; nenhuma tabela guarda o estado (§6.4) |
| CT10.6 | O | consulta `nos` substituída por uma `aw` | `pending`, e não `no_findings_in_sources` (E1 a E3) |
| CT10.7 | O | consulta `nos` vigente com revisão aberta, depois fechada | `under_review` (linha 16) e, depois, `no_findings_in_sources` (linha 15) |
| CT10.8 | O | `dho` com consulta `nos` | nunca `no_findings_in_sources` (linha 25) |
| CT10.9 | O | consulta `nos` sem `source_name`, sem `performed_at` ou sem `known_limitations` | recusada; estado inalterado |
| CT10.10 | g1 | consulta `nos` em P, pela API e pelo servidor | recusada (teste 2); estado inalterado |
| CT10.11 | — | snapshot de cada versão de P e resumo proporcional | `no_findings_in_sources` só nas versões com consulta `nos` vigente, mostrado com fonte e data (§6.4) |

- **Contraste:** O grava em P uma consulta `nos` com fonte, data e limitações. O estado vira `no_findings_in_sources`, com versão nova e fonte e data na tela.
- **Mutações:**
  - levar `nko` direto a `no_findings_in_sources` derruba o CT10.1;
  - contar documento como consulta derruba o CT10.4;
  - ignorar a substituição derruba o CT10.6;
  - ignorar a revisão na R6 derruba o CT10.7;
  - ignorar a divergência derruba o CT10.8, conforme a E4;
  - tirar a obrigação de `known_limitations` derruba o CT10.9.

**Teste 11: registros só de inclusão** (a numeração continua a do ADR-0003, que vai até o CT11.7)

| ID | Quem | Tenta | Esperado |
|---|---|---|---|
| CT11.8 | f1, que registrou a consulta | UPDATE de `result`, `details`, `known_limitations`, `is_test`, `supersedes_check_id` ou `evidence_document_id` | recusado; linha intacta |
| CT11.9 | f1, O e X | DELETE em `vehicle_checks` | recusado |
| CT11.10 | `service_role` e `postgres` | UPDATE, DELETE e TRUNCATE em `vehicle_checks` e `documental_reviews` | recusado pelo gatilho de só inclusão, com a mensagem exata |
| CT11.11 | O e X | UPDATE de `action` ou `reason` em `documental_reviews`; DELETE | recusado; fechar uma revisão é linha nova |
| CT11.12 | f1 e X | DELETE de `offers` ou `vehicles` com linhas nas três tabelas | recusado, sem cascata; atualizar a lista do CT11.5 (ADR-0003 §3) |
| CT11.13 | f1 e O | ler a consulta substituída | continua legível e intacta (§6.3) |
| CT11.14 | O, X e `service_role` | em `transfer_impediments`: UPDATE de `offer_id`, `basis` ou `source_*`; DELETE; volta de `resolved` para `identified` | recusado; a passagem para `resolved` segue a E22 |
| CT11.15 | f1 | alterar `field_history` ou `audit_logs` das operações documentais | recusado (I0.6) |

- **Contraste:**
  - a consulta nova com `supersedes_check_id` vira a vigente, e a anterior fica;
  - reabrir uma revisão é uma linha nova.
- **Mutações:**
  - desligar o gatilho de só inclusão derruba os CT11.8 a CT11.11;
  - pôr cascata derruba o CT11.12.

### A.9. Ambiguidades

As sugestões são as leituras mais conservadoras; nenhuma é decisão.

| ID | Tema | O que falta decidir | Leitura conservadora | Base |
|---|---|---|---|---|
| E1 | Consulta vigente | Se vale a mais recente ou toda consulta não substituída; a ordem (data da consulta ou do registro); consultas de fontes diferentes na mesma categoria | Todas as não substituídas são vigentes; cada uma entra como candidata; `no_findings_in_sources` só se todas forem `nos` | §5.3; §6.3; §6.4 |
| E2 | "Existe consulta" na R3 | A R3 não diz "vigente", e a R5 e a R6 dizem | Só a vigente conta; pela letra, `pending` nunca acabaria depois de qualquer `aw` (leitura sugerida, não literal) | §6.3; §6.4 |
| E3 | `supersedes_check_id` | Mesma oferta, categoria e `is_test`; um único sucessor; quem pode substituir consulta de outro autor | Exigir mesma oferta, categoria e `is_test`; apontar para consulta anterior e ainda vigente; um sucessor só; o F não substitui consulta registrada pela plataforma | §5.3; §6.3 |
| E4 | Divergência `dho` × `nos` | Se conta como divergência | Contar (`under_review`), como diz a letra | §6.4 |
| E5 | `unk` com resultado conclusivo | Se "desconhece" diverge de um resultado | Não diverge, porque "desconhece" não afirma nada | §6.4 |
| E6 | Divergência no detalhe ou com documento | A §5.3 cita documento no motivo da revisão, e a R4b só fala de declaração e consulta | Automática só pelo valor; detalhe e documento entram por revisão aberta pelo staff | §5.3; §6.4 |
| E7 | Fechar revisão com divergência ativa | A R4b continua valendo | Pela letra, continua `under_review` até chegar declaração ou consulta nova | §6.4 |
| E8 | Abertura e fechamento em `documental_reviews` | Pareamento, fechar sem abrir, abrir duas vezes, motivo no fechamento | Aberta = a última ação da (oferta, categoria) é `open_review`; recusar fechar sem abrir e abrir de novo; motivo obrigatório nas duas | §5.3 |
| E9 | Documento que "confirma" | Não há categoria em `offer_documents` nem estado de destino | O documento não muda o estado (fica `declared_unverified`), aparece como O2 à parte e nunca leva a `no_findings_in_sources` | §5.2; §6.4; §6.5 |
| E10 | Origem 4a | Quem marca `official`; se "independente" exclui consulta registrada pelo próprio fornecedor; quem confere e onde fica | O4 só com fonte oficial, evidência e conferência registrada por staff sem vínculo com a dona (B25); senão, O3 | §5.3; §6.5 |
| E11 | Origem 4b | Quem confere, onde fica o registro, quais tipos contam como oficiais | Até definir, nenhum documento chega a O4; fica O2 | §3.1; §5; §6.5 |
| E12 | Origem com revisão aberta, e origem do estado | A revisão não é uma das cinco origens | O estado aparece com a lista das informações, cada uma com a sua origem; a revisão aparece como fato, sem rótulo de origem 1 a 4; categoria sem nenhuma informação mostra O5 | §6.4; §6.5 |
| E13 | Origem de `aw` e `inc` | Registro de consulta que ainda não tem resultado | O3 com o resultado escrito por extenso; O4 só com `nos` ou `cho` | §6.5 |
| E14 | `no_findings_in_sources` sem evidência | O critério 11 da §10 fala em "estado de verificação sem evidência", e a §6.3 aceita consulta sem evidência ("quando existir") | Mais conservadora: exigir evidência; sem ela, `pending` ("Pendente ou incompleto"). Literal: não exigir e mostrar "sem evidência anexada" | §6.3; §6.4; §10, critério 11 |
| E15 | `is_test` da consulta | Quem define o valor; se a regra vale também para consulta real em oferta de teste | Copiar da oferta e exigir igualdade nos dois sentidos; o payload não leva `is_test` | §6.3; §7.4, teste 7 |
| E16 | Autoria da consulta | `org_admin` ou `member`; o que é "que realizou"; `performed_by` como perfil ou como terceiro | Divisão da Q2: o `member` registra no rascunho, e o F-adm na oferta publicada ou reservada; `recorded_by` pela sessão; consulta feita por terceiro, decidir | §3.2; §3.3; §5.3; ADR-0003 Q2 |
| E17 | Estado da oferta no registro | Em quais estados se registra consulta, revisão e impedimento | O F segue a tabela de edição do ADR-0003 §2.5; o staff registra em `draft`, `under_review`, `published` e `reserved`; nos outros estados, decidir | §3.3; ADR-0003 §2.5 |
| E18 | Evidência enviada pelo staff | A §3.3 dá "registrar evidência" ao staff, e a Q3 do ADR-0003 impede o staff de enviar documento | Decidir antes da I3.5; nunca enviar pela chave secreta sem ator | §3.3; §8 `recordCheck`; ADR-0003 §2.13 |
| E19 | Autores da revisão | OP e AD; se o F participa; conflito de interesse | Só OP e AD sem vínculo com a dona (B25); o F vê a revisão e o motivo | §3.1; §9; ADR-0003 B25 |
| E20 | Registro do impedimento | O que o "sistema" registra, por qual sinal; categorias; uma fonte ou duas; `basis` livre ou lista fechada | Registro explícito pelo staff, ligado a exatamente uma consulta ou declaração da mesma oferta, com `basis` de lista fechada mais texto; sem inferir de texto livre. Alternativa para a pessoa responsável: ocorrência em `transfer_conditions` gera o impedimento | §5.3; §6.11 |
| E21 | Resolução do impedimento | Quem resolve; se a evidência é obrigatória; se reabre; não há operação na §8 | Só o administrador, como na reativação (ADR-0003 §2.10); `resolution_evidence_id` obrigatório e da mesma oferta; impedimento novo é linha nova | §5.3; §8 |
| E22 | `transfer_impediments` só de inclusão? | A §5.3 não marca, e o status muda | Imutável, salvo a passagem de `identified` para `resolved` com evidência, ou a resolução como linha nova; nunca DELETE | §5.3; §7.4, teste 11 |
| E23 | Impedimento depois da publicação | O que acontece com oferta `published` ou `reserved`; T09; negociações abertas | Barrar a T09 (`reserved` → `published`); na oferta publicada, aviso e versão nova na hora; manter, retirar ou suspender fica para a pessoa responsável (a D9 diz "só publica") | §6.11; D9; ADR-0003 B27 |
| E24 | Impedimento no estado | O comentário da migração da I2.5 prevê impedimento como candidato, e a §6.4 não o cita | Fica fora do cálculo do estado, com aviso próprio | §6.4; §6.11; migração `20261029160000` |
| E25 | Lista não fechada ("termos como") | "sem ocorrências" (diagnóstico); a frase "100% liberado" da D9; sinônimos | Incluir "sem ocorrências"; não usar "100% liberado" em tela; outros termos com a pessoa responsável | §6.6; diagnóstico §5.3 |
| E26 | Data na qualificação | O teste não exige o "em [data]" | Exigir ", em \<data\>" na mesma linha nos textos fixos; nos rótulos dinâmicos, a data da consulta sempre ao lado | §6.6; §6.4 |
| E27 | Alcance da varredura | Modelos HTML do Auth, notificações, guias, mensagens do banco | Varrer todo texto que chega ao usuário, onde ele estiver | §6.6; gate 5 do plano |
| E28 | Texto livre gravado na hora do uso | Resumo, limitações, detalhe e motivos podem trazer a expressão "nada consta" da lista da §6.6, que costuma vir nas certidões | Conferir na gravação, no servidor e no banco, e recusar termo da lista sem a qualificação | §6.6; §7.3 |
| E29 | Lista e forma de comparação das chaves | Quais são as chaves "conhecidas"; acento, chave composta, aninhamento; se a lista fica em migração ou em configuração | A lista portada mais identificadores genéricos do proprietário; sem maiúsculas nem acento, em qualquer nível; recusar também chave composta que contenha um identificador. Um CHECK não lê tabela (inventário da I2.1, P1) | §5.3; §6.3 |
| E30 | Placa, RENAVAM e chassi em `details` | O código de origem aceita, e a §7.2 os trata como dado pessoal | Recusar em `details`; esses dados ficam só em `vehicles` | §5.2; §6.3; §7.2 |
| E31 | Dado pessoal fora de `details` | Em valores, em colunas de texto e no arquivo de evidência | Lista positiva de chaves no servidor; orientação na tela para os textos livres; evidência com dado do proprietário fica com o jurídico (D5) | §7.2; §13 D5 |
| E32 | O que da consulta é material | Só o estado, ou também fonte, data, limitações e resumo; o que são "apontamentos" | Tudo o que o comprador vê da consulta entra no snapshot | §5.2; §6.7 |
| E33 | Ressalvas novas | Códigos para `pending`, `under_review`, `no_findings_in_sources` e impedimento | Códigos `.v1` novos, com texto provisório até a D5 e teste de linguagem | §5.2; §6.11; §13 D5 |
| E34 | Integridade da consulta | `vehicle_id` × `offer_id`; categoria na configuração; `method = integration` antes da C7; `performed_at` no futuro | `offer_id` obrigatório, e `vehicle_id` igual ao veículo da oferta; categoria presente em `document_categories`; só `manual` até a C7; data da consulta não futura | §5.3; §6.3; §13 C7 |
| E35 | O que o comprador vê da consulta | `details`, `protocol`, autores e evidência | Só o que a §7.3 lista; o resto fica oculto até a D5 (Inc. 4) | §7.3; §13 D5 |

**Dependências:**
- **Da §13:** D5 (E31, E33 e E35); D9 (E20 a E23: o efeito já está decidido, a mecânica não); C7 (E34).
- **De respostas do ADR-0003:** E16 (Q2), E18 (Q3), E19 (B25) e E23 (B27).

### A.10. Código a portar (resumo)

São os padrões da seção 4 do plano que servem ao Inc. 3. As referências com arquivo e linha ficam em `notas-privadas/`.

| Padrão | Uso no Inc. 3 | Não portar |
|---|---|---|
| Registro de consulta só de inclusão: `authenticated` com SELECT e INSERT; consulta nova é linha nova; a tela abre a mais recente | `vehicle_checks`, com o gatilho de só inclusão do I0.6, que barra também `service_role` e `postgres` | escrita pela chave de serviço; modelo de empresa única |
| Trava de dado pessoal em duas camadas: lista positiva no servidor e CHECK de chaves no banco | `details` (A.6) | lista de chaves de um único provedor, sem revisão (E29) |
| Carimbo: gatilho BEFORE INSERT grava autor e hora da sessão, qualquer que seja o valor enviado | `recorded_by` e data do registro (E16) | aceitar o valor informado quando não há sessão |
| Chave estrangeira composta: o registro só aponta para outro do mesmo veículo, da mesma empresa e do mesmo lado da marca de teste | `supersedes_check_id`, `evidence_document_id`, `source_check_id` e `is_test` (teste 7; E3, E15) | modo de teste de provedor que devolve dados de exemplo (§1.4: nunca simular) |
| Gatilho que confere a linha de origem antes de aceitar o reaproveitamento: mesmo item, não posterior, mesmo conteúdo | conferência do `supersedes_check_id` | prazo e custo do reaproveitamento, que não estão na §5.3 |
| Restrições com nome próprio, uma causa por restrição, e teste que confere o nome da que recusou | CHECKs de `vehicle_checks` | autoconferência dentro da migração; o projeto usa pgTAP |
| Data solta de "histórico consultado" na ficha do vendedor | — | não vira consulta; consulta é sempre linha em `vehicle_checks` (inventário da I2.1, P4) |
| Cliente do provedor de consulta | — | só depois da C7, com contrato próprio (§6.3; §13) |
