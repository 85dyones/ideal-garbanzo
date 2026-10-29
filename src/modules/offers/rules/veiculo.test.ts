import { describe, expect, it } from "vitest";
import {
  FORMATO_DA_PLACA,
  FORMATO_DO_CHASSI,
  anosCoerentes,
  normalizarPlaca,
  normalizarRenavam,
  renavamValido,
} from "./veiculo";

describe("identificação do veículo (ADR-0003 §2.11)", () => {
  it("placa antiga e Mercosul, em maiúsculas e sem hífen", () => {
    expect(normalizarPlaca("abc-1234")).toBe("ABC1234");
    expect(normalizarPlaca("abc 1d23")).toBe("ABC1D23");
    expect(FORMATO_DA_PLACA.test("ABC1234")).toBe(true);
    expect(FORMATO_DA_PLACA.test("ABC1D23")).toBe(true);
    expect(FORMATO_DA_PLACA.test("AB12345")).toBe(false);
  });

  it("RENAVAM: os mesmos casos do teste 300 do banco", () => {
    expect(renavamValido("12345678900")).toBe(true);
    expect(renavamValido("00638790107")).toBe(true);
    expect(renavamValido("12345678901")).toBe(false);
    expect(renavamValido("1234567890")).toBe(false);
  });

  it("RENAVAM antigo, de 9 dígitos, é completado com zeros", () => {
    expect(normalizarRenavam("638790107")).toBe("00638790107");
    expect(normalizarRenavam("123.456.789-00")).toBe("12345678900");
  });

  it("chassi com 17 caracteres, sem I, O e Q", () => {
    expect(FORMATO_DO_CHASSI.test("9BWZZZ377VT004251")).toBe(true);
    expect(FORMATO_DO_CHASSI.test("9BWZZZ377VT00425I")).toBe(false);
    expect(FORMATO_DO_CHASSI.test("9BWZZZ377VT00425")).toBe(false);
  });

  it("ano do modelo igual ao de fabricação ou ao seguinte", () => {
    expect(anosCoerentes(2020, 2020)).toBe(true);
    expect(anosCoerentes(2020, 2021)).toBe(true);
    expect(anosCoerentes(2020, 2022)).toBe(false);
    expect(anosCoerentes(2020, 2019)).toBe(false);
  });
});
