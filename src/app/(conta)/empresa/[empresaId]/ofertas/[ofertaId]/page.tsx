import type { Metadata } from "next";
import Link from "next/link";
import {
  alterarValidadeAcao,
  cancelarEnvioAcao,
  confirmarDisponibilidadeAcao,
  liberarReservaAcao,
  publicarOfertaAcao,
  reabrirOfertaAcao,
  reservarOfertaAcao,
  retirarOfertaAcao,
} from "@/app/_acoes/ofertas";
import { formatarDataHora } from "@/app/_apoio/datas";
import {
  formatarPreco,
  formatarValidade,
  limitesDaValidade,
  validadeParaCampo,
  validadeVencida,
} from "@/app/_apoio/oferta";
import {
  PaginaDaOferta,
  caminhoDaOferta,
  carregarOferta,
} from "@/app/_apoio/oferta-da-pagina";
import { Aviso } from "@/components/estados";
import { LINK } from "@/components/estilos";
import { Dados, Secao } from "@/components/pagina";
import { dependenciasDaLeitura } from "@/modules/offers/queries/dependencias";
import {
  contarDocumentos,
  contarFotos,
  lerConfiguracaoDaOferta,
  lerEstadosDocumentais,
  lerPendencias,
  listarRevisoes,
  outrasOfertasComAPlaca,
} from "@/modules/offers/queries/ofertas";
import {
  podeConfirmarDisponibilidade,
  vencidaAntesDaExpiracao,
} from "@/modules/offers/rules/edicao";
import { ROTULO_DA_CATEGORIA_DA_SUSPENSAO } from "@/modules/offers/rules/oferta";
import {
  ROTULO_DO_STATUS,
  transicaoDaOferta,
  type IdDaTransicao,
  type StatusDaOferta,
} from "@/modules/offers/rules/transicoes";
import {
  AcaoDaOferta,
  AlteracaoDaValidade,
  Publicacao,
  Retirada,
} from "@/modules/offers/ui/acoes-da-oferta";
import {
  comoItem,
  etapaDaPendencia,
  pendenciasPorEtapa,
} from "@/modules/offers/ui/etapas";
import {
  ETAPAS_DA_OFERTA,
  TEXTO,
  orientacaoDoStatus,
} from "@/modules/offers/ui/rotulos";

export const metadata: Metadata = { title: "Oferta" };

function contagem(quantidade: number, singular: string, plural: string) {
  return `${String(quantidade)} ${quantidade === 1 ? singular : plural}`;
}

/**
 * Resumo e envio da oferta (I2.8): situação, o que a pessoa pode fazer, as
 * etapas do cadastro, o que falta para enviar e o aviso documental. Pendência
 * documental nunca bloqueia o envio; falta de dado obrigatório, sim (§6.2).
 */
