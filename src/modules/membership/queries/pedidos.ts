/**
 * Leituras do pedido de adesão para as telas (I1.6). Sempre com o cliente da
 * sessão de quem vê a tela: a RLS decide o que volta (ADR-0002 §2.9). O
 * requerente lê só os próprios pedidos; a equipe lê todos e a conferência; só
 * o administrador lê as evidências. Falha de leitura lança erro, que a tela
 * mostra como erro genérico.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TipoDeEmpresa } from "@/modules/organizations/tipos";

export const STATUS_DO_PEDIDO = [
  "submitted",
  "under_review",
  "approved",
  "rejected",
] as const;
export type StatusDoPedido = (typeof STATUS_DO_PEDIDO)[number];

export function ehStatusDoPedido(valor: unknown): valor is StatusDoPedido {
  return STATUS_DO_PEDIDO.some((status) => status === valor);
}

const LIMITE_DA_LISTA = 200;

export interface ResumoDoPedido {
  readonly id: string;
  readonly nomeDaEmpresa: string;
  readonly cnpj: string;
  readonly tipo: TipoDeEmpresa;
  readonly status: StatusDoPedido;
  readonly requerenteId: string;
  readonly enviadoEm: string;
  readonly revisadoEm: string | null;
  readonly motivoDaDecisao: string | null;
  readonly empresaId: string | null;
}

export interface Pedido extends ResumoDoPedido {
  readonly razaoSocial: string;
  readonly emailDeContato: string | null;
  readonly telefoneDeContato: string | null;
  readonly dadosDeTeste: boolean;
  readonly revisadoPor: string | null;
  readonly cnpjConferidoEm: string | null;
  readonly fonteDaConferencia: string | null;
  readonly evidenciaId: string | null;
}

interface LinhaDoPedido {
  id: string;
  applicant_profile_id: string;
  organization_name: string;
  legal_name: string;
  cnpj: string;
  contact_email: string | null;
  contact_phone: string | null;
  requested_kind: TipoDeEmpresa;
  status: StatusDoPedido;
  is_test: boolean;
  reviewed_by: string | null;
  reviewed_at: string | null;
  decision_reason: string | null;
  cnpj_checked_at: string | null;
  cnpj_check_source: string | null;
  cnpj_check_evidence_id: string | null;
  organization_id: string | null;
  created_at: string;
}

const COLUNAS_DO_RESUMO =
  "id, applicant_profile_id, organization_name, cnpj, requested_kind, status, reviewed_at, decision_reason, organization_id, created_at";

function paraResumo(
  linha: Pick<
    LinhaDoPedido,
    | "id"
    | "applicant_profile_id"
    | "organization_name"
    | "cnpj"
    | "requested_kind"
    | "status"
    | "reviewed_at"
    | "decision_reason"
    | "organization_id"
    | "created_at"
  >,
): ResumoDoPedido {
  return {
    id: linha.id,
    nomeDaEmpresa: linha.organization_name,
    cnpj: linha.cnpj,
    tipo: linha.requested_kind,
    status: linha.status,
    requerenteId: linha.applicant_profile_id,
    enviadoEm: linha.created_at,
    revisadoEm: linha.reviewed_at,
    motivoDaDecisao: linha.decision_reason,
    empresaId: linha.organization_id,
  };
}

/** Pedidos do próprio usuário, do mais novo ao mais antigo. */
export async function listarMeusPedidos(
  sessao: SupabaseClient,
  perfilId: string,
): Promise<ResumoDoPedido[]> {
  const { data, error } = await sessao
    .from("membership_applications")
    .select(COLUNAS_DO_RESUMO)
    .eq("applicant_profile_id", perfilId)
    .order("created_at", { ascending: false })
    .overrideTypes<LinhaDoPedido[], { merge: false }>();
  if (error !== null) throw new Error("Falha ao ler os pedidos de adesão.");
  return data.map(paraResumo);
}

/** Pedidos para a equipe da plataforma, com filtro opcional de status. */
export async function listarPedidos(
  sessao: SupabaseClient,
  status: StatusDoPedido | null,
): Promise<ResumoDoPedido[]> {
  let consulta = sessao
    .from("membership_applications")
    .select(COLUNAS_DO_RESUMO)
    .order("created_at", { ascending: false })
    .limit(LIMITE_DA_LISTA);
  if (status !== null) consulta = consulta.eq("status", status);
  const { data, error } = await consulta.overrideTypes<
    LinhaDoPedido[],
    { merge: false }
  >();
  if (error !== null) throw new Error("Falha ao ler os pedidos de adesão.");
  return data.map(paraResumo);
}

