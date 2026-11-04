# Roteiro da revisão externa da I3.8 (Inc. 3, domínio documental)

**Para:** o revisor externo (Antigravity, AG), fora do Claude Code.
**Preparado por:** T2, em 30/10/2026.
**Revisões do roteiro:**
- 04/11: links, critérios verificáveis, lista de conferência, severidades, dados pessoais e acesso;
- 04/11: correções apontadas pela revisão prévia (ADR-0004 §9).

**Base:** plano orquestrado, I3.8; ADR-0004 (decisões, respostas P1 a P4, ressalvas da §8 e revisão prévia da §9); especificação v1.1, §6.3 a §6.6, §6.11 e §7.2.

**Revisão prévia:**
- Antes desta revisão, uma sessão nova do mesmo modelo do T2 leu o código e os testes. Os achados dela (R-AG-01 a R-AG-13) foram corrigidos na I3.10 ou registrados, no ADR-0004 §9.
- Esta revisão continua necessária: é o olhar externo que o plano pede.
- Numere os achados desta revisão como R-I3.8-NN.

## O que revisar

O Inc. 3 completa o estado documental da oferta: consultas registradas à mão (`vehicle_checks`), revisões documentais (`documental_reviews`), impedimentos de transferência (`transfer_impediments`) e evidências das consultas (`check_evidence_files`, bucket privado `check-evidence`).

Rótulos usados nas telas (`src/modules/documental/rules/estados.ts`):
- **estado da categoria (§6.4):** "Não consultado", "Informação declarada, sem comprovação", "Pendente ou incompleto", "Em análise", "Com apontamentos", "Sem apontamentos nas fontes consultadas";
- **resultado da consulta:** "Aguardando resultado", "Sem ocorrência na fonte", "Com ocorrência na fonte", "Inconclusivo";
- **valor declarado:** "Não conhece ocorrência", "Há ocorrência", "Desconhece";
- **origem (§6.5):** "Declarada pelo fornecedor", "Documento anexado", "Resultado de consulta", "Confirmada por evidência independente", "Não confirmada".

Telas, na área do fornecedor (`/empresa/[empresaId]/ofertas/[ofertaId]`):
- **resumo,** com a ficha documental e a seção Situação: a própria rota;
- **etapa "6. Consultas":** `/consultas`;
- **declarações:** `/declaracoes`;
- **histórico:** `/historico`.

Na área administrativa, a tela é o detalhe da oferta (`/admin/ofertas/[ofertaId]`).

## Lista de conferência

Preencha a coluna "Situação" com "conforme", "achado R-I3.8-NN" ou "não verificado (motivo)".

