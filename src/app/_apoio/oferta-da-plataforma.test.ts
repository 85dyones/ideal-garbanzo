import { describe, expect, it } from "vitest";
import {
  MENSAGEM_DA_CATEGORIA,
  lerMotivoObrigatorio,
  lerSuspensao,
} from "./oferta-da-plataforma";

const OFERTA = "c0000000-0000-4000-8000-000000000001";

function formulario(campos: Readonly<Record<string, string>>): FormData {
  const dados = new FormData();
  for (const [nome, valor] of Object.entries(campos)) dados.set(nome, valor);
  return dados;
}

describe("motivo obrigatório (devolução, reativação, retirada)", () => {
  it("motivo em branco vira erro no campo, com o texto devolvido", () => {
    for (const motivo of ["", "   ", "\n"]) {
      const lido = lerMotivoObrigatorio(
        formulario({ ofertaId: OFERTA, motivo }),
        "Informe o motivo da devolução.",
      );
      expect(lido).toEqual({
        ok: false,
        campos: { motivo: ["Informe o motivo da devolução."] },
        valores: { motivo },
      });
    }
  });

  it("sem o campo, também é erro", () => {
    const lido = lerMotivoObrigatorio(
      formulario({ ofertaId: OFERTA }),
      "Informe o motivo.",
    );
    expect(lido.ok).toBe(false);
  });

  it("com motivo, passa a oferta e o motivo como vieram; o formato fica com a operação", () => {
    expect(
      lerMotivoObrigatorio(
        formulario({ ofertaId: OFERTA, motivo: " Fotos com placa. " }),
        "Informe o motivo.",
      ),
    ).toEqual({
      ok: true,
      entrada: { ofertaId: OFERTA, motivo: " Fotos com placa. " },
    });
  });
});

describe("suspensão (§6.10)", () => {
  it("sem categoria e sem motivo, os dois campos dão erro", () => {
    const lido = lerSuspensao(formulario({ ofertaId: OFERTA }));
    expect(lido).toEqual({
      ok: false,
      campos: {
        categoria: [MENSAGEM_DA_CATEGORIA],
        motivo: ["Informe o motivo da suspensão."],
      },
      valores: { categoria: "", motivo: "" },
    });
  });

  it("com categoria e sem motivo, não suspende e mantém a categoria escolhida", () => {
    const lido = lerSuspensao(
      formulario({ ofertaId: OFERTA, categoria: "forgery", motivo: " " }),
    );
    expect(lido).toEqual({
      ok: false,
      campos: { motivo: ["Informe o motivo da suspensão."] },
      valores: { categoria: "forgery", motivo: " " },
    });
  });

  it("categoria fora das quatro da §6.10 é recusada, inclusive pendência documental", () => {
    for (const categoria of ["pending_documents", "FORGERY", "outra"]) {
      const lido = lerSuspensao(
        formulario({ ofertaId: OFERTA, categoria, motivo: "Motivo." }),
      );
      expect(lido.ok, categoria).toBe(false);
      if (!lido.ok) {
        expect(lido.campos).toEqual({ categoria: [MENSAGEM_DA_CATEGORIA] });
      }
    }
  });

  it("com categoria e motivo, monta a entrada da operação", () => {
    expect(
      lerSuspensao(
        formulario({
          ofertaId: OFERTA,
          categoria: "fraud_indication",
          motivo: "Documento com sinais de adulteração.",
        }),
      ),
    ).toEqual({
      ok: true,
      entrada: {
        ofertaId: OFERTA,
        categoria: "fraud_indication",
        motivo: "Documento com sinais de adulteração.",
      },
    });
  });
});
