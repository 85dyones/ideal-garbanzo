/**
 * Estados documentais da oferta para a tela (especificação v1.1, §6.4 e
 * §6.5; ADR-0003 §2.12). O banco calcula estado e origem
 * (`public.estados_documentais`); o servidor só acrescenta os rótulos, as
 * ressalvas e o resumo proporcional. Quem não lê a oferta recebe "sem
 * permissão", exista ela ou não.
 */
import type { Dependencias } from "@/lib/operacao/dependencias";
import {
  falha,
  sucesso,
  traduzirErroDoBanco,
  type Resultado,
} from "@/lib/operacao/resultado";
import { executarOperacao } from "@/modules/auth/server/operacao";
import {
  avisosDosEstados,
  textoDoAviso,
  type CodigoDoAviso,
} from "../rules/avisos";
import {
  ESTADOS_DOCUMENTAIS,
  ORIGENS,
  ROTULO_DA_ORIGEM,
  ROTULO_DO_ESTADO,
  ROTULO_DO_VALOR_DECLARADO,
  VALORES_DECLARADOS,
  resumoProporcional,
  rotuloDaCategoria,
  type EstadoDocumental,
  type Origem,
  type ValorDeclarado,
} from "../rules/estados";
import { esquemaDosEstados } from "../schemas/estados";

interface LinhaDoBanco {
  category: string;
  state: string;
  origin: string;
  declared_value: string | null;
  detail: string | null;
  declared_at: string | null;
}

export interface EstadoDaCategoria {
  readonly categoria: string;
  readonly rotuloDaCategoria: string;
  readonly estado: EstadoDocumental;
  readonly rotuloDoEstado: string;
  readonly origem: Origem;
  readonly rotuloDaOrigem: string;
  readonly declaracao: {
    readonly valor: ValorDeclarado;
    readonly rotulo: string;
    readonly detalhe: string | null;
    readonly declaradaEm: string;
  } | null;
}

export interface EstadosDaOferta {
  readonly categorias: readonly EstadoDaCategoria[];
  readonly avisos: readonly { codigo: CodigoDoAviso; texto: string }[];
  readonly resumo: string;
}

function umDe<T extends string>(
  lista: readonly T[],
  valor: string | null,
): valor is T {
  return valor !== null && (lista as readonly string[]).includes(valor);
}

/** Linha do banco em formato da tela; `null` se o banco devolver valor fora do domínio. */
function paraCategoria(linha: LinhaDoBanco): EstadoDaCategoria | null {
  if (!umDe(ESTADOS_DOCUMENTAIS, linha.state)) return null;
  if (!umDe(ORIGENS, linha.origin)) return null;
  const valor = linha.declared_value;
  const declaracao =
    umDe(VALORES_DECLARADOS, valor) && linha.declared_at !== null
      ? {
          valor,
          rotulo: ROTULO_DO_VALOR_DECLARADO[valor],
          detalhe: linha.detail,
          declaradaEm: linha.declared_at,
        }
      : null;
  return {
    categoria: linha.category,
    rotuloDaCategoria: rotuloDaCategoria(linha.category),
    estado: linha.state,
    rotuloDoEstado: ROTULO_DO_ESTADO[linha.state],
    origem: linha.origin,
    rotuloDaOrigem: ROTULO_DA_ORIGEM[linha.origin],
    declaracao,
  };
}

export function consultarEstadosDocumentais(
  dependencias: Dependencias,
  entrada: unknown,
): Promise<Resultado<EstadosDaOferta>> {
  return executarOperacao(
    dependencias,
    esquemaDosEstados,
    entrada,
    async ({ ofertaId }) => {
      const resposta = await dependencias.sessao.rpc("estados_documentais", {
        p_oferta: ofertaId,
      });
      if (resposta.error !== null) return traduzirErroDoBanco(resposta.error);
      // A função devolve uma tabela; o cliente sem tipos gerados não a conhece.
      const linhas = (resposta.data ?? []) as LinhaDoBanco[];
      const categorias: EstadoDaCategoria[] = [];
      for (const linha of linhas) {
        const categoria = paraCategoria(linha);
        if (categoria === null) return falha("falha");
        categorias.push(categoria);
      }
      const estados = categorias.map((categoria) => categoria.estado);
      return sucesso({
        categorias,
        avisos: avisosDosEstados(estados).map((codigo) => ({
          codigo,
          texto: textoDoAviso(codigo),
        })),
        resumo: resumoProporcional(estados),
      });
    },
  );
}
