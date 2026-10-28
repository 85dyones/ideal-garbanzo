"use server";
/**
 * Botão da página `/auth/confirmar`: só aqui o token do e-mail é usado
 * (ADR-0002 §8, R1). O formulário vem do navegador, então o link é lido e
 * validado de novo, com a mesma regra da página. Os cookies da sessão são
 * gravados pelo cliente da sessão. Link inválido, vencido ou já usado volta
 * para `/entrar` com o aviso fixo.
 *
 * Confirmação de cadastro (`signup` ou `email`; o repasse não usa o `email`
 * para entrar sem senha): a senha vira outra aleatória e as outras sessões
 * são encerradas antes de a pessoa criar a própria senha em `/nova-senha`
 * (R8). O link PKCE (`code`) não diz o tipo; os modelos versionados usam o
 * token.
 */
import { redirect } from "next/navigation";
import { criarClienteDaSessao } from "@/lib/supabase/servidor";
import { concluirConfirmacaoDoCadastro } from "@/modules/auth/server/cadastro";
import { lerConfirmacao, parametrosDoFormulario } from "../_apoio/confirmacao";

const LINK_INVALIDO = "/entrar?aviso=link-invalido";
const CADASTRO_INCOMPLETO = "/entrar?aviso=cadastro-incompleto";

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

  if (
    pedido.forma === "token" &&
    (pedido.tipo === "signup" || pedido.tipo === "email")
  ) {
    if (!(await concluirConfirmacaoDoCadastro(sessao))) {
      // Sem a troca, a senha de quem cadastrou antes poderia continuar valendo:
      // encerra todas as sessões e manda a pessoa criar a senha pela recuperação.
      await sessao.auth.signOut({ scope: "global" });
      redirect(CADASTRO_INCOMPLETO);
    }
    redirect("/nova-senha");
  }
  redirect(pedido.destino);
}
