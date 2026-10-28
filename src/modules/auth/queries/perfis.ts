/**
 * Leituras de perfil e de papel na plataforma para as telas (I1.6), sempre
 * com o cliente da sessão; a RLS decide o que volta (ADR-0002 §2.9): o
 * próprio perfil, os colegas de empresa ativa e, para a equipe, todos. Em
 * `platform_staff`, cada um lê a própria linha e o administrador lê todas.
 * Falha de leitura lança erro, que a tela mostra como erro genérico.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PapelNaPlataforma } from "../tipos";

const LIMITE_DA_LISTA = 200;

export type StatusDoPerfil = "active" | "suspended";

export interface Perfil {
  readonly id: string;
  readonly nome: string;
  readonly email: string | null;
  readonly telefone: string | null;
  readonly status: StatusDoPerfil;
  readonly criadoEm: string;
}

interface LinhaDoPerfil {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  status: StatusDoPerfil;
  created_at: string;
}

const COLUNAS_DO_PERFIL = "id, full_name, email, phone, status, created_at";

function paraPerfil(linha: LinhaDoPerfil): Perfil {
  return {
    id: linha.id,
    nome: linha.full_name,
    email: linha.email,
    telefone: linha.phone,
    status: linha.status,
    criadoEm: linha.created_at,
  };
}

/** Perfil pelo id; `null` se não existe ou se a RLS não mostra. */
export async function obterPerfil(
  sessao: SupabaseClient,
  perfilId: string,
): Promise<Perfil | null> {
  const { data, error } = await sessao
    .from("profiles")
    .select(COLUNAS_DO_PERFIL)
    .eq("id", perfilId)
    .maybeSingle()
    .overrideTypes<LinhaDoPerfil, { merge: false }>();
  if (error !== null) throw new Error("Falha ao ler o perfil.");
  return data === null ? null : paraPerfil(data);
}

/** Perfis visíveis entre os ids pedidos, por id. */
export async function listarPerfisPorId(
  sessao: SupabaseClient,
  perfilIds: readonly string[],
): Promise<ReadonlyMap<string, Perfil>> {
  const ids = [...new Set(perfilIds)];
  if (ids.length === 0) return new Map();
  const { data, error } = await sessao
    .from("profiles")
    .select(COLUNAS_DO_PERFIL)
    .in("id", ids)
    .overrideTypes<LinhaDoPerfil[], { merge: false }>();
  if (error !== null) throw new Error("Falha ao ler os perfis.");
  return new Map(data.map((linha) => [linha.id, paraPerfil(linha)]));
}

/** Perfis para a equipe da plataforma, do mais novo ao mais antigo. */
export async function listarPerfis(sessao: SupabaseClient): Promise<Perfil[]> {
  const { data, error } = await sessao
    .from("profiles")
    .select(COLUNAS_DO_PERFIL)
    .order("created_at", { ascending: false })
    .limit(LIMITE_DA_LISTA)
    .overrideTypes<LinhaDoPerfil[], { merge: false }>();
  if (error !== null) throw new Error("Falha ao ler os perfis.");
  return data.map(paraPerfil);
}

export interface PapelDoPerfil {
  readonly perfilId: string;
  readonly papel: PapelNaPlataforma;
  readonly status: "active" | "revoked";
  readonly podeLerAuditoria: boolean;
  readonly concedidoEm: string;
}

/** Papéis na plataforma que a sessão consegue ler, por perfil. */
export async function listarPapeisNaPlataforma(
  sessao: SupabaseClient,
): Promise<ReadonlyMap<string, PapelDoPerfil>> {
  const { data, error } = await sessao
    .from("platform_staff")
    .select("profile_id, role, status, can_read_audit, granted_at")
    .overrideTypes<
      {
        profile_id: string;
        role: PapelNaPlataforma;
        status: "active" | "revoked";
        can_read_audit: boolean;
        granted_at: string;
      }[],
      { merge: false }
    >();
  if (error !== null) throw new Error("Falha ao ler os papéis da plataforma.");
  return new Map(
    data.map((linha) => [
      linha.profile_id,
      {
        perfilId: linha.profile_id,
        papel: linha.role,
        status: linha.status,
        podeLerAuditoria: linha.can_read_audit,
        concedidoEm: linha.granted_at,
      },
    ]),
  );
}
