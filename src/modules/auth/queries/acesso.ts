/**
 * Checagens de acesso das telas (ADR-0002 §2.3 e §2.15).
 *
 * Toda página protegida chama `verificarAcesso` antes de buscar qualquer
 * dado; o layout do grupo pode chamar também, mas não basta, porque na
 * navegação entre páginas o layout não roda de novo. A checagem:
 * - valida a sessão junto ao Auth e lê do banco o status do perfil, o papel
 *   na plataforma e os vínculos (`carregarContexto`), uma vez por requisição;
 * - manda o anônimo para `/entrar` com o caminho de volta;
 * - devolve "suspenso" ou "sem permissão" sem ler mais nada; a página mostra
 *   a mesma resposta para qualquer id, exista o registro ou não.
 *
 * A sessão devolvida é a do usuário (chave publicável e cookie): toda leitura
 * da tela passa pela RLS. A chave secreta não é usada aqui.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { cache } from "react";
import { criarClienteDaSessao } from "@/lib/supabase/servidor";
import { carregarContexto } from "../server/contexto";
import type { ContextoDoUsuario } from "../tipos";

export type Situacao =
  | { readonly tipo: "anonimo" }
  | { readonly tipo: "suspenso" }
  | {
      readonly tipo: "ativo";
      readonly contexto: ContextoDoUsuario;
      readonly sessao: SupabaseClient;
    };

/**
 * Situação do usuário na requisição atual, lida do Auth e do banco. O
 * `cache` do React vale só dentro da mesma requisição (layout e página
 * compartilham a leitura); cada navegação lê de novo.
 */
export const lerSituacao = cache(async (): Promise<Situacao> => {
  const sessao = await criarClienteDaSessao();
  const contexto = await carregarContexto(sessao);
  if (contexto.ok) return { tipo: "ativo", contexto: contexto.dados, sessao };
  if (contexto.erro === "sem_sessao") return { tipo: "anonimo" };
  // `carregarContexto` só devolve "sem permissão" para perfil suspenso ou
  // bloqueado no Auth.
  if (contexto.erro === "sem_permissao") return { tipo: "suspenso" };
  throw new Error("Não foi possível carregar o acesso.");
});

export type RegraDeAcesso = (contexto: ContextoDoUsuario) => boolean;

/** Qualquer usuário com perfil ativo. */
export const usuarioAtivo: RegraDeAcesso = () => true;

/**
 * Vínculo ativo com a empresa, qualquer que seja o status da empresa: o
 * membro de empresa suspensa vê a situação dela, mas não os dados internos,
 * que a RLS já esconde (ADR-0002 §2.9).
 */
export function vinculoAtivoCom(empresaId: string): RegraDeAcesso {
  return (contexto) =>
    contexto.vinculos.some(
      (vinculo) =>
        vinculo.organizationId === empresaId && vinculo.status === "active",
    );
}

export type Acesso =
  | {
      readonly liberado: true;
      readonly contexto: ContextoDoUsuario;
      readonly sessao: SupabaseClient;
    }
  | { readonly liberado: false; readonly motivo: "suspenso" | "sem_permissao" };

/**
 * Confere a regra para a página em `caminho`. Anônimo vai para o login, com
 * volta para `caminho`.
 */
export async function verificarAcesso(
  caminho: string,
  regra: RegraDeAcesso,
): Promise<Acesso> {
  const situacao = await lerSituacao();
  if (situacao.tipo === "anonimo") {
    redirect(`/entrar?proximo=${encodeURIComponent(caminho)}`);
  }
  if (situacao.tipo === "suspenso") {
    return { liberado: false, motivo: "suspenso" };
  }
  if (!regra(situacao.contexto)) {
    return { liberado: false, motivo: "sem_permissao" };
  }
  return {
    liberado: true,
    contexto: situacao.contexto,
    sessao: situacao.sessao,
  };
}
