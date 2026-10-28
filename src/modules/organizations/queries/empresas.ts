/**
 * Leituras de empresa e membros para as telas (I1.6), sempre com o cliente da
 * sessão de quem vê a tela; a RLS decide o que volta (ADR-0002 §2.9):
 * - a linha da empresa: quem tem vínculo ativo ou convite pendente, mesmo com
 *   a empresa suspensa, e a equipe da plataforma;
 * - os vínculos: membros ativos da mesma empresa ativa, o próprio vínculo e a
 *   equipe.
 * Falha de leitura lança erro, que a tela mostra como erro genérico.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PapelNaEmpresa,
  StatusDaEmpresa,
  StatusDoVinculo,
  TipoDeEmpresa,
} from "../tipos";

const LIMITE_DA_LISTA = 200;

export const STATUS_DA_EMPRESA = [
  "pending",
  "active",
  "suspended",
  "closed",
] as const satisfies readonly StatusDaEmpresa[];

export function ehStatusDaEmpresa(valor: unknown): valor is StatusDaEmpresa {
  return STATUS_DA_EMPRESA.some((status) => status === valor);
}

export interface ResumoDaEmpresa {
  readonly id: string;
  readonly nome: string;
  readonly tipo: TipoDeEmpresa;
  readonly status: StatusDaEmpresa;
}

export interface Empresa extends ResumoDaEmpresa {
  readonly razaoSocial: string;
  readonly cnpj: string;
  readonly emailDeContato: string | null;
  readonly telefoneDeContato: string | null;
  readonly dadosDeTeste: boolean;
  readonly criadaEm: string;
}

interface LinhaDaEmpresa {
  id: string;
  name: string;
  legal_name: string;
  cnpj: string;
  kind: TipoDeEmpresa;
  status: StatusDaEmpresa;
  contact_email: string | null;
  contact_phone: string | null;
  is_test: boolean;
  created_at: string;
}

function paraEmpresa(linha: LinhaDaEmpresa): Empresa {
  return {
    id: linha.id,
    nome: linha.name,
    tipo: linha.kind,
    status: linha.status,
    razaoSocial: linha.legal_name,
    cnpj: linha.cnpj,
    emailDeContato: linha.contact_email,
    telefoneDeContato: linha.contact_phone,
    dadosDeTeste: linha.is_test,
    criadaEm: linha.created_at,
  };
}

const COLUNAS_DA_EMPRESA =
  "id, name, legal_name, cnpj, kind, status, contact_email, contact_phone, is_test, created_at";

/** Empresa pelo id; `null` se não existe ou se a RLS não mostra. */
export async function obterEmpresa(
  sessao: SupabaseClient,
  empresaId: string,
): Promise<Empresa | null> {
  const { data, error } = await sessao
    .from("organizations")
    .select(COLUNAS_DA_EMPRESA)
    .eq("id", empresaId)
    .maybeSingle()
    .overrideTypes<LinhaDaEmpresa, { merge: false }>();
  if (error !== null) throw new Error("Falha ao ler a empresa.");
  return data === null ? null : paraEmpresa(data);
}

/** Nome, tipo e status das empresas pedidas que a sessão consegue ler. */
export async function listarResumosDasEmpresas(
  sessao: SupabaseClient,
  empresaIds: readonly string[],
): Promise<ResumoDaEmpresa[]> {
  if (empresaIds.length === 0) return [];
  const { data, error } = await sessao
    .from("organizations")
    .select("id, name, kind, status")
    .in("id", [...empresaIds])
    .order("name")
    .overrideTypes<
      Pick<LinhaDaEmpresa, "id" | "name" | "kind" | "status">[],
      { merge: false }
    >();
  if (error !== null) throw new Error("Falha ao ler as empresas.");
  return data.map((linha) => ({
    id: linha.id,
    nome: linha.name,
    tipo: linha.kind,
    status: linha.status,
  }));
}

/** Empresas para a equipe da plataforma, com filtro opcional de status. */
export async function listarEmpresas(
  sessao: SupabaseClient,
  status: StatusDaEmpresa | null,
): Promise<Empresa[]> {
  let consulta = sessao
    .from("organizations")
    .select(COLUNAS_DA_EMPRESA)
    .order("created_at", { ascending: false })
    .limit(LIMITE_DA_LISTA);
  if (status !== null) consulta = consulta.eq("status", status);
  const { data, error } = await consulta.overrideTypes<
    LinhaDaEmpresa[],
    { merge: false }
  >();
  if (error !== null) throw new Error("Falha ao ler as empresas.");
  return data.map(paraEmpresa);
}

export interface Membro {
  readonly vinculoId: string;
  readonly perfilId: string;
  readonly papel: PapelNaEmpresa;
  readonly status: StatusDoVinculo;
  readonly emailConvidado: string | null;
  readonly criadoEm: string;
}

/** Vínculos da empresa que a sessão consegue ler, inclusive convites e removidos. */
export async function listarMembros(
  sessao: SupabaseClient,
  empresaId: string,
): Promise<Membro[]> {
  const { data, error } = await sessao
    .from("organization_members")
    .select("id, profile_id, role, status, invited_email, created_at")
    .eq("organization_id", empresaId)
    .order("created_at")
    .overrideTypes<
      {
        id: string;
        profile_id: string;
        role: PapelNaEmpresa;
        status: StatusDoVinculo;
        invited_email: string | null;
        created_at: string;
      }[],
      { merge: false }
    >();
  if (error !== null) throw new Error("Falha ao ler os membros da empresa.");
  return data.map((linha) => ({
    vinculoId: linha.id,
    perfilId: linha.profile_id,
    papel: linha.role,
    status: linha.status,
    emailConvidado: linha.invited_email,
    criadoEm: linha.created_at,
  }));
}
