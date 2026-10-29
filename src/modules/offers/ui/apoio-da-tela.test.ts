import { describe, expect, it } from "vitest";
import { comoItem, etapaDaPendencia, pendenciasPorEtapa } from "./etapas";
import {
  SEM_NOME,
  SISTEMA,
  eventosDoHistorico,
  pessoasDoHistorico,
  valorDoHistorico,
} from "./historico";
import { mudancasDaOrdem, posicaoDaProximaFoto } from "./ordem";

const nomes = new Map([["p1", "Ana"]]);
const nomeDe = (id: string) => nomes.get(id);

describe("pendências por etapa", () => {
  it("leva cada código à etapa em que a pessoa resolve", () => {
    expect(etapaDaPendencia("plate")).toBe("veiculo");
    expect(etapaDaPendencia("asking_price")).toBe("condicoes");
    expect(etapaDaPendencia("location")).toBe("condicoes");
    expect(etapaDaPendencia("declaration:auction")).toBe("declaracoes");
    expect(etapaDaPendencia("supplier")).toBe("outras");
  });

  it("agrupa os rótulos e omite etapa sem pendência", () => {
    expect(
      pendenciasPorEtapa([
        { codigo: "make", rotulo: "marca" },
        { codigo: "model", rotulo: "modelo" },
        { codigo: "declaration:lien", rotulo: "declaração em Gravame" },
      ]),
    ).toEqual({
      veiculo: ["marca", "modelo"],
      declaracoes: ["declaração em Gravame"],
    });
    expect(comoItem("marca")).toBe("Marca");
  });
});

describe("ordem das fotos", () => {
  const fotos = [
    { id: "a", ordem: 0 },
    { id: "b", ordem: 0 },
    { id: "c", ordem: 5 },
  ];

  it("renumera e devolve só o que muda", () => {
    // Levar "c" para o início: c=0, a=1, b=2.
    expect(mudancasDaOrdem(fotos, 2, 0)).toEqual([
      { fotoId: "c", ordem: 0 },
      { fotoId: "a", ordem: 1 },
      { fotoId: "b", ordem: 2 },
    ]);
    // Trocar "a" e "b": b=0 já está; a=1; c=2.
    expect(mudancasDaOrdem(fotos, 0, 1)).toEqual([
      { fotoId: "a", ordem: 1 },
      { fotoId: "c", ordem: 2 },
    ]);
  });

  it("não move para fora da lista", () => {
    expect(mudancasDaOrdem(fotos, 0, -1)).toEqual([]);
    expect(mudancasDaOrdem(fotos, 2, 3)).toEqual([]);
    expect(mudancasDaOrdem(fotos, 1, 1)).toEqual([]);
  });

  it("a próxima foto vai para depois da última, até 999", () => {
    expect(posicaoDaProximaFoto([])).toBe(0);
    expect(posicaoDaProximaFoto(fotos)).toBe(6);
    expect(posicaoDaProximaFoto([{ id: "x", ordem: 999 }])).toBe(999);
  });
});

describe("histórico da oferta", () => {
  it("mostra valores em português", () => {
    expect(valorDoHistorico("status", "under_review", nomeDe)).toBe(
      "Em revisão",
    );
    expect(valorDoHistorico("asking_price", 65000, nomeDe)).toBe(
      "R$ 65.000,00",
    );
    expect(valorDoHistorico("mileage_km", 45000, nomeDe)).toBe("45.000 km");
    expect(valorDoHistorico("suspended_category", "forgery", nomeDe)).toBe(
      "Falsificação",
    );
    expect(valorDoHistorico("publication_authorized_by", "p1", nomeDe)).toBe(
      "Ana",
    );
    expect(valorDoHistorico("withdrawn_by", "p2", nomeDe)).toBe(SEM_NOME);
    expect(valorDoHistorico("make", null, nomeDe)).toBe("—");
    expect(
      valorDoHistorico("valid_until", "2026-11-14T02:59:59Z", nomeDe),
    ).toContain("13/11/2026");
  });

  it("agrupa as mudanças da mesma escrita e nomeia o sistema", () => {
    const eventos = eventosDoHistorico(
      [
        {
          id: "1",
          campo: "status",
          antes: "draft",
          depois: "under_review",
          autor: "p1",
          em: "2026-10-29T15:00:00Z",
        },
        {
          id: "2",
          campo: "publication_authorized_by",
          antes: null,
          depois: "p1",
          autor: "p1",
          em: "2026-10-29T15:00:00Z",
        },
        {
          id: "3",
          campo: "status",
          antes: "published",
          depois: "expired",
          autor: null,
          em: "2026-10-28T15:00:00Z",
        },
      ],
      nomeDe,
    );
    expect(eventos).toHaveLength(2);
    expect(eventos[0]?.autor).toBe("Ana");
    expect(eventos[0]?.mudancas.map((mudanca) => mudanca.campo)).toEqual([
      "Situação",
      "Autorização de divulgação declarada por",
    ]);
    expect(eventos[0]?.mudancas[0]).toMatchObject({
      antes: "Rascunho",
      depois: "Em revisão",
    });
    expect(eventos[1]?.autor).toBe(SISTEMA);
  });

  it("junta as pessoas citadas para buscar os nomes", () => {
    expect(
      pessoasDoHistorico([
        {
          id: "1",
          campo: "withdrawn_by",
          antes: null,
          depois: "p2",
          autor: "p1",
          em: "x",
        },
        {
          id: "2",
          campo: "make",
          antes: "p9",
          depois: "Fiat",
          autor: null,
          em: "x",
        },
      ]).sort(),
    ).toEqual(["p1", "p2"]);
  });
});
