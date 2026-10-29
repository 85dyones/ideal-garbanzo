/**
 * Conteúdo da oferta (especificação v1.1, §8 `createOffer`, `updateOffer`,
 * `declareCategory` e `confirmAvailability`; ADR-0003 §2.5, §2.6, §2.9,
 * §2.12 e §2.15).
 *
 * - Toda escrita usa a sessão do usuário. Uma chamada direta à API com o
 *   mesmo token tem o mesmo efeito, porque quem decide é o banco (CT12.6).
 * - Criar e alterar passam pelas RPCs `criar_oferta` e `atualizar_oferta`,
 *   para veículo e oferta caberem numa transação e numa versão só.
 * - O servidor confere antes, sobre o contexto lido do banco, quem edita em
 *   cada estado (`podeEditarConteudo`): o staff não cria nem edita conteúdo
 *   (Q3), e o `member` só prepara o rascunho (Q2).
 */
import type { Dependencias } from "@/lib/operacao/dependencias";
import {
  falha,
  sucesso,
  traduzirErroDoBanco,
  type Falha,
  type Resultado,
} from "@/lib/operacao/resultado";
import { comRastreio } from "@/modules/audit/server/rastreio";
import { vinculoAtivo } from "@/modules/auth/rules/permissoes";
import { executarOperacao } from "@/modules/auth/server/operacao";
import type { ContextoDoUsuario } from "@/modules/auth/tipos";
import {
  podeConfirmarDisponibilidade,
  podeEditarConteudo,
} from "../rules/edicao";
import { fimDoDiaEmBrasilia, rotuloDaPendencia } from "../rules/oferta";
import {
  ROTULO_DO_STATUS,
  atorDaOferta,
  type AtorDaOferta,
  type StatusDaOferta,
} from "../rules/transicoes";
import {
  esquemaDaAlteracao,
  esquemaDaCriacao,
  esquemaDaDeclaracao,
  esquemaDaOferta,
  type DadosDaOferta,
  type DadosDoVeiculo,
} from "../schemas/ofertas";
import { lerOferta, type OfertaLida } from "./leitura";

const COLUNA_DO_VEICULO = {
  marca: "make",
  modelo: "model",
  versao: "version",
  anoDeFabricacao: "manufacture_year",
  anoDoModelo: "model_year",
  quilometragem: "mileage_km",
  combustivel: "fuel_type",
  cambio: "transmission",
  cor: "color",
  carroceria: "body_type",
  placa: "plate",
  renavam: "renavam",
  chassi: "chassis",
} as const satisfies Record<keyof DadosDoVeiculo, string>;

/** Só os campos informados, com o nome da coluna. */
function colunasDoVeiculo(
  dados: DadosDoVeiculo | undefined,
): Record<string, string | number> {
  const colunas: Record<string, string | number> = {};
  for (const [campo, coluna] of Object.entries(COLUNA_DO_VEICULO)) {
    const valor = dados?.[campo as keyof DadosDoVeiculo];
    if (valor !== undefined) colunas[coluna] = valor;
  }
  return colunas;
}

function colunasDaOferta(
  dados: DadosDaOferta | undefined,
): Record<string, string> {
  const colunas: Record<string, string> = {};
  if (dados?.preco !== undefined) colunas.asking_price = dados.preco;
  if (dados?.condicoesComerciais !== undefined) {
    colunas.commercial_conditions = dados.condicoesComerciais;
  }
  if (dados?.cidade !== undefined) colunas.location_city = dados.cidade;
  if (dados?.uf !== undefined) colunas.location_state = dados.uf;
  if (dados?.validaAte !== undefined) {
    colunas.valid_until = fimDoDiaEmBrasilia(dados.validaAte);
  }
  return colunas;
}

