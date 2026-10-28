/**
 * Perfil do usuário (ADR-0002 §2.3, §2.4 e §2.8).
 *
 * Suspender e reativar: só o administrador, nunca o próprio perfil, com
 * motivo na auditoria. A ordem é banco primeiro, Auth depois: o status no
 * banco já bloqueia na operação seguinte; o bloqueio no Auth impede novo
 * login. Se o Auth falhar, a operação devolve `falha_parcial` e pode ser
 * repetida (gravar o mesmo status de novo não gera auditoria).
 */
import type { Dependencias } from "@/lib/operacao/dependencias";
import {
  falha,
  sucesso,
  traduzirErroDoBanco,
  type Resultado,
} from "@/lib/operacao/resultado";
import { comRastreio } from "@/modules/audit/server/rastreio";
import { ehAdministrador } from "../rules/permissoes";
import {
  esquemaDoMeuPerfil,
  esquemaDoStatusDoPerfil,
} from "../schemas/plataforma";
import { executarOperacao } from "./operacao";

/** Duração do bloqueio no Auth enquanto o perfil está suspenso (cem anos). */
const BLOQUEIO_NO_AUTH = "876000h";

export function mudarStatusDoPerfil(
  dependencias: Dependencias,
  entrada: unknown,
): Promise<Resultado<{ perfilId: string; status: "active" | "suspended" }>> {
  return executarOperacao(
    dependencias,
    esquemaDoStatusDoPerfil,
    entrada,
    async ({ perfilId, acao, motivo }, contexto) => {
      if (!ehAdministrador(contexto)) return falha("sem_permissao");
      if (perfilId === contexto.perfilId) {
        return falha("regra_violada", "Ninguém altera o próprio status.");
      }
      const status = acao === "suspender" ? "suspended" : "active";
      const { data, error } = await comRastreio(
        dependencias.sessao
          .from("profiles")
          .update({ status })
          .eq("id", perfilId)
          .select("id"),
        dependencias.requestId,
        motivo,
      ).overrideTypes<{ id: string }[], { merge: false }>();
      if (error !== null) return traduzirErroDoBanco(error);
      if (data.length === 0) return falha("sem_permissao");

      const bloqueio = await dependencias
        .administrativo()
        .auth.admin.updateUserById(perfilId, {
          ban_duration: acao === "suspender" ? BLOQUEIO_NO_AUTH : "none",
        });
      if (bloqueio.error !== null) {
        return falha(
          "falha_parcial",
          "O status foi gravado, mas o bloqueio de login não foi atualizado. Repita a operação.",
        );
      }
      return sucesso({ perfilId, status });
    },
  );
}

/** Nome e telefone do próprio perfil (D34); e-mail só pelo fluxo do Auth. */
export function alterarMeuPerfil(
  dependencias: Dependencias,
  entrada: unknown,
): Promise<Resultado<{ perfilId: string }>> {
  return executarOperacao(
    dependencias,
    esquemaDoMeuPerfil,
    entrada,
    async (dados, contexto) => {
      const alteracao: Record<string, string | null> = {};
      if (dados.nome !== undefined) alteracao.full_name = dados.nome;
      if (dados.telefone !== undefined) alteracao.phone = dados.telefone;
      const { data, error } = await comRastreio(
        dependencias.sessao
          .from("profiles")
          .update(alteracao)
          .eq("id", contexto.perfilId)
          .select("id"),
        dependencias.requestId,
      ).overrideTypes<{ id: string }[], { merge: false }>();
      if (error !== null) return traduzirErroDoBanco(error);
      if (data.length === 0) return falha("sem_permissao");
      return sucesso({ perfilId: contexto.perfilId });
    },
  );
}
