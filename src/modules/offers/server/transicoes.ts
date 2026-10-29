/**
 * Transições da oferta (especificação v1.1, §6.2 e §8 `publishOffer`,
 * `withdrawOffer` e `suspendOffer`; ADR-0003 §2.3, §2.10 e §2.15, com as
 * operações novas da B32).
 *
 * Cada operação faz só as transições dela, pela tabela de
 * `rules/transicoes.ts`. O servidor confere antes o par de estados, o ator,
 * a D10 e o motivo, para responder com erro previsível; o gatilho
 * `private.proteger_oferta` decide de novo, com a sessão do usuário. O motivo
 * vai no cabeçalho `x-audit-reason`, e o gatilho o copia para a coluna que o
 * fornecedor vê.
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
import { executarOperacao } from "@/modules/auth/server/operacao";
import type { ContextoDoUsuario } from "@/modules/auth/tipos";
import { mensagemDasPendencias } from "../rules/oferta";
import {
  ROTULO_DO_STATUS,
  TRANSICOES,
  atorDaOferta,
  motivoObrigatorio,
  transicaoDaOferta,
  transicoesEntre,
  type IdDaTransicao,
  type StatusDaOferta,
} from "../rules/transicoes";
import {
  esquemaDaOferta,
  esquemaDaPublicacao,
  esquemaDaReativacao,
  esquemaDaRetirada,
  esquemaDaRevisao,
  esquemaDaSuspensao,
} from "../schemas/ofertas";
import { lerOferta, revisaoExigida, type OfertaLida } from "./leitura";
import { estadoMudou, lerPendencias } from "./ofertas";

export interface MudancaDeStatus {
  readonly ofertaId: string;
  readonly status: StatusDaOferta;
}

interface PedidoDeTransicao {
  readonly ofertaId: string;
  readonly para: StatusDaOferta;
  /** As transições desta operação; as demais da tabela são de outras. */
  readonly permitidas: readonly IdDaTransicao[];
  readonly motivo?: string;
  /** Colunas que acompanham a transição: autorização de divulgação, categoria da suspensão. */
  readonly colunas?: Readonly<Record<string, string>>;
  /** Valor da D10 já lido pela operação. */
  readonly revisaoExigida?: boolean;
  /** Conferência própria da operação, depois do ator e antes da escrita. */
  readonly conferirAntes?: (oferta: OfertaLida) => Promise<Falha | null>;
}

function motivoAusente(): Falha {
  return {
    ...falha("entrada_invalida"),
    campos: { motivo: ["Informe o motivo."] },
  };
}

function validadeVencida(validaAte: string | null): boolean {
  return validaAte !== null && Date.parse(validaAte) <= Date.now();
}

