import { describe, expect, it } from "vitest";
import { conteudoConfereComOTipo } from "./evidencia";

const bytes = (...valores: number[]) => new Uint8Array(valores);
const texto = (valor: string) => new TextEncoder().encode(valor);

describe("assinatura do arquivo de evidência", () => {
  it("reconhece PDF, PNG, JPEG e WebP", () => {
    expect(
      conteudoConfereComOTipo(texto("%PDF-1.7\n"), "application/pdf"),
    ).toBe(true);
    expect(
      conteudoConfereComOTipo(
        bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0),
        "image/png",
      ),
    ).toBe(true);
    expect(
      conteudoConfereComOTipo(bytes(0xff, 0xd8, 0xff, 0xe0), "image/jpeg"),
    ).toBe(true);
    expect(
      conteudoConfereComOTipo(
        texto("RIFF\u0000\u0000\u0000\u0000WEBPVP8 "),
        "image/webp",
      ),
    ).toBe(true);
  });

  it("recusa conteúdo de outro tipo ou curto demais", () => {
    expect(conteudoConfereComOTipo(texto("<html>"), "application/pdf")).toBe(
      false,
    );
    expect(conteudoConfereComOTipo(texto("%PDF-1.7"), "image/png")).toBe(false);
    expect(conteudoConfereComOTipo(bytes(0xff, 0xd8), "image/jpeg")).toBe(
      false,
    );
    expect(conteudoConfereComOTipo(texto("RIFF0000WAVE"), "image/webp")).toBe(
      false,
    );
  });
});
