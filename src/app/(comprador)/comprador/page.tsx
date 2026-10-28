import type { Metadata } from "next";
import { SemPermissao, Vazio } from "@/components/estados";
import { Pagina } from "@/components/pagina";
import { verificarAcesso } from "@/modules/auth/queries/acesso";
import { podeVerCatalogo } from "@/modules/auth/rules/permissoes";

export const metadata: Metadata = { title: "Catálogo" };

/**
 * Página provisória do catálogo (ADR-0002 §2.15, teste 1). Quem não é membro
 * ativo de empresa compradora ativa vê "Sem permissão"; o catálogo de verdade
 * chega no Inc. 4.
 */
export default async function PaginaDoCatalogo() {
  const acesso = await verificarAcesso("/comprador", podeVerCatalogo);
  if (!acesso.liberado) return <SemPermissao />;
  return (
    <Pagina titulo="Catálogo">
      <Vazio>Nenhuma oferta disponível. O catálogo chega no Inc. 4.</Vazio>
    </Pagina>
  );
}
