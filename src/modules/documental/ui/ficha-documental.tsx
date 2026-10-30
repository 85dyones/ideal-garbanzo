/**
 * Exibição da ficha documental (I3.6), na tela do fornecedor e na da
 * administração: o estado de cada categoria e, abaixo, cada informação com a
 * própria origem; as consultas da etapa "Consultas"; e o aviso próprio do
 * impedimento de transferência. As regras de texto ficam em `ficha.ts`.
 *
 * O estado aparece sem rótulo de origem; a origem acompanha cada declaração,
 * consulta e documento, um rótulo por informação (§6.5). A evidência abre por
 * botão, que chama o servidor: nenhuma URL vai para o HTML de antemão.
 */
import type { ReactNode } from "react";
import { formatarDataHora } from "@/app/_apoio/datas";
import type { AcaoDoFormulario } from "@/app/_apoio/formulario";
import { Aviso, Vazio } from "@/components/estados";
import { LINK } from "@/components/estilos";
import type { ImpedimentoRegistrado } from "../queries/registros";
import { ROTULO_DA_ORIGEM, type Origem } from "../rules/estados";
import {
  TEXTO_DOCUMENTAL,
  autoriaDaConsulta,
  autoriaDaRevisao,
  ressalvaDoImpedimento,
  textoDaRevisaoAberta,
  textoDaSubstituicao,
  textoDoImpedimentoNaCategoria,
  type CategoriaNaFicha,
  type ConsultaNaFicha,
} from "./ficha";
import { AberturaDaEvidencia } from "./formularios";

type NomeDe = (perfilId: string) => string | undefined;

const RESUMO_DO_DETALHE =
  "cursor-pointer text-sm text-marinho-600 underline hover:text-marinho-800";

/** Âncora do aviso próprio do impedimento, na seção "Situação". */
export const ANCORA_DO_IMPEDIMENTO = "#impedimento-de-transferencia";

/** Link no tom de bloqueio do aviso do impedimento. */
const LINK_DE_BLOQUEIO =
  "font-medium text-red-900 underline visited:text-red-900 hover:text-red-950";

function comMaiuscula(texto: string): string {
  return `${texto.charAt(0).toUpperCase()}${texto.slice(1)}`;
}

/** Rótulo da origem de uma informação; um por informação, nunca combinado. */
function RotuloDaOrigem({
  origem,
  atenuado = false,
}: {
  readonly origem: Origem;
  /** Na consulta substituída, em neutro (TV-I3.6-05). */
  readonly atenuado?: boolean;
}) {
  return (
    <p
      className={`text-xs font-semibold uppercase tracking-wide ${
        atenuado ? "text-neutral-600" : "text-marinho-700"
      }`}
      data-origem={origem}
    >
      Origem: {ROTULO_DA_ORIGEM[origem]}
    </p>
  );
}

/**
 * Pendência do impedimento na lista do que falta, no lugar da condição
 * "sem impedimento de transferência ativo" (TV-I3.6-04): o que fazer, com o
 * link para o aviso, no tom de bloqueio dele.
 */
export function PendenciaDoImpedimento() {
  return (
    <a href={ANCORA_DO_IMPEDIMENTO} className={LINK_DE_BLOQUEIO}>
      {TEXTO_DOCUMENTAL.pendenciaDoImpedimento}
    </a>
  );
}

/**
 * Resumo proporcional (§6.4). Quando cita "sem apontamentos nas fontes
 * consultadas", leva à ficha, onde estão a fonte e a data de cada consulta
 * (TV-I3.6-07; R-I3.7-12).
 */
