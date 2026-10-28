/**
 * Envio do pedido de adesão (§8 `submitMembershipApplication`; ADR-0002 §2.5).
 *
 * Grava com a sessão do requerente, só as colunas que o GRANT permite; o
 * gatilho fixa o requerente, o status `submitted` e recusa campos de revisão.
 * CNPJ já cadastrado é aceito e responde igual (D07), para não revelar quem
 * já está na plataforma. Turnstile e limite de taxa entram com a tela (I1.6).
 */
import type { Dependencias } from "@/lib/operacao/dependencias";
import {
  falha,
  sucesso,
  traduzirErroDoBanco,
  type Resultado,
} from "@/lib/operacao/resultado";
import { comRastreio } from "@/modules/audit/server/rastreio";
import { executarOperacao } from "@/modules/auth/server/operacao";
import { esquemaDoPedido } from "../schemas/adesao";

export function enviarPedidoDeAdesao(
  dependencias: Dependencias,
  entrada: unknown,
): Promise<Resultado<{ pedidoId: string }>> {
  return executarOperacao(
    dependencias,
    esquemaDoPedido,
    entrada,
    async (dados, contexto) => {
      if (!contexto.emailConfirmado) {
        return falha(
          "sem_permissao",
          "Confirme seu e-mail antes de enviar o pedido.",
        );
      }
      const { data, error } = await comRastreio(
        dependencias.sessao
          .from("membership_applications")
          .insert({
            organization_name: dados.nomeDaEmpresa,
            legal_name: dados.razaoSocial,
            cnpj: dados.cnpj,
            contact_email: dados.emailDeContato ?? null,
            contact_phone: dados.telefoneDeContato ?? null,
            requested_kind: dados.tipo,
          })
          .select("id")
          .single(),
        dependencias.requestId,
      ).overrideTypes<{ id: string }, { merge: false }>();
      if (error !== null) {
        if (error.code === "23505") {
          return falha("conflito", "Você já tem um pedido em andamento.");
        }
        return traduzirErroDoBanco(error);
      }
      return sucesso({ pedidoId: data.id });
    },
  );
}
