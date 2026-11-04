# Roteiro da revisão externa da I3.8 (Inc. 3, domínio documental)

**Para:** o revisor externo (Antigravity, AG), fora do Claude Code.
**Preparado por:** T2, em 30/10/2026; revisto em 04/11/2026 com as sugestões da leitura prévia do roteiro (links, critérios verificáveis, lista de conferência, severidades, dados pessoais e acesso).
**Base:** plano orquestrado, I3.8; ADR-0004 (decisões, respostas P1 a P4 e ressalvas da §8); especificação v1.1, §6.3 a §6.6, §6.11 e §7.2.

## O que revisar

O Inc. 3 completa o estado documental da oferta: consultas registradas à mão (`vehicle_checks`), revisões documentais (`documental_reviews`), impedimentos de transferência (`transfer_impediments`) e evidências das consultas (`check_evidence_files`, bucket privado `check-evidence`).

Rótulos usados nas telas (`src/modules/documental/rules/estados.ts`):
- **estado da categoria (§6.4):** "Não consultado", "Informação declarada, sem comprovação", "Pendente ou incompleto", "Em análise", "Com apontamentos", "Sem apontamentos nas fontes consultadas";
- **resultado da consulta:** "Aguardando resultado", "Sem ocorrência na fonte", "Com ocorrência na fonte", "Inconclusivo";
- **valor declarado:** "Não conhece ocorrência", "Há ocorrência", "Desconhece";
- **origem (§6.5):** "Declarada pelo fornecedor", "Documento anexado", "Resultado de consulta", "Confirmada por evidência independente", "Não confirmada".

Telas, na área do fornecedor (`/empresa/[empresaId]/ofertas/[ofertaId]`):
- **resumo,** com a ficha documental: a própria rota;
- **etapa "6. Consultas":** `/consultas`;
- **declarações:** `/declaracoes`;
- **histórico:** `/historico`.

Na área administrativa, a tela é o detalhe da oferta (`/admin/ofertas/[ofertaId]`).

## Lista de conferência

Preencha a coluna "Situação" com "conforme", "achado R-AG-NN" ou "não verificado (motivo)".

| # | Ponto | Critério verificável | Onde conferir | Evidência esperada | Situação |
|---|---|---|---|---|---|
| 1 | **Consulta pendente** | Uma consulta vigente com "Aguardando resultado" ou "Inconclusivo" deixa a categoria em "Pendente ou incompleto", e o resultado aparece por extenso ao lado. Uma consulta nova da mesma categoria substitui a anterior: o estado passa a seguir a nova, e a antiga continua visível, marcada como substituída. | ficha do resumo e do detalhe administrativo; etapa Consultas | pgTAP `410` (linhas da tabela de decisão), `420`; e2e `documental.spec.mts` | |
| 2 | **Apontamento** | "Há ocorrência" declarada ou consulta "Com ocorrência na fonte" deixam a categoria em "Com apontamentos". Cada informação mostra a própria origem, e nenhum rótulo junta duas origens. | ficha | pgTAP `410`; teste unitário `ficha.test.ts` | |
| 3 | **Divergência** | "Não conhece ocorrência" declarada com consulta "Com ocorrência na fonte" vira "Em análise". "Há ocorrência" declarada com consulta "Sem ocorrência na fonte" fica em "Com apontamentos" (decisão P1). Revisão documental aberta vira "Em análise" até ser fechada. | ficha; ações documentais da equipe | pgTAP `410` (linha 25 e casos de revisão); ADR-0004 §2.4 | |
| 4 | **Alteração posterior** | Consulta nova, abertura e fechamento de revisão e impedimento geram versão nova da oferta. O registro anterior continua legível e não muda: consultas e evidências são só de inclusão; revisões e impedimentos só passam, uma vez, de aberto para fechado ou resolvido; nada se apaga. | histórico da oferta | pgTAP `400` e `420` (só inclusão); integração `documental-operacoes.test.ts` | |
| 5 | **Falso estado de verificação** | "Sem apontamentos nas fontes consultadas" só existe com consulta registrada e sempre com a fonte e a data ao lado. Nenhum texto afirma verificação ou garantia sem "nas fontes consultadas" (§6.6), nem nas telas, nem no texto livre (resumo, limitações, motivos e detalhe da declaração), que passa pela lista no servidor e no banco. Consulta de teste nunca se liga a oferta real. | ficha; formulários de consulta, revisão e impedimento | pgTAP `420` (testes 7 e 10) e `430`; teste `linguagem-proibida.test.ts` | |
| 6 | **Rastreabilidade** | Cada consulta guarda quem consultou, quem registrou, quando, a fonte, as limitações e, se houver, a evidência. A evidência só abre por URL temporária gerada pelo servidor, e cada abertura fica em `restricted_access_logs`. | ficha do fornecedor e da equipe | pgTAP `400` e `430` (bucket sem leitura direta); integração `documental-operacoes.test.ts` | |
| 7 | **Dados pessoais (§7.2)** | Dado do proprietário retornado por uma fonte não é gravado. `details` da consulta não aceita chave de dado pessoal (CPF, nome, endereço, placa e similares) e não é gravável pela API. Protocolo, autores e evidências não aparecem para quem não é da empresa dona nem da equipe. | código e testes; formulário de consulta | pgTAP `400` e `430` (trava de chaves); ADR-0004 §2.10 e §2.14 | |

