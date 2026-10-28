/**
 * Membros da empresa com nome e e-mail, juntando as leituras de dois módulos
 * pelas funções públicas de cada um (ADR-0001 §2.6). O perfil do convidado
 * só aparece depois do aceite (ADR-0002 §2.9); antes, a tela mostra o e-mail
 * do convite.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { listarPerfisPorId } from "@/modules/auth/queries/perfis";
import { listarMembros } from "@/modules/organizations/queries/empresas";
import type { MembroParaTela } from "@/modules/organizations/ui/membros";

const ORDEM_DO_STATUS = { active: 0, pending: 1, suspended: 2, removed: 3 };

export async function membrosParaTela(
  sessao: SupabaseClient,
  empresaId: string,
): Promise<MembroParaTela[]> {
  const membros = await listarMembros(sessao, empresaId);
  const perfis = await listarPerfisPorId(
    sessao,
    membros.map((membro) => membro.perfilId),
  );
  return membros
    .map((membro) => {
      const perfil = perfis.get(membro.perfilId);
      return {
        vinculoId: membro.vinculoId,
        perfilId: membro.perfilId,
        papel: membro.papel,
        status: membro.status,
        nome: perfil?.nome ?? null,
        email: perfil?.email ?? membro.emailConvidado,
      };
    })
    .sort((a, b) => ORDEM_DO_STATUS[a.status] - ORDEM_DO_STATUS[b.status]);
}
