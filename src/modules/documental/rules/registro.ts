/**
 * Quem registra consulta e evidência, quem revisa a documentação e quem
 * resolve o impedimento (ADR-0004 §2.5, §2.9 e §2.11). Repete
 * `private.pode_registrar_consulta` e os gatilhos de revisão e de impedimento
 * (migração `20261030120000_dominio_documental`); o servidor responde cedo, e
 * o banco decide.
 */
import {
  podeEditarConteudo,
  situacaoParaEdicao,
} from "@/modules/offers/rules/edicao";
import type {
  AtorDaOferta,
  StatusDaOferta,
} from "@/modules/offers/rules/transicoes";

/** Estados em que a equipe da plataforma registra consulta e revisa (E17). */
const ESTADOS_DA_EQUIPE: readonly StatusDaOferta[] = [
  "draft",
  "under_review",
  "published",
  "reserved",
  "suspended",
];

export function ehDaEquipeSemVinculo(ator: AtorDaOferta): boolean {
  return ator === "operador" || ator === "administrador";
}

/**
 * O fornecedor segue a tabela de edição (ADR-0003 §2.5, com a vencida como
 * expirada); a equipe sem vínculo, os estados da E17.
 */
export function podeRegistrarConsulta(
  status: StatusDaOferta,
  ator: AtorDaOferta,
  validadeVencida: boolean,
): boolean {
  if (ator === "membro" || ator === "adm_empresa") {
    return podeEditarConteudo(status, ator, validadeVencida);
  }
  return (
    ehDaEquipeSemVinculo(ator) &&
    ESTADOS_DA_EQUIPE.includes(situacaoParaEdicao(status, validadeVencida))
  );
}

/** Revisão documental: só a equipe sem vínculo, nos estados da E17 (E19). */
export function podeRevisarDocumentacao(
  status: StatusDaOferta,
  ator: AtorDaOferta,
  validadeVencida: boolean,
): boolean {
  return (
    ehDaEquipeSemVinculo(ator) &&
    ESTADOS_DA_EQUIPE.includes(situacaoParaEdicao(status, validadeVencida))
  );
}

/** Só o administrador da plataforma, sem vínculo com a empresa dona, resolve (E21). */
export function podeResolverImpedimento(ator: AtorDaOferta): boolean {
  return ator === "administrador";
}
