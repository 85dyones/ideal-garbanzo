/**
 * Documento da oferta: sem registro em `restricted_access_logs`, sem URL
 * (ADR-0003 §2.13 e §8, ACH-03).
 *
 * Os clientes são falsos e respondem só ao que `gerarUrlDoDocumento` pede: o
 * contexto do usuário, a linha do documento e a oferta, pela sessão; a
 * inclusão do registro e a URL assinada, pelo cliente administrativo. O
 * caminho real, com banco e Storage, está em
 * `tests/integration/ofertas-storage.test.ts`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Dependencias } from "@/lib/operacao/dependencias";
import {
  BUCKET_DOS_DOCUMENTOS,
  VALIDADE_DA_URL_DO_DOCUMENTO,
} from "./arquivos";
import { gerarUrlDoDocumento } from "./servidor";

const PERFIL = "e0000000-0000-4000-8000-000000000001";
const EMPRESA = "a0000000-0000-4000-8000-000000000001";
const OFERTA = "c0000000-0000-4000-8000-000000000001";
const DOCUMENTO = "d0000000-0000-4000-8000-000000000001";
const CAMINHO = `${EMPRESA}/${OFERTA}/f0000000-0000-4000-8000-000000000001.pdf`;
const URL_ASSINADA = "https://armazenamento.invalido/documento-assinado";

/** O que a sessão do usuário devolve em cada tabela lida. */
const LEITURAS: Readonly<Record<string, unknown>> = {
  profiles: { status: "active" },
  platform_staff: null,
  organization_members: [
    {
      id: "v1",
      organization_id: EMPRESA,
      role: "member",
      status: "active",
      organizations: { status: "active", kind: "supplier" },
    },
  ],
  offer_documents: { storage_path: CAMINHO, offer_id: OFERTA },
  offers: { id: OFERTA, supplier_organization_id: EMPRESA },
};

/** Consulta encadeável: `select`, `eq` e `maybeSingle` devolvem a própria consulta. */
function consulta(tabela: string) {
  const resposta = { data: LEITURAS[tabela] ?? null, error: null };
  const encadeada = {
    select: () => encadeada,
    eq: () => encadeada,
    maybeSingle: () => encadeada,
    overrideTypes: () => Promise.resolve(resposta),
  };
  return encadeada;
}

function sessaoFalsa(): SupabaseClient {
  const sessao = {
    auth: {
      getUser: () =>
        Promise.resolve({
          data: {
            user: { id: PERFIL, email_confirmed_at: "2026-10-01T00:00:00Z" },
          },
          error: null,
        }),
    },
    from: consulta,
  };
  return sessao as unknown as SupabaseClient;
}

interface Administrativo {
  readonly cliente: SupabaseClient;
  /** Passos do cliente administrativo, na ordem. */
  readonly passos: string[];
  readonly inclusoes: Record<string, unknown>[];
  readonly criarUrl: ReturnType<typeof vi.fn>;
}

/** Cliente administrativo falso; com `registroFalha`, a inclusão do registro devolve erro. */
function administrativoFalso(registroFalha: boolean): Administrativo {
  const passos: string[] = [];
  const inclusoes: Record<string, unknown>[] = [];
  const criarUrl = vi.fn((caminho: string, validade: number) => {
    passos.push(`url ${caminho} ${String(validade)}`);
    return Promise.resolve({
      data: { signedUrl: URL_ASSINADA },
      error: null,
    });
  });
  const cliente = {
    from: (tabela: string) => ({
      insert: (linha: Record<string, unknown>) => {
        passos.push(`inclusão ${tabela}`);
        inclusoes.push(linha);
        return Promise.resolve({
          error: registroFalha
            ? { code: "42501", message: "inclusão recusada" }
            : null,
        });
      },
    }),
    storage: {
      from: (bucket: string) => {
        passos.push(`bucket ${bucket}`);
        return { createSignedUrl: criarUrl };
      },
    },
  };
  return {
    cliente: cliente as unknown as SupabaseClient,
    passos,
    inclusoes,
    criarUrl,
  };
}

function dependenciasCom(administrativo: Administrativo): Dependencias {
  return {
    sessao: sessaoFalsa(),
    administrativo: () => administrativo.cliente,
    requestId: "req-ach-03",
  };
}

describe("URL do documento da oferta (ACH-03)", () => {
  it("o registro falha: a função devolve erro e a URL assinada nunca é pedida", async () => {
    const administrativo = administrativoFalso(true);
    const resultado = await gerarUrlDoDocumento(
      dependenciasCom(administrativo),
      { documentoId: DOCUMENTO },
    );
    expect(resultado).toMatchObject({ ok: false, erro: "falha" });
    // A recusa veio do registro, e não de uma falha anterior do cliente falso.
    expect(administrativo.inclusoes).toHaveLength(1);
    expect(administrativo.criarUrl).not.toHaveBeenCalled();
    expect(administrativo.passos).toEqual(["inclusão restricted_access_logs"]);
  });

  it("contraste: com o registro gravado, a URL sai, e o registro vem antes", async () => {
    const administrativo = administrativoFalso(false);
    const resultado = await gerarUrlDoDocumento(
      dependenciasCom(administrativo),
      { documentoId: DOCUMENTO },
    );
    expect(resultado).toEqual({
      ok: true,
      dados: {
        url: URL_ASSINADA,
        validadeEmSegundos: VALIDADE_DA_URL_DO_DOCUMENTO,
      },
    });
    expect(administrativo.criarUrl).toHaveBeenCalledTimes(1);
    expect(administrativo.passos).toEqual([
      "inclusão restricted_access_logs",
      `bucket ${BUCKET_DOS_DOCUMENTOS}`,
      `url ${CAMINHO} ${String(VALIDADE_DA_URL_DO_DOCUMENTO)}`,
    ]);
    expect(administrativo.inclusoes).toEqual([
      {
        actor_profile_id: PERFIL,
        actor_organization_id: EMPRESA,
        resource_type: "offer_document",
        resource_id: DOCUMENTO,
        request_id: "req-ach-03",
      },
    ]);
  });
});
