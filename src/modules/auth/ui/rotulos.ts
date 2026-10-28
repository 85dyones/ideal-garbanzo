/** Rótulos do perfil e dos papéis na plataforma (ADR-0002 §2.10). */
import type { PapelNaPlataforma } from "../tipos";

export const ROTULO_DO_STATUS_DO_PERFIL: Readonly<
  Record<"active" | "suspended", string>
> = {
  active: "Ativo",
  suspended: "Suspenso",
};

export const ROTULO_DO_PAPEL_NA_PLATAFORMA: Readonly<
  Record<PapelNaPlataforma, string>
> = {
  admin: "Administrador da plataforma",
  operator: "Operador da plataforma",
};

export const ROTULO_DO_STATUS_DO_PAPEL: Readonly<
  Record<"active" | "revoked", string>
> = {
  active: "Ativo",
  revoked: "Revogado",
};
