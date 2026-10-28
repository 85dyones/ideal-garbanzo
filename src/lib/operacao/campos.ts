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
