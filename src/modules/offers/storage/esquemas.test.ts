import { describe, expect, it } from "vitest";
import { esquemaDoDocumento } from "./esquemas";

const OFERTA = "c0000000-0000-4000-8000-000000000001";

/** Documento válido, com a descrição pedida. */
function documento(descricao?: string) {
  return {
    ofertaId: OFERTA,
    tipo: "laudo_cautelar",
    tipoDoArquivo: "application/pdf",
    conteudo: new TextEncoder().encode("%PDF-1.4 documento de teste"),
    ...(descricao === undefined ? {} : { descricao }),
  };
}

/** As mensagens do campo `descricao`, ou `[]` se o documento passou. */
function errosDaDescricao(descricao?: string): string[] {
  const lido = esquemaDoDocumento.safeParse(documento(descricao));
  if (lido.success) return [];
  return lido.error.issues
    .filter((problema) => problema.path[0] === "descricao")
    .map((problema) => problema.message);
}

/**
 * Os caracteres pelo código, com o rótulo `U+XXXX`: o código-fonte não leva
 * caractere invisível nem de controle.
 */
function comCodigos(...codigos: number[]): (readonly [string, string])[] {
  return codigos.map((codigo) => [
    `U+${codigo.toString(16).toUpperCase().padStart(4, "0")}`,
    String.fromCodePoint(codigo),
  ]);
}

const PROIBIDOS = "Remova caracteres de controle ou invisíveis do texto.";

describe("descrição do documento da oferta (ACH-05)", () => {
  it("recusa caractere invisível no meio do texto, como private.texto_de_linha", () => {
    // Largura zero, marca de direção, sobreposição de direção, junção e hífen suave.
    for (const [rotulo, invisivel] of comCodigos(
      0x200b,
      0x200e,
      0x202e,
      0x2060,
      0x00ad,
    )) {
      expect(errosDaDescricao(`Laudo${invisivel}cautelar`), rotulo).toEqual([
        PROIBIDOS,
      ]);
    }
  });

  it("recusa caractere de controle no meio do texto, inclusive a quebra de linha", () => {
    for (const [rotulo, controle] of comCodigos(0x00, 0x07, 0x09, 0x0a, 0x7f)) {
      expect(errosDaDescricao(`Laudo${controle}cautelar`), rotulo).toEqual([
        PROIBIDOS,
      ]);
    }
  });

  it("aceita texto normal, com acento, e descrição ausente", () => {
    const lido = esquemaDoDocumento.parse(
      documento("Laudo da vistoria cautelar, outubro de 2026 (página única)"),
    );
    expect(lido.descricao).toBe(
      "Laudo da vistoria cautelar, outubro de 2026 (página única)",
    );
    expect(esquemaDoDocumento.parse(documento()).descricao).toBeUndefined();
  });

  it("espaços nas pontas saem; só espaços e texto longo são recusados", () => {
    expect(esquemaDoDocumento.parse(documento("  Laudo  ")).descricao).toBe(
      "Laudo",
    );
    expect(errosDaDescricao("   ")).toEqual(["Campo obrigatório."]);
    expect(errosDaDescricao("a".repeat(300))).toEqual([]);
    expect(errosDaDescricao("a".repeat(301))).toEqual([
      "Use no máximo 300 caracteres.",
    ]);
  });
});
