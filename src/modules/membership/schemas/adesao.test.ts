import { describe, expect, it } from "vitest";
import {
  esquemaDaConferencia,
  esquemaDaDecisao,
  esquemaDaEvidencia,
  esquemaDoPedido,
} from "./adesao";

const PEDIDO = "d0000000-0000-4000-8000-000000000001";
const EVIDENCIA = "e0000000-0000-4000-8000-000000000001";

const pedidoValido = {
  nomeDaEmpresa: "Revenda Teste",
  razaoSocial: "Revenda Teste Ltda",
  cnpj: "12.ABC.345/01DE-35",
  emailDeContato: "Contato@Revenda.Teste",
  tipo: "supplier",
};

describe("pedido de adesão", () => {
  it("D02: normaliza CNPJ e e-mail do pedido válido", () => {
    const lido = esquemaDoPedido.parse(pedidoValido);
    expect(lido.cnpj).toBe("12ABC34501DE35");
    expect(lido.emailDeContato).toBe("contato@revenda.teste");
  });

  it("D03/CT4.4: recusa status, revisão, papel ou requerente no payload", () => {
    for (const extra of [
      { status: "approved" },
      { reviewed_by: EVIDENCIA },
      { role: "admin" },
      { applicant_profile_id: EVIDENCIA },
      { organization_id: EVIDENCIA },
    ]) {
      expect(
        esquemaDoPedido.safeParse({ ...pedidoValido, ...extra }).success,
      ).toBe(false);
    }
  });

  it("D04: recusa CNPJ inválido e tipo fora do domínio", () => {
    expect(
      esquemaDoPedido.safeParse({ ...pedidoValido, cnpj: "12ABC34501DE36" })
        .success,
    ).toBe(false);
    expect(
      esquemaDoPedido.safeParse({ ...pedidoValido, tipo: "admin" }).success,
    ).toBe(false);
  });
});

describe("decisão", () => {
  it("D12: aprovação exige conferência, fonte e evidência", () => {
    const aprovacao = {
      pedidoId: PEDIDO,
      decisao: "aprovar",
      cnpjConferidoEm: new Date(Date.now() - 60_000).toISOString(),
      fonteDaConferencia: "Comprovante de inscrição no site da Receita",
      evidenciaId: EVIDENCIA,
    };
    expect(esquemaDaDecisao.safeParse(aprovacao).success).toBe(true);
    for (const campo of [
      "cnpjConferidoEm",
      "fonteDaConferencia",
      "evidenciaId",
    ]) {
      const semCampo = Object.fromEntries(
        Object.entries(aprovacao).filter(([chave]) => chave !== campo),
      );
      expect(esquemaDaDecisao.safeParse(semCampo).success).toBe(false);
    }
  });

  it("recusa conferência no futuro e revisor no payload", () => {
    const base = {
      pedidoId: PEDIDO,
      decisao: "aprovar",
      fonteDaConferencia: "Receita",
      evidenciaId: EVIDENCIA,
    };
    expect(
      esquemaDaDecisao.safeParse({
        ...base,
        cnpjConferidoEm: new Date(Date.now() + 3_600_000).toISOString(),
      }).success,
    ).toBe(false);
    expect(
      esquemaDaDecisao.safeParse({
        ...base,
        cnpjConferidoEm: new Date().toISOString(),
        reviewed_by: EVIDENCIA,
      }).success,
    ).toBe(false);
  });

  it("D15: rejeição exige motivo", () => {
    expect(
      esquemaDaDecisao.safeParse({ pedidoId: PEDIDO, decisao: "rejeitar" })
        .success,
    ).toBe(false);
    expect(
      esquemaDaDecisao.safeParse({
        pedidoId: PEDIDO,
        decisao: "rejeitar",
        motivo: "CNPJ já cadastrado; pedir convite ao administrador da empresa",
      }).success,
    ).toBe(true);
  });
});

describe("conferência e evidência", () => {
  it("D13: lista livre, sem item obrigatório", () => {
    expect(
      esquemaDaConferencia.safeParse({ pedidoId: PEDIDO, itens: [] }).success,
    ).toBe(true);
    expect(
      esquemaDaConferencia.safeParse({
        pedidoId: PEDIDO,
        itens: [{ item: "Situação cadastral", resultado: "ativa" }],
      }).success,
    ).toBe(true);
  });

  it("recusa arquivo vazio, acima de 10 MB ou de tipo fora da lista", () => {
    const base = { pedidoId: PEDIDO, tipoDoArquivo: "application/pdf" };
    expect(
      esquemaDaEvidencia.safeParse({ ...base, conteudo: new Uint8Array(0) })
        .success,
    ).toBe(false);
    expect(
      esquemaDaEvidencia.safeParse({
        ...base,
        conteudo: new Uint8Array(10 * 1024 * 1024 + 1),
      }).success,
    ).toBe(false);
    expect(
      esquemaDaEvidencia.safeParse({
        ...base,
        tipoDoArquivo: "text/html",
        conteudo: new Uint8Array(10),
      }).success,
    ).toBe(false);
  });
});