export function ResumoPorCategoria({
  resumo,
  comSemApontamentos,
  hrefDaFicha,
}: {
  readonly resumo: string;
  readonly comSemApontamentos: boolean;
  readonly hrefDaFicha: string;
}) {
  if (resumo === "") return null;
  return (
    <p data-resumo-por-categoria="">
      Resumo por categoria: <strong>{resumo}</strong>
      {comSemApontamentos ? (
        <>
          {" "}
          (
          <a href={hrefDaFicha} className={LINK}>
            {TEXTO_DOCUMENTAL.fontesEDatasNaFicha}
          </a>
          )
        </>
      ) : null}
      .
    </p>
  );
}

function CartaoDaConsulta({
  consulta,
  nomeDe,
  abrirEvidencia,
  substituida = false,
}: {
  readonly consulta: ConsultaNaFicha;
  readonly nomeDe: NomeDe;
  readonly abrirEvidencia: AcaoDoFormulario;
  /** A substituída fica com menos peso que a vigente, e com a marca no início (TV-I3.6-05). */
  readonly substituida?: boolean;
}) {
  const secundario = substituida ? "text-neutral-600" : "text-neutral-700";
  return (
    <div
      className={`flex flex-col gap-1 text-sm ${substituida ? "text-neutral-600" : ""}`}
      data-consulta={consulta.id}
      data-substituida={substituida ? "" : undefined}
    >
      {substituida ? (
        <p>
          <span className="inline-block rounded border border-neutral-400 bg-neutral-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-neutral-600">
            {TEXTO_DOCUMENTAL.substituida}
          </span>
        </p>
      ) : null}
      <RotuloDaOrigem origem={consulta.origem} atenuado={substituida} />
      <p className={substituida ? undefined : "text-base"}>
        <span className={substituida ? undefined : "font-medium"}>
          {consulta.fonte}
        </span>{" "}
        · {consulta.rotuloDoTipoDeFonte} · consulta em{" "}
        {formatarDataHora(consulta.realizadaEm)}
      </p>
      <p data-resultado={consulta.resultado}>
        Resultado:{" "}
        <strong className={substituida ? "font-medium" : undefined}>
          {consulta.rotuloDoResultado}
        </strong>
      </p>
      {consulta.explicacaoDoResultado === null ? null : (
        <p className={secundario}>
          {comMaiuscula(consulta.explicacaoDoResultado)}
        </p>
      )}
      <p className="break-words">Resumo: {consulta.resumo}</p>
      <p className="break-words">
        Limitações conhecidas: {consulta.limitacoes}
      </p>
      {consulta.protocolo === null ? null : (
        <p className="break-words">Protocolo: {consulta.protocolo}</p>
      )}
      <p className={secundario}>{autoriaDaConsulta(consulta, nomeDe)}</p>
      {consulta.substituidaPor === null ? null : (
        <p className={secundario}>
          {textoDaSubstituicao(consulta.substituidaPor)}
        </p>
      )}
      {/* Sem evidência, uma linha própria no lugar do botão (P2; TV-I3.6-06). */}
      {consulta.evidenciaId === null ? (
        <p data-evidencia="sem">{TEXTO_DOCUMENTAL.linhaSemEvidencia}</p>
      ) : (
        <AberturaDaEvidencia
          evidenciaId={consulta.evidenciaId}
          rotulo="Abrir a evidência"
          acao={abrirEvidencia}
        />
      )}
    </div>
  );
}

function Detalhes({
  resumo,
  children,
}: {
  readonly resumo: string;
  readonly children: ReactNode;
}) {
  return (
    <details className="flex flex-col gap-2">
      <summary className={RESUMO_DO_DETALHE}>{resumo}</summary>
      <div className="mt-2 border-l-2 border-neutral-200 pl-3">{children}</div>
    </details>
  );
}

