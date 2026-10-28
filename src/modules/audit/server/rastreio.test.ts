import { describe, expect, it } from "vitest";
import { comRastreio, paraCabecalho } from "./rastreio";

describe("rastreio", () => {
  it("o motivo vai em bytes UTF-8, sem caracteres de controle", () => {
    const valor = paraCabecalho(" Suspensão\r\npor ação ");
    // Cada caractere do valor é um byte, como o fetch exige.
    expect(/^[\x00-\xff]*$/.test(valor)).toBe(true);
    const bytes = Uint8Array.from(valor, (c) => c.charCodeAt(0));
    expect(new TextDecoder().decode(bytes)).toBe("Suspensão por ação");
  });

  it("acrescenta o request id e, se houver, o motivo", () => {
    const cabecalhos: Record<string, string> = {};
    const consulta = {
      setHeader(nome: string, valor: string) {
        cabecalhos[nome] = valor;
        return consulta;
      },
    };
    comRastreio(consulta, "req-1");
    expect(cabecalhos).toEqual({ "x-request-id": "req-1" });
    comRastreio(consulta, "req-2", "motivo");
    expect(cabecalhos).toEqual({
      "x-request-id": "req-2",
      "x-audit-reason": "motivo",
    });
  });
});
