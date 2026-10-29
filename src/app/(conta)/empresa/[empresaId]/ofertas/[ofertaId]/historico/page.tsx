import type { Metadata } from "next";
import { formatarDataHora } from "@/app/_apoio/datas";
import { PaginaDaOferta, carregarOferta } from "@/app/_apoio/oferta-da-pagina";
import { Vazio } from "@/components/estados";
import { Secao } from "@/components/pagina";
import { ProximaEtapa } from "@/modules/offers/ui/navegacao";
import { listarPerfisPorId } from "@/modules/auth/queries/perfis";
import {
  listarHistorico,
  listarRevisoes,
  listarVersoes,
} from "@/modules/offers/queries/ofertas";
import {
  SEM_NOME,
  SISTEMA,
  eventosDoHistorico,
  pessoasDoHistorico,
} from "@/modules/offers/ui/historico";
import {
  ROTULO_DA_DECISAO_DA_REVISAO,
  resumoDaMudanca,
} from "@/modules/offers/ui/rotulos";

export const metadata: Metadata = { title: "Histórico da oferta" };

/**
 * Histórico da oferta (I2.8; ADR-0003 §2.6 e §2.8): versões com o que mudou,
 * decisões da revisão da plataforma e as alterações campo a campo da oferta e
 * do veículo.
 */
export default async function PaginaDoHistorico({
  params,
}: {
  readonly params: Promise<{ empresaId: string; ofertaId: string }>;
}) {
  const { empresaId, ofertaId } = await params;
  const carga = await carregarOferta(empresaId, ofertaId, "/historico");
  if (!carga.ok) return carga.resposta;
  const { sessao, oferta, base } = carga;
  const [versoes, revisoes, mudancas] = await Promise.all([
    listarVersoes(sessao, oferta.id),
    listarRevisoes(sessao, oferta.id),
    listarHistorico(sessao, oferta),
  ]);
  const pessoas = await listarPerfisPorId(sessao, [
    ...versoes
      .map((versao) => versao.criadaPor)
      .filter((perfilId): perfilId is string => perfilId !== null),
    ...pessoasDoHistorico(mudancas),
  ]);
  const nomeDe = (perfilId: string): string | undefined => {
    const perfil = pessoas.get(perfilId);
    if (perfil === undefined) return undefined;
    return perfil.nome === "" ? (perfil.email ?? undefined) : perfil.nome;
  };
  const eventos = eventosDoHistorico(mudancas, nomeDe);

  return (
    <PaginaDaOferta carga={carga} atual="historico">
      <Secao titulo="Versões">
        <p className="text-sm text-neutral-700">
          Uma versão nova nasce quando muda um dado importante da oferta, como
          preço, quilometragem, condições comerciais ou declarações.
        </p>
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
      </Secao>

      <Secao titulo="Revisões da plataforma">
        {revisoes.length === 0 ? (
          <Vazio>Nenhuma revisão registrada.</Vazio>
        ) : (
          <ol className="flex flex-col divide-y divide-neutral-200">
            {revisoes.map((revisao) => (
              <li key={revisao.id} className="flex flex-col gap-1 py-2">
                <p>
                  <strong>
                    {ROTULO_DA_DECISAO_DA_REVISAO[revisao.decisao]}
                  </strong>{" "}
                  · {formatarDataHora(revisao.revisadaEm)}
                  {revisao.versao === null
                    ? ""
                    : ` · versão ${String(revisao.versao)}`}
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
      </Secao>

      <Secao titulo="Alterações de campos">
        {eventos.length === 0 ? (
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
      <ProximaEtapa base={base} atual="historico" />
    </PaginaDaOferta>
  );
}