async function mudarStatus(
  dependencias: Dependencias,
  contexto: ContextoDoUsuario,
  pedido: PedidoDeTransicao,
): Promise<Resultado<MudancaDeStatus>> {
  const lida = await lerOferta(dependencias, pedido.ofertaId);
  if (!lida.ok) return lida;
  const oferta = lida.dados;
  const ator = atorDaOferta(contexto, oferta.empresaId);

  const candidatas = transicoesEntre(oferta.status, pedido.para).filter(
    (transicao) => pedido.permitidas.includes(transicao.id),
  );
  if (!candidatas.some((transicao) => transicao.quem.includes(ator))) {
    // Sem papel para a ação em nenhum estado: "sem permissão". Com papel,
    // mas no estado errado: regra.
    const temPapel = TRANSICOES.some(
      (transicao) =>
        pedido.permitidas.includes(transicao.id) &&
        transicao.quem.includes(ator),
    );
    return temPapel
      ? falha(
          "regra_violada",
          `Esta ação não vale para oferta em "${ROTULO_DO_STATUS[oferta.status]}".`,
        )
      : falha("sem_permissao");
  }

  let revisao = pedido.revisaoExigida;
  if (
    revisao === undefined &&
    candidatas.some((transicao) => transicao.revisaoExigida !== undefined)
  ) {
    const lidaDaConfiguracao = await revisaoExigida(dependencias);
    if (lidaDaConfiguracao === null) return falha("falha");
    revisao = lidaDaConfiguracao;
  }
  const transicao = transicaoDaOferta(oferta.status, pedido.para, ator, {
    revisaoExigida: revisao ?? true,
    validadeVencida: validadeVencida(oferta.validaAte),
  });
  if (transicao === undefined || !pedido.permitidas.includes(transicao.id)) {
    return falha("regra_violada");
  }
  if (motivoObrigatorio(transicao, ator) && pedido.motivo === undefined) {
    return motivoAusente();
  }
  const recusa = await pedido.conferirAntes?.(oferta);
  if (recusa) return recusa;

  const { data, error } = await comRastreio(
    dependencias.sessao
      .from("offers")
      .update({ status: pedido.para, ...pedido.colunas })
      .eq("id", oferta.id)
      .eq("status", oferta.status)
      .select("id"),
    dependencias.requestId,
    pedido.motivo,
  ).overrideTypes<{ id: string }[], { merge: false }>();
  if (error !== null) return traduzirErroDoBanco(error);
  if (data.length === 0) return estadoMudou();
  return sucesso({ ofertaId: oferta.id, status: pedido.para });
}

/** A oferta precisa estar completa; a lista vem do banco, a mesma do gatilho. */
async function semPendencias(
  dependencias: Dependencias,
  oferta: OfertaLida,
): Promise<Falha | null> {
  const pendencias = await lerPendencias(dependencias, oferta.id);
  if (!pendencias.ok) return pendencias;
  return pendencias.dados.length === 0
    ? null
    : falha("regra_violada", mensagemDasPendencias(pendencias.dados));
}

/**
 * `publishOffer`: o `org_admin` envia à revisão (D10 exigida, T03) ou publica
 * direto (T06), declarando a autorização de divulgação. Pendência documental
 * não impede; falta de dado obrigatório, sim (§6.2).
 */
export function publicarOferta(
  dependencias: Dependencias,
  entrada: unknown,
): Promise<Resultado<MudancaDeStatus>> {
  return executarOperacao(
    dependencias,
    esquemaDaPublicacao,
    entrada,
    async ({ ofertaId }, contexto) => {
      const revisao = await revisaoExigida(dependencias);
      if (revisao === null) return falha("falha");
      return mudarStatus(dependencias, contexto, {
        ofertaId,
        para: revisao ? "under_review" : "published",
        permitidas: ["T03", "T06"],
        revisaoExigida: revisao,
        colunas: { publication_authorized_by: contexto.perfilId },
        conferirAntes: (oferta) => semPendencias(dependencias, oferta),
      });
    },
  );
}

/** `cancelReview` (T18): o fornecedor tira a oferta da revisão para editar. */
export function cancelarRevisao(
  dependencias: Dependencias,
  entrada: unknown,
): Promise<Resultado<MudancaDeStatus>> {
  return executarOperacao(
    dependencias,
    esquemaDaOferta,
    entrada,
    ({ ofertaId }, contexto) =>
      mudarStatus(dependencias, contexto, {
        ofertaId,
        para: "draft",
        permitidas: ["T18"],
      }),
  );
}

/**
 * `reviewOffer`: o operador ou o administrador publica a oferta revisada
 * (T04) ou a devolve ao rascunho com motivo (T05). Pendência documental
 * nunca justifica a devolução (X07).
 */
