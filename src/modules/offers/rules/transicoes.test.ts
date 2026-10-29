import { describe, expect, it } from "vitest";
import type { ContextoDoUsuario } from "@/modules/auth/tipos";
import type { VinculoDoUsuario } from "@/modules/organizations/tipos";
import { podeConfirmarDisponibilidade, podeEditarConteudo } from "./edicao";
import {
  STATUS_DA_OFERTA,
  TRANSICOES,
  atorDaOferta,
  motivoObrigatorio,
  transicaoDaOferta,
} from "./transicoes";

const F = "a0000000-0000-4000-8000-000000000001";
const G = "b0000000-0000-4000-8000-000000000001";
const COM_REVISAO = { revisaoExigida: true, validadeVencida: false };
const SEM_REVISAO = { revisaoExigida: false, validadeVencida: false };

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

describe("tabela de transições (ADR-0003 §2.3)", () => {
  it("X17: nenhuma transição leva a sold, e nenhuma sai de sold", () => {
    expect(TRANSICOES.some((t) => t.para === "sold")).toBe(false);
    expect(TRANSICOES.some((t) => t.de.includes("sold"))).toBe(false);
  });

  it("X04: só o sistema leva a expired, e só com a validade vencida", () => {
    const paraExpirada = TRANSICOES.filter((t) => t.para === "expired");
    expect(paraExpirada.map((t) => t.quem)).toEqual([["sistema"]]);
    expect(
      transicaoDaOferta("published", "expired", "sistema", COM_REVISAO),
    ).toBeUndefined();
    expect(
      transicaoDaOferta("published", "expired", "sistema", {
        revisaoExigida: true,
        validadeVencida: true,
      })?.id,
    ).toBe("T12");
  });

  it("D10: com revisão, o org_admin envia; sem revisão, publica direto (X10, X11)", () => {
    expect(
      transicaoDaOferta("draft", "under_review", "adm_empresa", COM_REVISAO)
        ?.id,
    ).toBe("T03");
    expect(
      transicaoDaOferta("draft", "published", "adm_empresa", COM_REVISAO),
    ).toBeUndefined();
    expect(
      transicaoDaOferta("draft", "published", "adm_empresa", SEM_REVISAO)?.id,
    ).toBe("T06");
    expect(
      transicaoDaOferta("draft", "under_review", "adm_empresa", SEM_REVISAO),
    ).toBeUndefined();
  });

  it("Q2: o member prepara, mas não envia, publica, reserva, retira nem reabre", () => {
    for (const de of STATUS_DA_OFERTA) {
      for (const para of STATUS_DA_OFERTA) {
        const transicao = transicaoDaOferta(de, para, "membro", COM_REVISAO);
        if (transicao !== undefined) expect(transicao.id).toBe("T18");
      }
    }
  });

  it("X01: o fornecedor nunca suspende; só o administrador reativa", () => {
    for (const ator of ["membro", "adm_empresa"] as const) {
      expect(
        transicaoDaOferta("published", "suspended", ator, COM_REVISAO),
      ).toBeUndefined();
    }
    expect(
      transicaoDaOferta("suspended", "draft", "operador", COM_REVISAO),
    ).toBeUndefined();
    expect(
      transicaoDaOferta("suspended", "draft", "administrador", COM_REVISAO)?.id,
    ).toBe("T15");
  });

  it("devolução, retirada pela plataforma, suspensão e reativação exigem motivo", () => {
    const comMotivo = TRANSICOES.flatMap((t) =>
      t.quem
        .filter((ator) => motivoObrigatorio(t, ator))
        .map((ator) => `${t.id}:${ator}`),
    );
    expect(comMotivo.sort()).toEqual([
      "T05:administrador",
      "T05:operador",
      "T11:administrador",
      "T11:operador",
      "T14:administrador",
      "T14:operador",
      "T15:administrador",
    ]);
  });
});

describe("ator da oferta", () => {
  it("vínculo ativo com a empresa ativa: membro ou adm_empresa", () => {
    expect(atorDaOferta(contexto({ vinculos: [vinculo(F)] }), F)).toBe(
      "membro",
    );
    expect(
      atorDaOferta(
        contexto({ vinculos: [vinculo(F, { papel: "org_admin" })] }),
        F,
      ),
    ).toBe("adm_empresa");
  });

  it("empresa suspensa ou vínculo de outra empresa: nenhum", () => {
    expect(
      atorDaOferta(
        contexto({
          vinculos: [
            vinculo(F, { empresa: { status: "suspended", kind: "supplier" } }),
          ],
        }),
        F,
      ),
    ).toBe("nenhum");
    expect(atorDaOferta(contexto({ vinculos: [vinculo(G)] }), F)).toBe(
      "nenhum",
    );
  });

  it("staff sem vínculo com a empresa dona age como plataforma", () => {
    expect(atorDaOferta(contexto({ papelNaPlataforma: "operator" }), F)).toBe(
      "operador",
    );
    expect(atorDaOferta(contexto({ papelNaPlataforma: "admin" }), F)).toBe(
      "administrador",
    );
    expect(
      atorDaOferta(
        contexto({
          papelNaPlataforma: "admin",
          vinculos: [vinculo(F, { status: "removed" })],
        }),
        F,
      ),
    ).toBe("administrador");
  });

  it("B25: staff com vínculo ativo age como fornecedor; com vínculo pendente ou suspenso, não age", () => {
    expect(
      atorDaOferta(
        contexto({ papelNaPlataforma: "admin", vinculos: [vinculo(F)] }),
        F,
      ),
    ).toBe("membro");
    for (const status of ["pending", "suspended"] as const) {
      expect(
        atorDaOferta(
          contexto({
            papelNaPlataforma: "operator",
            vinculos: [vinculo(F, { status })],
          }),
          F,
        ),
      ).toBe("nenhum");
    }
  });
});

describe("edição por estado (ADR-0003 §2.5)", () => {
  it("F no rascunho; só o org_admin na publicada ou reservada; staff nunca", () => {
    expect(podeEditarConteudo("draft", "membro")).toBe(true);
    expect(podeEditarConteudo("published", "membro")).toBe(false);
    expect(podeEditarConteudo("reserved", "adm_empresa")).toBe(true);
    for (const status of STATUS_DA_OFERTA) {
      expect(podeEditarConteudo(status, "operador")).toBe(false);
      expect(podeEditarConteudo(status, "administrador")).toBe(false);
    }
    for (const status of [
      "under_review",
      "sold",
      "withdrawn",
      "expired",
      "suspended",
    ] as const) {
      expect(podeEditarConteudo(status, "adm_empresa")).toBe(false);
    }
  });

  it("disponibilidade: qualquer F, na publicada ou reservada", () => {
    expect(podeConfirmarDisponibilidade("published", "membro")).toBe(true);
    expect(podeConfirmarDisponibilidade("reserved", "adm_empresa")).toBe(true);
    expect(podeConfirmarDisponibilidade("draft", "adm_empresa")).toBe(false);
    expect(podeConfirmarDisponibilidade("published", "operador")).toBe(false);
  });
});
