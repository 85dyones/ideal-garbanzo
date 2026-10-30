/**
 * Estados documentais da oferta para a tela (especificação v1.1, §6.4, §6.5 e
 * §6.11; ADR-0003 §2.12; ADR-0004 §2.7, §2.11 e §2.13). O banco calcula o
 * estado (`public.estados_documentais`); o servidor acrescenta os rótulos, as
 * consultas vigentes com a origem de cada uma, a revisão aberta, os
 * impedimentos, as ressalvas (as mesmas do snapshot) e o resumo proporcional.
 * Quem não lê a oferta recebe "sem permissão", exista ela ou não.
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
  AVISO_DO_IMPEDIMENTO,
  avisosDosEstados,
  textoDoAviso,
  type CodigoDoAviso,
} from "../rules/avisos";
import {
  ESTADOS_DOCUMENTAIS,
  ORIGENS,
  ROTULO_DA_ORIGEM,
  ROTULO_DO_ESTADO,
  ROTULO_DO_RESULTADO,
  ROTULO_DO_TIPO_DE_FONTE,
  ROTULO_DO_VALOR_DECLARADO,
  VALORES_DECLARADOS,
  origemDaConsulta,
  resumoProporcional,
  rotuloDaCategoria,
  type EstadoDocumental,
  type Origem,
  type ResultadoDaConsulta,
  type TipoDeFonte,
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

interface LinhaDaConsulta {
  id: string;
  seq: number;
  category: string;
  source_name: string;
  source_type: TipoDeFonte;
  performed_at: string;
  result: ResultadoDaConsulta;
  result_summary: string;
  known_limitations: string;
  evidence_document_id: string | null;
  recorded_as: "supplier" | "platform";
  supersedes_check_id: string | null;
}

interface LinhaDoImpedimento {
  id: string;
  basis: string;
  status: "identified" | "resolved";
  identified_at: string;
  resolved_at: string | null;
}

/** Consulta vigente da categoria, com a própria origem (§6.5; ADR-0004 §2.7). */
export interface ConsultaVigente {
  readonly id: string;
  readonly fonte: string;
  readonly tipoDeFonte: TipoDeFonte;
  readonly rotuloDoTipoDeFonte: string;
  readonly realizadaEm: string;
  readonly resultado: ResultadoDaConsulta;
  readonly rotuloDoResultado: string;
  readonly resumo: string;
  readonly limitacoes: string;
  /** Sem evidência, a tela mostra "sem evidência anexada" (P2). */
  readonly evidenciaId: string | null;
  readonly origem: "check_result" | "independent_evidence";
  readonly rotuloDaOrigem: string;
}

export interface ImpedimentoDaOferta {
  readonly id: string;
  readonly base: string;
  readonly ativo: boolean;
  readonly identificadoEm: string;
  readonly resolvidoEm: string | null;
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
  readonly consultas: readonly ConsultaVigente[];
  readonly revisaoAberta: boolean;
}

export interface EstadosDaOferta {
  readonly categorias: readonly EstadoDaCategoria[];
  /** Aviso próprio, separado das pendências documentais (§6.11). */
  readonly impedimentos: readonly ImpedimentoDaOferta[];
  readonly avisos: readonly { codigo: CodigoDoAviso; texto: string }[];
  readonly resumo: string;
}

function umDe<T extends string>(
  lista: readonly T[],
  valor: string | null,
): valor is T {
  return valor !== null && (lista as readonly string[]).includes(valor);
}

/** Consultas que nenhuma outra substituiu, da mais recente para a mais antiga (E1). */
function vigentes(linhas: readonly LinhaDaConsulta[]): LinhaDaConsulta[] {
  const substituidas = new Set(
    linhas.flatMap((linha) =>
      linha.supersedes_check_id === null ? [] : [linha.supersedes_check_id],
    ),
  );
  return linhas
    .filter((linha) => !substituidas.has(linha.id))
    .sort(
      (a, b) =>
        Date.parse(b.performed_at) - Date.parse(a.performed_at) ||
        b.seq - a.seq,
    );
}

