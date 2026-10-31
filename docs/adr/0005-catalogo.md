# ADR-0005: Catálogo privado

**Status:** em preparação desde 30/10/2026. O anexo A (I4.0) traz as regras extraídas da especificação, conferidas pelo T2. As decisões (seção 2) entram depois das respostas da pessoa responsável às perguntas da seção 6. O aceite vem no gate do Inc. 4, depois da revisão de exposição de dados (I4.4).
**Data:** 2026-10-30
**Subtarefa:** I4.0 (anexo A e perguntas) do plano orquestrado v2
**Base:** especificação v1.1 (§1.4, §3.3, §5.1, §5.2, §6.2 a §6.11, §7.1 a §7.4, §8, §9, §10, §13), ADR-0002, ADR-0003, ADR-0004, anexo A

---

## 1. Contexto

O Inc. 4 abre as ofertas ao comprador: catálogo com busca, filtros, ordenação e paginação, e ficha com ressalvas e a origem de cada informação. O aceite são os critérios 4, 6, 7 e 10 da §10, com o teste 1 da §7.4: quem não tem acesso não vê, nem por URL direta.

Hoje nenhum comprador lê oferta (anexo A.9):
- as políticas de leitura das ofertas, dos veículos e do domínio documental são só da empresa dona e da equipe;
- não há visão nem operação do catálogo;
- as páginas do comprador são provisórias.

## 2. Decisões

Entram depois das respostas da seção 6.

## 6. Perguntas à pessoa responsável

Respondidas em 30/10, todas pela recomendação do T2:

| # | Pergunta | Resposta | Ambiguidades |
|---|---|---|---|
| P1 | O comprador vê quem é a empresa fornecedora? | **Anônima até o interesse** (Inc. 5). CNPJ e contatos ficam fora em qualquer caso (ADR-0002 §2.9) | F6 |
| P2 | O comprador vê o texto livre do detalhe da declaração? | **Mostra, com orientação** ao fornecedor para não escrever dado pessoal. O snapshot e a ciência (§6.7) já levam o texto | F7 |
| P3 | O comprador vê que existe documento anexado (tipo e data)? | **Não vê nada:** leitura literal da §7.3 e do CT2.14 do ADR-0003. O arquivo fica oculto até a D5 | F8 |
| P4 | Que histórico a ficha mostra ao comprador? | **As consultas substituídas e o vigente:** revisão só como "Em análise", sem o motivo; impedimento resolvido só com a data; sem histórico de preço | F11 a F14 |

Em aberto:

| # | Pergunta | Opções | Recomendação do T2 | Ambiguidades |
|---|---|---|---|---|
| P5 | O que a empresa compradora de teste vê? | só ofertas de teste; teste e reais; nenhuma oferta de teste | só ofertas de teste: igualdade nos dois sentidos, como nas consultas de teste (E15) | F3 |
| P6 | Na empresa que compra e fornece (que agora só existe por convite; ADR-0002 §9), a oferta da própria empresa aparece no catálogo dela? | fica fora; aparece marcada como da própria empresa | fica fora: a empresa já vê a própria oferta na área do fornecedor | F5 |
| P7 | Como é o filtro de estado documental? | por categoria e estado, com os rótulos da §6.4; também agregado ("nenhuma categoria com apontamentos") | por categoria e estado: o agregado funciona como selo único (§6.4) | F19 |

## Anexo A. Regras extraídas da especificação (I4.0)

**Origem:**
- **Extração:** o `fast-helper` (T0), só em leitura, em 30/10/2026.
- **Conferência do T2** (30/10):
  - as citações da §3.3 (matriz), da §5.2 (`is_test` e `buyer_visibility`), da §6.3, da §6.4 ("Exibição"), da §7.3, da §8 e da §9 batem com o texto;
  - os fatos de código também batem:
    - `private.pode_ver_catalogo()`;
    - `private.oferta_aberta` sem EXECUTE para `authenticated`;
    - nenhuma visão nas migrações;
    - `private.conferir_leitura_da_oferta` recusa o comprador;
    - a política de leitura de `organizations`;
  - a contradição da F7 é real. O comentário da migração `20261030200000` adiantou que o comprador vê o detalhe da declaração; o pacote da D5 deixa a decisão para o Inc. 4.
- **Sem decisão:** onde a especificação não decide, a regra virou ambiguidade (A.8, F1 a F26). As que só a pessoa responsável decide estão na seção 6.

**Convenções:**
- "§" é seção da especificação v1.1. Os números de linha são de `docs/especificacao/especificacao-v1.1.md`. Os caminhos de código são relativos à raiz do repositório.
- **Comprador com acesso:** membro com vínculo `active`, perfil `active`, numa empresa `active` com `kind` em (`buyer`, `both`). É a regra de `private.pode_ver_catalogo()` (identidade.sql:416-431) e de `podeVerCatalogo` (`src/modules/auth/rules/permissoes.ts:43-50`). O papel na empresa (`org_admin` ou `member`) não conta para essa regra.
- **Oferta aberta:** a regra de `private.oferta_aberta` (`20261030120000_dominio_documental.sql:252-268`): status `published` ou `reserved`, `valid_until > now()`, empresa dona `active` e nenhum impedimento ativo.
- Algumas citações literais contêm um termo da lista da §6.6, quase sempre "aprovado" referido à empresa. Essas linhas levam no fim o marcador `linguagem-permitida: citação literal`.

### A.1. Insumos

