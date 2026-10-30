/**
 * Quem altera a oferta sem mudar o estado (ADR-0003 §2.5 e §2.9). Repete
 * `private.conferir_edicao`, `private.situacao_da_oferta` e o caminho da
 * disponibilidade do gatilho `private.proteger_oferta`; o teste
 * `ofertas-transicoes` confere os dois lados em todos os estados e atores,
 * com e sem a validade vencida.
 */
import type { AtorDaOferta, StatusDaOferta } from "./transicoes";

const FORNECEDOR: readonly AtorDaOferta[] = ["membro", "adm_empresa"];

/** Recusa do servidor para a publicada ou reservada vencida. */
export const MENSAGEM_DA_VALIDADE_VENCIDA =
  "A validade da oferta venceu. Até passar a “Expirada”, o que acontece automaticamente, ela não pode ser alterada, reservada nem liberada.";

/** A publicada ou reservada com a validade vencida, antes da rodada da expiração (§2.9). */
export function vencidaAntesDaExpiracao(
  status: StatusDaOferta,
  validadeVencida: boolean,
): boolean {
  return validadeVencida && (status === "published" || status === "reserved");
}

/**
 * Situação para editar e confirmar a disponibilidade: a vencida antes da
 * rodada já se comporta como expirada (§2.9).
 */
export function situacaoParaEdicao(
  status: StatusDaOferta,
  validadeVencida: boolean,
): StatusDaOferta {
  return vencidaAntesDaExpiracao(status, validadeVencida) ? "expired" : status;
}

/**
 * Conteúdo (oferta, veículo, declarações, fotos e documentos): F no
 * rascunho; só o `org_admin` na publicada ou reservada dentro da validade
 * (Q2); ninguém nos demais estados. O staff nunca (Q3).
 */
export function podeEditarConteudo(
  status: StatusDaOferta,
  ator: AtorDaOferta,
  validadeVencida: boolean,
): boolean {
  const situacao = situacaoParaEdicao(status, validadeVencida);
  if (situacao === "draft") return FORNECEDOR.includes(ator);
  if (situacao === "published" || situacao === "reserved") {
    return ator === "adm_empresa";
  }
  return false;
}

/** Disponibilidade: qualquer F, na publicada ou reservada dentro da validade (B10). */
export function podeConfirmarDisponibilidade(
  status: StatusDaOferta,
  ator: AtorDaOferta,
  validadeVencida: boolean,
): boolean {
  const situacao = situacaoParaEdicao(status, validadeVencida);
  return (
    (situacao === "published" || situacao === "reserved") &&
    FORNECEDOR.includes(ator)
  );
}
