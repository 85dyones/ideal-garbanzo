import { describe, expect, it } from "vitest";
import {
  esquemaDaAlteracao,
  esquemaDaCriacao,
} from "@/modules/offers/schemas/ofertas";
import {
  CAMPOS_DO_ESQUEMA_DA_OFERTA,
  MENSAGEM_DO_PRECO,
  dataEmBrasilia,
  errosPorCampo,
  formatarDia,
  formatarPreco,
  formatarQuilometragem,
  formatarValidade,
  inteiroDoCampo,
  juntarErros,
  lerFormularioDaOferta,
  limitesDaValidade,
  precoParaServidor,
  precoParaTela,
  somarDias,
  validadeParaCampo,
  validadeSugerida,
  validadeVencida,
} from "./oferta";

const ID = "6f1c1a4e-5d2b-4c3a-9e8f-1a2b3c4d5e6f";

function formulario(campos: Record<string, string>): FormData {
  const dados = new FormData();
  for (const [nome, valor] of Object.entries(campos)) dados.set(nome, valor);
  return dados;
}

describe("preço no formato brasileiro", () => {
  it("converte o que a pessoa digita para o formato do servidor", () => {
    expect(precoParaServidor("65.000,00")).toBe("65000.00");
    expect(precoParaServidor("65000,5")).toBe("65000.50");
    expect(precoParaServidor("65000")).toBe("65000.00");
    expect(precoParaServidor("1.250")).toBe("1250.00");
    expect(precoParaServidor(" R$ 1.234.567,89 ")).toBe("1234567.89");
    expect(precoParaServidor("007,10")).toBe("7.10");
    expect(precoParaServidor("0,00")).toBe("0.00");
  });

  it("recusa o que não é preço brasileiro", () => {
    for (const texto of [
      "",
      "abc",
      "65000.00",
      "65.00",
      "65,000",
      "1.2345,00",
      "65.000,001",
      "-10,00",
      "12345678901,00",
    ]) {
      expect(precoParaServidor(texto), texto).toBeNull();
    }
  });

  it("o preço convertido passa no esquema do servidor", () => {
    const preco = precoParaServidor("65.000,00");
    expect(
      esquemaDaCriacao.safeParse({
        empresaId: ID,
        veiculo: {},
        oferta: { preco },
      }).success,
    ).toBe(true);
  });

  it("volta para a tela com milhar e vírgula", () => {
    expect(precoParaTela("65000.00")).toBe("65.000,00");
    expect(precoParaTela("65000.5")).toBe("65.000,50");
    expect(precoParaTela("999")).toBe("999,00");
    expect(precoParaTela(1234567.8)).toBe("1.234.567,80");
    expect(precoParaTela(null)).toBe("");
    expect(formatarPreco("65000.00")).toBe("R$ 65.000,00");
    expect(formatarPreco(null)).toBe("—");
  });
});

describe("números e datas", () => {
  it("lê inteiros com ou sem ponto de milhar", () => {
    expect(inteiroDoCampo("45.000")).toBe(45000);
    expect(inteiroDoCampo("2023")).toBe(2023);
    expect(inteiroDoCampo("0")).toBe(0);
    expect(inteiroDoCampo("45,5")).toBeNull();
    expect(inteiroDoCampo("4.50")).toBeNull();
    expect(inteiroDoCampo("dois mil")).toBeNull();
    expect(formatarQuilometragem(45000)).toBe("45.000 km");
    expect(formatarQuilometragem(null)).toBe("—");
  });

  it("calcula o dia no horário de Brasília", () => {
    // 02:30 UTC ainda é o dia anterior em Brasília (UTC-3).
    expect(dataEmBrasilia("2026-11-14T02:30:00Z")).toBe("2026-11-13");
    expect(dataEmBrasilia("2026-11-14T03:30:00Z")).toBe("2026-11-14");
    expect(dataEmBrasilia("não é data")).toBeNull();
    expect(formatarValidade("2026-11-14T02:59:59Z")).toBe("13/11/2026");
    expect(formatarValidade(null)).toBe("—");
  });

  it("soma dias de calendário e formata o dia", () => {
    expect(somarDias("2026-10-29", 15)).toBe("2026-11-13");
    expect(somarDias("2026-12-25", 10)).toBe("2027-01-04");
    expect(formatarDia("2026-11-13")).toBe("13/11/2026");
    expect(formatarDia("13/11/2026")).toBe("—");
  });

  it("sugere a validade e limita o campo pelo teto, a partir de hoje em Brasília", () => {
    // 01:00 UTC de 30/10 ainda é 29/10 em Brasília.
    const agora = new Date("2026-10-30T01:00:00Z");
    expect(validadeSugerida(15, agora)).toBe("2026-11-13");
    expect(validadeSugerida(null, agora)).toBe("");
    expect(limitesDaValidade(30, agora)).toEqual({
      minimo: "2026-10-29",
      maximo: "2026-11-28",
      maximoParaLeitura: "28/11/2026",
    });
    expect(limitesDaValidade(null, agora).maximo).toBeNull();
    expect(validadeParaCampo("2026-11-14T02:59:59Z")).toBe("2026-11-13");
    expect(validadeParaCampo(null)).toBe("");
    expect(validadeVencida("2026-10-30T00:59:59Z", agora)).toBe(true);
    expect(validadeVencida("2026-10-30T01:00:01Z", agora)).toBe(false);
    expect(validadeVencida(null, agora)).toBe(false);
  });
});

