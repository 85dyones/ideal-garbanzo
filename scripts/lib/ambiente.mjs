/**
 * Carrega `.env.local` e `.env` da raiz sem sobrescrever variáveis já
 * definidas no ambiente (o CI define as suas direto no processo).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

export const RAIZ = path.resolve(import.meta.dirname, "..", "..");

export function carregarAmbiente(raiz = RAIZ) {
  for (const nome of [".env.local", ".env"]) {
    const arquivo = path.join(raiz, nome);
    if (!existsSync(arquivo)) continue;
    const valores = parseEnv(readFileSync(arquivo, "utf8"));
    for (const [chave, valor] of Object.entries(valores)) {
      process.env[chave] ??= valor;
    }
  }
}

/**
 * Devolve as variáveis pedidas ou lança erro com os nomes que faltam (nunca os valores).
 * @param {string[]} nomes
 * @returns {Record<string, string>}
 */
export function exigirVariaveis(nomes) {
  const faltando = nomes.filter((nome) => !process.env[nome]);
  if (faltando.length > 0) {
    throw new Error(
      `Variáveis ausentes: ${faltando.join(", ")}. Preencha o .env seguindo docs/ambiente.md.`,
    );
  }
  return Object.fromEntries(
    nomes.map((nome) => [nome, String(process.env[nome])]),
  );
}
