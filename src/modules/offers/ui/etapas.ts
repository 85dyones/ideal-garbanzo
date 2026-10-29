/**
 * Pendências de publicação por etapa do cadastro (I2.8). Os códigos são os de
 * `private.pendencias_de_publicacao` (ADR-0003 §2.4), com os rótulos já
 * prontos em `rules/oferta.ts`; aqui só se agrupa cada um na etapa em que a
 * pessoa resolve.
 */
import type { Pendencia } from "../server/ofertas";

export type EtapaComPendencia =
  "veiculo" | "condicoes" | "declaracoes" | "outras";

const DO_VEICULO = new Set([
  "make",
  "model",
  "version",
  "manufacture_year",
  "model_year",
  "mileage_km",
  "fuel_type",
  "transmission",
  "color",
  "body_type",
  "plate",
  "renavam",
  "chassis",
]);

const DAS_CONDICOES = new Set([
  "location",
  "asking_price",
  "commercial_conditions",
  "valid_until",
]);

export function etapaDaPendencia(codigo: string): EtapaComPendencia {
  if (DO_VEICULO.has(codigo)) return "veiculo";
  if (DAS_CONDICOES.has(codigo)) return "condicoes";
  if (codigo.startsWith("declaration:")) return "declaracoes";
  return "outras";
}

/** Rótulos das pendências agrupados por etapa; etapa sem pendência não aparece. */
export function pendenciasPorEtapa(
  pendencias: readonly Pendencia[],
): Partial<Record<EtapaComPendencia, string[]>> {
  const saida: Partial<Record<EtapaComPendencia, string[]>> = {};
  for (const pendencia of pendencias) {
    (saida[etapaDaPendencia(pendencia.codigo)] ??= []).push(pendencia.rotulo);
  }
  return saida;
}

/** Primeira letra maiúscula, para a pendência aparecer como item de lista. */
export function comoItem(texto: string): string {
  return `${texto.charAt(0).toUpperCase()}${texto.slice(1)}`;
}
