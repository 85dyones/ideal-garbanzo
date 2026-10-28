import { describe, expect, it } from "vitest";
import {
  desfechoDaNovaSenha,
  desfechoDaRecuperacao,
  desfechoDoCadastro,
  mensagemDoLogin,
  mensagensDaSenhaFraca,
} from "./erros-do-auth";

describe("cadastro responde igual exista ou não a conta", () => {
  it("sucesso e e-mail já cadastrado têm a mesma resposta", () => {
    const neutro = desfechoDoCadastro(null);
    expect(neutro).toEqual({ tipo: "neutro" });
    for (const code of [
      "user_already_exists",
      "email_exists",
      "email_address_not_authorized",
      "over_email_send_rate_limit",
      "unexpected_failure",
      undefined,
    ]) {
      expect(desfechoDoCadastro({ code }), String(code)).toEqual(neutro);
    }
  });

  it("senha fraca, e-mail malformado, anti-robô e limite por rede mudam a resposta", () => {
    expect(
      desfechoDoCadastro({ code: "weak_password", reasons: ["length"] }),
    ).toMatchObject({
      tipo: "erro",
      campos: { senha: ["A senha é curta demais."] },
    });
    expect(desfechoDoCadastro({ code: "email_address_invalid" })).toMatchObject(
      { tipo: "erro", campos: { email: ["E-mail inválido."] } },
    );
    expect(desfechoDoCadastro({ code: "captcha_failed" }).tipo).toBe("erro");
    expect(desfechoDoCadastro({ code: "over_request_rate_limit" }).tipo).toBe(
      "erro",
    );
  });
});

describe("recuperação responde igual exista ou não a conta", () => {
  it("só anti-robô, limite e e-mail malformado mudam a resposta", () => {
    expect(desfechoDaRecuperacao(null)).toEqual({ tipo: "neutro" });
    expect(desfechoDaRecuperacao({ code: "user_not_found" })).toEqual({
      tipo: "neutro",
    });
    expect(desfechoDaRecuperacao({ code: "unexpected_failure" })).toEqual({
      tipo: "neutro",
    });
    expect(desfechoDaRecuperacao({ code: "captcha_failed" }).tipo).toBe("erro");
  });
});

describe("login", () => {
  it("credencial errada tem mensagem própria, sem dizer qual campo errou", () => {
    expect(mensagemDoLogin({ code: "invalid_credentials" })).toBe(
      "E-mail ou senha incorretos.",
    );
    expect(mensagemDoLogin({ code: "user_banned" })).toContain("suspenso");
    expect(mensagemDoLogin({})).toBe(
      "Não foi possível entrar agora. Tente de novo.",
    );
  });
});

describe("senha fraca e nova senha", () => {
  it("lista os motivos sem repetir e tem mensagem padrão", () => {
    expect(mensagensDaSenhaFraca(["length", "length", "pwned"])).toHaveLength(
      2,
    );
    expect(mensagensDaSenhaFraca(undefined)).toEqual([
      "A senha não atende à política de senhas.",
    ]);
  });

  it("nova senha igual à atual é erro do campo", () => {
    expect(desfechoDaNovaSenha({ code: "same_password" })).toMatchObject({
      tipo: "erro",
      campos: { senha: ["A nova senha precisa ser diferente da atual."] },
    });
    expect(desfechoDaNovaSenha(null)).toEqual({ tipo: "neutro" });
  });
});
