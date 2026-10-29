/**
 * Dados dos E2E: usuários reais criados pela API administrativa do Auth,
 * administrador pela conexão do banco e empresas pelo fluxo real (pedido,
 * evidência e aprovação), como em `tests/integration/apoio/identidade.ts`.
 *
 * Por que não importar aquele arquivo: os E2E são ESM (`.mts`), porque o
 * Playwright, num pacote sem `"type": "module"`, transforma em CommonJS os
 * `.ts` e os `.mjs` importados por eles, e os scripts de `scripts/lib/` usam
 * `import.meta`. Os helpers da integração são `.ts` e importam esses scripts;
 * aqui a lógica é a mesma, com os scripts importados direto.
 *
 * A chave secreta fica neste processo de teste, só para o preparo; o
 * navegador usa a tela. As variáveis são lidas na primeira chamada, para
 * `playwright test --list` funcionar sem `.env`. Os dados ficam no banco de
 * desenvolvimento até o próximo reset (ADR-0002 §2.8).
 */
import { createHash, randomBytes, randomInt } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  carregarAmbiente,
  exigirVariaveis,
} from "../../../scripts/lib/ambiente.mjs";
import { conectar } from "../../../scripts/lib/banco.mjs";
import type { Database } from "../../integration/apoio/tipos-do-banco";

type Cliente = SupabaseClient<Database>;
export type TipoDeEmpresa = "supplier" | "buyer" | "both";

/** Domínio reservado (RFC 2606), o mesmo da integração. */
const DOMINIO_DE_TESTE = "repasse-teste.invalid";
const BUCKET_DA_EVIDENCIA = "membership-evidence";

/** Sufixo desta execução, nos e-mails, nomes e caminhos de arquivo. */
export const SUFIXO = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;

export interface UsuarioDeTeste {
  readonly id: string;
  readonly email: string;
  readonly senha: string;
}

interface Ambiente {
  readonly url: string;
  readonly chavePublicavel: string;
  readonly chaveSecreta: string;
}

let ambiente: Ambiente | undefined;

function lerAmbiente(): Ambiente {
  if (ambiente !== undefined) return ambiente;
  carregarAmbiente();
  const variaveis = exigirVariaveis([
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
  ]);
  ambiente = {
    url: variaveis.NEXT_PUBLIC_SUPABASE_URL ?? "",
    chavePublicavel: variaveis.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
    chaveSecreta: variaveis.SUPABASE_SECRET_KEY ?? "",
  };
  return ambiente;
}

const SEM_SESSAO_GUARDADA = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};

interface RespostaDaApi {
  data: unknown;
  error: { message: string; code?: string } | null;
}

function exigirDados<R extends RespostaDaApi>(
  resposta: R,
  contexto: string,
): NonNullable<R["data"]> {
  if (resposta.error !== null) {
    const codigo =
      resposta.error.code === undefined ? "" : `${resposta.error.code} `;
    throw new Error(`${contexto}: ${codigo}${resposta.error.message}`);
  }
  const dados: R["data"] = resposta.data;
  if (dados === null || dados === undefined) {
    throw new Error(`${contexto}: resposta sem dados`);
  }
  return dados;
}

/** Usuário com e-mail confirmado; com `administrador`, também administrador da plataforma. */
export async function novoUsuario(
  papel: string,
  administrador = false,
): Promise<UsuarioDeTeste> {
  const { url, chaveSecreta } = lerAmbiente();
  const email = `e2e-${papel}-${SUFIXO}@${DOMINIO_DE_TESTE}`;
  const senha = `${randomBytes(18).toString("base64url")}aA1!`;
  const { data, error } = await createClient<Database>(
    url,
    chaveSecreta,
    SEM_SESSAO_GUARDADA,
  ).auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { full_name: `Teste E2E ${papel}` },
  });
  if (error !== null) {
    throw new Error(`O Auth recusou criar ${email}: ${error.message}`);
  }
  const usuario = { id: data.user.id, email, senha };
  if (administrador) await tornarAdministrador(usuario);
  return usuario;
}

/**
 * Conta de cadastro ainda sem confirmação, com a senha de quem a criou, como
 * faria um cadastro direto na API do Auth (R8), sem mandar e-mail.
 */
