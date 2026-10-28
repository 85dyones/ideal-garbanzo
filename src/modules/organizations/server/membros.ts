/**
 * Membros da empresa (ADR-0002 §2.6 e §2.12; resposta à Q1).
 *
 * - O `org_admin` ativo da empresa ativa, ou o administrador da plataforma,
 *   convida, suspende, reativa, remove, cancela convite e troca papel.
 *   Ninguém mexe no próprio vínculo.
 * - O vínculo nasce `pending` e só o convidado aceita ou recusa.
 * - O convite responde igual exista ou não conta com o e-mail. A chave secreta
 *   só lê o perfil pelo e-mail e, sem conta, pede o convite ao Auth; a
 *   gravação do vínculo é sempre com a sessão de quem convida.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Dependencias } from "@/lib/operacao/dependencias";
import {
  falha,
  sucesso,
  traduzirErroDoBanco,
  type Resultado,
} from "@/lib/operacao/resultado";
import { comRastreio } from "@/modules/audit/server/rastreio";
import { podeGerirEmpresa } from "@/modules/auth/rules/permissoes";
import { executarOperacao } from "@/modules/auth/server/operacao";
import {
  esquemaDaGestaoDoMembro,
  esquemaDaResposta,
  esquemaDaTrocaDePapel,
  esquemaDoConvite,
} from "../schemas/empresas";
import type { PapelNaEmpresa, StatusDoVinculo } from "../tipos";

/** Cria a conta pelo convite do Auth e devolve o id; `null` se falhar. */
export type ConvidarNoAuth = (
  administrativo: SupabaseClient,
  email: string,
) => Promise<string | null>;

const convidarPeloAuth: ConvidarNoAuth = async (administrativo, email) => {
  const { data, error } =
    await administrativo.auth.admin.inviteUserByEmail(email);
  return error === null ? data.user.id : null;
};

const RECUSA_DO_CONVITE = "Não foi possível convidar este e-mail.";

export function convidarMembro(
  dependencias: Dependencias,
  entrada: unknown,
  opcoes: { readonly convidarNoAuth?: ConvidarNoAuth } = {},
): Promise<Resultado<{ vinculoId: string }>> {
  return executarOperacao(
    dependencias,
    esquemaDoConvite,
    entrada,
    async ({ empresaId, email, papel }, contexto) => {
      if (!podeGerirEmpresa(contexto, empresaId)) return falha("sem_permissao");

      const administrativo = dependencias.administrativo();
      const perfis = await administrativo
        .from("profiles")
        .select("id")
        .eq("email", email)
        .limit(2)
        .overrideTypes<{ id: string }[], { merge: false }>();
      if (perfis.error !== null || perfis.data.length > 1) {
        return falha("falha");
      }
      const perfilId =
        perfis.data[0]?.id ??
        (await (opcoes.convidarNoAuth ?? convidarPeloAuth)(
          administrativo,
          email,
        ));
      if (perfilId === null) {
        return falha("falha", "Não foi possível enviar o convite agora.");
      }
      if (perfilId === contexto.perfilId) {
        return falha("regra_violada", "Você não pode convidar a si mesmo.");
      }

      const existente = await dependencias.sessao
        .from("organization_members")
        .select("id, role, status")
        .eq("organization_id", empresaId)
        .eq("profile_id", perfilId)
        .maybeSingle()
        .overrideTypes<
          { id: string; role: PapelNaEmpresa; status: StatusDoVinculo },
          { merge: false }
        >();
      if (existente.error !== null) return traduzirErroDoBanco(existente.error);

      if (existente.data === null) {
        const { data, error } = await comRastreio(
          dependencias.sessao
            .from("organization_members")
            .insert({
              organization_id: empresaId,
              profile_id: perfilId,
              role: papel,
              invited_email: email,
            })
            .select("id")
            .single(),
          dependencias.requestId,
        ).overrideTypes<{ id: string }, { merge: false }>();
        if (error !== null) return recusaDoConvite(error);
        return sucesso({ vinculoId: data.id });
      }

      if (existente.data.status !== "removed") {
        return falha(
          "conflito",
          "Este e-mail já tem convite ou vínculo nesta empresa.",
        );
      }
      // Reconvite: a mesma linha volta a `pending` (o vínculo é único por
      // empresa e perfil). Vínculo removido não troca papel; a troca vem depois.
      const vinculoId = existente.data.id;
      const reconvite = await comRastreio(
        dependencias.sessao
          .from("organization_members")
          .update({ status: "pending", invited_email: email })
          .eq("id", vinculoId)
          .eq("status", "removed"),
        dependencias.requestId,
      );
      if (reconvite.error !== null) return recusaDoConvite(reconvite.error);
      if (existente.data.role !== papel) {
        const troca = await comRastreio(
          dependencias.sessao
            .from("organization_members")
            .update({ role: papel })
            .eq("id", vinculoId),
          dependencias.requestId,
        );
        if (troca.error !== null) return traduzirErroDoBanco(troca.error);
      }
      return sucesso({ vinculoId });
    },
  );
}

