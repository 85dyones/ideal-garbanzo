import { describe, expect, it } from "vitest";
import {
  destinoDoTipo,
  lerConfirmacao,
  parametrosDaPagina,
  parametrosDoFormulario,
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

  it("lê o link montado pelo modelo a partir da URL de retorno", () => {
    expect(
      lerConfirmacao(
        new URLSearchParams("proximo=%2Finicio&token_hash=h1&type=email"),
      ),
    ).toEqual({
      forma: "token",
      tokenHash: "h1",
      tipo: "email",
      destino: "/inicio",
    });
  });

  it("R2: token posto na URL de retorno antes do token do e-mail é inválido", () => {
    expect(
      lerConfirmacao(
        new URLSearchParams(
          "proximo=%2Fnova-senha&token_hash=alheio&type=recovery&token_hash=h1&type=recovery",
        ),
      ),
    ).toEqual({ forma: "invalido" });
  });

  it("R2: qualquer parâmetro do link repetido torna o link inválido", () => {
    for (const consulta of [
      "token_hash=h1&token_hash=h1&type=email",
      "token_hash=h1&type=signup&type=email",
      "token_hash=h1&type=email&proximo=%2Finicio&proximo=%2Fadesao",
      "code=abc&code=def",
      "token%5Fhash=alheio&token_hash=h1&type=email",
    ]) {
      expect(lerConfirmacao(new URLSearchParams(consulta)), consulta).toEqual({
        forma: "invalido",
      });
    }
  });

  it("R2: código e token juntos tornam o link inválido", () => {
    expect(
      lerConfirmacao(new URLSearchParams("code=abc&token_hash=h1&type=email")),
    ).toEqual({ forma: "invalido" });
  });

  it("a página e o botão passam adiante as repetições, e só os parâmetros do link", () => {
    const daPagina = parametrosDaPagina({
      token_hash: ["alheio", "h1"],
      type: "recovery",
      outro: "x",
    });
    expect(daPagina.toString()).toBe(
      "token_hash=alheio&token_hash=h1&type=recovery",
    );
    expect(lerConfirmacao(daPagina)).toEqual({ forma: "invalido" });

    const formulario = new FormData();
    formulario.append("token_hash", "h1");
    formulario.append("type", "invite");
    formulario.append("type", "recovery");
    formulario.append("$ACTION_ID_abc", "");
    expect(parametrosDoFormulario(formulario).toString()).toBe(
      "token_hash=h1&type=invite&type=recovery",
    );
    expect(lerConfirmacao(parametrosDoFormulario(formulario))).toEqual({
      forma: "invalido",
    });
  });

  it("o botão lê o mesmo link que a página mostrou", () => {
    const formulario = new FormData();
    formulario.append("token_hash", "h1");
    formulario.append("type", "invite");
    formulario.append("proximo", "/nova-senha");
    expect(lerConfirmacao(parametrosDoFormulario(formulario))).toEqual({
      forma: "token",
      tokenHash: "h1",
      tipo: "invite",
      destino: "/nova-senha",
    });
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
