/**
 * Estados documentais e origem da informação (especificação v1.1, §6.4 e
 * §6.5; ADR-0003 §2.12). O estado é calculado no banco
 * (`private.estado_documental`, migração `20261029160000_estado_documental`);
 * estas regras repetem o mapeamento para a tela e para os testes que conferem
 * que os dois lados dizem o mesmo.
 *
 * Os rótulos são os da tabela da §6.4. Nenhum deles afirma verificação: o
 * único estado "sem apontamentos" leva a qualificação "nas fontes
 * consultadas" (§6.6).
 */

export const ESTADOS_DOCUMENTAIS = [
  "not_checked",
  "declared_unverified",
  "pending",
  "under_review",
  "with_findings",
  "no_findings_in_sources",
] as const;
export type EstadoDocumental = (typeof ESTADOS_DOCUMENTAIS)[number];

export const ROTULO_DO_ESTADO: Readonly<Record<EstadoDocumental, string>> = {
  not_checked: "Não consultado",
  declared_unverified: "Informação declarada, sem comprovação",
  pending: "Pendente ou incompleto",
  under_review: "Em análise",
  with_findings: "Com apontamentos",
  no_findings_in_sources: "Sem apontamentos nas fontes consultadas",
};

/** Precedência da §6.4, do que mais pesa para o que menos pesa. */
export const PRECEDENCIA: readonly EstadoDocumental[] = [
  "under_review",
  "with_findings",
  "pending",
  "no_findings_in_sources",
  "declared_unverified",
  "not_checked",
];

/** Entre os estados candidatos, o de maior precedência; sem candidato, `not_checked`. */
export function estadoPrevalente(
  candidatos: readonly EstadoDocumental[],
): EstadoDocumental {
  return (
    PRECEDENCIA.find((estado) => candidatos.includes(estado)) ?? "not_checked"
  );
}

export const VALORES_DECLARADOS = [
  "no_known_occurrence",
  "has_occurrence",
  "unknown",
] as const;
export type ValorDeclarado = (typeof VALORES_DECLARADOS)[number];

export const ROTULO_DO_VALOR_DECLARADO: Readonly<
  Record<ValorDeclarado, string>
> = {
  no_known_occurrence: "Não conhece ocorrência",
  has_occurrence: "Há ocorrência",
  unknown: "Desconhece",
};

/**
 * Estado que vem só da declaração (ADR-0003 §2.12, B29): "desconhece" e a
 * falta de declaração ficam como não consultado.
 */
export function estadoPelaDeclaracao(
  valor: ValorDeclarado | null,
): EstadoDocumental {
  switch (valor) {
    case "no_known_occurrence":
      return "declared_unverified";
    case "has_occurrence":
      return "with_findings";
    default:
      return "not_checked";
  }
}

/** Origens da informação da §6.5, que a interface nunca funde num rótulo só. */
export const ORIGENS = [
  "supplier_declaration",
  "attached_document",
  "check_result",
  "independent_evidence",
  "unconfirmed",
] as const;
export type Origem = (typeof ORIGENS)[number];

export const ROTULO_DA_ORIGEM: Readonly<Record<Origem, string>> = {
  supplier_declaration: "Declarada pelo fornecedor",
  attached_document: "Documento anexado",
  check_result: "Resultado de consulta",
  independent_evidence: "Confirmada por evidência independente",
  unconfirmed: "Não confirmada",
};

/** Categorias iniciais da §5.3. A lista vigente fica na configuração. */
const ROTULO_DA_CATEGORIA: Readonly<Record<string, string>> = {
  debts_ipva: "Débitos de IPVA",
  debts_licensing: "Débitos de licenciamento",
  debts_fines: "Multas",
  administrative_restrictions: "Restrições administrativas",
  judicial_restrictions: "Restrições judiciais",
  lien: "Gravame",
  theft_recovery: "Roubo, furto e recuperação",
  casualty: "Sinistro e danos relevantes",
  auction: "Passagem por leilão",
  transfer_conditions: "Condições de transferência",
};

/** Rótulo da categoria; uma categoria nova da configuração aparece pelo código. */
export function rotuloDaCategoria(categoria: string): string {
  return ROTULO_DA_CATEGORIA[categoria] ?? categoria;
}

const NO_RESUMO: Readonly<
  Record<EstadoDocumental, { singular: string; plural: string }>
> = {
  under_review: { singular: "em análise", plural: "em análise" },
  with_findings: { singular: "com apontamentos", plural: "com apontamentos" },
  pending: { singular: "pendente", plural: "pendentes" },
  no_findings_in_sources: {
    singular: "sem apontamentos nas fontes consultadas",
    plural: "sem apontamentos nas fontes consultadas",
  },
  declared_unverified: {
    singular: "declarada sem comprovação",
    plural: "declaradas sem comprovação",
  },
  not_checked: { singular: "não consultada", plural: "não consultadas" },
};

/**
 * Resumo proporcional do catálogo e das notificações (§6.4), na ordem da
 * precedência: por exemplo, "1 com apontamentos, 9 não consultadas". Nunca um
 * selo único.
 */
export function resumoProporcional(
  estados: readonly EstadoDocumental[],
): string {
  return PRECEDENCIA.flatMap((estado) => {
    const quantidade = estados.filter((e) => e === estado).length;
    if (quantidade === 0) return [];
    const texto =
      quantidade === 1 ? NO_RESUMO[estado].singular : NO_RESUMO[estado].plural;
    return [`${String(quantidade)} ${texto}`];
  }).join(", ");
}
