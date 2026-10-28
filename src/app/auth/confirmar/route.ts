/**
 * Retorno dos links de e-mail do Auth: confirmação de cadastro, recuperação
 * de senha, convite e troca de e-mail (ADR-0002 §2.6 e §2.8).
 *
 * - `code`: troca pela sessão (`exchangeCodeForSession`, fluxo PKCE).
 * - `token_hash` com `type`: confere com `verifyOtp`. O convite do Auth não
 *   aceita PKCE; por isso o modelo de e-mail aponta direto para cá.
 *
 * Os cookies da sessão são gravados pelo cliente da sessão. O destino é o
 * `proximo` validado (só caminho do próprio site) ou o padrão do tipo: convite
 * e recuperação vão para `/nova-senha`; o resto, para `/inicio`. Link
 * inválido ou vencido volta para `/entrar` com um aviso fixo.
 */
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { criarClienteDaSessao } from "@/lib/supabase/servidor";
import { lerConfirmacao } from "@/app/_apoio/confirmacao";

export async function GET(request: NextRequest): Promise<never> {
  const pedido = lerConfirmacao(request.nextUrl.searchParams);
  if (pedido.forma === "invalido") redirect("/entrar?aviso=link-invalido");

  const sessao = await criarClienteDaSessao();
  const { error } =
    pedido.forma === "codigo"
      ? await sessao.auth.exchangeCodeForSession(pedido.codigo)
      : await sessao.auth.verifyOtp({
          type: pedido.tipo,
          token_hash: pedido.tokenHash,
        });
  if (error !== null) redirect("/entrar?aviso=link-invalido");
  redirect(pedido.destino);
}
