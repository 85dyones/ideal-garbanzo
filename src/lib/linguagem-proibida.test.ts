import { describe, expect, it } from "vitest";
import {
  carregarListaPadrao,
  criarVarredor,
  normalizar,
  validarLista,
  varrerTexto,
} from "./linguagem-proibida";

const lista = carregarListaPadrao();
const varrer = criarVarredor(lista);

function termosEncontrados(texto: string): string[] {
  return varrer(texto).map((ocorrencia) => ocorrencia.termo);
}

describe("normalizar", () => {
  it("remove acentos e passa para minúsculas", () => {
    expect(normalizar("PROCEDÊNCIA Veículo Ação")).toBe(
      "procedencia veiculo acao",
    );
  });

  it("trata texto já decomposto (NFD)", () => {
    expect(normalizar("procedência")).toBe("procedencia");
  });
});

describe("lista configurada", () => {
  it("cobre os termos da especificação v1.1, §6.6", () => {
    const termos = lista.termos.map((item) => item.termo);
    expect(termos).toEqual(
      expect.arrayContaining([
        "verificado",
        "aprovado",
        "certificado",
        "garantido",
        "procedência garantida",
        "livre de problemas",
        "nada consta",
      ]),
    );
  });

  it("traz a qualificação aceita e o marcador de exceção", () => {
    expect(lista.qualificacao).toBe("nas fontes consultadas");
    expect(lista.marcadorDeExcecao).toBe("linguagem-permitida:");
  });

  it.each([
    ["verificado", ["verificado", "verificada", "verificados", "verificadas"]],
    ["aprovado", ["aprovado", "aprovada", "aprovados", "aprovadas"]],
    [
      "certificado",
      ["certificado", "certificada", "certificados", "certificadas"],
    ],
    ["garantido", ["garantido", "garantida", "garantidos", "garantidas"]],
  ])("cobre gênero e número de %s", (termo, flexoes) => {
    const item = lista.termos.find((t) => t.termo === termo);
    expect(item?.variantes).toEqual(expect.arrayContaining(flexoes));
  });
});

describe("varredor: ocorrências", () => {
  it("encontra o termo e informa linha, coluna e trecho", () => {
    expect(varrer("Veículo verificado")).toEqual([
      { linha: 1, coluna: 9, termo: "verificado", trecho: "verificado" },
    ]);
  });

  it("não diferencia maiúsculas", () => {
    expect(varrer("VEÍCULO VERIFICADO")).toEqual([
      { linha: 1, coluna: 9, termo: "verificado", trecho: "VERIFICADO" },
    ]);
  });

  it("não diferencia acentos, nem no texto nem no termo", () => {
    expect(termosEncontrados("Procedencia garantida")).toEqual([
      "procedência garantida",
    ]);
    expect(termosEncontrados("PROCEDÊNCIA GARANTIDA")).toEqual([
      "procedência garantida",
    ]);
    expect(termosEncontrados("procedência garantida")).toEqual([
      "procedência garantida",
    ]);
  });

  it("devolve o trecho original, com acento, quando o termo tem acento", () => {
    expect(varrer("Carro de PROCEDÊNCIA GARANTIDA.")).toEqual([
      {
        linha: 1,
        coluna: 10,
        termo: "procedência garantida",
        trecho: "PROCEDÊNCIA GARANTIDA",
      },
    ]);
  });

  it("fica com o trecho mais longo quando um termo contém outro", () => {
    expect(termosEncontrados("procedência garantida")).toEqual([
      "procedência garantida",
    ]);
  });

  it.each([
    ["Oferta verificada", "verificado"],
    ["Veículos verificados", "verificado"],
    ["Ofertas aprovadas", "aprovado"],
    ["Oferta certificada", "certificado"],
    ["Itens garantidos", "garantido"],
    ["Procedências garantidas", "procedência garantida"],
    ["Carros livres de problemas", "livre de problemas"],
    ["Livre de problema algum", "livre de problemas"],
    ["Nada consta", "nada consta"],
    ["Certidão de nada-consta", "nada consta"],
    ["nada   consta", "nada consta"],
  ])("encontra flexões e variações: %s", (texto, termo) => {
    expect(termosEncontrados(texto)).toEqual([termo]);
  });

  it("encontra mais de uma ocorrência na mesma linha", () => {
    expect(varrer("Aprovado e garantido")).toEqual([
      { linha: 1, coluna: 1, termo: "aprovado", trecho: "Aprovado" },
      { linha: 1, coluna: 12, termo: "garantido", trecho: "garantido" },
    ]);
  });

  it("numera as linhas, com LF e com CRLF", () => {
    const texto = "primeira linha\r\nsegunda linha\nveículo aprovado";
    expect(varrer(texto)).toEqual([
      { linha: 3, coluna: 9, termo: "aprovado", trecho: "aprovado" },
    ]);
  });

  it("a qualificação numa linha não libera outra linha", () => {
    const texto =
      "Sem apontamentos nas fontes consultadas, em 26/10/2026\nVeículo verificado";
    expect(varrer(texto)).toEqual([
      { linha: 2, coluna: 9, termo: "verificado", trecho: "verificado" },
    ]);
  });

  it("marcador sem motivo não libera a linha", () => {
    expect(
      termosEncontrados("Empresa aprovada // linguagem-permitida:"),
    ).toEqual(["aprovado"]);
    expect(
      termosEncontrados("Empresa aprovada // linguagem-permitida:   "),
    ).toEqual(["aprovado"]);
  });

  it("varrerTexto usa a lista configurada por padrão", () => {
    expect(varrerTexto("veículo verificado").map((o) => o.termo)).toEqual([
      "verificado",
    ]);
  });
});

