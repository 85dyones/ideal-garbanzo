/**
 * Apoio dos testes de integração da identidade (I1.4; ADR-0002 §3): usuários
 * reais criados pela API administrativa do Auth, login com senha e chamadas à
 * API (PostgREST e Storage) com o token do usuário.
 *
 * A chave secreta fica só neste arquivo, para criar usuários no preparo. Os
 * testes agem sempre com a chave publicável e a sessão de quem age. O
 * administrador da plataforma nasce pela conexão do banco, como no
 * 100-identidade-estrutura.test.sql: primeiro administrador, se não houver;
 * senão, concedido pelo administrador existente, com a sessão dele.
 *
 * Os dados ficam no banco de desenvolvimento até o próximo reset (usuários com
 * auditoria não podem ser apagados; ADR-0002 §2.8). O sufixo por execução
 * evita colisão com execuções anteriores.
 */
import { createHash, randomBytes, randomInt } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  carregarAmbiente,
  exigirVariaveis,
} from "../../../scripts/lib/ambiente.mjs";
import { conectar } from "../../../scripts/lib/banco.mjs";
import type { Database } from "./tipos-do-banco";

export type Cliente = SupabaseClient<Database>;
export type TipoDeEmpresa = "supplier" | "buyer" | "both";

/**
 * Domínio reservado (RFC 2606) dos e-mails de teste. O Auth do projeto de
 * desenvolvimento aceitou este domínio na sondagem do T2; se um dia recusar,
 * troque só aqui.
 */
export const DOMINIO_DE_TESTE = "repasse-teste.invalid";

/** Sufixo desta execução, nos e-mails, nomes, CNPJs e caminhos de arquivo. */
export const SUFIXO_DA_EXECUCAO = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;

export const BUCKET_DA_EVIDENCIA = "membership-evidence";

carregarAmbiente();
const variaveis = exigirVariaveis([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
]);
const URL_DA_API = variaveis.NEXT_PUBLIC_SUPABASE_URL ?? "";
const CHAVE_PUBLICAVEL = variaveis.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

const SEM_SESSAO_GUARDADA = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};

/** Cliente com a chave secreta: só para criar usuários no preparo. */
function clienteAdministrativo(): Cliente {
  return createClient<Database>(
    URL_DA_API,
    variaveis.SUPABASE_SECRET_KEY ?? "",
    SEM_SESSAO_GUARDADA,
  );
}

/** Cliente com a chave publicável e sem sessão (anônimo). */
export function clienteAnonimo(): Cliente {
  return createClient<Database>(
    URL_DA_API,
    CHAVE_PUBLICAVEL,
    SEM_SESSAO_GUARDADA,
  );
}

export interface UsuarioDeTeste {
  papel: string;
  id: string;
  email: string;
  senha: string;
}

interface RespostaDaApi {
  data: unknown;
  error: { message: string } | null;
}

/** Devolve os dados da resposta ou falha o preparo com o contexto e a mensagem da API. */
export function exigirDados<R extends RespostaDaApi>(
  resposta: R,
  contexto: string,
): NonNullable<R["data"]> {
  const erro = resposta.error;
  if (erro) {
    const codigo =
      "code" in erro && typeof erro.code === "string" ? `${erro.code} ` : "";
    throw new Error(`${contexto}: ${codigo}${erro.message}`);
  }
  const dados: R["data"] = resposta.data;
  if (dados === null || dados === undefined) {
    throw new Error(`${contexto}: resposta sem dados`);
  }
  return dados;
}

/** Usuário confirmado, criado pela API administrativa do Auth com senha gerada aqui. */
export async function criarUsuario(papel: string): Promise<UsuarioDeTeste> {
  const email = `${papel}-${SUFIXO_DA_EXECUCAO}@${DOMINIO_DE_TESTE}`;
  const senha = `${randomBytes(18).toString("base64url")}aA1!`;
  const { data, error } = await clienteAdministrativo().auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { full_name: `Teste ${papel}` },
  });
  if (error) {
    throw new Error(`O Auth recusou criar ${email}: ${error.message}`);
  }
  return { papel, id: data.user.id, email, senha };
}

/** Login com senha num cliente com a chave publicável; o token não é renovado sozinho. */
export async function entrar(usuario: UsuarioDeTeste): Promise<Cliente> {
  const cliente = createClient<Database>(
    URL_DA_API,
    CHAVE_PUBLICAVEL,
    SEM_SESSAO_GUARDADA,
  );
  const { error } = await cliente.auth.signInWithPassword({
    email: usuario.email,
    password: usuario.senha,
  });
  if (error) {
    throw new Error(`O login de ${usuario.email} falhou: ${error.message}`);
  }
  return cliente;
}

/** Token de acesso da sessão atual do cliente. */
export async function tokenAtual(cliente: Cliente): Promise<string> {
  const { data } = await cliente.auth.getSession();
  return data.session?.access_token ?? "";
}

/** Claims do token de acesso, sem verificar a assinatura (só leitura no teste). */
export function claimsDoToken(token: string): Record<string, unknown> {
  const carga: unknown = JSON.parse(
    Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"),
  );
  return typeof carga === "object" && carga !== null
    ? (carga as Record<string, unknown>)
    : {};
}

/**
 * Administrador da plataforma pela conexão do banco: o primeiro, se não houver
 * administrador ativo; senão, concedido pelo existente, com a sessão dele.
 */
