# Roteiro da revisão externa da I3.8 (Inc. 3, domínio documental)

**Para:** o revisor externo (Antigravity, AG), fora do Claude Code.
**Preparado por:** T2, em 30/10/2026.
**Base:** plano orquestrado, I3.8; ADR-0004 (decisões, respostas P1 a P4 e ressalvas da §8); especificação v1.1, §6.3 a §6.6 e §6.11.

## O que revisar

O Inc. 3 completa o estado documental da oferta: consultas registradas à mão (`vehicle_checks`), revisões documentais (`documental_reviews`), impedimentos de transferência (`transfer_impediments`) e evidências das consultas (`check_evidence_files`, bucket privado `check-evidence`). O plano pede um olhar externo sobre seis pontos:

1. **Consulta pendente:** "Aguardando resultado" e "Inconclusivo" aparecem como pendência, por extenso, e saem quando o resultado chega numa consulta nova que substitui a anterior.
2. **Apontamento:** consulta com ocorrência e ocorrência declarada aparecem como "Com apontamentos", com a origem de cada informação separada (§6.5).
3. **Divergência:** "sem ocorrência conhecida" declarada com consulta que tem ocorrência fica "Em análise". Ocorrência declarada com consulta sem ocorrência fica "Com apontamentos", pela decisão P1 da pessoa responsável.
4. **Alteração posterior:** consulta nova, revisão e impedimento geram versão nova da oferta, e o registro anterior continua legível e intacto (só inclusão).
5. **Falso estado de verificação:** "Sem apontamentos nas fontes consultadas" só existe com consulta registrada, sempre com a fonte e a data ao lado. Nenhum texto afirma verificação ou garantia (§6.6). Consulta de teste nunca se liga a oferta real.
6. **Rastreabilidade:** quem consultou, quem registrou, quando, a fonte, as limitações e a evidência. A evidência só abre pelo servidor, com registro de acesso.

## Onde olhar

- **Código:** o diff `89b330d..HEAD` da branch `main` do repositório `85dyones/ideal-garbanzo`. As migrações são `20261030120000`, `20261030150000` e `20261030180000`; o servidor fica em `src/modules/documental/`; as telas, em `src/app/(conta)/empresa/[empresaId]/ofertas/[ofertaId]/` e `src/app/(admin)/admin/ofertas/[ofertaId]/`.
- **Decisões e ressalvas:** ADR-0004 §2, §6, §7 e §8. A §8 traz a revisão do T3 e o que já foi corrigido.
- **Evidência de testes:**
  - `supabase/tests/database/400` a `430` (pgTAP);
  - `tests/integration/documental-operacoes.test.ts` e `estado-documental-paridade.test.ts`;
  - `tests/e2e/documental.spec.mts`;
  - mutações em `supabase/tests/mutacoes/inc-3.md`.
- **Ambiente de homologação:** o preview da Vercel da `main`, atrás da autenticação da Vercel, ligado ao projeto Supabase de desenvolvimento, que só tem dados de teste. O acesso e as contas de teste não ficam neste arquivo. A pessoa responsável os entrega ao revisor por fora, a partir de `notas-privadas/`.

## Fora do escopo

- O catálogo do comprador (Inc. 4) e o que ele vê da ficha.
- O texto jurídico (D5): os textos das telas são provisórios.
- A integração automática de consulta (C7).

## Entrega esperada

- Um relatório com veredito ("sem crítico aberto" ou não).
- Achados com severidade, tela ou arquivo, cenário e correção sugerida.
- O T2 confere cada achado antes de registrar no ADR-0004 e no `current-task.md`.
