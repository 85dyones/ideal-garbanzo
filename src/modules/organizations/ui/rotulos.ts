/** Rótulos em português dos domínios de empresa e vínculo (ADR-0002 §2.10). */
import type {
  PapelNaEmpresa,
  StatusDaEmpresa,
  StatusDoVinculo,
  TipoDeEmpresa,
} from "../tipos";

export const ROTULO_DO_TIPO: Readonly<Record<TipoDeEmpresa, string>> = {
  supplier: "Fornecedora",
  buyer: "Compradora",
  both: "Fornecedora e compradora",
};

export const ROTULO_DO_STATUS_DA_EMPRESA: Readonly<
  Record<StatusDaEmpresa, string>
> = {
  pending: "Pendente",
  active: "Ativa",
  suspended: "Suspensa",
  closed: "Encerrada",
};

export const ROTULO_DO_PAPEL: Readonly<Record<PapelNaEmpresa, string>> = {
  org_admin: "Administrador da empresa",
  member: "Membro",
};

export const ROTULO_DO_STATUS_DO_VINCULO: Readonly<
  Record<StatusDoVinculo, string>
> = {
  pending: "Convite pendente",
  active: "Ativo",
  suspended: "Suspenso",
  removed: "Removido",
};

/** Rótulo do valor, ou o próprio valor se ele estiver fora do domínio. */
export function rotulo<T extends string>(
  tabela: Readonly<Record<T, string>>,
  valor: string,
): string {
  return (tabela as Readonly<Record<string, string>>)[valor] ?? valor;
}
