/**
 * Moldura das Server Actions de escrita: chama a operação da I1.5 com as
 * dependências da requisição (sessão do usuário pelos cookies) e devolve o
 * estado do formulário montado do `Resultado`. A autorização é da operação,
 * que relê o usuário no banco a cada chamada; a ação não grava em tabela.
 */
import "server-only";
import { refresh } from "next/cache";
import type { Dependencias } from "@/lib/operacao/dependencias";
import type { Resultado } from "@/lib/operacao/resultado";
import { criarDependencias } from "@/lib/supabase/servidor";
import {
  estadoDoResultado,
  type EstadoDoFormulario,
} from "../_apoio/formulario";

type Operacao<T> = (
  dependencias: Dependencias,
  entrada: unknown,
) => Promise<Resultado<T>>;

export async function executarOperacaoDaTela<T>(
  anterior: EstadoDoFormulario,
  operacao: Operacao<T>,
  entrada: unknown,
  mensagemDeSucesso: string,
  opcoes: {
    readonly nomesDosCampos?: Readonly<Record<string, string>>;
    readonly valores?: Readonly<Record<string, string>>;
    /** Recarrega a página depois do sucesso (padrão: sim). */
    readonly recarregar?: boolean;
  } = {},
): Promise<EstadoDoFormulario> {
  const resultado = await operacao(await criarDependencias(), entrada);
  if (resultado.ok && opcoes.recarregar !== false) refresh();
  return estadoDoResultado(anterior, resultado, mensagemDeSucesso, opcoes);
}

/** "sim" e "nao" viram booleano; outro valor vai como veio, e o esquema recusa. */
export function simOuNao(valor: string): boolean | string {
  if (valor === "sim") return true;
  if (valor === "nao") return false;
  return valor;
}
