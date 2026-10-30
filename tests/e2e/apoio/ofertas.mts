/**
 * Ofertas dos E2E da administração (I2.9) e do domínio documental (I3.6),
 * preparadas pela API com a sessão de quem age, como faria a tela: o
 * `org_admin` cria a oferta completa (`criar_oferta`), declara as dez
 * categorias e, se for o caso, envia à revisão; a plataforma publica com a
 * própria sessão. O banco decide cada passo, pelos mesmos
 * gatilhos das operações (ADR-0003 §2.15). Os passos repetem
 * `tests/integration/operacoes/ofertas.ts`, que não pode ser importado daqui
 * (ver `dados.mts`).
 *
 * Pré-requisito: `offer_review_required` = true e as dez categorias iniciais
 * em `document_categories` no banco de desenvolvimento.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUFIXO, sessaoSemTipos, type UsuarioDeTeste } from "./dados.mjs";

/** As dez categorias iniciais da §5.3 (`document_categories`). */
export const CATEGORIAS = [
  "debts_ipva",
  "debts_licensing",
  "debts_fines",
  "administrative_restrictions",
  "judicial_restrictions",
  "lien",
  "theft_recovery",
  "casualty",
  "auction",
  "transfer_conditions",
] as const;
export type CategoriaDeTeste = (typeof CATEGORIAS)[number];

export interface OfertaDeTeste {
  readonly id: string;
  /** Título da tela (`tituloDaOferta`): marca, modelo, versão e anos. */
  readonly titulo: string;
}

/** Dia (AAAA-MM-DD) daqui a `dias` dias, no horário de Brasília. */
function diaDaqui(dias: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date(Date.now() + dias * 86_400_000));
}

function exigirSemErro(
  erro: { readonly message: string } | null,
  passo: string,
): void {
  if (erro !== null) throw new Error(`${passo}: ${erro.message}`);
}

/**
 * Oferta completa em rascunho, do `org_admin` da empresa, com as dez
 * categorias declaradas: "sem ocorrência conhecida" em todas, menos as de
 * `ocorrencias`, declaradas com ocorrência e o detalhe dado. O rótulo entra na
 * versão do veículo, para o título ser único na lista. Ocorrência em
 * `transfer_conditions` gera o impedimento de transferência (P3).
 */
export async function ofertaEmRascunho(
  fornecedor: UsuarioDeTeste,
  empresaId: string,
  rotulo: string,
  ocorrencias: Partial<Record<CategoriaDeTeste, string>> = {},
): Promise<OfertaDeTeste> {
  return criarRascunho(
    await sessaoSemTipos(fornecedor),
    empresaId,
    rotulo,
    ocorrencias,
  );
}

/** O rascunho completo, com a sessão já aberta de quem cria. */
async function criarRascunho(
  sessao: SupabaseClient,
  empresaId: string,
  rotulo: string,
  ocorrencias: Partial<Record<CategoriaDeTeste, string>>,
): Promise<OfertaDeTeste> {
  const versao = `E2E ${rotulo} ${SUFIXO}`;
  const criada = await sessao.rpc("criar_oferta", {
    p_empresa: empresaId,
    p_veiculo: {
      make: "Fiat",
      model: "Argo",
      version: versao,
      manufacture_year: 2021,
      model_year: 2022,
      mileage_km: 45_000,
      fuel_type: "Flex",
      transmission: "Manual",
      color: "Prata",
      body_type: "Hatch",
      plate: "ABC1D23",
      renavam: "12345678900",
      chassis: "9BWZZZ377VT004251",
    },
    p_oferta: {
      asking_price: "65000.00",
      commercial_conditions: "À vista, com transferência pelo comprador.",
      location_city: "Campinas",
      location_state: "SP",
      valid_until: `${diaDaqui(10)} 23:59:59 America/Sao_Paulo`,
    },
  });
  exigirSemErro(criada.error, `criar a oferta ${rotulo}`);
  const ofertaId: unknown = criada.data;
  if (typeof ofertaId !== "string") {
    throw new Error(`criar a oferta ${rotulo}: resposta sem id`);
  }

  const declaradas = await sessao.from("supplier_declarations").insert(
    CATEGORIAS.map((categoria) => {
      const detalhe = ocorrencias[categoria];
      return detalhe === undefined
        ? {
            offer_id: ofertaId,
            category: categoria,
            declared_value: "no_known_occurrence",
          }
        : {
            offer_id: ofertaId,
            category: categoria,
            declared_value: "has_occurrence",
            detail: detalhe,
          };
    }),
  );
  exigirSemErro(declaradas.error, `declarar as categorias de ${rotulo}`);
  return { id: ofertaId, titulo: `Fiat Argo ${versao} 2021/2022` };
}

/** Oferta completa enviada à revisão pelo `org_admin` da empresa. */
export async function ofertaEmRevisao(
  fornecedor: UsuarioDeTeste,
  empresaId: string,
  rotulo: string,
): Promise<OfertaDeTeste> {
  const sessao = await sessaoSemTipos(fornecedor);
  const oferta = await criarRascunho(sessao, empresaId, rotulo, {});
  const ofertaId = oferta.id;
  const enviada = await sessao
    .from("offers")
    .update({
      status: "under_review",
      publication_authorized_by: fornecedor.id,
    })
    .eq("id", ofertaId)
    .eq("status", "draft")
    .select("id")
    .overrideTypes<{ id: string }[], { merge: false }>();
  exigirSemErro(enviada.error, `enviar ${rotulo} à revisão`);
  if (enviada.data?.length !== 1) {
    throw new Error(
      `enviar ${rotulo} à revisão: a oferta não mudou (o dev precisa de offer_review_required = true)`,
    );
  }
  return oferta;
}

/** A plataforma publica a oferta em revisão (T04), com a sessão de quem revisa. */
export async function publicarPelaPlataforma(
  revisor: UsuarioDeTeste,
  ofertaId: string,
): Promise<void> {
  const sessao = await sessaoSemTipos(revisor);
  const publicada = await sessao
    .from("offers")
    .update({ status: "published" })
    .eq("id", ofertaId)
    .eq("status", "under_review")
    .select("id")
    .overrideTypes<{ id: string }[], { merge: false }>();
  exigirSemErro(publicada.error, `publicar a oferta ${ofertaId}`);
  if (publicada.data?.length !== 1) {
    throw new Error(`publicar a oferta ${ofertaId}: a oferta não mudou`);
  }
}
