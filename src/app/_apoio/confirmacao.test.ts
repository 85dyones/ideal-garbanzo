import { describe, expect, it } from "vitest";
import {
  destinoDoTipo,
  lerConfirmacao,
  tipoDeConfirmacao,
} from "./confirmacao";

describe("link de confirmação do Auth", () => {
  it("aceita só os tipos de e-mail usados pela plataforma", () => {
    expect(tipoDeConfirmacao("invite")).toBe("invite");
    expect(tipoDeConfirmacao("recovery")).toBe("recovery");
    expect(tipoDeConfirmacao("magiclink")).toBeNull();
    expect(tipoDeConfirmacao(null)).toBeNull();
  });

  it("convite e recuperação levam à nova senha; o resto, ao início", () => {
    expect(destinoDoTipo("invite")).toBe("/nova-senha");
    expect(destinoDoTipo("recovery")).toBe("/nova-senha");
    expect(destinoDoTipo("signup")).toBe("/inicio");
    expect(destinoDoTipo(null)).toBe("/inicio");
  });

  it("lê o código do fluxo PKCE com o destino validado", () => {
    expect(
      lerConfirmacao(new URLSearchParams("code=abc&proximo=%2Fnova-senha")),
    ).toEqual({ forma: "codigo", codigo: "abc", destino: "/nova-senha" });
    expect(
      lerConfirmacao(new URLSearchParams("code=abc&proximo=%2F%2Fx.invalid")),
    ).toEqual({ forma: "codigo", codigo: "abc", destino: "/inicio" });
  });

  it("lê o token do modelo de e-mail, com destino pelo tipo", () => {
    expect(
      lerConfirmacao(new URLSearchParams("token_hash=h1&type=invite")),
    ).toEqual({
      forma: "token",
      tokenHash: "h1",
      tipo: "invite",
      destino: "/nova-senha",
    });
    expect(
      lerConfirmacao(
        new URLSearchParams("token_hash=h1&type=signup&proximo=%2Fadesao"),
      ),
    ).toMatchObject({ destino: "/adesao" });
  });

  it("sem código nem token com tipo válido, é inválido", () => {
    expect(lerConfirmacao(new URLSearchParams(""))).toEqual({
      forma: "invalido",
    });
    expect(
      lerConfirmacao(new URLSearchParams("token_hash=h1&type=magiclink")),
    ).toEqual({ forma: "invalido" });
    expect(lerConfirmacao(new URLSearchParams("token_hash=h1"))).toEqual({
      forma: "invalido",
    });
  });
});
