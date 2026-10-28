/** Contexto do usuário carregado do banco a cada operação (ADR-0002 §2.1 e §2.3). */
import type { VinculoDoUsuario } from "@/modules/organizations/tipos";

export const PAPEIS_NA_PLATAFORMA = ["admin", "operator"] as const;
export type PapelNaPlataforma = (typeof PAPEIS_NA_PLATAFORMA)[number];

export interface ContextoDoUsuario {
  readonly perfilId: string;
  readonly emailConfirmado: boolean;
  /** Papel ativo na plataforma; `null` sem papel ou com papel revogado. */
  readonly papelNaPlataforma: PapelNaPlataforma | null;
  readonly podeLerAuditoria: boolean;
  readonly vinculos: readonly VinculoDoUsuario[];
}
