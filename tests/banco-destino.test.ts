/**
 * Trava de destino do banco (gate 12): reset e testes só no projeto de
 * desenvolvimento ou em banco local.
 */
import { describe, expect, it } from "vitest";
import {
  carregarConfiguracao,
  lerDestino,
  verificarApiDoDestino,
  verificarDestinoPermitido,
} from "../scripts/lib/destino.mjs";

const configuracao = carregarConfiguracao();
const DEV = "ralmlmuewullugeqtgoz";
const OUTRO = "abcdefghijklmnopqrst";

function verificar(url: string, refDeclarado?: string) {
  return verificarDestinoPermitido(lerDestino(url), configuracao, refDeclarado);
}

describe("trava de destino do banco", () => {
  it("aceita o pooler do projeto de desenvolvimento", () => {
    const resultado = verificar(
      `postgresql://postgres.${DEV}:senha@aws-1-sa-east-1.pooler.supabase.com:5432/postgres`,
      DEV,
    );
    expect(resultado.local).toBe(false);
  });

  it("aceita a conexão direta do projeto de desenvolvimento", () => {
    expect(
      verificar(
        `postgresql://postgres:senha@db.${DEV}.supabase.co:5432/postgres`,
      ).local,
    ).toBe(false);
  });

  it("aceita banco local (CI)", () => {
    expect(
      verificar("postgresql://postgres:postgres@127.0.0.1:54322/postgres")
        .local,
    ).toBe(true);
  });

  it("recusa outro projeto Supabase", () => {
    expect(() =>
      verificar(
        `postgresql://postgres.${OUTRO}:senha@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`,
      ),
    ).toThrow(/Destino recusado/);
    expect(() =>
      verificar(
        `postgresql://postgres:senha@db.${OUTRO}.supabase.co:5432/postgres`,
      ),
    ).toThrow(/Destino recusado/);
  });

  it("recusa host remoto que não é do Supabase", () => {
    expect(() =>
      verificar("postgresql://postgres:senha@banco.exemplo.com:5432/postgres"),
    ).toThrow(/Destino recusado/);
  });

  it("recusa SUPABASE_PROJECT_REF diferente do projeto da URL", () => {
    expect(() =>
      verificar(
        `postgresql://postgres.${DEV}:senha@aws-1-sa-east-1.pooler.supabase.com:5432/postgres`,
        OUTRO,
      ),
    ).toThrow(/não bate/);
  });

  it("recusa sslmode na URL, que anularia a verificação da CA", () => {
    expect(() =>
      verificar(
        `postgresql://postgres.${DEV}:senha@aws-1-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require`,
      ),
    ).toThrow(/sslmode/);
  });

  it("aceita a API do mesmo projeto e a API local com banco local", () => {
    expect(
      verificarApiDoDestino(
        `https://${DEV}.supabase.co/`,
        { local: false, ref: DEV },
        configuracao,
      ),
    ).toBe(`https://${DEV}.supabase.co`);
    expect(
      verificarApiDoDestino(
        "http://127.0.0.1:54321",
        { local: true, ref: null },
        configuracao,
      ),
    ).toBe("http://127.0.0.1:54321");
  });

  it("recusa API de outro projeto, sem TLS ou remota com banco local", () => {
    expect(() =>
      verificarApiDoDestino(
        `https://${OUTRO}.supabase.co`,
        { local: false, ref: DEV },
        configuracao,
      ),
    ).toThrow(/Destino recusado/);
    expect(() =>
      verificarApiDoDestino(
        `http://${DEV}.supabase.co`,
        { local: false, ref: DEV },
        configuracao,
      ),
    ).toThrow(/Destino recusado/);
    expect(() =>
      verificarApiDoDestino(
        `https://${DEV}.supabase.co`,
        { local: true, ref: null },
        configuracao,
      ),
    ).toThrow(/Destino recusado/);
  });

  it("explica URL inválida sem repetir a URL", () => {
    expect(() =>
      lerDestino("postgresql://postgres:a#b@host:5432/postgres"),
    ).toThrow(/Codifique a senha/);
    try {
      lerDestino("postgresql://postgres:segredo#x@host/db");
    } catch (erro) {
      expect(String(erro)).not.toContain("segredo");
    }
  });
});