| # | Origem | Palavras exatas | Uso |
|---|---|---|---|
| I1 | §1.3, l. 57 | "Compradores profissionais aprovados acessam as oportunidades." `linguagem-permitida: citação literal` | A.2 |
| I2 | §1.4, itens 1 e 2 | "**Transparência sem bloqueio automático.** Pendência ou ausência de consulta nunca impede publicar. Torna a condição visível."; "**Transparência não é certificação.**"; "O produto nunca afirma procedência." | A.4, A.5 |
| I3 | §1.4, itens 4, 6 e 7 | "Toda informação exibida mostra sua origem (seção 6.5)."; "**Autorização no servidor e no banco.** A interface nunca é a única barreira."; "Fornecedor não vê dados restritos de outro fornecedor; comprador não vê negociação de outro comprador." | A.2, A.3 |
| I4 | §2.1, itens 7 a 9 | "Avisos claros para pendências e apontamentos."; "Catálogo privado e filtros de busca."; "Gestão de preço, validade e disponibilidade." | A.4, A.5 |
| I5 | §2.2 | "oferta é publicada com o status correto → comprador encontra o veículo → vê as informações relevantes → registra interesse e ciência das ressalvas" | A.3 |
| I6 | §3.2 | "**Comprador:** vê o catálogo privado; registra ciência e interesse; negocia; vê apenas as negociações da própria empresa." | A.2 |
| I7 | §3.3 | "Ver catálogo privado \| sim \| sim \| sim, se também for comprador \| sim, se aprovado" `linguagem-permitida: citação literal` | A.2 |
| I8 | §3.3 | "Ver documentos e evidências restritos \| sim \| sim \| só das próprias ofertas \| conforme a seção 7.3"; "A matriz é regra de negócio. A autorização final é aplicada no servidor e nas políticas do banco." | A.2, A.3 |
| I9 | §4.1 | "estados de carregamento, vazio, erro, sem permissão e registro inexistente em toda tela." | A.6 |
| I10 | §4.2 | "Supabase Storage **privado** para fotos, documentos e evidências. O catálogo é privado, então até as fotos usam URL temporária."; "Documentos sensíveis nunca recebem URL pública permanente." | A.3 |
| I11 | §5.1 | "`name`, `legal_name`, `cnpj` (acesso restrito), `cnpj_root`"; "`contact_email`, `contact_phone`" | A.3 |
| I12 | §5.2 | "`plate`, `renavam`, `chassis`: acesso restrito; nunca no catálogo nem em notificação" | A.3, A.5 |
| I13 | §5.2 | "`is_test`: oferta de teste, nunca exibida a comprador real" | A.2 |
| I14 | §5.2 | "`buyer_visibility`: `hidden` ou `approved_buyers`; padrão `hidden` até a decisão D5"; "`material_snapshot` (jsonb): campos materiais, estados documentais por categoria e ressalvas exibidas" | A.3 |
| I15 | §5.6 | "**restricted_access_logs** (só inclusão): quem abriu documento ou evidência restrita, e quando." | A.3 |
| I16 | §6.1 | "Empresa e usuário só acessam o produto depois de aprovados por um administrador." `linguagem-permitida: citação literal`; "Empresa suspensa perde o acesso na operação seguinte. A revalidação acontece no servidor e nas políticas do banco, não só no vencimento do token." | A.2 |
| I17 | §6.2 | "`published` \| visível a compradores aprovados" `linguagem-permitida: citação literal`; "`reserved` \| negociação em fase de acordo"; "Oferta retirada, expirada ou suspensa não recebe interesse novo." | A.2 |
| I18 | §6.2 | "**O que nunca impede publicar:** consulta pendente, consulta não realizada, apontamento ou divergência. Essas condições geram avisos, não bloqueios." | A.4, A.7 |
| I19 | §6.3 | "Consulta nova não apaga a anterior; ela a substitui e o histórico fica visível."; "`known_limitations` é obrigatório." | A.3, F11 |
| I20 | §6.4, tabela | rótulos: "Não consultado"; "Informação declarada, sem comprovação"; "Pendente ou incompleto"; "Em análise"; "Com apontamentos"; "Sem apontamentos nas fontes consultadas" | A.4 |
| I21 | §6.4, "Exibição" | "Na ficha da oferta, todos os estados por categoria, com fonte, data e limitações."; "No catálogo e nas notificações, um resumo proporcional (ex.: "2 com apontamentos, 3 pendentes"), nunca um selo único de "verificado"." (exemplo negativo) `linguagem-permitida: citação literal`; "`no_findings_in_sources` sempre lista as fontes e a data da consulta." | A.4, A.5 |
| I22 | §6.4 | "A tabela de estados e a precedência são a regra proposta desta versão. O piloto deve validar se ela representa bem a avaliação do comprador." | A.4 |
| I23 | §6.5 | "1. **Declarada pelo fornecedor:** vem de `supplier_declarations`. 2. **Documento anexado:** vem de `offer_documents`. 3. **Resultado de consulta:** vem de `vehicle_checks`. 4. **Confirmada por evidência independente:** consulta de fonte oficial com evidência anexada, ou documento oficial conferido pela plataforma. 5. **Não confirmada:** nenhuma das anteriores."; "A interface nunca funde origens diferentes num mesmo rótulo." | A.4 |
| I24 | §6.6 (lista) | "A interface, as notificações e os guias não usam, para o veículo ou a oferta, termos como "verificado", "aprovado", "certificado", "garantido", "procedência garantida", "livre de problemas" ou "nada consta" sem a qualificação "nas fontes consultadas, em [data]"." `linguagem-permitida: citação literal` | A.4, A.5 |
| I25 | §6.7 | "Antes de registrar interesse, o comprador vê as informações e ressalvas da versão vigente e registra ciência dessa versão."; "A ciência não autoriza ocultar informação nem exonera responsabilidade." | F7, F13 |
| I26 | §6.8 | "O interesse exige comprador aprovado, oferta publicada ou reservada e ciência vigente." `linguagem-permitida: citação literal` | A.2 |
| I27 | §6.9 | "O fornecedor confirma a disponibilidade periodicamente, e a data aparece na ficha." | A.3 |
| I28 | §6.10 | "avisa o fornecedor e os compradores com negociação aberta"; "Pendência documental, sozinha, não é motivo de suspensão." | A.2 |
| I29 | §6.11 | "O impedimento aparece como aviso próprio, separado das pendências documentais."; "Até lá, a oferta com impedimento ativo não sai de `draft` para `published`, e o fornecedor vê o motivo." | A.4 |
| I30 | §6.13 | "Notificação nunca leva placa, RENAVAM, chassi, documento nem dado pessoal. Mostra o resumo documental proporcional e o link para a ficha." | A.4 |
| I31 | §7.1 | "Storage privado e URL temporária para fotos, documentos e evidências."; "Rate limiting e proteção contra robô nas rotas sensíveis e nos formulários públicos."; "Auditoria das ações administrativas e dos acessos a documento restrito." | A.3, F26 |
| I32 | §7.2 | "Placa, RENAVAM e chassi ligados a proprietário pessoa física são tratados como dado pessoal: acesso restrito, fora do catálogo e das notificações." | A.3 |
| I33 | §7.3 | "A Portaria SENATRAN 139/2025 restringe ceder acesso a dados a terceiros, e cada fonte comercial tem seus termos. Até a decisão D5: o comprador vê o estado de cada categoria, a fonte, a data, as limitações e o resumo escrito por quem registrou; documentos e evidências ficam com `buyer_visibility = hidden`; abrir a visibilidade é decisão por tipo de documento, registrada em configuração." | A.3, A.4 |
| I34 | §7.4 | testes 1, 2, 5, 6, 7, 10, 11 e 12 (l. 524-535); "Cada teste negativo precisa falhar quando a política correspondente é removida." | A.7 |
| I35 | §8 | "`listOffers(filters, cursor)`, `getOfferDetails(offerId)`: só para comprador aprovado; sem campos restritos" `linguagem-permitida: citação literal` | A.2, A.5 |
| I36 | §9, Comprador | "catálogo com filtros (preço, marca, modelo, ano, quilometragem, localização, estado documental);"; "ficha da oferta com ressalvas e origem de cada informação;"; "Toda tela trata carregamento, vazio, erro, sem permissão e registro inexistente." | A.5, A.6 |
| I37 | §10 | 4: "A publicação acontece com consulta pendente ou apontamentos, com os avisos adequados."; 6: "O sistema distingue declarações, anexos e resultados de consulta."; 7: "O comprador autorizado vê as ressalvas relevantes."; 10: "Dados e documentos restritos não ficam acessíveis a usuários não autorizados."; 11: "Não há consulta simulada nem estado de verificação sem evidência."; 13: "…ou com dados de teste claramente identificados." | A.7 |
| I38 | §12, Inc. 4 | "Catálogo privado, filtros, ficha com ressalvas \| critérios 4, 6, 7 e 10 da seção 10" | A.7 |
| I39 | §13 | "Estruturas técnicas podem ser construídas antes. O comportamento definitivo em produção, não."; "D5 \| Jurídico: … visibilidade de resultados e evidências ao comprador (Portaria 139/2025) \| piloto; seção 7.3"; "C6 \| Regiões e categorias de veículo atendidas no início \| filtros e operação" | A.3, A.5 |
| I40 | Plano, Inc. 4 (l. 223-236) | "**Decisões:** D5 deixa as evidências ocultas; C6 deixa os filtros genéricos."; I4.1: "só para comprador aprovado; sem placa, RENAVAM, chassi nem documento; resumo documental proporcional; `is_test` fora para comprador real; fotos por URL temporária \| … \| T2 confere a resposta de rede, não só a tela" `linguagem-permitida: citação literal`; I4.2: "busca, filtros (preço, marca, modelo, ano, quilometragem, localização, estado documental), ordenação, paginação; ficha com ressalvas e origem"; I4.3: "não aprovado não vê, nem por URL direta (teste 1); oferta pendente nunca aparece como verificada" (exemplo negativo) `linguagem-permitida: citação literal` | todo o anexo |
| I41 | Plano §7 (l. 297, 305) | D5: "Pode avançar antes: documentos ocultos ao comprador … \| Não pode antes: piloto; abrir evidência ao comprador"; C6: "filtros genéricos \| restrição por região ou categoria" | A.3, A.5 |
| I42 | ADR-0002 §2.2, §2.9 e §2.15 | `pode_ver_catalogo()`: "membro ativo de ao menos uma empresa ativa com `kind` em (`buyer`, `both`)"; "Quando o catálogo mostrar o fornecedor ao comprador (Inc. 4), a leitura passa por uma visão sem CNPJ e sem contatos."; "Quem não tem acesso recebe "sem permissão" para qualquer id, exista o registro ou não. "Registro inexistente" só aparece para quem tem acesso (§9)." | A.2, A.6 |
| I43 | ADR-0003 §2.3, §2.9, §2.11, §2.13 e §2.14 | "Empresa suspensa: o status das ofertas não muda. Elas saem da vista dos compradores…"; "catálogo (Inc. 4) e interesse (Inc. 5) usam o predicado `private.oferta_aberta(oferta)`"; "O catálogo do Inc. 4 lê o veículo por uma visão sem esses campos."; fotos: "O comprador entra no Inc. 4"; "O catálogo e a ficha chegam no Inc. 4, para `published` e `reserved`, por `private.pode_ver_catalogo()` e por visões sem os campos restritos (B19)."; "Oferta de teste nunca aparece a comprador real (Inc. 4)." | A.2, A.3 |
| I44 | ADR-0003 A.6 e §8 | CT2.14: "c1 \| ler a linha do DP \| 0 linhas (`buyer_visibility = hidden`)"; ACH-09: "No Inc. 4, a política do comprador exige uma linha de `offer_media` não removida com aquele caminho."; R-I2.11-07 (variante interna do versionamento antes do Inc. 4 ou 5) | A.3, A.9 |
| I45 | ADR-0004 §2.7, §2.8, §2.11 (P4), §2.12 (E26), §2.14, §5 e §8 | P4: "a oferta sai do catálogo enquanto houver impedimento ativo"; §2.14: "o estado de cada categoria, a fonte, a data, as limitações e o resumo de quem registrou. **Fica oculto:** `details`, `protocol`, os autores e os arquivos de evidência."; §2.8: evidência "Para o comprador, fica oculta até a D5 (§7.3)."; §5: "Catálogo (Inc. 4): usa `private.oferta_aberta`, que já sabe do impedimento ativo."; R-I3.7-12: o resumo "remete às fontes e datas da ficha" | A.3, A.4 |

