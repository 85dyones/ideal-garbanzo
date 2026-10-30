/**
 * Máquina de estados da oferta (especificação v1.1, §6.2; ADR-0003 §2.3).
 *
 * É a mesma tabela do gatilho `private.proteger_oferta` (migração
 * `20261029120000_ofertas`). O servidor a usa para responder cedo, com erro
 * previsível; quem decide é o banco. O teste de integração
 * `ofertas-transicoes` percorre todos os pares de estados, todos os atores e
 * os dois valores da D10 e confere que os dois lados dizem o mesmo.
 */
import { vinculoAtivo } from "@/modules/auth/rules/permissoes";
import type { ContextoDoUsuario } from "@/modules/auth/tipos";

export const STATUS_DA_OFERTA = [
  "draft",
  "under_review",
  "published",
  "reserved",
  "sold",
  "withdrawn",
  "expired",
  "suspended",
] as const;
export type StatusDaOferta = (typeof STATUS_DA_OFERTA)[number];

export const ROTULO_DO_STATUS: Readonly<Record<StatusDaOferta, string>> = {
  draft: "Rascunho",
  under_review: "Em revisão",
  published: "Publicada",
  reserved: "Reservada",
  sold: "Vendida",
  withdrawn: "Retirada",
  expired: "Expirada",
  suspended: "Suspensa",
};

/**
 * Quem age, em relação à empresa dona da oferta (legenda da ADR-0003 §2.3):
 * - `membro` e `adm_empresa`: F e F-adm, com vínculo ativo e a empresa ativa;
 * - `operador` e `administrador`: staff sem vínculo com a empresa dona (B25);
 * - `sistema`: a rotina de expiração do banco;
 * - `nenhum`: os demais, inclusive o staff com vínculo pendente ou suspenso
 *   com a empresa dona.
 */
export const ATORES_DA_OFERTA = [
  "membro",
  "adm_empresa",
  "operador",
  "administrador",
  "sistema",
  "nenhum",
] as const;
export type AtorDaOferta = (typeof ATORES_DA_OFERTA)[number];

export type IdDaTransicao =
  | "T03"
  | "T04"
  | "T05"
  | "T06"
  | "T08"
  | "T09"
  | "T11"
  | "T12"
  | "T13"
  | "T14"
  | "T15"
  | "T18"
  | "T19";

export interface Transicao {
  readonly id: IdDaTransicao;
  readonly de: readonly StatusDaOferta[];
  readonly para: StatusDaOferta;
  readonly quem: readonly AtorDaOferta[];
  /** Atores que precisam informar o motivo (cabeçalho `x-audit-reason`). */
  readonly motivoDe: readonly AtorDaOferta[];
  /** Vale só com a revisão antes de publicar exigida (`true`) ou dispensada (`false`), conforme a D10. */
  readonly revisaoExigida?: boolean;
  /** Vale só com a validade vencida. */
  readonly soComValidadeVencida?: true;
  /**
   * Vale só dentro da validade: a publicada ou reservada vencida já se
   * comporta como expirada, antes da rodada da expiração (ADR-0003 §2.9).
   */
  readonly soComValidadeEmVigor?: true;
}

const F: readonly AtorDaOferta[] = ["membro", "adm_empresa"];
const F_ADM: readonly AtorDaOferta[] = ["adm_empresa"];
const ST: readonly AtorDaOferta[] = ["operador", "administrador"];

