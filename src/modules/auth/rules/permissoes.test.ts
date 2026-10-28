import { describe, expect, it } from "vitest";
import type { ContextoDoUsuario } from "../tipos";
import type { VinculoDoUsuario } from "@/modules/organizations/tipos";
import {
  ehAdministrador,
  ehDaEquipeDaPlataforma,
  podeGerirEmpresa,
  podeVerCatalogo,
} from "./permissoes";

const A = "a0000000-0000-4000-8000-000000000001";
const B = "b0000000-0000-4000-8000-000000000001";

function vinculo(
  organizationId: string,
  dados: Partial<Omit<VinculoDoUsuario, "empresa">> & {
    empresa?: VinculoDoUsuario["empresa"];
  } = {},
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
    perfilId: "c0000000-0000-4000-8000-000000000001",
    emailConfirmado: true,
    papelNaPlataforma: null,
    podeLerAuditoria: false,
    vinculos: [],
    ...dados,
  };
}

describe("papéis na plataforma", () => {
  it("administrador e operador", () => {
    expect(ehAdministrador(contexto({ papelNaPlataforma: "admin" }))).toBe(
      true,
    );
    expect(ehAdministrador(contexto({ papelNaPlataforma: "operator" }))).toBe(
      false,
    );
    expect(
      ehDaEquipeDaPlataforma(contexto({ papelNaPlataforma: "operator" })),
    ).toBe(true);
    expect(ehDaEquipeDaPlataforma(contexto())).toBe(false);
  });
});

describe("gestão da empresa (A.4)", () => {
  it("D26c: org_admin ativo da empresa ativa gere a própria empresa", () => {
    const org = contexto({ vinculos: [vinculo(A, { papel: "org_admin" })] });
    expect(podeGerirEmpresa(org, A)).toBe(true);
  });

  it("D27: org_admin de A não gere B", () => {
    const org = contexto({ vinculos: [vinculo(A, { papel: "org_admin" })] });
    expect(podeGerirEmpresa(org, B)).toBe(false);
  });

  it("D28: member não gere", () => {
    expect(podeGerirEmpresa(contexto({ vinculos: [vinculo(A)] }), A)).toBe(
      false,
    );
  });

  it("D32: org_admin de empresa suspensa ou encerrada não gere", () => {
    for (const status of ["suspended", "closed"] as const) {
      const org = contexto({
        vinculos: [
          vinculo(A, {
            papel: "org_admin",
            empresa: { status, kind: "supplier" },
          }),
        ],
      });
      expect(podeGerirEmpresa(org, A)).toBe(false);
    }
  });

  it("D29/CT5.6: org_admin com vínculo suspenso, removido ou pendente não gere", () => {
    for (const status of ["suspended", "removed", "pending"] as const) {
      const org = contexto({
        vinculos: [vinculo(A, { papel: "org_admin", status })],
      });
      expect(podeGerirEmpresa(org, A)).toBe(false);
    }
  });

  it("D30: administrador gere qualquer empresa; D31: operador, nenhuma", () => {
    expect(podeGerirEmpresa(contexto({ papelNaPlataforma: "admin" }), B)).toBe(
      true,
    );
    expect(
      podeGerirEmpresa(contexto({ papelNaPlataforma: "operator" }), B),
    ).toBe(false);
  });
});

describe("catálogo (A.7)", () => {
  it("D48: membro ativo de empresa compradora ativa vê", () => {
    for (const kind of ["buyer", "both"] as const) {
      const membro = contexto({
        vinculos: [vinculo(A, { empresa: { status: "active", kind } })],
      });
      expect(podeVerCatalogo(membro)).toBe(true);
    }
  });

  it("D47/D49/CT1.3: sem vínculo, só fornecedor, empresa ou vínculo inativo não vê", () => {
    expect(podeVerCatalogo(contexto())).toBe(false);
    expect(podeVerCatalogo(contexto({ vinculos: [vinculo(A)] }))).toBe(false);
    expect(
      podeVerCatalogo(
        contexto({
          vinculos: [
            vinculo(A, { empresa: { status: "suspended", kind: "buyer" } }),
          ],
        }),
      ),
    ).toBe(false);
    for (const status of ["pending", "suspended", "removed"] as const) {
      expect(
        podeVerCatalogo(
          contexto({
            vinculos: [
              vinculo(A, {
                status,
                empresa: { status: "active", kind: "buyer" },
              }),
            ],
          }),
        ),
      ).toBe(false);
    }
  });
});
