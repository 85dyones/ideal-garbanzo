/**
 * Registro de acesso a dado restrito (ADR-0002 §2.5 e §2.12).
 *
 * Grava em `restricted_access_logs` com a chave secreta, porque a tabela não
 * aceita inclusão de `authenticated`. Quem chama confere a permissão antes e
 * só devolve o dado (por exemplo, a URL temporária) se o registro der certo.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface AcessoRestrito {
  readonly atorPerfilId: string;
  readonly atorEmpresaId: string | null;
  readonly tipoDoRecurso: string;
  readonly recursoId: string;
  readonly requestId: string;
}

/** Devolve `true` se o registro foi gravado. */
export async function registrarAcessoRestrito(
  administrativo: SupabaseClient,
  acesso: AcessoRestrito,
): Promise<boolean> {
  const { error } = await administrativo.from("restricted_access_logs").insert({
    actor_profile_id: acesso.atorPerfilId,
    actor_organization_id: acesso.atorEmpresaId,
    resource_type: acesso.tipoDoRecurso,
    resource_id: acesso.recursoId,
    request_id: acesso.requestId,
  });
  return error === null;
}
