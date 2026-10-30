import type { Metadata } from "next";
import {
  abrirEvidenciaAcao,
  registrarConsultaAcao,
} from "@/app/_acoes/documental";
import { PaginaDaOferta, carregarOferta } from "@/app/_apoio/oferta-da-pagina";
import { Aviso, Vazio } from "@/components/estados";
import { Secao } from "@/components/pagina";
import { listarPerfisPorId } from "@/modules/auth/queries/perfis";
import {
  lerRegistrosDocumentais,
  pessoasDosRegistros,
} from "@/modules/documental/queries/registros";
import { rotuloDaCategoria } from "@/modules/documental/rules/estados";
import { podeRegistrarConsulta } from "@/modules/documental/rules/registro";
import {
  TEXTO_DOCUMENTAL,
  consultasSubstituiveis,
  montarFicha,
} from "@/modules/documental/ui/ficha";
import { ConsultasPorCategoria } from "@/modules/documental/ui/ficha-documental";
import { RegistroDeConsulta } from "@/modules/documental/ui/formularios";
import { dependenciasDaLeitura } from "@/modules/offers/queries/dependencias";
import {
  lerConfiguracaoDaOferta,
  lerEstadosDocumentais,
} from "@/modules/offers/queries/ofertas";
import { validadeVencida } from "@/modules/offers/rules/transicoes";
import { ProximaEtapa } from "@/modules/offers/ui/navegacao";
import { motivoDaEtapaSoLeitura } from "@/modules/offers/ui/rotulos";

export const metadata: Metadata = { title: "Consultas da oferta" };

/**
 * Etapa 6: consultas (especificação v1.1, §6.3 e §9; ADR-0004 §2.7 a §2.9).
 * O fornecedor registra as consultas que fez, com a evidência opcional, nos
 * estados da tabela de edição; cada consulta mostra a própria origem, e a
 * evidência abre por botão, com registro do acesso. A carga comum responde
 * "Sem permissão" a quem não é da empresa e "Registro inexistente" à oferta
 * alheia ou inexistente; o carregamento e o erro ficam com `loading.tsx` e o
 * `error.tsx` do grupo.
 */
export default async function PaginaDasConsultas({
  params,
}: {
  readonly params: Promise<{ empresaId: string; ofertaId: string }>;
}) {
  const { empresaId, ofertaId } = await params;
  const carga = await carregarOferta(empresaId, ofertaId, "/consultas");
  if (!carga.ok) return carga.resposta;
  const { sessao, oferta, ator, base, vencidaAntesDaExpiracao } = carga;
  const [configuracao, estados, registros] = await Promise.all([
    lerConfiguracaoDaOferta(sessao),
    lerEstadosDocumentais(dependenciasDaLeitura(sessao), oferta.id),
    lerRegistrosDocumentais(sessao, oferta.id),
  ]);
  const pessoas = await listarPerfisPorId(
    sessao,
    pessoasDosRegistros(registros),
  );
  // A sessão do fornecedor lê os colegas de empresa; a equipe da plataforma aparece sem nome.
  const nomeDe = (perfilId: string): string | undefined => {
    const perfil = pessoas.get(perfilId);
    if (perfil === undefined) return undefined;
    return perfil.nome === "" ? (perfil.email ?? undefined) : perfil.nome;
  };
  const ficha = montarFicha(estados, registros, configuracao.categorias);
  const podeRegistrar = podeRegistrarConsulta(
    oferta.status,
    ator,
    validadeVencida(oferta.validaAte),
  );

  return (
    <PaginaDaOferta carga={carga} atual="consultas">
      <Secao titulo="6. Consultas">
        <p className="text-sm text-neutral-700">
          {TEXTO_DOCUMENTAL.introducaoDasConsultas}
        </p>
        <p className="text-sm text-neutral-700">
          {TEXTO_DOCUMENTAL.consultaReal}
        </p>
        <ConsultasPorCategoria
          ficha={ficha}
          nomeDe={nomeDe}
          abrirEvidencia={abrirEvidenciaAcao}
          vazio={TEXTO_DOCUMENTAL.consultasVazias}
        />
        <p className="text-sm text-neutral-700">
          {TEXTO_DOCUMENTAL.explicacaoDaOrigem}
        </p>
      </Secao>

      {podeRegistrar ? (
        <Secao titulo="Registrar consulta">
          <Aviso tom="alerta">{TEXTO_DOCUMENTAL.dadosDoProprietario}</Aviso>
          {oferta.status === "published" || oferta.status === "reserved" ? (
            <p className="text-sm text-neutral-700">
              {TEXTO_DOCUMENTAL.consultaGeraVersao}
            </p>
          ) : null}
          {configuracao.categorias.length === 0 ? (
            <Vazio>
              Nenhuma categoria documental configurada. Fale com a administração
              da plataforma.
            </Vazio>
          ) : (
            <RegistroDeConsulta
              ofertaId={oferta.id}
              categorias={configuracao.categorias.map(
                (categoria) =>
                  [categoria, rotuloDaCategoria(categoria)] as const,
              )}
              substituiveis={consultasSubstituiveis(ficha, "fornecedor")}
              dicaDaSubstituicao={
                TEXTO_DOCUMENTAL.dicaDaSubstituicaoDoFornecedor
              }
              acao={registrarConsultaAcao}
            />
          )}
        </Secao>
      ) : (
        <p className="text-sm text-neutral-700">
          {motivoDaEtapaSoLeitura(oferta.status, ator, vencidaAntesDaExpiracao)}
        </p>
      )}
      <ProximaEtapa base={base} atual="consultas" />
    </PaginaDaOferta>
  );
}