### A.2. Visibilidade

Legenda: **Lista** = aparece na lista do catálogo. **Detalhe** = abre a ficha pela rota do comprador ou por `getOfferDetails`. "Qualquer" vale para todos os estados do ADR-0003 §2.1: `draft`, `under_review`, `published`, `reserved`, `sold`, `withdrawn`, `expired` e `suspended`.

| # | Ator | Estado da oferta | `is_test` da oferta | Fornecedora | Lista | Detalhe | Tela | Base |
|---|---|---|---|---|---|---|---|---|
| V01 | Anônimo | qualquer | qualquer | qualquer | não | não | redireciona para "Entrar", com o caminho de volta (código). O ADR-0002 D47 diz "sem permissão" (F25) | §7.4.1; ADR-0002 A.7 D47; `acesso.ts:84-86`; `acesso.spec.mts:59-67` |
| V02 | Perfil ativo sem empresa (sem vínculo; pedido `submitted`, `under_review` ou `rejected`) | qualquer | qualquer | qualquer | não | não, nem por URL | "Sem permissão", igual para id existente, inexistente ou inválido | §6.1; §7.4.1; ADR-0002 §2.15, CT1.1 a CT1.4; `acesso.spec.mts:88-105` |
| V03 | Vínculo `pending`, `suspended` ou `removed` numa compradora | qualquer | qualquer | qualquer | não | não | "Sem permissão" | ADR-0002 §2.10, CT1.3; `170-isolamento-e-catalogo.test.sql:250-254` |
| V04 | Membro de compradora com status `pending` | qualquer | qualquer | qualquer | não | não | "Sem permissão"; o status não é usado, porque a empresa nasce `active` | ADR-0002 §2.10; identidade.sql:429 |
| V05 | Membro ativo de compradora `suspended` ou `closed` | qualquer | qualquer | qualquer | não | não | "Sem permissão" | §6.1; ADR-0002 §2.3, D44, D45; `acesso.spec.mts:107-122`; 170:246-248 |
| V06 | Perfil `suspended`, com token antigo | qualquer | qualquer | qualquer | não | não | hoje "Sem permissão" na área do comprador; outras áreas mostram "Acesso suspenso" (F24) | §6.1; §7.4.5; ADR-0002 D43; `(comprador)/layout.tsx:15-18`; `comprador/page.tsx:16`; 170:258 |
| V07 | Membro ativo só de empresa `supplier`, diante de qualquer oferta, alheia ou própria, pela rota do comprador | qualquer | qualquer | qualquer | não | não | "Sem permissão"; pela API, 0 linhas | §3.3 ("sim, se também for comprador"); ADR-0002 D49; ADR-0003 CT2.12, B19 |
| V08 | Comprador com acesso, de empresa real (`is_test = false`) e que não é a dona | `published`, aberta | `false` | ativa | sim | sim | lista e ficha (A.3) | I1, I7, I17, I35; ADR-0003 §2.9, §2.14, B19 |
| V09 | idem | `reserved`, aberta | `false` | ativa | sim | sim | idem; o rótulo de "reservada" é a F1 | ADR-0003 §2.14, B19; §6.8 |
| V10 | idem | `published` ou `reserved` com `valid_until` vencido antes da rodada do job | `false` | ativa | não | não | "Registro inexistente" (F2) | §6.9; ADR-0003 §2.9; dominio:265 |
| V11 | idem | `published` ou `reserved` com impedimento ativo | `false` | ativa | não | não | "Registro inexistente" (F2); volta ao catálogo quando o impedimento é resolvido | §6.11; D9; ADR-0004 §2.11 (P4); dominio:267 |
| V12 | idem | `published` ou `reserved` | `false` | `suspended` ou `closed` | não | não | "Registro inexistente" (F2) | ADR-0003 §2.3, B18; dominio:266 |
| V13 | idem (comprador real) | aberta | `true` | ativa | não | não | "Registro inexistente" | §5.2 (I13); ADR-0003 §2.14, B26 |
| V14 | Comprador de empresa de teste (`organizations.is_test = true`) | aberta | `true` | ativa | F3 | F3 | F3; se aparecer, identificada como teste (§10, critério 13) | §5.2; §10.13; ADR-0002 A34 |
| V15 | Comprador de empresa de teste | aberta | `false` | ativa | F3 | F3 | F3 | §4.4 ("Dado real de cliente não vai para teste…") |
| V16 | Comprador com acesso | `draft` | qualquer | qualquer | não | não | "Registro inexistente" | §6.2; §7.4.2; ADR-0002 §2.15; ADR-0003 B19 |
| V17 | idem | `under_review` | qualquer | qualquer | não | não | "Registro inexistente" | §6.2 (D10); ADR-0003 §2.2, B19 |
| V18 | idem | `sold` | qualquer | qualquer | não | não | "Registro inexistente" (F2) | ADR-0003 §2.1, §2.9 |
| V19 | idem | `withdrawn` | qualquer | qualquer | não | não | "Registro inexistente" (F2) | §6.2; ADR-0003 §2.9 |
| V20 | idem | `expired` | qualquer | qualquer | não | não | "Registro inexistente" (F2) | §6.2; §6.9 |
| V21 | idem | `suspended` | qualquer | qualquer | não | não | "Registro inexistente" (F2) | §6.2; §6.10; ADR-0003 §2.10 |
| V22 | idem | id inexistente ou inválido | — | — | — | não | "Registro inexistente", igual a V10 a V21; na operação de servidor, a mesma resposta da oferta não visível (padrão do CT2.10) | §9; ADR-0002 §2.15; `acesso.spec.mts:124-139`; ADR-0003 CT2.10 |
| V23 | Membro ativo de empresa `both` (ou pessoa com vínculo na dona e numa compradora), diante da oferta da própria dona, pela rota do comprador | aberta | qualquer | ativa | F5 | F5 | F5 | §3.3 |
| V24 | Membro ativo da empresa dona, pela área do fornecedor | qualquer | qualquer | ativa | no painel da empresa | sim, inclusive placa, RENAVAM e chassi | telas do fornecedor (Inc. 2 e 3) | §3.3 ("só as próprias"); ADR-0003 §2.11, §2.14 |
| V25 | Membro ativo da empresa dona | qualquer | qualquer | `suspended` ou `closed` | não | não | aviso de que a empresa está suspensa ou encerrada; a RLS esconde as ofertas | ADR-0002 §2.3, D51; `oferta-da-pagina.tsx:132-145, 185-187`; identidade.sql:368-382 |
| V26 | Operador ou administrador ativo, pela área administrativa | qualquer | qualquer | qualquer | sim (`/admin/ofertas`) | sim, leitura completa | telas da I2.9 | §3.3; ADR-0003 §2.14; ofertas.sql:1417-1421 |
| V27 | Operador ou administrador sem vínculo de comprador, pela rota do comprador | qualquer | qualquer | qualquer | não (hoje) | não (hoje) | "Sem permissão"; a §3.3 diz "sim" (F4) | §3.3; identidade.sql:416-431; `permissoes.ts:43-50` |
| V28 | Pessoa da equipe com vínculo ativo numa compradora ativa | aberta | `false` | ativa | sim, como comprador | sim | como V08 | ADR-0002 §2.9 (último item), A28; identidade.sql:423-430 (a função não olha `platform_staff`) |