function BlocoDaCategoria({
  categoria,
  nomeDe,
  abrirEvidencia,
  completo,
}: {
  readonly categoria: CategoriaNaFicha;
  readonly nomeDe: NomeDe;
  readonly abrirEvidencia: AcaoDoFormulario;
  /** A ficha mostra declaração e revisões; a etapa "Consultas", só as consultas. */
  readonly completo: boolean;
}) {
  const { declaracao } = categoria;
  return (
    <li
      className="flex flex-col gap-2 rounded border border-neutral-200 p-3"
      data-categoria={categoria.categoria}
    >
      <h3 className="font-semibold">{categoria.rotulo}</h3>
      <p className="break-words" data-estado={categoria.estado}>
        Estado: <strong>{categoria.textoDoEstado}</strong>
      </p>
      {categoria.revisaoAberta === null ? null : (
        <p
          className="break-words rounded border-l-4 border-amber-500 bg-amber-50 p-2 text-sm text-amber-950"
          data-revisao-aberta=""
        >
          {textoDaRevisaoAberta(categoria.revisaoAberta)}
        </p>
      )}
      {!completo || categoria.impedimento === null ? null : (
        <p
          className={`break-words text-sm ${
            categoria.impedimento.ativo
              ? "font-medium text-red-900"
              : "text-neutral-700"
          }`}
          data-impedimento-na-categoria={
            categoria.impedimento.ativo ? "ativo" : "resolvido"
          }
        >
          {textoDoImpedimentoNaCategoria(categoria.impedimento)} (
          <a
            href={ANCORA_DO_IMPEDIMENTO}
            className={categoria.impedimento.ativo ? LINK_DE_BLOQUEIO : LINK}
          >
            {TEXTO_DOCUMENTAL.vejaSituacao}
          </a>
          )
        </p>
      )}
      <ul
        aria-label={`Informações de ${categoria.rotulo}`}
        className="flex flex-col divide-y divide-neutral-200 border-t border-neutral-200"
      >
        {completo && declaracao !== null ? (
          <li className="flex flex-col gap-1 py-2 text-sm">
            <RotuloDaOrigem origem="supplier_declaration" />
            <p className="text-base">
              Declaração: <strong>{declaracao.rotulo}</strong>, em{" "}
              {formatarDataHora(declaracao.declaradaEm)}.
            </p>
            {declaracao.detalhe === null ? null : (
              <p className="break-words">Detalhe: {declaracao.detalhe}</p>
            )}
          </li>
        ) : null}
        {categoria.consultas.map((consulta) => (
          <li key={consulta.id} className="py-2">
            <CartaoDaConsulta
              consulta={consulta}
              nomeDe={nomeDe}
              abrirEvidencia={abrirEvidencia}
            />
          </li>
        ))}
        {completo && categoria.semInformacao ? (
          <li className="flex flex-col gap-1 py-2 text-sm">
            <RotuloDaOrigem origem="unconfirmed" />
            <p>{TEXTO_DOCUMENTAL.semInformacao}</p>
          </li>
        ) : null}
      </ul>
      {categoria.anteriores.length === 0 ? null : (
        <Detalhes
          resumo={`${TEXTO_DOCUMENTAL.consultasSubstituidas} (${String(categoria.anteriores.length)})`}
        >
          <ul className="flex flex-col divide-y divide-neutral-200">
            {categoria.anteriores.map((consulta) => (
              <li key={consulta.id} className="py-2">
                <CartaoDaConsulta
                  consulta={consulta}
                  nomeDe={nomeDe}
                  abrirEvidencia={abrirEvidencia}
                  substituida
                />
              </li>
            ))}
          </ul>
        </Detalhes>
      )}
      {!completo || categoria.revisoes.length === 0 ? null : (
        <Detalhes
          resumo={`${TEXTO_DOCUMENTAL.historicoDasRevisoes} (${String(categoria.revisoes.length)})`}
        >
          <ul
            aria-label={`Revisões de ${categoria.rotulo}`}
            className="flex flex-col divide-y divide-neutral-200"
          >
            {categoria.revisoes.map((revisao) => (
              <li key={revisao.id} className="flex flex-col gap-1 py-2 text-sm">
                <p>{autoriaDaRevisao(revisao, nomeDe)}</p>
                <p className="break-words text-neutral-700">
                  Motivo: {revisao.motivo}
                </p>
              </li>
            ))}
          </ul>
        </Detalhes>
      )}
    </li>
  );
}

