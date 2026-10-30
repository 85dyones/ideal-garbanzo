import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  abrirEvidenciaAcao,
  abrirRevisaoDocumentalAcao,
  fecharRevisaoDocumentalAcao,
  registrarConsultaAcao,
  resolverImpedimentoAcao,
} from "@/app/_acoes/documental";
import { abrirDocumentoAcao } from "@/app/_acoes/ofertas";
import {
  liberarReservaPelaPlataformaAcao,
  reativarOfertaAcao,
  reservarOfertaPelaPlataformaAcao,
  retirarOfertaPelaPlataformaAcao,
  revisarOfertaAcao,
  suspenderOfertaAcao,
} from "@/app/_acoes/ofertas-da-plataforma";
import { formatarDataHora } from "@/app/_apoio/datas";
import { lerFiltro } from "@/app/_apoio/filtro";
import { formatarValidade, validadeVencida } from "@/app/_apoio/oferta";
import { caminhoDaOferta } from "@/app/_apoio/oferta-da-pagina";
import {
  Aviso,
  RegistroInexistente,
  SemPermissao,
  Vazio,
} from "@/components/estados";
import { LINK } from "@/components/estilos";
import { Dados, Pagina, Secao } from "@/components/pagina";
import { id as campoId } from "@/lib/operacao/campos";
import { verificarAcesso } from "@/modules/auth/queries/acesso";
import { listarPerfisPorId } from "@/modules/auth/queries/perfis";
import { ehDaEquipeDaPlataforma } from "@/modules/auth/rules/permissoes";
import {
  lerRegistrosDocumentais,
  pessoasDosRegistros,
} from "@/modules/documental/queries/registros";
import { rotuloDaCategoria } from "@/modules/documental/rules/estados";
import {
  ehDaEquipeSemVinculo,
  podeRegistrarConsulta,
  podeResolverImpedimento,
  podeRevisarDocumentacao,
} from "@/modules/documental/rules/registro";
import {
  TEXTO_DOCUMENTAL,
  consultasSubstituiveis,
  impedimentosAtivos,
  montarFicha,
  ressalvasSemImpedimento,
  resumoTemSemApontamentos,
} from "@/modules/documental/ui/ficha";
import {
  FichaDocumental,
  ImpedimentosDaOferta,
  PendenciaDoImpedimento,
  ResumoPorCategoria,
} from "@/modules/documental/ui/ficha-documental";
import {
  MudancaDaRevisao,
  RegistroDeConsulta,
  ResolucaoDoImpedimento,
} from "@/modules/documental/ui/formularios";
import { dependenciasDaLeitura } from "@/modules/offers/queries/dependencias";
import {
  lerConfiguracaoDaOferta,
  lerEstadosDocumentais,
  lerPendencias,
  listarDocumentos,
  listarFotos,
  listarHistorico,
  listarVersoes,
  obterOferta,
  type MudancaDeCampo,
} from "@/modules/offers/queries/ofertas";
import { listarRevisoesDaPlataforma } from "@/modules/offers/queries/plataforma";
import { ROTULO_DA_CATEGORIA_DA_SUSPENSAO } from "@/modules/offers/rules/oferta";
import { ROTULO_DO_STATUS } from "@/modules/offers/rules/transicoes";
import { AcaoDaOferta } from "@/modules/offers/ui/acoes-da-oferta";
import {
  AcaoComMotivo,
  RevisaoPelaPlataforma,
  SuspensaoPelaPlataforma,
} from "@/modules/offers/ui/acoes-da-plataforma";
import { AberturaDeDocumento } from "@/modules/offers/ui/arquivos";
import { DadosDasCondicoes, DadosDoVeiculo } from "@/modules/offers/ui/dados";
import {
  SEM_NOME,
  SISTEMA,
  eventosDoHistorico,
  pessoasDoHistorico,
} from "@/modules/offers/ui/historico";
import {
  MENSAGEM_DO_RESULTADO,
  TEXTO_DA_PLATAFORMA,
  ehResultadoDaPlataforma,
  resultadoConfereComStatus,
  situacaoDaPlataforma,
} from "@/modules/offers/ui/plataforma";
import {
  ROTULO_DA_DECISAO_DA_REVISAO,
  ROTULO_DO_TIPO_DE_DOCUMENTO,
  TEXTO,
  resumoDaMudanca,
  tituloDaOferta,
} from "@/modules/offers/ui/rotulos";
import { obterEmpresa } from "@/modules/organizations/queries/empresas";
import { ROTULO_DO_STATUS_DA_EMPRESA } from "@/modules/organizations/ui/rotulos";

