/**
 * Navegação entre as etapas da oferta (I2.8). Funciona sem JavaScript; os
 * links não são autorização: cada página confere o acesso no servidor.
 */
import Link from "next/link";
import { LINK } from "@/components/estilos";
import { ETAPAS_DA_OFERTA, type EtapaDaOferta } from "./rotulos";

export function NavegacaoDaOferta({
  base,
  atual,
}: {
  /** `/empresa/<empresa>/ofertas/<oferta>`. */
  readonly base: string;
  readonly atual: EtapaDaOferta;
}) {
  return (
    <nav aria-label="Etapas da oferta">
      <ul className="flex flex-wrap gap-2 text-sm">
        {ETAPAS_DA_OFERTA.map((etapa) => {
          const ativa = etapa.chave === atual;
          return (
            <li key={etapa.chave}>
              <Link
                href={`${base}${etapa.caminho}`}
                aria-current={ativa ? "page" : undefined}
                className={`inline-block rounded border px-3 py-1 ${
                  ativa
                    ? "border-marinho-900 bg-marinho-900 text-white"
                    : "border-neutral-400 bg-white text-marinho-900"
                }`}
              >
                {etapa.rotulo}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Links do fim de cada etapa: a seguinte e o resumo. */
export function ProximaEtapa({
  base,
  atual,
}: {
  readonly base: string;
  readonly atual: EtapaDaOferta;
}) {
  const indice = ETAPAS_DA_OFERTA.findIndex((etapa) => etapa.chave === atual);
  const proxima = ETAPAS_DA_OFERTA[indice + 1];
  return (
    <p className="flex flex-wrap gap-4">
      {proxima === undefined || proxima.chave === "historico" ? null : (
        <Link href={`${base}${proxima.caminho}`} className={LINK}>
          Próxima etapa: {proxima.rotulo.replace(/^\d+\.\s*/u, "")}
        </Link>
      )}
      <Link href={base} className={LINK}>
        Voltar ao resumo e envio
      </Link>
    </p>
  );
}
