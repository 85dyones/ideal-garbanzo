import type { Metadata } from "next";
import Link from "next/link";
import {
  decidirPedidoAcao,
  enviarEvidenciaAcao,
  moverParaAnaliseAcao,
  registrarConferenciaAcao,
  verEvidenciaAcao,
} from "@/app/_acoes/adesao";
import { formatarDataHora } from "@/app/_apoio/datas";
import { RegistroInexistente, SemPermissao, Vazio } from "@/components/estados";
import { LINK } from "@/components/estilos";
import { Dados, Pagina, Secao } from "@/components/pagina";
import { id as campoId } from "@/lib/operacao/campos";
import { verificarAcesso } from "@/modules/auth/queries/acesso";
import { listarPerfisPorId } from "@/modules/auth/queries/perfis";
import {
  ehAdministrador,
  ehDaEquipeDaPlataforma,
} from "@/modules/auth/rules/permissoes";
import {
  listarEvidencias,
  obterConferencia,
  obterPedido,
} from "@/modules/membership/queries/pedidos";
import {
  FormularioDeConferencia,
  FormularioDeDecisao,
  FormularioDeEvidencia,
  MoverParaAnalise,
  VerEvidencia,
} from "@/modules/membership/ui/revisao";
import {
  ROTULO_DO_TIPO_DE_ARQUIVO,
  formatarTamanho,
  pedidoAberto,
  rotuloDoStatusDoPedido,
} from "@/modules/membership/ui/rotulos";
import { ROTULO_DO_TIPO } from "@/modules/organizations/ui/rotulos";

export const metadata: Metadata = {
  title: "Pedido de adesão · Administração",
};

function textoOuTraco(valor: string | null | undefined): string {
  return valor === null || valor === undefined || valor === "" ? "—" : valor;
}

