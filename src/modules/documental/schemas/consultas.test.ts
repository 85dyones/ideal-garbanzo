import { describe, expect, it } from "vitest";
import {
  esquemaDaConsulta,
  esquemaDaRevisao,
  mensagemDaLinguagem,
  trechosProibidos,
} from "./consultas";

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

  it("a mensagem nomeia o termo achado, como digitado, e diz como reescrever (TV-I3.6-01)", () => {
    // Os trechos saem dos exemplos acima: nenhum termo fica escrito aqui.
    const termo = EXEMPLO_DE_CERTIDAO.slice(0, -1);
    const resultado = esquemaDaConsulta.safeParse(
      consulta({ resumo: EXEMPLO_DE_CERTIDAO }),
    );
    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues.map((issue) => issue.message)).toEqual([
      `“${termo}” não pode aparecer sozinho. Descreva o que a fonte mostrou ou acrescente “nas fontes consultadas, em [data da consulta]”.`,
    ]);
    expect(trechosProibidos(EXEMPLO_DE_CERTIDAO)).toEqual([termo]);
  });

  it("com mais de um termo, lista todos, uma vez cada", () => {
    const certidao = EXEMPLO_DE_CERTIDAO.slice(0, -1);
    const resultado = EXEMPLO_DE_RESULTADO.slice("Resultado ".length, -1);
    const motivo = EXEMPLO_DE_MOTIVO.slice(0, -1);
    const texto = `${EXEMPLO_DE_CERTIDAO} ${EXEMPLO_DE_RESULTADO} ${EXEMPLO_DE_CERTIDAO} ${EXEMPLO_DE_MOTIVO}`;
    expect(trechosProibidos(texto)).toEqual([certidao, resultado, motivo]);
    expect(mensagemDaLinguagem(trechosProibidos(texto))).toBe(
      `“${certidao}”, “${resultado}” e “${motivo}” não podem aparecer sozinhos. Descreva o que a fonte mostrou ou acrescente “nas fontes consultadas, em [data da consulta]”.`,
    );
    const revisao = esquemaDaRevisao.safeParse({
      ofertaId: OFERTA,
      categoria: "lien",
      motivo: `${EXEMPLO_DE_MOTIVO} ${EXEMPLO_DE_RESULTADO}`,
    });
    expect(revisao.error?.issues.map((issue) => issue.message)).toEqual([
      mensagemDaLinguagem([motivo, resultado]),
    ]);
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