describe("formulário do veículo e das condições", () => {
  it("campo em branco fica de fora; números e preço são convertidos", () => {
    const lido = lerFormularioDaOferta(
      formulario({
        marca: "Fiat",
        modelo: " ",
        anoDeFabricacao: "2022",
        quilometragem: "45.000",
        placa: "abc-1d23",
        preco: "65.000,00",
        cidade: "Campinas",
        uf: "SP",
        validaAte: "",
      }),
      { veiculo: true, condicoes: true },
    );
    expect(lido.veiculo).toEqual({
      marca: "Fiat",
      placa: "abc-1d23",
      anoDeFabricacao: 2022,
      quilometragem: 45000,
    });
    expect(lido.oferta).toEqual({
      preco: "65000.00",
      cidade: "Campinas",
      uf: "SP",
    });
    expect(lido.erros).toEqual({});
    expect(lido.valores.modelo).toBe(" ");
    expect(lido.valores.preco).toBe("65.000,00");
  });

  it("número e preço fora do formato viram erro do campo, com o texto preservado", () => {
    const lido = lerFormularioDaOferta(
      formulario({ anoDoModelo: "22", quilometragem: "45 mil", preco: "abc" }),
      { veiculo: true, condicoes: true },
    );
    // "22" é um inteiro: a faixa do ano fica com o esquema.
    expect(Object.keys(lido.erros).sort()).toEqual(["preco", "quilometragem"]);
    expect(lido.erros.preco).toEqual([MENSAGEM_DO_PRECO]);
    expect(lido.veiculo).toEqual({ anoDoModelo: 22 });
    expect(lido.valores.quilometragem).toBe("45 mil");
  });

  it("só lê as partes pedidas", () => {
    const lido = lerFormularioDaOferta(
      formulario({ marca: "Fiat", preco: "10,00" }),
      { veiculo: false, condicoes: true },
    );
    expect(lido.veiculo).toEqual({});
    expect(lido.oferta).toEqual({ preco: "10.00" });
    expect(lido.valores.marca).toBeUndefined();
  });
});

describe("erros do esquema por campo", () => {
  it("leva o erro aninhado ao campo do formulário, em português", () => {
    const lido = esquemaDaCriacao.safeParse({
      empresaId: ID,
      veiculo: {
        renavam: "12345678901",
        anoDeFabricacao: 1800,
        anoDoModelo: 2025,
      },
      oferta: { uf: "XX", preco: "0.00" },
    });
    expect(lido.success).toBe(false);
    if (lido.success) return;
    const erros = errosPorCampo(lido.error, CAMPOS_DO_ESQUEMA_DA_OFERTA);
    expect(erros.renavam).toEqual(["RENAVAM inválido. Confira os dígitos."]);
    expect(erros.anoDeFabricacao).toEqual([
      "Informe o ano com quatro dígitos, entre 1900 e 2100.",
    ]);
    expect(erros.uf).toEqual(["Escolha a UF da lista."]);
    expect(erros.preco).toEqual(["O preço precisa ser maior que zero."]);
  });

  it("mantém a mensagem própria da regra entre os anos", () => {
    const lido = esquemaDaCriacao.safeParse({
      empresaId: ID,
      veiculo: { anoDeFabricacao: 2020, anoDoModelo: 2023 },
    });
    expect(lido.success).toBe(false);
    if (lido.success) return;
    expect(
      errosPorCampo(lido.error, CAMPOS_DO_ESQUEMA_DA_OFERTA).anoDoModelo,
    ).toEqual(["O ano do modelo é o de fabricação ou o seguinte."]);
  });

  it("erro sem campo conhecido vai para o formulário inteiro", () => {
    const lido = esquemaDaAlteracao.safeParse({ ofertaId: ID });
    expect(lido.success).toBe(false);
    if (lido.success) return;
    expect(errosPorCampo(lido.error, CAMPOS_DO_ESQUEMA_DA_OFERTA)).toEqual({
      _: ["Informe ao menos um campo."],
    });
  });

  it("junta listas sem repetir mensagens", () => {
    expect(
      juntarErros({ preco: ["a"] }, { preco: ["a", "b"], cor: ["c"] }),
    ).toEqual({ preco: ["a", "b"], cor: ["c"] });
  });
});