export interface DocumentoNaFicha {
  readonly id: string;
  /** Rótulo do tipo, já em texto de leitura. */
  readonly tipo: string;
  readonly descricao: string | null;
  readonly enviadoEm: string;
}

/**
 * A ficha documental: o estado de cada categoria, as informações com a
 * própria origem e os documentos anexados, que não têm categoria (E9).
 */
export function FichaDocumental({
  ficha,
  documentos,
  nomeDe,
  abrirEvidencia,
  ondeAbrirOsDocumentos,
}: {
  readonly ficha: readonly CategoriaNaFicha[];
  readonly documentos: readonly DocumentoNaFicha[];
  readonly nomeDe: NomeDe;
  readonly abrirEvidencia: AcaoDoFormulario;
  /** Link para onde os documentos abrem (etapa ou seção). */
  readonly ondeAbrirOsDocumentos?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-neutral-700">
        {TEXTO_DOCUMENTAL.introducaoDaFicha}
      </p>
      {ficha.length === 0 ? (
        <Vazio>{TEXTO_DOCUMENTAL.semCategorias}</Vazio>
      ) : (
        <ul aria-label="Categorias documentais" className="flex flex-col gap-3">
          {ficha.map((categoria) => (
            <BlocoDaCategoria
              key={categoria.categoria}
              categoria={categoria}
              nomeDe={nomeDe}
              abrirEvidencia={abrirEvidencia}
              completo
            />
          ))}
        </ul>
      )}
      <section
        aria-labelledby="titulo-documentos-da-ficha"
        className="flex flex-col gap-2"
      >
        <h3 id="titulo-documentos-da-ficha" className="font-semibold">
          Documentos anexados
        </h3>
        <p className="text-sm text-neutral-700">
          {TEXTO_DOCUMENTAL.documentosSemCategoria}
        </p>
        {documentos.length === 0 ? (
          <p className="text-sm text-neutral-700">
            {TEXTO_DOCUMENTAL.semDocumentos}
          </p>
        ) : (
          <ul
            aria-label="Documentos anexados"
            className="flex flex-col divide-y divide-neutral-200"
          >
            {documentos.map((documento) => (
              <li key={documento.id} className="flex flex-col gap-1 py-2">
                <RotuloDaOrigem origem="attached_document" />
                <p className="break-words text-sm">
                  {documento.tipo}
                  {documento.descricao === null
                    ? ""
                    : ` (${documento.descricao})`}{" "}
                  · enviado em {formatarDataHora(documento.enviadoEm)}
                </p>
              </li>
            ))}
          </ul>
        )}
        {ondeAbrirOsDocumentos ?? null}
      </section>
      <p className="text-sm text-neutral-700">
        {TEXTO_DOCUMENTAL.explicacaoDaOrigem}
      </p>
    </div>
  );
}

/** As consultas da oferta por categoria, vigentes e substituídas (etapa "Consultas"). */
export function ConsultasPorCategoria({
  ficha,
  nomeDe,
  abrirEvidencia,
  vazio,
}: {
  readonly ficha: readonly CategoriaNaFicha[];
  readonly nomeDe: NomeDe;
  readonly abrirEvidencia: AcaoDoFormulario;
  readonly vazio: string;
}) {
  const comConsultas = ficha.filter(
    (categoria) =>
      categoria.consultas.length > 0 || categoria.anteriores.length > 0,
  );
  if (comConsultas.length === 0) return <Vazio>{vazio}</Vazio>;
  return (
    <ul aria-label="Consultas por categoria" className="flex flex-col gap-3">
      {comConsultas.map((categoria) => (
        <BlocoDaCategoria
          key={categoria.categoria}
          categoria={categoria}
          nomeDe={nomeDe}
          abrirEvidencia={abrirEvidencia}
          completo={false}
        />
      ))}
    </ul>
  );
}

