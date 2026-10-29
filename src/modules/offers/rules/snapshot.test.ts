import { describe, expect, it } from "vitest";
import { hashDoSnapshot, jsonCanonico } from "./snapshot";

// Os mesmos casos do teste 300 do banco (ADR-0003 §2.7).
describe("JSON canônico e hash do snapshot", () => {
  const objeto = { b: "1", a: null, c: { z: true, y: ["x", "w"] } };

  it("chaves em ordem de código, sem espaços, listas na ordem dada", () => {
    expect(jsonCanonico(objeto)).toBe(
      '{"a":null,"b":"1","c":{"y":["x","w"],"z":true}}',
    );
    expect(hashDoSnapshot(objeto)).toBe(
      "bebfc2d4a3217d84815920ae3283af95f1d006059f16c5ced0ab768253c61e60",
    );
  });

  it("escape de texto do JCS: aspas, barra, quebra e controle; acento e emoji sem escape", () => {
    const texto = { t: 'Pátio "São" \\ 😀\n\u0001' };
    expect(jsonCanonico(texto)).toBe(
      '{"t":"Pátio \\"São\\" \\\\ 😀\\n\\u0001"}',
    );
    expect(hashDoSnapshot(texto)).toBe(
      "eb1d68decc59c969692463a4c36fa8a6fa4caea48a3710397dc9f980cf1423d5",
    );
  });

  it("recusa número e chave fora do ASCII, como o banco", () => {
    expect(() => jsonCanonico({ n: 1 })).toThrow(/números/);
    expect(() => jsonCanonico({ á: "1" })).toThrow(/ASCII/);
  });
});