### A.3. Campos ao comprador

**Mostra** = está na ficha ou na lista. **Não** = fica fora da tela e da resposta de rede (plano I4.1). **F** = ambiguidade. **D5** = depende da D5 (§7.3). Hoje o plano deixa as evidências ocultas (plano, l. 225).

| Grupo | Campo | Ao comprador | Base |
|---|---|---|---|
| Veículo | `make`, `model`, `version`, `manufacture_year`, `model_year`, `mileage_km` | mostra | §9 (filtros); §2.2; snapshot (`material_fields`, ofertas.sql:1613-1615) |
| Veículo | `fuel_type`, `transmission`, `color`, `body_type` | mostra (a especificação não restringe) | §5.2; §2.2 |
| Veículo | `plate`, `renavam`, `chassis` | **não**, nem na resposta de rede | §5.2 (I12); §7.2; §8; plano I4.1; ADR-0003 §2.11 |
| Veículo | `id`, `organization_id`, `created_by`, datas técnicas | não definido | — |
| Oferta | `asking_price`, `currency` | mostra | §1.3; §9 |
| Oferta | `commercial_conditions` | mostra | §1.3; §6.7 (campo material) |
| Oferta | `location_city`, `location_state` | mostra | §9 ("localização") |
| Oferta | status (`published` ou `reserved`) | F1 | §6.2 |
| Oferta | `availability_confirmed_at` | mostra na ficha; sem confirmação, F15 | §6.9 (I27) |
| Oferta | `valid_until`, `published_at` | F15 | §6.9 |
| Oferta | `current_version` e hash | ficha da versão vigente; uso na ciência no Inc. 5 (F14) | §6.7 |
| Oferta | `publication_authorized_by`/`_at`, `created_by` | não definido (são perfis) | — |
| Oferta | `suspended_*`, `withdrawn_*` | não se aplica (a oferta sai do catálogo) | A.2 V19, V21 |
| Oferta | `is_test` | não se aplica ao comprador real; com comprador de teste, F3 e a identificação do §10.13 | §5.2 |
| Fornecedor | `name`, `legal_name` | F6 | ADR-0002 §2.9 |
| Fornecedor | `cnpj`, `cnpj_root` | **não** | §5.1 ("acesso restrito"); ADR-0002 §2.9 |
| Fornecedor | `contact_email`, `contact_phone` | **não** | ADR-0002 §2.9. A §5.1 marca só o CNPJ como restrito |
| Fornecedor | membros e perfis | **não** | §1.4.7; ADR-0002 §2.9 |
| Fotos | foto não removida, na ordem | mostra, por URL temporária | §4.2; §7.1; ADR-0003 §2.13 |
| Fotos | foto removida | **não**, nem pelo caminho | ADR-0003 §2.13, ACH-09 |
| Fotos | `storage_path`, `uploaded_by` | não definido. O caminho sozinho não dá acesso (teste 6) | §7.4.6 |
| Fotos | registro de acesso | não há (fotos fora de `restricted_access_logs`) | §5.6; ADR-0003 B24 |
| Fotos | placa visível na foto | só orientação ao fornecedor; a revisão devolve a oferta | ADR-0003 §2.13, B22 |
| Documentos | arquivo | **não** (**D5**) | §5.2 (I14); §7.3; ADR-0003 §2.13, X18; CHECK `offer_documents_oculto_ate_d5` (ofertas.sql:288) |
| Documentos | linha (tipo, descrição, data, `sha256`) | F8; o CT2.14 espera hoje 0 linhas | ADR-0003 CT2.14; §6.5, item 2 |
| Declarações | valor vigente, com a origem "Declarada pelo fornecedor" | mostra | §6.5, item 1; §10.6 |
| Declarações | `detail` | F7 | §6.5; comentário em `20261030200000:4-6`; pacote da D5, fora do repositório |
| Declarações | `declared_at` | não definido na especificação. O ADR-0004 A.4 (extração) lista "valor declarado, detalhe e data" para a origem O1 | ADR-0004 A.4 |
| Declarações | `declared_by`; declarações anteriores | não definido; as anteriores entram na F11 | — |
| Estados | estado de cada categoria, com o rótulo da §6.4 | mostra na ficha | §6.4; §7.3 |
| Estados | resumo proporcional | mostra na lista | §6.4 (I21) |
| Estados | ressalvas (`notices`) da versão vigente | mostra; os textos são provisórios até a D5 (**D5**) | §5.2; §10.7; `rules/avisos.ts:10` |
| Consultas vigentes | `source_name`, `source_type` | mostra ("a fonte") | §7.3; §6.4 |
| Consultas vigentes | `performed_at` | mostra ("a data") | §7.3 |
| Consultas vigentes | `result`, por extenso | mostra. A §7.3 não lista o resultado à parte, mas o snapshot o leva | §6.3; §6.5, item 3; ADR-0004 §2.7 (E13); dominio:701 |
| Consultas vigentes | `result_summary` | mostra | §7.3 ("o resumo escrito por quem registrou") |
| Consultas vigentes | `known_limitations` | mostra | §7.3; §6.4 |
| Consultas vigentes | origem O3 ou O4 | mostra | §6.5; ADR-0004 §2.7 |
| Consultas vigentes | arquivo da evidência | **não** (**D5**) | §7.3; ADR-0004 §2.8, §2.14 |
| Consultas vigentes | indicação de que há evidência | F9 (**D5**) | snapshot `has_evidence` (dominio:704) |
| Consultas vigentes | `details`, `protocol` | **não** | ADR-0004 §2.14 (E35) |
| Consultas vigentes | `performed_by`, `recorded_by` | **não** ("os autores") | ADR-0004 §2.14 |
| Consultas vigentes | `recorded_as` (lado de quem registrou) | F10 | ADR-0004 §2.7 (E10) |
| Consultas vigentes | `recorded_at`, `method` | não definido | — |
| Consultas | substituídas | F11 | §6.3 (I19) |
| Revisões | revisão aberta, como estado "Em análise" | mostra | §6.4 |
| Revisões | motivo, autor, data, revisões fechadas | F12 | ADR-0004 §2.5, §2.7 (E12) |
| Impedimentos | ativo | não se aplica, porque a oferta sai do catálogo | ADR-0004 §2.11 (P4) |
| Impedimentos | resolvidos (`basis`, datas) | F13 | snapshot (dominio:732-742) |
| Impedimentos | `resolved_by`, `resolution_reason` | F13 | — |
| Impedimentos | evidência da resolução | **não** (**D5**) | §7.3 |
| Evidências | `check_evidence_files` (arquivo, caminho, `sha256`) | **não** (**D5**) | §7.3; ADR-0004 §2.8 |
| Histórico | `field_history`, lista de `offer_versions` | F14 | §1.4.5; §9 (não lista histórico para o comprador) |
| Revisão da D10 | `offer_reviews` | não definido | — |

