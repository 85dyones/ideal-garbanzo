/** Esquemas das operações de empresa e membros (ADR-0002 §2.3, §2.6 e §2.12). */
import { z } from "zod";
import {
  email,
  id,
  motivo,
  telefone,
  textoObrigatorio,
} from "@/lib/operacao/campos";
import { PAPEIS_NA_EMPRESA } from "../tipos";

export const esquemaDoStatusDaEmpresa = z.strictObject({
  empresaId: id,
  acao: z.enum(["suspender", "reativar", "encerrar"]),
  motivo,
});

/** Nome e contatos; `null` apaga o contato. */
export const esquemaDosDadosDaEmpresa = z
  .strictObject({
    empresaId: id,
    nome: textoObrigatorio(200).optional(),
    emailDeContato: email.nullable().optional(),
    telefoneDeContato: telefone.nullable().optional(),
  })
  .refine(
    (dados) =>
      dados.nome !== undefined ||
      dados.emailDeContato !== undefined ||
      dados.telefoneDeContato !== undefined,
    { error: "Informe ao menos um campo." },
  );

export const esquemaDoConvite = z.strictObject({
  empresaId: id,
  email,
  papel: z.enum(PAPEIS_NA_EMPRESA),
});

export const esquemaDaResposta = z.strictObject({
  empresaId: id,
  aceitar: z.boolean(),
});

export const esquemaDaGestaoDoMembro = z.strictObject({
  empresaId: id,
  vinculoId: id,
  acao: z.enum(["suspender", "reativar", "remover", "cancelar_convite"]),
});

export const esquemaDaTrocaDePapel = z.strictObject({
  empresaId: id,
  vinculoId: id,
  papel: z.enum(PAPEIS_NA_EMPRESA),
});
