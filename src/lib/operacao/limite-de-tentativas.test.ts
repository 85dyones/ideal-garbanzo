import { describe, expect, it } from "vitest";
import { LIMITES, chaveDoLimite } from "./limite-de-tentativas";

describe("chave do limite de tentativas", () => {
  it("é um sha256 em hexadecimal, sem o dado em claro", () => {
    const chave = chaveDoLimite("entrar", ["203.0.113.7", "fulano@x.teste"]);
    expect(chave).toMatch(/^[0-9a-f]{64}$/);
    expect(chave).not.toContain("203.0.113.7");
  });

  it("é estável e separa finalidades e partes", () => {
    const base = chaveDoLimite("convite", ["a"]);
    expect(chaveDoLimite("convite", ["a"])).toBe(base);
    expect(chaveDoLimite("pedido_de_adesao", ["a"])).not.toBe(base);
    expect(chaveDoLimite("convite", ["b"])).not.toBe(base);
    // A separação por quebra de linha evita que partes diferentes colidam.
    expect(chaveDoLimite("x", ["ab", "c"])).not.toBe(
      chaveDoLimite("x", ["a", "bc"]),
    );
  });

  it("todos os limites têm valores positivos e finalidades distintas", () => {
    const finalidades = Object.values(LIMITES).map((l) => l.finalidade);
    expect(new Set(finalidades).size).toBe(finalidades.length);
    for (const limite of Object.values(LIMITES)) {
      expect(limite.maximo).toBeGreaterThan(0);
      expect(limite.janelaEmSegundos).toBeGreaterThan(0);
    }
  });
});