export async function contaSemConfirmacao(
  papel: string,
): Promise<{ readonly email: string; readonly senha: string }> {
  const { url, chaveSecreta } = lerAmbiente();
  const email = `e2e-${papel}-${SUFIXO}@${DOMINIO_DE_TESTE}`;
  const senha = `${randomBytes(18).toString("base64url")}aA1!`;
  const { error } = await createClient<Database>(
    url,
    chaveSecreta,
    SEM_SESSAO_GUARDADA,
  ).auth.admin.createUser({ email, password: senha, email_confirm: false });
  if (error !== null) {
    throw new Error(`O Auth recusou criar ${email}: ${error.message}`);
  }
  return { email, senha };
}

/** `token_hash` de confirmação do cadastro, sem mandar e-mail e sem trocar a senha. */
export async function tokenDeCadastro(email: string): Promise<string> {
  const { url, chaveSecreta } = lerAmbiente();
  const resposta = await createClient<Database>(
    url,
    chaveSecreta,
    SEM_SESSAO_GUARDADA,
  ).auth.admin.generateLink({
    type: "signup",
    email,
    password: `${randomBytes(18).toString("base64url")}aA1!`,
  });
  const { properties } = exigirDados(resposta, "generateLink de cadastro");
  if (properties === null) {
    throw new Error("generateLink de cadastro: resposta sem token");
  }
  return properties.hashed_token;
}

/** Entrada pela API, fora do navegador, como faria outra pessoa ou outro aparelho. */
export async function entrarPelaApi(
  email: string,
  senha: string,
): Promise<{ readonly cliente: Cliente; readonly erro: string | null }> {
  const { url, chavePublicavel } = lerAmbiente();
  const cliente = createClient<Database>(
    url,
    chavePublicavel,
    SEM_SESSAO_GUARDADA,
  );
  const { error } = await cliente.auth.signInWithPassword({
    email,
    password: senha,
  });
  return { cliente, erro: error === null ? null : (error.code ?? "erro") };
}

/** `token_hash` de recuperação pela API administrativa, sem mandar e-mail. */
export async function tokenDeRecuperacao(email: string): Promise<string> {
  const { url, chaveSecreta } = lerAmbiente();
  const resposta = await createClient<Database>(
    url,
    chaveSecreta,
    SEM_SESSAO_GUARDADA,
  ).auth.admin.generateLink({ type: "recovery", email });
  const { properties } = exigirDados(resposta, "generateLink de recuperação");
  if (properties === null) {
    throw new Error("generateLink de recuperação: resposta sem token");
  }
  return properties.hashed_token;
}

/**
 * Administrador pela conexão do banco: o primeiro, se não houver administrador
 * ativo; senão, concedido pelo existente (ADR-0002 §2.13 e §3).
 */
async function tornarAdministrador(usuario: UsuarioDeTeste): Promise<void> {
  const { cliente } = await conectar();
  try {
    await cliente.query("begin");
    const { rows } = await cliente.query<{ profile_id: string }>(
      `select s.profile_id
       from public.platform_staff s join public.profiles p on p.id = s.profile_id
       where s.role = 'admin' and s.status = 'active' and p.status = 'active'
       limit 1`,
    );
    const existente = rows[0]?.profile_id;
    if (existente !== undefined) {
      await cliente.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: existente, role: "authenticated" }),
      ]);
    }
    await cliente.query(
      "insert into public.platform_staff (profile_id, role) values ($1, 'admin')",
      [usuario.id],
    );
    await cliente.query("commit");
  } catch (erro) {
    await cliente.query("rollback").catch(() => undefined);
    throw erro;
  } finally {
    await cliente.end();
  }
}

/** Login pela API, com a chave publicável. */
async function entrarNaApi(usuario: UsuarioDeTeste): Promise<Cliente> {
  const { url, chavePublicavel } = lerAmbiente();
  const cliente = createClient<Database>(
    url,
    chavePublicavel,
    SEM_SESSAO_GUARDADA,
  );
  const { error } = await cliente.auth.signInWithPassword({
    email: usuario.email,
    password: usuario.senha,
  });
  if (error !== null) {
    throw new Error(`O login de ${usuario.email} falhou: ${error.message}`);
  }
  return cliente;
}

