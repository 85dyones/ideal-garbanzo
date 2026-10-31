/**
 * Leituras do convite de fornecedora para as telas (ADR-0002 §9). Sempre com
 * o cliente da sessão de quem vê a tela: a equipe lê todos os convites; o
 * convidado, só os do próprio e-mail confirmado. Falha de leitura lança erro,
 * que a tela mostra como erro genérico.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ehStatusDoConvite,
  situacaoDoConvite,
  type SituacaoDoConvite,
} from "../rules/convites";

const LIMITE_DA_LISTA = 200;

export interface ConviteDeFornecedora {
  readonly id: string;
  readonly email: string;
  /** Compradora que passa a fornecer também; `null` para empresa nova. */
  readonly empresaId: string | null;
  readonly nomeDaEmpresa: string | null;
  readonly situacao: SituacaoDoConvite;
  readonly convidadoEm: string;
  readonly venceEm: string;
  readonly usadoEm: string | null;
  readonly revogadoEm: string | null;
}

interface LinhaDoConvite {
  id: string;
  email: string;
  organization_id: string | null;
  status: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
  organizations: { name: string } | null;
}

const COLUNAS =
  "id, email, organization_id, status, created_at, expires_at, used_at, revoked_at, organizations(name)";

function paraConvite(linha: LinhaDoConvite, agora: Date): ConviteDeFornecedora {
  if (!ehStatusDoConvite(linha.status)) {
    throw new Error(`Status de convite desconhecido: ${linha.status}`);
  }
  return {
    id: linha.id,
    email: linha.email,
    empresaId: linha.organization_id,
    nomeDaEmpresa: linha.organizations?.name ?? null,
    situacao: situacaoDoConvite(
      linha.status,
      new Date(linha.expires_at),
      agora,
    ),
    convidadoEm: linha.created_at,
    venceEm: linha.expires_at,
    usadoEm: linha.used_at,
    revogadoEm: linha.revoked_at,
  };
}

/** Todos os convites, do mais novo ao mais antigo (equipe da plataforma). */
export async function listarConvitesDeFornecedora(
  sessao: SupabaseClient,
  agora: Date = new Date(),
): Promise<ConviteDeFornecedora[]> {
  const { data, error } = await sessao
    .from("supplier_invitations")
    .select(COLUNAS)
    .order("created_at", { ascending: false })
    .limit(LIMITE_DA_LISTA)
    .overrideTypes<LinhaDoConvite[], { merge: false }>();
  if (error !== null) throw new Error(`Convites: ${error.message}`);
  return data.map((linha) => paraConvite(linha, agora));
}

/**
 * Convites do próprio e-mail que ainda servem: pendentes e dentro da
 * validade. A equipe lê todos os convites pela RLS, por isso a consulta já
 * filtra pelo e-mail confirmado de quem vê a tela; sem ele, nenhum.
 */
export async function convitesDeFornecedoraDoUsuario(
  sessao: SupabaseClient,
  emailConfirmado: string | null,
  agora: Date = new Date(),
): Promise<ConviteDeFornecedora[]> {
  const email = emailConfirmado?.trim().toLowerCase() ?? "";
  if (email === "") return [];
  const { data, error } = await sessao
    .from("supplier_invitations")
    .select(COLUNAS)
    .eq("email", email)
    .eq("status", "pending")
    .gt("expires_at", agora.toISOString())
    .order("created_at", { ascending: true })
    .overrideTypes<LinhaDoConvite[], { merge: false }>();
  if (error !== null) throw new Error(`Convites: ${error.message}`);
  return data.map((linha) => paraConvite(linha, agora));
}
