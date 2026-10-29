import type { Metadata } from "next";
import { abrirDocumentoAcao, enviarDocumentoAcao } from "@/app/_acoes/ofertas";
import { formatarDataHora } from "@/app/_apoio/datas";
import { PaginaDaOferta, carregarOferta } from "@/app/_apoio/oferta-da-pagina";
import { Aviso, Vazio } from "@/components/estados";
import { Secao } from "@/components/pagina";
import { listarPerfisPorId } from "@/modules/auth/queries/perfis";
import { listarDocumentos } from "@/modules/offers/queries/ofertas";
import {
  AberturaDeDocumento,
  EnvioDeDocumento,
} from "@/modules/offers/ui/arquivos";
import { SEM_NOME } from "@/modules/offers/ui/historico";
import { ProximaEtapa } from "@/modules/offers/ui/navegacao";
import {
  ROTULO_DO_TIPO_DE_DOCUMENTO,
  TEXTO,
  motivoDaEtapaSoLeitura,
} from "@/modules/offers/ui/rotulos";

export const metadata: Metadata = { title: "Documentos da oferta" };

/**
 * Etapa 5: documentos (ADR-0003 §2.13). Ficam ocultos ao comprador até a
 * decisão D5. Abrir um documento passa pelo servidor, que registra o acesso
 * antes de gerar a URL temporária.
 */
export default async function PaginaDosDocumentos({
  params,
}: {
  readonly params: Promise<{ empresaId: string; ofertaId: string }>;
}) {
  const { empresaId, ofertaId } = await params;
  const carga = await carregarOferta(empresaId, ofertaId, "/documentos");
  if (!carga.ok) return carga.resposta;
  const { sessao, oferta, editavel, ator, base } = carga;
  const documentos = await listarDocumentos(sessao, oferta.id);
  const pessoas = await listarPerfisPorId(
    sessao,
    documentos.map((documento) => documento.enviadoPor),
  );
  const nomeDe = (perfilId: string) => {
    const perfil = pessoas.get(perfilId);
    if (perfil === undefined) return SEM_NOME;
    return perfil.nome === "" ? (perfil.email ?? SEM_NOME) : perfil.nome;
  };

  return (
    <PaginaDaOferta carga={carga} atual="documentos">
      <Secao titulo="5. Documentos">
        <Aviso>{TEXTO.documentosOcultos}</Aviso>
        <p className="text-sm text-gray-700">
          {TEXTO.documentoGuardado} {TEXTO.documentoSemEfeitoNoEstado}
        </p>
        {documentos.length === 0 ? (
          <Vazio>
            Nenhum documento enviado. Os documentos são opcionais e não impedem
            o envio.
          </Vazio>
        ) : (
          <ol
            aria-label="Documentos da oferta"
            className="flex flex-col divide-y divide-gray-200"
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
                  <p className="text-gray-700">
                    Enviado em {formatarDataHora(documento.enviadoEm)} por{" "}
                    {nomeDe(documento.enviadoPor)} · oculto para compradores
                  </p>
                  <p className="break-all text-gray-600">
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
        {editavel ? (
          <>
            <Aviso tom="alerta">{TEXTO.documentoIrreversivel}</Aviso>
            <EnvioDeDocumento ofertaId={oferta.id} acao={enviarDocumentoAcao} />
          </>
        ) : (
          <p className="text-sm text-gray-700">
            {motivoDaEtapaSoLeitura(oferta.status, ator)}
          </p>
        )}
      </Secao>
      <ProximaEtapa base={base} atual="documentos" />
    </PaginaDaOferta>
  );
}