**Itens que dependem da D5:** os arquivos de documento e de evidência; a indicação de evidência (F9); a forma de abrir a visibilidade "por tipo de documento, registrada em configuração" (§7.3); e o texto das ressalvas e da ciência (§6.7; `avisos.ts:10`).

### A.4. Ficha e resumo documental

| Estado | Rótulo (§6.4) | O que o comprador vê na categoria | Exigência de exibição | Base |
|---|---|---|---|---|
| `not_checked` | Não consultado | o estado; a declaração "Desconhece" (O1), se existir; sem declaração nem consulta, "Não confirmada" (O5) | — | §6.4; §6.5, itens 1 e 5; ADR-0004 §2.7 |
| `declared_unverified` | Informação declarada, sem comprovação | o estado; a declaração (O1), com o detalhe conforme a F7 | — | §6.4; §6.5, item 1 |
| `pending` | Pendente ou incompleto | o estado; cada consulta vigente com "Aguardando resultado" ou "Inconclusivo" por extenso (O3, nunca O4) | — | §6.4; ADR-0004 §2.7 (E13) |
| `under_review` | Em análise | o estado; o motivo conforme a F12 | — | §6.4; ADR-0004 §2.5, §2.7 (E12) |
| `with_findings` | Com apontamentos | o estado; a declaração de ocorrência (O1) e/ou a consulta com ocorrência (O3 ou O4), cada uma separada | — | §6.4; §6.5 |
| `no_findings_in_sources` | Sem apontamentos nas fontes consultadas | o estado, com a fonte e a data de cada consulta vigente ao lado; as limitações | "sempre lista as fontes e a data da consulta"; a evidência não é exigida (P2), e a indicação ao comprador é a F9 | §6.4 (I21); §6.6; ADR-0004 §2.8 (P2), §2.12 (E26); `ficha.ts:185-209` |

- **Origem (§6.5):** cada informação mostra a própria origem: a declaração (O1), cada documento (O2), cada consulta vigente (O3 ou O4) e, sem nenhuma informação, O5.
  - O estado não é origem e não leva rótulo de origem. Não existe rótulo combinado (ADR-0004 §2.7; A.4).
  - **O2 ao comprador:** F8.
  - **O4 ao comprador:** o rótulo aparece, e o arquivo fica oculto (F9 e F10). A O4 exige fonte oficial, evidência e registro pela equipe sem vínculo (ADR-0004 §2.7, E10; `estados.ts:155-170`).
- **Qualificação "nas fontes consultadas, em [data]" (§6.6):**
  - **Na ficha:** a data e a fonte de cada consulta ficam ao lado (E26; `ficha.ts:191-209`).
  - **No card da lista:** o resumo traz "sem apontamentos nas fontes consultadas" sem a data. O precedente da tela do fornecedor é remeter à ficha (R-I3.7-12; `ficha-documental.tsx:86-112`). Para o catálogo, é a F23.
  - **O varredor de linguagem aceita a qualificação sem a data** (ADR-0004 A.5, E26).
- **Pendência:** a oferta com pendência ou apontamento aparece no catálogo, com o resumo e as ressalvas (I2, I18; §10.4).
  - Nunca aparece como positiva. O exemplo negativo do plano é "oferta pendente nunca aparece como verificada" (I4.3) `linguagem-permitida: citação literal`.
  - O resumo segue a precedência e conta estados, não origens (`estados.ts:226-241`).
- **Impedimento:** tem "aviso próprio, separado das pendências documentais" (§6.11).
  - Com impedimento ativo, a oferta sai do catálogo (P4). O comprador não vê o aviso `impedimento_de_transferencia.v1` (`avisos.ts:27-28`), que existe no snapshot enquanto o impedimento está ativo (dominio:722).
  - Os impedimentos resolvidos entram na F13.
- **Fornecedor × comprador** (as regras diferem):
  - **Fornecedor:** a ficha mostra protocolo, autoria com nome, link da evidência, consultas substituídas, histórico das revisões com motivo e autor, impedimento ativo e resolução com motivo e evidência, documentos com abertura registrada e pendências de publicação (`ficha-documental.tsx:163-179, 284-312, 451-540`; `ficha.ts:479-513`).
  - **Comprador:** a §7.3 e o ADR-0004 §2.14 ocultam protocolo, `details`, autores e arquivos; o resto está nas F7 a F13.
  - **Textos:** vários de `TEXTO_DOCUMENTAL` são do fornecedor. Exemplos: "As consultas são opcionais e não impedem o envio", as dicas de registro e o aviso sobre o proprietário (`ficha.ts:74-92`).

### A.5. Busca, filtros, ordenação e paginação

| Item | Pedido por | Campo | Restrição ou ponto aberto | Depende de |
|---|---|---|---|---|
| Preço | §9; plano I4.2 | `asking_price` | — | — |
| Marca | §9; I4.2 | `make` | — | — |
| Modelo | §9; I4.2 | `model` | — | — |
| Ano | §9; I4.2 | `manufacture_year` e/ou `model_year` | F17 | — |
| Quilometragem | §9; I4.2 | `mileage_km` | — | — |
| Localização | §9; I4.2 | `location_city` e/ou `location_state` | F18; sem restrição por região até a C6 | **C6** (pendente) |
| Estado documental | §9; I4.2 | estado calculado por categoria | sem sugerir verificação nem virar selo único (§1.4.2; §6.4; §6.6); F19 | — |
| Busca textual | só o plano (I4.2) | não definido | F20; nunca por placa, RENAVAM ou chassi (§5.2; §7.2) | — |
| Ordenação | só o plano (I4.2) | não definido | F21 | — |
| Paginação | §8 ("`listOffers(filters, cursor)`"); I4.2 | cursor | tamanho e contagem: F22 | — |
| Categoria de veículo | não está no §9 | — | restrição por categoria só depois da C6 (plano, l. 305) | **C6** (pendente) |

Restrições gerais:
- **Campos restritos:** nenhum filtro nem busca por placa, RENAVAM, chassi, CNPJ, contatos, `details`, `protocol` ou autores (§5.1; §5.2; §7.2; ADR-0004 §2.14).
- **`is_test`:** a oferta de teste fica fora para o comprador real em qualquer filtro (§5.2).
- **Ofertas fechadas:** só entram as ofertas abertas (A.2).

### A.6. Estados de tela do §9

| Tela | Estado | Quando | Hoje | Base |
|---|---|---|---|---|
| Catálogo | carregamento | durante a leitura | `comprador/loading.tsx` | §9; §4.1 |
| Catálogo | vazio | nenhuma oferta aberta; o filtro sem resultado é um caso à parte, não definido | `Vazio` provisório ("O catálogo chega no Inc. 4.") | §9; `comprador/page.tsx:17-21` |
| Catálogo | erro | falha de leitura | `(comprador)/error.tsx` | §9 |
| Catálogo | sem permissão | V02 a V07 e V27 | layout e página | ADR-0002 §2.15; `(comprador)/layout.tsx:15-18` |
| Catálogo | acesso suspenso | V06 | não usado na área (F24) | `estados.tsx:54`; `inicio/page.tsx:36` |
| Catálogo | registro inexistente | não se aplica à lista | — | — |
| Ficha | carregamento | durante a leitura | `ofertas/[id]/loading.tsx` | §9 |
| Ficha | erro | falha de leitura; falha parcial ao gerar a URL de uma foto (a leitura do fornecedor devolve `url: null`) | `error.tsx`; `queries/ofertas.ts:367-368, 396` | §9 |
| Ficha | sem permissão | V02 a V07, igual para qualquer id | página provisória | ADR-0002 §2.15; `ofertas/[id]/page.tsx:24` |
| Ficha | registro inexistente | V10 a V22 (F2) | hoje, todo id | `ofertas/[id]/page.tsx:25-30` |
| Ficha | vazios parciais | sem fotos; categoria sem informação ("Não confirmada"); sem consultas | `TEXTO_DOCUMENTAL.semInformacao` (do fornecedor) | §6.5, item 5; `ficha.ts:47` |

