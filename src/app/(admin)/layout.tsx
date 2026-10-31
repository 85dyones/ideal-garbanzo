import Link from "next/link";
import type { ReactNode } from "react";
import { MolduraLogada } from "@/app/_apoio/layout-logado";
import { SemPermissao } from "@/components/estados";
import { LINK } from "@/components/estilos";
import { lerSituacao, verificarAcesso } from "@/modules/auth/queries/acesso";
import { ehDaEquipeDaPlataforma } from "@/modules/auth/rules/permissoes";

/**
 * Administração: só a equipe da plataforma (administrador e operador). O
 * layout confere antes de renderizar as páginas, e cada página confere de
 * novo, porque na navegação entre páginas o layout não roda outra vez.
 */
export default async function LayoutDaAdministracao({
  children,
}: Readonly<{ children: ReactNode }>) {
  const acesso = await verificarAcesso("/admin", ehDaEquipeDaPlataforma);
  return (
    <MolduraLogada situacao={await lerSituacao()}>
      {acesso.liberado ? (
        <>
          <nav aria-label="Administração">
            <ul className="flex flex-wrap gap-4 text-sm">
              <li>
                <Link href="/admin/adesoes" className={LINK}>
                  Adesões
                </Link>
              </li>
              <li>
                <Link href="/admin/convites" className={LINK}>
                  Convites
                </Link>
              </li>
              <li>
                <Link href="/admin/empresas" className={LINK}>
                  Empresas
                </Link>
              </li>
              <li>
                <Link href="/admin/ofertas" className={LINK}>
                  Ofertas
                </Link>
              </li>
              <li>
                <Link href="/admin/usuarios" className={LINK}>
                  Usuários
                </Link>
              </li>
            </ul>
          </nav>
          {children}
        </>
      ) : (
        <SemPermissao />
      )}
    </MolduraLogada>
  );
}