export default async function PaginaDoPedido({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const acesso = await verificarAcesso(
    `/admin/adesoes/${encodeURIComponent(id)}`,
    ehDaEquipeDaPlataforma,
  );
  if (!acesso.liberado) return <SemPermissao />;
  const { contexto, sessao } = acesso;
  const inexistente = (
    <RegistroInexistente
      voltarPara="/admin/adesoes"
      rotuloDaVolta="Voltar aos pedidos"
    />
  );
  if (!campoId.safeParse(id).success) return inexistente;
  const pedido = await obterPedido(sessao, id);
  if (pedido === null) return inexistente;

  const administrador = ehAdministrador(contexto);
  const aberto = pedidoAberto(pedido.status);
  const [conferencia, evidencias, pessoas] = await Promise.all([
    obterConferencia(sessao, pedido.id),
    administrador ? listarEvidencias(sessao, pedido.id) : Promise.resolve([]),
    listarPerfisPorId(
      sessao,
      [pedido.requerenteId, pedido.revisadoPor].filter(
        (perfilId): perfilId is string => perfilId !== null,
      ),
    ),
  ]);
  const requerente = pessoas.get(pedido.requerenteId);
  const revisor =
    pedido.revisadoPor === null ? undefined : pessoas.get(pedido.revisadoPor);
  const proprioPedido = pedido.requerenteId === contexto.perfilId;

  return (
    <Pagina titulo={`Pedido: ${pedido.nomeDaEmpresa}`}>
      <Secao titulo="Dados enviados">
        <Dados
          itens={[
            ["Status", rotuloDoStatusDoPedido(pedido.status)],
            ["Nome da empresa", pedido.nomeDaEmpresa],
            ["Razão social", pedido.razaoSocial],
            ["CNPJ", pedido.cnpj],
            ["Tipo pedido", ROTULO_DO_TIPO[pedido.tipo]],
            ["E-mail de contato", textoOuTraco(pedido.emailDeContato)],
            ["Telefone de contato", textoOuTraco(pedido.telefoneDeContato)],
            [
              "Requerente",
              `${textoOuTraco(requerente?.nome)} (${textoOuTraco(requerente?.email)})`,
            ],
            ["Enviado em", formatarDataHora(pedido.enviadoEm)],
            ["Dados de teste", pedido.dadosDeTeste ? "Sim" : "Não"],
          ]}
        />
        {proprioPedido ? (
          <p className="text-sm text-amber-900">
            Este pedido é seu: a revisão fica com outra pessoa da equipe.
          </p>
        ) : null}
      </Secao>

      {aberto ? null : (
        <Secao titulo="Decisão">
          <Dados
            itens={[
              ["Resultado", rotuloDoStatusDoPedido(pedido.status)],
              ["Decidido em", formatarDataHora(pedido.revisadoEm)],
              [
                "Decidido por",
                `${textoOuTraco(revisor?.nome)} (${textoOuTraco(revisor?.email)})`,
              ],
              ...(pedido.status === "approved"
                ? ([
                    [
                      "Conferência do CNPJ em",
                      formatarDataHora(pedido.cnpjConferidoEm),
                    ],
                    [
                      "Fonte da conferência",
                      textoOuTraco(pedido.fonteDaConferencia),
                    ],
                    [
                      "Empresa",
                      pedido.empresaId === null ? (
                        "—"
                      ) : (
                        <Link
                          href={`/admin/empresas/${pedido.empresaId}`}
                          className={LINK}
                        >
                          Abrir a empresa
                        </Link>
                      ),
                    ],
                  ] as const)
                : ([
                    ["Motivo", textoOuTraco(pedido.motivoDaDecisao)],
                  ] as const)),
            ]}
          />
        </Secao>
      )}

      {pedido.status === "submitted" && !proprioPedido ? (
        <Secao titulo="Preparar a revisão">
          <MoverParaAnalise pedidoId={pedido.id} acao={moverParaAnaliseAcao} />
        </Secao>
      ) : null}

      <Secao titulo="Conferência">
        {administrador && aberto && !proprioPedido ? (
          <FormularioDeConferencia
            pedidoId={pedido.id}
            itensIniciais={conferencia?.itens ?? []}
            acao={registrarConferenciaAcao}
          />
        ) : conferencia === null || conferencia.itens.length === 0 ? (
          <Vazio>Nenhum item de conferência registrado.</Vazio>
        ) : (
          <ul className="flex flex-col gap-2">
            {conferencia.itens.map((item, indice) => (
              <li key={indice}>
                <strong>{item.item}</strong>: {item.resultado}
                {item.observacao === undefined ? "" : ` (${item.observacao})`}
              </li>
            ))}
          </ul>
        )}
        {conferencia === null ? null : (
          <p className="text-sm text-neutral-700">
            Atualizada em {formatarDataHora(conferencia.atualizadaEm)}.
          </p>
        )}
      </Secao>

      {administrador ? (
        <Secao titulo="Evidências">
          {evidencias.length === 0 ? (
            <Vazio>Nenhuma evidência enviada.</Vazio>
          ) : (
            <ul className="flex flex-col divide-y divide-neutral-200">
              {evidencias.map((evidencia) => (
                <li
                  key={evidencia.id}
                  className="flex flex-col gap-2 py-2 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="text-sm">
                    <p className="font-medium">
                      {textoOuTraco(evidencia.descricao)}
                    </p>
                    <p className="text-neutral-700">
                      {ROTULO_DO_TIPO_DE_ARQUIVO[evidencia.tipoDoArquivo] ??
                        evidencia.tipoDoArquivo}{" "}
                      · {formatarTamanho(evidencia.tamanho)} · enviada em{" "}
                      {formatarDataHora(evidencia.enviadaEm)}
                    </p>
                    <p className="break-all text-neutral-600">
                      SHA-256: {evidencia.sha256}
                    </p>
                  </div>
                  <VerEvidencia
                    evidenciaId={evidencia.id}
                    acao={verEvidenciaAcao}
                  />
                </li>
              ))}
            </ul>
          )}
          {aberto && !proprioPedido ? (
            <FormularioDeEvidencia
              pedidoId={pedido.id}
              acao={enviarEvidenciaAcao}
            />
          ) : null}
        </Secao>
      ) : null}

      {administrador && aberto && !proprioPedido ? (
        <Secao titulo="Decidir">
          <FormularioDeDecisao
            pedidoId={pedido.id}
            evidencias={evidencias.map(
              (evidencia) =>
                [
                  evidencia.id,
                  `${textoOuTraco(evidencia.descricao)} (${formatarDataHora(evidencia.enviadaEm)})`,
                ] as const,
            )}
            acao={decidirPedidoAcao}
          />
        </Secao>
      ) : null}

      {!administrador ? (
        <p className="text-sm text-neutral-700">
          Conferência, evidências e decisão ficam com o administrador da
          plataforma.
        </p>
      ) : null}

      <p>
        <Link href="/admin/adesoes" className={LINK}>
          Voltar aos pedidos
        </Link>
      </p>
    </Pagina>
  );
}
