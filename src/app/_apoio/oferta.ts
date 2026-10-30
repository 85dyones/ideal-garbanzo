/**
 * Apoio das telas da oferta (I2.8): preço no formato brasileiro, números
 * digitados com ponto de milhar, datas da validade no horário de Brasília,
 * leitura do formulário do veículo e das condições e erros do esquema por
 * campo. Só conversão de formato: as regras ficam nos esquemas e no banco.
 */
import type { z } from "zod";
import { texto, textoOpcional } from "./formulario";

/** "65.000,00", "65000,5", "R$ 1.250": milhar com ponto, decimais com vírgula. */
const PRECO_BRASILEIRO = /^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/u;

/** Até dez dígitos inteiros, como `numeric(12, 2)` (`FORMATO_DO_PRECO`). */
const MAXIMO_DE_DIGITOS_DO_PRECO = 10;

/**
 * Preço digitado no formato brasileiro ("65.000,00") no formato do servidor
 * ("65000.00"), sempre com duas casas. `null` se o texto não for um preço.
 */
export function precoParaServidor(digitado: string): string | null {
  const limpo = digitado.replace(/^\s*R\$\s*/u, "").trim();
  if (!PRECO_BRASILEIRO.test(limpo)) return null;
  const [inteiroComPontos = "", decimais = ""] = limpo.split(",");
  const inteiro = inteiroComPontos
    .replace(/\./gu, "")
    .replace(/^0+(?=\d)/u, "");
  if (inteiro.length > MAXIMO_DE_DIGITOS_DO_PRECO) return null;
  return `${inteiro}.${decimais.padEnd(2, "0")}`;
}

/** Preço do servidor ("65000.00" ou 65000) no formato da tela ("65.000,00"). */
export function precoParaTela(
  valor: string | number | null | undefined,
): string {
  if (valor === null || valor === undefined || valor === "") return "";
  const comoTexto = typeof valor === "number" ? valor.toFixed(2) : valor.trim();
  const partes = /^(\d+)(?:\.(\d{1,2}))?$/u.exec(comoTexto);
  if (partes === null) return String(valor);
  const inteiro = (partes[1] ?? "0").replace(/\B(?=(\d{3})+(?!\d))/gu, ".");
  return `${inteiro},${(partes[2] ?? "").padEnd(2, "0")}`;
}

/** Preço para leitura: "R$ 65.000,00", ou travessão sem preço. */
export function formatarPreco(
  valor: string | number | null | undefined,
): string {
  const tela = precoParaTela(valor);
  return tela === "" ? "—" : `R$ ${tela}`;
}

/** Número inteiro digitado, com ou sem ponto de milhar ("45.000"). `null` se não for. */
export function inteiroDoCampo(digitado: string): number | null {
  const limpo = digitado.trim();
  if (!/^(?:\d{1,3}(?:\.\d{3})+|\d+)$/u.test(limpo)) return null;
  const numero = Number(limpo.replace(/\./gu, ""));
  return Number.isSafeInteger(numero) ? numero : null;
}

/** Quilometragem para leitura: "45.000 km". */
export function formatarQuilometragem(
  valor: number | null | undefined,
): string {
  if (valor === null || valor === undefined) return "—";
  return `${String(valor).replace(/\B(?=(\d{3})+(?!\d))/gu, ".")} km`;
}

const PARTES_DA_DATA = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Dia (AAAA-MM-DD) de um instante no horário de Brasília; `null` se inválido. */
export function dataEmBrasilia(instante: Date | string): string | null {
  const data = typeof instante === "string" ? new Date(instante) : instante;
  if (Number.isNaN(data.getTime())) return null;
  const partes = Object.fromEntries(
    PARTES_DA_DATA.formatToParts(data).map((parte) => [
      parte.type,
      parte.value,
    ]),
  );
  return `${partes.year ?? ""}-${partes.month ?? ""}-${partes.day ?? ""}`;
}

