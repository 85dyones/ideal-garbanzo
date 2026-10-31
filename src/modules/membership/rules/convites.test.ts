import { describe, expect, it } from "vitest";
import { ehStatusDoConvite, situacaoDoConvite } from "./convites";

const AGORA = new Date("2026-10-30T12:00:00Z");
const DEPOIS = new Date("2026-11-13T12:00:00Z");
const ANTES = new Date("2026-10-29T12:00:00Z");

describe("situação do convite de fornecedora", () => {
  it("pendente dentro da validade; vencido na data ou depois", () => {
    expect(situacaoDoConvite("pending", DEPOIS, AGORA)).toBe("pendente");
    expect(situacaoDoConvite("pending", ANTES, AGORA)).toBe("vencido");
    expect(situacaoDoConvite("pending", AGORA, AGORA)).toBe("vencido");
  });

  it("usado e revogado não dependem da data", () => {
    expect(situacaoDoConvite("used", ANTES, AGORA)).toBe("usado");
    expect(situacaoDoConvite("revoked", DEPOIS, AGORA)).toBe("revogado");
  });

  it("reconhece só os status do banco", () => {
    expect(ehStatusDoConvite("pending")).toBe(true);
    expect(ehStatusDoConvite("expired")).toBe(false);
  });
});
