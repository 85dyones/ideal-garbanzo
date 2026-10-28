/**
 * Origem da requisição, para montar a URL de retorno dos e-mails do Auth
 * (`emailRedirectTo` e `redirectTo`).
 *
 * O Supabase só redireciona para URLs que estejam na lista de Redirect URLs
 * do projeto (painel → Authentication → URL Configuration). URL fora da lista
 * cai na Site URL. Por isso a origem vem da própria requisição: assim o link
 * volta para o mesmo endereço em que a pessoa está (local, preview ou
 * produção), desde que esse endereço esteja na lista.
 */
import { caminhoSeguro } from "./proximo";

function primeiroItem(valor: string | null): string | null {
  const item = valor?.split(",")[0]?.trim();
  return item === undefined || item === "" ? null : item;
}

function ehLocal(host: string): boolean {
  return /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/u.test(host);
}

/** Origem `protocolo://host[:porta]`, ou `null` se os cabeçalhos não formarem uma. */
export function origemDaRequisicao(cabecalhos: Headers): string | null {
  const declarada = cabecalhos.get("origin");
  let candidata: string | null =
    declarada !== null && declarada !== "null" ? declarada : null;
  if (candidata === null) {
    const host =
      primeiroItem(cabecalhos.get("x-forwarded-host")) ??
      primeiroItem(cabecalhos.get("host"));
    if (host === null) return null;
    const protocolo =
      primeiroItem(cabecalhos.get("x-forwarded-proto")) ??
      (ehLocal(host) ? "http" : "https");
    candidata = `${protocolo}://${host}`;
  }
  let url: URL;
  try {
    url = new URL(candidata);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return url.origin;
}

/** `<origem>/auth/confirmar?proximo=<caminho>`; sem origem, `undefined` (o Auth usa a Site URL). */
export function urlDeRetorno(
  origem: string | null,
  proximo: string,
): string | undefined {
  if (origem === null) return undefined;
  const url = new URL("/auth/confirmar", origem);
  url.searchParams.set("proximo", caminhoSeguro(proximo));
  return url.toString();
}
