/**
 * Situação do convite de fornecedora (ADR-0002 §9). O banco guarda só
 * `pending`, `used` e `revoked`; o vencimento conta pela data, e o convite
 * vencido continua `pending` sem servir para nada.
 */
export const STATUS_DO_CONVITE = ["pending", "used", "revoked"] as const;
export type StatusDoConvite = (typeof STATUS_DO_CONVITE)[number];

export type SituacaoDoConvite = "pendente" | "vencido" | "usado" | "revogado";

export function ehStatusDoConvite(valor: unknown): valor is StatusDoConvite {
  return STATUS_DO_CONVITE.some((status) => status === valor);
}

export function situacaoDoConvite(
  status: StatusDoConvite,
  venceEm: Date,
  agora: Date,
): SituacaoDoConvite {
  if (status === "used") return "usado";
  if (status === "revoked") return "revogado";
  return venceEm.getTime() > agora.getTime() ? "pendente" : "vencido";
}
