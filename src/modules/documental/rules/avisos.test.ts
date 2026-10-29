import { describe, expect, it } from "vitest";
import { AVISOS, avisoDoEstado, avisosDosEstados } from "./avisos";
import { ESTADOS_DOCUMENTAIS } from "./estados";

describe("catálogo das ressalvas", () => {
  it("todo código tem versão do texto", () => {
    for (const codigo of Object.keys(AVISOS)) {
      expect(codigo).toMatch(/^[a-z_]+\.v[0-9]+$/);
    }
  });

  it("os estados que só a declaração produz têm ressalva; os demais ainda não", () => {
    expect(avisoDoEstado("not_checked")).toBe("categoria_nao_consultada.v1");
    expect(avisoDoEstado("declared_unverified")).toBe(
      "declaracao_sem_comprovacao.v1",
    );
    expect(avisoDoEstado("with_findings")).toBe(
      "categoria_com_apontamentos.v1",
    );
    const semAviso = ESTADOS_DOCUMENTAIS.filter(
      (estado) => avisoDoEstado(estado) === undefined,
    );
    expect(semAviso).toEqual([
      "pending",
      "under_review",
      "no_findings_in_sources",
    ]);
  });

  it("as ressalvas de vários estados saem sem repetição e em ordem de código", () => {
    expect(
      avisosDosEstados(["with_findings", "not_checked", "not_checked"]),
    ).toEqual(["categoria_com_apontamentos.v1", "categoria_nao_consultada.v1"]);
  });
});
