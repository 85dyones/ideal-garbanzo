/**
 * Esquemas das operações de arquivo da oferta (ADR-0003 §2.13). Todos são
 * estritos: campo a mais no payload é erro, não é ignorado.
 */
import { z } from "zod";
import { id, textoDeLinha } from "@/lib/operacao/campos";
import {
  TAMANHO_MAXIMO_DO_ARQUIVO,
  TIPOS_DE_ARQUIVO_DO_DOCUMENTO,
  TIPOS_DE_DOCUMENTO,
  TIPOS_DE_FOTO,
} from "./arquivos";

const conteudo = z
  .instanceof(Uint8Array)
  .refine(
    (arquivo) =>
      arquivo.byteLength > 0 && arquivo.byteLength <= TAMANHO_MAXIMO_DO_ARQUIVO,
    { error: "O arquivo precisa ter até 10 MB." },
  );

export const esquemaDaFoto = z.strictObject({
  ofertaId: id,
  tipoDoArquivo: z.enum(TIPOS_DE_FOTO),
  conteudo,
  ordem: z.int().min(0).max(999).optional(),
});

export const esquemaDoDocumento = z.strictObject({
  ofertaId: id,
  tipo: z.enum(TIPOS_DE_DOCUMENTO),
  tipoDoArquivo: z.enum(TIPOS_DE_ARQUIVO_DO_DOCUMENTO),
  conteudo,
  // Como `offer_documents.description` (`private.texto_de_linha`, 300): sem
  // controle nem invisível, para a recusa sair antes do envio ao bucket.
  descricao: textoDeLinha(300).optional(),
});

export const esquemaDaUrlDaFoto = z.strictObject({ fotoId: id });

export const esquemaDaUrlDoDocumento = z.strictObject({ documentoId: id });

export const esquemaDaRemocaoDaFoto = z.strictObject({ fotoId: id });

export const esquemaDaOrdemDaFoto = z.strictObject({
  fotoId: id,
  ordem: z.int().min(0).max(999),
});
