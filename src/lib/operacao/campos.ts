/**
 * Campos comuns dos esquemas das operações. Os limites repetem os CHECKs da
 * migração `20261028140000_identidade`, para o erro sair por campo no servidor
 * antes de chegar ao banco.
 */
import { z } from "zod";

export const id = z.uuid({ error: "Identificador inválido." });

export function textoObrigatorio(maximo: number) {
  return z
    .string()
    .trim()
    .min(1, { error: "Campo obrigatório." })
    .max(maximo, { error: `Use no máximo ${String(maximo)} caracteres.` });
}

/**
 * Caracteres que `private.texto_de_linha` e `private.texto_livre` recusam
 * (migração `20261029120000_ofertas`): controle e invisíveis (hífen suave,
 * largura zero, marcas de direção, BOM).
 */
const PROIBIDOS_NA_LINHA =
  /[\u0000-\u001f\u007f\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/u;
const PROIBIDOS_NO_TEXTO_LIVRE =
  /[\u0000-\u0009\u000b-\u001f\u007f\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/u;
const MENSAGEM_DOS_PROIBIDOS =
  "Remova caracteres de controle ou invisíveis do texto.";

/** Texto de uma linha, como `private.texto_de_linha` (ADR-0003 §2.12). */
export function textoDeLinha(maximo: number) {
  return textoObrigatorio(maximo).refine(
    (valor) => !PROIBIDOS_NA_LINHA.test(valor),
    { error: MENSAGEM_DOS_PROIBIDOS },
  );
}

/**
 * Texto livre, como `private.texto_livre`: aceita quebra de linha no meio. A
 * quebra do navegador (`\r\n`) vira `\n` antes da conferência.
 */
export function textoLivre(maximo: number) {
  return z
    .string()
    .transform((valor) => valor.replace(/\r\n?/g, "\n"))
    .pipe(
      textoObrigatorio(maximo).refine(
        (valor) => !PROIBIDOS_NO_TEXTO_LIVRE.test(valor),
        { error: MENSAGEM_DOS_PROIBIDOS },
      ),
    );
}

export const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(320, { error: "E-mail longo demais." })
  .pipe(z.email({ error: "E-mail inválido." }));

export const telefone = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()-]{8,30}$/, { error: "Telefone inválido." });

/** Motivo de suspensão, reativação ou encerramento, gravado na auditoria. */
export const motivo = textoObrigatorio(1000);
