/**
 * Tipos mínimos das tabelas que os testes de integração da identidade usam
 * (migrações da I1.3). Escritos à mão, porque o worktree não gera tipos do
 * banco. Insert e Update aceitam qualquer coluna da linha: os testes mandam de
 * propósito colunas que o banco precisa recusar.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [chave: string]: Json | undefined }
  | Json[];

/** Tipo mapeado: interfaces não têm assinatura de índice, e o cliente exige Record. */
type Simples<T> = { [Chave in keyof T]: T[Chave] };

interface Tabela<Linha> {
  Row: Simples<Linha>;
  Insert: Partial<Linha>;
  Update: Partial<Linha>;
  Relationships: [];
}

export interface Perfil {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  status: "active" | "suspended";
  created_at: string;
  updated_at: string;
}

export interface Empresa {
  id: string;
  name: string;
  legal_name: string;
  cnpj: string;
  cnpj_root: string;
  kind: "supplier" | "buyer" | "both";
  status: "pending" | "active" | "suspended" | "closed";
  contact_email: string | null;
  contact_phone: string | null;
  is_test: boolean;
  created_at: string;
  updated_at: string;
}

export interface Vinculo {
  id: string;
  organization_id: string;
  profile_id: string;
  role: "org_admin" | "member";
  status: "pending" | "active" | "suspended" | "removed";
  invited_email: string | null;
  created_at: string;
  updated_at: string;
}

export interface PapelNaPlataforma {
  id: string;
  profile_id: string;
  role: "admin" | "operator";
  status: "active" | "revoked";
  can_read_audit: boolean;
  granted_by: string | null;
  granted_at: string;
  created_at: string;
  updated_at: string;
}

export interface PedidoDeAdesao {
  id: string;
  applicant_profile_id: string;
  organization_name: string;
  legal_name: string;
  cnpj: string;
  contact_email: string | null;
  contact_phone: string | null;
  requested_kind: "supplier" | "buyer" | "both";
  status: "submitted" | "under_review" | "approved" | "rejected";
  is_test: boolean;
  reviewed_by: string | null;
  reviewed_at: string | null;
  decision_reason: string | null;
  cnpj_checked_at: string | null;
  cnpj_check_source: string | null;
  cnpj_check_evidence_id: string | null;
  organization_id: string | null;
  supplier_invitation_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Convite de fornecedora (ADR-0002 §9). */
export interface ConviteDeFornecedora {
  id: string;
  email: string;
  organization_id: string | null;
  status: "pending" | "used" | "revoked";
  invited_by: string;
  expires_at: string;
  used_at: string | null;
  used_by: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EvidenciaDaAdesao {
  id: string;
  application_id: string;
  storage_path: string;
  sha256: string;
  content_type: string;
  size_bytes: number;
  description: string | null;
  uploaded_by: string;
  uploaded_at: string;
}

export interface RegistroDeAuditoria {
  id: string;
  actor_profile_id: string | null;
  actor_organization_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Json;
  request_id: string | null;
  occurred_at: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: Tabela<Perfil>;
      organizations: Tabela<Empresa>;
      organization_members: Tabela<Vinculo>;
      platform_staff: Tabela<PapelNaPlataforma>;
      membership_applications: Tabela<PedidoDeAdesao>;
      membership_evidence_files: Tabela<EvidenciaDaAdesao>;
      supplier_invitations: Tabela<ConviteDeFornecedora>;
      audit_logs: Tabela<RegistroDeAuditoria>;
    };
    // Os testes só usam tabelas; nenhuma view, função, enum ou tipo composto.
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
