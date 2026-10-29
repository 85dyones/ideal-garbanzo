/**
 * Teste 6 da §7.4: arquivo privado da oferta não é obtido só pelo caminho
 * (ADR-0003 §2.13; anexo A.6, CT6.1 a CT6.7).
 *
 * Usuários reais, login com senha e as chamadas pela API do Storage com o
 * token de cada um. A parte de banco (políticas e conferência do objeto) está
 * no `340-ofertas-storage`; aqui ficam o endereço público, a URL temporária, o
 * registro de acesso e a remoção pela API, que o SQL direto não exercita.
 */
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import {
  BUCKET_DAS_FOTOS,
  BUCKET_DOS_DOCUMENTOS,
  VALIDADE_DA_URL_DO_DOCUMENTO,
} from "@/modules/offers/storage/arquivos";
import {
  enviarDocumentoDaOferta,
  enviarFotoDaOferta,
  gerarUrlDaFoto,
  gerarUrlDoDocumento,
} from "@/modules/offers/storage/servidor";
import {
  SUFIXO,
  clienteAdministrativo,
  comBanco,
  concederPapelNaPlataforma,
  criarUsuario,
  dependencias,
  dependenciasEspiadas,
  empresaAprovada,
  entrar,
  pdfDeTeste,
  type UsuarioDeTeste,
} from "./operacoes/apoio";

interface Pessoa {
  readonly usuario: UsuarioDeTeste;
  readonly sessao: SupabaseClient;
}

const URL_DA_API = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

async function pessoa(papel: string): Promise<Pessoa> {
  const usuario = await criarUsuario(`arq-${papel}`);
  return { usuario, sessao: await entrar(usuario) };
}

/** Conteúdo mínimo com a assinatura de PNG. */
function pngDeTeste(): Uint8Array {
  const assinatura = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const resto = new TextEncoder().encode(`foto de teste ${SUFIXO}`);
  return new Uint8Array([...assinatura, ...resto]);
}

async function registrosDeAcesso(
  documentoId: string,
  requestId: string,
): Promise<
  { actor_profile_id: string; actor_organization_id: string | null }[]
> {
  return comBanco(async (cliente) => {
    const { rows } = await cliente.query<{
      actor_profile_id: string;
      actor_organization_id: string | null;
    }>(
      `select actor_profile_id, actor_organization_id from public.restricted_access_logs
       where resource_type = 'offer_document' and resource_id = $1 and request_id = $2`,
      [documentoId, requestId],
    );
    return rows;
  });
}

let operador: Pessoa;
let f1: Pessoa;
let g1: Pessoa;
let c1: Pessoa;
let empresaF = "";
let ofertaR = "";
let fotoR = "";
let documentoR = "";
let caminhoDaFoto = "";
let caminhoDoDocumento = "";
const conteudoDoDocumento = pdfDeTeste();

beforeAll(async () => {
  const admin = await pessoa("admin");
  operador = await pessoa("operador");
  f1 = await pessoa("f1");
  g1 = await pessoa("g1");
  c1 = await pessoa("c1");
  await concederPapelNaPlataforma(admin.usuario.id, "admin");
  await concederPapelNaPlataforma(operador.usuario.id, "operator");
  empresaF = await empresaAprovada(f1.sessao, admin.sessao, "supplier", "F");
  await empresaAprovada(g1.sessao, admin.sessao, "supplier", "G");
  await empresaAprovada(c1.sessao, admin.sessao, "buyer", "C");
  // As sessões releem o vínculo no banco a cada operação; o token não muda.

  const criada = await f1.sessao.rpc("criar_oferta", {
    p_empresa: empresaF,
    p_veiculo: { make: "Volkswagen", model: "Gol" },
    p_oferta: { location_city: "Campinas", location_state: "SP" },
  });
  if (criada.error !== null) throw new Error(criada.error.message);
  ofertaR = criada.data as string;

  const foto = await enviarFotoDaOferta(dependencias(f1.sessao), {
    ofertaId: ofertaR,
    tipoDoArquivo: "image/png",
    conteudo: pngDeTeste(),
  });
  if (!foto.ok) throw new Error(`foto: ${foto.mensagem}`);
  fotoR = foto.dados.fotoId;
  const documento = await enviarDocumentoDaOferta(dependencias(f1.sessao), {
    ofertaId: ofertaR,
    tipo: "crlv",
    tipoDoArquivo: "application/pdf",
    conteudo: conteudoDoDocumento,
  });
  if (!documento.ok) throw new Error(`documento: ${documento.mensagem}`);
  documentoR = documento.dados.documentoId;

  const caminhos = await comBanco(async (cliente) => {
    const { rows } = await cliente.query<{ foto: string; documento: string }>(
      `select (select storage_path from public.offer_media where id = $1) as foto,
              (select storage_path from public.offer_documents where id = $2) as documento`,
      [fotoR, documentoR],
    );
    return rows[0];
  });
  caminhoDaFoto = caminhos?.foto ?? "";
  caminhoDoDocumento = caminhos?.documento ?? "";
}, 180_000);

