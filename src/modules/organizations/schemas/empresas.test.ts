import { describe, expect, it } from "vitest";
import {
  esquemaDaGestaoDoMembro,
  esquemaDaResposta,
  esquemaDoConvite,
  esquemaDoStatusDaEmpresa,
  esquemaDosDadosDaEmpresa,
} from "./empresas";

const EMPRESA = "a0000000-0000-4000-8000-000000000001";
const VINCULO = "f0000000-0000-4000-8000-000000000001";

describe("esquemas de empresa e membros", () => {
  it("D26: convite com e-mail normalizado e papel do domínio", () => {
    const lido = esquemaDoConvite.parse({
      empresaId: EMPRESA,
      email: " Fulano@Empresa.Teste ",
      papel: "member",
    });
    expect(lido.email).toBe("fulano@empresa.teste");
    expect(
      esquemaDoConvite.safeParse({
        empresaId: EMPRESA,
        email: "x@y.teste",
        papel: "admin",
      }).success,
    ).toBe(false);
  });

  it("CT4.4/CT4.10: convite e aceite não levam status nem papel a mais", () => {
    expect(
      esquemaDoConvite.safeParse({
        empresaId: EMPRESA,
        email: "x@y.teste",
        papel: "member",
        status: "active",
      }).success,
    ).toBe(false);
    expect(
      esquemaDaResposta.safeParse({
        empresaId: EMPRESA,
        aceitar: true,
        role: "org_admin",
      }).success,
    ).toBe(false);
  });

  it("D40/D40b: status da empresa exige motivo", () => {
    expect(
      esquemaDoStatusDaEmpresa.safeParse({
        empresaId: EMPRESA,
        acao: "suspender",
      }).success,
    ).toBe(false);
    expect(
      esquemaDoStatusDaEmpresa.safeParse({
        empresaId: EMPRESA,
        acao: "suspender",
        motivo: "   ",
      }).success,
    ).toBe(false);
  });

  it("D38b: org_admin altera só nome e contatos", () => {
    expect(
      esquemaDosDadosDaEmpresa.safeParse({ empresaId: EMPRESA, nome: "Novo" })
        .success,
    ).toBe(true);
    for (const extra of [
      { cnpj: "11222333000181" },
      { kind: "buyer" },
      { status: "active" },
      { is_test: true },
      { legal_name: "Outra" },
    ]) {
      expect(
        esquemaDosDadosDaEmpresa.safeParse({
          empresaId: EMPRESA,
          nome: "Novo",
          ...extra,
        }).success,
      ).toBe(false);
    }
    expect(
      esquemaDosDadosDaEmpresa.safeParse({ empresaId: EMPRESA }).success,
    ).toBe(false);
  });

  it("gestão do membro só com as ações previstas", () => {
    expect(
      esquemaDaGestaoDoMembro.safeParse({
        empresaId: EMPRESA,
        vinculoId: VINCULO,
        acao: "ativar_convite",
      }).success,
    ).toBe(false);
  });
});
