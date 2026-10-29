/**
 * Histórico da oferta para a tela (ADR-0003 §2.8): o `field_history` da
 * oferta e do veículo agrupado por momento e autor, com rótulos e valores em
 * português. As mudanças de uma mesma escrita têm a mesma hora e o mesmo
 * autor, então aparecem juntas.
 */
import { formatarDataHora } from "@/app/_apoio/datas";
import { formatarPreco, formatarQuilometragem } from "@/app/_apoio/oferta";
import { rotulo } from "@/modules/organizations/ui/rotulos";
import { ROTULO_DA_CATEGORIA_DA_SUSPENSAO } from "../rules/oferta";
import { ROTULO_DO_STATUS } from "../rules/transicoes";
import { rotuloDoCampo } from "./rotulos";

export interface MudancaParaTela {
  readonly id: string;
  readonly campo: string;
  readonly antes: unknown;
  readonly depois: unknown;
  readonly autor: string | null;
  readonly em: string;
}

export interface LinhaDoEvento {
  readonly id: string;
  readonly campo: string;
  readonly antes: string;
  readonly depois: string;
}

export interface EventoDoHistorico {
  readonly chave: string;
  readonly em: string;
  /** Nome de quem mudou, "Sistema" ou "Pessoa sem nome disponível". */
  readonly autor: string;
  readonly mudancas: readonly LinhaDoEvento[];
}

const CAMPOS_DE_DATA = new Set([
  "valid_until",
  "availability_confirmed_at",
  "publication_authorized_at",
  "published_at",
  "withdrawn_at",
  "suspended_at",
]);

const CAMPOS_DE_PESSOA = new Set([
  "publication_authorized_by",
  "withdrawn_by",
  "suspended_by",
]);

export const SEM_NOME = "Pessoa sem nome disponível";
export const SISTEMA = "Sistema";

/** Valor de uma coluna no histórico, em texto de leitura. */
export function valorDoHistorico(
  campo: string,
  valor: unknown,
  nomeDaPessoa: (perfilId: string) => string | undefined,
): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (campo === "status" && typeof valor === "string") {
    return rotulo(ROTULO_DO_STATUS, valor);
  }
  if (campo === "suspended_category" && typeof valor === "string") {
    return rotulo(ROTULO_DA_CATEGORIA_DA_SUSPENSAO, valor);
  }
  if (
    campo === "asking_price" &&
    (typeof valor === "number" || typeof valor === "string")
  ) {
    return formatarPreco(typeof valor === "number" ? valor : valor.trim());
  }
  if (campo === "mileage_km" && typeof valor === "number") {
    return formatarQuilometragem(valor);
  }
  if (CAMPOS_DE_DATA.has(campo) && typeof valor === "string") {
    return formatarDataHora(valor);
  }
  if (CAMPOS_DE_PESSOA.has(campo) && typeof valor === "string") {
    return nomeDaPessoa(valor) ?? SEM_NOME;
  }
  if (typeof valor === "string") return valor;
  if (typeof valor === "number" || typeof valor === "boolean") {
    return String(valor);
  }
  return JSON.stringify(valor);
}

/** Agrupa as mudanças por momento e autor, na ordem em que chegaram (a mais recente primeiro). */
export function eventosDoHistorico(
  mudancas: readonly MudancaParaTela[],
  nomeDaPessoa: (perfilId: string) => string | undefined,
): EventoDoHistorico[] {
  const eventos: {
    chave: string;
    em: string;
    autor: string;
    mudancas: LinhaDoEvento[];
  }[] = [];
  for (const mudanca of mudancas) {
    const chave = `${mudanca.em}|${mudanca.autor ?? "sistema"}`;
    let evento = eventos.find((item) => item.chave === chave);
    if (evento === undefined) {
      evento = {
        chave,
        em: mudanca.em,
        autor:
          mudanca.autor === null
            ? SISTEMA
            : (nomeDaPessoa(mudanca.autor) ?? SEM_NOME),
        mudancas: [],
      };
      eventos.push(evento);
    }
    evento.mudancas.push({
      id: mudanca.id,
      campo: rotuloDoCampo(mudanca.campo),
      antes: valorDoHistorico(mudanca.campo, mudanca.antes, nomeDaPessoa),
      depois: valorDoHistorico(mudanca.campo, mudanca.depois, nomeDaPessoa),
    });
  }
  return eventos;
}

/** Ids de pessoas citadas no histórico (autores e colunas de pessoa), para buscar os nomes. */
export function pessoasDoHistorico(
  mudancas: readonly MudancaParaTela[],
): string[] {
  const ids = new Set<string>();
  for (const mudanca of mudancas) {
    if (mudanca.autor !== null) ids.add(mudanca.autor);
    if (CAMPOS_DE_PESSOA.has(mudanca.campo)) {
      for (const valor of [mudanca.antes, mudanca.depois]) {
        if (typeof valor === "string") ids.add(valor);
      }
    }
  }
  return [...ids];
}
