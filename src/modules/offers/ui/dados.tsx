/**
 * Blocos de leitura da oferta (I2.8): veículo, condições e estado por
 * categoria, para quando a etapa não pode ser alterada. O estado aparece sem
 * origem; a origem acompanha a declaração, como manda a §6.5 (I3.6).
 */
import { formatarDataHora } from "@/app/_apoio/datas";
import {
  formatarPreco,
  formatarQuilometragem,
  formatarValidade,
} from "@/app/_apoio/oferta";
import { Vazio } from "@/components/estados";
import { Dados } from "@/components/pagina";
import { ROTULO_DA_ORIGEM } from "@/modules/documental/rules/estados";
import type { EstadoDaCategoria } from "@/modules/documental/server/estados";
import { textoDoEstadoDaCategoria } from "@/modules/documental/ui/ficha";
import type { Oferta, Veiculo } from "../queries/ofertas";

function ou(valor: string | number | null): string {
  return valor === null || valor === "" ? "—" : String(valor);
}

export function DadosDoVeiculo({ veiculo }: { readonly veiculo: Veiculo }) {
  return (
    <Dados
      itens={[
        ["Marca", ou(veiculo.marca)],
        ["Modelo", ou(veiculo.modelo)],
        ["Versão", ou(veiculo.versao)],
        ["Ano de fabricação", ou(veiculo.anoDeFabricacao)],
        ["Ano do modelo", ou(veiculo.anoDoModelo)],
        ["Quilometragem", formatarQuilometragem(veiculo.quilometragem)],
        ["Combustível", ou(veiculo.combustivel)],
        ["Câmbio", ou(veiculo.cambio)],
        ["Cor", ou(veiculo.cor)],
        ["Carroceria", ou(veiculo.carroceria)],
        ["Placa", ou(veiculo.placa)],
        ["RENAVAM", ou(veiculo.renavam)],
        ["Chassi", ou(veiculo.chassi)],
      ]}
    />
  );
}

export function DadosDasCondicoes({ oferta }: { readonly oferta: Oferta }) {
  return (
    <Dados
      itens={[
        ["Preço", formatarPreco(oferta.preco)],
        ["Condições comerciais", ou(oferta.condicoesComerciais)],
        ["Cidade", ou(oferta.cidade)],
        ["UF", ou(oferta.uf)],
        ["Válida até", formatarValidade(oferta.validaAte)],
      ]}
    />
  );
}

export function EstadosPorCategoria({
  categorias,
}: {
  readonly categorias: readonly EstadoDaCategoria[];
}) {
  if (categorias.length === 0) {
    return <Vazio>Nenhuma categoria documental para mostrar.</Vazio>;
  }
  return (
    <ul className="flex flex-col divide-y divide-neutral-200">
      {categorias.map((item) => (
        <li key={item.categoria} className="flex flex-col gap-1 py-2">
          <p className="font-medium">{item.rotuloDaCategoria}</p>
          <p className="break-words text-sm text-neutral-700">
            Estado: {textoDoEstadoDaCategoria(item)}
          </p>
          <p className="text-sm text-neutral-700">
            {item.declaracao === null
              ? "Sem declaração."
              : `Declaração vigente: ${item.declaracao.rotulo}, em ${formatarDataHora(item.declaracao.declaradaEm)}. Origem: ${ROTULO_DA_ORIGEM.supplier_declaration}.`}
          </p>
          {item.declaracao?.detalhe === null ||
          item.declaracao?.detalhe === undefined ? null : (
            <p className="break-words text-sm text-neutral-700">
              Detalhe: {item.declaracao.detalhe}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
