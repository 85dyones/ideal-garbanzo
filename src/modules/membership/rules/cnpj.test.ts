import { describe, expect, it } from "vitest";
import { cnpjValido, normalizarCnpj } from "./cnpj";

describe("CNPJ", () => {
  it("normaliza pontuação e caixa", () => {
    expect(normalizarCnpj("12.abc.345/01de-35")).toBe("12ABC34501DE35");
    expect(normalizarCnpj(" 11.222.333/0001-81 ")).toBe("11222333000181");
  });

  it("aceita o exemplo alfanumérico oficial da Receita", () => {
    expect(cnpjValido("12ABC34501DE35")).toBe(true);
  });

  it("aceita CNPJ numérico válido", () => {
    expect(cnpjValido("11222333000181")).toBe(true);
  });

  it("recusa dígito verificador errado", () => {
    expect(cnpjValido("12ABC34501DE36")).toBe(false);
    expect(cnpjValido("11222333000182")).toBe(false);
  });

  it("recusa letra no dígito verificador, tamanho errado e minúscula", () => {
    expect(cnpjValido("12ABC34501DE3A")).toBe(false);
    expect(cnpjValido("1122233300018")).toBe(false);
    expect(cnpjValido("12abc34501de35")).toBe(false);
  });

  it("recusa sequência de um caractere só", () => {
    expect(cnpjValido("00000000000000")).toBe(false);
    expect(cnpjValido("11111111111111")).toBe(false);
  });
});
