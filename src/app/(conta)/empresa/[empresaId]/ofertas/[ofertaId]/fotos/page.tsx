import type { Metadata } from "next";
import {
  enviarFotoAcao,
  ordenarFotosAcao,
  removerFotoAcao,
} from "@/app/_acoes/ofertas";
import { formatarDataHora } from "@/app/_apoio/datas";
import { PaginaDaOferta, carregarOferta } from "@/app/_apoio/oferta-da-pagina";
import { Aviso, Vazio } from "@/components/estados";
import { Secao } from "@/components/pagina";
import { dependenciasDaLeitura } from "@/modules/offers/queries/dependencias";
import { listarFotos } from "@/modules/offers/queries/ofertas";
import {
  EnvioDeFoto,
  OrdemDasFotos,
  RemocaoDeFoto,
} from "@/modules/offers/ui/arquivos";
import { ProximaEtapa } from "@/modules/offers/ui/navegacao";
import {
  mudancasDaOrdem,
  posicaoDaProximaFoto,
} from "@/modules/offers/ui/ordem";
import { TEXTO, motivoDaEtapaSoLeitura } from "@/modules/offers/ui/rotulos";

export const metadata: Metadata = { title: "Fotos da oferta" };

/**
 * Etapa 2: fotos (ADR-0003 §2.13). As fotos ficam num bucket privado; a tela
 * mostra cada uma por uma URL temporária gerada com a sessão. Fotos não são
 * obrigatórias para enviar.
 */
export default async function PaginaDasFotos({
  params,
}: {
  readonly params: Promise<{ empresaId: string; ofertaId: string }>;
}) {
  const { empresaId, ofertaId } = await params;
  const carga = await carregarOferta(empresaId, ofertaId, "/fotos");
  if (!carga.ok) return carga.resposta;
  const { sessao, oferta, editavel, ator, base } = carga;
  const fotos = await listarFotos(dependenciasDaLeitura(sessao), oferta.id);

  return (
    <PaginaDaOferta carga={carga} atual="fotos">
      <Secao titulo="2. Fotos">
        <Aviso>{TEXTO.orientacaoDasFotos}</Aviso>
        {fotos.length === 0 ? (
          <Vazio>
            Nenhuma foto enviada. As fotos são opcionais e não impedem o envio.
          </Vazio>
        ) : (
          <ol
            aria-label="Fotos da oferta"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {fotos.map((foto, indice) => {
              const numero = indice + 1;
              const antes = mudancasDaOrdem(fotos, indice, indice - 1);
              const depois = mudancasDaOrdem(fotos, indice, indice + 1);
              return (
                <li
                  key={foto.id}
                  className="flex flex-col gap-2 rounded border border-gray-200 p-2"
                >
                  {foto.url === null ? (
                    <p className="text-sm text-gray-700">
                      Não foi possível carregar a foto agora. Atualize a página.
                    </p>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element -- URL temporária do Storage privado; o next/image exigiria liberar o domínio na configuração do Next
                    <img
                      src={foto.url}
                      alt={`Foto ${String(numero)} do veículo`}
                      className="aspect-[4/3] w-full rounded bg-gray-100 object-cover"
                    />
                  )}
                  <p className="text-sm text-gray-700">
                    Foto {numero} · enviada em{" "}
                    {formatarDataHora(foto.enviadaEm)}
                  </p>
                  {editavel ? (
                    <div className="flex flex-wrap items-start gap-2">
                      {antes.length > 0 ? (
                        <OrdemDasFotos
                          mudancas={antes}
                          rotulo={`Mover a foto ${String(numero)} para antes`}
                          acao={ordenarFotosAcao}
                        />
                      ) : null}
                      {depois.length > 0 ? (
                        <OrdemDasFotos
                          mudancas={depois}
                          rotulo={`Mover a foto ${String(numero)} para depois`}
                          acao={ordenarFotosAcao}
                        />
                      ) : null}
                      <RemocaoDeFoto
                        fotoId={foto.id}
                        rotulo={`Remover a foto ${String(numero)}`}
                        acao={removerFotoAcao}
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
        {editavel ? (
          <>
            <EnvioDeFoto
              ofertaId={oferta.id}
              ordem={posicaoDaProximaFoto(fotos)}
              acao={enviarFotoAcao}
            />
            {fotos.length === 0 ? null : (
              <p className="text-sm text-gray-700">{TEXTO.fotoRemovida}</p>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-700">
            {motivoDaEtapaSoLeitura(oferta.status, ator)}
          </p>
        )}
      </Secao>
      <ProximaEtapa base={base} atual="fotos" />
    </PaginaDaOferta>
  );
}
