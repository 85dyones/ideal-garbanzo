/**
 * Runner dos testes pgTAP (I0.5; ADR-0001 §4), sem Docker local nem pg_prove.
 * Executa cada `*.test.sql` da pasta, lê a saída TAP e falha se algum arquivo
 * não passar ou se não houver teste nenhum. Uma execução por vez (advisory lock).
 *
 * Uso: node scripts/testes-de-banco.mjs [pasta]   (padrão: supabase/tests/database)
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { RAIZ } from "./lib/ambiente.mjs";
import { comTrava, conectar, mensagemSegura } from "./lib/banco.mjs";
import { analisarTap, linhasDosResultados } from "./lib/tap.mjs";

const pasta = path.resolve(
  process.argv[2] ?? path.join(RAIZ, "supabase", "tests", "database"),
);

async function principal() {
  const arquivos = existsSync(pasta)
    ? readdirSync(pasta)
        .filter((nome) => nome.endsWith(".test.sql"))
        .sort()
    : [];
  if (arquivos.length === 0) {
    throw new Error(
      `Nenhum arquivo *.test.sql em ${path.relative(RAIZ, pasta) || pasta}.`,
    );
  }
  const { cliente, descricao } = await conectar();
  console.log(`Destino: ${descricao}`);
  let falhou = false;
  try {
    await comTrava(cliente, async () => {
      await cliente.query(
        "create extension if not exists pgtap with schema extensions",
      );
      for (const arquivo of arquivos) {
        const sql = readFileSync(path.join(pasta, arquivo), "utf8");
        let resultado;
        try {
          await cliente.query("set search_path to public, extensions");
          resultado = analisarTap(
            linhasDosResultados(await cliente.query(sql)),
          );
        } catch (erro) {
          resultado = {
            ok: false,
            problemas: [`erro de SQL: ${mensagemSegura(erro)}`],
            falhas: [],
          };
        } finally {
          await cliente.query("rollback").catch(() => undefined);
        }
        if (resultado.ok) {
          console.log(`ok   ${arquivo} (${resultado.executados} testes)`);
        } else {
          falhou = true;
          console.log(`FALHA ${arquivo}: ${resultado.problemas.join("; ")}`);
          for (const falha of resultado.falhas) console.log(`      ${falha}`);
        }
      }
    });
  } finally {
    await cliente.end();
  }
  if (falhou) throw new Error("Há testes de banco falhando.");
  console.log(`Todos os ${arquivos.length} arquivo(s) de teste passaram.`);
}

principal().catch((erro) => {
  console.error(`Testes de banco: ${mensagemSegura(erro)}`);
  process.exitCode = /Destino recusado|Tire o sslmode/.test(String(erro))
    ? 2
    : 1;
});
