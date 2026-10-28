import { describe, expect, it } from "vitest";
import { falha, sucesso } from "@/lib/operacao/resultado";
import {
  ESTADO_INICIAL,
  estadoDoResultado,
  texto,
  textoOpcional,
  textoOuNulo,
  valoresDoFormulario,
} from "./formulario";

describe("estado do formulário a partir do Resultado", () => {
  it("sucesso leva a mensagem da tela e conta o envio", () => {
    const estado = estadoDoResultado(
      ESTADO_INICIAL,
      sucesso({ id: "x" }),
      "Gravado.",
    );
    expect(estado).toMatchObject({
      situacao: "sucesso",
      mensagem: "Gravado.",
      envios: 1,
    });
  });

  it("falha parcial vira aviso para repetir, com a mensagem do Resultado", () => {
    const estado = estadoDoResultado(
      ESTADO_INICIAL,
      falha("falha_parcial", "Repita a operação."),
      "Gravado.",
    );
    expect(estado).toMatchObject({
      situacao: "aviso",
      mensagem: "Repita a operação.",
    });
  });

  it("erro repassa a mensagem e os campos, com os nomes do formulário", () => {
    const resultado = {
      ...falha("entrada_invalida"),
      campos: { tipoDoArquivo: ["Tipo inválido."], conteudo: ["Grande."] },
    };
    const estado = estadoDoResultado(
      { ...ESTADO_INICIAL, envios: 2 },
      resultado,
      "Enviado.",
      {
        nomesDosCampos: { tipoDoArquivo: "arquivo", conteudo: "arquivo" },
        valores: { descricao: "abc" },
      },
    );
    expect(estado.situacao).toBe("erro");
    expect(estado.mensagem).toBe("Os dados enviados não são válidos.");
    expect(estado.campos).toEqual({ arquivo: ["Tipo inválido.", "Grande."] });
    expect(estado.valores).toEqual({ descricao: "abc" });
    expect(estado.envios).toBe(3);
  });

  it("código de erro desconhecido sai como erro com a mensagem pronta", () => {
    const resultado = {
      ok: false,
      erro: "limite_excedido",
      mensagem: "Muitas tentativas. Aguarde.",
    } as unknown as Parameters<typeof estadoDoResultado>[1];
    expect(estadoDoResultado(ESTADO_INICIAL, resultado, "Ok.")).toMatchObject({
      situacao: "erro",
      mensagem: "Muitas tentativas. Aguarde.",
    });
  });
});

describe("leitura do FormData", () => {
  const dados = new FormData();
  dados.set("nome", "Empresa");
  dados.set("vazio", "   ");
  dados.set("arquivo", new File(["x"], "x.txt"));

  it("texto devolve string ou vazio", () => {
    expect(texto(dados, "nome")).toBe("Empresa");
    expect(texto(dados, "ausente")).toBe("");
    expect(texto(dados, "arquivo")).toBe("");
  });

  it("opcional e nulo tratam o campo em branco como ausente", () => {
    expect(textoOpcional(dados, "nome")).toBe("Empresa");
    expect(textoOpcional(dados, "vazio")).toBeUndefined();
    expect(textoOuNulo(dados, "vazio")).toBeNull();
  });

  it("devolve os valores pedidos", () => {
    expect(valoresDoFormulario(dados, ["nome", "ausente"])).toEqual({
      nome: "Empresa",
      ausente: "",
    });
  });
});
