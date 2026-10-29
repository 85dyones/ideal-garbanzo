/**
 * Catálogo das ressalvas exibidas (especificação v1.1, §5.2 e §6.7; ADR-0003
 * §2.6). O snapshot da versão grava o código, com a versão do texto; a ciência
 * do comprador fica presa ao texto exato que foi mostrado. Mudar um texto cria
 * um código novo, e o antigo continua aqui.
 *
 * Os códigos saem de `private.aviso_do_estado` (migração
 * `20261029160000_estado_documental`). Textos provisórios, revistos com a
 * decisão D5 antes do piloto.
 */
import type { EstadoDocumental } from "./estados";

export const AVISOS = {
  "categoria_nao_consultada.v1":
    "Há categorias sem consulta registrada. A plataforma não confirmou essas informações.",
  "declaracao_sem_comprovacao.v1":
    "Há informações declaradas pelo fornecedor, sem consulta nem documento que as confirme.",
  "categoria_com_apontamentos.v1":
    "Há categorias com apontamentos. Leia o detalhe de cada uma antes de seguir.",
} as const satisfies Readonly<Record<string, string>>;
export type CodigoDoAviso = keyof typeof AVISOS;

const AVISO_DO_ESTADO: Readonly<
  Partial<Record<EstadoDocumental, CodigoDoAviso>>
> = {
  not_checked: "categoria_nao_consultada.v1",
  declared_unverified: "declaracao_sem_comprovacao.v1",
  with_findings: "categoria_com_apontamentos.v1",
};

/** Código da ressalva de um estado, como `private.aviso_do_estado`. */
export function avisoDoEstado(
  estado: EstadoDocumental,
): CodigoDoAviso | undefined {
  return AVISO_DO_ESTADO[estado];
}

/** Ressalvas de um conjunto de estados, sem repetição e em ordem de código. */
export function avisosDosEstados(
  estados: readonly EstadoDocumental[],
): CodigoDoAviso[] {
  const codigos = new Set<CodigoDoAviso>();
  for (const estado of estados) {
    const codigo = avisoDoEstado(estado);
    if (codigo !== undefined) codigos.add(codigo);
  }
  return [...codigos].sort();
}

export function textoDoAviso(codigo: CodigoDoAviso): string {
  return AVISOS[codigo];
}
