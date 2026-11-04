/**
 * Esquemas das operações de arquivo da oferta (ADR-0003 §2.13). Todos são
 * estritos: campo a mais no payload é erro, não é ignorado.
 */
import { z } from "zod";
import {
  semDadoPessoal,
  semLinguagemProibida,
} from "@/modules/documental/schemas/consultas";
import { id, textoDeLinha } from "@/lib/operacao/campos";
import {
  TAMANHO_MAXIMO_DO_ARQUIVO,
  TIPOS_DE_ARQUIVO_DO_DOCUMENTO,
  TIPOS_DE_DOCUMENTO,
  TIPOS_DE_FOTO,
} from "./arquivos";

/** Tamanho declarado no passo 1 do envio direto; o servidor confere o real no passo 3 (I3.11). */
export const tamanhoDoArquivo = z
  .int()
  .min(1, { error: "O arquivo está vazio." })
  .max(TAMANHO_MAXIMO_DO_ARQUIVO, {
    error: "O arquivo precisa ter até 10 MB.",
  });

/** Caminho no bucket depois do envio direto; o servidor confere a oferta e o tipo. */
export const caminhoDoEnvio = z
  .string()
  .min(1, { error: "Envie o arquivo." })
  .max(300);

export const esquemaDoEnvioDaFoto = z.strictObject({
  ofertaId: id,
  tipoDoArquivo: z.enum(TIPOS_DE_FOTO),
  tamanho: tamanhoDoArquivo,
});

export const esquemaDoEnvioDoDocumento = z.strictObject({
  ofertaId: id,
  tipoDoArquivo: z.enum(TIPOS_DE_ARQUIVO_DO_DOCUMENTO),
  tamanho: tamanhoDoArquivo,
});

export const esquemaDaFoto = z.strictObject({
  ofertaId: id,
  tipoDoArquivo: z.enum(TIPOS_DE_FOTO),
  caminho: caminhoDoEnvio,
  ordem: z.int().min(0).max(999).optional(),
});

export const esquemaDoDocumento = z.strictObject({
  ofertaId: id,
  tipo: z.enum(TIPOS_DE_DOCUMENTO),
  tipoDoArquivo: z.enum(TIPOS_DE_ARQUIVO_DO_DOCUMENTO),
  caminho: caminhoDoEnvio,
  // Como `offer_documents.description` (`private.texto_de_linha`, 300): sem
  // controle nem invisível, para a recusa sair antes do envio ao bucket.
  // Aparece na ficha: passa pela lista e pela trava de dado pessoal (R-AG-08).
  descricao: semDadoPessoal(semLinguagemProibida(textoDeLinha(300))).optional(),
});

export const esquemaDaUrlDaFoto = z.strictObject({ fotoId: id });

export const esquemaDaUrlDoDocumento = z.strictObject({ documentoId: id });

export const esquemaDaRemocaoDaFoto = z.strictObject({ fotoId: id });

export const esquemaDaOrdemDaFoto = z.strictObject({
  fotoId: id,
  ordem: z.int().min(0).max(999),
});
