import { describe, expect, it } from "vitest";
import { mensagemDasPendencias, rotuloDaPendencia } from "../rules/oferta";
import {
  esquemaDaAlteracao,
  esquemaDaCriacao,
  esquemaDaDeclaracao,
  esquemaDaPublicacao,
  esquemaDaRevisao,
  esquemaDaSuspensao,
} from "./ofertas";

// Exemplo negativo: o termo da §6.6 aparece de propósito.
const EXEMPLO_DE_DETALHE = "Veículo garantido pela loja."; // linguagem-permitida: exemplo negativo do teste

const EMPRESA = "a0000000-0000-4000-8000-000000000001";
const OFERTA = "c0000000-0000-4000-8000-000000000001";

describe("esquemas da oferta", () => {
  it("normaliza placa, RENAVAM e chassi e confere o formato", () => {
    const lido = esquemaDaCriacao.parse({
      empresaId: EMPRESA,
      veiculo: {
        placa: "abc-1d23",
        renavam: "638790107",
        chassi: "9bwzzz377vt004251",
      },
    });
    expect(lido.veiculo).toEqual({
      placa: "ABC1D23",
      renavam: "00638790107",
      chassi: "9BWZZZ377VT004251",
    });
    for (const veiculo of [
      { placa: "AB-12345" },
      { renavam: "12345678901" },
      { chassi: "9BWZZZ377VT00425O" },
      { anoDeFabricacao: 2020, anoDoModelo: 2022 },
    ]) {
      expect(
        esquemaDaCriacao.safeParse({ empresaId: EMPRESA, veiculo }).success,
      ).toBe(false);
    }
  });

  it("CT12.5: preço junto com status, empresa ou colunas do banco é recusado inteiro", () => {
    for (const extra of [
      { status: "published" },
      { supplier_organization_id: EMPRESA },
      { current_version: 9 },
      { published_at: "2026-10-29T00:00:00Z" },
      { suspended_category: "forgery" },
    ]) {
      expect(
        esquemaDaAlteracao.safeParse({
          ofertaId: OFERTA,
          oferta: { preco: "150000.00", ...extra },
        }).success,
      ).toBe(false);
      expect(
        esquemaDaAlteracao.safeParse({
          ofertaId: OFERTA,
          oferta: { preco: "150000.00" },
          ...extra,
        }).success,
      ).toBe(false);
    }
  });

  it("CT12.7: preço zero, negativo, não numérico ou com três casas é recusado", () => {
    for (const preco of ["0", "0.00", "-1", "abc", "150000.001", "1,50"]) {
      expect(
        esquemaDaAlteracao.safeParse({ ofertaId: OFERTA, oferta: { preco } })
          .success,
      ).toBe(false);
    }
    expect(
      esquemaDaAlteracao.safeParse({
        ofertaId: OFERTA,
        oferta: { preco: "150000.5" },
      }).success,
    ).toBe(true);
  });

  it("alteração sem nenhum campo é recusada", () => {
    expect(
      esquemaDaAlteracao.safeParse({ ofertaId: OFERTA, oferta: {} }).success,
    ).toBe(false);
  });

  it("texto livre: aceita quebra de linha, recusa controle e invisível", () => {
    const lido = esquemaDaAlteracao.parse({
      ofertaId: OFERTA,
      oferta: { condicoesComerciais: " À vista.\r\nSem troca. " },
    });
    expect(lido.oferta?.condicoesComerciais).toBe("À vista.\nSem troca.");
    for (const condicoesComerciais of ["a\tb", "a\u200bb", "a\u202eb"]) {
      expect(
        esquemaDaAlteracao.safeParse({
          ofertaId: OFERTA,
          oferta: { condicoesComerciais },
        }).success,
      ).toBe(false);
    }
    expect(
      esquemaDaAlteracao.safeParse({
        ofertaId: OFERTA,
        oferta: { cidade: "São\nPaulo" },
      }).success,
    ).toBe(false);
  });

  it("validade como data AAAA-MM-DD", () => {
    expect(
      esquemaDaAlteracao.safeParse({
        ofertaId: OFERTA,
        oferta: { validaAte: "2026-11-13" },
      }).success,
    ).toBe(true);
    expect(
      esquemaDaAlteracao.safeParse({
        ofertaId: OFERTA,
        oferta: { validaAte: "13/11/2026" },
      }).success,
    ).toBe(false);
  });

  it("R-I3.7-07: o detalhe da declaração passa pela lista de linguagem, com mensagem que nomeia o termo", () => {
    const comTermo = esquemaDaDeclaracao.safeParse({
      ofertaId: OFERTA,
      categoria: "casualty",
      valor: "has_occurrence",
      detalhe: EXEMPLO_DE_DETALHE,
    });
    expect(comTermo.success).toBe(false);
    if (!comTermo.success) {
      expect(comTermo.error.issues[0]?.path).toEqual(["detalhe"]);
      expect(comTermo.error.issues[0]?.message).toContain(
        "Descreva a ocorrência com o que você sabe dela",
      );
    }
    expect(
      esquemaDaDeclaracao.safeParse({
        ofertaId: OFERTA,
        categoria: "casualty",
        valor: "has_occurrence",
        detalhe: "Dano leve no para-choque, já reparado.",
      }).success,
    ).toBe(true);
  });

  it("B28: ocorrência declarada exige detalhe; desconhece é escolha explícita", () => {
    expect(
      esquemaDaDeclaracao.safeParse({
        ofertaId: OFERTA,
        categoria: "auction",
        valor: "has_occurrence",
      }).success,
    ).toBe(false);
    expect(
      esquemaDaDeclaracao.safeParse({ ofertaId: OFERTA, categoria: "auction" })
        .success,
    ).toBe(false);
    expect(
      esquemaDaDeclaracao.safeParse({
        ofertaId: OFERTA,
        categoria: "auction",
        valor: "unknown",
      }).success,
    ).toBe(true);
  });

  it("B30: publicar exige declarar a autorização de divulgação", () => {
    expect(esquemaDaPublicacao.safeParse({ ofertaId: OFERTA }).success).toBe(
      false,
    );
    expect(
      esquemaDaPublicacao.safeParse({
        ofertaId: OFERTA,
        autorizacaoDeDivulgacao: false,
      }).success,
    ).toBe(false);
  });

  it("X08 e X09: suspensão com categoria da §6.10 e motivo; devolução com motivo", () => {
    expect(
      esquemaDaSuspensao.safeParse({
        ofertaId: OFERTA,
        categoria: "forgery",
      }).success,
    ).toBe(false);
    expect(
      esquemaDaSuspensao.safeParse({
        ofertaId: OFERTA,
        categoria: "documental_pending",
        motivo: "Pendência documental.",
      }).success,
    ).toBe(false);
    expect(
      esquemaDaRevisao.safeParse({ ofertaId: OFERTA, decisao: "devolver" })
        .success,
    ).toBe(false);
    expect(
      esquemaDaRevisao.safeParse({ ofertaId: OFERTA, decisao: "publicar" })
        .success,
    ).toBe(true);
  });
});

describe("pendências de publicação", () => {
  it("rótulos das pendências do banco, com a categoria pelo nome", () => {
    expect(rotuloDaPendencia("renavam")).toBe("RENAVAM");
    expect(rotuloDaPendencia("declaration:auction")).toBe(
      "declaração em Passagem por leilão",
    );
    expect(mensagemDasPendencias(["make", "location"])).toBe(
      "Falta preencher: marca; cidade e UF.",
    );
  });
});
