"use server";
/**
 * Botão da página `/auth/confirmar`: só aqui o token do e-mail é usado
 * (ADR-0002 §8, R1). O formulário vem do navegador, então o link é lido e
 * validado de novo, com a mesma regra da página. Os cookies da sessão são
 * gravados pelo cliente da sessão. Link inválido, vencido ou já usado volta
 * para `/entrar` com o aviso fixo.
 */
import { redirect } from "next/navigation";
import { criarClienteDaSessao } from "@/lib/supabase/servidor";
import { lerConfirmacao, parametrosDoFormulario } from "../_apoio/confirmacao";

const LINK_INVALIDO = "/entrar?aviso=link-invalido";

export async function confirmarLinkAcao(dados: FormData): Promise<never> {
  const pedido = lerConfirmacao(parametrosDoFormulario(dados));
  if (pedido.forma === "invalido") redirect(LINK_INVALIDO);

  const sessao = await criarClienteDaSessao();
  const { error } =
    pedido.forma === "codigo"
      ? await sessao.auth.exchangeCodeForSession(pedido.codigo)
      : await sessao.auth.verifyOtp({
          type: pedido.tipo,
          token_hash: pedido.tokenHash,
        });
  if (error !== null) redirect(LINK_INVALIDO);
  redirect(pedido.destino);
}
