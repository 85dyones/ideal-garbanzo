import { describe, expect, it } from "vitest";
import { DESTINO_PADRAO, caminhoSeguro, enderecoDoLogin } from "./proximo";

describe("caminho de redirecionamento", () => {
  it("aceita caminho relativo do próprio site, com busca e fragmento", () => {
    expect(caminhoSeguro("/inicio")).toBe("/inicio");
    expect(caminhoSeguro("/empresa/abc?aba=membros#lista")).toBe(
      "/empresa/abc?aba=membros#lista",
    );
    expect(caminhoSeguro("/")).toBe("/");
  });

  it("recusa outro domínio, com ou sem protocolo", () => {
    for (const valor of [
      "//exemplo.invalid",
      "//exemplo.invalid/inicio",
      "/\\exemplo.invalid",
      "https://exemplo.invalid",
      "http:/exemplo.invalid",
      "javascript:alert(1)",
      "exemplo.invalid",
      "inicio",
    ]) {
      expect(caminhoSeguro(valor), valor).toBe(DESTINO_PADRAO);
    }
  });

  it("recusa barra invertida, espaço e caractere de controle em qualquer posição", () => {
    for (const valor of [
      "/\t/exemplo.invalid",
      "/\n/exemplo.invalid",
      "/ /exemplo.invalid",
      "/inicio\\..\\..",
      "/inicio\u0000",
      "/inicio\u007f",
    ]) {
      expect(caminhoSeguro(valor), JSON.stringify(valor)).toBe(DESTINO_PADRAO);
    }
  });

  it("recusa o caminho que vira outro domínio depois de resolver `..` e `.`", () => {
    expect(caminhoSeguro("/..//exemplo.invalid")).toBe(DESTINO_PADRAO);
    expect(caminhoSeguro("/.//exemplo.invalid")).toBe(DESTINO_PADRAO);
  });

  it("mantém codificado o que vem codificado", () => {
    expect(caminhoSeguro("/%2F%2Fexemplo.invalid")).toBe(
      "/%2F%2Fexemplo.invalid",
    );
  });

  it("devolve o padrão para vazio, longo demais ou tipo errado", () => {
    expect(caminhoSeguro("")).toBe(DESTINO_PADRAO);
    expect(caminhoSeguro(`/${"a".repeat(3000)}`)).toBe(DESTINO_PADRAO);
    expect(caminhoSeguro(null)).toBe(DESTINO_PADRAO);
    expect(caminhoSeguro(undefined)).toBe(DESTINO_PADRAO);
    expect(caminhoSeguro(42)).toBe(DESTINO_PADRAO);
    expect(caminhoSeguro(["/inicio"])).toBe(DESTINO_PADRAO);
  });

  it("aceita outro padrão", () => {
    expect(caminhoSeguro("//x", "/nova-senha")).toBe("/nova-senha");
  });

  it("monta o endereço do login com o destino codificado", () => {
    expect(enderecoDoLogin("/inicio")).toBe("/entrar?proximo=%2Finicio");
    expect(enderecoDoLogin("//exemplo.invalid")).toBe(
      "/entrar?proximo=%2Finicio",
    );
  });
});
