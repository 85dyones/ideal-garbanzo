/**
 * JSON canônico e hash do snapshot da versão (ADR-0003 §2.7). Mesmo
 * subconjunto do JCS (RFC 8785) de `private.json_canonico`: chaves ASCII em
 * ordem de código, sem espaços; valores só texto, nulo, booleano, objeto e
 * lista. Serve para qualquer pessoa recalcular o hash gravado pelo banco.
 */
import { createHash } from "node:crypto";

const CHAVE_ASCII = /^[\x20-\x7e]*$/;

export function jsonCanonico(valor: unknown): string {
  if (valor === null) return "null";
  if (typeof valor === "string" || typeof valor === "boolean") {
    // O escape de texto do JSON.stringify é o do JCS.
    return JSON.stringify(valor);
  }
  if (Array.isArray(valor)) {
    return `[${valor.map((item) => jsonCanonico(item)).join(",")}]`;
  }
  if (typeof valor === "object") {
    const entradas = Object.entries(valor as Record<string, unknown>);
    for (const [chave] of entradas) {
      if (!CHAVE_ASCII.test(chave)) {
        throw new Error("O snapshot só aceita chaves ASCII.");
      }
    }
    // Com chaves ASCII, a ordem das unidades UTF-16 é a ordem de código.
    entradas.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entradas
      .map(([chave, item]) => `${JSON.stringify(chave)}:${jsonCanonico(item)}`)
      .join(",")}}`;
  }
  throw new Error("O snapshot não aceita números; grave-os como texto.");
}

/** SHA-256 do JSON canônico em UTF-8, em hexadecimal minúsculo. */
export function hashDoSnapshot(snapshot: unknown): string {
  return createHash("sha256")
    .update(jsonCanonico(snapshot), "utf8")
    .digest("hex");
}
