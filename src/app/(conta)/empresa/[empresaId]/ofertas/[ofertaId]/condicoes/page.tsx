import type { Metadata } from "next";
import { alterarOfertaAcao } from "@/app/_acoes/ofertas";
import { limitesDaValidade } from "@/app/_apoio/oferta";
import {
  PaginaDaOferta,
  carregarOferta,
  valoresDaOferta,
} from "@/app/_apoio/oferta-da-pagina";
import { Secao } from "@/components/pagina";
import { lerConfiguracaoDaOferta } from "@/modules/offers/queries/ofertas";
import { DadosDasCondicoes } from "@/modules/offers/ui/dados";
import { FormularioDaOferta } from "@/modules/offers/ui/formulario-da-oferta";
import { ProximaEtapa } from "@/modules/offers/ui/navegacao";
import { motivoDaEtapaSoLeitura } from "@/modules/offers/ui/rotulos";

export const metadata: Metadata = { title: "Condições da oferta" };

/** Etapa 3: preço, condições comerciais, localização e validade (§5.2; §6.9). */
export default async function PaginaDasCondicoes({
  params,
}: {
  readonly params: Promise<{ empresaId: string; ofertaId: string }>;
}) {
  const { empresaId, ofertaId } = await params;
  const carga = await carregarOferta(empresaId, ofertaId, "/condicoes");
  if (!carga.ok) return carga.resposta;
  const { sessao, oferta, editavel, ator, base } = carga;
  const configuracao = await lerConfiguracaoDaOferta(sessao);

  return (
    <PaginaDaOferta carga={carga} atual="condicoes">
      <Secao titulo="3. Condições">
        {editavel ? (
          <FormularioDaOferta
            modo="alterar"
            ofertaId={oferta.id}
            partes={{ veiculo: false, condicoes: true }}
            iniciais={valoresDaOferta(oferta)}
            validade={limitesDaValidade(configuracao.validadeMaximaEmDias)}
            rotuloDoBotao="Gravar as condições"
            acao={alterarOfertaAcao}
          />
        ) : (
          <>
            <p className="text-sm text-gray-700">
              {motivoDaEtapaSoLeitura(oferta.status, ator)}
            </p>
            <DadosDasCondicoes oferta={oferta} />
          </>
        )}
      </Secao>
      <ProximaEtapa base={base} atual="condicoes" />
    </PaginaDaOferta>
  );
}
