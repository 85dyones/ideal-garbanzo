/**
 * Dados da oferta (ADR-0003 §2.4, §2.9 e §2.10). Repetem os CHECKs de
 * `offers` (migração `20261029120000_ofertas`) e dão os rótulos das
 * pendências de publicação calculadas no banco.
 */
import { rotuloDaCategoria } from "@/modules/documental/rules/estados";

export const UFS = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const;
export type Uf = (typeof UFS)[number];

/**
 * Preço em reais, com ponto e até duas casas (`numeric(12, 2)`): até dez
 * dígitos inteiros, sem zero à esquerda. Vai ao banco como texto, sem passar
 * por número de ponto flutuante.
 */
export const FORMATO_DO_PRECO = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/;

/** As quatro categorias da §6.10. Pendência documental sozinha não é motivo (X09). */
export const CATEGORIAS_DA_SUSPENSAO = [
  "fraud_indication",
  "forgery",
  "deliberately_misleading",
  "serious_risk",
] as const;
export type CategoriaDaSuspensao = (typeof CATEGORIAS_DA_SUSPENSAO)[number];

export const ROTULO_DA_CATEGORIA_DA_SUSPENSAO: Readonly<
  Record<CategoriaDaSuspensao, string>
> = {
  fraud_indication: "Indício de fraude",
  forgery: "Falsificação",
  deliberately_misleading: "Informação deliberadamente enganosa",
  serious_risk: "Risco grave",
};

/**
 * A validade vale até 23:59:59 do dia escolhido no horário de Brasília
 * (ADR-0003 §2.9). O banco converte o texto com o nome do fuso, então a regra
 * segue a do `America/Sao_Paulo`, inclusive se o horário de verão voltar.
 */
export function fimDoDiaEmBrasilia(data: string): string {
  return `${data} 23:59:59 America/Sao_Paulo`;
}

const ROTULO_DA_PENDENCIA: Readonly<Record<string, string>> = {
  supplier: "empresa fornecedora ativa",
  make: "marca",
  model: "modelo",
  version: "versão",
  manufacture_year: "ano de fabricação",
  model_year: "ano do modelo",
  mileage_km: "quilometragem",
  fuel_type: "combustível",
  transmission: "câmbio",
  color: "cor",
  body_type: "carroceria",
  plate: "placa",
  renavam: "RENAVAM",
  chassis: "chassi",
  location: "cidade e UF",
  asking_price: "preço",
  commercial_conditions: "condições comerciais",
  valid_until: "validade dentro do prazo",
  transfer_impediment: "sem impedimento de transferência ativo",
};

const PREFIXO_DA_DECLARACAO = "declaration:";

/** Rótulo de uma pendência de `private.pendencias_de_publicacao`. */
export function rotuloDaPendencia(pendencia: string): string {
  if (pendencia.startsWith(PREFIXO_DA_DECLARACAO)) {
    const categoria = pendencia.slice(PREFIXO_DA_DECLARACAO.length);
    return `declaração em ${rotuloDaCategoria(categoria)}`;
  }
  return ROTULO_DA_PENDENCIA[pendencia] ?? pendencia;
}

/** Frase para o fornecedor com o que falta para enviar ou publicar. */
export function mensagemDasPendencias(pendencias: readonly string[]): string {
  return `Falta preencher: ${pendencias.map(rotuloDaPendencia).join("; ")}.`;
}
