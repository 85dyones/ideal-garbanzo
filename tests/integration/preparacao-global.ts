/**
 * Preparação dos testes de integração: exige as variáveis, confere o destino
 * (gate 12) e a disponibilidade da API. Qualquer problema falha a suíte.
 *
 * Desde o Inc. 1 a suíte grava dados no banco de desenvolvimento: durante toda
 * a execução ela segura a mesma trava (advisory lock) do reset e dos testes de
 * banco, numa conexão própria, e a solta no encerramento.
 */
import type pg from "pg";
import {
  carregarAmbiente,
  exigirVariaveis,
} from "../../scripts/lib/ambiente.mjs";
import {
  adquirirTrava,
  conectar,
  liberarTrava,
  mensagemSegura,
} from "../../scripts/lib/banco.mjs";
import {
  carregarConfiguracao,
  lerDestino,
  verificarDestinoPermitido,
} from "../../scripts/lib/destino.mjs";

export default async function preparar(): Promise<() => Promise<void>> {
  let cliente: pg.Client | undefined;
  try {
    await verificarAmbiente();
    ({ cliente } = await conectar());
    cliente.on("error", (erro) => {
      // Se a conexão cair, a trava se solta com ela; a suíte segue, mas avisa.
      console.error(
        `\n[integração] a conexão que segura a trava caiu: ${mensagemSegura(erro)}\n`,
      );
    });
    await adquirirTrava(cliente);
  } catch (erro) {
    await cliente?.end().catch(() => undefined);
    // O Vitest pode esconder a mensagem ao montar a pilha; ela sai aqui antes.
    const mensagem = mensagemSegura(erro);
    console.error(`\n[integração] ${mensagem}\n`);
    throw new Error(mensagem);
  }
  const conexao = cliente;
  return async () => {
    try {
      await liberarTrava(conexao);
    } finally {
      await conexao.end();
    }
  };
}

async function verificarAmbiente() {
  carregarAmbiente();
  const {
    NEXT_PUBLIC_SUPABASE_URL: url = "",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: chavePublicavel = "",
    SUPABASE_DB_URL: urlDoBanco = "",
  } = exigirVariaveis([
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_DB_URL",
  ]);
  verificarDestinoPermitido(
    lerDestino(urlDoBanco),
    carregarConfiguracao(),
    process.env.SUPABASE_PROJECT_REF,
  );
  const base = url.replace(/\/$/, "");
  let status: number;
  try {
    const resposta = await fetch(`${base}/auth/v1/health`, {
      headers: { apikey: chavePublicavel },
    });
    status = resposta.status;
  } catch {
    throw new Error(
      "Supabase inacessível: confira a NEXT_PUBLIC_SUPABASE_URL e a rede (no CI, se o supabase start terminou).",
    );
  }
  if (status !== 200) {
    throw new Error(`Supabase respondeu ${String(status)} no health do Auth.`);
  }
}