function digitoDoCnpj(valores: readonly number[]): number {
  let soma = 0;
  let peso = 2;
  for (let i = valores.length - 1; i >= 0; i -= 1) {
    soma += (valores[i] ?? 0) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

const ALFABETO_DO_CNPJ = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** CNPJ alfanumérico aleatório com dígitos verificadores válidos (regra de `private.cnpj_valido`). */
export function novoCnpj(): string {
  const base = Array.from(
    { length: 12 },
    () => ALFABETO_DO_CNPJ[randomInt(ALFABETO_DO_CNPJ.length)] ?? "0",
  ).join("");
  const valores = Array.from(
    { length: base.length },
    (_, posicao) => base.charCodeAt(posicao) - 48,
  );
  const primeiro = digitoDoCnpj(valores);
  const segundo = digitoDoCnpj([...valores, primeiro]);
  return `${base}${String(primeiro)}${String(segundo)}`;
}

/** Pedido de adesão enviado pela API, com a sessão do requerente. Devolve o id. */
export async function pedidoDe(
  requerente: UsuarioDeTeste,
  nome: string,
  tipo: TipoDeEmpresa = "buyer",
): Promise<string> {
  const sessao = await entrarNaApi(requerente);
  const pedido = exigirDados(
    await sessao
      .from("membership_applications")
      .insert({
        organization_name: nome,
        legal_name: `${nome} Ltda`,
        cnpj: novoCnpj(),
        requested_kind: tipo,
      })
      .select("id")
      .single(),
    `enviar o pedido ${nome}`,
  );
  return pedido.id;
}

/** Empresa pelo fluxo real, com o dono como `org_admin` ativo. Devolve o id. */
export async function empresaDe(
  administrador: UsuarioDeTeste,
  dono: UsuarioDeTeste,
  nome: string,
  tipo: TipoDeEmpresa,
): Promise<string> {
  const pedidoId = await pedidoDe(dono, nome, tipo);
  const sessao = await entrarNaApi(administrador);
  const caminho = `${pedidoId}/consulta-e2e-${SUFIXO}.pdf`;
  const conteudo = `%PDF-1.4\n% evidencia de teste ${caminho}\n`;
  exigirDados(
    await sessao.storage
      .from(BUCKET_DA_EVIDENCIA)
      .upload(caminho, new Blob([conteudo], { type: "application/pdf" }), {
        contentType: "application/pdf",
      }),
    `enviar o arquivo ${caminho}`,
  );
  const evidencia = exigirDados(
    await sessao
      .from("membership_evidence_files")
      .insert({
        application_id: pedidoId,
        storage_path: caminho,
        sha256: createHash("sha256").update(conteudo).digest("hex"),
        content_type: "application/pdf",
        size_bytes: Buffer.byteLength(conteudo),
      })
      .select("id")
      .single(),
    `registrar a evidência ${caminho}`,
  );
  const aprovado = exigirDados(
    await sessao
      .from("membership_applications")
      .update({
        status: "approved",
        // Um minuto antes: o banco recusa conferência no futuro.
        cnpj_checked_at: new Date(Date.now() - 60_000).toISOString(),
        cnpj_check_source: "consulta de teste do E2E",
        cnpj_check_evidence_id: evidencia.id,
        is_test: true,
      })
      .eq("id", pedidoId)
      .select("organization_id")
      .single(),
    `aceitar o pedido ${pedidoId}`,
  );
  if (aprovado.organization_id === null) {
    throw new Error(`O aceite do pedido ${pedidoId} não criou empresa.`);
  }
  return aprovado.organization_id;
}

/**
 * Membro (`member`) ativo da empresa, como em
 * `tests/integration/apoio/identidade.ts`: convite pela API com a sessão do
 * `org_admin` e aceite com a sessão do convidado.
 */
export async function membroDe(
  dono: UsuarioDeTeste,
  empresaId: string,
  membro: UsuarioDeTeste,
): Promise<void> {
  const sessaoDoDono = await entrarNaApi(dono);
  const vinculo = exigirDados(
    await sessaoDoDono
      .from("organization_members")
      .insert({
        organization_id: empresaId,
        profile_id: membro.id,
        role: "member",
      })
      .select("id")
      .single(),
    `convidar ${membro.email}`,
  );
  const sessaoDoMembro = await entrarNaApi(membro);
  exigirDados(
    await sessaoDoMembro
      .from("organization_members")
      .update({ status: "active" })
      .eq("id", vinculo.id)
      .select("id")
      .single(),
    `aceitar o convite ${vinculo.id}`,
  );
}

/** Suspende a empresa pela API, com a sessão do administrador e o motivo da auditoria. */
export async function suspenderEmpresa(
  administrador: UsuarioDeTeste,
  empresaId: string,
): Promise<void> {
  const sessao = await entrarNaApi(administrador);
  exigirDados(
    await sessao
      .from("organizations")
      .update({ status: "suspended" })
      .eq("id", empresaId)
      .setHeader("x-audit-reason", "teste e2e: empresa suspensa")
      .select("id")
      .single(),
    `suspender a empresa ${empresaId}`,
  );
}
