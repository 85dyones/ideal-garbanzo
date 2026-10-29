/**
 * Leituras da oferta para as telas do fornecedor (I2.8), sempre com o cliente
 * da sessão de quem vê a tela: a RLS decide o que volta (ADR-0003 §2.14). A
 * empresa dona lê as próprias ofertas, com veículo, versões, declarações,
 * fotos, documentos (só a linha), revisões e o `field_history`; outra empresa
 * não lê nada. Oferta alheia e inexistente voltam iguais: `null`.
 *
 * Falha de leitura lança erro, que a tela mostra como erro genérico.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Dependencias } from "@/lib/operacao/dependencias";
import { consultarEstadosDocumentais } from "@/modules/documental/server/estados";
import type { EstadosDaOferta } from "@/modules/documental/server/estados";
import type { CategoriaDaSuspensao } from "../rules/oferta";
import { STATUS_DA_OFERTA, type StatusDaOferta } from "../rules/transicoes";
import {
  consultarPendenciasDePublicacao,
  type Pendencia,
} from "../server/ofertas";
import { gerarUrlDaFoto } from "../storage/servidor";
import type { TipoDeDocumento } from "../storage/arquivos";

const LIMITE_DA_LISTA = 200;
const LIMITE_DO_HISTORICO = 300;

export function ehStatusDaOferta(valor: unknown): valor is StatusDaOferta {
  return STATUS_DA_OFERTA.some((status) => status === valor);
}

/** Status em que a oferta segue em andamento (para o aviso de placa repetida). */
const STATUS_EM_ANDAMENTO: readonly StatusDaOferta[] = [
  "draft",
  "under_review",
  "published",
  "reserved",
];

export interface Veiculo {
  readonly id: string;
  readonly marca: string | null;
  readonly modelo: string | null;
  readonly versao: string | null;
  readonly anoDeFabricacao: number | null;
  readonly anoDoModelo: number | null;
  readonly quilometragem: number | null;
  readonly combustivel: string | null;
  readonly cambio: string | null;
  readonly cor: string | null;
  readonly carroceria: string | null;
  /** Placa, RENAVAM e chassi: só a empresa dona e a equipe leem (§5.2). */
  readonly placa: string | null;
  readonly renavam: string | null;
  readonly chassi: string | null;
}

interface LinhaDoVeiculo {
  id: string;
  make: string | null;
  model: string | null;
  version: string | null;
  manufacture_year: number | null;
  model_year: number | null;
  mileage_km: number | null;
  fuel_type: string | null;
  transmission: string | null;
  color: string | null;
  body_type: string | null;
  plate: string | null;
  renavam: string | null;
  chassis: string | null;
}

const COLUNAS_DO_VEICULO =
  "id, make, model, version, manufacture_year, model_year, mileage_km, fuel_type, transmission, color, body_type, plate, renavam, chassis";

function paraVeiculo(linha: LinhaDoVeiculo): Veiculo {
  return {
    id: linha.id,
    marca: linha.make,
    modelo: linha.model,
    versao: linha.version,
    anoDeFabricacao: linha.manufacture_year,
    anoDoModelo: linha.model_year,
    quilometragem: linha.mileage_km,
    combustivel: linha.fuel_type,
    cambio: linha.transmission,
    cor: linha.color,
    carroceria: linha.body_type,
    placa: linha.plate,
    renavam: linha.renavam,
    chassi: linha.chassis,
  };
}

// --- Painel ---------------------------------------------------------------------

export interface ResumoDaOferta {
  readonly id: string;
  readonly status: StatusDaOferta;
  readonly veiculo: Pick<
    Veiculo,
    "marca" | "modelo" | "versao" | "anoDeFabricacao" | "anoDoModelo" | "placa"
  > | null;
  /** Preço como texto do banco ("65000.00"), sem passar por ponto flutuante. */
  readonly preco: string | null;
  readonly validaAte: string | null;
  readonly versaoAtual: number | null;
  readonly suspensaEm: string | null;
  readonly atualizadaEm: string;
}

interface LinhaDoResumo {
  id: string;
  status: StatusDaOferta;
  asking_price: string | null;
  valid_until: string | null;
  current_version: number | null;
  suspended_at: string | null;
  updated_at: string;
  veiculo: Pick<
    LinhaDoVeiculo,
    "make" | "model" | "version" | "manufacture_year" | "model_year" | "plate"
  > | null;
}

