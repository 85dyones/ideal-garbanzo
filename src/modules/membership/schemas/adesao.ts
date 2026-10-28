/**
 * Esquemas das operações de adesão (ADR-0002 §2.4, §2.5 e §2.12). Todos são
 * estritos: campo a mais no payload é erro, não é ignorado (teste 4).
 */
import { z } from "zod";
import { email, id, telefone, textoObrigatorio } from "@/lib/operacao/campos";
import { TIPOS_DE_EMPRESA } from "@/modules/organizations/tipos";
import { cnpjValido, normalizarCnpj } from "../rules/cnpj";
import {
  TAMANHO_MAXIMO_DA_EVIDENCIA,
  TIPOS_DA_EVIDENCIA,
} from "../rules/evidencia";

const cnpj = z
  .string()
  .transform(normalizarCnpj)
  .refine(cnpjValido, { error: "CNPJ inválido." });

export const esquemaDoPedido = z.strictObject({
  nomeDaEmpresa: textoObrigatorio(200),
  razaoSocial: textoObrigatorio(300),
  cnpj,
  emailDeContato: email.optional(),
  telefoneDeContato: telefone.optional(),
  tipo: z.enum(TIPOS_DE_EMPRESA),
});
export type DadosDoPedido = z.output<typeof esquemaDoPedido>;

export const esquemaDoPedidoEmAnalise = z.strictObject({ pedidoId: id });

/** Lista livre do que foi conferido; nenhum item é exigido até a decisão C5. */
export const esquemaDaConferencia = z.strictObject({
  pedidoId: id,
  itens: z
    .array(
      z.strictObject({
        item: textoObrigatorio(200),
        resultado: textoObrigatorio(200),
        observacao: z.string().trim().max(2000).optional(),
      }),
    )
    .max(100)
    // O banco aceita até 65536 caracteres no jsonb; o texto do jsonb tem
    // espaços que o JSON.stringify não tem, daí a margem.
    .refine((itens) => JSON.stringify(itens).length <= 50_000, {
      error: "Conferência longa demais.",
    }),
});

export const esquemaDaEvidencia = z.strictObject({
  pedidoId: id,
  tipoDoArquivo: z.enum(TIPOS_DA_EVIDENCIA),
  conteudo: z
    .instanceof(Uint8Array)
    .refine(
      (conteudo) =>
        conteudo.byteLength > 0 &&
        conteudo.byteLength <= TAMANHO_MAXIMO_DA_EVIDENCIA,
      { error: "O arquivo precisa ter até 10 MB." },
    ),
  descricao: z.string().trim().max(500).optional(),
});

/** A conferência do CNPJ não pode estar no futuro (tolerância de relógio de 1 min). */
const conferidoEm = z.iso
  .datetime({ offset: true, error: "Data e hora inválidas." })
  .refine((valor) => Date.parse(valor) <= Date.now() + 60_000, {
    error: "A conferência não pode estar no futuro.",
  });

export const esquemaDaDecisao = z.discriminatedUnion("decisao", [
  z.strictObject({
    pedidoId: id,
    decisao: z.literal("aprovar"),
    cnpjConferidoEm: conferidoEm,
    fonteDaConferencia: textoObrigatorio(500),
    evidenciaId: id,
    dadosDeTeste: z.boolean().optional(),
  }),
  z.strictObject({
    pedidoId: id,
    decisao: z.literal("rejeitar"),
    motivo: textoObrigatorio(2000),
    dadosDeTeste: z.boolean().optional(),
  }),
]);

export const esquemaDaUrlDaEvidencia = z.strictObject({ evidenciaId: id });
