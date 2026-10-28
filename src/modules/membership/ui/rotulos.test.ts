import { describe, expect, it } from "vitest";
import { STATUS_DO_PEDIDO } from "../queries/pedidos";
import {
  formatarTamanho,
  pedidoAberto,
  rotuloDoStatusDoPedido,
} from "./rotulos";

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
