/**
 * Cadastro sem senha escolhida antes da confirmação (ADR-0002 §8, R8).
 *
 * O Auth não troca a senha quando a mesma conta, ainda sem confirmação, é
 * cadastrada de novo: quem cadastrasse primeiro o e-mail de outra pessoa
 * entraria com a própria senha depois que o dono confirmasse. Por isso:
 * - o cadastro manda ao Auth uma senha aleatória, que ninguém conhece;
 * - quando o dono confirma, a senha vira outra aleatória e as outras sessões
 *   são encerradas, com a sessão que a confirmação acabou de abrir; só depois
 *   a pessoa cria a própria senha em `/nova-senha`.
 */
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Senha que ninguém conhece, com os tipos de caractere que uma política exigiria. */
export function senhaAleatoria(): string {
  return `${randomBytes(24).toString("base64url")}aA1!`;
}

/**
 * Depois de o dono confirmar o cadastro: troca a senha e encerra as outras
 * sessões, com a sessão aberta pela confirmação. `false` se o Auth recusar
 * qualquer passo. A troca de senha no Auth já encerra as outras sessões
 * (observado no `dev` em 28/10: `refresh_token_not_found`); o encerramento
 * explícito é a segunda camada, caso esse comportamento mude.
 */
export async function concluirConfirmacaoDoCadastro(
  sessao: SupabaseClient,
): Promise<boolean> {
  const troca = await sessao.auth.updateUser({ password: senhaAleatoria() });
  if (troca.error !== null) return false;
  const saida = await sessao.auth.signOut({ scope: "others" });
  return saida.error === null;
}