/** Dia (AAAA-MM-DD) somado de `dias` dias de calendário. */
export function somarDias(dia: string, dias: number): string {
  const base = new Date(`${dia}T00:00:00Z`);
  return new Date(base.getTime() + dias * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** "2026-11-13" vira "13/11/2026"; texto fora do formato vira travessão. */
export function formatarDia(dia: string | null | undefined): string {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(dia ?? "");
  if (partes === null) return "—";
  return `${partes[3] ?? ""}/${partes[2] ?? ""}/${partes[1] ?? ""}`;
}

/** Validade gravada (fim do dia em Brasília) como dia de leitura: "13/11/2026". */
export function formatarValidade(validaAte: string | null | undefined): string {
  if (validaAte === null || validaAte === undefined) return "—";
  return formatarDia(dataEmBrasilia(validaAte));
}

/** Validade gravada como valor do campo de data (AAAA-MM-DD), ou vazio. */
export function validadeParaCampo(
  validaAte: string | null | undefined,
): string {
  if (validaAte === null || validaAte === undefined) return "";
  return dataEmBrasilia(validaAte) ?? "";
}

/**
 * Dias aceitos no campo da validade (ADR-0003 §2.9): de hoje até hoje mais o
 * teto da configuração, no horário de Brasília. O banco confere de novo.
 */
export function limitesDaValidade(
  validadeMaximaEmDias: number | null,
  agora: Date = new Date(),
): {
  readonly minimo: string;
  readonly maximo: string | null;
  readonly maximoParaLeitura: string | null;
} {
  const hoje = dataEmBrasilia(agora) ?? "";
  const maximo =
    validadeMaximaEmDias === null
      ? null
      : somarDias(hoje, validadeMaximaEmDias);
  return {
    minimo: hoje,
    maximo,
    maximoParaLeitura: maximo === null ? null : formatarDia(maximo),
  };
}

export { validadeVencida } from "@/modules/offers/rules/transicoes";

/** Validade sugerida no formulário: hoje mais o padrão da configuração; vazio sem padrão. */
export function validadeSugerida(
  validadePadraoEmDias: number | null,
  agora: Date = new Date(),
): string {
  if (validadePadraoEmDias === null) return "";
  return somarDias(dataEmBrasilia(agora) ?? "", validadePadraoEmDias);
}

/**
 * Campo do formulário para cada caminho do esquema. A mensagem padrão
 * substitui as mensagens genéricas do Zod (tipo, faixa, opção), que não estão
 * em português; as mensagens escritas nos esquemas (código `custom` e as
 * demais com texto próprio) passam como vieram.
 */
export interface CampoDoEsquema {
  readonly nome: string;
  readonly mensagemPadrao?: string;
}

/** Erros do esquema por campo do formulário; caminho desconhecido vai para `_`. */
export function errosPorCampo(
  erro: z.ZodError,
  campos: Readonly<Record<string, CampoDoEsquema>>,
): Record<string, string[]> {
  const saida: Record<string, string[]> = {};
  for (const problema of erro.issues) {
    const campo = campos[problema.path.map(String).join(".")];
    const nome = campo?.nome ?? "_";
    const generica =
      problema.code === "invalid_type" ||
      problema.code === "too_small" ||
      problema.code === "too_big" ||
      problema.code === "invalid_value";
    const mensagem =
      generica && campo?.mensagemPadrao !== undefined
        ? campo.mensagemPadrao
        : problema.message;
    (saida[nome] ??= []).push(mensagem);
  }
  return saida;
}

/** Junta erros por campo, sem repetir a mesma mensagem no mesmo campo. */
export function juntarErros(
  ...listas: readonly Readonly<Record<string, readonly string[]>>[]
): Record<string, string[]> {
  const saida: Record<string, string[]> = {};
  for (const lista of listas) {
    for (const [nome, mensagens] of Object.entries(lista)) {
      const atuais = (saida[nome] ??= []);
      for (const mensagem of mensagens) {
        if (!atuais.includes(mensagem)) atuais.push(mensagem);
      }
    }
  }
  return saida;
}

/** Campos de texto do veículo, com o nome do formulário igual ao do esquema. */
export const CAMPOS_DE_TEXTO_DO_VEICULO = [
  "marca",
  "modelo",
  "versao",
  "combustivel",
  "cambio",
  "cor",
  "carroceria",
  "placa",
  "renavam",
  "chassi",
] as const;

export const CAMPOS_NUMERICOS_DO_VEICULO = [
  "anoDeFabricacao",
  "anoDoModelo",
  "quilometragem",
] as const;

export const CAMPOS_DAS_CONDICOES = [
  "preco",
  "condicoesComerciais",
  "cidade",
  "uf",
  "validaAte",
] as const;

const MENSAGEM_DO_NUMERO: Readonly<
  Record<(typeof CAMPOS_NUMERICOS_DO_VEICULO)[number], string>
> = {
  anoDeFabricacao: "Informe o ano com quatro dígitos, entre 1900 e 2100.",
  anoDoModelo: "Informe o ano com quatro dígitos, entre 1900 e 2101.",
  quilometragem: "Informe a quilometragem em números inteiros, até 9.999.999.",
};

export const MENSAGEM_DO_PRECO = "Informe o preço em reais, como 65.000,00.";

/** Caminhos dos esquemas da criação e da alteração para os campos do formulário. */
export const CAMPOS_DO_ESQUEMA_DA_OFERTA: Readonly<
  Record<string, CampoDoEsquema>
> = Object.fromEntries(
  new Map<string, CampoDoEsquema>([
    ...CAMPOS_DE_TEXTO_DO_VEICULO.map((nome): [string, CampoDoEsquema] => [
      `veiculo.${nome}`,
      { nome },
    ]),
    ...CAMPOS_NUMERICOS_DO_VEICULO.map((nome): [string, CampoDoEsquema] => [
      `veiculo.${nome}`,
      { nome, mensagemPadrao: MENSAGEM_DO_NUMERO[nome] },
    ]),
    ["oferta.preco", { nome: "preco", mensagemPadrao: MENSAGEM_DO_PRECO }],
    ["oferta.condicoesComerciais", { nome: "condicoesComerciais" }],
    ["oferta.cidade", { nome: "cidade" }],
    ["oferta.uf", { nome: "uf", mensagemPadrao: "Escolha a UF da lista." }],
    [
      "oferta.validaAte",
      { nome: "validaAte", mensagemPadrao: "Data inválida." },
    ],
  ]),
);

export interface FormularioDaOferta {
  /** Campos informados do veículo; campo em branco não entra. */
  readonly veiculo: Readonly<Record<string, string | number>>;
  /** Campos informados das condições; campo em branco não entra. */
  readonly oferta: Readonly<Record<string, string>>;
  /** Erros de formato encontrados antes do esquema (número e preço). */
  readonly erros: Readonly<Record<string, readonly string[]>>;
  /** O que foi digitado, para o formulário não perder o texto. */
  readonly valores: Readonly<Record<string, string>>;
}

/**
 * Lê o formulário do veículo e das condições. Campo em branco fica de fora:
 * na criação, fica vazio no rascunho; na alteração, mantém o valor gravado.
 */
export function lerFormularioDaOferta(
  dados: FormData,
  partes: { readonly veiculo: boolean; readonly condicoes: boolean },
): FormularioDaOferta {
  const veiculo: Record<string, string | number> = {};
  const oferta: Record<string, string> = {};
  const erros: Record<string, string[]> = {};
  const valores: Record<string, string> = {};

  if (partes.veiculo) {
    for (const nome of CAMPOS_DE_TEXTO_DO_VEICULO) {
      valores[nome] = texto(dados, nome);
      const valor = textoOpcional(dados, nome);
      if (valor !== undefined) veiculo[nome] = valor;
    }
    for (const nome of CAMPOS_NUMERICOS_DO_VEICULO) {
      valores[nome] = texto(dados, nome);
      const valor = textoOpcional(dados, nome);
      if (valor === undefined) continue;
      const numero = inteiroDoCampo(valor);
      if (numero === null) erros[nome] = [MENSAGEM_DO_NUMERO[nome]];
      else veiculo[nome] = numero;
    }
  }

  if (partes.condicoes) {
    for (const nome of CAMPOS_DAS_CONDICOES) {
      valores[nome] = texto(dados, nome);
      const valor = textoOpcional(dados, nome);
      if (valor === undefined) continue;
      if (nome === "preco") {
        const preco = precoParaServidor(valor);
        if (preco === null) erros.preco = [MENSAGEM_DO_PRECO];
        else oferta.preco = preco;
      } else {
        oferta[nome] = valor;
      }
    }
  }

  return { veiculo, oferta, erros, valores };
}
