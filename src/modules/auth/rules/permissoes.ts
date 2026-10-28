/**
 * Checagens de permissão do servidor (ADR-0002 §2.3, camada 2). Repetem, sobre
 * o contexto lido do banco na mesma requisição, o que as políticas e os
 * gatilhos já exigem; protegem os caminhos com a chave secreta e dão erro
 * previsível antes da escrita. A decisão final continua no banco.
 */
import type { ContextoDoUsuario } from "../tipos";
import type { VinculoDoUsuario } from "@/modules/organizations/tipos";

export function ehAdministrador(contexto: ContextoDoUsuario): boolean {
  return contexto.papelNaPlataforma === "admin";
}

export function ehDaEquipeDaPlataforma(contexto: ContextoDoUsuario): boolean {
  return contexto.papelNaPlataforma !== null;
}

/** Vínculo ativo com a empresa, e a empresa ativa; senão, `undefined`. */
export function vinculoAtivo(
  contexto: ContextoDoUsuario,
  organizationId: string,
): VinculoDoUsuario | undefined {
  return contexto.vinculos.find(
    (vinculo) =>
      vinculo.organizationId === organizationId &&
      vinculo.status === "active" &&
      vinculo.empresa?.status === "active",
  );
}

/** Administrador da plataforma, ou `org_admin` ativo da empresa ativa (ADR-0002 §2.6). */
export function podeGerirEmpresa(
  contexto: ContextoDoUsuario,
  organizationId: string,
): boolean {
  return (
    ehAdministrador(contexto) ||
    vinculoAtivo(contexto, organizationId)?.papel === "org_admin"
  );
}

/** Membro ativo de empresa ativa compradora (ADR-0002 §2.2, `pode_ver_catalogo`). */
export function podeVerCatalogo(contexto: ContextoDoUsuario): boolean {
  return contexto.vinculos.some(
    (vinculo) =>
      vinculo.status === "active" &&
      vinculo.empresa?.status === "active" &&
      (vinculo.empresa.kind === "buyer" || vinculo.empresa.kind === "both"),
  );
}