/** Sem detalhe da regra: não revela se a conta convidada está suspensa. */
function recusaDoConvite(erro: { code?: string; message: string }) {
  const traduzido = traduzirErroDoBanco(erro);
  return traduzido.erro === "regra_violada"
    ? falha("regra_violada", RECUSA_DO_CONVITE)
    : traduzido;
}

/** O convidado aceita (`active`) ou recusa (`removed`) o próprio convite, sem mudar o papel. */
export function responderConvite(
  dependencias: Dependencias,
  entrada: unknown,
): Promise<Resultado<{ empresaId: string; status: StatusDoVinculo }>> {
  return executarOperacao(
    dependencias,
    esquemaDaResposta,
    entrada,
    async ({ empresaId, aceitar }, contexto) => {
      const status: StatusDoVinculo = aceitar ? "active" : "removed";
      const { data, error } = await comRastreio(
        dependencias.sessao
          .from("organization_members")
          .update({ status })
          .eq("organization_id", empresaId)
          .eq("profile_id", contexto.perfilId)
          .eq("status", "pending")
          .select("id"),
        dependencias.requestId,
      ).overrideTypes<{ id: string }[], { merge: false }>();
      if (error !== null) return traduzirErroDoBanco(error);
      if (data.length === 0) {
        return falha(
          "sem_permissao",
          "Não há convite pendente para você nesta empresa.",
        );
      }
      return sucesso({ empresaId, status });
    },
  );
}

const TRANSICOES_DO_VINCULO = {
  suspender: { de: ["active"], para: "suspended" },
  reativar: { de: ["suspended"], para: "active" },
  remover: { de: ["active", "suspended"], para: "removed" },
  cancelar_convite: { de: ["pending"], para: "removed" },
} as const satisfies Record<
  string,
  { de: readonly StatusDoVinculo[]; para: StatusDoVinculo }
>;

const VINCULO_FORA_DO_STATUS =
  "O vínculo não está num status que permita esta ação.";

export function gerirMembro(
  dependencias: Dependencias,
  entrada: unknown,
): Promise<Resultado<{ vinculoId: string; status: StatusDoVinculo }>> {
  return executarOperacao(
    dependencias,
    esquemaDaGestaoDoMembro,
    entrada,
    async ({ empresaId, vinculoId, acao }, contexto) => {
      if (!podeGerirEmpresa(contexto, empresaId)) return falha("sem_permissao");
      const { de, para } = TRANSICOES_DO_VINCULO[acao];
      const { data, error } = await comRastreio(
        dependencias.sessao
          .from("organization_members")
          .update({ status: para })
          .eq("id", vinculoId)
          .eq("organization_id", empresaId)
          .neq("profile_id", contexto.perfilId)
          .in("status", de)
          .select("id"),
        dependencias.requestId,
      ).overrideTypes<{ id: string }[], { merge: false }>();
      if (error !== null) return traduzirErroDoBanco(error);
      if (data.length === 0) {
        return falha("regra_violada", VINCULO_FORA_DO_STATUS);
      }
      return sucesso({ vinculoId, status: para });
    },
  );
}

export function trocarPapelDoMembro(
  dependencias: Dependencias,
  entrada: unknown,
): Promise<Resultado<{ vinculoId: string; papel: PapelNaEmpresa }>> {
  return executarOperacao(
    dependencias,
    esquemaDaTrocaDePapel,
    entrada,
    async ({ empresaId, vinculoId, papel }, contexto) => {
      if (!podeGerirEmpresa(contexto, empresaId)) return falha("sem_permissao");
      const { data, error } = await comRastreio(
        dependencias.sessao
          .from("organization_members")
          .update({ role: papel })
          .eq("id", vinculoId)
          .eq("organization_id", empresaId)
          .neq("profile_id", contexto.perfilId)
          .neq("status", "removed")
          .select("id"),
        dependencias.requestId,
      ).overrideTypes<{ id: string }[], { merge: false }>();
      if (error !== null) return traduzirErroDoBanco(error);
      if (data.length === 0) {
        return falha("regra_violada", VINCULO_FORA_DO_STATUS);
      }
      return sucesso({ vinculoId, papel });
    },
  );
}