export function revisarOferta(
  dependencias: Dependencias,
  entrada: unknown,
): Promise<Resultado<MudancaDeStatus>> {
  return executarOperacao(
    dependencias,
    esquemaDaRevisao,
    entrada,
    ({ ofertaId, decisao, motivo }, contexto) =>
      decisao === "publicar"
        ? mudarStatus(dependencias, contexto, {
            ofertaId,
            para: "published",
            permitidas: ["T04"],
            motivo,
            conferirAntes: (oferta) => semPendencias(dependencias, oferta),
          })
        : mudarStatus(dependencias, contexto, {
            ofertaId,
            para: "draft",
            permitidas: ["T05"],
            motivo,
          }),
  );
}

/** `reserveOffer` (T08): `org_admin` da empresa dona ou staff. */
export function reservarOferta(
  dependencias: Dependencias,
  entrada: unknown,
): Promise<Resultado<MudancaDeStatus>> {
  return executarOperacao(
    dependencias,
    esquemaDaOferta,
    entrada,
    ({ ofertaId }, contexto) =>
      mudarStatus(dependencias, contexto, {
        ofertaId,
        para: "reserved",
        permitidas: ["T08"],
      }),
  );
}

/** `releaseReservation` (T09): a reservada volta a publicada. */
export function liberarReserva(
  dependencias: Dependencias,
  entrada: unknown,
): Promise<Resultado<MudancaDeStatus>> {
  return executarOperacao(
    dependencias,
    esquemaDaOferta,
    entrada,
    ({ ofertaId }, contexto) =>
      mudarStatus(dependencias, contexto, {
        ofertaId,
        para: "published",
        permitidas: ["T09"],
      }),
  );
}

/**
 * `withdrawOffer` (T11): o `org_admin` retira, com motivo opcional; a
 * plataforma retira só com motivo.
 */
export function retirarOferta(
  dependencias: Dependencias,
  entrada: unknown,
): Promise<Resultado<MudancaDeStatus>> {
  return executarOperacao(
    dependencias,
    esquemaDaRetirada,
    entrada,
    ({ ofertaId, motivo }, contexto) =>
      mudarStatus(dependencias, contexto, {
        ofertaId,
        para: "withdrawn",
        permitidas: ["T11"],
        motivo,
      }),
  );
}

/**
 * `reopenOffer` (T19 e T13): a retirada ou a vencida volta a rascunho, pelo
 * `org_admin`. Renovar a vencida é reabrir e publicar de novo.
 */
export function reabrirOferta(
  dependencias: Dependencias,
  entrada: unknown,
): Promise<Resultado<MudancaDeStatus>> {
  return executarOperacao(
    dependencias,
    esquemaDaOferta,
    entrada,
    ({ ofertaId }, contexto) =>
      mudarStatus(dependencias, contexto, {
        ofertaId,
        para: "draft",
        permitidas: ["T13", "T19"],
      }),
  );
}

/**
 * `suspendOffer` (T14): só a plataforma, com a categoria da §6.10 e o motivo.
 * O fornecedor passa a só ler a oferta.
 */
export function suspenderOferta(
  dependencias: Dependencias,
  entrada: unknown,
): Promise<Resultado<MudancaDeStatus>> {
  return executarOperacao(
    dependencias,
    esquemaDaSuspensao,
    entrada,
    ({ ofertaId, categoria, motivo }, contexto) =>
      mudarStatus(dependencias, contexto, {
        ofertaId,
        para: "suspended",
        permitidas: ["T14"],
        motivo,
        colunas: { suspended_category: categoria },
      }),
  );
}

/**
 * `reactivateOffer` (T15): só o administrador, com motivo; a oferta volta a
 * rascunho e passa de novo pelos requisitos para publicar.
 */
export function reativarOferta(
  dependencias: Dependencias,
  entrada: unknown,
): Promise<Resultado<MudancaDeStatus>> {
  return executarOperacao(
    dependencias,
    esquemaDaReativacao,
    entrada,
    ({ ofertaId, motivo }, contexto) =>
      mudarStatus(dependencias, contexto, {
        ofertaId,
        para: "draft",
        permitidas: ["T15"],
        motivo,
      }),
  );
}