/** Ofertas da empresa, da mais recente à mais antiga, com filtro opcional de status. */
export async function listarOfertasDaEmpresa(
  sessao: SupabaseClient,
  empresaId: string,
  status: StatusDaOferta | null,
): Promise<ResumoDaOferta[]> {
  let consulta = sessao
    .from("offers")
    .select(
      "id, status, asking_price::text, valid_until, current_version, suspended_at, updated_at, veiculo:vehicles(make, model, version, manufacture_year, model_year, plate)",
    )
    .eq("supplier_organization_id", empresaId)
    .order("updated_at", { ascending: false })
    .limit(LIMITE_DA_LISTA);
  if (status !== null) consulta = consulta.eq("status", status);
  const { data, error } = await consulta.overrideTypes<
    LinhaDoResumo[],
    { merge: false }
  >();
  if (error !== null) throw new Error("Falha ao ler as ofertas da empresa.");
  return data.map((linha) => ({
    id: linha.id,
    status: linha.status,
    veiculo:
      linha.veiculo === null
        ? null
        : {
            marca: linha.veiculo.make,
            modelo: linha.veiculo.model,
            versao: linha.veiculo.version,
            anoDeFabricacao: linha.veiculo.manufacture_year,
            anoDoModelo: linha.veiculo.model_year,
            placa: linha.veiculo.plate,
          },
    preco: linha.asking_price,
    validaAte: linha.valid_until,
    versaoAtual: linha.current_version,
    suspensaEm: linha.suspended_at,
    atualizadaEm: linha.updated_at,
  }));
}

// --- Oferta ---------------------------------------------------------------------

export interface Oferta {
  readonly id: string;
  readonly empresaId: string;
  readonly status: StatusDaOferta;
  readonly veiculo: Veiculo;
  readonly preco: string | null;
  readonly condicoesComerciais: string | null;
  readonly cidade: string | null;
  readonly uf: string | null;
  readonly validaAte: string | null;
  readonly publicadaEm: string | null;
  readonly disponibilidadeConfirmadaEm: string | null;
  readonly autorizacaoDeclaradaEm: string | null;
  readonly versaoAtual: number | null;
  readonly retiradaEm: string | null;
  readonly motivoDaRetirada: string | null;
  readonly categoriaDaSuspensao: CategoriaDaSuspensao | null;
  readonly motivoDaSuspensao: string | null;
  readonly suspensaEm: string | null;
  readonly dadosDeTeste: boolean;
  readonly criadaPor: string;
  readonly criadaEm: string;
  readonly atualizadaEm: string;
}

interface LinhaDaOferta {
  id: string;
  supplier_organization_id: string;
  status: StatusDaOferta;
  asking_price: string | null;
  commercial_conditions: string | null;
  location_city: string | null;
  location_state: string | null;
  valid_until: string | null;
  published_at: string | null;
  availability_confirmed_at: string | null;
  publication_authorized_at: string | null;
  current_version: number | null;
  withdrawn_at: string | null;
  withdrawn_reason: string | null;
  suspended_category: CategoriaDaSuspensao | null;
  suspended_reason: string | null;
  suspended_at: string | null;
  is_test: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  veiculo: LinhaDoVeiculo | null;
}

const COLUNAS_DA_OFERTA = `id, supplier_organization_id, status, asking_price::text, commercial_conditions, location_city, location_state, valid_until, published_at, availability_confirmed_at, publication_authorized_at, current_version, withdrawn_at, withdrawn_reason, suspended_category, suspended_reason, suspended_at, is_test, created_by, created_at, updated_at, veiculo:vehicles(${COLUNAS_DO_VEICULO})`;

