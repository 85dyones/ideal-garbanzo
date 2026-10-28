/**
 * Vínculos do próprio usuário, lidos com a sessão dele (função pública do
 * módulo, usada pelo contexto do `auth`; ADR-0001 §2.6, regra de dependência).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PapelNaEmpresa,
  StatusDaEmpresa,
  StatusDoVinculo,
  TipoDeEmpresa,
  VinculoDoUsuario,
} from "../tipos";

interface LinhaDoVinculo {
  id: string;
  organization_id: string;
  role: PapelNaEmpresa;
  status: StatusDoVinculo;
  organizations: { status: StatusDaEmpresa; kind: TipoDeEmpresa } | null;
}

/** `null` quando a consulta falha. */
export async function listarVinculosDoUsuario(
  sessao: SupabaseClient,
  perfilId: string,
): Promise<VinculoDoUsuario[] | null> {
  const { data, error } = await sessao
    .from("organization_members")
    .select("id, organization_id, role, status, organizations(status, kind)")
    .eq("profile_id", perfilId)
    .overrideTypes<LinhaDoVinculo[], { merge: false }>();
  if (error) return null;
  return data.map((linha) => ({
    vinculoId: linha.id,
    organizationId: linha.organization_id,
    papel: linha.role,
    status: linha.status,
    empresa: linha.organizations,
  }));
}
