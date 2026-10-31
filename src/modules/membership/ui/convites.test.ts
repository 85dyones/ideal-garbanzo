import { describe, expect, it } from "vitest";
import type { ConviteDeFornecedora } from "../queries/convites";
import {
  conviteParaEmpresaNova,
  convitesDoEmail,
  empresaDoConvite,
  opcoesDeCompradora,
} from "./convites";

const EMPRESA = "c0000000-0000-4000-8000-000000000001";

function convite(
  parcial: Partial<ConviteDeFornecedora> & { readonly id: string },
): ConviteDeFornecedora {
  return {
    email: "pessoa@revenda.teste",
    empresaId: null,
    nomeDaEmpresa: null,
    situacao: "pendente",
    convidadoEm: "2026-10-30T12:00:00Z",
    venceEm: "2026-11-13T12:00:00Z",
    usadoEm: null,
    revogadoEm: null,
    ...parcial,
  };
}

describe("convites do próprio e-mail", () => {
  const lista = [
    convite({ id: "a" }),
    convite({ id: "b", email: "outra@revenda.teste" }),
    convite({ id: "c", empresaId: EMPRESA, nomeDaEmpresa: "Pátio Sul" }),
  ];

  it("mostra só os do e-mail, sem diferença de caixa ou espaço", () => {
    expect(
      convitesDoEmail(lista, " Pessoa@Revenda.Teste ").map((c) => c.id),
    ).toEqual(["a", "c"]);
  });

  it("sem e-mail, nenhum convite (a equipe lê todos pela RLS)", () => {
    expect(convitesDoEmail(lista, null)).toEqual([]);
    expect(convitesDoEmail(lista, "  ")).toEqual([]);
  });
});

describe("convite para empresa nova", () => {
  it("só o pendente sem empresa, o mais antigo primeiro", () => {
    const lista = [
      convite({ id: "compradora", empresaId: EMPRESA }),
      convite({ id: "novo", convidadoEm: "2026-10-31T12:00:00Z" }),
      convite({ id: "antigo", convidadoEm: "2026-10-29T12:00:00Z" }),
    ];
    expect(conviteParaEmpresaNova(lista)?.id).toBe("antigo");
  });

  it("vencido, usado, revogado e convite de compradora não liberam o pedido", () => {
    expect(
      conviteParaEmpresaNova([
        convite({ id: "v", situacao: "vencido" }),
        convite({ id: "u", situacao: "usado" }),
        convite({ id: "r", situacao: "revogado" }),
        convite({ id: "c", empresaId: EMPRESA }),
      ]),
    ).toBeUndefined();
    expect(conviteParaEmpresaNova([])).toBeUndefined();
  });
});

describe("empresa do convite", () => {
  it("sem empresa é 'Empresa nova'; com empresa, o nome", () => {
    expect(empresaDoConvite({ empresaId: null, nomeDaEmpresa: null })).toBe(
      "Empresa nova",
    );
    expect(
      empresaDoConvite({ empresaId: EMPRESA, nomeDaEmpresa: "Pátio Sul" }),
    ).toBe("Pátio Sul");
    expect(empresaDoConvite({ empresaId: EMPRESA, nomeDaEmpresa: null })).toBe(
      "Empresa sem nome disponível",
    );
  });
});

describe("opções de compradora", () => {
  it("só compradora ativa, por nome, com o CNPJ", () => {
    const empresas = [
      {
        id: "1",
        nome: "Zeta Veículos",
        cnpj: "11",
        tipo: "buyer",
        status: "active",
      },
      {
        id: "2",
        nome: "Pátio Alfa",
        cnpj: "22",
        tipo: "buyer",
        status: "active",
      },
      {
        id: "3",
        nome: "Beta Fornece",
        cnpj: "33",
        tipo: "supplier",
        status: "active",
      },
      {
        id: "4",
        nome: "Gama Ambas",
        cnpj: "44",
        tipo: "both",
        status: "active",
      },
      {
        id: "5",
        nome: "Delta Suspensa",
        cnpj: "55",
        tipo: "buyer",
        status: "suspended",
      },
    ] as const;
    expect(opcoesDeCompradora(empresas)).toEqual([
      ["2", "Pátio Alfa · CNPJ 22"],
      ["1", "Zeta Veículos · CNPJ 11"],
    ]);
  });
});
