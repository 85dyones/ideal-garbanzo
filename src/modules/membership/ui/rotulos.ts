/**
 * Rótulos do pedido de adesão. O status final positivo aparece como "Aceito",
 * para não usar na interface os termos da §6.6 da especificação.
 */
import type { StatusDoPedido } from "../queries/pedidos";
import type { SituacaoDoConvite } from "../rules/convites";

export const ROTULO_DO_STATUS_DO_PEDIDO: Readonly<
  Record<StatusDoPedido, string>
> = {
  submitted: "Enviado",
  under_review: "Em análise",
  approved: "Aceito",
  rejected: "Recusado",
};

export const ROTULO_DO_TIPO_DE_ARQUIVO: Readonly<Record<string, string>> = {
  "application/pdf": "PDF",
  "image/png": "PNG",
  "image/jpeg": "JPEG",
  "image/webp": "WebP",
};

export function rotuloDoStatusDoPedido(status: string): string {
  return (
    (ROTULO_DO_STATUS_DO_PEDIDO as Readonly<Record<string, string>>)[status] ??
    status
  );
}

/**
 * Situação do convite de fornecedora (ADR-0002 §9). O vencido continua
 * `pending` no banco; a situação conta pela data.
 */
export const ROTULO_DA_SITUACAO_DO_CONVITE: Readonly<
  Record<SituacaoDoConvite, string>
> = {
  pendente: "Pendente",
  vencido: "Vencido",
  usado: "Usado",
  revogado: "Revogado",
};

export function rotuloDaSituacaoDoConvite(situacao: string): string {
  return (
    (ROTULO_DA_SITUACAO_DO_CONVITE as Readonly<Record<string, string>>)[
      situacao
    ] ?? situacao
  );
}

/**
 * O administrador revoga o convite com status ainda `pending`, também o
 * vencido pela data; usado e revogado são finais.
 */
export function conviteRevogavel(situacao: SituacaoDoConvite): boolean {
  return situacao === "pendente" || situacao === "vencido";
}

/** Pedido ainda aberto: aceita conferência, evidência e decisão. */
export function pedidoAberto(status: string): boolean {
  return status === "submitted" || status === "under_review";
}

/** Tamanho do arquivo em KB ou MB, com vírgula decimal. */
export function formatarTamanho(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} KB`;
  }
  return `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}
