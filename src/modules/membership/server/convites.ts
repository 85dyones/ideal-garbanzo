/**
 * Convite de fornecedora (ADR-0002 §9; mudança de escopo de 30/10).
 *
 * - Só o administrador da plataforma convida e revoga.
 * - Convite sem empresa: libera o pedido de adesão como fornecedora, ou como
 *   fornecedora e compradora, para o e-mail confirmado (o gatilho do pedido
 *   usa o convite). Para e-mail sem conta, o Auth cria a conta e manda o
 *   e-mail; com conta, a pessoa vê o convite ao entrar. A resposta é a mesma.
 * - Convite com empresa: vai ao `org_admin` de uma compradora ativa, que o
 *   aceita; o banco torna a empresa `both`.
 * - A gravação é sempre com a sessão de quem age. O servidor confere o papel
 *   antes (camada 2), e o banco decide de novo com a política e o gatilho.
 */
import type { Dependencias } from "@/lib/operacao/dependencias";
import { LIMITES, consumirLimite } from "@/lib/operacao/limite-de-tentativas";
import {
  falha,
  sucesso,
  traduzirErroDoBanco,
  type Resultado,
} from "@/lib/operacao/resultado";
import { comRastreio } from "@/modules/audit/server/rastreio";
import { ehAdministrador, vinculoAtivo } from "@/modules/auth/rules/permissoes";
import { executarOperacao } from "@/modules/auth/server/operacao";
import {
  convidarPeloAuth,
  type ConvidarNoAuth,
} from "@/modules/organizations/server/membros";
import {
  esquemaDoConviteDeFornecedora,
  esquemaDoConviteDeFornecedoraEmUso,
} from "../schemas/convites";

export function convidarFornecedora(
  dependencias: Dependencias,
  entrada: unknown,
  opcoes: { readonly convidarNoAuth?: ConvidarNoAuth } = {},
): Promise<Resultado<{ conviteId: string }>> {
  return executarOperacao(
    dependencias,
    esquemaDoConviteDeFornecedora,
    entrada,
    async ({ email, empresaId }, contexto) => {
      if (!ehAdministrador(contexto)) return falha("sem_permissao");
      const administrativo = dependencias.administrativo();
      const cabe = await consumirLimite(administrativo, LIMITES.convite, [
        contexto.perfilId,
      ]);
      if (!cabe) return falha("limite_excedido");

      // O banco confere a regra (pendente repetido, compradora e seu
      // administrador) antes de qualquer e-mail sair.
      const { data, error } = await comRastreio(
        dependencias.sessao
          .from("supplier_invitations")
          .insert({ email, organization_id: empresaId ?? null })
          .select("id")
          .single(),
        dependencias.requestId,
      ).overrideTypes<{ id: string }, { merge: false }>();
      if (error !== null) {
        return traduzirErroDoBanco(error);
      }
      if (empresaId !== undefined) return sucesso({ conviteId: data.id });

      // A sessão do administrador lê todos os perfis (`profiles_leitura`);
      // a chave secreta fica para o limite e o convite do Auth (§2.12).
      const perfis = await dependencias.sessao
        .from("profiles")
        .select("id")
        .eq("email", email)
        .limit(2)
        .overrideTypes<{ id: string }[], { merge: false }>();
      if (perfis.error !== null || perfis.data.length > 1) {
        return falha(
          "falha_parcial",
          "Convite registrado, mas não foi possível conferir a conta do e-mail. Revogue e convide de novo.",
        );
      }
      if (perfis.data.length === 0) {
        const criado = await (opcoes.convidarNoAuth ?? convidarPeloAuth)(
          administrativo,
          email,
        );
        if (criado === null) {
          return falha(
            "falha_parcial",
            "Convite registrado, mas o e-mail não saiu agora. Revogue e convide de novo.",
          );
        }
      }
      return sucesso({ conviteId: data.id });
    },
  );
}

export function revogarConviteDeFornecedora(
  dependencias: Dependencias,
  entrada: unknown,
): Promise<Resultado<{ conviteId: string }>> {
  return executarOperacao(
    dependencias,
    esquemaDoConviteDeFornecedoraEmUso,
    entrada,
    async ({ conviteId }, contexto) => {
      if (!ehAdministrador(contexto)) return falha("sem_permissao");
      const { data, error } = await comRastreio(
        dependencias.sessao
          .from("supplier_invitations")
          .update({ status: "revoked" })
          .eq("id", conviteId)
          .eq("status", "pending")
          .select("id"),
        dependencias.requestId,
      ).overrideTypes<{ id: string }[], { merge: false }>();
      if (error !== null) return traduzirErroDoBanco(error);
      if (data.length === 0) {
        return falha("regra_violada", "O convite não está pendente.");
      }
      return sucesso({ conviteId });
    },
  );
}

/** Aceite pelo `org_admin` da compradora convidada: a empresa passa a `both`. */
export function aceitarConviteDeFornecedora(
  dependencias: Dependencias,
  entrada: unknown,
): Promise<Resultado<{ conviteId: string; empresaId: string }>> {
  return executarOperacao(
    dependencias,
    esquemaDoConviteDeFornecedoraEmUso,
    entrada,
    async ({ conviteId }, contexto) => {
      // A RLS só devolve o convite do próprio e-mail confirmado (ou à equipe).
      const convite = await dependencias.sessao
        .from("supplier_invitations")
        .select("organization_id")
        .eq("id", conviteId)
        .maybeSingle()
        .overrideTypes<{ organization_id: string | null }, { merge: false }>();
      if (convite.error !== null) return traduzirErroDoBanco(convite.error);
      const empresaId = convite.data?.organization_id ?? null;
      if (
        empresaId === null ||
        vinculoAtivo(contexto, empresaId)?.papel !== "org_admin"
      ) {
        return falha("sem_permissao");
      }
      const { data, error } = await comRastreio(
        dependencias.sessao
          .from("supplier_invitations")
          .update({ status: "used" })
          .eq("id", conviteId)
          .select("id"),
        dependencias.requestId,
      ).overrideTypes<{ id: string }[], { merge: false }>();
      if (error !== null) return traduzirErroDoBanco(error);
      if (data.length === 0) return falha("sem_permissao");
      return sucesso({ conviteId, empresaId });
    },
  );
}
