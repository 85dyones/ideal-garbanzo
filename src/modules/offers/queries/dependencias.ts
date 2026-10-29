/**
 * Dependências das leituras das telas da oferta (I2.8). As consultas que
 * reaproveitam operações de servidor (estados documentais, pendências e URL da
 * foto) recebem só a sessão do usuário: a chave secreta não entra em leitura
 * de tela. Se alguma leitura tentar usá-la, a página falha em vez de seguir.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Dependencias } from "@/lib/operacao/dependencias";
import { novoRequestId } from "@/modules/audit/server/rastreio";

export function dependenciasDaLeitura(sessao: SupabaseClient): Dependencias {
  return {
    sessao,
    administrativo: () => {
      throw new Error("A leitura das telas da oferta não usa a chave secreta.");
    },
    requestId: novoRequestId(),
  };
}
