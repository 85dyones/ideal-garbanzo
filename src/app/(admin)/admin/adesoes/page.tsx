import type { Metadata } from "next";
import Link from "next/link";
import { formatarDataHora } from "@/app/_apoio/datas";
import { FiltroPorStatus, lerFiltro } from "@/app/_apoio/filtro";
import { SemPermissao, Vazio } from "@/components/estados";
import { LINK } from "@/components/estilos";
import { Pagina } from "@/components/pagina";
import { verificarAcesso } from "@/modules/auth/queries/acesso";
import { listarPerfisPorId } from "@/modules/auth/queries/perfis";
import { ehDaEquipeDaPlataforma } from "@/modules/auth/rules/permissoes";
import {
  STATUS_DO_PEDIDO,
  ehStatusDoPedido,
  listarPedidos,
} from "@/modules/membership/queries/pedidos";
import { ROTULO_DO_STATUS_DO_PEDIDO } from "@/modules/membership/ui/rotulos";
import { ROTULO_DO_TIPO } from "@/modules/organizations/ui/rotulos";

export const metadata: Metadata = {
  title: "Adesões · Administração",
};

export default async function PaginaDasAdesoes({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const acesso = await verificarAcesso(
    "/admin/adesoes",
    ehDaEquipeDaPlataforma,
  );
  if (!acesso.liberado) return <SemPermissao />;
  const status = lerFiltro((await searchParams).status, ehStatusDoPedido);
  const pedidos = await listarPedidos(acesso.sessao, status);
  const requerentes = await listarPerfisPorId(
    acesso.sessao,
    pedidos.map((pedido) => pedido.requerenteId),
  );

  return (
    <Pagina titulo="Pedidos de adesão">
      <FiltroPorStatus
        caminho="/admin/adesoes"
        atual={status}
        opcoes={STATUS_DO_PEDIDO.map(
          (valor) => [valor, ROTULO_DO_STATUS_DO_PEDIDO[valor]] as const,
        )}
      />
      {pedidos.length === 0 ? (
        <Vazio>Nenhum pedido com este filtro.</Vazio>
      ) : (
        <ul className="flex flex-col divide-y divide-neutral-200 rounded border border-neutral-300 bg-white">
          {pedidos.map((pedido) => {
            const requerente = requerentes.get(pedido.requerenteId);
            return (
              <li key={pedido.id} className="flex flex-col gap-1 p-3">
                <Link href={`/admin/adesoes/${pedido.id}`} className={LINK}>
                  {pedido.nomeDaEmpresa}
                </Link>
                <span className="text-sm text-neutral-700">
                  {ROTULO_DO_STATUS_DO_PEDIDO[pedido.status]} · CNPJ{" "}
                  {pedido.cnpj} · {ROTULO_DO_TIPO[pedido.tipo]} · enviado em{" "}
                  {formatarDataHora(pedido.enviadoEm)}
                </span>
                <span className="text-sm text-neutral-700">
                  Requerente:{" "}
                  {requerente === undefined || requerente.nome === ""
                    ? "—"
                    : requerente.nome}{" "}
                  ({requerente?.email ?? "e-mail indisponível"})
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Pagina>
  );
}
