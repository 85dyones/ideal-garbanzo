import { describe, expect, it } from "vitest";
import { formatarDataHora, localParaIso, paraCampoLocal } from "./datas";

describe("datas na interface", () => {
  it("mostra no fuso de São Paulo", () => {
    const texto = formatarDataHora("2026-10-28T15:30:00Z");
    expect(texto).toContain("28/10/2026");
    expect(texto).toContain("12:30");
  });

  it("valor ausente ou inválido vira travessão", () => {
    expect(formatarDataHora(null)).toBe("—");
    expect(formatarDataHora(undefined)).toBe("—");
    expect(formatarDataHora("")).toBe("—");
    expect(formatarDataHora("não é data")).toBe("—");
  });

  it("converte a hora local do campo em ISO com fuso", () => {
    expect(localParaIso("2026-10-28T12:00")).toBe(
      new Date(2026, 9, 28, 12, 0).toISOString(),
    );
    expect(localParaIso("")).toBeNull();
    expect(localParaIso("2026-10-28")).toBeNull();
    expect(localParaIso("2026-13-45T99:99")).toBeNull();
  });

  it("formata a data para o campo local e volta", () => {
    const data = new Date(2026, 0, 5, 7, 9, 30);
    expect(paraCampoLocal(data)).toBe("2026-01-05T07:09");
    expect(localParaIso(paraCampoLocal(data))).toBe(
      new Date(2026, 0, 5, 7, 9).toISOString(),
    );
  });
});