## Severidade dos achados

| Nível | Quando |
|---|---|
| **Crítico** | expõe dado restrito ou pessoal a quem não pode ver; permite ação sem permissão; mostra estado de verificação sem consulta ou evidência; contradiz decisão registrada (P1 a P4, D9) |
| **Alto** | estado documental errado num caso real da tabela de decisão; registro anterior alterável ou apagado; falha de rastreabilidade de quem registrou ou de quem abriu evidência |
| **Médio** | regra certa no banco, mas tela, texto ou mensagem que leva o usuário a erro; teste faltando para uma regra do Inc. 3 |
| **Baixo** | usabilidade e clareza de texto, sem efeito na regra |
| **Informativo** | observação ou sugestão para depois |

O critério do plano é "sem crítico aberto".

## Onde olhar

O repositório é público: https://github.com/85dyones/ideal-garbanzo.

- **Código do Inc. 3:** https://github.com/85dyones/ideal-garbanzo/compare/89b330d...cd83dc4
- **Migrações:**
  - [20261030120000_dominio_documental](https://github.com/85dyones/ideal-garbanzo/blob/main/supabase/migrations/20261030120000_dominio_documental.sql)
  - [20261030150000_linguagem_no_texto_livre](https://github.com/85dyones/ideal-garbanzo/blob/main/supabase/migrations/20261030150000_linguagem_no_texto_livre.sql)
  - [20261030180000_ressalvas_do_documental](https://github.com/85dyones/ideal-garbanzo/blob/main/supabase/migrations/20261030180000_ressalvas_do_documental.sql)
  - [20261030200000_decisoes_do_documental](https://github.com/85dyones/ideal-garbanzo/blob/main/supabase/migrations/20261030200000_decisoes_do_documental.sql)
- **Servidor:** [src/modules/documental/](https://github.com/85dyones/ideal-garbanzo/tree/main/src/modules/documental)
- **Telas:**
  - [área do fornecedor](https://github.com/85dyones/ideal-garbanzo/tree/main/src/app/%28conta%29/empresa/%5BempresaId%5D/ofertas/%5BofertaId%5D)
  - [área administrativa](https://github.com/85dyones/ideal-garbanzo/tree/main/src/app/%28admin%29/admin/ofertas/%5BofertaId%5D)
- **Decisões e ressalvas:** [ADR-0004](https://github.com/85dyones/ideal-garbanzo/blob/main/docs/adr/0004-documental.md), §2, §6, §7 e §8.
  - A §8 traz a revisão do T3, o que a I3.9 corrigiu e as decisões da pessoa responsável sobre a R-I3.7-07 e a R-I3.7-13.
  - Todas as ressalvas da §8 estão corrigidas, tratadas ou registradas.
- **Já registrados, sem precisar voltar:** os achados visuais TV-08, TV-11, TV-13, TV-16, TV-18, TV-20 e TV-24, no [`current-task.md`](https://github.com/85dyones/ideal-garbanzo/blob/main/docs/workflow/current-task.md) (entradas da revisão visual da I3.6).
- **Evidência de testes:**
  - [pgTAP](https://github.com/85dyones/ideal-garbanzo/tree/main/supabase/tests/database), arquivos `400` a `430`;
  - [integração](https://github.com/85dyones/ideal-garbanzo/tree/main/tests/integration): `documental-operacoes.test.ts` e `estado-documental-paridade.test.ts`;
  - [e2e](https://github.com/85dyones/ideal-garbanzo/blob/main/tests/e2e/documental.spec.mts);
  - [mutações](https://github.com/85dyones/ideal-garbanzo/blob/main/supabase/tests/mutacoes/inc-3.md).

## Acesso ao ambiente de homologação

- **O ambiente:** o preview da Vercel da branch `main`, ligado ao projeto Supabase de desenvolvimento, que só tem dados de teste.
- **Autenticação:** o preview fica atrás da autenticação da Vercel, e sem acesso só aparece a tela de login da Vercel.
- **Como o acesso chega:**
  - a pessoa responsável entrega ao revisor, por canal privado (gerenciador de senhas ou mensagem direta), o endereço do preview, o acesso pela Vercel e as contas de teste;
  - nada disso vai para o repositório, para o relatório nem para capturas de tela.
- **Contas necessárias:**
  - um administrador de empresa fornecedora com uma oferta;
  - um operador da plataforma;
  - um administrador da plataforma.
- **Sem acesso ao preview:** a revisão fica no código, nos testes e nos documentos, e o relatório marca como "não verificado (sem acesso)" os critérios que dependem da tela.

## Fora do escopo

- O catálogo do comprador (Inc. 4) e o que ele vê da ficha.
- O texto jurídico (D5): os textos das telas são provisórios.
- A integração automática de consulta (C7).
- A conformidade jurídica completa com a LGPD, que fica com a D5. O ponto 7 cobre só o que o código grava e mostra.

## Entrega esperada

- **Um relatório,** com:
  - o veredito ("sem crítico aberto" ou não);
  - a lista de conferência preenchida.
- **Achados numerados R-AG-NN,** cada um com:
  - a severidade da tabela acima;
  - a tela ou o arquivo e a linha;
  - o cenário concreto;
  - a correção sugerida.
- **Conferência do T2:** o T2 confere cada achado antes de registrar no ADR-0004 e no `current-task.md`.
