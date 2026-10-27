/**
 * Leitor da saída TAP do runner de testes de banco: um arquivo só passa com
 * plano, todos os testes executados e nenhuma falha.
 */
import { describe, expect, it } from "vitest";
import { analisarTap, linhasDosResultados } from "../scripts/lib/tap.mjs";

describe("analisarTap", () => {
  it("passa com plano cumprido e tudo ok", () => {
    const r = analisarTap(["1..2", "ok 1 - primeiro", "ok 2 - segundo"]);
    expect(r.ok).toBe(true);
    expect(r.executados).toBe(2);
  });

  it("falha com not ok", () => {
    const r = analisarTap(["1..2", "ok 1 - primeiro", "not ok 2 - segundo"]);
    expect(r.ok).toBe(false);
    expect(r.falhas).toEqual(["not ok 2 - segundo"]);
  });

  it("falha sem plano", () => {
    expect(analisarTap(["ok 1 - solto"]).ok).toBe(false);
  });

  it("falha quando o plano não é cumprido", () => {
    const r = analisarTap(["1..3", "ok 1", "ok 2"]);
    expect(r.ok).toBe(false);
    expect(r.problemas[0]).toMatch(/3 testes, 2 executados/);
  });

  it("não conta TODO como falha", () => {
    expect(analisarTap(["1..1", "not ok 1 - pendente # TODO depois"]).ok).toBe(
      true,
    );
  });

  it("ignora diagnósticos e linhas vazias", () => {
    expect(analisarTap(["1..1", "", "# diagnóstico", "ok 1"]).ok).toBe(true);
  });
});

describe("linhasDosResultados", () => {
  it("junta as linhas de vários resultados e quebra textos com várias linhas", () => {
    const linhas = linhasDosResultados([
      { rows: [{ plan: "1..2" }] },
      { rows: [{ ok: "ok 1" }, { ok: "ok 2" }] },
      { rows: [{ finish: "# a\n# b" }] },
      { rows: [] },
    ]);
    expect(linhas).toEqual(["1..2", "ok 1", "ok 2", "# a", "# b"]);
  });

  it("aceita um resultado único", () => {
    expect(linhasDosResultados({ rows: [{ x: "1..0" }] })).toEqual(["1..0"]);
  });
});