describe("varredor: sem ocorrência", () => {
  it("texto vazio ou sem termos", () => {
    expect(varrer("")).toEqual([]);
    expect(
      varrer("Não consultado\nPendente ou incompleto\nCom apontamentos"),
    ).toEqual([]);
  });

  it("linha com a qualificação aceita", () => {
    expect(varrer("Verificado nas fontes consultadas, em 26/10/2026")).toEqual(
      [],
    );
  });

  it("qualificação sem diferenciar maiúsculas e acentos", () => {
    expect(varrer("Nada consta NAS FONTES CONSULTADAS, em 26/10/2026")).toEqual(
      [],
    );
    expect(varrer("nada consta nas fontes   consultadas")).toEqual([]);
  });

  it("linha com o marcador de exceção seguido do motivo", () => {
    expect(
      varrer(
        "Empresa aprovada {/* linguagem-permitida: adesão da empresa, não do veículo */}",
      ),
    ).toEqual([]);
    expect(
      varrer(
        "Empresa aprovada <!-- Linguagem-Permitida: adesão da empresa -->",
      ),
    ).toEqual([]);
  });

  it("palavras que apenas contêm o termo", () => {
    expect(
      varrer("verificador, desaprovado, certificadora, garantidor"),
    ).toEqual([]);
  });
});

describe("validarLista", () => {
  const valida = {
    qualificacao: "nas fontes consultadas",
    marcadorDeExcecao: "linguagem-permitida:",
    termos: [{ termo: "exemplo", variantes: ["exemplo"] }],
  };

  it("aceita uma lista no formato esperado", () => {
    expect(validarLista(valida)).toEqual(valida);
  });

  it.each([
    ["não é objeto", null],
    ["sem qualificação", { ...valida, qualificacao: "" }],
    ["sem marcador", { ...valida, marcadorDeExcecao: " " }],
    ["sem termos", { ...valida, termos: [] }],
    [
      "termo sem variantes",
      { ...valida, termos: [{ termo: "exemplo", variantes: [] }] },
    ],
    [
      "variante vazia",
      { ...valida, termos: [{ termo: "exemplo", variantes: [""] }] },
    ],
    ["termo malformado", { ...valida, termos: ["exemplo"] }],
  ])("recusa lista inválida: %s", (_caso, dado) => {
    expect(() => validarLista(dado)).toThrow(
      /Lista de linguagem proibida inválida/,
    );
  });
});
