import { describe, expect, it } from "vitest";
import { esquemaDaConsulta, esquemaDaRevisao } from "./consultas";

const OFERTA = "a0000000-0000-4000-8000-000000000001";

// Exemplos negativos: os termos da §6.6 aparecem de propósito.
const EXEMPLO_DE_CERTIDAO = "Nada consta."; // linguagem-permitida: exemplo negativo do teste
const EXEMPLO_DE_RESULTADO = "Resultado verificado."; // linguagem-permitida: exemplo negativo do teste
const EXEMPLO_DE_MOTIVO = "Livre de problemas."; // linguagem-permitida: exemplo negativo do teste

function consulta(dados: Record<string, unknown> = {}) {
  return {
    ofertaId: OFERTA,
    categoria: "lien",
    fonte: "DETRAN-SP",
    tipoDeFonte: "official",
    realizadaEm: "2026-10-30T10:00:00-03:00",
    resultado: "no_occurrence_in_source",
    resumo: "Sem gravame ativo.",
    limitacoes: "A fonte cobre só a UF consultada.",
    ...dados,
  };
}

function camposComErro(entrada: unknown): string[] {
  const resultado = esquemaDaConsulta.safeParse(entrada);
  return resultado.success
    ? []
    : [...new Set(resultado.error.issues.map((i) => String(i.path[0])))];
}

describe("esquema da consulta (ADR-0004 §2.9 e §2.12)", () => {
  it("aceita o registro manual completo", () => {
    expect(camposComErro(consulta())).toEqual([]);
  });

  it("recusa termo da §6.6 sem a qualificação, em qualquer texto livre; aceita com ela", () => {
    expect(camposComErro(consulta({ resumo: EXEMPLO_DE_CERTIDAO }))).toEqual([
      "resumo",
    ]);
    expect(
      camposComErro(consulta({ limitacoes: EXEMPLO_DE_RESULTADO })),
    ).toEqual(["limitacoes"]);
    expect(
      camposComErro(
        consulta({
          resumo: "Nada consta nas fontes consultadas, em 30/10/2026.",
        }),
      ),
    ).toEqual([]);
    expect(
      esquemaDaRevisao.safeParse({
        ofertaId: OFERTA,
        categoria: "lien",
        motivo: EXEMPLO_DE_MOTIVO,
      }).success,
    ).toBe(false);
  });

  it("recusa data futura, campo a mais e os campos que o banco grava", () => {
    expect(
      camposComErro(
        consulta({
          realizadaEm: new Date(Date.now() + 86_400_000).toISOString(),
        }),
      ),
    ).toEqual(["realizadaEm"]);
    expect(camposComErro(consulta({ isTest: true }))).not.toEqual([]);
    expect(camposComErro(consulta({ detalhes: { cpf: "1" } }))).not.toEqual([]);
  });
});
