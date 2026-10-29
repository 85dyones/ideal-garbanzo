import { describe, expect, it } from "vitest";
import { varrerTexto } from "@/lib/linguagem-proibida";
import type { ContextoDoUsuario } from "@/modules/auth/tipos";
import type { VinculoDoUsuario } from "@/modules/organizations/tipos";
import {
  CATEGORIAS_DA_SUSPENSAO,
  ROTULO_DA_CATEGORIA_DA_SUSPENSAO,
} from "../rules/oferta";
import {
  STATUS_DA_OFERTA,
  TRANSICOES,
  type StatusDaOferta,
} from "../rules/transicoes";
import {
  MENSAGEM_DO_RESULTADO,
  OPCOES_DA_CATEGORIA_DA_SUSPENSAO,
  RESULTADOS_DA_PLATAFORMA,
  STATUS_DO_FILTRO_DA_PLATAFORMA,
  TEXTO_DA_PLATAFORMA,
  dataRelevante,
  ehResultadoDaPlataforma,
  ehStatusDoFiltroDaPlataforma,
  situacaoDaPlataforma,
  type AcoesDaPlataforma,
  type DatasDaLinha,
} from "./plataforma";

const EMPRESA = "a0000000-0000-4000-8000-000000000001";
const OUTRA = "b0000000-0000-4000-8000-000000000001";
const CONDICOES = { revisaoExigida: true, validadeVencida: false };

function vinculo(
  organizationId: string,
  dados: Partial<VinculoDoUsuario> = {},
): VinculoDoUsuario {
  return {
    vinculoId: `${organizationId}-v`,
    organizationId,
    papel: "member",
    status: "active",
    empresa: { status: "active", kind: "supplier" },
    ...dados,
  };
}

function contexto(dados: Partial<ContextoDoUsuario> = {}): ContextoDoUsuario {
  return {
    perfilId: "p",
    emailConfirmado: true,
    papelNaPlataforma: null,
    podeLerAuditoria: false,
    vinculos: [],
    ...dados,
  };
}

const OPERADOR = contexto({ papelNaPlataforma: "operator" });
const ADMINISTRADOR = contexto({ papelNaPlataforma: "admin" });

function acoes(
  quem: ContextoDoUsuario,
  status: StatusDaOferta,
): AcoesDaPlataforma {
  return situacaoDaPlataforma(quem, EMPRESA, status, CONDICOES).acoes;
}

/** As ações ligadas, em ordem, para comparar com a tabela. */
function ligadas(lista: AcoesDaPlataforma): string[] {
  return Object.entries(lista)
    .filter(([, ligada]) => ligada)
    .map(([nome]) => nome);
}

describe("ações da plataforma por ator e estado (ADR-0003 §2.3)", () => {
  it("operador: revisa a oferta em revisão, suspende e retira; não reativa", () => {
    expect(ligadas(acoes(OPERADOR, "under_review"))).toEqual([
      "revisar",
      "suspender",
      "retirar",
    ]);
    expect(ligadas(acoes(OPERADOR, "draft"))).toEqual(["suspender", "retirar"]);
    expect(ligadas(acoes(OPERADOR, "published"))).toEqual([
      "suspender",
      "retirar",
      "reservar",
    ]);
    expect(ligadas(acoes(OPERADOR, "reserved"))).toEqual([
      "suspender",
      "retirar",
      "liberar",
    ]);
    expect(ligadas(acoes(OPERADOR, "expired"))).toEqual([
      "suspender",
      "retirar",
    ]);
    expect(ligadas(acoes(OPERADOR, "withdrawn"))).toEqual(["suspender"]);
    expect(ligadas(acoes(OPERADOR, "suspended"))).toEqual([]);
    expect(ligadas(acoes(OPERADOR, "sold"))).toEqual([]);
  });

  it("administrador: as mesmas do operador, mais a reativação da suspensa", () => {
    for (const status of STATUS_DA_OFERTA) {
      const doAdministrador = acoes(ADMINISTRADOR, status);
      const doOperador = acoes(OPERADOR, status);
      expect({ ...doAdministrador, reativar: false }, status).toEqual(
        doOperador,
      );
    }
    expect(ligadas(acoes(ADMINISTRADOR, "suspended"))).toEqual(["reativar"]);
  });

  it("o operador vê que a reativação fica com o administrador", () => {
    const naSuspensa = situacaoDaPlataforma(
      OPERADOR,
      EMPRESA,
      "suspended",
      CONDICOES,
    );
    expect(naSuspensa.reativacaoComAdministrador).toBe(true);
    expect(
      situacaoDaPlataforma(ADMINISTRADOR, EMPRESA, "suspended", CONDICOES)
        .reativacaoComAdministrador,
    ).toBe(false);
    expect(
      situacaoDaPlataforma(OPERADOR, EMPRESA, "published", CONDICOES)
        .reativacaoComAdministrador,
    ).toBe(false);
  });

  it("nunca suspende a oferta vendida nem a já suspensa (T14)", () => {
    for (const quem of [OPERADOR, ADMINISTRADOR]) {
      expect(acoes(quem, "sold").suspender).toBe(false);
      expect(acoes(quem, "suspended").suspender).toBe(false);
    }
  });

  it("a tela segue a tabela de transições, com os dois valores da D10", () => {
    const porAcao: Readonly<
      Record<keyof AcoesDaPlataforma, readonly string[]>
    > = {
      revisar: ["T04", "T05"],
      suspender: ["T14"],
      reativar: ["T15"],
      retirar: ["T11"],
      reservar: ["T08"],
      liberar: ["T09"],
    };
    for (const revisaoExigida of [true, false]) {
      for (const quem of [OPERADOR, ADMINISTRADOR]) {
        const ator = quem === OPERADOR ? "operador" : "administrador";
        for (const status of STATUS_DA_OFERTA) {
          const lista = situacaoDaPlataforma(quem, EMPRESA, status, {
            revisaoExigida,
            validadeVencida: false,
          }).acoes;
          for (const [acao, ids] of Object.entries(porAcao)) {
            const pelaTabela = ids.every((id) =>
              TRANSICOES.some(
                (transicao) =>
                  transicao.id === id &&
                  transicao.de.includes(status) &&
                  transicao.quem.includes(ator),
              ),
            );
            expect(
              lista[acao as keyof AcoesDaPlataforma],
              `${ator} ${status} ${acao}`,
            ).toBe(pelaTabela);
          }
        }
      }
    }
  });
});

