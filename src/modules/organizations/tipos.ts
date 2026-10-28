/** Domínios de empresa e vínculo (migração `20261028140000_identidade`; ADR-0002 §2.10). */
export const TIPOS_DE_EMPRESA = ["supplier", "buyer", "both"] as const;
export type TipoDeEmpresa = (typeof TIPOS_DE_EMPRESA)[number];

export type StatusDaEmpresa = "pending" | "active" | "suspended" | "closed";

export const PAPEIS_NA_EMPRESA = ["org_admin", "member"] as const;
export type PapelNaEmpresa = (typeof PAPEIS_NA_EMPRESA)[number];

export type StatusDoVinculo = "pending" | "active" | "suspended" | "removed";

export interface VinculoDoUsuario {
  readonly vinculoId: string;
  readonly organizationId: string;
  readonly papel: PapelNaEmpresa;
  readonly status: StatusDoVinculo;
  /** Nulo quando a RLS não mostra a empresa (vínculo suspenso ou removido). */
  readonly empresa: {
    readonly status: StatusDaEmpresa;
    readonly kind: TipoDeEmpresa;
  } | null;
}
