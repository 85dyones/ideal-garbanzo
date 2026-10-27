/**
 * Integração mínima (I0.5): API com as duas chaves e banco com TLS verificado.
 */
import { describe, expect, it } from "vitest";
import { conectar } from "../../scripts/lib/banco.mjs";

const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");

describe("conexão com o Supabase", () => {
  it("o Auth responde com a chave publicável", async () => {
    const resposta = await fetch(`${base}/auth/v1/health`, {
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
      },
    });
    expect(resposta.status).toBe(200);
  });

  it("a API REST aceita a chave secreta", async () => {
    const resposta = await fetch(`${base}/rest/v1/`, {
      headers: { apikey: process.env.SUPABASE_SECRET_KEY ?? "" },
    });
    expect(resposta.status).toBe(200);
  });

  it("o banco responde a uma consulta de leitura", async () => {
    const { cliente } = await conectar();
    try {
      const { rows } = await cliente.query<{ um: number }>("select 1 as um");
      expect(rows[0]?.um).toBe(1);
    } finally {
      await cliente.end();
    }
  });
});
