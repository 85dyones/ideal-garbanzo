import type { ReactNode } from "react";
import { MolduraLogada } from "@/app/_apoio/layout-logado";
import { SemPermissao } from "@/components/estados";
import { lerSituacao, verificarAcesso } from "@/modules/auth/queries/acesso";
import { podeVerCatalogo } from "@/modules/auth/rules/permissoes";

/**
 * Área do comprador. O layout confere `podeVerCatalogo` antes de renderizar
 * as páginas, e cada página confere de novo (na navegação entre páginas o
 * layout não roda outra vez).
 */
export default async function LayoutDoComprador({
  children,
}: Readonly<{ children: ReactNode }>) {
  const acesso = await verificarAcesso("/comprador", podeVerCatalogo);
  return (
    <MolduraLogada situacao={await lerSituacao()}>
      {acesso.liberado ? children : <SemPermissao />}
    </MolduraLogada>
  );
}
