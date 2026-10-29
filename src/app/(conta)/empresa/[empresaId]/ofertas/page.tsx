import type { Metadata } from "next";
import Link from "next/link";
import { formatarDataHora } from "@/app/_apoio/datas";
import { FiltroPorStatus, lerFiltro } from "@/app/_apoio/filtro";
import { formatarPreco, formatarValidade } from "@/app/_apoio/oferta";
import {
  caminhoDasOfertas,
  carregarEmpresaDasOfertas,
} from "@/app/_apoio/oferta-da-pagina";
import { Vazio } from "@/components/estados";
import { BOTAO_PRINCIPAL, LINK } from "@/components/estilos";
import { Pagina } from "@/components/pagina";
import {
  ehStatusDaOferta,
  listarOfertasDaEmpresa,
} from "@/modules/offers/queries/ofertas";
import {
  ROTULO_DO_STATUS,
  STATUS_DA_OFERTA,
} from "@/modules/offers/rules/transicoes";
import { TEXTO, tituloDaOferta } from "@/modules/offers/ui/rotulos";

export const metadata: Metadata = { title: "Ofertas" };

/** Nenhuma transição leva a "Vendida" no Inc. 2 (ADR-0003 §2.1). */
const OPCOES_DO_FILTRO = STATUS_DA_OFERTA.filter(
  (status) => status !== "sold",
).map((status) => [status, ROTULO_DO_STATUS[status]] as const);

/**
 * Painel de ofertas da empresa fornecedora (I2.8; §9). Sem vínculo ativo com
 * a empresa, "Sem permissão" para qualquer id.
 */
export default async function PaginaDasOfertas({
  params,
  searchParams,
}: {
  readonly params: Promise<{ empresaId: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { empresaId } = await params;
  const caminho = caminhoDasOfertas(empresaId);
  const carga = await carregarEmpresaDasOfertas(empresaId, caminho);
  if (!carga.ok) return carga.resposta;
  const { sessao, empresa } = carga;
  const status = lerFiltro((await searchParams).status, ehStatusDaOferta);
  const ofertas = await listarOfertasDaEmpresa(sessao, empresa.id, status);

  return (
    <Pagina
      titulo={`Ofertas de ${empresa.nome}`}
      descricao="Cadastre veículos para repasse a outros lojistas e acompanhe a situação de cada oferta."
    >
      <p>
        <Link href={`${caminho}/nova`} className={BOTAO_PRINCIPAL}>
          Nova oferta
        </Link>
      </p>
      <FiltroPorStatus
        caminho={caminho}
        atual={status}
        opcoes={OPCOES_DO_FILTRO}
        rotuloDeTodos="Todas"
      />
      {ofertas.length === 0 ? (
        <Vazio>
          {status === null ? TEXTO.painelVazio : TEXTO.painelVazioComFiltro}
        </Vazio>
      ) : (
        <ul
          aria-label="Ofertas da empresa"
          className="flex flex-col divide-y divide-neutral-200 rounded border border-neutral-300 bg-white"
        >
          {ofertas.map((oferta) => (
            <li key={oferta.id} className="flex flex-col gap-1 p-3">
              <Link href={`${caminho}/${oferta.id}`} className={LINK}>
                {tituloDaOferta(oferta.veiculo)}
              </Link>
              <p className="flex flex-wrap gap-x-2 text-sm text-neutral-700">
                <span className="font-medium text-marinho-900">
                  {ROTULO_DO_STATUS[oferta.status]}
                </span>
                <span>· {formatarPreco(oferta.preco)}</span>
                <span>· válida até {formatarValidade(oferta.validaAte)}</span>
                {oferta.versaoAtual === null ? null : (
                  <span>· versão {String(oferta.versaoAtual)}</span>
                )}
                {oferta.veiculo?.placa === null ||
                oferta.veiculo?.placa === undefined ? null : (
                  <span>· placa {oferta.veiculo.placa}</span>
                )}
              </p>
              {oferta.status === "suspended" ? (
                <p className="text-sm text-amber-900">
                  Suspensa pela plataforma em{" "}
                  {formatarDataHora(oferta.suspensaEm)}. Abra a oferta para ver
                  o motivo.
                </p>
              ) : null}
              <p className="text-sm text-neutral-600">
                Atualizada em {formatarDataHora(oferta.atualizadaEm)}
              </p>
            </li>
          ))}
        </ul>
      )}
      <p>
        <Link
          href={`/empresa/${encodeURIComponent(empresa.id)}`}
          className={LINK}
        >
          Voltar à empresa
        </Link>
      </p>
    </Pagina>
  );
}
