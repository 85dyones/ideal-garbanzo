/**
 * Leituras da oferta para as telas administrativas (I2.9), sempre com o
 * cliente da sessão de quem vê a tela: a RLS decide o que volta (ADR-0003
 * §2.14). O administrador e o operador leem as ofertas de todas as empresas,
 * com veículo, versões, declarações, fotos, documentos (só a linha) e
 * revisões; o `field_history`, só com a regra da auditoria. A chave secreta
 * não entra aqui.
 *
 * Falha de leitura lança erro, que a tela mostra como erro genérico.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StatusDaOferta } from "../rules/transicoes";
import type { Veiculo } from "./ofertas";

export const LIMITE_DA_LISTA_DA_PLATAFORMA = 200;

export interface OfertaNaLista {
  readonly id: string;
  readonly status: StatusDaOferta;
  readonly empresaId: string;
  /** Nome da empresa dona; `null` se a sessão não ler a empresa. */
  readonly nomeDaEmpresa: string | null;
  readonly veiculo: Pick<
    Veiculo,
    "marca" | "modelo" | "versao" | "anoDeFabricacao" | "anoDoModelo"
  > | null;
  readonly versaoAtual: number | null;
  readonly publicadaEm: string | null;
  readonly suspensaEm: string | null;
  readonly retiradaEm: string | null;
  readonly validaAte: string | null;
  readonly atualizadaEm: string;
  readonly dadosDeTeste: boolean;
}

interface LinhaDaLista {
  id: string;
  status: StatusDaOferta;
  supplier_organization_id: string;
  current_version: number | null;
  published_at: string | null;
  suspended_at: string | null;
  withdrawn_at: string | null;
  valid_until: string | null;
  updated_at: string;
  is_test: boolean;
  empresa: { name: string } | null;
  veiculo: {
    make: string | null;
    model: string | null;
    version: string | null;
    manufacture_year: number | null;
    model_year: number | null;
  } | null;
}

/**
 * Ofertas de todas as empresas, com filtro opcional de status. A lista não
 * traz placa, RENAVAM nem chassi: eles ficam no detalhe. Na fila de revisão,
 * a oferta que espera há mais tempo vem primeiro; nas demais, a atualizada
 * por último.
 */
export async function listarOfertasDaPlataforma(
  sessao: SupabaseClient,
  status: StatusDaOferta | null,
): Promise<OfertaNaLista[]> {
  let consulta = sessao
    .from("offers")
    .select(
      "id, status, supplier_organization_id, current_version, published_at, suspended_at, withdrawn_at, valid_until, updated_at, is_test, empresa:organizations!supplier_organization_id(name), veiculo:vehicles(make, model, version, manufacture_year, model_year)",
    )
    .order("updated_at", { ascending: status === "under_review" })
    .limit(LIMITE_DA_LISTA_DA_PLATAFORMA);
  if (status !== null) consulta = consulta.eq("status", status);
  const { data, error } = await consulta.overrideTypes<
    LinhaDaLista[],
    { merge: false }
  >();
  if (error !== null) throw new Error("Falha ao ler as ofertas.");
  return data.map((linha) => ({
    id: linha.id,
    status: linha.status,
    empresaId: linha.supplier_organization_id,
    nomeDaEmpresa: linha.empresa?.name ?? null,
    veiculo:
      linha.veiculo === null
        ? null
        : {
            marca: linha.veiculo.make,
            modelo: linha.veiculo.model,
            versao: linha.veiculo.version,
            anoDeFabricacao: linha.veiculo.manufacture_year,
            anoDoModelo: linha.veiculo.model_year,
          },
    versaoAtual: linha.current_version,
    publicadaEm: linha.published_at,
    suspensaEm: linha.suspended_at,
    retiradaEm: linha.withdrawn_at,
    validaAte: linha.valid_until,
    atualizadaEm: linha.updated_at,
    dadosDeTeste: linha.is_test,
  }));
}

/** Quantas ofertas esperam a revisão da plataforma. */
export async function contarOfertasEmRevisao(
  sessao: SupabaseClient,
): Promise<number> {
  const { count, error } = await sessao
    .from("offers")
    .select("id", { count: "exact", head: true })
    .eq("status", "under_review");
  if (error !== null) throw new Error("Falha ao contar a fila de revisão.");
  return count ?? 0;
}

export interface RevisaoNaPlataforma {
  readonly id: string;
  readonly decisao: "published" | "returned";
  readonly motivo: string | null;
  readonly revisadaEm: string;
  /** Quem decidiu, da equipe da plataforma. */
  readonly revisadaPor: string;
  readonly versao: number | null;
}

/** Decisões da revisão, da mais recente à mais antiga, com quem decidiu. */
export async function listarRevisoesDaPlataforma(
  sessao: SupabaseClient,
  ofertaId: string,
): Promise<RevisaoNaPlataforma[]> {
  const { data, error } = await sessao
    .from("offer_reviews")
    .select(
      "id, decision, reason, reviewed_at, reviewed_by, versao:offer_versions(version_number)",
    )
    .eq("offer_id", ofertaId)
    .order("reviewed_at", { ascending: false })
    .limit(LIMITE_DA_LISTA_DA_PLATAFORMA)
    .overrideTypes<
      {
        id: string;
        decision: "published" | "returned";
        reason: string | null;
        reviewed_at: string;
        reviewed_by: string;
        versao: { version_number: number } | null;
      }[],
      { merge: false }
    >();
  if (error !== null) throw new Error("Falha ao ler as revisões da oferta.");
  return data.map((linha) => ({
    id: linha.id,
    decisao: linha.decision,
    motivo: linha.reason,
    revisadaEm: linha.reviewed_at,
    revisadaPor: linha.reviewed_by,
    versao: linha.versao?.version_number ?? null,
  }));
}