describe("conflito de interesse (B25)", () => {
  it("staff com vínculo ativo na empresa dona não vê ações de plataforma", () => {
    for (const papel of ["admin", "operator"] as const) {
      for (const papelNaEmpresa of ["member", "org_admin"] as const) {
        const quem = contexto({
          papelNaPlataforma: papel,
          vinculos: [vinculo(EMPRESA, { papel: papelNaEmpresa })],
        });
        for (const status of STATUS_DA_OFERTA) {
          const situacao = situacaoDaPlataforma(
            quem,
            EMPRESA,
            status,
            CONDICOES,
          );
          expect(situacao.conflito, `${papel} ${status}`).toBe(true);
          expect(ligadas(situacao.acoes), `${papel} ${status}`).toEqual([]);
          expect(situacao.reativacaoComAdministrador).toBe(false);
        }
      }
    }
  });

  it("vínculo pendente ou suspenso também conta; removido, não", () => {
    for (const status of ["pending", "suspended"] as const) {
      const quem = contexto({
        papelNaPlataforma: "operator",
        vinculos: [vinculo(EMPRESA, { status })],
      });
      const situacao = situacaoDaPlataforma(
        quem,
        EMPRESA,
        "under_review",
        CONDICOES,
      );
      expect(situacao.conflito, status).toBe(true);
      expect(situacao.acoes.revisar, status).toBe(false);
    }
    const removido = contexto({
      papelNaPlataforma: "operator",
      vinculos: [vinculo(EMPRESA, { status: "removed" })],
    });
    const situacao = situacaoDaPlataforma(
      removido,
      EMPRESA,
      "under_review",
      CONDICOES,
    );
    expect(situacao.conflito).toBe(false);
    expect(situacao.acoes.revisar).toBe(true);
  });

  it("vínculo com outra empresa não impede agir nesta", () => {
    const quem = contexto({
      papelNaPlataforma: "operator",
      vinculos: [vinculo(OUTRA, { papel: "org_admin" })],
    });
    const situacao = situacaoDaPlataforma(
      quem,
      EMPRESA,
      "under_review",
      CONDICOES,
    );
    expect(situacao.conflito).toBe(false);
    expect(situacao.acoes.revisar).toBe(true);
  });

  it("quem não é da equipe não vê ações nem o aviso de conflito", () => {
    for (const quem of [
      contexto(),
      contexto({ vinculos: [vinculo(EMPRESA, { papel: "org_admin" })] }),
    ]) {
      const situacao = situacaoDaPlataforma(
        quem,
        EMPRESA,
        "under_review",
        CONDICOES,
      );
      expect(situacao.conflito).toBe(false);
      expect(ligadas(situacao.acoes)).toEqual([]);
    }
  });
});

