/**
 * Datas na interface (ADR-0001 §2.7): o banco guarda `timestamptz`, a tela
 * mostra no fuso de `America/Sao_Paulo`.
 */
const FORMATO = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});

export function formatarDataHora(iso: string | null | undefined): string {
  if (iso === null || iso === undefined || iso === "") return "—";
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? "—" : FORMATO.format(data);
}

/**
 * Valor de `<input type="datetime-local">` (hora local do navegador, sem
 * fuso) convertido em ISO com fuso. Roda no navegador, que conhece o fuso
 * de quem preencheu. Valor vazio ou inválido devolve `null`.
 */
export function localParaIso(valor: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/u.test(valor)) return null;
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data.toISOString();
}

function doisDigitos(numero: number): string {
  return String(numero).padStart(2, "0");
}

/** Data em hora local no formato do `<input type="datetime-local">`, até os minutos. */
export function paraCampoLocal(data: Date): string {
  return `${String(data.getFullYear())}-${doisDigitos(data.getMonth() + 1)}-${doisDigitos(data.getDate())}T${doisDigitos(data.getHours())}:${doisDigitos(data.getMinutes())}`;
}
