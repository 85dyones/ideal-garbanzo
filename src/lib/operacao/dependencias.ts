/**
 * Dependências das operações de servidor (I1.5; ADR-0002 §2.12).
 *
 * As operações recebem os clientes prontos, em vez de criá-los. Em produção,
 * `criarDependencias()` (de `src/lib/supabase/servidor.ts`) monta tudo a partir
 * dos cookies da requisição; nos testes de integração, o cliente da sessão é
 * o de um usuário de teste que entrou com senha.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface Dependencias {
  /**
   * Cliente com a sessão do usuário (chave publicável e token). Toda escrita
   * passa por ele, para a RLS e os gatilhos valerem com o ator verdadeiro.
   */
  readonly sessao: SupabaseClient;
  /**
   * Cliente com a chave secreta, criado só quando usado. Restrito aos usos da
   * ADR-0002 §2.12: API administrativa do Auth, busca do perfil pelo e-mail no
   * convite e registro em `restricted_access_logs`; e, pela ADR-0003 §2.13, a
   * URL temporária do documento da oferta, depois da checagem e do registro.
   * Nunca escreve em tabela de identidade nem de oferta (lá o `service_role`
   * só lê).
   */
  readonly administrativo: () => SupabaseClient;
  /** Identificador da requisição, enviado em `x-request-id` e gravado na auditoria. */
  readonly requestId: string;
}
