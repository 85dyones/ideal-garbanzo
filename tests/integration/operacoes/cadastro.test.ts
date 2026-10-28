/**
 * R8 (ADR-0002 §8): cadastro prévio com e-mail alheio, pela API e sem mandar
 * e-mail. A conta nasce sem confirmação com a senha de quem chegou antes
 * (como faria um cadastro direto na API do Auth); o dono recebe o link de
 * confirmação (`generateLink`, que não troca a senha) e confirma; quem chegou
 * antes entra logo depois da confirmação, que é a corrida que a conclusão do
 * cadastro precisa cobrir.
 */
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { concluirConfirmacaoDoCadastro } from "@/modules/auth/server/cadastro";
import { clienteAdministrativo, emailDeTeste } from "./apoio";

function clientePublico(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  ) as SupabaseClient;
}

function senha(): string {
  return `${randomBytes(18).toString("base64url")}aA1!`;
}

interface Cenario {
  readonly email: string;
  readonly senhaDeQuemChegouAntes: string;
  readonly dono: SupabaseClient;
  readonly quemChegouAntes: SupabaseClient;
}

async function cenario(): Promise<Cenario> {
  const email = emailDeTeste(`r8-${randomBytes(3).toString("hex")}`);
  const senhaDeQuemChegouAntes = senha();
  const criada = await clienteAdministrativo().auth.admin.createUser({
    email,
    password: senhaDeQuemChegouAntes,
    email_confirm: false,
  });
  expect(criada.error).toBeNull();

  const link = await clienteAdministrativo().auth.admin.generateLink({
    type: "signup",
    email,
    password: senha(),
  });
  expect(link.error).toBeNull();
  const dono = clientePublico();
  const confirmacao = await dono.auth.verifyOtp({
    type: "signup",
    token_hash: link.data.properties?.hashed_token ?? "",
  });
  expect(confirmacao.error).toBeNull();

  const quemChegouAntes = clientePublico();
  const corrida = await quemChegouAntes.auth.signInWithPassword({
    email,
    password: senhaDeQuemChegouAntes,
  });
  expect(corrida.error).toBeNull();
  return { email, senhaDeQuemChegouAntes, dono, quemChegouAntes };
}

describe("R8: confirmação do cadastro", () => {
  it("contraste: sem a conclusão, a senha de quem cadastrou antes vale depois da confirmação", async () => {
    const { email, senhaDeQuemChegouAntes } = await cenario();
    const deNovo = await clientePublico().auth.signInWithPassword({
      email,
      password: senhaDeQuemChegouAntes,
    });
    expect(deNovo.error).toBeNull();
  });

  it("a conclusão tira a senha de quem cadastrou antes e encerra a sessão dele; a do dono continua", async () => {
    const { email, senhaDeQuemChegouAntes, dono, quemChegouAntes } =
      await cenario();
    expect(await concluirConfirmacaoDoCadastro(dono)).toBe(true);

    const deNovo = await clientePublico().auth.signInWithPassword({
      email,
      password: senhaDeQuemChegouAntes,
    });
    expect(deNovo.error?.code).toBe("invalid_credentials");
    const renovacao = await quemChegouAntes.auth.refreshSession();
    expect(renovacao.error).not.toBeNull();
    const doDono = await dono.auth.getUser();
    expect(doDono.error).toBeNull();
  });
});
