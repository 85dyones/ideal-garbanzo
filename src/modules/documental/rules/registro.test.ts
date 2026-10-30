import { describe, expect, it } from "vitest";
import {
  ATORES_DA_OFERTA,
  STATUS_DA_OFERTA,
} from "@/modules/offers/rules/transicoes";
import { estadoDaCategoria, origemDaConsulta } from "./estados";
import {
  podeRegistrarConsulta,
  podeResolverImpedimento,
  podeRevisarDocumentacao,
} from "./registro";

describe("quem registra consulta (ADR-0004 §2.9)", () => {
  it("o fornecedor segue a tabela de edição; a equipe, os estados da E17; os demais, nunca", () => {
    expect(podeRegistrarConsulta("draft", "membro", false)).toBe(true);
    expect(podeRegistrarConsulta("published", "membro", false)).toBe(false);
    expect(podeRegistrarConsulta("published", "adm_empresa", false)).toBe(true);
    expect(podeRegistrarConsulta("published", "adm_empresa", true)).toBe(false);
    expect(
      STATUS_DA_OFERTA.filter((status) =>
        podeRegistrarConsulta(status, "operador", false),
      ),
    ).toEqual(["draft", "under_review", "published", "reserved", "suspended"]);
    expect(podeRegistrarConsulta("published", "operador", true)).toBe(false);
    for (const status of STATUS_DA_OFERTA) {
      expect(podeRegistrarConsulta(status, "nenhum", false)).toBe(false);
      expect(podeRegistrarConsulta(status, "sistema", false)).toBe(false);
    }
  });

  it("só a equipe revisa (E19), e só o administrador resolve impedimento (E21)", () => {
    expect(podeRevisarDocumentacao("published", "operador", false)).toBe(true);
    expect(podeRevisarDocumentacao("published", "adm_empresa", false)).toBe(
      false,
    );
    expect(podeRevisarDocumentacao("withdrawn", "administrador", false)).toBe(
      false,
    );
    expect(
      ATORES_DA_OFERTA.filter((ator) => podeResolverImpedimento(ator)),
    ).toEqual(["administrador"]);
  });
});

describe("estado e origem (ADR-0004 §2.1, §2.4 e §2.7)", () => {
  it("divergência só pelo valor: sem ocorrência conhecida × com ocorrência; a P1 não diverge", () => {
    expect(
      estadoDaCategoria({
        declaracao: "no_known_occurrence",
        consultasVigentes: ["has_occurrence"],
        revisaoAberta: false,
      }),
    ).toBe("under_review");
    expect(
      estadoDaCategoria({
        declaracao: "has_occurrence",
        consultasVigentes: ["no_occurrence_in_source"],
        revisaoAberta: false,
      }),
    ).toBe("with_findings");
    expect(
      estadoDaCategoria({
        declaracao: "unknown",
        consultasVigentes: ["no_occurrence_in_source"],
        revisaoAberta: true,
      }),
    ).toBe("under_review");
    expect(
      estadoDaCategoria({
        declaracao: null,
        consultasVigentes: [],
        revisaoAberta: false,
      }),
    ).toBe("not_checked");
  });

  it("a origem 4 exige fonte oficial, evidência, resultado conclusivo e registro pela plataforma", () => {
    const base = {
      tipoDeFonte: "official",
      resultado: "no_occurrence_in_source",
      temEvidencia: true,
      registradaPelaPlataforma: true,
    } as const;
    expect(origemDaConsulta(base)).toBe("independent_evidence");
    expect(origemDaConsulta({ ...base, tipoDeFonte: "commercial" })).toBe(
      "check_result",
    );
    expect(origemDaConsulta({ ...base, temEvidencia: false })).toBe(
      "check_result",
    );
    expect(origemDaConsulta({ ...base, resultado: "awaiting_result" })).toBe(
      "check_result",
    );
    expect(origemDaConsulta({ ...base, registradaPelaPlataforma: false })).toBe(
      "check_result",
    );
  });
});
