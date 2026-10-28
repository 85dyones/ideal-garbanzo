/** Esquemas das operações de perfil, papel na plataforma e configuração (ADR-0002 §2.3, §2.4, §2.7). */
import { z } from "zod";
import { id, motivo, telefone, textoObrigatorio } from "@/lib/operacao/campos";
import { PAPEIS_NA_PLATAFORMA } from "../tipos";

export const esquemaDoStatusDoPerfil = z.strictObject({
  perfilId: id,
  acao: z.enum(["suspender", "reativar"]),
  motivo,
});

/** O próprio usuário altera só nome e telefone; `null` apaga o telefone. */
export const esquemaDoMeuPerfil = z
  .strictObject({
    nome: textoObrigatorio(200).optional(),
    telefone: telefone.nullable().optional(),
  })
  .refine((dados) => dados.nome !== undefined || dados.telefone !== undefined, {
    error: "Informe ao menos um campo.",
  });

export const esquemaDaConcessao = z.strictObject({
  perfilId: id,
  papel: z.enum(PAPEIS_NA_PLATAFORMA),
});

export const esquemaDaRevogacao = z.strictObject({ perfilId: id });

export const esquemaDaLeituraDeAuditoria = z.strictObject({
  perfilId: id,
  permitir: z.boolean(),
});

export const esquemaDaConfiguracao = z.strictObject({
  chave: z.string().regex(/^[a-z][a-z0-9_]*$/, { error: "Chave inválida." }),
  valor: z.json(),
});