function paraConsulta(linha: LinhaDaConsulta): ConsultaVigente {
  const origem = origemDaConsulta({
    tipoDeFonte: linha.source_type,
    resultado: linha.result,
    temEvidencia: linha.evidence_document_id !== null,
    registradaPelaPlataforma: linha.recorded_as === "platform",
  });
  return {
    id: linha.id,
    fonte: linha.source_name,
    tipoDeFonte: linha.source_type,
    rotuloDoTipoDeFonte: ROTULO_DO_TIPO_DE_FONTE[linha.source_type],
    realizadaEm: linha.performed_at,
    resultado: linha.result,
    rotuloDoResultado: ROTULO_DO_RESULTADO[linha.result],
    resumo: linha.result_summary,
    limitacoes: linha.known_limitations,
    evidenciaId: linha.evidence_document_id,
    origem,
    rotuloDaOrigem: ROTULO_DA_ORIGEM[origem],
  };
}

/** Linha do banco em formato da tela; `null` se o banco devolver valor fora do domínio. */
function paraCategoria(
  linha: LinhaDoBanco,
  consultas: readonly LinhaDaConsulta[],
  revisaoAberta: boolean,
): EstadoDaCategoria | null {
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
    consultas: consultas.map(paraConsulta),
    revisaoAberta,
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

      // A RLS das tabelas abaixo é a mesma da oferta: quem passou acima lê.
      const [consultas, revisoes, impedimentos] = await Promise.all([
        dependencias.sessao
          .from("vehicle_checks")
          .select(
            "id, seq, category, source_name, source_type, performed_at, result, result_summary, known_limitations, evidence_document_id, recorded_as, supersedes_check_id",
          )
          .eq("offer_id", ofertaId)
          .overrideTypes<LinhaDaConsulta[], { merge: false }>(),
        dependencias.sessao
          .from("documental_reviews")
          .select("category, action, seq")
          .eq("offer_id", ofertaId)
          .order("seq", { ascending: true })
          .overrideTypes<
            { category: string; action: string; seq: number }[],
            { merge: false }
          >(),
        dependencias.sessao
          .from("transfer_impediments")
          .select("id, basis, status, identified_at, resolved_at")
          .eq("offer_id", ofertaId)
          .order("identified_at", { ascending: true })
          .overrideTypes<LinhaDoImpedimento[], { merge: false }>(),
      ]);
      if (consultas.error !== null) return traduzirErroDoBanco(consultas.error);
      if (revisoes.error !== null) return traduzirErroDoBanco(revisoes.error);
      if (impedimentos.error !== null) {
        return traduzirErroDoBanco(impedimentos.error);
      }
      const ultimaAcao = new Map<string, string>();
      for (const revisao of revisoes.data) {
        ultimaAcao.set(revisao.category, revisao.action);
      }

      const categorias: EstadoDaCategoria[] = [];
      for (const linha of linhas) {
        const categoria = paraCategoria(
          linha,
          vigentes(
            consultas.data.filter(
              (consulta) => consulta.category === linha.category,
            ),
          ),
          ultimaAcao.get(linha.category) === "open_review",
        );
        if (categoria === null) return falha("falha");
        categorias.push(categoria);
      }
      const estados = categorias.map((categoria) => categoria.estado);
      const listaDeImpedimentos = impedimentos.data.map(
        (impedimento): ImpedimentoDaOferta => ({
          id: impedimento.id,
          base: impedimento.basis,
          ativo: impedimento.status === "identified",
          identificadoEm: impedimento.identified_at,
          resolvidoEm: impedimento.resolved_at,
        }),
      );
      // As mesmas ressalvas do snapshot, em ordem de código.
      const codigos: CodigoDoAviso[] = avisosDosEstados(estados);
      if (listaDeImpedimentos.some((impedimento) => impedimento.ativo)) {
        codigos.push(AVISO_DO_IMPEDIMENTO);
        codigos.sort();
      }
      return sucesso({
        categorias,
        impedimentos: listaDeImpedimentos,
        avisos: codigos.map((codigo) => ({
          codigo,
          texto: textoDoAviso(codigo),
        })),
        resumo: resumoProporcional(estados),
      });
    },
  );
}
