import type { Metadata } from "next";
import { alterarOfertaAcao } from "@/app/_acoes/ofertas";
import { limitesDaValidade } from "@/app/_apoio/oferta";
import {
  PaginaDaOferta,
  carregarOferta,
  valoresDaOferta,
} from "@/app/_apoio/oferta-da-pagina";
import { Secao } from "@/components/pagina";
import { DadosDoVeiculo } from "@/modules/offers/ui/dados";
import { FormularioDaOferta } from "@/modules/offers/ui/formulario-da-oferta";
import { ProximaEtapa } from "@/modules/offers/ui/navegacao";
import { motivoDaEtapaSoLeitura } from "@/modules/offers/ui/rotulos";

export const metadata: Metadata = { title: "Veículo da oferta" };

/** Etapa 1: dados do veículo (§5.2; ADR-0003 §2.11). */
export default async function PaginaDoVeiculo({
  params,
}: {
  readonly params: Promise<{ empresaId: string; ofertaId: string }>;
}) {
  const { empresaId, ofertaId } = await params;
  const carga = await carregarOferta(empresaId, ofertaId, "/veiculo");
  if (!carga.ok) return carga.resposta;
  const { oferta, editavel, vencidaAntesDaExpiracao, ator, base } = carga;

  return (
    <PaginaDaOferta carga={carga} atual="veiculo">
      <Secao titulo="1. Veículo">
        {editavel ? (
          <FormularioDaOferta
            modo="alterar"
            ofertaId={oferta.id}
            partes={{ veiculo: true, condicoes: false }}
            iniciais={valoresDaOferta(oferta)}
            identidadeFixa={oferta.publicadaEm !== null}
            validade={limitesDaValidade(null)}
            rotuloDoBotao="Gravar o veículo"
            acao={alterarOfertaAcao}
          />
        ) : (
          <>
            <p className="text-sm text-neutral-700">
              {motivoDaEtapaSoLeitura(
                oferta.status,
                ator,
                vencidaAntesDaExpiracao,
              )}
            </p>
            <DadosDoVeiculo veiculo={oferta.veiculo} />
          </>
        )}
      </Secao>
      <ProximaEtapa base={base} atual="veiculo" />
    </PaginaDaOferta>
  );
}