### A.7. Casos de teste

**Elenco:**
- **Empresas:** F e G (`supplier`); C (`buyer`); A (`both`); CT (`buyer` de teste); CS (`buyer` suspensa); T (`supplier` de teste).
- **Pessoas:**
  - p1: perfil ativo sem empresa;
  - cp: vínculo `pending` em C;
  - cx: membro de C com perfil suspenso, com token antigo;
  - cs1: membro de CS;
  - g1, c1, a1 e ct1: membros de G, C, A e CT;
  - O: operador; X: administrador.
- **Ofertas de F:**
  - P: `published`, real, com uma categoria `pending`, uma `with_findings`, uma `no_findings_in_sources`, foto, foto removida, documento DP e consulta com evidência;
  - PR: `reserved`;
  - R: `draft`;
  - PV: publicada e vencida antes do job;
  - PI: publicada com impedimento ativo;
  - PS, PW, PE e PX: `sold`, `withdrawn`, `expired` e `suspended`.
- **Outras ofertas:** PG, publicada de G, com G suspensa depois; PT, publicada de T (`is_test`).
- **Convenção:** a do ADR-0003 A.6. Recusado quer dizer erro ou 0 linhas, com a conferência de que nada mudou. Todo negativo tem contraste, e cada mutação afrouxa uma camada só.

**Teste 1 (§7.4.1): quem não tem acesso não vê, nem por URL direta**

| ID | Ator | Ação | Esperado | Base |
|---|---|---|---|---|
| CT1.5 | p1 | abre `/comprador` e a ficha de P por URL | "Sem permissão", com o mesmo status e o mesmo texto de um id inexistente e de um inválido; nenhum dado de P na resposta | §7.4.1; ADR-0002 §2.15, CT1.4 |
| CT1.6 | p1 | chama `listOffers` e `getOfferDetails(P)` no servidor | "sem permissão", sem dado | §8 |
| CT1.7 | p1 | com o próprio token, lê pela API `offers`, `vehicles`, `offer_media`, `supplier_declarations`, `vehicle_checks` e `offer_versions` de P, e chama as RPCs | 0 linhas ou "sem permissão" | §1.4.6 |
| CT1.8 | cp, cs1 (CS suspensa ou encerrada), cx, g1, membro de empresa `pending` | CT1.5 a CT1.7 | recusado | ADR-0002 CT1.3; §6.1; §7.4.5 |
| CT1.9 | p1 e g1 | URL temporária da foto de P pelo caminho | recusado | §7.4.6; ADR-0003 CT6.4 |
| CT1.10 | anônimo | ficha de P; API | vai para "Entrar"; a API não devolve dado (`anon` sem GRANT) | ADR-0002 D47; `acesso.ts:84-86`; ofertas.sql:1628-1634 |

- **Contraste:** c1 e a1 veem P na lista e na ficha.
- **Mutações:** tirar a condição de comprador com acesso da leitura do comprador derruba os CT1.5 a CT1.8. Tirar a checagem da página derruba o CT1.5 na tela.

**Critérios da §10**

| ID | Ator | Ação | Esperado | Base |
|---|---|---|---|---|
| CR4.1 | c1 | lista e abre P | P aparece com o resumo proporcional; a ficha mostra os estados e as ressalvas `categoria_pendente.v1` e `categoria_com_apontamentos.v1` | §10.4; §6.2; §6.4; `avisos.ts:21-22` |
| CR4.2 | c1 | oferta só com `not_checked` e `declared_unverified` | aparece, com as ressalvas correspondentes e sem selo | §1.4.1; §6.4 |
| CR4.3 | c1 | PI | não aparece na lista; a ficha mostra "Registro inexistente"; depois de resolvido o impedimento, aparece | ADR-0004 P4 |
| CR6.1 | c1 | categoria `nko` com consulta `nos` | duas informações, cada uma com a própria origem; nenhum rótulo combinado; o estado sem rótulo de origem | §6.5; §10.6; ADR-0004 §2.7 |
| CR6.2 | c1 | categoria sem declaração nem consulta | "Não confirmada" | §6.5, item 5 |
| CR6.3 | c1 | consulta oficial com evidência, registrada pela equipe | rótulo O4; o arquivo não abre | §6.5, item 4; §7.3 |
| CR6.4 | c1 | consulta do fornecedor, de fonte oficial e com evidência | O3, nunca O4 | ADR-0004 §2.7 |
| CR6.5 | c1 | documento DP | conforme a F8 | §10.6; CT2.14 |
| CR7.1 | c1 | ficha de P | as mesmas ressalvas do `notices` da versão vigente, com o texto do catálogo | §10.7; §5.2; ADR-0003 §2.6 |
| CR7.2 | c1 | categoria `no_findings_in_sources` | fonte e data de cada consulta ao lado, e as limitações | §6.4; §6.6; E26 |
| CR7.3 | c1 | card da lista | resumo proporcional, nunca selo único; a qualificação conforme a F23 | §6.4 |
| CR7.4 | — | varredor de linguagem nas telas do comprador | nenhum termo da §6.6 sem a qualificação | §6.6; plano, gate 5 |
| CR10.1 | c1 | resposta de rede de `listOffers` e `getOfferDetails(P)` | sem placa, RENAVAM, chassi, CNPJ, contatos, `details`, `protocol`, autores, caminhos ou ids de documento e de evidência | §10.10; §5.1; §5.2; §7.2; §8; ADR-0004 §2.14; plano I4.1 |
| CR10.2 | c1 | SELECT direto de `plate`, `renavam` e `chassis` do veículo de P pela API | recusado ou sem as colunas | §1.4.6; plano §4 |
| CR10.3 | c1 | linha e URL de DP, pelo servidor e pelo Storage | recusado; nada em `restricted_access_logs` | §7.3; ADR-0003 CT2.14, CT6.4 |
| CR10.4 | c1 | URL da evidência, pelo servidor e pelo bucket | recusado | §7.3; ADR-0004 §2.8 |
| CR10.5 | c1 | foto removida de P, com o caminho conhecido | recusado | ADR-0003 ACH-09 |
| CR10.6 | c1 | empresa F | sem CNPJ nem contatos | ADR-0002 §2.9 |
| CR10.7 | c1 | PT | fora da lista; a ficha mostra "Registro inexistente" | §5.2 |
| CR10.8 | c1 | R, PS, PW, PE, PX, PV, PI e PG (com G suspensa) | fora da lista; a ficha mostra "Registro inexistente", igual a id inexistente | ADR-0003 §2.9; ADR-0002 §2.15 |
| CR10.9 | c1 | filtrar ou buscar por placa, RENAVAM ou chassi | sem efeito ou recusado; a resposta não revela se a placa existe | §5.2; F20 |

**Negativos da §7.4 que tocam o catálogo**

| ID | Ator | Ação | Esperado | Base |
|---|---|---|---|---|
| N2.1 | a1 (`both`) | lê R, DR e a evidência de F pelo catálogo e pela API | 0 linhas | §7.4.2 |
| N5.1 | cx; cs1 depois da suspensão de CS | lista e ficha com o token antigo | recusado na operação seguinte | §7.4.5; §6.1 |
| N6.1 | c1 | URL de foto vencida; caminho sem URL | recusado | §7.4.6; ADR-0003 CT6.7 |
| N7.1 | c1 | PT e as consultas de teste | fora; nenhuma consulta de teste em oferta real | §7.4.7; §5.2 |
| N10.1 | c1 | categoria sem consulta registrada | nunca "Sem apontamentos nas fontes consultadas", nem na ficha nem no resumo | §7.4.10 |
| N11.1 | c1 | UPDATE ou DELETE em declarações, consultas e versões | recusado | §7.4.11 |
| N12.1 | c1 | alterar o preço de P | recusado | §7.4.12; ADR-0003 CT12.2 |

