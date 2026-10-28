/**
 * Papéis na plataforma e configuração (ADR-0002 §2.4, §2.7, §2.9 e §2.13).
 *
 * Só o administrador ativo concede, revoga, libera a leitura da auditoria ao
 * operador e altera configuração; nunca na própria linha. `granted_by`,
 * `granted_at` e `updated_by` vêm do gatilho, não do payload. O primeiro
 * administrador não passa por aqui (SQL documentado, §2.13).
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
  esquemaDaConcessao,
  esquemaDaConfiguracao,
  esquemaDaLeituraDeAuditoria,
  esquemaDaRevogacao,
} from "../schemas/plataforma";
import type { PapelNaPlataforma } from "../tipos";
import { executarOperacao } from "./operacao";

const PROPRIO_PAPEL = "Ninguém altera o próprio papel na plataforma.";

export function concederPapel(
  dependencias: Dependencias,
  entrada: unknown,
): Promise<Resultado<{ perfilId: string; papel: PapelNaPlataforma }>> {
  return executarOperacao(
    dependencias,
    esquemaDaConcessao,
    entrada,
    async ({ perfilId, papel }, contexto) => {
      if (!ehAdministrador(contexto)) return falha("sem_permissao");
      if (perfilId === contexto.perfilId) {
        return falha("regra_violada", PROPRIO_PAPEL);
      }
      const existente = await dependencias.sessao
        .from("platform_staff")
        .select("role, status")
        .eq("profile_id", perfilId)
        .maybeSingle()
        .overrideTypes<
          { role: PapelNaPlataforma; status: "active" | "revoked" },
          { merge: false }
        >();
      if (existente.error !== null) return traduzirErroDoBanco(existente.error);

      if (existente.data === null) {
        const { error } = await comRastreio(
          dependencias.sessao
            .from("platform_staff")
            .insert({ profile_id: perfilId, role: papel }),
          dependencias.requestId,
        );
        if (error !== null) {
          if (error.code === "23503") return falha("sem_permissao");
          return traduzirErroDoBanco(error);
        }
        return sucesso({ perfilId, papel });
      }

      if (existente.data.status === "active" && existente.data.role === papel) {
        return falha("conflito", "Este perfil já tem esse papel.");
      }
      const { error } = await comRastreio(
        dependencias.sessao
          .from("platform_staff")
          .update({ role: papel, status: "active", can_read_audit: false })
          .eq("profile_id", perfilId),
        dependencias.requestId,
      );
      if (error !== null) return traduzirErroDoBanco(error);
      return sucesso({ perfilId, papel });
    },
  );
}

export function revogarPapel(
  dependencias: Dependencias,
  entrada: unknown,
): Promise<Resultado<{ perfilId: string }>> {
  return executarOperacao(
    dependencias,
    esquemaDaRevogacao,
    entrada,
    async ({ perfilId }, contexto) => {
      if (!ehAdministrador(contexto)) return falha("sem_permissao");
      if (perfilId === contexto.perfilId) {
        return falha("regra_violada", PROPRIO_PAPEL);
      }
      const { data, error } = await comRastreio(
        dependencias.sessao
          .from("platform_staff")
          .update({ status: "revoked", can_read_audit: false })
          .eq("profile_id", perfilId)
          .eq("status", "active")
          .select("id"),
        dependencias.requestId,
      ).overrideTypes<{ id: string }[], { merge: false }>();
      if (error !== null) return traduzirErroDoBanco(error);
      if (data.length === 0) {
        return falha("regra_violada", "Este perfil não tem papel ativo.");
      }
      return sucesso({ perfilId });
    },
  );
}

/** Libera ou retira a leitura da auditoria de um operador (§3.3, "conforme autorização"). */
export function alterarLeituraDeAuditoria(
  dependencias: Dependencias,
  entrada: unknown,
): Promise<Resultado<{ perfilId: string; permitir: boolean }>> {
  return executarOperacao(
    dependencias,
    esquemaDaLeituraDeAuditoria,
    entrada,
    async ({ perfilId, permitir }, contexto) => {
      if (!ehAdministrador(contexto)) return falha("sem_permissao");
      if (perfilId === contexto.perfilId) {
        return falha("regra_violada", PROPRIO_PAPEL);
      }
      const { data, error } = await comRastreio(
        dependencias.sessao
          .from("platform_staff")
          .update({ can_read_audit: permitir })
          .eq("profile_id", perfilId)
          .eq("role", "operator")
          .eq("status", "active")
          .select("id"),
        dependencias.requestId,
      ).overrideTypes<{ id: string }[], { merge: false }>();
      if (error !== null) return traduzirErroDoBanco(error);
      if (data.length === 0) {
        return falha(
          "regra_violada",
          "A leitura da auditoria só se concede a operador ativo.",
        );
      }
      return sucesso({ perfilId, permitir });
    },
  );
}

/** Altera o valor de uma chave existente; histórico e auditoria pelos gatilhos. */
export function alterarConfiguracao(
  dependencias: Dependencias,
  entrada: unknown,
): Promise<Resultado<{ chave: string }>> {
  return executarOperacao(
    dependencias,
    esquemaDaConfiguracao,
    entrada,
    async ({ chave, valor }, contexto) => {
      if (!ehAdministrador(contexto)) return falha("sem_permissao");
      const { data, error } = await comRastreio(
        dependencias.sessao
          .from("platform_settings")
          .update({ value: valor })
          .eq("key", chave)
          .select("key"),
        dependencias.requestId,
      ).overrideTypes<{ key: string }[], { merge: false }>();
      if (error !== null) return traduzirErroDoBanco(error);
      if (data.length === 0) return falha("sem_permissao");
      return sucesso({ chave });
    },
  );
}