describe("teste 6: arquivo privado da oferta", () => {
  it("contraste: o fornecedor envia foto e documento, com o sha256 calculado pelo servidor", async () => {
    expect(caminhoDaFoto).toMatch(
      new RegExp(`^${empresaF}/${ofertaR}/[0-9a-f-]{36}\\.png$`),
    );
    const gravado = await comBanco(async (cliente) => {
      const { rows } = await cliente.query<{ sha256: string }>(
        "select sha256 from public.offer_documents where id = $1",
        [documentoR],
      );
      return rows[0]?.sha256;
    });
    expect(gravado).toBe(
      createHash("sha256").update(conteudoDoDocumento).digest("hex"),
    );
  });

  it("CT6.1: o endereço público não entrega a foto nem o documento", async () => {
    for (const [bucket, caminho] of [
      [BUCKET_DAS_FOTOS, caminhoDaFoto],
      [BUCKET_DOS_DOCUMENTOS, caminhoDoDocumento],
    ] as const) {
      const resposta = await fetch(
        `${URL_DA_API}/storage/v1/object/public/${bucket}/${caminho}`,
      );
      expect(resposta.ok).toBe(false);
    }
  });

  it("CT6.2: outra empresa não baixa pelo caminho, com o próprio token", async () => {
    const foto = await g1.sessao.storage
      .from(BUCKET_DAS_FOTOS)
      .download(caminhoDaFoto);
    expect(foto.data).toBeNull();
    const documento = await g1.sessao.storage
      .from(BUCKET_DOS_DOCUMENTOS)
      .download(caminhoDoDocumento);
    expect(documento.data).toBeNull();
  });

  it("CT6.3: outra empresa não obtém URL temporária, nem pelo Storage nem pelo servidor", async () => {
    const direta = await g1.sessao.storage
      .from(BUCKET_DOS_DOCUMENTOS)
      .createSignedUrl(caminhoDoDocumento, 60);
    expect(direta.data).toBeNull();

    const espia = dependenciasEspiadas(g1.sessao);
    const pelaOperacao = await gerarUrlDoDocumento(espia.dependencias, {
      documentoId: documentoR,
    });
    expect(pelaOperacao).toMatchObject({ ok: false, erro: "sem_permissao" });
    expect(espia.usosDaChaveSecreta()).toBe(0);
    expect(
      await registrosDeAcesso(documentoR, espia.dependencias.requestId),
    ).toEqual([]);

    const daFoto = await gerarUrlDaFoto(dependencias(g1.sessao), {
      fotoId: fotoR,
    });
    expect(daFoto).toMatchObject({ ok: false, erro: "sem_permissao" });
  });

  it("CT6.4: o comprador não baixa a foto nem o documento", async () => {
    const foto = await c1.sessao.storage
      .from(BUCKET_DAS_FOTOS)
      .download(caminhoDaFoto);
    expect(foto.data).toBeNull();
    const documento = await c1.sessao.storage
      .from(BUCKET_DOS_DOCUMENTOS)
      .download(caminhoDoDocumento);
    expect(documento.data).toBeNull();
  });

  it("CT6.5: outra empresa não lista o prefixo da oferta", async () => {
    for (const bucket of [BUCKET_DAS_FOTOS, BUCKET_DOS_DOCUMENTOS]) {
      const lista = await g1.sessao.storage
        .from(bucket)
        .list(`${empresaF}/${ofertaR}`);
      expect(lista.data ?? []).toEqual([]);
    }
  });

  it("CT6.6: ninguém envia ao prefixo alheio, sobrescreve, move ou apaga", async () => {
    const alheio = await g1.sessao.storage
      .from(BUCKET_DAS_FOTOS)
      .upload(
        `${empresaF}/${ofertaR}/00000000-0000-4000-8000-0000000000c6.png`,
        pngDeTeste(),
        { contentType: "image/png", upsert: false },
      );
    expect(alheio.error).not.toBeNull();

    const sobrescrita = await f1.sessao.storage
      .from(BUCKET_DOS_DOCUMENTOS)
      .upload(caminhoDoDocumento, pdfDeTeste(), {
        contentType: "application/pdf",
        upsert: true,
      });
    expect(sobrescrita.error).not.toBeNull();

    const movida = await f1.sessao.storage
      .from(BUCKET_DAS_FOTOS)
      .move(caminhoDaFoto, `${caminhoDaFoto}.movida`);
    expect(movida.error).not.toBeNull();

    await f1.sessao.storage.from(BUCKET_DAS_FOTOS).remove([caminhoDaFoto]);
    await f1.sessao.storage
      .from(BUCKET_DOS_DOCUMENTOS)
      .remove([caminhoDoDocumento]);
    const restantes = await comBanco(async (cliente) => {
      const { rows } = await cliente.query<{ total: number }>(
        "select count(*)::int as total from storage.objects where name = any($1)",
        [[caminhoDaFoto, caminhoDoDocumento]],
      );
      return rows[0]?.total;
    });
    expect(restantes).toBe(2);
  });

  it("nem o dono baixa o documento direto pelo Storage: só pelo servidor, com registro", async () => {
    const download = await f1.sessao.storage
      .from(BUCKET_DOS_DOCUMENTOS)
      .download(caminhoDoDocumento);
    expect(download.data).toBeNull();
    const assinada = await f1.sessao.storage
      .from(BUCKET_DOS_DOCUMENTOS)
      .createSignedUrl(caminhoDoDocumento, 60);
    expect(assinada.data).toBeNull();
  });

  it("contraste: o dono obtém a URL do documento pelo servidor, com o registro gravado antes", async () => {
    const rastreio = dependencias(f1.sessao);
    const url = await gerarUrlDoDocumento(rastreio, {
      documentoId: documentoR,
    });
    expect(url.ok).toBe(true);
    if (!url.ok) return;
    expect(url.dados.validadeEmSegundos).toBe(VALIDADE_DA_URL_DO_DOCUMENTO);
    const resposta = await fetch(url.dados.url);
    expect(resposta.status).toBe(200);
    expect(new Uint8Array(await resposta.arrayBuffer())).toEqual(
      conteudoDoDocumento,
    );
    expect(await registrosDeAcesso(documentoR, rastreio.requestId)).toEqual([
      { actor_profile_id: f1.usuario.id, actor_organization_id: empresaF },
    ]);
  });

  it("contraste: o operador obtém a URL do documento, registrado sem empresa", async () => {
    const rastreio = dependencias(operador.sessao);
    const url = await gerarUrlDoDocumento(rastreio, {
      documentoId: documentoR,
    });
    expect(url.ok).toBe(true);
    expect(await registrosDeAcesso(documentoR, rastreio.requestId)).toEqual([
      { actor_profile_id: operador.usuario.id, actor_organization_id: null },
    ]);
  });

  it("contraste: o dono obtém a URL da foto com a própria sessão", async () => {
    const url = await gerarUrlDaFoto(dependencias(f1.sessao), {
      fotoId: fotoR,
    });
    expect(url.ok).toBe(true);
    if (!url.ok) return;
    const resposta = await fetch(url.dados.url);
    expect(resposta.status).toBe(200);
  });

  it("CT6.7: a URL temporária vencida é recusada", async () => {
    const curta = await clienteAdministrativo()
      .storage.from(BUCKET_DOS_DOCUMENTOS)
      .createSignedUrl(caminhoDoDocumento, 1);
    expect(curta.error).toBeNull();
    await new Promise((resolver) => setTimeout(resolver, 2_500));
    const resposta = await fetch(curta.data?.signedUrl ?? "");
    expect(resposta.ok).toBe(false);
  });

  it("Q3: o staff não envia arquivo, e o servidor recusa antes do Storage", async () => {
    const enviada = await enviarFotoDaOferta(dependencias(operador.sessao), {
      ofertaId: ofertaR,
      tipoDoArquivo: "image/png",
      conteudo: pngDeTeste(),
    });
    expect(enviada).toMatchObject({ ok: false, erro: "sem_permissao" });
  });

  it("o conteúdo precisa ter a assinatura do tipo declarado", async () => {
    const trocado = await enviarFotoDaOferta(dependencias(f1.sessao), {
      ofertaId: ofertaR,
      tipoDoArquivo: "image/png",
      conteudo: pdfDeTeste(),
    });
    expect(trocado).toMatchObject({ ok: false, erro: "entrada_invalida" });
  });

  it("B22: a foto removida não gera mais URL", async () => {
    const remocao = await f1.sessao
      .from("offer_media")
      .update({ removed_at: new Date().toISOString() })
      .eq("id", fotoR)
      .select("id");
    expect(remocao.error).toBeNull();
    const url = await gerarUrlDaFoto(dependencias(f1.sessao), {
      fotoId: fotoR,
    });
    expect(url).toMatchObject({ ok: false, erro: "sem_permissao" });
  });
});
