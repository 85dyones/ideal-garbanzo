/**
 * Arquivos da oferta no Storage (ADR-0003 §2.13; migração
 * `20261029140000_storage_das_ofertas`). Os limites repetem os dos buckets:
 * até 10 MiB; fotos em JPEG, PNG ou WebP; documentos também em PDF. O conteúdo
 * precisa começar com a assinatura do tipo declarado, porque o Storage confere
 * só o tipo informado (mesma regra da evidência da adesão).
 */
import { conteudoConfereComOTipo } from "@/modules/membership/rules/evidencia";

export const BUCKET_DAS_FOTOS = "offer-photos";
export const BUCKET_DOS_DOCUMENTOS = "offer-documents";
export const TAMANHO_MAXIMO_DO_ARQUIVO = 10 * 1024 * 1024;

export const TIPOS_DE_FOTO = ["image/jpeg", "image/png", "image/webp"] as const;
export type TipoDeFoto = (typeof TIPOS_DE_FOTO)[number];

export const TIPOS_DE_ARQUIVO_DO_DOCUMENTO = [
  "application/pdf",
  ...TIPOS_DE_FOTO,
] as const;
export type TipoDeArquivoDoDocumento =
  (typeof TIPOS_DE_ARQUIVO_DO_DOCUMENTO)[number];

/** Tipos de documento da oferta (§5.2, `offer_documents.kind`). */
export const TIPOS_DE_DOCUMENTO = [
  "crlv",
  "laudo_cautelar",
  "certidao",
  "relatorio_de_consulta",
  "nota_fiscal",
  "outro",
] as const;
export type TipoDeDocumento = (typeof TIPOS_DE_DOCUMENTO)[number];

const EXTENSAO: Readonly<Record<TipoDeArquivoDoDocumento, string>> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Validade das URLs temporárias, em segundos. Valores técnicos e provisórios. */
export const VALIDADE_DA_URL_DA_FOTO = 600;
export const VALIDADE_DA_URL_DO_DOCUMENTO = 60;

/** `<empresa>/<oferta>/<uuid>.<extensão>`: o nome original do arquivo não entra. */
export function caminhoDoArquivo(
  empresaId: string,
  ofertaId: string,
  arquivoId: string,
  tipo: TipoDeArquivoDoDocumento,
): string {
  return `${empresaId}/${ofertaId}/${arquivoId}.${EXTENSAO[tipo]}`;
}

/** O conteúdo tem a assinatura do tipo declarado. */
export function conteudoConfere(
  conteudo: Uint8Array,
  tipo: TipoDeArquivoDoDocumento,
): boolean {
  return conteudoConfereComOTipo(conteudo, tipo);
}
