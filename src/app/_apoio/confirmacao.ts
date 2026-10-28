/**
 * Links dos e-mails do Auth (rota `/auth/confirmar`).
 *
 * Dois formatos chegam:
 * - `code`: fluxo PKCE, quando o e-mail usa o link padrão do Supabase e volta
 *   para a URL de retorno; só funciona no mesmo navegador que pediu;
 * - `token_hash` com `type`: quando o modelo de e-mail aponta direto para
 *   `/auth/confirmar?token_hash={{ .TokenHash }}&type=...`. É o único que serve
 *   ao convite do Auth, que não aceita PKCE, e funciona em qualquer navegador.
 */
import { DESTINO_PADRAO, caminhoSeguro } from "./proximo";

export const TIPOS_DE_CONFIRMACAO = [
  "signup",
  "invite",
  "recovery",
  "email",
  "email_change",
] as const;
export type TipoDeConfirmacao = (typeof TIPOS_DE_CONFIRMACAO)[number];

export function tipoDeConfirmacao(
  valor: string | null,
): TipoDeConfirmacao | null {
  return TIPOS_DE_CONFIRMACAO.find((tipo) => tipo === valor) ?? null;
}

/** Convite e recuperação levam à definição de senha; o resto, ao início. */
export function destinoDoTipo(tipo: TipoDeConfirmacao | null): string {
  return tipo === "invite" || tipo === "recovery"
    ? "/nova-senha"
    : DESTINO_PADRAO;
}

export type PedidoDeConfirmacao =
  | {
      readonly forma: "codigo";
      readonly codigo: string;
      readonly destino: string;
    }
  | {
      readonly forma: "token";
      readonly tokenHash: string;
      readonly tipo: TipoDeConfirmacao;
      readonly destino: string;
    }
  | { readonly forma: "invalido" };

/** Lê os parâmetros do link; o destino vem de `proximo`, validado, ou do tipo. */
export function lerConfirmacao(
  parametros: URLSearchParams,
): PedidoDeConfirmacao {
  const tipo = tipoDeConfirmacao(parametros.get("type"));
  const destino = caminhoSeguro(parametros.get("proximo"), destinoDoTipo(tipo));
  const codigo = parametros.get("code");
  if (codigo !== null && codigo !== "") {
    return { forma: "codigo", codigo, destino };
  }
  const tokenHash = parametros.get("token_hash");
  if (tokenHash !== null && tokenHash !== "" && tipo !== null) {
    return { forma: "token", tokenHash, tipo, destino };
  }
  return { forma: "invalido" };
}