/** A oferta com o veículo; `null` se não existe ou se a RLS não mostra. */
export async function obterOferta(
  sessao: SupabaseClient,
  ofertaId: string,
): Promise<Oferta | null> {
  const { data, error } = await sessao
    .from("offers")
    .select(COLUNAS_DA_OFERTA)
    .eq("id", ofertaId)
    .maybeSingle()
    .overrideTypes<LinhaDaOferta, { merge: false }>();
  if (error !== null) throw new Error("Falha ao ler a oferta.");
  if (data === null) return null;
  // Toda oferta tem veículo; sem a linha dele, a sessão não lê a oferta inteira.
  if (data.veiculo === null) return null;
  return {
    id: data.id,
    empresaId: data.supplier_organization_id,
    status: data.status,
    veiculo: paraVeiculo(data.veiculo),
    preco: data.asking_price,
    condicoesComerciais: data.commercial_conditions,
    cidade: data.location_city,
    uf: data.location_state,
    validaAte: data.valid_until,
    publicadaEm: data.published_at,
    disponibilidadeConfirmadaEm: data.availability_confirmed_at,
    autorizacaoDeclaradaEm: data.publication_authorized_at,
    versaoAtual: data.current_version,
    retiradaEm: data.withdrawn_at,
    motivoDaRetirada: data.withdrawn_reason,
    categoriaDaSuspensao: data.suspended_category,
    motivoDaSuspensao: data.suspended_reason,
    suspensaEm: data.suspended_at,
    dadosDeTeste: data.is_test,
    criadaPor: data.created_by,
    criadaEm: data.created_at,
    atualizadaEm: data.updated_at,
  };
}

/**
 * Outras ofertas em andamento da mesma empresa com a mesma placa (ADR-0003
 * §2.11: sem unicidade global, a tela avisa dentro da própria empresa).
 */
export async function outrasOfertasComAPlaca(
  sessao: SupabaseClient,
  oferta: Pick<Oferta, "id" | "empresaId" | "veiculo">,
): Promise<{ readonly id: string; readonly status: StatusDaOferta }[]> {
  if (oferta.veiculo.placa === null) return [];
  const { data, error } = await sessao
    .from("offers")
    .select("id, status, veiculo:vehicles!inner(plate)")
    .eq("supplier_organization_id", oferta.empresaId)
    .eq("veiculo.plate", oferta.veiculo.placa)
    .neq("id", oferta.id)
    .in("status", [...STATUS_EM_ANDAMENTO])
    .limit(20)
    .overrideTypes<
      { id: string; status: StatusDaOferta }[],
      { merge: false }
    >();
  if (error !== null) throw new Error("Falha ao ler as ofertas com a placa.");
  return data.map((linha) => ({ id: linha.id, status: linha.status }));
}

// --- Configuração ---------------------------------------------------------------

export interface ConfiguracaoDaOferta {
  /** `offer_default_validity_days`: validade sugerida no formulário. */
  readonly validadePadraoEmDias: number | null;
  /** `offer_max_validity_days`: teto da validade. */
  readonly validadeMaximaEmDias: number | null;
  /** `document_categories`, na ordem da configuração. */
  readonly categorias: readonly string[];
  /** `offer_review_required` (D10); sem a chave, vale o padrão do banco: exigida. */
  readonly revisaoExigida: boolean;
}

function inteiroPositivo(valor: unknown): number | null {
  return typeof valor === "number" && Number.isInteger(valor) && valor > 0
    ? valor
    : null;
}

/** As chaves do Inc. 2 que as telas usam, lidas com a sessão (não são críticas). */
export async function lerConfiguracaoDaOferta(
  sessao: SupabaseClient,
): Promise<ConfiguracaoDaOferta> {
  const { data, error } = await sessao
    .from("platform_settings")
    .select("key, value")
    .in("key", [
      "offer_default_validity_days",
      "offer_max_validity_days",
      "document_categories",
      "offer_review_required",
    ])
    .overrideTypes<{ key: string; value: unknown }[], { merge: false }>();
  if (error !== null) throw new Error("Falha ao ler a configuração da oferta.");
  const valor = (chave: string): unknown =>
    data.find((linha) => linha.key === chave)?.value;
  const categorias = valor("document_categories");
  return {
    validadePadraoEmDias: inteiroPositivo(valor("offer_default_validity_days")),
    validadeMaximaEmDias: inteiroPositivo(valor("offer_max_validity_days")),
    categorias: Array.isArray(categorias)
      ? categorias.filter((item): item is string => typeof item === "string")
      : [],
    revisaoExigida: valor("offer_review_required") !== false,
  };
}

