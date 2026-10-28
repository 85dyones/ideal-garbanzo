/**
 * Revalidação do usuário a cada operação (ADR-0002 §2.1 e §2.3, camada 2).
 *
 * A sessão é validada junto ao Auth (`getUser`, não o cookie), e o status do
 * perfil, o papel na plataforma e os vínculos são lidos do banco na hora.
 * Nada vem de `user_metadata`, `app_metadata` ou cache: suspender muda a
 * resposta da operação seguinte, com o mesmo token.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { falha, sucesso, type Resultado } from "@/lib/operacao/resultado";
import { listarVinculosDoUsuario } from "@/modules/organizations/queries/vinculos";
import type { ContextoDoUsuario, PapelNaPlataforma } from "../tipos";

interface LinhaDoPapel {
  role: PapelNaPlataforma;
  status: "active" | "revoked";
  can_read_audit: boolean;
}

function acessoSuspenso() {
  return falha(
    "sem_permissao",
    "Seu acesso está suspenso. Fale com a administração da plataforma.",
  );
}

export async function carregarContexto(
  sessao: SupabaseClient,
): Promise<Resultado<ContextoDoUsuario>> {
  const {
    data: { user },
    error: erroDaSessao,
  } = await sessao.auth.getUser();
  // Perfil suspenso também é bloqueado no Auth (ADR-0002 §2.3, camada 3), e o
  // Auth responde `user_banned` mesmo com o token anterior válido.
  if (erroDaSessao?.code === "user_banned") return acessoSuspenso();
  if (erroDaSessao !== null || user === null) return falha("sem_sessao");

  const perfil = await sessao
    .from("profiles")
    .select("status")
    .eq("id", user.id)
    .maybeSingle()
    .overrideTypes<{ status: "active" | "suspended" }, { merge: false }>();
  if (perfil.error !== null) return falha("falha");
  if (perfil.data?.status !== "active") return acessoSuspenso();

  const papel = await sessao
    .from("platform_staff")
    .select("role, status, can_read_audit")
    .eq("profile_id", user.id)
    .maybeSingle()
    .overrideTypes<LinhaDoPapel, { merge: false }>();
  if (papel.error !== null) return falha("falha");
  const papelAtivo = papel.data?.status === "active" ? papel.data : null;

  const vinculos = await listarVinculosDoUsuario(sessao, user.id);
  if (vinculos === null) return falha("falha");

  return sucesso({
    perfilId: user.id,
    emailConfirmado: Boolean(user.email_confirmed_at),
    papelNaPlataforma: papelAtivo?.role ?? null,
    podeLerAuditoria:
      papelAtivo?.role === "admin" || papelAtivo?.can_read_audit === true,
    vinculos,
  });
}