/** Recusa da edição: o papel errado é "sem permissão"; o estado errado, regra. */
function edicaoRecusada(status: StatusDaOferta, ator: AtorDaOferta): Falha {
  if (ator === "membro" && (status === "published" || status === "reserved")) {
    return falha(
      "sem_permissao",
      "Só o administrador da empresa altera oferta publicada ou reservada.",
    );
  }
  if (ator !== "membro" && ator !== "adm_empresa")
    return falha("sem_permissao");
  return falha(
    "regra_violada",
    `A oferta em "${ROTULO_DO_STATUS[status]}" não pode ser editada.`,
  );
}

/** A oferta que a sessão lê, se o ator pode editar o conteúdo no estado dela. */
async function ofertaEditavel(
  dependencias: Dependencias,
  contexto: ContextoDoUsuario,
  ofertaId: string,
): Promise<Resultado<OfertaLida>> {
  const oferta = await lerOferta(dependencias, ofertaId);
  if (!oferta.ok) return oferta;
  const quem = atorDaOferta(contexto, oferta.dados.empresaId);
  if (!podeEditarConteudo(oferta.dados.status, quem)) {
    return edicaoRecusada(oferta.dados.status, quem);
  }
  return oferta;
}

/** `createOffer`: veículo e oferta em rascunho, numa transação; versão 1. */
export function criarOferta(
  dependencias: Dependencias,
  entrada: unknown,
): Promise<Resultado<{ ofertaId: string }>> {
  return executarOperacao(
    dependencias,
    esquemaDaCriacao,
    entrada,
    async ({ empresaId, veiculo, oferta }, contexto) => {
      // Só o fornecedor cria (Q3): vínculo ativo com a empresa ativa.
      const vinculo = vinculoAtivo(contexto, empresaId);
      if (vinculo === undefined) return falha("sem_permissao");
      if (vinculo.empresa?.kind === "buyer") {
        return falha("regra_violada", "A empresa não é fornecedora.");
      }
      const resposta = await comRastreio(
        dependencias.sessao.rpc("criar_oferta", {
          p_empresa: empresaId,
          p_veiculo: colunasDoVeiculo(veiculo),
          p_oferta: colunasDaOferta(oferta),
        }),
        dependencias.requestId,
      );
      if (resposta.error !== null) return traduzirErroDoBanco(resposta.error);
      const ofertaId: unknown = resposta.data;
      if (typeof ofertaId !== "string") return falha("falha");
      return sucesso({ ofertaId });
    },
  );
}

/**
 * `updateOffer`: veículo e oferta numa transação, com no máximo uma versão.
 * Também estende a validade. Mudança material gera versão; toda mudança gera
 * histórico (ADR-0003 §2.6 e §2.8).
 */
export function atualizarOferta(
  dependencias: Dependencias,
  entrada: unknown,
): Promise<Resultado<{ ofertaId: string }>> {
  return executarOperacao(
    dependencias,
    esquemaDaAlteracao,
    entrada,
    async ({ ofertaId, veiculo, oferta }, contexto) => {
      const editavel = await ofertaEditavel(dependencias, contexto, ofertaId);
      if (!editavel.ok) return editavel;
      const resposta = await comRastreio(
        dependencias.sessao.rpc("atualizar_oferta", {
          p_oferta: ofertaId,
          p_veiculo: colunasDoVeiculo(veiculo),
          p_dados: colunasDaOferta(oferta),
        }),
        dependencias.requestId,
      );
      if (resposta.error !== null) return traduzirErroDoBanco(resposta.error);
      return sucesso({ ofertaId });
    },
  );
}

/**
 * `declareCategory`: declaração do fornecedor numa categoria, como linha nova;
 * a mais recente é a vigente (§5.3). Só o fornecedor declara (B5).
 */
export function declararCategoria(
  dependencias: Dependencias,
  entrada: unknown,
): Promise<Resultado<{ declaracaoId: string }>> {
  return executarOperacao(
    dependencias,
    esquemaDaDeclaracao,
    entrada,
    async ({ ofertaId, categoria, valor, detalhe }, contexto) => {
      const editavel = await ofertaEditavel(dependencias, contexto, ofertaId);
      if (!editavel.ok) return editavel;
      const { data, error } = await comRastreio(
        dependencias.sessao
          .from("supplier_declarations")
          .insert({
            offer_id: ofertaId,
            category: categoria,
            declared_value: valor,
            detail: detalhe ?? null,
          })
          .select("id")
          .single(),
        dependencias.requestId,
      ).overrideTypes<{ id: string }, { merge: false }>();
      if (error !== null) return traduzirErroDoBanco(error);
      return sucesso({ declaracaoId: data.id });
    },
  );
}