// --- Estados documentais e pendências --------------------------------------------

/** Estados por categoria, ressalvas e resumo proporcional (I2.5), pela sessão. */
export async function lerEstadosDocumentais(
  dependencias: Dependencias,
  ofertaId: string,
): Promise<EstadosDaOferta> {
  const resultado = await consultarEstadosDocumentais(dependencias, {
    ofertaId,
  });
  if (!resultado.ok) throw new Error("Falha ao ler os estados documentais.");
  return resultado.dados;
}

/** O que falta para enviar ou publicar, com rótulos (a mesma lista do gatilho). */
export async function lerPendencias(
  dependencias: Dependencias,
  ofertaId: string,
): Promise<readonly Pendencia[]> {
  const resultado = await consultarPendenciasDePublicacao(dependencias, {
    ofertaId,
  });
  if (!resultado.ok) throw new Error("Falha ao ler as pendências da oferta.");
  return resultado.dados.pendencias;
}

// --- Fotos e documentos -----------------------------------------------------------

export interface FotoDaOferta {
  readonly id: string;
  readonly ordem: number;
  readonly enviadaEm: string;
  /** URL temporária gerada com a sessão; `null` se não foi possível gerar. */
  readonly url: string | null;
}

/** Fotos não removidas, na ordem de exibição, com a URL temporária de cada uma. */
export async function listarFotos(
  dependencias: Dependencias,
  ofertaId: string,
): Promise<FotoDaOferta[]> {
  const { data, error } = await dependencias.sessao
    .from("offer_media")
    .select("id, display_order, uploaded_at")
    .eq("offer_id", ofertaId)
    .is("removed_at", null)
    .order("display_order")
    .order("uploaded_at")
    .limit(LIMITE_DA_LISTA)
    .overrideTypes<
      { id: string; display_order: number; uploaded_at: string }[],
      { merge: false }
    >();
  if (error !== null) throw new Error("Falha ao ler as fotos da oferta.");
  return Promise.all(
    data.map(async (linha) => {
      const url = await gerarUrlDaFoto(dependencias, { fotoId: linha.id });
      return {
        id: linha.id,
        ordem: linha.display_order,
        enviadaEm: linha.uploaded_at,
        url: url.ok ? url.dados.url : null,
      };
    }),
  );
}

/** Quantas fotos não removidas a oferta tem. */
export async function contarFotos(
  sessao: SupabaseClient,
  ofertaId: string,
): Promise<number> {
  const { count, error } = await sessao
    .from("offer_media")
    .select("id", { count: "exact", head: true })
    .eq("offer_id", ofertaId)
    .is("removed_at", null);
  if (error !== null) throw new Error("Falha ao contar as fotos da oferta.");
  return count ?? 0;
}

export interface DocumentoDaOferta {
  readonly id: string;
  readonly tipo: TipoDeDocumento;
  readonly descricao: string | null;
  readonly sha256: string;
  readonly enviadoPor: string;
  readonly enviadoEm: string;
}

/** Documentos da oferta (só a linha). O arquivo abre só pela URL do servidor, com registro. */
export async function listarDocumentos(
  sessao: SupabaseClient,
  ofertaId: string,
): Promise<DocumentoDaOferta[]> {
  const { data, error } = await sessao
    .from("offer_documents")
    .select("id, kind, description, sha256, uploaded_by, uploaded_at")
    .eq("offer_id", ofertaId)
    .order("uploaded_at", { ascending: false })
    .limit(LIMITE_DA_LISTA)
    .overrideTypes<
      {
        id: string;
        kind: TipoDeDocumento;
        description: string | null;
        sha256: string;
        uploaded_by: string;
        uploaded_at: string;
      }[],
      { merge: false }
    >();
  if (error !== null) throw new Error("Falha ao ler os documentos da oferta.");
  return data.map((linha) => ({
    id: linha.id,
    tipo: linha.kind,
    descricao: linha.description,
    sha256: linha.sha256,
    enviadoPor: linha.uploaded_by,
    enviadoEm: linha.uploaded_at,
  }));
}

