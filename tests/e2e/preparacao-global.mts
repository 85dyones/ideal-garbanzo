/**
 * Preparação dos E2E: exige as variáveis, confere o destino (só o projeto de
 * desenvolvimento ou banco local) e segura, durante toda a execução, a mesma
 * trava (advisory lock) do reset, dos testes de banco e da integração, numa
 * conexão própria, como `tests/integration/preparacao-global.ts`. A função
 * devolvida solta a trava no encerramento.
 *
 * É ESM (`.mts`) para importar os scripts de `scripts/lib/`, que usam
 * `import.meta` (ver `apoio/dados.mts`).
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
    carregarAmbiente();
    const { SUPABASE_DB_URL: urlDoBanco = "" } = exigirVariaveis([
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
    ({ cliente } = await conectar());
    cliente.on("error", (erro) => {
      console.error(
        `\n[e2e] a conexão que segura a trava caiu: ${mensagemSegura(erro)}\n`,
      );
    });
    await adquirirTrava(cliente);
  } catch (erro) {
    await cliente?.end().catch(() => undefined);
    const mensagem = mensagemSegura(erro);
    console.error(`\n[e2e] ${mensagem}\n`);
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