| # | Ponto | Critério verificável | Onde conferir | Evidência esperada | Situação |
|---|---|---|---|---|---|
| 1 | **Consulta pendente** | Uma consulta vigente com "Aguardando resultado" ou "Inconclusivo" deixa a categoria em "Pendente ou incompleto", salvo ocorrência ou revisão aberta, que têm precedência (ADR-0004 §2.2). O resultado aparece por extenso ao lado. Uma consulta nova marcada como substituta da anterior ("Esta consulta substitui") passa a valer, e a antiga continua visível, marcada como substituída. Sem a marca, as duas ficam vigentes (E1). | ficha do resumo e do detalhe administrativo; etapa Consultas | pgTAP `410` (linhas da tabela de decisão), `420`; e2e `documental.spec.mts` | |
| 2 | **Apontamento** | Fora da divergência do ponto 3 e sem revisão aberta, "Há ocorrência" declarada ou consulta "Com ocorrência na fonte" deixam a categoria em "Com apontamentos". Cada informação mostra a própria origem, e nenhum rótulo junta duas origens. | ficha | pgTAP `410`; teste unitário `ficha.test.ts` | |
| 3 | **Divergência** | "Não conhece ocorrência" declarada com consulta "Com ocorrência na fonte" vira "Em análise", e a ficha diz a causa e o que resolve: declaração nova ou consulta nova. "Há ocorrência" declarada com consulta "Sem ocorrência na fonte" fica em "Com apontamentos" (decisão P1). Revisão documental aberta também vira "Em análise". Fechar a revisão não desfaz a divergência (E7). | ficha; ações documentais da equipe | pgTAP `410` (linha 25 e casos de revisão); ADR-0004 §2.4 | |
| 4 | **Alteração posterior** | Consulta nova, abertura e fechamento de revisão e impedimento geram versão nova da oferta. O registro anterior continua legível e não muda: consultas, evidências e revisões são só de inclusão, e reabrir uma revisão é linha nova. O impedimento só passa, uma vez, a resolvido. Nada se apaga. | histórico (versões); ficha (substituídas e revisões); seção Situação do resumo (impedimentos resolvidos) | pgTAP `400`, `420` e `430` (só inclusão e versão nova nas três ações); integração `documental-operacoes.test.ts` | |
| 5 | **Falso estado de verificação** | "Sem apontamentos nas fontes consultadas" só existe com consulta registrada e, na ficha, sempre com a fonte e a data ao lado. O resumo proporcional e a ressalva remetem à ficha para fonte e data (R-I3.7-12). Nenhum texto afirma verificação ou garantia sem "nas fontes consultadas" na mesma frase (§6.6). Isso vale para as telas e para o texto livre (resumo, limitações, motivos, detalhe da declaração, condições comerciais e descrição do documento), conferido no servidor e no banco, sem exceção por marcador. Consulta de teste nunca se liga a oferta real. | ficha; formulários de consulta, revisão, impedimento, declaração e oferta | pgTAP `420` (testes 7 e 10) e `430`; testes `linguagem-proibida.test.ts` | |
| 6 | **Rastreabilidade** | Cada consulta guarda quem consultou, quem registrou, quando, a fonte, as limitações e, se houver, a evidência. A evidência só abre por URL temporária gerada pelo servidor, e cada abertura fica em `restricted_access_logs`. | ficha do fornecedor e da equipe | pgTAP `400` e `430` (bucket sem leitura direta); integração `documental-operacoes.test.ts` | |
| 7 | **Dados pessoais (§7.2)** | `details` da consulta não aceita chave de dado pessoal (CPF, nome, endereço, placa, titular, WhatsApp e similares) e não é gravável pela API. O texto livre recusa CPF, número de 11 dígitos, telefone, placa e chassi, no servidor e no banco. A evidência é arquivo oculto do comprador até a D5. Protocolo, autores e evidências não aparecem para quem não é da empresa dona nem da equipe. | código e testes; formulários | pgTAP `400` e `430` (trava de chaves e texto livre); ADR-0004 §2.10, §2.14 e §9 | |
| 8 | **Impedimento (§6.11, D9)** | Ocorrência em "Condições de transferência", declarada ou consultada, gera o impedimento sozinha (P3). Com impedimento ativo, a oferta não publica, sai do catálogo (P4) e não é reservada (T08), e a tela não oferece "Reservar". Só o administrador resolve, com motivo e evidência. Em "Sinistro e danos relevantes", a tela orienta a declarar o dano de média ou grande monta também em "Condições de transferência", e a revisão da equipe confere esse caso. | ficha; declarações; etapa Consultas; detalhe administrativo | pgTAP `400`, `420` e `430`; e2e `documental.spec.mts`; ADR-0004 §2.11 | |
| 9 | **Origem e evidência** | "Confirmada por evidência independente" exige fonte oficial, evidência e registro pela equipe sem vínculo com a empresa dona (E10); do contrário, a consulta fica em "Resultado de consulta". "Sem apontamentos nas fontes consultadas" não exige evidência, e a tela mostra "sem evidência anexada" (P2). Documento anexado não muda o estado da categoria (E9). | ficha | pgTAP `410`; teste unitário `ficha.test.ts`; ADR-0004 §2.6 a §2.8 | |

## Severidade dos achados

| Nível | Quando |
|---|---|
| **Crítico** | expõe dado restrito ou pessoal a quem não pode ver; permite ação sem permissão; mostra estado de verificação sem consulta registrada (sem evidência é permitido pela P2, com "sem evidência anexada" ao lado); contradiz decisão registrada (P1 a P4, D9) |
| **Alto** | estado documental errado num caso real da tabela de decisão; registro anterior alterável ou apagado; falha de rastreabilidade de quem registrou ou de quem abriu evidência |
| **Médio** | regra certa no banco, mas tela, texto ou mensagem que leva o usuário a erro; teste faltando para uma regra do Inc. 3 |
| **Baixo** | usabilidade e clareza de texto, sem efeito na regra |
| **Informativo** | observação ou sugestão para depois |

O critério do plano é "sem crítico aberto".

## Onde olhar

O repositório é público: https://github.com/85dyones/ideal-garbanzo.

- **Código do Inc. 3:**
  - https://github.com/85dyones/ideal-garbanzo/compare/89b330d...cd83dc4;
  - mais a correção da I3.10, descrita no ADR-0004 §9.
