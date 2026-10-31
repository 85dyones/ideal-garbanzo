import { describe, expect, it } from "vitest";
import { STATUS_DO_PEDIDO } from "../queries/pedidos";
import type { SituacaoDoConvite } from "../rules/convites";
import {
  ROTULO_DA_SITUACAO_DO_CONVITE,
  conviteRevogavel,
  formatarTamanho,
  pedidoAberto,
  rotuloDaSituacaoDoConvite,
  rotuloDoStatusDoPedido,
} from "./rotulos";

const SITUACOES_DO_CONVITE: readonly SituacaoDoConvite[] = [
  "pendente",
  "vencido",
  "usado",
  "revogado",
];

describe("rótulos do pedido de adesão", () => {
  it("todo status tem rótulo, e o final positivo é 'Aceito'", () => {
    for (const status of STATUS_DO_PEDIDO) {
      expect(rotuloDoStatusDoPedido(status)).not.toBe(status);
    }
    expect(rotuloDoStatusDoPedido("approved")).toBe("Aceito");
    expect(rotuloDoStatusDoPedido("rejected")).toBe("Recusado");
    expect(rotuloDoStatusDoPedido("outro")).toBe("outro");
  });

  it("só enviado e em análise estão abertos", () => {
    expect(pedidoAberto("submitted")).toBe(true);
    expect(pedidoAberto("under_review")).toBe(true);
    expect(pedidoAberto("approved")).toBe(false);
    expect(pedidoAberto("rejected")).toBe(false);
  });

  it("formata o tamanho do arquivo", () => {
    expect(formatarTamanho(512)).toBe("0,5 KB");
    expect(formatarTamanho(10 * 1024 * 1024)).toBe("10 MB");
  });
});

describe("rótulos do convite de fornecedora", () => {
  it("toda situação do convite tem rótulo por extenso", () => {
    expect(Object.keys(ROTULO_DA_SITUACAO_DO_CONVITE)).toEqual(
      SITUACOES_DO_CONVITE,
    );
    expect(rotuloDaSituacaoDoConvite("pendente")).toBe("Pendente");
    expect(rotuloDaSituacaoDoConvite("vencido")).toBe("Vencido");
    expect(rotuloDaSituacaoDoConvite("usado")).toBe("Usado");
    expect(rotuloDaSituacaoDoConvite("revogado")).toBe("Revogado");
    expect(rotuloDaSituacaoDoConvite("outra")).toBe("outra");
  });

  it("revoga o convite pendente e o vencido pela data; usado e revogado, não", () => {
    expect(SITUACOES_DO_CONVITE.filter(conviteRevogavel)).toEqual([
      "pendente",
      "vencido",
    ]);
  });
});