describe("categoria da suspensão (§6.10)", () => {
  it("as quatro categorias, sem escolha prévia e sem pendência documental", () => {
    expect(OPCOES_DA_CATEGORIA_DA_SUSPENSAO[0]).toEqual(["", "Selecione"]);
    expect(OPCOES_DA_CATEGORIA_DA_SUSPENSAO.slice(1)).toEqual([
      ["fraud_indication", "Indício de fraude"],
      ["forgery", "Falsificação"],
      ["deliberately_misleading", "Informação deliberadamente enganosa"],
      ["serious_risk", "Risco grave"],
    ]);
    expect(CATEGORIAS_DA_SUSPENSAO).toHaveLength(4);
    for (const categoria of CATEGORIAS_DA_SUSPENSAO) {
      expect(ROTULO_DA_CATEGORIA_DA_SUSPENSAO[categoria]).toBeTruthy();
    }
  });
});

describe("lista da plataforma", () => {
  it("o filtro começa pela fila de revisão e não oferece 'Vendida'", () => {
    expect(STATUS_DO_FILTRO_DA_PLATAFORMA[0]).toBe("under_review");
    expect(STATUS_DO_FILTRO_DA_PLATAFORMA).not.toContain("sold");
    expect([...STATUS_DO_FILTRO_DA_PLATAFORMA].sort()).toEqual(
      STATUS_DA_OFERTA.filter((status) => status !== "sold").sort(),
    );
  });

  it("situação fora do filtro não é aceita no parâmetro da lista", () => {
    for (const status of STATUS_DO_FILTRO_DA_PLATAFORMA) {
      expect(ehStatusDoFiltroDaPlataforma(status)).toBe(true);
    }
    for (const valor of ["sold", "", "Em revisão", undefined, 1]) {
      expect(ehStatusDoFiltroDaPlataforma(valor)).toBe(false);
    }
  });

  it("a data relevante depende da situação", () => {
    const base: DatasDaLinha = {
      status: "draft",
      publicadaEm: "2026-10-20T15:00:00Z",
      suspensaEm: "2026-10-21T15:00:00Z",
      retiradaEm: "2026-10-22T15:00:00Z",
      validaAte: "2026-11-13T02:59:59Z",
      atualizadaEm: "2026-10-23T15:00:00Z",
    };
    expect(dataRelevante({ ...base, status: "under_review" })).toBe(
      "em revisão desde 23/10/2026, 12:00",
    );
    expect(dataRelevante({ ...base, status: "published" })).toBe(
      "publicada em 20/10/2026, 12:00",
    );
    expect(dataRelevante({ ...base, status: "suspended" })).toBe(
      "suspensa em 21/10/2026, 12:00",
    );
    expect(dataRelevante({ ...base, status: "withdrawn" })).toBe(
      "retirada em 22/10/2026, 12:00",
    );
    expect(dataRelevante({ ...base, status: "expired" })).toBe(
      "venceu em 12/11/2026",
    );
    for (const status of ["draft", "reserved", "sold"] as const) {
      expect(dataRelevante({ ...base, status })).toBe(
        "atualizada em 23/10/2026, 12:00",
      );
    }
    expect(
      dataRelevante({ ...base, status: "published", publicadaEm: null }),
    ).toBe("atualizada em 23/10/2026, 12:00");
  });
});

describe("resultado das ações", () => {
  it("só os resultados conhecidos viram mensagem", () => {
    for (const resultado of RESULTADOS_DA_PLATAFORMA) {
      expect(ehResultadoDaPlataforma(resultado)).toBe(true);
      expect(MENSAGEM_DO_RESULTADO[resultado]).toBeTruthy();
    }
    for (const valor of ["", "outra", "<script>", null, undefined, 1]) {
      expect(ehResultadoDaPlataforma(valor)).toBe(false);
    }
  });
});

describe("textos da tela administrativa", () => {
  it("lembram X07 e X09", () => {
    expect(TEXTO_DA_PLATAFORMA.devolucaoNaoPorPendencia).toContain(
      "não justificam a devolução",
    );
    expect(TEXTO_DA_PLATAFORMA.suspensaoNaoPorPendencia).toBe(
      "Pendência documental, sozinha, não é motivo de suspensão.",
    );
  });

  it("nenhum texto usa linguagem proibida (§6.6)", () => {
    const textos = [
      ...Object.values(TEXTO_DA_PLATAFORMA),
      ...Object.values(MENSAGEM_DO_RESULTADO),
      ...OPCOES_DA_CATEGORIA_DA_SUSPENSAO.map(([, rotulo]) => rotulo),
    ];
    const achados = textos.flatMap((texto) =>
      varrerTexto(texto).map((ocorrencia) => `"${texto}": ${ocorrencia.termo}`),
    );
    expect(achados).toEqual([]);
  });
});
