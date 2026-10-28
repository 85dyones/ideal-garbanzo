/**
 * Rastreio das escritas na auditoria (ADR-0002 §2.11).
 *
 * Os gatilhos de auditoria leem `request.headers`, que o PostgREST preenche:
 * `x-request-id` vai para `audit_logs.request_id`, e `x-audit-reason` é o
 * motivo, obrigatório na mudança de status de perfil e de empresa pela API.
 */
export const CABECALHO_REQUEST_ID = "x-request-id";
export const CABECALHO_MOTIVO = "x-audit-reason";

export function novoRequestId(): string {
  return crypto.randomUUID();
}

/**
 * Valor de cabeçalho HTTP com o texto em bytes UTF-8. O `fetch` do Node só
 * aceita caracteres de até um byte no cabeçalho e os envia como estão; com
 * cada byte do UTF-8 num caractere, o PostgREST recebe e decodifica o motivo
 * acentuado corretamente. Caracteres de controle viram espaço.
 */
export function paraCabecalho(texto: string): string {
  const limpo = texto.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  return String.fromCharCode(...new TextEncoder().encode(limpo));
}

interface ComCabecalho<T> {
  setHeader(nome: string, valor: string): T;
}

/** Acrescenta o `x-request-id` e, se houver, o motivo à requisição do PostgREST. */
export function comRastreio<T extends ComCabecalho<T>>(
  consulta: T,
  requestId: string,
  motivo?: string,
): T {
  const comId = consulta.setHeader(CABECALHO_REQUEST_ID, requestId);
  return motivo === undefined
    ? comId
    : comId.setHeader(CABECALHO_MOTIVO, paraCabecalho(motivo));
}
