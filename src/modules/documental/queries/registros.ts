/**
 * Leituras do domínio documental para as telas (I3.6), sempre com a sessão de
 * quem vê a tela: a RLS decide o que volta (ADR-0004 §2.16). A empresa dona e
 * a equipe da plataforma leem consultas, revisões e impedimentos; outra
 * empresa não lê nada. A chave secreta não entra aqui.
 *
 * Completam `consultarEstadosDocumentais` com o que a ficha mostra e aquela
 * leitura não traz: o motivo, o autor e a data de cada revisão (o fornecedor
 * vê quem abriu e quem fechou; ADR-0004 §2.5), de que lado e por quem cada
 * consulta foi registrada, o protocolo, as consultas substituídas (§6.3: o
 * histórico fica visível) e a resolução dos impedimentos.
 *
 * Falha de leitura lança erro, que a tela mostra como erro genérico.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResultadoDaConsulta, TipoDeFonte } from "../rules/estados";

const LIMITE = 500;

export interface ConsultaRegistrada {
  readonly id: string;
  readonly seq: number;
  readonly categoria: string;
  readonly fonte: string;
  readonly tipoDeFonte: TipoDeFonte;
  readonly realizadaEm: string;
  readonly resultado: ResultadoDaConsulta;
  readonly resumo: string;
  readonly limitacoes: string;
  readonly protocolo: string | null;
  readonly evidenciaId: string | null;
  /** Lado de quem registrou, gravado pelo gatilho (`recorded_as`). */
  readonly registradaPelaPlataforma: boolean;
  readonly registradaPor: string;
  readonly registradaEm: string;
  /** A consulta que esta substitui (`supersedes_check_id`). */
  readonly substitui: string | null;
}

export interface RevisaoRegistrada {
  readonly id: string;
  readonly seq: number;
  readonly categoria: string;
  readonly acao: "open_review" | "close_review";
  readonly motivo: string;
  readonly autor: string;
  readonly em: string;
}

export interface ImpedimentoRegistrado {
  readonly id: string;
  readonly base: string;
  readonly ativo: boolean;
  readonly identificadoEm: string;
  readonly consultaDeOrigem: string | null;
  readonly declaracaoDeOrigem: string | null;
  readonly resolvidoEm: string | null;
  readonly resolvidoPor: string | null;
  readonly motivoDaResolucao: string | null;
  readonly evidenciaDaResolucao: string | null;
}

export interface RegistrosDocumentais {
  /** Todas as consultas da oferta, vigentes e substituídas, da mais recente para a mais antiga. */
  readonly consultas: readonly ConsultaRegistrada[];
  /** Revisões em ordem de registro (a última de cada categoria decide se está aberta). */
  readonly revisoes: readonly RevisaoRegistrada[];
  readonly impedimentos: readonly ImpedimentoRegistrado[];
}

interface LinhaDaConsulta {
  id: string;
  seq: number;
  category: string;
  source_name: string;
  source_type: TipoDeFonte;
  performed_at: string;
  result: ResultadoDaConsulta;
  result_summary: string;
  known_limitations: string;
  protocol: string | null;
  evidence_document_id: string | null;
  recorded_as: "supplier" | "platform";
  recorded_by: string;
  recorded_at: string;
  supersedes_check_id: string | null;
}

interface LinhaDaRevisao {
  id: string;
  seq: number;
  category: string;
  action: "open_review" | "close_review";
  reason: string;
  actor: string;
  created_at: string;
}

interface LinhaDoImpedimento {
  id: string;
  basis: string;
  status: "identified" | "resolved";
  identified_at: string;
  source_check_id: string | null;
  source_declaration_id: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_reason: string | null;
  resolution_evidence_id: string | null;
}

/** Consultas, revisões e impedimentos da oferta, pela sessão. */
export async function lerRegistrosDocumentais(
  sessao: SupabaseClient,
  ofertaId: string,
): Promise<RegistrosDocumentais> {
  const [consultas, revisoes, impedimentos] = await Promise.all([
    sessao
      .from("vehicle_checks")
      .select(
        "id, seq, category, source_name, source_type, performed_at, result, result_summary, known_limitations, protocol, evidence_document_id, recorded_as, recorded_by, recorded_at, supersedes_check_id",
      )
      .eq("offer_id", ofertaId)
      .order("seq", { ascending: false })
      .limit(LIMITE)
      .overrideTypes<LinhaDaConsulta[], { merge: false }>(),
    sessao
      .from("documental_reviews")
      .select("id, seq, category, action, reason, actor, created_at")
      .eq("offer_id", ofertaId)
      .order("seq", { ascending: true })
      .limit(LIMITE)
      .overrideTypes<LinhaDaRevisao[], { merge: false }>(),
    sessao
      .from("transfer_impediments")
      .select(
        "id, basis, status, identified_at, source_check_id, source_declaration_id, resolved_at, resolved_by, resolution_reason, resolution_evidence_id",
      )
      .eq("offer_id", ofertaId)
      .order("identified_at", { ascending: false })
      .limit(LIMITE)
      .overrideTypes<LinhaDoImpedimento[], { merge: false }>(),
  ]);
  if (consultas.error !== null) {
    throw new Error("Falha ao ler as consultas da oferta.");
  }
  if (revisoes.error !== null) {
    throw new Error("Falha ao ler as revisões documentais da oferta.");
  }
  if (impedimentos.error !== null) {
    throw new Error("Falha ao ler os impedimentos da oferta.");
  }
  return {
    consultas: consultas.data.map((linha) => ({
      id: linha.id,
      seq: linha.seq,
      categoria: linha.category,
      fonte: linha.source_name,
      tipoDeFonte: linha.source_type,
      realizadaEm: linha.performed_at,
      resultado: linha.result,
      resumo: linha.result_summary,
      limitacoes: linha.known_limitations,
      protocolo: linha.protocol,
      evidenciaId: linha.evidence_document_id,
      registradaPelaPlataforma: linha.recorded_as === "platform",
      registradaPor: linha.recorded_by,
      registradaEm: linha.recorded_at,
      substitui: linha.supersedes_check_id,
    })),
    revisoes: revisoes.data.map((linha) => ({
      id: linha.id,
      seq: linha.seq,
      categoria: linha.category,
      acao: linha.action,
      motivo: linha.reason,
      autor: linha.actor,
      em: linha.created_at,
    })),
    impedimentos: impedimentos.data.map((linha) => ({
      id: linha.id,
      base: linha.basis,
      ativo: linha.status === "identified",
      identificadoEm: linha.identified_at,
      consultaDeOrigem: linha.source_check_id,
      declaracaoDeOrigem: linha.source_declaration_id,
      resolvidoEm: linha.resolved_at,
      resolvidoPor: linha.resolved_by,
      motivoDaResolucao: linha.resolution_reason,
      evidenciaDaResolucao: linha.resolution_evidence_id,
    })),
  };
}

/** Ids das pessoas citadas nos registros, para buscar os nomes que a sessão lê. */
export function pessoasDosRegistros(registros: RegistrosDocumentais): string[] {
  return [
    ...new Set([
      ...registros.consultas.map((consulta) => consulta.registradaPor),
      ...registros.revisoes.map((revisao) => revisao.autor),
      ...registros.impedimentos.flatMap((impedimento) =>
        impedimento.resolvidoPor === null ? [] : [impedimento.resolvidoPor],
      ),
    ]),
  ];
}
