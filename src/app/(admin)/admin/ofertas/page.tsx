import type { Metadata } from "next";
import Link from "next/link";
import { FiltroPorStatus, lerFiltro } from "@/app/_apoio/filtro";
import { Aviso, SemPermissao, Vazio } from "@/components/estados";
import { LINK } from "@/components/estilos";
import { Pagina } from "@/components/pagina";
import { verificarAcesso } from "@/modules/auth/queries/acesso";
import { ehDaEquipeDaPlataforma } from "@/modules/auth/rules/permissoes";
import {
  LIMITE_DA_LISTA_DA_PLATAFORMA,
  contarOfertasEmRevisao,
  listarOfertasDaPlataforma,
} from "@/modules/offers/queries/plataforma";
import { ROTULO_DO_STATUS } from "@/modules/offers/rules/transicoes";
import {
  STATUS_DO_FILTRO_DA_PLATAFORMA,
  TEXTO_DA_PLATAFORMA,
  dataRelevante,
  ehStatusDoFiltroDaPlataforma,
} from "@/modules/offers/ui/plataforma";
import { tituloDaOferta } from "@/modules/offers/ui/rotulos";

export const metadata: Metadata = {
  title: "Ofertas · Administração",
};

const CAMINHO = "/admin/ofertas";

const OPCOES_DO_FILTRO = STATUS_DO_FILTRO_DA_PLATAFORMA.map(
  (status) => [status, ROTULO_DO_STATUS[status]] as const,
);

function filaDeRevisao(quantidade: number): string {
  return quantidade === 1
    ? "1 oferta aguarda revisão."
    : `${String(quantidade)} ofertas aguardam revisão.`;
}

/**
 * Ofertas de todas as empresas, para a equipe da plataforma (I2.9; §9). A
 * fila de revisão ("Em revisão") vem em destaque, com a quantidade.
 */
export default async function PaginaDasOfertasNaAdministracao({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const acesso = await verificarAcesso(CAMINHO, ehDaEquipeDaPlataforma);
  if (!acesso.liberado) return <SemPermissao />;
  // Situação fora do filtro (inclusive "Vendida", que não chega no Inc. 2) vale como "Todas".
  const status = lerFiltro(
    (await searchParams).status,
    ehStatusDoFiltroDaPlataforma,
  );
  const [ofertas, emRevisao] = await Promise.all([
    listarOfertasDaPlataforma(acesso.sessao, status),
    contarOfertasEmRevisao(acesso.sessao),
  ]);
  const naFila = status === "under_review";

  return (
    <Pagina
      titulo="Ofertas"
      descricao={
        naFila
          ? TEXTO_DA_PLATAFORMA.descricaoDaFila
          : TEXTO_DA_PLATAFORMA.descricaoDaLista
      }
    >
      {emRevisao === 0 ? (
        <Aviso>{TEXTO_DA_PLATAFORMA.filaVazia}</Aviso>
      ) : (
        <Aviso tom="alerta">
          <p className="font-medium">{filaDeRevisao(emRevisao)}</p>
          {naFila ? null : (
            <p className="mt-1">
              <Link href={`${CAMINHO}?status=under_review`} className={LINK}>
                {TEXTO_DA_PLATAFORMA.abrirAFila}
              </Link>
            </p>
          )}
        </Aviso>
      )}
      <FiltroPorStatus
        caminho={CAMINHO}
        atual={status}
        opcoes={OPCOES_DO_FILTRO}
        rotuloDeTodos="Todas"
      />
      {ofertas.length === 0 ? (
        <Vazio>
          {status === null
            ? TEXTO_DA_PLATAFORMA.listaVazia
            : TEXTO_DA_PLATAFORMA.listaVaziaComFiltro}
        </Vazio>
      ) : (
        <ul
          aria-label="Ofertas"
          className="flex flex-col divide-y divide-neutral-200 rounded border border-neutral-300 bg-white"
        >
          {ofertas.map((oferta) => (
            <li key={oferta.id} className="flex flex-col gap-1 p-3">
              <Link href={`${CAMINHO}/${oferta.id}`} className={LINK}>
                {tituloDaOferta(oferta.veiculo)}
              </Link>
              <p className="text-sm text-neutral-700">
                <span className="font-medium text-marinho-900">
                  {ROTULO_DO_STATUS[oferta.status]}
                </span>{" "}
                · {oferta.nomeDaEmpresa ?? "Empresa sem nome"}
              </p>
              <p className="text-sm text-neutral-700">
                {[
                  oferta.versaoAtual === null
                    ? null
                    : `versão ${String(oferta.versaoAtual)}`,
                  dataRelevante(oferta),
                  oferta.dadosDeTeste ? "dados de teste" : null,
                ]
                  .filter((parte) => parte !== null)
                  .join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      )}
      {ofertas.length >= LIMITE_DA_LISTA_DA_PLATAFORMA ? (
        <p className="text-sm text-neutral-700">
          {TEXTO_DA_PLATAFORMA.limiteDaLista}
        </p>
      ) : null}
    </Pagina>
  );
}
