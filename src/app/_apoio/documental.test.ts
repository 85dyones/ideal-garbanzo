import { describe, expect, it } from "vitest";
import {
  esquemaDaConsulta,
  mensagemDaLinguagem,
} from "@/modules/documental/schemas/consultas";
import {
  CAMPOS_DO_ESQUEMA_DA_CONSULTA,
  erroDoArquivo,
  lerConsulta,
  lerResolucao,
  lerRevisao,
} from "./documental";
import { errosPorCampo } from "./oferta";

const OFERTA = "c0000000-0000-4000-8000-000000000001";
const CONSULTA = "c0000000-0000-4000-8000-000000000002";
const IMPEDIMENTO = "c0000000-0000-4000-8000-000000000003";

function formulario(campos: Readonly<Record<string, string>>): FormData {
  const dados = new FormData();
  for (const [nome, valor] of Object.entries(campos)) dados.set(nome, valor);
  return dados;
}

const COMPLETO = {
  ofertaId: OFERTA,
  categoria: "lien",
  tipoDeFonte: "official",
  fonte: "DETRAN-SP",
  realizadaEm: "2026-01-15T12:00:00.000Z",
  realizadaEmLocal: "2026-01-15T09:00",
  resultado: "no_occurrence_in_source",
  resumo: "Sem gravame ativo na consulta.",
  limitacoes: "A fonte cobre só a UF consultada.",
};

describe("formulário da consulta", () => {
  it("completo, vira a entrada da operação, sem protocolo nem substituição em branco", () => {
    const lido = lerConsulta(
      formulario({ ...COMPLETO, protocolo: "  ", substitui: "" }),
    );
    expect(lido.erros).toEqual({});
    expect(lido.entrada).toEqual({
      ofertaId: OFERTA,
      categoria: "lien",
      tipoDeFonte: "official",
      fonte: "DETRAN-SP",
      realizadaEm: "2026-01-15T12:00:00.000Z",
      resultado: "no_occurrence_in_source",
      resumo: "Sem gravame ativo na consulta.",
      limitacoes: "A fonte cobre só a UF consultada.",
    });
    expect(esquemaDaConsulta.safeParse(lido.entrada).success).toBe(true);
  });

  it("protocolo e substituição entram quando preenchidos", () => {
    const lido = lerConsulta(
      formulario({ ...COMPLETO, protocolo: "123/2026", substitui: CONSULTA }),
    );
    expect(lido.entrada.protocolo).toBe("123/2026");
    expect(lido.entrada.substitui).toBe(CONSULTA);
  });

  it("o que falta escolher vira erro no campo, e o que foi digitado volta ao formulário", () => {
    const lido = lerConsulta(
      formulario({
        ofertaId: OFERTA,
        fonte: "DETRAN-SP",
        realizadaEm: "",
        realizadaEmLocal: "",
      }),
    );
    expect(lido.erros).toEqual({
      categoria: ["Escolha a categoria."],
      tipoDeFonte: ["Escolha o tipo da fonte."],
      resultado: ["Escolha o resultado da consulta."],
      realizadaEm: ["Informe a data e a hora da consulta."],
    });
    expect(lido.valores.fonte).toBe("DETRAN-SP");
    expect(lido.valores).not.toHaveProperty("realizadaEm");
  });

  it("os erros do esquema caem nos campos do formulário, em português", () => {
    const conferido = esquemaDaConsulta.safeParse({
      ...lerConsulta(formulario({ ...COMPLETO, fonte: "", limitacoes: "" }))
        .entrada,
      evidencia: { tipoDoArquivo: "text/plain", conteudo: new Uint8Array(1) },
    });
    expect(conferido.success).toBe(false);
    if (conferido.success) return;
    const erros = errosPorCampo(conferido.error, CAMPOS_DO_ESQUEMA_DA_CONSULTA);
    expect(erros.fonte).toEqual([
      "Informe a fonte consultada, com até 200 caracteres.",
    ]);
    expect(erros.limitacoes).toEqual([
      "Escreva as limitações conhecidas da fonte, com até 2.000 caracteres.",
    ]);
    expect(erros.arquivo).toEqual(["Use um arquivo PDF, JPEG, PNG ou WebP."]);
  });

  it("a recusa por linguagem (§6.6) chega ao campo com a mensagem do esquema, que nomeia o termo", () => {
    const resumo = "Nada consta na fonte."; // linguagem-permitida: exemplo negativo do teste
    const conferido = esquemaDaConsulta.safeParse(
      lerConsulta(formulario({ ...COMPLETO, resumo })).entrada,
    );
    expect(conferido.success).toBe(false);
    if (conferido.success) return;
    const erros = errosPorCampo(conferido.error, CAMPOS_DO_ESQUEMA_DA_CONSULTA);
    expect(erros.resumo).toEqual([
      mensagemDaLinguagem([resumo.slice(0, -" na fonte.".length)]),
    ]);
    expect(erros.resumo?.[0]).toContain("não pode aparecer sozinho");
  });
});

describe("arquivo da evidência", () => {
  it("opcional na consulta e obrigatório na resolução do impedimento", () => {
    expect(erroDoArquivo(null, false)).toBeNull();
    expect(erroDoArquivo(null, true)).toBe(
      "Anexe a evidência da regularização.",
    );
  });

  it("recusa tipo fora da lista e arquivo acima de 10 MB", () => {
    expect(erroDoArquivo({ size: 10, type: "application/pdf" }, true)).toBe(
      null,
    );
    expect(erroDoArquivo({ size: 10, type: "text/plain" }, false)).toBe(
      "Use um arquivo PDF, JPEG, PNG ou WebP.",
    );
    expect(
      erroDoArquivo({ size: 10 * 1024 * 1024 + 1, type: "image/png" }, false),
    ).toBe("O arquivo precisa ter até 10 MB.");
  });
});

describe("revisão documental e resolução do impedimento", () => {
  it("a revisão exige categoria e motivo", () => {
    expect(
      lerRevisao(
        formulario({ ofertaId: OFERTA, categoria: "", motivo: " " }),
        "Informe o motivo da abertura.",
      ),
    ).toEqual({
      ok: false,
      campos: {
        categoria: ["Escolha a categoria."],
        motivo: ["Informe o motivo da abertura."],
      },
      valores: { categoria: "", motivo: " " },
    });
    expect(
      lerRevisao(
        formulario({
          ofertaId: OFERTA,
          categoria: "lien",
          motivo: "Divergência.",
        }),
        "Informe o motivo.",
      ),
    ).toEqual({
      ok: true,
      entrada: { ofertaId: OFERTA, categoria: "lien", motivo: "Divergência." },
    });
  });

  it("a resolução exige o impedimento e o motivo", () => {
    expect(lerResolucao(formulario({ motivo: "" })).ok).toBe(false);
    expect(
      lerResolucao(
        formulario({ impedimentoId: IMPEDIMENTO, motivo: "Regularizado." }),
      ),
    ).toEqual({
      ok: true,
      entrada: { impedimentoId: IMPEDIMENTO, motivo: "Regularizado." },
    });
  });
});
