/**
 * Varredor de linguagem proibida (especificação v1.1, §6.6; gate 5 do plano).
 *
 * A lista de termos, a qualificação aceita e o marcador de exceção ficam em
 * `config/linguagem-proibida.json`. A busca não diferencia maiúsculas nem
 * acentos e compara palavras inteiras. Uma linha que contém a qualificação, ou
 * o marcador seguido de um motivo, não gera ocorrência.
 */
import listaConfigurada from "../../config/linguagem-proibida.json";

export interface TermoProibido {
  /** Forma de referência do termo, usada no relatório. */
  readonly termo: string;
  /** Flexões de gênero e número buscadas no texto. */
  readonly variantes: readonly string[];
}

export interface ListaDeLinguagemProibida {
  readonly qualificacao: string;
  readonly marcadorDeExcecao: string;
  readonly termos: readonly TermoProibido[];
}

export interface Ocorrencia {
  /** Número da linha, a partir de 1. */
  readonly linha: number;
  /** Coluna do início do trecho, a partir de 1. */
  readonly coluna: number;
  /** Termo da lista que corresponde ao trecho. */
  readonly termo: string;
  /** Trecho como aparece no texto original. */
  readonly trecho: string;
}

interface PadraoDeTermo {
  readonly termo: string;
  readonly expressao: RegExp;
}

interface Achado {
  readonly inicio: number;
  readonly fim: number;
  readonly termo: string;
}

const LETRA_OU_DIGITO = "[\\p{L}\\p{N}]";

/** Minúsculas, sem acentos (marcas combinantes removidas após a decomposição). */
export function normalizar(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

/**
 * Normaliza uma linha e guarda, para cada caractere normalizado, a posição de
 * origem na linha original. A última posição do mapa é o fim da linha.
 */
function normalizarComMapa(linha: string): { texto: string; origem: number[] } {
  let texto = "";
  const origem: number[] = [];
  let posicao = 0;
  for (const caractere of linha) {
    const normalizado = normalizar(caractere);
    // Um caractere de origem pode virar zero, uma ou mais unidades depois de normalizado.
    origem.push(...Array.from({ length: normalizado.length }, () => posicao));
    texto += normalizado;
    posicao += caractere.length;
  }
  origem.push(posicao);
  return { texto, origem };
}

function escaparParaExpressao(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Palavras do termo separadas por qualquer quantidade de espaço, sem letra ou dígito colado. */
function expressaoDePalavraInteira(termo: string, flags: string): RegExp {
  const palavras = normalizar(termo)
    .trim()
    .split(/\s+/u)
    .map(escaparParaExpressao);
  return new RegExp(
    `(?<!${LETRA_OU_DIGITO})${palavras.join("\\s+")}(?!${LETRA_OU_DIGITO})`,
    flags,
  );
}

function eObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function eTextoPreenchido(valor: unknown): valor is string {
  return typeof valor === "string" && valor.trim() !== "";
}

/** Confere o formato da lista e devolve uma cópia tipada; lança erro se for inválida. */
export function validarLista(dado: unknown): ListaDeLinguagemProibida {
  if (!eObjeto(dado)) {
    throw new Error(
      "Lista de linguagem proibida inválida: esperado um objeto.",
    );
  }
  const { qualificacao, marcadorDeExcecao, termos } = dado;
  if (!eTextoPreenchido(qualificacao)) {
    throw new Error(
      "Lista de linguagem proibida inválida: `qualificacao` vazia ou ausente.",
    );
  }
  if (!eTextoPreenchido(marcadorDeExcecao)) {
    throw new Error(
      "Lista de linguagem proibida inválida: `marcadorDeExcecao` vazio ou ausente.",
    );
  }
  if (!Array.isArray(termos) || termos.length === 0) {
    throw new Error(
      "Lista de linguagem proibida inválida: `termos` vazio ou ausente.",
    );
  }
  const itens: unknown[] = termos;
  const termosValidados = itens.map((item, indice): TermoProibido => {
    const erro = new Error(
      `Lista de linguagem proibida inválida: termo na posição ${String(indice)}.`,
    );
    if (
      !eObjeto(item) ||
      !eTextoPreenchido(item.termo) ||
      !Array.isArray(item.variantes)
    ) {
      throw erro;
    }
    const variantesBrutas: unknown[] = item.variantes;
    const variantes: string[] = [];
    for (const variante of variantesBrutas) {
      if (!eTextoPreenchido(variante)) {
        throw erro;
      }
      variantes.push(variante);
    }
    if (variantes.length === 0) {
      throw erro;
    }
    return { termo: item.termo, variantes };
  });
  return { qualificacao, marcadorDeExcecao, termos: termosValidados };
}

/** Lista versionada em `config/linguagem-proibida.json`. */
export function carregarListaPadrao(): ListaDeLinguagemProibida {
  return validarLista(listaConfigurada);
}

/** Prepara as expressões da lista uma vez e devolve a função que varre um texto. */
export function criarVarredor(
  lista: ListaDeLinguagemProibida,
): (texto: string) => Ocorrencia[] {
  const padroes: PadraoDeTermo[] = lista.termos.flatMap((item) =>
    item.variantes.map((variante) => ({
      termo: item.termo,
      expressao: expressaoDePalavraInteira(variante, "gu"),
    })),
  );
  const qualificacao = expressaoDePalavraInteira(lista.qualificacao, "u");
  const marcador = new RegExp(
    `${escaparParaExpressao(normalizar(lista.marcadorDeExcecao).trim())}\\s*${LETRA_OU_DIGITO}`,
    "u",
  );

  return (texto: string): Ocorrencia[] => {
    const ocorrencias: Ocorrencia[] = [];
    const linhas = texto.split(/\r\n|\r|\n/u);

    linhas.forEach((linhaOriginal, indiceDaLinha) => {
      const { texto: linha, origem } = normalizarComMapa(linhaOriginal);

      if (qualificacao.test(linha) || marcador.test(linha)) {
        return;
      }

      const achados: Achado[] = [];
      for (const padrao of padroes) {
        for (const resultado of linha.matchAll(padrao.expressao)) {
          achados.push({
            inicio: resultado.index,
            fim: resultado.index + resultado[0].length,
            termo: padrao.termo,
          });
        }
      }

      // Quando um termo contém outro (ex.: a expressão com duas palavras), fica o trecho mais longo.
      achados.sort((a, b) => a.inicio - b.inicio || b.fim - a.fim);
      let fimDoUltimo = -1;
      for (const achado of achados) {
        if (achado.inicio < fimDoUltimo) {
          continue;
        }
        fimDoUltimo = achado.fim;
        const inicioOriginal = origem[achado.inicio] ?? 0;
        const fimOriginal = origem[achado.fim] ?? linhaOriginal.length;
        ocorrencias.push({
          linha: indiceDaLinha + 1,
          coluna: inicioOriginal + 1,
          termo: achado.termo,
          trecho: linhaOriginal.slice(inicioOriginal, fimOriginal),
        });
      }
    });

    return ocorrencias;
  };
}

/** Varre um texto e devolve as ocorrências, com linha e coluna. */
export function varrerTexto(
  texto: string,
  lista: ListaDeLinguagemProibida = carregarListaPadrao(),
): Ocorrencia[] {
  return criarVarredor(lista)(texto);
}
