import type { Metadata } from "next";
import Link from "next/link";
import { SemPermissao } from "@/components/estados";
import { LINK } from "@/components/estilos";
import { Pagina } from "@/components/pagina";
import { verificarAcesso } from "@/modules/auth/queries/acesso";
import {
  ehAdministrador,
  ehDaEquipeDaPlataforma,
} from "@/modules/auth/rules/permissoes";

export const metadata: Metadata = {
  title: "Administração",
};

export default async function PaginaDaAdministracao() {
  const acesso = await verificarAcesso("/admin", ehDaEquipeDaPlataforma);
  if (!acesso.liberado) return <SemPermissao />;
  const administrador = ehAdministrador(acesso.contexto);
  return (
    <Pagina
      titulo="Administração"
      descricao={
        administrador
          ? "Você é administrador da plataforma."
          : "Você é operador da plataforma: lê os dados e prepara a revisão das adesões; as decisões ficam com o administrador."
      }
    >
      <ul className="flex flex-col gap-2">
        <li>
          <Link href="/admin/adesoes" className={LINK}>
            Pedidos de adesão
          </Link>
        </li>
        <li>
          <Link href="/admin/empresas" className={LINK}>
            Empresas
          </Link>
        </li>
        <li>
          <Link href="/admin/usuarios" className={LINK}>
            Usuários e papéis
          </Link>
        </li>
      </ul>
    </Pagina>
  );
}
