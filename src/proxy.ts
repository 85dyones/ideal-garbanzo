/**
 * Proxy do Next 16 (antigo middleware). Faz só duas coisas:
 * 1. renova a sessão do Supabase com o padrão do `@supabase/ssr`, gravando os
 *    cookies na requisição (para a página) e na resposta (para o navegador);
 * 2. manda o anônimo das áreas logadas para `/entrar?proximo=...`.
 *
 * Não é barreira de autorização: cada página e cada operação de servidor
 * confere o acesso no banco (ADR-0002 §2.15). A chave secreta não entra aqui.
 *
 * As chamadas de Server Action (cabeçalho `next-action`) ficam fora: a ação
 * já renova a sessão pelo próprio cliente, onde gravar cookie é permitido, e
 * assim o proxy não copia em memória o corpo do envio de evidência.
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ehAreaLogada } from "@/app/_apoio/areas";

export async function proxy(request: NextRequest): Promise<NextResponse> {
  let resposta = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  // Sem configuração, as páginas mostram o erro; o proxy não decide nada.
  if (url === undefined || url === "" || chave === undefined || chave === "") {
    return resposta;
  }

  const supabase = createServerClient(url, chave, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(paraGravar, cabecalhos) {
        for (const { name, value } of paraGravar) {
          request.cookies.set(name, value);
        }
        resposta = NextResponse.next({ request });
        for (const { name, value, options } of paraGravar) {
          resposta.cookies.set(name, value, options);
        }
        // Resposta que grava cookie de sessão não pode ir para cache compartilhado.
        for (const [nome, valor] of Object.entries(cabecalhos)) {
          resposta.headers.set(nome, valor);
        }
      },
    },
  });

  // Valida o token (e o renova, se venceu) antes de qualquer página rodar.
  const { data } = await supabase.auth.getClaims();
  const logado = data !== null;

  const { pathname, search } = request.nextUrl;
  if (!logado && ehAreaLogada(pathname)) {
    const login = request.nextUrl.clone();
    login.pathname = "/entrar";
    login.search = "";
    login.searchParams.set("proximo", `${pathname}${search}`);
    const redirecionamento = NextResponse.redirect(login);
    for (const cookie of resposta.cookies.getAll()) {
      redirecionamento.cookies.set(cookie);
    }
    return redirecionamento;
  }
  return resposta;
}

export const config = {
  matcher: [
    {
      source:
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
      missing: [{ type: "header", key: "next-action" }],
    },
  ],
};