export default async function PaginaDoResumoDaOferta({
  params,
}: {
  readonly params: Promise<{ empresaId: string; ofertaId: string }>;
}) {
  const { empresaId, ofertaId } = await params;
  const carga = await carregarOferta(empresaId, ofertaId, "");
  if (!carga.ok) return carga.resposta;
  const { sessao, oferta, ator, base, editavel } = carga;
  const dependencias = dependenciasDaLeitura(sessao);
  const [
    configuracao,
    estados,
    pendencias,
    fotos,
    documentos,
    revisoes,
    mesmaPlaca,
  ] = await Promise.all([
    lerConfiguracaoDaOferta(sessao),
    lerEstadosDocumentais(dependencias, oferta.id),
    lerPendencias(dependencias, oferta.id),
    contarFotos(sessao, oferta.id),
    contarDocumentos(sessao, oferta.id),
    listarRevisoes(sessao, oferta.id),
    outrasOfertasComAPlaca(sessao, oferta),
  ]);

  const vencida = validadeVencida(oferta.validaAte);
  const pode = (para: StatusDaOferta, ids: readonly IdDaTransicao[]) => {
    const transicao = transicaoDaOferta(oferta.status, para, ator, {
      revisaoExigida: configuracao.revisaoExigida,
      validadeVencida: vencida,
    });
    return transicao !== undefined && ids.includes(transicao.id);
  };
  const podePublicar =
    pode("under_review", ["T03"]) || pode("published", ["T06"]);
  const publicadaOuReservada =
    oferta.status === "published" || oferta.status === "reserved";
  const ultimaRevisao = revisoes[0];
  const devolvida =
    oferta.status === "draft" && ultimaRevisao?.decisao === "returned";
  const porEtapa = pendenciasPorEtapa(pendencias);
  const declaradas = estados.categorias.filter(
    (item) =>
      configuracao.categorias.includes(item.categoria) &&
      item.declaracao !== null,
  ).length;
  const verbo = configuracao.revisaoExigida ? "enviar" : "publicar";
  const limites = limitesDaValidade(configuracao.validadeMaximaEmDias);

  const situacaoDaEtapa: Readonly<Record<string, string>> = {
    veiculo:
      porEtapa.veiculo === undefined
        ? "Completo"
        : `Falta: ${porEtapa.veiculo.join(", ")}.`,
    fotos:
      fotos === 0
        ? "Nenhuma foto (opcional)"
        : contagem(fotos, "foto", "fotos"),
    condicoes:
      porEtapa.condicoes === undefined
        ? "Completo"
        : `Falta: ${porEtapa.condicoes.join(", ")}.`,
    declaracoes: `${String(declaradas)} de ${String(configuracao.categorias.length)} categorias declaradas`,
    documentos:
      documentos === 0
        ? "Nenhum documento (opcional)"
        : contagem(documentos, "documento", "documentos"),
  };

  return (
    <PaginaDaOferta carga={carga} atual="resumo">
      <Secao titulo="Situação">
        <p>
          {orientacaoDoStatus(
            oferta.status,
            ator,
            vencidaAntesDaExpiracao(oferta.status, vencida),
          )}
        </p>
        {oferta.status === "suspended" ? (
          <Aviso tom="alerta">
            Suspensa pela plataforma em {formatarDataHora(oferta.suspensaEm)}.
            {oferta.categoriaDaSuspensao === null
              ? ""
              : ` Categoria: ${ROTULO_DA_CATEGORIA_DA_SUSPENSAO[oferta.categoriaDaSuspensao]}.`}
            {oferta.motivoDaSuspensao === null
              ? ""
              : ` Motivo: ${oferta.motivoDaSuspensao}`}
          </Aviso>
        ) : null}
        {oferta.status === "withdrawn" ? (
          <Aviso>
            Retirada em {formatarDataHora(oferta.retiradaEm)}.
            {oferta.motivoDaRetirada === null
              ? ""
              : ` Motivo: ${oferta.motivoDaRetirada}`}
          </Aviso>
        ) : null}
        {devolvida ? (
          <Aviso tom="alerta">
            A plataforma devolveu a oferta para ajustes em{" "}
            {formatarDataHora(ultimaRevisao.revisadaEm)}.
            {ultimaRevisao.motivo === null
              ? ""
              : ` Motivo: ${ultimaRevisao.motivo}`}
          </Aviso>
        ) : null}
        {publicadaOuReservada && vencida ? (
          <Aviso tom="alerta">{TEXTO.validadeVencida}</Aviso>
        ) : null}
        {mesmaPlaca.length > 0 ? (
          <Aviso tom="alerta">
            <p>{TEXTO.placaRepetida}</p>
            <ul className="mt-1 list-disc pl-5">
              {mesmaPlaca.map((outra) => (
                <li key={outra.id}>
                  <Link
                    href={caminhoDaOferta(carga.empresa.id, outra.id)}
                    className={LINK}
                  >
                    Oferta {ROTULO_DO_STATUS[outra.status].toLowerCase()}
                  </Link>
                </li>
              ))}
            </ul>
          </Aviso>
        ) : null}
        <Dados
          itens={[
            ["Situação", ROTULO_DO_STATUS[oferta.status]],
            [
              "Versão vigente",
              oferta.versaoAtual === null ? "—" : String(oferta.versaoAtual),
            ],
            ["Preço", formatarPreco(oferta.preco)],
            ["Válida até", formatarValidade(oferta.validaAte)],
            ["Publicada em", formatarDataHora(oferta.publicadaEm)],
            [
              "Disponibilidade confirmada em",
              formatarDataHora(oferta.disponibilidadeConfirmadaEm),
            ],
            ["Criada em", formatarDataHora(oferta.criadaEm)],
            ["Atualizada em", formatarDataHora(oferta.atualizadaEm)],
          ]}
        />
        <div className="flex flex-wrap items-start gap-3">
          {pode("draft", ["T18"]) ? (
            <AcaoDaOferta
              ofertaId={oferta.id}
              rotulo="Cancelar o envio"
              acao={cancelarEnvioAcao}
            />
          ) : null}
          {podeConfirmarDisponibilidade(oferta.status, ator, vencida) ? (
            <AcaoDaOferta
              ofertaId={oferta.id}
              rotulo="Confirmar a disponibilidade"
              acao={confirmarDisponibilidadeAcao}
            />
          ) : null}
          {pode("reserved", ["T08"]) ? (
            <AcaoDaOferta
              ofertaId={oferta.id}
              rotulo="Reservar"
              acao={reservarOfertaAcao}
            />
          ) : null}
          {pode("published", ["T09"]) ? (
            <AcaoDaOferta
              ofertaId={oferta.id}
              rotulo="Liberar a reserva"
              acao={liberarReservaAcao}
            />
          ) : null}
          {pode("draft", ["T13", "T19"]) ? (
            <AcaoDaOferta
              ofertaId={oferta.id}
              rotulo="Reabrir como rascunho"
              principal
              acao={reabrirOfertaAcao}
            />
          ) : null}
        </div>
        {publicadaOuReservada && editavel ? (
          <AlteracaoDaValidade
            ofertaId={oferta.id}
            validaAte={validadeParaCampo(oferta.validaAte)}
            minimo={limites.minimo}
            maximo={limites.maximo}
            dica={
              limites.maximoParaLeitura === null
                ? TEXTO.validade
                : `${TEXTO.validade} Escolha uma data até ${limites.maximoParaLeitura}.`
            }
            acao={alterarValidadeAcao}
          />
        ) : null}
      </Secao>

      <Secao titulo="Etapas do cadastro">
        <ol className="flex flex-col gap-2">
          {ETAPAS_DA_OFERTA.filter(
            (etapa) => situacaoDaEtapa[etapa.chave] !== undefined,
          ).map((etapa) => (
            <li
              key={etapa.chave}
              className="flex flex-col sm:flex-row sm:gap-2"
            >
              <Link href={`${base}${etapa.caminho}`} className={LINK}>
                {etapa.rotulo}
              </Link>
              <span className="text-sm text-neutral-700">
                {situacaoDaEtapa[etapa.chave]}
              </span>
            </li>
          ))}
        </ol>
      </Secao>

      <Secao titulo={oferta.status === "draft" ? "Envio" : "Estado documental"}>
        {oferta.status === "draft" ? (
          <section
            aria-labelledby="titulo-pendencias"
            className="flex flex-col gap-2"
          >
            <h3 id="titulo-pendencias" className="font-semibold">
              O que falta para {verbo}
            </h3>
            {pendencias.length === 0 ? (
              <p>Nada falta: os dados obrigatórios estão preenchidos.</p>
            ) : (
              <Aviso tom="bloqueio">
                <p>O envio fica bloqueado até completar:</p>
                <ul className="mt-1 list-disc pl-5">
                  {pendencias.map((pendencia) => {
                    const etapa = ETAPAS_DA_OFERTA.find(
                      (item) =>
                        item.chave === etapaDaPendencia(pendencia.codigo),
                    );
                    return (
                      <li key={pendencia.codigo}>
                        {etapa === undefined ? (
                          comoItem(pendencia.rotulo)
                        ) : (
                          <Link
                            href={`${base}${etapa.caminho}`}
                            className={LINK}
                          >
                            {comoItem(pendencia.rotulo)}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Aviso>
            )}
          </section>
        ) : null}

        <section
          aria-labelledby="titulo-aviso-documental"
          className="flex flex-col gap-2"
        >
          <h3 id="titulo-aviso-documental" className="font-semibold">
            Aviso documental
          </h3>
          {estados.avisos.length === 0 ? (
            <p>Nenhuma ressalva documental nas declarações atuais.</p>
          ) : (
            <Aviso tom="alerta">
              <p>Estas ressalvas acompanham a versão da oferta:</p>
              <ul className="mt-1 list-disc pl-5">
                {estados.avisos.map((aviso) => (
                  <li key={aviso.codigo}>{aviso.texto}</li>
                ))}
              </ul>
            </Aviso>
          )}
          {estados.resumo === "" ? null : (
            <p>
              Resumo por categoria: <strong>{estados.resumo}</strong>.
            </p>
          )}
          {oferta.status === "draft" ? (
            <p className="font-medium">{TEXTO.pendenciaNaoImpede}</p>
          ) : null}
          <p>
            <Link href={`${base}/declaracoes`} className={LINK}>
              Ver o estado de cada categoria
            </Link>
          </p>
        </section>

        {oferta.status === "draft" ? (
          podePublicar ? (
            <section
              aria-labelledby="titulo-envio"
              className="flex flex-col gap-2"
            >
              <h3 id="titulo-envio" className="font-semibold">
                {configuracao.revisaoExigida
                  ? "Enviar para revisão"
                  : "Publicar"}
              </h3>
              <p className="text-sm text-neutral-700">
                {configuracao.revisaoExigida
                  ? TEXTO.revisaoAtiva
                  : TEXTO.revisaoInativa}
              </p>
              {pendencias.length > 0 ? (
                <p className="text-sm text-amber-900">
                  Complete o que falta para liberar o botão.
                </p>
              ) : null}
              <Publicacao
                ofertaId={oferta.id}
                rotuloDoBotao={
                  configuracao.revisaoExigida
                    ? "Enviar para revisão"
                    : "Publicar"
                }
                bloqueada={pendencias.length > 0}
                acao={publicarOfertaAcao}
              />
            </section>
          ) : (
            <p className="text-sm text-neutral-700">
              {TEXTO.envioSoDoAdministrador}
            </p>
          )
        ) : null}
      </Secao>

      {pode("withdrawn", ["T11"]) ? (
        <Secao titulo="Outras ações">
          <Retirada
            ofertaId={oferta.id}
            rascunho={oferta.status === "draft"}
            acao={retirarOfertaAcao}
          />
        </Secao>
      ) : null}

      <p>
        <Link href={`${base}/historico`} className={LINK}>
          Ver o histórico da oferta
        </Link>
      </p>
    </PaginaDaOferta>
  );
}
