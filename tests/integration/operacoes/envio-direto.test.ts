/**
 * Envio direto de arquivo ao Storage (I3.11; ADR-0004 §10; R-AG-06).
 *
 * O arquivo não passa pela Server Action: o servidor prepara a URL assinada,
 * o cliente envia ao bucket com o token, e o servidor confere o arquivo no
 * bucket antes de gravar a linha. Os testes rodam em sequência.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import {
  enviarFotoDaOferta,
  prepararEnvioDaFoto,
  prepararEnvioDoDocumento,
} from "@/modules/offers/storage/servidor";
import {
  SUFIXO,
  comBanco,
  concederPapelNaPlataforma,
  criarUsuario,
  dependencias,
  empresaAprovada,
  enviarAoStorage,
  entrar,
  fotoDaOferta,
  pdfDeTeste,
} from "./apoio";

let f1: SupabaseClient;
let g1: SupabaseClient;
let empresaF = "";
let ofertaA = "";
let ofertaB = "";

const ASSINATURA_DO_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** PNG com a assinatura e o tamanho pedido, em bytes. */
function pngDe(tamanho: number): Uint8Array {
  const conteudo = new Uint8Array(tamanho);
  conteudo.set(ASSINATURA_DO_PNG);
  conteudo.set(new TextEncoder().encode(`envio direto ${SUFIXO}`), 8);
  return conteudo;
}

async function objetosNoCaminho(caminho: string): Promise<number> {
  return comBanco(async (cliente) => {
    const { rows } = await cliente.query<{ total: number }>(
      "select count(*)::int as total from storage.objects where bucket_id = 'offer-photos' and name = $1",
      [caminho],
    );
    return rows[0]?.total ?? -1;
  });
}

async function novaOferta(modelo: string): Promise<string> {
  const criada = await f1.rpc("criar_oferta", {
    p_empresa: empresaF,
    p_veiculo: { make: "Volkswagen", model: modelo },
    p_oferta: { location_city: "Campinas", location_state: "SP" },
  });
  if (criada.error !== null) throw new Error(criada.error.message);
  return criada.data as string;
}

beforeAll(async () => {
  const admin = await entrar(await criarUsuario("ed-admin"));
  f1 = await entrar(await criarUsuario("ed-f1"));
  g1 = await entrar(await criarUsuario("ed-g1"));
  await concederPapelNaPlataforma(
    (await admin.auth.getUser()).data.user?.id ?? "",
    "admin",
  );
  empresaF = await empresaAprovada(f1, admin, "supplier", "ED");
  await empresaAprovada(g1, admin, "supplier", "EG");
  ofertaA = await novaOferta("Gol");
  ofertaB = await novaOferta("Polo");
}, 120_000);

describe("envio direto ao Storage", () => {
  it("arquivo de 6 MB, acima do limite de corpo da Vercel, sobe e é registrado", async () => {
    const resultado = await fotoDaOferta(f1, ofertaA, pngDe(6 * 1024 * 1024));
    expect(resultado.ok).toBe(true);
  });

  it("o tamanho declarado acima de 10 MB é recusado no passo 1", async () => {
    const preparada = await prepararEnvioDaFoto(dependencias(f1), {
      ofertaId: ofertaA,
      tipoDoArquivo: "image/png",
      tamanho: 10 * 1024 * 1024 + 1,
    });
    expect(preparada).toMatchObject({ ok: false, erro: "entrada_invalida" });
  });

  it("outra empresa não recebe URL de envio para a oferta alheia", async () => {
    const preparada = await prepararEnvioDoDocumento(dependencias(g1), {
      ofertaId: ofertaA,
      tipoDoArquivo: "application/pdf",
      tamanho: pdfDeTeste().byteLength,
    });
    expect(preparada).toMatchObject({ ok: false, erro: "sem_permissao" });
  });

  it("conteúdo de outro tipo é recusado no passo 3 e apagado do bucket", async () => {
    const conteudo = pdfDeTeste();
    const caminho = await enviarAoStorage(
      f1,
      await prepararEnvioDaFoto(dependencias(f1), {
        ofertaId: ofertaA,
        tipoDoArquivo: "image/png",
        tamanho: conteudo.byteLength,
      }),
      conteudo,
      "image/png",
    );
    expect(await objetosNoCaminho(caminho)).toBe(1);
    const resultado = await enviarFotoDaOferta(dependencias(f1), {
      ofertaId: ofertaA,
      tipoDoArquivo: "image/png",
      caminho,
    });
    expect(resultado).toMatchObject({ ok: false, erro: "entrada_invalida" });
    expect(await objetosNoCaminho(caminho)).toBe(0);
  });

  it("o caminho de outra oferta não serve, nem da mesma empresa", async () => {
    const conteudo = pngDe(64);
    const caminho = await enviarAoStorage(
      f1,
      await prepararEnvioDaFoto(dependencias(f1), {
        ofertaId: ofertaA,
        tipoDoArquivo: "image/png",
        tamanho: conteudo.byteLength,
      }),
      conteudo,
      "image/png",
    );
    const resultado = await enviarFotoDaOferta(dependencias(f1), {
      ofertaId: ofertaB,
      tipoDoArquivo: "image/png",
      caminho,
    });
    expect(resultado).toMatchObject({ ok: false, erro: "sem_permissao" });
  });

  it("sem o envio, o passo 3 diz que o arquivo não chegou", async () => {
    const resultado = await enviarFotoDaOferta(dependencias(f1), {
      ofertaId: ofertaA,
      tipoDoArquivo: "image/png",
      caminho: `${empresaF}/${ofertaA}/00000000-0000-4000-8000-0000000000ed.png`,
    });
    expect(resultado).toMatchObject({
      ok: false,
      erro: "regra_violada",
      mensagem: "O arquivo não chegou ao armazenamento. Envie de novo.",
    });
  });
});
