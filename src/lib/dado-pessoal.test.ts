import { describe, expect, it } from "vitest";
import { dadoPessoalNoTexto, mensagemDoDadoPessoal } from "./dado-pessoal";

// Os mesmos casos do pgTAP 430 (R-AG-07), para o servidor e o banco darem a mesma resposta.
const CASOS: readonly (readonly [string, string, string | null])[] = [
  ["CPF com pontuação", "Comprador 123.456.789-09 desistiu.", "um CPF"],
  [
    "11 dígitos seguidos",
    "RENAVAM 12345678901 na consulta.",
    "um número de 11 dígitos (CPF, RENAVAM ou telefone)",
  ],
  ["telefone com DDD", "Ligar no (11) 98765-4321.", "um telefone"],
  ["celular sem DDD", "Ligar no 98765-4321.", "um telefone"],
  ["placa Mercosul", "Placa ABC1D23 no laudo.", "uma placa"],
  ["placa antiga", "Placa abc-1234 no laudo.", "uma placa"],
  ["chassi", "Chassi 9BWZZZ377VT004251.", "um chassi"],
  [
    "contraste: ano, preço e quilometragem",
    "Modelo 2019-2020, 45.000 km, R$ 89.900,00.",
    null,
  ],
  [
    "contraste: versão e número curto",
    "Versão XRE300, lote 1234, 2 donos.",
    null,
  ],
  ["contraste: data", "Consulta de 30/10/2026 às 14:30.", null],
];

describe("dado pessoal no texto livre (R-AG-07)", () => {
  it.each(CASOS)("%s", (_caso, texto, esperado) => {
    expect(dadoPessoalNoTexto(texto)).toBe(esperado);
  });

  it("a mensagem diz o que tirar", () => {
    expect(mensagemDoDadoPessoal("um CPF")).toBe(
      "O texto parece ter um CPF. Tire do texto: dado pessoal ou restrito não vai para a ficha.",
    );
  });
});