/** Pedido pelo id; `null` se não existe ou se a RLS não mostra. */
export async function obterPedido(
  sessao: SupabaseClient,
  pedidoId: string,
): Promise<Pedido | null> {
  const { data, error } = await sessao
    .from("membership_applications")
    .select(
      "id, applicant_profile_id, organization_name, legal_name, cnpj, contact_email, contact_phone, requested_kind, status, is_test, reviewed_by, reviewed_at, decision_reason, cnpj_checked_at, cnpj_check_source, cnpj_check_evidence_id, organization_id, created_at",
    )
    .eq("id", pedidoId)
    .maybeSingle()
    .overrideTypes<LinhaDoPedido, { merge: false }>();
  if (error !== null) throw new Error("Falha ao ler o pedido de adesão.");
  if (data === null) return null;
  return {
    ...paraResumo(data),
    razaoSocial: data.legal_name,
    emailDeContato: data.contact_email,
    telefoneDeContato: data.contact_phone,
    dadosDeTeste: data.is_test,
    revisadoPor: data.reviewed_by,
    cnpjConferidoEm: data.cnpj_checked_at,
    fonteDaConferencia: data.cnpj_check_source,
    evidenciaId: data.cnpj_check_evidence_id,
  };
}

export interface ItemDaConferencia {
  readonly item: string;
  readonly resultado: string;
  readonly observacao?: string;
}

export interface Conferencia {
  readonly itens: readonly ItemDaConferencia[];
  readonly atualizadaEm: string;
}

function lerItens(valor: unknown): ItemDaConferencia[] {
  if (!Array.isArray(valor)) return [];
  const itens: ItemDaConferencia[] = [];
  for (const elemento of valor as unknown[]) {
    if (typeof elemento !== "object" || elemento === null) continue;
    const { item, resultado, observacao } = elemento as Record<string, unknown>;
    if (typeof item !== "string" || typeof resultado !== "string") continue;
    itens.push(
      typeof observacao === "string" && observacao !== ""
        ? { item, resultado, observacao }
        : { item, resultado },
    );
  }
  return itens;
}

/** Lista do que foi conferido (só a equipe lê); `null` se ainda não há. */
export async function obterConferencia(
  sessao: SupabaseClient,
  pedidoId: string,
): Promise<Conferencia | null> {
  const { data, error } = await sessao
    .from("membership_application_reviews")
    .select("checklist, updated_at")
    .eq("application_id", pedidoId)
    .maybeSingle()
    .overrideTypes<
      { checklist: unknown; updated_at: string },
      { merge: false }
    >();
  if (error !== null) throw new Error("Falha ao ler a conferência.");
  if (data === null) return null;
  return { itens: lerItens(data.checklist), atualizadaEm: data.updated_at };
}

export interface Evidencia {
  readonly id: string;
  readonly tipoDoArquivo: string;
  readonly tamanho: number;
  readonly descricao: string | null;
  readonly sha256: string;
  readonly enviadaPor: string;
  readonly enviadaEm: string;
}

/** Evidências do pedido (só o administrador lê), da mais nova à mais antiga. */
export async function listarEvidencias(
  sessao: SupabaseClient,
  pedidoId: string,
): Promise<Evidencia[]> {
  const { data, error } = await sessao
    .from("membership_evidence_files")
    .select(
      "id, content_type, size_bytes, description, sha256, uploaded_by, uploaded_at",
    )
    .eq("application_id", pedidoId)
    .order("uploaded_at", { ascending: false })
    .overrideTypes<
      {
        id: string;
        content_type: string;
        // bigint: o PostgREST devolve número, mas o tipo admite texto.
        size_bytes: number | string;
        description: string | null;
        sha256: string;
        uploaded_by: string;
        uploaded_at: string;
      }[],
      { merge: false }
    >();
  if (error !== null) throw new Error("Falha ao ler as evidências.");
  return data.map((linha) => ({
    id: linha.id,
    tipoDoArquivo: linha.content_type,
    tamanho: Number(linha.size_bytes),
    descricao: linha.description,
    sha256: linha.sha256,
    enviadaPor: linha.uploaded_by,
    enviadaEm: linha.uploaded_at,
  }));
}