/**
 * Aviso próprio do impedimento de transferência (§6.11; E24), separado das
 * pendências documentais. Ativo, diz que a oferta não é enviada, publicada
 * nem reservada e fica fora do catálogo (D9; P4). Os resolvidos ficam
 * listados, com o motivo e a evidência.
 */
export function ImpedimentosDaOferta({
  impedimentos,
  nomeDe,
  abrirEvidencia,
}: {
  readonly impedimentos: readonly ImpedimentoRegistrado[];
  readonly nomeDe: NomeDe;
  readonly abrirEvidencia: AcaoDoFormulario;
}) {
  if (impedimentos.length === 0) return null;
  const ativos = impedimentos.filter((impedimento) => impedimento.ativo);
  const resolvidos = impedimentos.filter((impedimento) => !impedimento.ativo);
  return (
    <div
      id={ANCORA_DO_IMPEDIMENTO.slice(1)}
      className="flex scroll-mt-4 flex-col gap-3"
      data-impedimento={ativos.length > 0 ? "ativo" : "resolvido"}
    >
      {ativos.length === 0 ? null : (
        <Aviso tom="bloqueio">
          <section
            aria-labelledby="titulo-impedimento-ativo"
            className="flex flex-col gap-2"
          >
            <h3 id="titulo-impedimento-ativo" className="font-semibold">
              {TEXTO_DOCUMENTAL.impedimento}
            </h3>
            <p>{ressalvaDoImpedimento()}</p>
            <p className="font-medium">
              {TEXTO_DOCUMENTAL.efeitoDoImpedimento}
            </p>
            <ul className="list-disc pl-5">
              {ativos.map((impedimento) => (
                <li key={impedimento.id} className="break-words">
                  {impedimento.base} (identificado em{" "}
                  {formatarDataHora(impedimento.identificadoEm)})
                </li>
              ))}
            </ul>
            <p className="text-sm">
              {TEXTO_DOCUMENTAL.separadoDasPendencias}{" "}
              {TEXTO_DOCUMENTAL.resolucaoPelaAdministracao}
            </p>
          </section>
        </Aviso>
      )}
      {resolvidos.length === 0 ? null : (
        <Aviso>
          <section
            aria-labelledby="titulo-impedimentos-resolvidos"
            className="flex flex-col gap-2"
          >
            <h3 id="titulo-impedimentos-resolvidos" className="font-semibold">
              {TEXTO_DOCUMENTAL.impedimentosResolvidos}
            </h3>
            <ul
              aria-label={TEXTO_DOCUMENTAL.impedimentosResolvidos}
              className="flex flex-col divide-y divide-marinho-200"
            >
              {resolvidos.map((impedimento) => {
                const nome =
                  impedimento.resolvidoPor === null
                    ? undefined
                    : nomeDe(impedimento.resolvidoPor);
                return (
                  <li
                    key={impedimento.id}
                    className="flex flex-col gap-1 py-2 text-sm"
                  >
                    <p className="break-words">{impedimento.base}</p>
                    <p>
                      Identificado em{" "}
                      {formatarDataHora(impedimento.identificadoEm)}; resolvido
                      pela administração da plataforma
                      {nome === undefined ? "" : ` (${nome})`} em{" "}
                      {formatarDataHora(impedimento.resolvidoEm)}.
                    </p>
                    {impedimento.motivoDaResolucao === null ? null : (
                      <p className="break-words">
                        Motivo: {impedimento.motivoDaResolucao}
                      </p>
                    )}
                    {impedimento.evidenciaDaResolucao === null ? null : (
                      <AberturaDaEvidencia
                        evidenciaId={impedimento.evidenciaDaResolucao}
                        rotulo="Abrir a evidência da regularização"
                        acao={abrirEvidencia}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </Aviso>
      )}
    </div>
  );
}
