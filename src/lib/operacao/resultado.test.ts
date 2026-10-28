import { describe, expect, it } from "vitest";
import { z } from "zod";
import { entradaInvalida, traduzirErroDoBanco } from "./resultado";

describe("tradução do erro do banco", () => {
  it("permissão, unicidade e regra de negócio viram códigos previsíveis", () => {
    expect(traduzirErroDoBanco({ code: "42501", message: "x" }).erro).toBe(
      "sem_permissao",
    );
    expect(traduzirErroDoBanco({ code: "23505", message: "x" }).erro).toBe(
      "conflito",
    );
    expect(traduzirErroDoBanco({ code: "23514", message: "x" }).erro).toBe(
      "regra_violada",
    );
    expect(traduzirErroDoBanco({ code: "XX000", message: "x" }).erro).toBe(
      "falha",
    );
  });

  it("repassa a mensagem da regra de negócio (P0001) como frase", () => {
    const resultado = traduzirErroDoBanco({
      code: "P0001",
      message: "pedido decidido não muda; um novo pedido é uma nova linha",
    });
    expect(resultado).toMatchObject({
      erro: "regra_violada",
      mensagem: "Pedido decidido não muda; um novo pedido é uma nova linha.",
    });
  });

  it("não repassa a mensagem dos outros erros", () => {
    const resultado = traduzirErroDoBanco({
      code: "42501",
      message: "só um administrador da plataforma concede ou altera papéis",
    });
    expect(resultado.mensagem).toBe("Sem permissão para esta ação.");
  });
});

describe("entrada inválida", () => {
  it("lista os erros por campo, inclusive a chave a mais", () => {
    const esquema = z.strictObject({ nome: z.string() });
    const lido = esquema.safeParse({ nome: 1, papel: "admin" });
    expect(lido.success).toBe(false);
    if (lido.success) return;
    const resultado = entradaInvalida(lido.error);
    expect(resultado.erro).toBe("entrada_invalida");
    expect(resultado.campos?.nome?.length).toBeGreaterThan(0);
    expect(resultado.campos?._?.length).toBeGreaterThan(0);
  });
});
