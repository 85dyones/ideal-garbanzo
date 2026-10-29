/**
 * Apoio dos testes de integração da oferta (I2.6): oferta completa pelas
 * operações de servidor, com a sessão do fornecedor.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Resultado } from "@/lib/operacao/resultado";
import { criarOferta } from "@/modules/offers/server/ofertas";
import {
  publicarOferta,
  revisarOferta,
} from "@/modules/offers/server/transicoes";
import { dependencias } from "./apoio";

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

/** Dia (AAAA-MM-DD) daqui a `dias` dias, no horário de Brasília. */
export function diaDaqui(dias: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date(Date.now() + dias * 86_400_000));
}

export const VEICULO_COMPLETO = {
  marca: "Fiat",
  modelo: "Argo",
  versao: "Drive 1.0",
  anoDeFabricacao: 2021,
  anoDoModelo: 2022,
  quilometragem: 45_000,
  combustivel: "Flex",
  cambio: "Manual",
  cor: "Prata",
  carroceria: "Hatch",
  placa: "ABC1D23",
  renavam: "12345678900",
  chassi: "9BWZZZ377VT004251",
} as const;

export function dadosCompletos() {
  return {
    preco: "65000.00",
    condicoesComerciais: "À vista, com transferência pelo comprador.",
    cidade: "São Paulo",
    uf: "SP",
    validaAte: diaDaqui(10),
  } as const;
}

/** Devolve os dados do sucesso ou lança com a mensagem da falha. */
export function exigir<T>(resultado: Resultado<T>, passo: string): T {
  if (!resultado.ok) {
    throw new Error(`${passo}: ${resultado.erro} ${resultado.mensagem}`);
  }
  return resultado.dados;
}

/** Declarações nas dez categorias, numa inclusão só, com a sessão do fornecedor. */
export async function declararTodas(
  sessao: SupabaseClient,
  ofertaId: string,
): Promise<void> {
  const { error } = await sessao.from("supplier_declarations").insert(
    CATEGORIAS.map((categoria) =>
      categoria === "auction"
        ? {
            offer_id: ofertaId,
            category: categoria,
            declared_value: "has_occurrence",
            detail: "Passagem por leilão em 2022.",
          }
        : {
            offer_id: ofertaId,
            category: categoria,
            declared_value:
              categoria === "lien" ? "unknown" : "no_known_occurrence",
          },
    ),
  );
  if (error !== null) throw new Error(`declarações: ${error.message}`);
}

/** Oferta em rascunho com tudo o que a publicação exige. */
export async function ofertaCompleta(
  sessao: SupabaseClient,
  empresaId: string,
): Promise<string> {
  const { ofertaId } = exigir(
    await criarOferta(dependencias(sessao), {
      empresaId,
      veiculo: VEICULO_COMPLETO,
      oferta: dadosCompletos(),
    }),
    "criar oferta",
  );
  await declararTodas(sessao, ofertaId);
  return ofertaId;
}

/**
 * Oferta publicada pelo caminho da revisão exigida (Q1): o fornecedor envia e
 * a plataforma publica.
 */
export async function ofertaPublicada(
  fornecedor: SupabaseClient,
  revisor: SupabaseClient,
  empresaId: string,
): Promise<string> {
  const ofertaId = await ofertaCompleta(fornecedor, empresaId);
  const enviada = exigir(
    await publicarOferta(dependencias(fornecedor), {
      ofertaId,
      autorizacaoDeDivulgacao: true,
    }),
    "envio",
  );
  if (enviada.status !== "under_review") {
    throw new Error("o dev precisa de offer_review_required = true (Q1)");
  }
  exigir(
    await revisarOferta(dependencias(revisor), {
      ofertaId,
      decisao: "publicar",
    }),
    "revisão",
  );
  return ofertaId;
}