export const metadata: Metadata = {
  title: "Oferta · Administração",
};

const CAMINHO_DA_FILA = "/admin/ofertas?status=under_review";

/** Seção com âncora, para a navegação no topo da página. */
function Ancora({
  id,
  children,
}: {
  readonly id: string;
  readonly children: ReactNode;
}) {
  return (
    <div id={id} className="scroll-mt-4">
      {children}
    </div>
  );
}

/**
 * Detalhe da oferta para a equipe da plataforma (I2.9; §9): leitura completa
 * numa página só, com as ações da plataforma no fim. Quem não é da equipe
 * recebe "Sem permissão" para qualquer id; id inválido ou inexistente dá
 * "Registro inexistente". A tela mostra cada ação só quando a tabela de
 * transições permite a quem vê; a operação e o banco decidem de novo.
 *
 * I3.6: a ficha documental (a mesma do fornecedor), o aviso próprio do
 * impedimento de transferência e as ações documentais da equipe: registrar
 * consulta, abrir e fechar a revisão documental e, só para o administrador,
 * resolver o impedimento (ADR-0004 §2.5, §2.9 e §2.11).
 */
export default async function PaginaDaOfertaNaAdministracao({
  params,
  searchParams,
}: {
  readonly params: Promise<{ ofertaId: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { ofertaId } = await params;
  const acesso = await verificarAcesso(
    `/admin/ofertas/${encodeURIComponent(ofertaId)}`,
    ehDaEquipeDaPlataforma,
  );
  if (!acesso.liberado) return <SemPermissao />;
  const { contexto, sessao } = acesso;
  const inexistente = (
    <RegistroInexistente
      voltarPara="/admin/ofertas"
      rotuloDaVolta="Voltar às ofertas"
    />
  );
  if (!campoId.safeParse(ofertaId).success) return inexistente;
  const oferta = await obterOferta(sessao, ofertaId);
  if (oferta === null) return inexistente;

  // O operador só lê o histórico de campos com acesso à auditoria (ADR-0003 §2.14).
  const comHistorico = contexto.podeLerAuditoria;
  const dependencias = dependenciasDaLeitura(sessao);
  const [
    empresa,
    configuracao,
    estados,
    pendencias,
    fotos,
    documentos,
    versoes,
    revisoes,
    mudancas,
    registros,
  ] = await Promise.all([
    obterEmpresa(sessao, oferta.empresaId),
    lerConfiguracaoDaOferta(sessao),
    lerEstadosDocumentais(dependencias, oferta.id),
    lerPendencias(dependencias, oferta.id),
    listarFotos(dependencias, oferta.id),
    listarDocumentos(sessao, oferta.id),
    listarVersoes(sessao, oferta.id),
    listarRevisoesDaPlataforma(sessao, oferta.id),
    comHistorico
      ? listarHistorico(sessao, oferta)
      : Promise.resolve<MudancaDeCampo[]>([]),
    lerRegistrosDocumentais(sessao, ofertaId),
  ]);
  const pessoas = await listarPerfisPorId(sessao, [
    oferta.criadaPor,
    ...versoes
      .map((versao) => versao.criadaPor)
      .filter((perfilId): perfilId is string => perfilId !== null),
    ...revisoes.map((revisao) => revisao.revisadaPor),
    ...documentos.map((documento) => documento.enviadoPor),
    ...pessoasDoHistorico(mudancas),
    ...pessoasDosRegistros(registros),
  ]);
  const nomeDe = (perfilId: string): string | undefined => {
    const perfil = pessoas.get(perfilId);
    if (perfil === undefined) return undefined;
    return perfil.nome === "" ? (perfil.email ?? undefined) : perfil.nome;
  };
  const eventos = eventosDoHistorico(mudancas, nomeDe);

  const vencida = validadeVencida(oferta.validaAte);
  const situacao = situacaoDaPlataforma(
    contexto,
    oferta.empresaId,
    oferta.status,
    {
      revisaoExigida: configuracao.revisaoExigida,
      validadeVencida: vencida,
    },
  );
  const { acoes } = situacao;

  // Ações documentais: a equipe sem vínculo com a empresa dona (B25), nos estados da E17.
  const ficha = montarFicha(estados, registros, configuracao.categorias);
  const daEquipe = ehDaEquipeSemVinculo(situacao.ator);
  const podeRegistrar = podeRegistrarConsulta(
    oferta.status,
    situacao.ator,
    vencida,
  );
  const podeRevisar = podeRevisarDocumentacao(
    oferta.status,
    situacao.ator,
    vencida,
  );
  const ativos = impedimentosAtivos(registros.impedimentos);
  const podeResolver = podeResolverImpedimento(situacao.ator);
  // A evidência da resolução segue a regra de envio da evidência da consulta.
  const resolucaoNoEstado = podeResolver && podeRegistrar;
  const abertas = new Set(
    estados.categorias
      .filter((categoria) => categoria.revisaoAberta)
      .map((categoria) => categoria.categoria),
  );
  const paraAbrir = ficha
    .filter((categoria) => !abertas.has(categoria.categoria))
    .map((categoria) => [categoria.categoria, categoria.rotulo] as const);
  const paraFechar = ficha
    .filter((categoria) => abertas.has(categoria.categoria))
    .map((categoria) => [categoria.categoria, categoria.rotulo] as const);
  const ressalvas = ressalvasSemImpedimento(estados.avisos);
  const outrasAcoes = acoes.retirar || acoes.reservar || acoes.liberar;
  const algumaAcao =
    acoes.revisar ||
    acoes.suspender ||
    acoes.reativar ||
    situacao.reativacaoComAdministrador ||
    outrasAcoes;
  const ultimaRevisao = revisoes[0];
  const devolvida =
    oferta.status === "draft" && ultimaRevisao?.decisao === "returned";
  const resultadoDoLink = lerFiltro(
    (await searchParams).resultado,
    ehResultadoDaPlataforma,
  );
  // O link pode ser forjado ou ficar velho: sem conferir com a situação atual, vale como ausente (ACH-08).
  const resultado =
    resultadoDoLink !== null &&
    resultadoConfereComStatus(resultadoDoLink, oferta.status)
      ? resultadoDoLink
      : null;
  const nomeDaEmpresa = empresa?.nome ?? "Empresa sem nome";
  // Quem revisa trabalha em sequência: da oferta em revisão ou recém-revisada, a volta é para a fila.
  const daFila =
    oferta.status === "under_review" ||
    resultado === "publicada" ||
    resultado === "devolvida";

  // As ações vêm primeiro e em destaque: é a decisão que a pessoa da equipe veio tomar.
  const secoes: readonly (readonly [string, string])[] = [
    ...(algumaAcao ? ([["acoes", "Ações da plataforma"]] as const) : []),
    ["situacao", "Situação"],
    ["veiculo", "Veículo"],
    ["condicoes", "Condições"],
    ["estados", "Ficha documental"],
    ...(daEquipe
      ? ([["acoes-documentais", "Ações documentais"]] as const)
      : []),
    ["pendencias", "Pendências"],
    ["fotos", "Fotos"],
    ["documentos", "Documentos"],
    ["versoes", "Versões e revisões"],
    ["historico", "Histórico de campos"],
  ];
  const voltarAoTopo = (
    <p className="text-sm">
      <a href="#secoes" className={LINK}>
        Voltar ao topo
      </a>
    </p>
  );

  return (
    <Pagina
      titulo={tituloDaOferta(oferta.veiculo)}
      descricao={
        <p>
          Situação:{" "}
          <strong data-situacao={oferta.status}>
            {ROTULO_DO_STATUS[oferta.status]}
          </strong>
          {oferta.versaoAtual === null
            ? ""
            : ` · versão ${String(oferta.versaoAtual)}`}{" "}
          · {nomeDaEmpresa}
          {oferta.dadosDeTeste ? " · dados de teste" : ""}
        </p>
      }
    >
      {resultado === null ? null : (
        <div role="status">
          <Aviso>
            <p>{MENSAGEM_DO_RESULTADO[resultado]}</p>
            {resultado === "publicada" || resultado === "devolvida" ? (
              <p className="mt-1">
                <Link href={CAMINHO_DA_FILA} className={LINK}>
                  {TEXTO_DA_PLATAFORMA.voltarAFila}
                </Link>
              </p>
            ) : null}
          </Aviso>
        </div>
      )}

      {situacao.conflito ? (
        <Aviso tom="alerta">
          <p>{TEXTO_DA_PLATAFORMA.conflito}</p>
          {situacao.ator === "membro" || situacao.ator === "adm_empresa" ? (
            <p className="mt-1">
              <Link
                href={caminhoDaOferta(oferta.empresaId, oferta.id)}
                className={LINK}
              >
                Abrir a oferta no painel da empresa
              </Link>
            </p>
          ) : null}
        </Aviso>
      ) : null}

      <nav id="secoes" aria-label="Seções da oferta" className="scroll-mt-4">
        <ul className="flex flex-wrap gap-2 text-sm">
          {secoes.map(([ancora, rotulo]) => (
            <li key={ancora}>
              <a
                href={`#${ancora}`}
                className={`inline-block rounded border px-3 py-1 ${
                  ancora === "acoes"
                    ? "border-amber-500 bg-amber-500 font-medium text-marinho-900"
                    : "border-neutral-400 bg-white text-marinho-900"
                }`}
              >
                {rotulo}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <Ancora id="situacao">
        <Secao titulo="Situação">
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
            <Aviso>
              Devolvida à empresa fornecedora em{" "}
              {formatarDataHora(ultimaRevisao.revisadaEm)}. Motivo:{" "}
              {ultimaRevisao.motivo ?? "—"}
            </Aviso>
          ) : null}
          {(oferta.status === "published" || oferta.status === "reserved") &&
          vencida ? (
            <Aviso tom="alerta">{TEXTO.validadeVencida}</Aviso>
          ) : null}
          <ImpedimentosDaOferta
            impedimentos={registros.impedimentos}
            nomeDe={nomeDe}
            abrirEvidencia={abrirEvidenciaAcao}
          />
          {empresa !== null && empresa.status !== "active" ? (
            <Aviso tom="alerta">
              A empresa dona está{" "}
              {ROTULO_DO_STATUS_DA_EMPRESA[empresa.status].toLowerCase()}. A
              situação da oferta não muda, mas ela não aparece para compradores
              enquanto a empresa não for reativada.
            </Aviso>
          ) : null}
          <Dados
            itens={[
              ["Situação", ROTULO_DO_STATUS[oferta.status]],
              [
                "Versão vigente",
                oferta.versaoAtual === null ? "—" : String(oferta.versaoAtual),
              ],
              [
                "Empresa",
                empresa === null ? (
                  "—"
                ) : (
                  <>
                    <Link
                      href={`/admin/empresas/${empresa.id}`}
                      className={LINK}
                    >
                      {empresa.nome}
                    </Link>
                    {` (${ROTULO_DO_STATUS_DA_EMPRESA[empresa.status].toLowerCase()})`}
                  </>
                ),
              ],
              ["Publicada em", formatarDataHora(oferta.publicadaEm)],
              ["Válida até", formatarValidade(oferta.validaAte)],
              [
                "Autorização de divulgação declarada em",
                formatarDataHora(oferta.autorizacaoDeclaradaEm),
              ],
              [
                "Criada em",
                `${formatarDataHora(oferta.criadaEm)} por ${nomeDe(oferta.criadaPor) ?? SEM_NOME}`,
              ],
              ["Atualizada em", formatarDataHora(oferta.atualizadaEm)],
              ["Dados de teste", oferta.dadosDeTeste ? "Sim" : "Não"],
            ]}
          />
        </Secao>
      </Ancora>

      <Ancora id="veiculo">
        <Secao titulo="Veículo">
          <p className="text-sm text-neutral-700">
            {TEXTO_DA_PLATAFORMA.dadosRestritos}
          </p>
          <DadosDoVeiculo veiculo={oferta.veiculo} />
        </Secao>
      </Ancora>

      <Ancora id="condicoes">
        <Secao titulo="Condições, validade e disponibilidade">
          <DadosDasCondicoes oferta={oferta} />
          <Dados
            itens={[
              [
                "Disponibilidade confirmada em",
                formatarDataHora(oferta.disponibilidadeConfirmadaEm),
              ],
            ]}
          />
        </Secao>
      </Ancora>

      <Ancora id="estados">
        <Secao titulo="Ficha documental">
          {ressalvas.length === 0 ? (
            <p>Nenhuma ressalva documental nos registros atuais.</p>
          ) : (
            <Aviso tom="alerta">
              <p>Estas ressalvas acompanham a versão da oferta:</p>
              <ul className="mt-1 list-disc pl-5">
                {ressalvas.map((aviso) => (
                  <li key={aviso.codigo}>{aviso.texto}</li>
                ))}
              </ul>
            </Aviso>
          )}
          <ResumoPorCategoria
            resumo={estados.resumo}
            comSemApontamentos={resumoTemSemApontamentos(estados)}
            hrefDaFicha="#estados"
          />
          <FichaDocumental
            ficha={ficha}
            documentos={documentos.map((documento) => ({
              id: documento.id,
              tipo: ROTULO_DO_TIPO_DE_DOCUMENTO[documento.tipo],
              descricao: documento.descricao,
              enviadoEm: documento.enviadoEm,
            }))}
            nomeDe={nomeDe}
            abrirEvidencia={abrirEvidenciaAcao}
            ondeAbrirOsDocumentos={
              <p className="text-sm">
                <a href="#documentos" className={LINK}>
                  Abrir os documentos na seção Documentos
                </a>
              </p>
            }
          />
        </Secao>
      </Ancora>

      {daEquipe ? (
        <Ancora id="acoes-documentais">
          <Secao titulo="Ações documentais">
            {registros.impedimentos.length === 0 ? null : (
              <section
                aria-labelledby="titulo-resolucao-do-impedimento"
                className="flex flex-col gap-2"
              >
                <h3
                  id="titulo-resolucao-do-impedimento"
                  className="font-semibold"
                >
                  Resolução do impedimento de transferência
                </h3>
                {!podeResolver ? (
                  ativos.length === 0 ? (
                    <p className="text-sm text-neutral-700">
                      Nenhum impedimento de transferência ativo.
                    </p>
                  ) : (
                    <Aviso>{TEXTO_DOCUMENTAL.resolucaoComAdministrador}</Aviso>
                  )
                ) : resolucaoNoEstado ? (
                  <>
                    <p className="text-sm text-neutral-700">
                      {TEXTO_DOCUMENTAL.introducaoDaResolucao}
                    </p>
                    <ResolucaoDoImpedimento
                      impedimentos={ativos.map(
                        (impedimento) =>
                          [
                            impedimento.id,
                            `${impedimento.base} (identificado em ${formatarDataHora(impedimento.identificadoEm)})`,
                          ] as const,
                      )}
                      semImpedimento="Nenhum impedimento de transferência ativo."
                      acao={resolverImpedimentoAcao}
                    />
                  </>
                ) : ativos.length === 0 ? (
                  <p className="text-sm text-neutral-700">
                    Nenhum impedimento de transferência ativo.
                  </p>
                ) : (
                  <p className="text-sm text-neutral-700">
                    {TEXTO_DOCUMENTAL.resolucaoForaDoEstado}
                  </p>
                )}
              </section>
            )}

            <section
              aria-labelledby="titulo-registro-de-consulta"
              className="flex flex-col gap-2"
            >
              <h3 id="titulo-registro-de-consulta" className="font-semibold">
                Registro de consulta
              </h3>
              {podeRegistrar ? (
                <>
                  <p className="text-sm text-neutral-700">
                    {TEXTO_DOCUMENTAL.introducaoDasConsultas}{" "}
                    {TEXTO_DOCUMENTAL.consultaReal}
                  </p>
                  <Aviso tom="alerta">
                    {TEXTO_DOCUMENTAL.dadosDoProprietario}
                  </Aviso>
                  {oferta.status === "published" ||
                  oferta.status === "reserved" ? (
                    <p className="text-sm text-neutral-700">
                      {TEXTO_DOCUMENTAL.consultaGeraVersao}
                    </p>
                  ) : null}
                  {configuracao.categorias.length === 0 ? (
                    <Vazio>Nenhuma categoria documental configurada.</Vazio>
                  ) : (
                    <RegistroDeConsulta
                      ofertaId={oferta.id}
                      categorias={configuracao.categorias.map(
                        (categoria) =>
                          [categoria, rotuloDaCategoria(categoria)] as const,
                      )}
                      substituiveis={consultasSubstituiveis(
                        ficha,
                        "plataforma",
                      )}
                      dicaDaSubstituicao={
                        TEXTO_DOCUMENTAL.dicaDaSubstituicaoDaPlataforma
                      }
                      acao={registrarConsultaAcao}
                    />
                  )}
                </>
              ) : (
                <p className="text-sm text-neutral-700">
                  {TEXTO_DOCUMENTAL.consultaForaDoEstado}
                </p>
              )}
            </section>

            <section
              aria-labelledby="titulo-revisao-documental"
              className="flex flex-col gap-2"
            >
              <h3 id="titulo-revisao-documental" className="font-semibold">
                Revisão documental
              </h3>
              {podeRevisar ? (
                <>
                  <p className="text-sm text-neutral-700">
                    {TEXTO_DOCUMENTAL.introducaoDaRevisao}
                  </p>
                  <Aviso>{TEXTO_DOCUMENTAL.revisaoNaoPorPendencia}</Aviso>
                  <MudancaDaRevisao
                    ofertaId={oferta.id}
                    titulo="Abrir revisão documental"
                    rotuloDaCategoria="Categoria para abrir a revisão"
                    opcoes={paraAbrir}
                    semOpcoes="Todas as categorias estão com revisão aberta."
                    rotuloDoMotivo="Motivo da abertura"
                    dica="O motivo aparece para a empresa fornecedora."
                    rotuloDoBotao="Abrir a revisão"
                    acao={abrirRevisaoDocumentalAcao}
                  />
                  <MudancaDaRevisao
                    ofertaId={oferta.id}
                    titulo="Fechar revisão documental"
                    rotuloDaCategoria="Categoria para fechar a revisão"
                    opcoes={paraFechar}
                    semOpcoes={TEXTO_DOCUMENTAL.semRevisaoAberta}
                    rotuloDoMotivo="Motivo do fechamento"
                    dica="O motivo aparece para a empresa fornecedora."
                    rotuloDoBotao="Fechar a revisão"
                    acao={fecharRevisaoDocumentalAcao}
                  />
                </>
              ) : (
                <p className="text-sm text-neutral-700">
                  {TEXTO_DOCUMENTAL.revisaoForaDoEstado}
                </p>
              )}
            </section>
            {voltarAoTopo}
          </Secao>
        </Ancora>
      ) : null}

      <Ancora id="pendencias">
        <Secao titulo="Pendências de publicação">
          {pendencias.length === 0 ? (
            <p>{TEXTO_DA_PLATAFORMA.semPendencias}</p>
          ) : null}
          {/* O impedimento sai da lista e vai no tom de bloqueio do aviso dele (TV-I3.6-04). */}
          {pendencias.some(
            (pendencia) => pendencia.codigo === "transfer_impediment",
          ) ? (
            <Aviso tom="bloqueio">
              <p>
                Para publicar, falta: <PendenciaDoImpedimento />
              </p>
            </Aviso>
          ) : null}
          {pendencias.some(
            (pendencia) => pendencia.codigo !== "transfer_impediment",
          ) ? (
            <Aviso tom="alerta">
              <p>Para publicar, falta:</p>
              <ul className="mt-1 list-disc pl-5">
                {pendencias
                  .filter(
                    (pendencia) => pendencia.codigo !== "transfer_impediment",
                  )
                  .map((pendencia) => (
                    <li key={pendencia.codigo}>{pendencia.rotulo}</li>
                  ))}
              </ul>
            </Aviso>
          ) : null}
          <p className="text-sm text-neutral-700">
            {TEXTO_DA_PLATAFORMA.pendenciasNaoImpedem}
          </p>
        </Secao>
      </Ancora>

      <Ancora id="fotos">
        <Secao titulo="Fotos">
          {fotos.length === 0 ? (
            <Vazio>Nenhuma foto enviada.</Vazio>
          ) : (
            <ol
              aria-label="Fotos da oferta"
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
            >
              {fotos.map((foto, indice) => (
                <li
                  key={foto.id}
                  className="flex flex-col gap-2 rounded border border-neutral-200 p-2"
                >
                  {foto.url === null ? (
                    <p className="text-sm text-neutral-700">
                      Não foi possível carregar a foto agora. Atualize a página.
                    </p>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element -- URL temporária do Storage privado; o next/image exigiria liberar o domínio na configuração do Next
                    <img
                      src={foto.url}
                      alt={`Foto ${String(indice + 1)} do veículo`}
                      className="aspect-[4/3] w-full rounded bg-neutral-100 object-cover"
                    />
                  )}
                  <p className="text-sm text-neutral-700">
                    Foto {indice + 1} · enviada em{" "}
                    {formatarDataHora(foto.enviadaEm)}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </Secao>
      </Ancora>

      <Ancora id="documentos">
        <Secao titulo="Documentos">
          <p className="text-sm text-neutral-700">
            {TEXTO_DA_PLATAFORMA.documentos}
          </p>
          {documentos.length === 0 ? (
            <Vazio>Nenhum documento enviado.</Vazio>
          ) : (
            <ol
              aria-label="Documentos da oferta"
              className="flex flex-col divide-y divide-neutral-200"
            >
              {documentos.map((documento, indice) => (
                <li
                  key={documento.id}
                  className="flex flex-col gap-2 py-2 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="text-sm">
                    <p className="font-medium">
                      {ROTULO_DO_TIPO_DE_DOCUMENTO[documento.tipo]}
                      {documento.descricao === null
                        ? ""
                        : `: ${documento.descricao}`}
                    </p>
                    <p className="text-neutral-700">
                      Enviado em {formatarDataHora(documento.enviadoEm)} por{" "}
                      {nomeDe(documento.enviadoPor) ?? SEM_NOME} · oculto para
                      compradores
                    </p>
                    <p className="break-all text-neutral-600">
                      SHA-256: {documento.sha256}
                    </p>
                  </div>
                  <AberturaDeDocumento
                    documentoId={documento.id}
                    rotulo={`Abrir o documento ${String(indice + 1)}`}
                    acao={abrirDocumentoAcao}
                  />
                </li>
              ))}
            </ol>
          )}
        </Secao>
      </Ancora>

      <Ancora id="versoes">
        <Secao titulo="Versões e revisões">
          <section
            aria-labelledby="titulo-versoes"
            className="flex flex-col gap-2"
          >
            <h3 id="titulo-versoes" className="font-semibold">
              Versões
            </h3>
            {versoes.length === 0 ? (
              <Vazio>Nenhuma versão registrada.</Vazio>
            ) : (
              <ol
                aria-label="Versões da oferta"
                className="flex flex-col divide-y divide-neutral-200"
              >
                {versoes.map((versao) => (
                  <li key={versao.id} className="flex flex-col gap-1 py-2">
                    <p>
                      <strong>Versão {versao.numero}</strong> ·{" "}
                      {formatarDataHora(versao.criadaEm)} ·{" "}
                      {versao.criadaPor === null
                        ? SISTEMA
                        : (nomeDe(versao.criadaPor) ?? SEM_NOME)}
                    </p>
                    <p className="text-sm text-neutral-700">
                      {resumoDaMudanca(versao.resumoDaMudanca)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <section
            aria-labelledby="titulo-revisoes"
            className="flex flex-col gap-2"
          >
            <h3 id="titulo-revisoes" className="font-semibold">
              Revisões da plataforma
            </h3>
            {revisoes.length === 0 ? (
              <Vazio>Nenhuma revisão registrada.</Vazio>
            ) : (
              <ol
                aria-label="Revisões da oferta"
                className="flex flex-col divide-y divide-neutral-200"
              >
                {revisoes.map((revisao) => (
                  <li key={revisao.id} className="flex flex-col gap-1 py-2">
                    <p>
                      <strong>
                        {ROTULO_DA_DECISAO_DA_REVISAO[revisao.decisao]}
                      </strong>{" "}
                      · {formatarDataHora(revisao.revisadaEm)}
                      {revisao.versao === null
                        ? ""
                        : ` · versão ${String(revisao.versao)}`}{" "}
                      · {nomeDe(revisao.revisadaPor) ?? SEM_NOME}
                    </p>
                    {revisao.motivo === null ? null : (
                      <p className="break-words text-sm text-neutral-700">
                        Motivo: {revisao.motivo}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </Secao>
      </Ancora>

      <Ancora id="historico">
        <Secao titulo="Histórico de campos">
          {!comHistorico ? (
            <p className="text-sm text-neutral-700">
              {TEXTO_DA_PLATAFORMA.historicoSemAcesso}
            </p>
          ) : eventos.length === 0 ? (
            <Vazio>
              Nenhum campo da oferta ou do veículo foi alterado desde a criação.
              As declarações aparecem nas versões.
            </Vazio>
          ) : (
            <ol
              aria-label="Alterações da oferta"
              className="flex flex-col divide-y divide-neutral-200"
            >
              {eventos.map((evento) => (
                <li key={evento.chave} className="flex flex-col gap-1 py-2">
                  <p>
                    <strong>{formatarDataHora(evento.em)}</strong> ·{" "}
                    {evento.autor}
                  </p>
                  <ul className="list-disc pl-5 text-sm text-neutral-700">
                    {evento.mudancas.map((mudanca) => (
                      <li key={mudanca.id} className="break-words">
                        {mudanca.campo}: {mudanca.antes} → {mudanca.depois}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </Secao>
      </Ancora>

      {voltarAoTopo}

      {algumaAcao ? (
        <Ancora id="acoes">
          <section
            aria-labelledby="titulo-acoes"
            className="flex flex-col gap-6 border-t-4 border-marinho-900 pt-4"
          >
            <h2 id="titulo-acoes" className="text-xl font-bold">
              Ações da plataforma
            </h2>
            {acoes.revisar ? (
              <Secao titulo="Revisão">
                <p>{TEXTO_DA_PLATAFORMA.revisao}</p>
                <Aviso>{TEXTO_DA_PLATAFORMA.devolucaoNaoPorPendencia}</Aviso>
                <RevisaoPelaPlataforma
                  ofertaId={oferta.id}
                  publicacaoBloqueada={pendencias.length > 0}
                  acao={revisarOfertaAcao}
                />
              </Secao>
            ) : null}

            {acoes.suspender ? (
              <Secao titulo="Suspensão">
                <p>{TEXTO_DA_PLATAFORMA.suspensao}</p>
                <Aviso>{TEXTO_DA_PLATAFORMA.suspensaoNaoPorPendencia}</Aviso>
                <SuspensaoPelaPlataforma
                  ofertaId={oferta.id}
                  acao={suspenderOfertaAcao}
                />
              </Secao>
            ) : null}

            {acoes.reativar ? (
              <Secao titulo="Reativação">
                <p>{TEXTO_DA_PLATAFORMA.reativacao}</p>
                <AcaoComMotivo
                  ofertaId={oferta.id}
                  titulo="Reativar a oferta"
                  rotuloDoMotivo="Motivo da reativação"
                  dica={TEXTO_DA_PLATAFORMA.motivoDaReativacao}
                  rotuloDoBotao="Reativar a oferta"
                  acao={reativarOfertaAcao}
                />
              </Secao>
            ) : situacao.reativacaoComAdministrador ? (
              <Secao titulo="Reativação">
                <Aviso>{TEXTO_DA_PLATAFORMA.reativacaoComAdministrador}</Aviso>
              </Secao>
            ) : null}

            {outrasAcoes ? (
              <Secao titulo="Outras ações">
                {acoes.reservar || acoes.liberar ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-sm text-neutral-700">
                      {TEXTO_DA_PLATAFORMA.reserva}
                    </p>
                    <div className="flex flex-wrap items-start gap-3">
                      {acoes.reservar ? (
                        <AcaoDaOferta
                          ofertaId={oferta.id}
                          rotulo="Reservar"
                          acao={reservarOfertaPelaPlataformaAcao}
                        />
                      ) : null}
                      {acoes.liberar ? (
                        <AcaoDaOferta
                          ofertaId={oferta.id}
                          rotulo="Liberar a reserva"
                          acao={liberarReservaPelaPlataformaAcao}
                        />
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {acoes.retirar ? (
                  <AcaoComMotivo
                    ofertaId={oferta.id}
                    titulo="Retirar a oferta"
                    rotuloDoMotivo="Motivo da retirada"
                    dica={TEXTO_DA_PLATAFORMA.retirada}
                    rotuloDoBotao="Retirar a oferta"
                    risco
                    acao={retirarOfertaPelaPlataformaAcao}
                  />
                ) : null}
              </Secao>
            ) : null}
            {voltarAoTopo}
          </section>
        </Ancora>
      ) : situacao.conflito ? null : (
        <p className="text-sm text-neutral-700">
          {TEXTO_DA_PLATAFORMA.semAcaoNoEstado}
        </p>
      )}

      <ul className="flex flex-wrap gap-x-6 gap-y-2">
        {daFila ? (
          <li>
            <Link href={CAMINHO_DA_FILA} className={LINK}>
              {TEXTO_DA_PLATAFORMA.voltarAFila}
            </Link>
          </li>
        ) : null}
        <li>
          <Link href="/admin/ofertas" className={LINK}>
            Voltar às ofertas
          </Link>
        </li>
      </ul>
    </Pagina>
  );
}
