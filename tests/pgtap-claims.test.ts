/**
 * Convenção do pgTAP (ADR-0002 §3; R4 da I1.7): toda asserção que roda com o
 * papel trocado (`set local role`) tem `request.jwt.claims` definidas, como o
 * PostgREST faz. Sem claims, `private.manutencao()` pode valer e o teste
 * passar sem provar nada.
 *
 * A leitura é por linha e segue as convenções dos arquivos:
 * - `set local role X` troca o papel; `reset role` volta a postgres;
 * - `pg_temp.entrar('<nome>')` e `set_config('request.jwt.claims', '<json>')`
 *   definem as claims; `pg_temp.entrar(null)` e `set_config(..., '')` limpam;
 * - os apoios `pg_temp.admin`, `conceder`, `pedido`, `evidencia`, `empresa` e
 *   `vincular` limpam as claims ao terminar;
 * - corpos de `pg_temp.*` e blocos `do $$` não são asserções.
 * Uma convenção nova nos arquivos pede ajuste aqui.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const PASTA = fileURLToPath(
  new URL("../supabase/tests/database/", import.meta.url),
);

const ASSERCAO =
  /^select (throws_ok|throws_like|throws_matching|is|isnt|ok|lives_ok|results_eq|results_ne|set_eq|bag_eq|is_empty|isnt_empty|row_eq|cmp_ok|matches|imatches|alike|unalike)\(/;
const APOIO_QUE_LIMPA =
  /^select pg_temp\.(admin|conceder|pedido|evidencia|empresa|vincular)\(/;
const CLAIMS_VAZIAS = /'request\.jwt\.claims',\s*''/;

/** Linhas (1-based) de asserções com papel trocado e claims vazias. */
export function assercoesSemClaims(sql: string): number[] {
  let papel = "postgres";
  let claims = false;
  let emFuncao = false;
  let emBloco = false;
  const achados: number[] = [];
  sql.split(/\r?\n/).forEach((linha, indice) => {
    if (/^create (or replace )?function pg_temp\./.test(linha)) {
      emFuncao = true;
      return;
    }
    if (emFuncao) {
      if (linha.includes("$f$;")) emFuncao = false;
      return;
    }
    if (linha.startsWith("do $$")) emBloco = true;
    if (emBloco) {
      if (linha.includes("request.jwt.claims")) {
        claims = !CLAIMS_VAZIAS.test(linha);
      }
      if (linha.startsWith("$$;")) emBloco = false;
      return;
    }
    const troca = /^\s*set local role (\w+)/.exec(linha);
    if (troca?.[1] !== undefined) papel = troca[1];
    if (/^\s*reset role/.test(linha)) papel = "postgres";
    if (linha.startsWith("select pg_temp.entrar(null)")) claims = false;
    if (linha.startsWith("select pg_temp.entrar('")) claims = true;
    if (linha.startsWith("select set_config('request.jwt.claims'")) {
      claims = !CLAIMS_VAZIAS.test(linha);
    }
    if (APOIO_QUE_LIMPA.test(linha)) claims = false;
    if (ASSERCAO.test(linha) && papel !== "postgres" && !claims) {
      achados.push(indice + 1);
    }
  });
  return achados;
}

describe("claims nos testes pgTAP (R4)", () => {
  it("a leitura acha asserção com papel trocado e sem claims", () => {
    const sql = [
      "set local role anon;",
      "select ok(true, 'sem claims');",
      "select set_config('request.jwt.claims', '{\"role\": \"anon\"}', true);",
      "select ok(true, 'com claims');",
      "reset role;",
      "select set_config('request.jwt.claims', '', true);",
      "set local role authenticated;",
      "select is(1, 1, 'claims limpas de novo');",
      "select pg_temp.entrar('A');",
      "select is(1, 1, 'com usuário');",
      "select pg_temp.admin('X');",
      "select is(1, 1, 'o apoio limpou');",
    ].join("\n");
    expect(assercoesSemClaims(sql)).toEqual([2, 8, 12]);
  });

  it("nenhum arquivo do pgTAP tem asserção sob papel trocado sem claims", () => {
    const arquivos = readdirSync(PASTA).filter((nome) =>
      nome.endsWith(".test.sql"),
    );
    expect(arquivos.length).toBeGreaterThan(10);
    const achados = arquivos.flatMap((nome) =>
      assercoesSemClaims(readFileSync(path.join(PASTA, nome), "utf8")).map(
        (linha) => `${nome}:${String(linha)}`,
      ),
    );
    expect(achados).toEqual([]);
  });
});