/** Quantos documentos a oferta tem. */
export async function contarDocumentos(
  sessao: SupabaseClient,
  ofertaId: string,
): Promise<number> {
  const { count, error } = await sessao
    .from("offer_documents")
    .select("id", { count: "exact", head: true })
    .eq("offer_id", ofertaId);
  if (error !== null)
    throw new Error("Falha ao contar os documentos da oferta.");
  return count ?? 0;
}

// --- Versões, revisões e histórico ------------------------------------------------

export interface VersaoDaOferta {
  readonly id: string;
  readonly numero: number;
  readonly criadaEm: string;
  readonly criadaPor: string | null;
  /** `change_summary`: caminhos do snapshot que mudaram, calculados pelo banco. */
  readonly resumoDaMudanca: string;
  readonly hash: string;
}

export async function listarVersoes(
  sessao: SupabaseClient,
  ofertaId: string,
): Promise<VersaoDaOferta[]> {
  const { data, error } = await sessao
    .from("offer_versions")
    .select(
      "id, version_number, created_at, created_by, change_summary, snapshot_hash",
    )
    .eq("offer_id", ofertaId)
    .order("version_number", { ascending: false })
    .limit(LIMITE_DA_LISTA)
    .overrideTypes<
      {
        id: string;
        version_number: number;
        created_at: string;
        created_by: string | null;
        change_summary: string;
        snapshot_hash: string;
      }[],
      { merge: false }
    >();
  if (error !== null) throw new Error("Falha ao ler as versões da oferta.");
  return data.map((linha) => ({
    id: linha.id,
    numero: linha.version_number,
    criadaEm: linha.created_at,
    criadaPor: linha.created_by,
    resumoDaMudanca: linha.change_summary,
    hash: linha.snapshot_hash,
  }));
}

export interface RevisaoDaOferta {
  readonly id: string;
  readonly decisao: "published" | "returned";
  readonly motivo: string | null;
  readonly revisadaEm: string;
  readonly versao: number | null;
}

/** Decisões da revisão antes de publicar (D10), da mais recente à mais antiga. */
export async function listarRevisoes(
  sessao: SupabaseClient,
  ofertaId: string,
): Promise<RevisaoDaOferta[]> {
  const { data, error } = await sessao
    .from("offer_reviews")
    .select(
      "id, decision, reason, reviewed_at, versao:offer_versions(version_number)",
    )
    .eq("offer_id", ofertaId)
    .order("reviewed_at", { ascending: false })
    .limit(LIMITE_DA_LISTA)
    .overrideTypes<
      {
        id: string;
        decision: "published" | "returned";
        reason: string | null;
        reviewed_at: string;
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
    versao: linha.versao?.version_number ?? null,
  }));
}

export interface MudancaDeCampo {
  readonly id: string;
  readonly entidade: "offers" | "vehicles";
  readonly campo: string;
  readonly antes: unknown;
  readonly depois: unknown;
  /** Quem mudou; `null` é o sistema (expiração). */
  readonly autor: string | null;
  readonly em: string;
}

/** `field_history` da oferta e do veículo, da mudança mais recente à mais antiga. */
export async function listarHistorico(
  sessao: SupabaseClient,
  oferta: Pick<Oferta, "id" | "veiculo">,
): Promise<MudancaDeCampo[]> {
  const { data, error } = await sessao
    .from("field_history")
    .select(
      "id, entity_type, field, old_value, new_value, changed_by, changed_at",
    )
    .or(
      `and(entity_type.eq.offers,entity_id.eq.${oferta.id}),and(entity_type.eq.vehicles,entity_id.eq.${oferta.veiculo.id})`,
    )
    .order("changed_at", { ascending: false })
    .order("field")
    .limit(LIMITE_DO_HISTORICO)
    .overrideTypes<
      {
        id: string;
        entity_type: "offers" | "vehicles";
        field: string;
        old_value: unknown;
        new_value: unknown;
        changed_by: string | null;
        changed_at: string;
      }[],
      { merge: false }
    >();
  if (error !== null) throw new Error("Falha ao ler o histórico da oferta.");
  return data.map((linha) => ({
    id: linha.id,
    entidade: linha.entity_type,
    campo: linha.field,
    antes: linha.old_value,
    depois: linha.new_value,
    autor: linha.changed_by,
    em: linha.changed_at,
  }));
}