export async function garantirAdministrador(
  usuario: UsuarioDeTeste,
): Promise<void> {
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
    if (existente) {
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

/** Papel concedido pelo administrador, pela API, com a sessão dele. */
export async function concederPapel(
  administrador: Cliente,
  perfilId: string,
  papel: "admin" | "operator",
): Promise<void> {
  exigirDados(
    await administrador
      .from("platform_staff")
      .insert({ profile_id: perfilId, role: papel })
      .select("id")
      .single(),
    `conceder ${papel}`,
  );
}

const ALFABETO_DO_CNPJ = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function digitoDoCnpj(valores: number[]): number {
  let soma = 0;
  let peso = 2;
  for (let i = valores.length - 1; i >= 0; i -= 1) {
    soma += (valores[i] ?? 0) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/**
 * CNPJ alfanumérico aleatório com dígitos verificadores válidos (mesma regra
 * de private.cnpj_valido): não colide com empresas de execuções anteriores.
 */
export function cnpjDeTeste(): string {
  const base = Array.from(
    { length: 12 },
    () => ALFABETO_DO_CNPJ[randomInt(ALFABETO_DO_CNPJ.length)] ?? "0",
  ).join("");
  // Valor de cada posição: código ASCII menos 48 (só 0-9 e A-Z aqui).
  const valores = Array.from(
    { length: base.length },
    (_, posicao) => base.charCodeAt(posicao) - 48,
  );
  const dv1 = digitoDoCnpj(valores);
  const dv2 = digitoDoCnpj([...valores, dv1]);
  return `${base}${String(dv1)}${String(dv2)}`;
}

/** Pedido de adesão enviado pelo requerente, com a sessão dele. Devolve o id. */
export async function enviarPedido(
  requerente: Cliente,
  nome: string,
  tipo: TipoDeEmpresa,
): Promise<string> {
  const pedido = exigirDados(
    await requerente
      .from("membership_applications")
      .insert({
        organization_name: nome,
        legal_name: `${nome} Ltda`,
        cnpj: cnpjDeTeste(),
        requested_kind: tipo,
      })
      .select("id")
      .single(),
    `enviar o pedido ${nome}`,
  );
  return pedido.id;
}

/** Caminho de arquivo de evidência do pedido, único nesta execução. */
export function caminhoDaEvidencia(pedidoId: string, nome: string): string {
  return `${pedidoId}/${nome}-${SUFIXO_DA_EXECUCAO}.pdf`;
}

/** Conteúdo de PDF mínimo para os arquivos de teste. */
export function conteudoDeTeste(rotulo: string): string {
  return `%PDF-1.4\n% evidencia de teste ${rotulo}\n`;
}

/** Envia o arquivo ao bucket e registra a evidência, como administrador. Devolve o id. */
export async function registrarEvidencia(
  administrador: Cliente,
  pedidoId: string,
): Promise<string> {
  const caminho = caminhoDaEvidencia(pedidoId, "consulta");
  const conteudo = conteudoDeTeste(caminho);
  exigirDados(
    await administrador.storage
      .from(BUCKET_DA_EVIDENCIA)
      .upload(caminho, new Blob([conteudo], { type: "application/pdf" }), {
        contentType: "application/pdf",
      }),
    `enviar o arquivo ${caminho}`,
  );
  const evidencia = exigirDados(
    await administrador
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
  return evidencia.id;
}

/** Aprovação pela API, com conferência, fonte e evidência. Devolve o id da empresa criada. */
export async function aprovarPedido(
  administrador: Cliente,
  pedidoId: string,
  evidenciaId: string,
): Promise<string> {
  const pedido = exigirDados(
    await administrador
      .from("membership_applications")
      .update({
        status: "approved",
        // Um minuto antes: o banco recusa conferência no futuro, e o relógio
        // desta máquina pode estar adiantado em relação ao do banco.
        cnpj_checked_at: new Date(Date.now() - 60_000).toISOString(),
        cnpj_check_source: "consulta de teste da integração",
        cnpj_check_evidence_id: evidenciaId,
      })
      .eq("id", pedidoId)
      .select("organization_id")
      .single(),
    `aprovar o pedido ${pedidoId}`,
  );
  if (!pedido.organization_id) {
    throw new Error(`A aprovação do pedido ${pedidoId} não criou empresa.`);
  }
  return pedido.organization_id;
}

/** Empresa pelo fluxo real: convite (fornecedora; ADR-0002 §9), pedido, arquivo, evidência e aprovação. */
export async function criarEmpresa(
  administrador: Cliente,
  requerente: Cliente,
  nome: string,
  tipo: TipoDeEmpresa,
): Promise<{ empresaId: string; pedidoId: string }> {
  if (tipo !== "buyer") {
    const { data } = await requerente.auth.getUser();
    exigirDados(
      await administrador
        .from("supplier_invitations")
        .insert({ email: data.user?.email ?? "" })
        .select("id")
        .single(),
      `convidar a fornecedora ${nome}`,
    );
  }
  const pedidoId = await enviarPedido(requerente, nome, tipo);
  const evidenciaId = await registrarEvidencia(administrador, pedidoId);
  const empresaId = await aprovarPedido(administrador, pedidoId, evidenciaId);
  return { empresaId, pedidoId };
}

/** Convite pela API, com a sessão de quem convida. Devolve o id do vínculo. */
export async function convidar(
  quemConvida: Cliente,
  empresaId: string,
  perfilId: string,
  papel: "org_admin" | "member",
): Promise<string> {
  const vinculo = exigirDados(
    await quemConvida
      .from("organization_members")
      .insert({ organization_id: empresaId, profile_id: perfilId, role: papel })
      .select("id")
      .single(),
    `convidar ${perfilId}`,
  );
  return vinculo.id;
}

/** Aceite do próprio convite, com a sessão do convidado. */
export async function aceitarConvite(
  convidado: Cliente,
  vinculoId: string,
): Promise<void> {
  exigirDados(
    await convidado
      .from("organization_members")
      .update({ status: "active" })
      .eq("id", vinculoId)
      .select("id")
      .single(),
    `aceitar o convite ${vinculoId}`,
  );
}
