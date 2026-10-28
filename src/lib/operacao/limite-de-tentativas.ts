/**
 * Limite de tentativas (especificação §7.1; ADR-0002 §2.16).
 *
 * Os contadores ficam no Postgres do repasse (migração
 * `20261028180000_limite_de_tentativas`), por decisão da pessoa responsável:
 * sem provedor novo. A chave vai resumida em sha256, então IP, e-mail e id não
 * ficam gravados em claro. Só o servidor consome, com a chave secreta.
 *
 * Falha fechado: se o banco não responder, a tentativa é recusada.
 *
 * Os valores são provisórios e técnicos (a especificação não fixa números);
 * mudar um valor é mudar esta tabela.
 */
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface Limite {
  /** Nome curto da superfície; entra no resumo da chave. */
  readonly finalidade: string;
  readonly maximo: number;
  readonly janelaEmSegundos: number;
}

export const LIMITES = {
  /** Por quem convida: cada convite de conta nova dispara e-mail do Auth. */
  convite: { finalidade: "convite", maximo: 30, janelaEmSegundos: 3600 },
  /** Por requerente; o banco já impede dois pedidos abertos ao mesmo tempo. */
  pedidoDeAdesao: {
    finalidade: "pedido_de_adesao",
    maximo: 5,
    janelaEmSegundos: 3600,
  },
  /**
   * Telas de autenticação (I1.6). Entrar e recuperar contam por e-mail e, à
   * parte, por IP: só o par IP e e-mail deixaria um IP testar muitos e-mails.
   */
  entrarPorEmail: {
    finalidade: "entrar_email",
    maximo: 10,
    janelaEmSegundos: 900,
  },
  entrarPorIp: { finalidade: "entrar_ip", maximo: 30, janelaEmSegundos: 900 },
  cadastroPorIp: {
    finalidade: "cadastro_ip",
    maximo: 5,
    janelaEmSegundos: 3600,
  },
  recuperacaoPorEmail: {
    finalidade: "recuperacao_email",
    maximo: 5,
    janelaEmSegundos: 3600,
  },
  recuperacaoPorIp: {
    finalidade: "recuperacao_ip",
    maximo: 10,
    janelaEmSegundos: 3600,
  },
} as const satisfies Record<string, Limite>;

/** Resumo sha256 (hexadecimal) da finalidade e das partes da chave. */
export function chaveDoLimite(
  finalidade: string,
  partes: readonly string[],
): string {
  return createHash("sha256")
    .update([finalidade, ...partes].join("\n"))
    .digest("hex");
}

/**
 * Conta uma tentativa e diz se ela cabe no limite. `partes` identificam quem
 * tenta (id do perfil, IP, e-mail normalizado).
 */
export async function consumirLimite(
  administrativo: SupabaseClient,
  limite: Limite,
  partes: readonly string[],
): Promise<boolean> {
  // Sem tipos gerados do banco, o retorno da RPC é lido como `unknown` e
  // conferido: só `true` conta como dentro do limite.
  const resposta: { data: unknown; error: unknown } = await administrativo.rpc(
    "consumir_limite_de_tentativas",
    {
      p_chave: chaveDoLimite(limite.finalidade, partes),
      p_maximo: limite.maximo,
      p_janela_segundos: limite.janelaEmSegundos,
    },
  );
  return resposta.error === null && resposta.data === true;
}

/**
 * Consome vários limites; basta um estourar. Todos são contados, mesmo
 * depois do primeiro que estoura, para a contagem não depender da ordem.
 */
export async function consumirLimites(
  administrativo: SupabaseClient,
  pedidos: readonly (readonly [Limite, readonly string[]])[],
): Promise<boolean> {
  const respostas = await Promise.all(
    pedidos.map(([limite, partes]) =>
      consumirLimite(administrativo, limite, partes),
    ),
  );
  return respostas.every(Boolean);
}
