/**
 * Estado dos formulários com `useActionState` e leitura do `FormData`.
 *
 * As Server Actions devolvem este estado, montado a partir do `Resultado`
 * da operação (I1.5). A mensagem é sempre a do `Resultado`; `falha_parcial`
 * vira aviso para repetir. Qualquer outro código de erro, inclusive os que
 * vierem depois, sai como erro com a mensagem pronta.
 */
import type { Resultado } from "@/lib/operacao/resultado";

export type SituacaoDoFormulario = "inicial" | "sucesso" | "aviso" | "erro";

export interface EstadoDoFormulario {
  readonly situacao: SituacaoDoFormulario;
  readonly mensagem: string;
  /** Erros por campo; `_` são erros do formulário inteiro. */
  readonly campos: Readonly<Record<string, readonly string[]>>;
  /** Quantas respostas o formulário já recebeu; reinicia o widget anti-robô. */
  readonly envios: number;
  /** Valores de texto devolvidos para o formulário não perder o que foi digitado. */
  readonly valores?: Readonly<Record<string, string>>;
  /** URL temporária devolvida pela ação (evidência da adesão). */
  readonly url?: string;
}

export type AcaoDoFormulario = (
  anterior: EstadoDoFormulario,
  dados: FormData,
) => Promise<EstadoDoFormulario>;

export const ESTADO_INICIAL: EstadoDoFormulario = {
  situacao: "inicial",
  mensagem: "",
  campos: {},
  envios: 0,
};

interface Extras {
  readonly campos?: Readonly<Record<string, readonly string[]>>;
  readonly valores?: Readonly<Record<string, string>>;
  readonly url?: string;
}

export function estadoDeSucesso(
  anterior: EstadoDoFormulario,
  mensagem: string,
  extras: Extras = {},
): EstadoDoFormulario {
  return {
    situacao: "sucesso",
    mensagem,
    campos: {},
    envios: anterior.envios + 1,
    ...(extras.url === undefined ? {} : { url: extras.url }),
    ...(extras.valores === undefined ? {} : { valores: extras.valores }),
  };
}

export function estadoDeErro(
  anterior: EstadoDoFormulario,
  mensagem: string,
  extras: Extras = {},
): EstadoDoFormulario {
  return {
    situacao: "erro",
    mensagem,
    campos: extras.campos ?? {},
    envios: anterior.envios + 1,
    ...(extras.valores === undefined ? {} : { valores: extras.valores }),
  };
}

/** Troca o nome dos campos do esquema pelos nomes do formulário. */
function renomearCampos(
  campos: Readonly<Record<string, readonly string[]>> | undefined,
  nomes: Readonly<Record<string, string>>,
): Record<string, readonly string[]> {
  const saida: Record<string, string[]> = {};
  for (const [campo, mensagens] of Object.entries(campos ?? {})) {
    const nome = nomes[campo] ?? campo;
    saida[nome] = [...(saida[nome] ?? []), ...mensagens];
  }
  return saida;
}

export function estadoDoResultado(
  anterior: EstadoDoFormulario,
  resultado: Resultado<unknown>,
  mensagemDeSucesso: string,
  opcoes: {
    readonly nomesDosCampos?: Readonly<Record<string, string>>;
    readonly valores?: Readonly<Record<string, string>>;
  } = {},
): EstadoDoFormulario {
  if (resultado.ok) return estadoDeSucesso(anterior, mensagemDeSucesso);
  if (resultado.erro === "falha_parcial") {
    return {
      situacao: "aviso",
      mensagem: resultado.mensagem,
      campos: {},
      envios: anterior.envios + 1,
    };
  }
  return estadoDeErro(anterior, resultado.mensagem, {
    campos: renomearCampos(resultado.campos, opcoes.nomesDosCampos ?? {}),
    ...(opcoes.valores === undefined ? {} : { valores: opcoes.valores }),
  });
}

/** Texto do campo, ou `""` se não veio (arquivo também conta como ausente). */
export function texto(dados: FormData, nome: string): string {
  const valor = dados.get(nome);
  return typeof valor === "string" ? valor : "";
}

/** Texto do campo, ou `undefined` se veio vazio (campo opcional não enviado). */
export function textoOpcional(
  dados: FormData,
  nome: string,
): string | undefined {
  const valor = texto(dados, nome);
  return valor.trim() === "" ? undefined : valor;
}

/** Texto do campo, ou `null` se veio vazio (campo que pode ser apagado). */
export function textoOuNulo(dados: FormData, nome: string): string | null {
  return textoOpcional(dados, nome) ?? null;
}

/** Valores de texto para devolver ao formulário (nunca inclua senha). */
export function valoresDoFormulario(
  dados: FormData,
  nomes: readonly string[],
): Record<string, string> {
  return Object.fromEntries(nomes.map((nome) => [nome, texto(dados, nome)]));
}
