import { describe, expect, it } from "vitest";
import {
  ESTADOS_DOCUMENTAIS,
  PRECEDENCIA,
  ROTULO_DO_ESTADO,
  estadoPelaDeclaracao,
  estadoPrevalente,
  resumoProporcional,
  rotuloDaCategoria,
} from "./estados";

describe("estados documentais (§6.4)", () => {
  it("só a declaração: desconhece e a falta de declaração ficam como não consultado (B29)", () => {
    expect(estadoPelaDeclaracao("unknown")).toBe("not_checked");
    expect(estadoPelaDeclaracao(null)).toBe("not_checked");
    expect(estadoPelaDeclaracao("no_known_occurrence")).toBe(
      "declared_unverified",
    );
    expect(estadoPelaDeclaracao("has_occurrence")).toBe("with_findings");
  });

  it("a precedência cobre todos os estados, na ordem da §6.4", () => {
    expect([...PRECEDENCIA].sort()).toEqual([...ESTADOS_DOCUMENTAIS].sort());
    expect(PRECEDENCIA).toEqual([
      "under_review",
      "with_findings",
      "pending",
      "no_findings_in_sources",
      "declared_unverified",
      "not_checked",
    ]);
  });

  it("entre candidatos, vence o de maior precedência; sem candidato, não consultado", () => {
    expect(estadoPrevalente(["declared_unverified", "with_findings"])).toBe(
      "with_findings",
    );
    expect(estadoPrevalente(["no_findings_in_sources", "under_review"])).toBe(
      "under_review",
    );
    expect(estadoPrevalente([])).toBe("not_checked");
  });

  it("o único rótulo sem apontamentos leva a qualificação das fontes (§6.6)", () => {
    expect(ROTULO_DO_ESTADO.no_findings_in_sources).toContain(
      "nas fontes consultadas",
    );
  });

  it("resumo proporcional na ordem da precedência, nunca um selo único", () => {
    expect(
      resumoProporcional([
        "not_checked",
        "with_findings",
        "not_checked",
        "declared_unverified",
      ]),
    ).toBe(
      "1 com apontamentos, 1 declarada sem comprovação, 2 não consultadas",
    );
    expect(resumoProporcional(["pending", "pending"])).toBe("2 pendentes");
    expect(resumoProporcional([])).toBe("");
  });

  it("categoria nova da configuração aparece pelo código", () => {
    expect(rotuloDaCategoria("lien")).toBe("Gravame");
    expect(rotuloDaCategoria("categoria_nova")).toBe("categoria_nova");
  });
});
