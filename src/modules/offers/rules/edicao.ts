/**
 * Quem altera a oferta sem mudar o estado (ADR-0003 §2.5 e §2.9). Repete
 * `private.conferir_edicao` e o caminho da disponibilidade do gatilho
 * `private.proteger_oferta`; o teste `ofertas-transicoes` confere os dois
 * lados em todos os estados e atores.
 */
import type { AtorDaOferta, StatusDaOferta } from "./transicoes";

const FORNECEDOR: readonly AtorDaOferta[] = ["membro", "adm_empresa"];

/**
 * Conteúdo (oferta, veículo, declarações, fotos e documentos): F no
 * rascunho; só o `org_admin` na publicada ou reservada (Q2); ninguém nos
 * demais estados. O staff nunca (Q3).
 */
export function podeEditarConteudo(
  status: StatusDaOferta,
  ator: AtorDaOferta,
): boolean {
  if (status === "draft") return FORNECEDOR.includes(ator);
  if (status === "published" || status === "reserved") {
    return ator === "adm_empresa";
  }
  return false;
}

/** Disponibilidade: qualquer F, na oferta publicada ou reservada (B10). */
export function podeConfirmarDisponibilidade(
  status: StatusDaOferta,
  ator: AtorDaOferta,
): boolean {
  return (
    (status === "published" || status === "reserved") &&
    FORNECEDOR.includes(ator)
  );
}
