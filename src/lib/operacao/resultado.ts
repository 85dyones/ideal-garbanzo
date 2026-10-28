/**
 * Resultado das operações de servidor (I1.5; ADR-0002 §2.12).
 *
 * Toda operação devolve um resultado previsível, sem lançar exceção para a
 * interface. "Sem permissão" é a mesma resposta para registro inexistente e
 * registro alheio (ADR-0002 §2.15), para não revelar o que existe.
 */
import { z } from "zod";

export type CodigoDeErro =
  /** Payload fora do esquema estrito (campo a mais, tipo ou formato errado). */
  | "entrada_invalida"
  /** Sem sessão válida junto ao Auth. */
  | "sem_sessao"
  /** Sem papel, vínculo ou status para a ação; também para id inexistente. */
  | "sem_permissao"
  /** Unicidade: pedido aberto repetido, convite repetido. */
  | "conflito"
  /** Regra de negócio recusada pelo banco (transição, campo obrigatório). */
  | "regra_violada"
  /** O banco gravou, mas um passo seguinte falhou; a operação pode ser repetida. */
  | "falha_parcial"
  /** Falha inesperada do banco, do Auth ou do Storage. */
  | "falha";

export interface Falha {
  readonly ok: false;
  readonly erro: CodigoDeErro;
  readonly mensagem: string;
  /** Erros por campo, só em `entrada_invalida`. */
  readonly campos?: Readonly<Record<string, readonly string[]>>;
}

export interface Sucesso<T> {
  readonly ok: true;
  readonly dados: T;
}

export type Resultado<T> = Sucesso<T> | Falha;

const MENSAGENS: Readonly<Record<CodigoDeErro, string>> = {
  entrada_invalida: "Os dados enviados não são válidos.",
  sem_sessao: "Entre de novo para continuar.",
  sem_permissao: "Sem permissão para esta ação.",
  conflito: "Já existe um registro igual em andamento.",
  regra_violada: "A ação não é permitida no estado atual.",
  falha_parcial: "A ação foi gravada, mas um passo seguinte falhou. Repita.",
  falha: "Não foi possível concluir agora. Tente de novo.",
};

export function sucesso<T>(dados: T): Sucesso<T> {
  return { ok: true, dados };
}

export function falha(erro: CodigoDeErro, mensagem?: string): Falha {
  return { ok: false, erro, mensagem: mensagem ?? MENSAGENS[erro] };
}

export function entradaInvalida(erro: z.ZodError): Falha {
  const { fieldErrors, formErrors } = z.flattenError(erro);
  const campos: Record<string, readonly string[]> = {};
  for (const [campo, mensagens] of Object.entries(fieldErrors)) {
    if (Array.isArray(mensagens) && mensagens.length > 0) {
      campos[campo] = mensagens as string[];
    }
  }
  if (formErrors.length > 0) campos._ = formErrors;
  return { ...falha("entrada_invalida"), campos };
}

/** Erro do PostgREST, do Storage ou do Auth, no formato comum. */
export interface ErroDoBanco {
  readonly code?: string;
  readonly message: string;
}

/**
 * Traduz o erro do banco (via PostgREST) em código previsível. Os gatilhos de
 * proteção usam 42501 para permissão e P0001 para regra de negócio
 * (migração `20261028140000_identidade`); a mensagem de P0001 é escrita para
 * o usuário e pode ser repassada.
 */
export function traduzirErroDoBanco(erro: ErroDoBanco): Falha {
  switch (erro.code) {
    case "42501":
      return falha("sem_permissao");
    case "23505":
      return falha("conflito");
    case "P0001":
      return falha("regra_violada", primeiraLetraMaiuscula(erro.message));
    case "23514":
    case "23502":
    case "23503":
    case "22P02":
    case "22023":
      return falha("regra_violada");
    default:
      return falha("falha");
  }
}

function primeiraLetraMaiuscula(texto: string): string {
  const limpo = texto.trim();
  if (limpo === "") return MENSAGENS.regra_violada;
  const frase = `${limpo.charAt(0).toUpperCase()}${limpo.slice(1)}`;
  return /[.!?]$/.test(frase) ? frase : `${frase}.`;
}