- O teste 3 (negociação) fica no Inc. 5.

### A.8. Ambiguidades

| ID | Tema | O que falta decidir | Opções e consequências | Sugestão | Base |
|---|---|---|---|---|---|
| F1 | `reserved` no catálogo | A visibilidade já está decidida (B19). Falta decidir se a tela marca "reservada" | (a) com rótulo: o comprador sabe que há acordo em curso; (b) sem rótulo: esconde o estado da negociação de outro comprador (§1.4.7) | — | §6.2; §6.8; ADR-0003 §2.14 |
| F2 | Ficha de oferta fora do catálogo | Qual resposta dar a `sold`, `withdrawn`, `expired`, `suspended`, vencida, com impedimento ou de fornecedora suspensa | (a) "Registro inexistente": não revela o motivo, e uma suspensão por fraude não vaza; (b) "oferta indisponível": revela que a oferta existe. O Inc. 5 precisa tratar quem tem negociação aberta (§6.10) | (a), pelo ADR-0002 §2.15 | §6.2; ADR-0002 §2.15; ADR-0003 CT2.10 |
| F3 | Comprador de teste | A §5.2 fala só do "comprador real" | (a) teste vê só teste, e real vê só real: igualdade nos dois sentidos, como a E15; (b) teste vê tudo: dado real em contexto de teste (§4.4); (c) ninguém vê oferta de teste no catálogo: o E2E da homologação fica sem alvo | (a), por analogia com a E15 | §5.2; §4.4; §10.13; ADR-0004 §2.9 |
| F4 | Equipe no catálogo do comprador | A §3.3 diz "sim", mas a função e a regra do servidor excluem a equipe | (a) a área administrativa basta, porque ela já lê tudo; (b) a equipe entra na rota do comprador; (c) uma prévia "como comprador" | — | §3.3; identidade.sql:416-431; `permissoes.ts:43-50` |
| F5 | Oferta da própria empresa `both` | Se aparece no catálogo da empresa; inclui a pessoa com vínculo na dona e numa compradora | (a) aparece como as outras: interesse na própria oferta no Inc. 5; (b) fica fora; (c) aparece marcada, sem interesse | — | §3.3; §6.8 |
| F6 | Identidade do fornecedor | Nome, razão social ou anonimato até o interesse | (a) só o nome: transparência (§1.1); (b) nome e razão social; (c) anônimo: protege contra o negócio feito por fora (C4), mas o comprador perde informação | — (pergunta à pessoa responsável) | §1.3; ADR-0002 §2.9 |
| F7 | Detalhe da declaração | As fontes se contradizem: migração × pacote da D5 | (a) mostra: coerente com o snapshot, que leva o `detail`, e com a ciência (§6.7: "não autoriza ocultar informação"); risco de dado pessoal no texto; (b) oculta: a ciência fica presa a um texto que o comprador não viu; (c) só o valor | (a), pela §6.5 e pela §6.7 | `20261030200000:4-6`; pacote da D5, fora do repositório; snapshot (dominio:683-687); §7.2 |
| F8 | Documentos anexados | Se o comprador vê a linha (tipo, data, descrição) | (a) nada: CT2.14 e plano I4.1; o critério 6 fica atendido na ficha do fornecedor; (b) tipo e data; (c) com a descrição, que é texto livre, com risco de dado pessoal. O arquivo é **D5** | (a), a leitura literal da §7.3 e do CT2.14 | §6.5, item 2; §7.3; §10.6; ADR-0004 A.4 |
| F9 | Evidência | Mostrar "há evidência, oculta" ou "sem evidência anexada", e o rótulo O4 | (a) rótulo O4 e a indicação, com o arquivo oculto: coerente com o snapshot (`has_evidence`) e com a §6.5; (b) só o rótulo; (c) nada: rebaixar a O4 ao comprador contraria a §6.5. **Pendente D5** para abrir o arquivo | (a) | §7.3; ADR-0004 §2.8 (P2), §2.14; `ficha.ts:58-59` |
| F10 | Lado de quem registrou | Se `recorded_as` é "autor" | (a) mostra o lado, sem nome; (b) oculta; a O4 já implica que a equipe registrou | (a): a §2.14 oculta "os autores", isto é, as pessoas | ADR-0004 §2.7, §2.14; `ficha.ts:479-498` |
| F11 | Consultas substituídas | A quem "o histórico fica visível" | (a) mostra: transparência, inclusive de uma ocorrência que deixou de constar; (b) só as vigentes, que são o que o snapshot leva | (a), pela letra da §6.3 | §6.3; ADR-0004 §2.3; dominio:697-707 |
| F12 | Revisão documental | Motivo, autor e revisões fechadas | (a) só "Em análise"; (b) com o motivo, escrito pela equipe para o fornecedor; (c) com o histórico. O snapshot leva só `review: open` | — | §6.4; ADR-0004 §2.5, E12; dominio:692-694; `ficha.ts:96` |
| F13 | Impedimentos resolvidos | Se o comprador vê o histórico | (a) mostra `basis` e datas: o snapshot os leva, e o `basis` copia o detalhe da declaração (F7); (b) só "resolvido em [data]"; (c) oculta: a ciência fica presa a um dado que o comprador não viu | — | dominio:732-742; ADR-0004 §2.11 |
| F14 | Histórico de preço e versões | O que aparece no Inc. 4 | (a) só a versão vigente, porque o §9 não lista histórico para o comprador; (b) as mudanças de preço e as versões | (a), pela letra do §9 | §1.4.5; §9; §10.9 |
| F15 | Datas na ficha | `valid_until`, `published_at`, disponibilidade nunca confirmada | mostrar ou não cada uma; o texto para disponibilidade nula | a data da disponibilidade, pela letra da §6.9 | §6.9 |
| F16 | Conteúdo do card da lista | A especificação só pede o resumo | quais campos e se há foto principal (cada foto custa uma URL temporária) | — | §6.4 |
| F17 | Ano no filtro | Qual ano | fabricação, modelo ou os dois | — | §9 |
| F18 | Localização e categoria | UF, cidade, ou os dois; restrição por região ou categoria | genérico agora; a restrição é **pendente C6** | genérico (plano) | §9; §13 C6; plano, l. 225 e 305 |
| F19 | Filtro de estado documental | O que filtrar | (a) categoria × estado, com os rótulos da §6.4; (b) agregados positivos, que funcionam como selo único e sugerem verificação (§1.4.2; §6.4); (c) estado em qualquer categoria | (a) | §6.4; §6.6; §7.3 |
| F20 | Busca textual | Quais campos | só os mostrados na lista; ou também as condições comerciais (texto livre); nunca os restritos, porque a busca por placa diria se a placa existe | — | plano I4.2; §5.2 |
| F21 | Ordenação | Padrão e opções | data de publicação, preço, km, ano; ordenar por "qualidade documental" sugere verificação | — | plano I4.2; §1.4.2 |
| F22 | Paginação | Tamanho da página e contagem total | — | — | §8 (cursor) |
| F23 | Resumo sem data no card | A §6.6 pede "em [data]" | (a) remeter à ficha, como na R-I3.7-12; (b) data da consulta mais recente no card; (c) tirar esse estado do card | (a), pelo precedente | §6.6; ADR-0004 R-I3.7-12, E26 |
| F24 | Usuário suspenso | A área do comprador mostra "Sem permissão", e as outras, "Acesso suspenso" | uniformizar ou manter | "Acesso suspenso", pelo ADR-0002 §2.9 | `(comprador)/layout.tsx:15-18`; `comprador/page.tsx:16`; `inicio/page.tsx:36` |
| F25 | Anônimo | O ADR-0002 D47 diz "sem permissão", e o código redireciona para "Entrar" | corrigir o texto do ADR ou o código | — | ADR-0002 A.7; `acesso.ts:84-86` |
| F26 | Limite de taxa no catálogo | Se a lista é uma "rota sensível" | (a) com limite, contra a raspagem por quem tem acesso; (b) sem limite | — | §7.1; §2.3 ("scraping em escala") |

