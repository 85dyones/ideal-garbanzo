import type { Metadata } from "next";
import Link from "next/link";
import { criarOfertaAcao } from "@/app/_acoes/ofertas";
import { limitesDaValidade, validadeSugerida } from "@/app/_apoio/oferta";
import {
  caminhoDasOfertas,
  carregarEmpresaDasOfertas,
  valoresDaNovaOferta,
} from "@/app/_apoio/oferta-da-pagina";
import { LINK } from "@/components/estilos";
import { Pagina, Secao } from "@/components/pagina";
import { lerConfiguracaoDaOferta } from "@/modules/offers/queries/ofertas";
import { FormularioDaOferta } from "@/modules/offers/ui/formulario-da-oferta";
import { TEXTO } from "@/modules/offers/ui/rotulos";

export const metadata: Metadata = { title: "Nova oferta" };

/**
 * Primeira etapa do cadastro (I2.8): veículo e condições. Cria o rascunho e
 * leva à oferta, onde seguem as outras etapas.
 */
export default async function PaginaDaNovaOferta({
  params,
}: {
  readonly params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  const caminho = caminhoDasOfertas(empresaId);
  const carga = await carregarEmpresaDasOfertas(empresaId, `${caminho}/nova`);
  if (!carga.ok) return carga.resposta;
  const { sessao, empresa } = carga;
  const configuracao = await lerConfiguracaoDaOferta(sessao);

  return (
    <Pagina
      titulo="Nova oferta"
      descricao={`Empresa: ${empresa.nome}. ${TEXTO.inicioDoCadastro}`}
    >
      <Secao titulo="Veículo e condições">
        <FormularioDaOferta
          modo="criar"
          empresaId={empresa.id}
          partes={{ veiculo: true, condicoes: true }}
          iniciais={valoresDaNovaOferta(
            validadeSugerida(configuracao.validadePadraoEmDias),
          )}
          validade={limitesDaValidade(configuracao.validadeMaximaEmDias)}
          rotuloDoBotao="Criar rascunho"
          acao={criarOfertaAcao}
        />
      </Secao>
      <p>
        <Link href={caminho} className={LINK}>
          Voltar às ofertas
        </Link>
      </p>
    </Pagina>
  );
}