- **Migrações:**
  - [20261030120000_dominio_documental](https://github.com/85dyones/ideal-garbanzo/blob/main/supabase/migrations/20261030120000_dominio_documental.sql)
  - [20261030150000_linguagem_no_texto_livre](https://github.com/85dyones/ideal-garbanzo/blob/main/supabase/migrations/20261030150000_linguagem_no_texto_livre.sql)
  - [20261030180000_ressalvas_do_documental](https://github.com/85dyones/ideal-garbanzo/blob/main/supabase/migrations/20261030180000_ressalvas_do_documental.sql)
  - [20261030200000_decisoes_do_documental](https://github.com/85dyones/ideal-garbanzo/blob/main/supabase/migrations/20261030200000_decisoes_do_documental.sql)
  - [20261104090000_achados_da_revisao_previa](https://github.com/85dyones/ideal-garbanzo/blob/main/supabase/migrations/20261104090000_achados_da_revisao_previa.sql)
- **Servidor:** [src/modules/documental/](https://github.com/85dyones/ideal-garbanzo/tree/main/src/modules/documental)
- **Telas:**
  - [área do fornecedor](https://github.com/85dyones/ideal-garbanzo/tree/main/src/app/%28conta%29/empresa/%5BempresaId%5D/ofertas/%5BofertaId%5D)
  - [área administrativa](https://github.com/85dyones/ideal-garbanzo/tree/main/src/app/%28admin%29/admin/ofertas/%5BofertaId%5D)
- **Decisões e ressalvas:** [ADR-0004](https://github.com/85dyones/ideal-garbanzo/blob/main/docs/adr/0004-documental.md), §2, §6, §7, §8 e §9.
  - A §8 traz a revisão do T3, o que a I3.9 corrigiu e as decisões da pessoa responsável sobre a R-I3.7-07 e a R-I3.7-13.
  - A §9 traz a revisão prévia e o que a I3.10 corrigiu.
- **Já registrados, sem precisar voltar:** os achados visuais TV-08, TV-11, TV-13, TV-16, TV-18, TV-20 e TV-24, no [`current-task.md`](https://github.com/85dyones/ideal-garbanzo/blob/main/docs/workflow/current-task.md) (entradas da revisão visual da I3.6).
- **Fora da I3.10:** o envio direto de arquivos ao Storage (R-AG-06) é a I3.11. Até ela, arquivo acima de 4,5 MB falha no preview.
- **Evidência de testes:**
  - [pgTAP](https://github.com/85dyones/ideal-garbanzo/tree/main/supabase/tests/database), arquivos `400` a `430`;
  - [integração](https://github.com/85dyones/ideal-garbanzo/tree/main/tests/integration): `documental-operacoes.test.ts` e `estado-documental-paridade.test.ts`;
  - [e2e](https://github.com/85dyones/ideal-garbanzo/blob/main/tests/e2e/documental.spec.mts);
  - [mutações](https://github.com/85dyones/ideal-garbanzo/blob/main/supabase/tests/mutacoes/inc-3.md).

## Acesso ao ambiente de homologação

- **O ambiente:** o preview da Vercel da branch `main`, ligado ao projeto Supabase de desenvolvimento, que só tem dados de teste. Depois do `cd83dc4`, a `main` recebeu as correções da I3.10 no domínio documental e mudanças fora dele (convite de fornecedora, catálogo em preparação).
- **Autenticação:** o preview fica atrás da autenticação da Vercel, e sem acesso só aparece a tela de login da Vercel.
- **Como o acesso chega:**
  - a pessoa responsável entrega ao revisor, por canal privado (gerenciador de senhas ou mensagem direta), o endereço do preview, o acesso pela Vercel e as contas de teste;
  - nada disso vai para o repositório, para o relatório nem para capturas de tela.
- **Contas necessárias:**
  - um administrador de empresa fornecedora com uma oferta;
  - um membro comum da mesma fornecedora;
  - um administrador de outra empresa;
  - um operador da plataforma;
  - um administrador da plataforma.
- **Janela de revisão:**
  - o T2 e o revisor combinam um período sem reset do banco, sem testes de banco ou de integração e sem migração nova no projeto de desenvolvimento;
  - o reset apaga as contas e os arquivos, e os testes criam e mudam dados.
- **Dados:** use só textos e arquivos fictícios, nunca dado real.
- **Sem acesso ao preview:** a revisão fica no código, nos testes e nos documentos, e o relatório marca como "não verificado (sem acesso)" os critérios que dependem da tela.

## Fora do escopo

- O catálogo do comprador (Inc. 4) e o que ele vê da ficha.
- O texto jurídico (D5): os textos das telas são provisórios.
- A integração automática de consulta (C7).
- A conformidade jurídica completa com a LGPD, que fica com a D5. O ponto 7 cobre só o que o código grava e mostra.
- O envio de arquivos acima de 4,5 MB, que é a I3.11.

## Entrega esperada

- **Um relatório,** com:
  - o veredito ("sem crítico aberto" ou não);
  - a lista de conferência preenchida.
- **Achados numerados R-I3.8-NN,** cada um com:
  - a severidade da tabela acima;
  - a tela ou o arquivo e a linha;
  - o cenário concreto;
  - a correção sugerida.
- **Onde entregar:** o relatório vai à pessoa responsável, fora do repositório, que é público. Não ponha nele credenciais, endereço do preview nem dado real.
- **Conferência do T2:** o T2 confere cada achado antes de registrar no ADR-0004 e no `current-task.md`.
