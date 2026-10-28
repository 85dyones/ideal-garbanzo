/**
 * Links dos e-mails do Auth (rota `/auth/confirmar`).
 *
 * Dois formatos chegam:
 * - `code`: fluxo PKCE, quando o e-mail usa o link padrão do Supabase e volta
 *   para a URL de retorno; só funciona no mesmo navegador que pediu;
 * - `token_hash` com `type`: quando o modelo de e-mail aponta direto para
 *   `/auth/confirmar?token_hash={{ .TokenHash }}&type=...`. É o único que serve
 *   ao convite do Auth, que não aceita PKCE, e funciona em qualquer navegador.
 *
 * Link com parâmetro repetido, ou com código e token juntos, é inválido. Quem
 * chama a API do Auth escolhe a URL de retorno (dentro da lista do projeto), e
 * o modelo acrescenta o token depois dela: um `token_hash` posto na URL de
 * retorno viria primeiro e levaria a pessoa à conta de quem o pôs (ADR-0002
 * §8, R2).
 */
import { DESTINO_PADRAO, caminhoSeguro } from "./proximo";

const PARAMETROS_UNICOS = ["token_hash", "type", "code", "proximo"] as const;

function linkAmbiguo(parametros: URLSearchParams): boolean {
  if (PARAMETROS_UNICOS.some((nome) => parametros.getAll(nome).length > 1)) {
    return true;
  }
  return parametros.has("code") && parametros.has("token_hash");
}

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
  if (linkAmbiguo(parametros)) return { forma: "invalido" };
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
