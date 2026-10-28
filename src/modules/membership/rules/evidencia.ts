/**
 * Arquivo de evidência da conferência de CNPJ (ADR-0002 §2.5). Os limites são
 * os do bucket `membership-evidence` (migração `20261028140200`): 10 MiB e
 * PDF, PNG, JPEG ou WebP. O conteúdo precisa começar com a assinatura do tipo
 * declarado, porque o Storage confere só o tipo informado.
 */
export const BUCKET_DA_EVIDENCIA = "membership-evidence";
export const TAMANHO_MAXIMO_DA_EVIDENCIA = 10 * 1024 * 1024;

export const TIPOS_DA_EVIDENCIA = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;
export type TipoDaEvidencia = (typeof TIPOS_DA_EVIDENCIA)[number];

export const EXTENSAO_DO_TIPO: Readonly<Record<TipoDaEvidencia, string>> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

function comecaCom(
  conteudo: Uint8Array,
  assinatura: readonly number[],
  posicao = 0,
): boolean {
  return assinatura.every((byte, i) => conteudo[posicao + i] === byte);
}

/** O conteúdo tem a assinatura do tipo declarado. */
export function conteudoConfereComOTipo(
  conteudo: Uint8Array,
  tipo: TipoDaEvidencia,
): boolean {
  switch (tipo) {
    case "application/pdf":
      return comecaCom(conteudo, [0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
    case "image/png":
      return comecaCom(
        conteudo,
        [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      );
    case "image/jpeg":
      return comecaCom(conteudo, [0xff, 0xd8, 0xff]);
    case "image/webp":
      return (
        comecaCom(conteudo, [0x52, 0x49, 0x46, 0x46]) && // RIFF
        comecaCom(conteudo, [0x57, 0x45, 0x42, 0x50], 8) // WEBP
      );
  }
}