export interface Pendencia {
  readonly codigo: string;
  readonly rotulo: string;
}

/**
 * O que falta para enviar ou publicar, calculado pelo banco
 * (`private.pendencias_de_publicacao`), a mesma função que o gatilho usa ao
 * recusar. Lista vazia: a oferta pode seguir. Pendência documental nunca
 * entra na lista (§1.4.1).
 */
export function consultarPendenciasDePublicacao(
  dependencias: Dependencias,
  entrada: unknown,
): Promise<Resultado<{ pendencias: readonly Pendencia[] }>> {
  return executarOperacao(
    dependencias,
    esquemaDaOferta,
    entrada,
    async ({ ofertaId }) => {
      const pendencias = await lerPendencias(dependencias, ofertaId);
      if (!pendencias.ok) return pendencias;
      return sucesso({
        pendencias: pendencias.dados.map((codigo) => ({
          codigo,
          rotulo: rotuloDaPendencia(codigo),
        })),
      });
    },
  );
}

/** Códigos das pendências, pela RPC com a sessão (a RLS decide quem lê). */
export async function lerPendencias(
  dependencias: Dependencias,
  ofertaId: string,
): Promise<Resultado<readonly string[]>> {
  const resposta = await dependencias.sessao.rpc("pendencias_de_publicacao", {
    p_oferta: ofertaId,
  });
  if (resposta.error !== null) return traduzirErroDoBanco(resposta.error);
  const lista: unknown = resposta.data;
  if (
    !Array.isArray(lista) ||
    !lista.every((item) => typeof item === "string")
  ) {
    return falha("falha");
  }
  return sucesso(lista);
}

/**
 * `confirmAvailability`: qualquer F, na oferta publicada ou reservada. O
 * banco grava a própria hora, qualquer que seja o valor enviado; gera
 * histórico, não gera versão e não mexe na validade (ADR-0003 §2.9).
 */
export function confirmarDisponibilidade(
  dependencias: Dependencias,
  entrada: unknown,
): Promise<Resultado<{ confirmadaEm: string }>> {
  return executarOperacao(
    dependencias,
    esquemaDaOferta,
    entrada,
    async ({ ofertaId }, contexto) => {
      const oferta = await lerOferta(dependencias, ofertaId);
      if (!oferta.ok) return oferta;
      const ator = atorDaOferta(contexto, oferta.dados.empresaId);
      if (ator !== "membro" && ator !== "adm_empresa") {
        return falha("sem_permissao");
      }
      if (!podeConfirmarDisponibilidade(oferta.dados.status, ator)) {
        return falha(
          "regra_violada",
          "A disponibilidade se confirma em oferta publicada ou reservada.",
        );
      }
      const { data, error } = await comRastreio(
        dependencias.sessao
          .from("offers")
          .update({ availability_confirmed_at: new Date().toISOString() })
          .eq("id", ofertaId)
          .in("status", ["published", "reserved"])
          .select("availability_confirmed_at"),
        dependencias.requestId,
      ).overrideTypes<
        { availability_confirmed_at: string }[],
        { merge: false }
      >();
      if (error !== null) return traduzirErroDoBanco(error);
      const confirmada = data[0];
      if (confirmada === undefined) return estadoMudou();
      return sucesso({ confirmadaEm: confirmada.availability_confirmed_at });
    },
  );
}

/** A oferta mudou de estado entre a leitura e a escrita. */
export function estadoMudou(): Falha {
  return falha(
    "regra_violada",
    "A oferta mudou de estado durante a ação. Atualize e tente de novo.",
  );
}