/** Tabela da ADR-0003 §2.3. Nenhuma transição leva a `sold` no Inc. 2 (X17). */
export const TRANSICOES: readonly Transicao[] = [
  {
    id: "T03",
    de: ["draft"],
    para: "under_review",
    quem: F_ADM,
    motivoDe: [],
    revisaoExigida: true,
  },
  { id: "T18", de: ["under_review"], para: "draft", quem: F, motivoDe: [] },
  {
    id: "T04",
    de: ["under_review"],
    para: "published",
    quem: ST,
    motivoDe: [],
  },
  { id: "T05", de: ["under_review"], para: "draft", quem: ST, motivoDe: ST },
  {
    id: "T06",
    de: ["draft"],
    para: "published",
    quem: F_ADM,
    motivoDe: [],
    revisaoExigida: false,
  },
  {
    id: "T08",
    de: ["published"],
    para: "reserved",
    quem: [...F_ADM, ...ST],
    motivoDe: [],
    soComValidadeEmVigor: true,
  },
  {
    id: "T09",
    de: ["reserved"],
    para: "published",
    quem: [...F_ADM, ...ST],
    motivoDe: [],
    soComValidadeEmVigor: true,
  },
  {
    id: "T11",
    de: ["draft", "under_review", "published", "reserved", "expired"],
    para: "withdrawn",
    quem: [...F_ADM, ...ST],
    motivoDe: ST,
  },
  { id: "T19", de: ["withdrawn"], para: "draft", quem: F_ADM, motivoDe: [] },
  {
    id: "T12",
    de: ["published", "reserved"],
    para: "expired",
    quem: ["sistema"],
    motivoDe: [],
    soComValidadeVencida: true,
  },
  { id: "T13", de: ["expired"], para: "draft", quem: F_ADM, motivoDe: [] },
  {
    id: "T14",
    de: [
      "draft",
      "under_review",
      "published",
      "reserved",
      "withdrawn",
      "expired",
    ],
    para: "suspended",
    quem: ST,
    motivoDe: ST,
  },
  {
    id: "T15",
    de: ["suspended"],
    para: "draft",
    quem: ["administrador"],
    motivoDe: ["administrador"],
  },
];

export interface CondicoesDaTransicao {
  /** Valor de `offer_review_required` no momento da transição (D10). */
  readonly revisaoExigida: boolean;
  /** `valid_until` já passou. */
  readonly validadeVencida: boolean;
}

/** As transições de `de` para `para`, qualquer que seja o ator. */
export function transicoesEntre(
  de: StatusDaOferta,
  para: StatusDaOferta,
): readonly Transicao[] {
  return TRANSICOES.filter(
    (transicao) => transicao.para === para && transicao.de.includes(de),
  );
}

/** A transição que o ator pode fazer de `de` para `para`; `undefined` se nenhuma. */
export function transicaoDaOferta(
  de: StatusDaOferta,
  para: StatusDaOferta,
  ator: AtorDaOferta,
  condicoes: CondicoesDaTransicao,
): Transicao | undefined {
  return transicoesEntre(de, para).find(
    (transicao) =>
      transicao.quem.includes(ator) &&
      (transicao.revisaoExigida === undefined ||
        transicao.revisaoExigida === condicoes.revisaoExigida) &&
      (transicao.soComValidadeVencida !== true || condicoes.validadeVencida) &&
      (transicao.soComValidadeEmVigor !== true || !condicoes.validadeVencida),
  );
}

/** A validade gravada já passou (a oferta se comporta como expirada; ADR-0003 §2.9). */
export function validadeVencida(
  validaAte: string | null,
  agora: Date = new Date(),
): boolean {
  return validaAte !== null && Date.parse(validaAte) <= agora.getTime();
}

export function motivoObrigatorio(
  transicao: Transicao,
  ator: AtorDaOferta,
): boolean {
  return transicao.motivoDe.includes(ator);
}

/**
 * O ator da sessão em relação à empresa dona. Com vínculo não removido com a
 * empresa, o staff nunca age como plataforma nas ofertas dela (B25): com o
 * vínculo ativo, age como fornecedor; com ele pendente ou suspenso, não age.
 */
export function atorDaOferta(
  contexto: ContextoDoUsuario,
  empresaId: string,
): AtorDaOferta {
  const vinculo = vinculoAtivo(contexto, empresaId);
  if (vinculo !== undefined) {
    return vinculo.papel === "org_admin" ? "adm_empresa" : "membro";
  }
  const comVinculo = contexto.vinculos.some(
    (item) => item.organizationId === empresaId && item.status !== "removed",
  );
  if (comVinculo) return "nenhum";
  if (contexto.papelNaPlataforma === "admin") return "administrador";
  if (contexto.papelNaPlataforma === "operator") return "operador";
  return "nenhum";
}
