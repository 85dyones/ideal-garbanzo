/**
 * Preparação dos testes de integração: exige as variáveis, confere o destino
 * (gate 12) e a disponibilidade da API. Qualquer problema falha a suíte.
 */
import {
  carregarAmbiente,
  exigirVariaveis,
} from "../../scripts/lib/ambiente.mjs";
import {
  carregarConfiguracao,
  lerDestino,
  verificarDestinoPermitido,
} from "../../scripts/lib/destino.mjs";

export default async function preparar() {
  try {
    await verificarAmbiente();
  } catch (erro) {
    // O Vitest pode esconder a mensagem ao montar a pilha; ela sai aqui antes.
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error(`\n[integração] ${mensagem}\n`);
    throw new Error(mensagem);
  }
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
