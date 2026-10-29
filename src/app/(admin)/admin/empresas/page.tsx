import type { Metadata } from "next";
import Link from "next/link";
import { FiltroPorStatus, lerFiltro } from "@/app/_apoio/filtro";
import { SemPermissao, Vazio } from "@/components/estados";
import { LINK } from "@/components/estilos";
import { Pagina } from "@/components/pagina";
import { verificarAcesso } from "@/modules/auth/queries/acesso";
import { ehDaEquipeDaPlataforma } from "@/modules/auth/rules/permissoes";
import {
  ehStatusDaEmpresa,
  listarEmpresas,
} from "@/modules/organizations/queries/empresas";
import {
  ROTULO_DO_STATUS_DA_EMPRESA,
  ROTULO_DO_TIPO,
} from "@/modules/organizations/ui/rotulos";

export const metadata: Metadata = {
  title: "Empresas · Administração",
};

const OPCOES_DO_FILTRO = (["active", "suspended", "closed"] as const).map(
  (status) => [status, ROTULO_DO_STATUS_DA_EMPRESA[status]] as const,
);

export default async function PaginaDasEmpresas({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const acesso = await verificarAcesso(
    "/admin/empresas",
    ehDaEquipeDaPlataforma,
  );
  if (!acesso.liberado) return <SemPermissao />;
  const status = lerFiltro((await searchParams).status, ehStatusDaEmpresa);
  const empresas = await listarEmpresas(acesso.sessao, status);

  return (
    <Pagina titulo="Empresas">
      <FiltroPorStatus
        caminho="/admin/empresas"
        atual={status}
        opcoes={OPCOES_DO_FILTRO}
      />
      {empresas.length === 0 ? (
        <Vazio>Nenhuma empresa com este filtro.</Vazio>
      ) : (
        <ul className="flex flex-col divide-y divide-neutral-200 rounded border border-neutral-300 bg-white">
          {empresas.map((empresa) => (
            <li key={empresa.id} className="flex flex-col gap-1 p-3">
              <Link href={`/admin/empresas/${empresa.id}`} className={LINK}>
                {empresa.nome}
              </Link>
              <span className="text-sm text-neutral-700">
                {ROTULO_DO_STATUS_DA_EMPRESA[empresa.status]} ·{" "}
                {ROTULO_DO_TIPO[empresa.tipo]} · CNPJ {empresa.cnpj}
                {empresa.dadosDeTeste ? " · dados de teste" : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Pagina>
  );
}
