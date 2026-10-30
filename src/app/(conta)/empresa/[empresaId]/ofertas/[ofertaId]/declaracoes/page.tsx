import type { Metadata } from "next";
import { declararCategoriasAcao } from "@/app/_acoes/ofertas";
import { formatarDataHora } from "@/app/_apoio/datas";
import { PaginaDaOferta, carregarOferta } from "@/app/_apoio/oferta-da-pagina";
import { Vazio } from "@/components/estados";
import { Secao } from "@/components/pagina";
import {
  ROTULO_DA_ORIGEM,
  ROTULO_DO_ESTADO,
  rotuloDaCategoria,
} from "@/modules/documental/rules/estados";
import { dependenciasDaLeitura } from "@/modules/offers/queries/dependencias";
import {
  lerConfiguracaoDaOferta,
  lerEstadosDocumentais,
} from "@/modules/offers/queries/ofertas";
import { EstadosPorCategoria } from "@/modules/offers/ui/dados";
import {
  FormularioDeDeclaracoes,
  type CategoriaParaDeclarar,
} from "@/modules/offers/ui/declaracoes";
import { ProximaEtapa } from "@/modules/offers/ui/navegacao";
import { TEXTO, motivoDaEtapaSoLeitura } from "@/modules/offers/ui/rotulos";

export const metadata: Metadata = { title: "Declarações da oferta" };

/**
 * Etapa 4: declarações do fornecedor, uma por categoria da configuração
 * (§5.3; ADR-0003 §2.12), com o estado documental e a origem de cada uma
 * (§6.4 e §6.5).
 */
export default async function PaginaDasDeclaracoes({
  params,
}: {
  readonly params: Promise<{ empresaId: string; ofertaId: string }>;
}) {
  const { empresaId, ofertaId } = await params;
  const carga = await carregarOferta(empresaId, ofertaId, "/declaracoes");
  if (!carga.ok) return carga.resposta;
  const { sessao, oferta, editavel, vencidaAntesDaExpiracao, ator, base } =
    carga;
  const [configuracao, estados] = await Promise.all([
    lerConfiguracaoDaOferta(sessao),
    lerEstadosDocumentais(dependenciasDaLeitura(sessao), oferta.id),
  ]);

  const porCategoria = new Map(
    estados.categorias.map((item) => [item.categoria, item]),
  );
  const paraDeclarar: CategoriaParaDeclarar[] = configuracao.categorias.map(
    (categoria) => {
      const atual = porCategoria.get(categoria);
      return {
        categoria,
        rotulo: rotuloDaCategoria(categoria),
        estado: atual?.rotuloDoEstado ?? ROTULO_DO_ESTADO.not_checked,
        origem: atual?.rotuloDaOrigem ?? ROTULO_DA_ORIGEM.unconfirmed,
        vigente:
          atual?.declaracao === null || atual?.declaracao === undefined
            ? null
            : {
                resposta: atual.declaracao.rotulo,
                detalhe: atual.declaracao.detalhe,
                em: formatarDataHora(atual.declaracao.declaradaEm),
              },
      };
    },
  );
  const foraDaConfiguracao = estados.categorias.filter(
    (item) => !configuracao.categorias.includes(item.categoria),
  );

  return (
    <PaginaDaOferta carga={carga} atual="declaracoes">
      <Secao titulo="4. Declarações">
        {estados.resumo === "" ? null : (
          <p>
            Resumo por categoria: <strong>{estados.resumo}</strong>.
          </p>
        )}
        {editavel ? (
          <>
            <p className="text-sm text-neutral-700">{TEXTO.declaracoes}</p>
            {paraDeclarar.length === 0 ? (
              <Vazio>
                Nenhuma categoria documental configurada. Fale com a
                administração da plataforma.
              </Vazio>
            ) : (
              <FormularioDeDeclaracoes
                ofertaId={oferta.id}
                categorias={paraDeclarar}
                acao={declararCategoriasAcao}
              />
            )}
            {foraDaConfiguracao.length === 0 ? null : (
              <section
                aria-labelledby="titulo-fora-da-configuracao"
                className="flex flex-col gap-2"
              >
                <h3 id="titulo-fora-da-configuracao" className="font-semibold">
                  Categorias que saíram da configuração
                </h3>
                <p className="text-sm text-neutral-700">
                  As declarações feitas antes continuam registradas e não
                  recebem resposta nova.
                </p>
                <EstadosPorCategoria categorias={foraDaConfiguracao} />
              </section>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-neutral-700">
              {motivoDaEtapaSoLeitura(
                oferta.status,
                ator,
                vencidaAntesDaExpiracao,
              )}
            </p>
            <EstadosPorCategoria categorias={estados.categorias} />
          </>
        )}
      </Secao>
      <ProximaEtapa base={base} atual="declaracoes" />
    </PaginaDaOferta>
  );
}
