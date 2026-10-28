/**
 * Membros da empresa (ADR-0002 §2.6 e §2.12; resposta à Q1).
 *
 * - O `org_admin` ativo da empresa ativa, ou o administrador da plataforma,
 *   convida, suspende, reativa, remove, cancela convite e troca papel.
 *   Ninguém mexe no próprio vínculo.
 * - O vínculo nasce `pending` e só o convidado aceita ou recusa.
 * - O convite responde igual exista ou não conta com o e-mail. A chave secreta
 *   só lê o perfil pelo e-mail, confere no Auth se a conta existente pode
 *   receber convite e, sem conta, pede o convite ao Auth; a gravação do
 *   vínculo é sempre com a sessão de quem convida.
 * - Conta de cadastro sem e-mail confirmado recebe a mesma recusa da conta
 *   suspensa, sem dizer o motivo.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Dependencias } from "@/lib/operacao/dependencias";
import { LIMITES, consumirLimite } from "@/lib/operacao/limite-de-tentativas";
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

/**
 * Conta que já existe só recebe convite se o e-mail foi confirmado ou se ela
 * nasceu de um convite do Auth (a senha é definida por quem abre o link).
 * Conta de cadastro ainda sem confirmação pode ser de outra pessoa, que usou o
 * e-mail alheio com a própria senha (ADR-0002 §8, R1). `null` se o Auth não
 * responder.
 */
async function contaAceitaConvite(
  administrativo: SupabaseClient,
  perfilId: string,
): Promise<boolean | null> {
  const { data, error } = await administrativo.auth.admin.getUserById(perfilId);
  if (error !== null) return null;
  const { email_confirmed_at, invited_at } = data.user;
  return Boolean(email_confirmed_at) || Boolean(invited_at);
}

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
      const cabe = await consumirLimite(administrativo, LIMITES.convite, [
        contexto.perfilId,
      ]);
      if (!cabe) return falha("limite_excedido");
      const perfis = await administrativo
        .from("profiles")
        .select("id")
        .eq("email", email)
        .limit(2)
        .overrideTypes<{ id: string }[], { merge: false }>();
      if (perfis.error !== null || perfis.data.length > 1) {
        return falha("falha");
      }
      const perfilExistente = perfis.data[0]?.id;
      if (perfilExistente !== undefined) {
        const aceita = await contaAceitaConvite(
          administrativo,
          perfilExistente,
        );
        if (aceita === null) return falha("falha");
        if (!aceita) return falha("regra_violada", RECUSA_DO_CONVITE);
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
      // empresa e perfil) e, se o papel pedido for outro, troca de papel. As
      // duas escritas vão numa chamada só, na mesma transação, com a sessão
      // de quem convida (ADR-0002 §8, R3).
      const vinculoId = existente.data.id;
      const reconvite = await comRastreio(
        dependencias.sessao.rpc("reconvidar_membro", {
          p_vinculo: vinculoId,
          p_email: email,
          p_papel: papel,
        }),
        dependencias.requestId,
      );
      if (reconvite.error !== null) return recusaDoConvite(reconvite.error);
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
