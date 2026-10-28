import { describe, expect, it } from "vitest";
import { origemDaRequisicao, urlDeRetorno } from "./origem";

describe("origem da requisição", () => {
  it("usa o cabeçalho Origin quando existe", () => {
    const cabecalhos = new Headers({
      origin: "https://repasse.exemplo.invalid",
      host: "outro.invalid",
    });
    expect(origemDaRequisicao(cabecalhos)).toBe(
      "https://repasse.exemplo.invalid",
    );
  });

  it("sem Origin, monta com o host e o protocolo encaminhados", () => {
    const cabecalhos = new Headers({
      "x-forwarded-host": "preview.exemplo.invalid, interno.invalid",
      "x-forwarded-proto": "https, http",
      host: "interno.invalid",
    });
    expect(origemDaRequisicao(cabecalhos)).toBe(
      "https://preview.exemplo.invalid",
    );
  });

  it("sem protocolo encaminhado, usa http só no endereço local", () => {
    expect(origemDaRequisicao(new Headers({ host: "localhost:3000" }))).toBe(
      "http://localhost:3000",
    );
    expect(origemDaRequisicao(new Headers({ host: "repasse.invalid" }))).toBe(
      "https://repasse.invalid",
    );
  });

  it("ignora Origin nulo e recusa protocolo que não seja http ou https", () => {
    expect(
      origemDaRequisicao(new Headers({ origin: "null", host: "localhost" })),
    ).toBe("http://localhost");
    expect(
      origemDaRequisicao(new Headers({ origin: "javascript:alert(1)" })),
    ).toBeNull();
    expect(origemDaRequisicao(new Headers())).toBeNull();
  });

  it("descarta caminho que venha junto da origem", () => {
    expect(
      origemDaRequisicao(
        new Headers({ origin: "https://repasse.invalid/caminho?x=1" }),
      ),
    ).toBe("https://repasse.invalid");
  });
});

describe("URL de retorno dos e-mails", () => {
  it("aponta para a confirmação com o destino validado", () => {
    expect(urlDeRetorno("http://localhost:3000", "/nova-senha")).toBe(
      "http://localhost:3000/auth/confirmar?proximo=%2Fnova-senha",
    );
    expect(urlDeRetorno("https://repasse.invalid", "//exemplo.invalid")).toBe(
      "https://repasse.invalid/auth/confirmar?proximo=%2Finicio",
    );
  });

  it("sem origem, deixa o Auth usar a Site URL", () => {
    expect(urlDeRetorno(null, "/inicio")).toBeUndefined();
  });
});