- **Dependências da §13:**
  - **D5:** F8 (arquivo), F9, os textos das ressalvas e a forma de abrir a visibilidade (§7.3).
  - **C6:** F18.
- **Perguntas da lista do início:** F3, F5, F6, F7, F8, F11 a F14 e F19.

### A.9. Estado atual do código

**O que a I4.1 pode reaproveitar:**
- **Banco: acesso e oferta aberta**
  - `private.pode_ver_catalogo()`: identidade.sql:416-431, com EXECUTE para `authenticated` em :1093-1104; pgTAP em `170-isolamento-e-catalogo.test.sql:236-262`.
  - `private.oferta_aberta(uuid)`: dominio:252-268; pgTAP em 310:611, 380:315 e 400:708-745.
  - `private.tem_impedimento_ativo`: dominio:238-248. `private.situacao_da_oferta`: ressalvas_da_oferta:22-32.
- **Banco: estados documentais**
  - `private.estado_documental`: dominio:272-329.
  - `private.consultas_vigentes`: dominio:210-221.
  - `private.revisao_aberta`: dominio:224-235.
  - `private.precedencia_documental`: estado_documental:19-33.
  - `private.aviso_do_estado`: dominio:332-346.
  - `private.estados_documentais_da_oferta`: ressalvas_do_documental:64-106.
  - `public.estados_documentais`: estado_documental:208-227 (`security invoker`).
- **Banco: snapshot**
  - `private.snapshot_da_oferta`: dominio:625-746. Placa, RENAVAM e chassi nunca entram (comentário em ofertas.sql:504-505). Leva o `detail`, as consultas vigentes com `has_evidence`, a revisão aberta e os impedimentos.
- **Storage:** `private.pode_ler_foto_da_oferta` (storage_das_ofertas:76-88) e a política `offer_photos_leitura` (:108-111).
- **Servidor e regras:**
  - `consultarEstadosDocumentais`: `documental/server/estados.ts:202-294`.
  - `resumoProporcional`, `ROTULO_DO_ESTADO`, `ROTULO_DA_ORIGEM`, `origemDaConsulta` e `rotuloDaCategoria`: `documental/rules/estados.ts:24-31, 155-207, 226-241`.
  - `AVISOS` e `textoDoAviso`: `rules/avisos.ts:14-68`.
  - `textoDoEstado`, `montarFicha`, `resumoTemSemApontamentos` e `ressalvasSemImpedimento`: `ui/ficha.ts:191-209, 313-385, 396-400, 432-436`.
  - `ResumoPorCategoria` e `FichaDocumental`: `ui/ficha-documental.tsx:86-112, 337`.
  - `gerarUrlDaFoto`, pela sessão, com a foto não removida: `offers/storage/servidor.ts:194-225`. `listarFotos`: `offers/queries/ofertas.ts:372-400`.
  - `rules/snapshot.ts`: hash fora do banco.
- **Telas e acesso:**
  - `verificarAcesso`: `auth/queries/acesso.ts:79-98`. `podeVerCatalogo`: `permissoes.ts:43-50`.
  - `(comprador)/layout.tsx:12-21`; `comprador/page.tsx`; `comprador/ofertas/[id]/page.tsx`; `loading.tsx`; `error.tsx`.
  - `components/estados.tsx`: `SemPermissao` :12, `RegistroInexistente` :32, `AcessoSuspenso` :54, `Vazio` :67, `Carregando` :75, `Aviso` :83.
  - O link do catálogo no cabeçalho usa `podeVerCatalogo` (`layout-logado.tsx:28`).
- **Testes:**
  - E2E `acesso.spec.mts:88-139`: o teste 1 sobre a página provisória.
  - E2E `ofertas.spec.mts:411-431`: a empresa só compradora não tem link de ofertas na área da empresa e vê "Ofertas são cadastradas por empresa fornecedora."
- **Limite de tentativas** (se a F26 for "sim"): migração `20261028180000_limite_de_tentativas` (ADR-0002 §2.16).

**O que falta (fatos):**
- **Nenhuma política de leitura para o comprador.**
  - `offers`, `vehicles`, `offer_versions`, `supplier_declarations`, `offer_media`, `offer_documents` e `offer_reviews` leem só a empresa dona e a equipe (ofertas.sql:1404-1475).
  - Com `check_evidence_files`, `vehicle_checks`, `documental_reviews` e `transfer_impediments` é igual (dominio:1092-1131).
  - Em `organizations`, só quem tem vínculo e a equipe (identidade.sql:974-978).
  - No bucket de fotos, só a dona e a equipe.
- **SELECT na tabela inteira.** O SELECT é concedido em toda a tabela, sem GRANT por coluna: `vehicles` e `offers` (ofertas.sql:1632-1634), `organizations` (identidade.sql:1071-1073).
  - Não existe nenhuma visão: nenhum `create view` nas migrações.
  - As visões sem campos restritos citadas no ADR-0002 §2.9 e no ADR-0003 §2.11 e §2.14 ainda não foram criadas.
- **`private.oferta_aberta` sem EXECUTE para `authenticated`.** O revoke está em ofertas.sql:1658, e o grant de :1682-1689 não a inclui.
- **`private.conferir_leitura_da_oferta` recusa o comprador** (ressalvas_da_oferta:38-60). Por isso, `estados_documentais_da_oferta` (e, por ela, o snapshot) também recusa.
  - O comentário pede que a função mude junto com a política (:34-37; ADR-0003 ACH-02).
  - A R-I2.11-07 pede uma variante interna do versionamento antes do Inc. 4 ou 5.
- **Fotos:** a política do comprador ainda não existe. A ACH-09 pede que ela exija uma linha de `offer_media` não removida.
- **Sem operações e telas do catálogo:**
  - não há `listOffers`, `getOfferDetails`, filtros, ordenação, paginação nem busca;
  - a página do catálogo é provisória (`comprador/page.tsx:19`), e a ficha responde "Registro inexistente" para todo id (`[id]/page.tsx:25-30`);
  - não existe `tests/e2e/catalogo/`.
- **As leituras do fornecedor trazem os campos restritos:** placa, RENAVAM e chassi (`queries/ofertas.ts:73-74, 220`) e protocolo e autores (`documental/queries/registros.ts:119-142`). São do fornecedor e da equipe.
- **Sem regra de teste para o comprador:** `organizations.is_test` existe (identidade.sql:184), mas nenhuma função liga o `is_test` do comprador ao da oferta.

### A.10. Reaproveitamento

- **Padrão do mapa para o Inc. 4:** "CHECKs de completude por estado; RLS com GRANT por coluna \| I2.3, I4.1 \| T2" (plano §4, l. 95). O diagnóstico §4 (l. 58) qualifica: "RLS com GRANT por coluna para esconder campos sensíveis \| médio: o catálogo novo é privado".
- **Leitura multiempresa:** o ADR-0003 A.8 (l. 941) diz que "no multiempresa, a separação entre dono e comprador vem por tabela ou visão; um teste confere que toda coluna está classificada".
- **Não portar:** "leitura pública do catálogo" (plano §4, l. 105; diagnóstico §4, l. 64; ADR-0003 A.8, l. 944).
- **Referências detalhadas:** ficam em `notas-privadas/` (plano §4, l. 90). A extração não leu essa pasta.
- **Fora do Inc. 4** (plano, "Depois do piloto", l. 288-289):
  - o perfil de interesse com alerta, que depende do Inc. 4, da C6, do Inc. 5 e da D6, e "Segue as regras do catálogo";
  - o copiloto de decisões e busca, com escopo a definir.
