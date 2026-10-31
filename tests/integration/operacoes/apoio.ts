/**
 * Apoio dos testes de integração das operações de servidor (I1.5).
 *
 * Usuários reais criados pela API administrativa, login com senha e as
 * operações chamadas com a sessão de cada um. A chave secreta fica só aqui,
 * no preparo (ADR-0002 §2.12). Os dados ficam no banco de desenvolvimento até
 * o próximo reset; o sufixo por execução evita colisão.
 */
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Dependencias } from "@/lib/operacao/dependencias";
import { enviarPedidoDeAdesao } from "@/modules/membership/server/adesao";
import { convidarFornecedora } from "@/modules/membership/server/convites";
import {
  decidirPedido,
  enviarEvidencia,
  registrarConferencia,
} from "@/modules/membership/server/revisao";
import { conectar } from "../../../scripts/lib/banco.mjs";

const URL_DA_API = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const CHAVE_PUBLICAVEL = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const CHAVE_SECRETA = process.env.SUPABASE_SECRET_KEY ?? "";
const SEM_SESSAO_PERSISTIDA = {
  auth: { persistSession: false, autoRefreshToken: false },
} as const;

export const SUFIXO = `${String(Date.now())}${randomBytes(2).toString("hex")}`;

export interface UsuarioDeTeste {
  readonly id: string;
  readonly email: string;
  readonly senha: string;
}

let administrativo: SupabaseClient | undefined;

export function clienteAdministrativo(): SupabaseClient {
  administrativo ??= createClient(
    URL_DA_API,
    CHAVE_SECRETA,
    SEM_SESSAO_PERSISTIDA,
  ) as SupabaseClient;
  return administrativo;
}

export function emailDeTeste(papel: string): string {
  return `ops-${papel}-${SUFIXO}@repasse-teste.invalid`;
}

export async function criarUsuario(papel: string): Promise<UsuarioDeTeste> {
  const email = emailDeTeste(papel);
  const senha = randomBytes(18).toString("base64url");
  const { data, error } = await clienteAdministrativo().auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { full_name: `Teste ${papel}` },
  });
  if (error !== null) throw new Error(`createUser ${papel}: ${error.message}`);
  return { id: data.user.id, email, senha };
}

export async function entrar(usuario: UsuarioDeTeste): Promise<SupabaseClient> {
  const cliente = createClient(
    URL_DA_API,
    CHAVE_PUBLICAVEL,
    SEM_SESSAO_PERSISTIDA,
  ) as SupabaseClient;
  const { error } = await cliente.auth.signInWithPassword({
    email: usuario.email,
    password: usuario.senha,
  });
  if (error !== null)
    throw new Error(`login ${usuario.email}: ${error.message}`);
  return cliente;
}

let contador = 0;

export function dependencias(sessao: SupabaseClient): Dependencias {
  contador += 1;
  return {
    sessao,
    administrativo: clienteAdministrativo,
    requestId: `ops-${SUFIXO}-${String(contador)}`,
  };
}

/** Tabelas que o contexto do usuário lê em toda operação (`carregarContexto`). */
export const TABELAS_DO_CONTEXTO = [
  "profiles",
  "platform_staff",
  "organization_members",
];

export interface DependenciasEspiadas {
  readonly dependencias: Dependencias;
  /** Tabelas abertas pela sessão, na ordem. */
  readonly tabelas: string[];
  /** Funções chamadas pela sessão por RPC, na ordem. */
  readonly rpcs: string[];
  /** Quantas vezes a operação pediu o cliente da chave secreta. */
  readonly usosDaChaveSecreta: () => number;
}

/**
 * Dependências que registram as tabelas tocadas e o uso da chave secreta.
 * Servem para provar que a checagem do servidor recusou antes de escrever ou
 * de usar a chave secreta: com o banco também recusando, só o resultado não
 * distingue as camadas (ADR-0002 §3, uma camada de cada vez).
 */
export function dependenciasEspiadas(
  sessao: SupabaseClient,
): DependenciasEspiadas {
  const tabelas: string[] = [];
  const rpcs: string[] = [];
  let usos = 0;
  const espiada = new Proxy(sessao, {
    get(alvo, propriedade) {
      if (propriedade === "from") {
        return (tabela: string) => {
          tabelas.push(tabela);
          return alvo.from(tabela);
        };
      }
      if (propriedade === "rpc") {
        return (funcao: string, argumentos?: object) => {
          rpcs.push(funcao);
          return alvo.rpc(funcao, argumentos);
        };
      }
      const valor: unknown = Reflect.get(alvo, propriedade);
      return typeof valor === "function"
        ? (valor as (...argumentos: unknown[]) => unknown).bind(alvo)
        : valor;
    },
  });
  const base = dependencias(espiada);
  return {
    dependencias: {
      ...base,
      administrativo: () => {
        usos += 1;
        return base.administrativo();
      },
    },
    tabelas,
    rpcs,
    usosDaChaveSecreta: () => usos,
  };
}

type ClienteDoBanco = Awaited<ReturnType<typeof conectar>>["cliente"];

/** Conexão direta como `postgres` (ignora a RLS): só para preparar e conferir. */
export async function comBanco<T>(
  tarefa: (cliente: ClienteDoBanco) => Promise<T>,
): Promise<T> {
  const { cliente } = await conectar();
  try {
    return await tarefa(cliente);
  } finally {
    await cliente.end();
  }
}

/**
 * Concede papel na plataforma como o administrador ativo já existente ou,
 * sem nenhum, pelo caminho do primeiro administrador (ADR-0002 §2.13).
 */
export async function concederPapelNaPlataforma(
  perfilId: string,
  papel: "admin" | "operator",
): Promise<void> {
  await comBanco(async (cliente) => {
    await cliente.query("begin");
    try {
      const { rows } = await cliente.query<{ profile_id: string }>(
        `select s.profile_id from public.platform_staff s
         join public.profiles p on p.id = s.profile_id
         where s.role = 'admin' and s.status = 'active' and p.status = 'active'
         limit 1`,
      );
      const existente = rows[0]?.profile_id;
      if (existente !== undefined) {
        await cliente.query(
          "select set_config('request.jwt.claims', $1, true)",
          [JSON.stringify({ sub: existente, role: "authenticated" })],
        );
      } else if (papel !== "admin") {
        throw new Error("Sem administrador ativo para conceder o papel.");
      }
      await cliente.query(
        "insert into public.platform_staff (profile_id, role) values ($1, $2)",
        [perfilId, papel],
      );
      await cliente.query("commit");
    } catch (erro) {
      await cliente.query("rollback");
      throw erro;
    }
  });
}

/** Conteúdo mínimo com a assinatura de PDF. */
export function pdfDeTeste(): Uint8Array {
  return new TextEncoder().encode(`%PDF-1.4\n% evidência de teste ${SUFIXO}\n`);
}

/** CNPJ alfanumérico válido e único por execução (mesmo cálculo do banco). */
export function cnpjDeTeste(variante = "A"): string {
  const base = `${SUFIXO.slice(-6).toUpperCase()}${variante}B0001`.slice(0, 12);
  const valores = Array.from({ length: 12 }, (_, i) => base.charCodeAt(i) - 48);
  const dv = (lista: number[]) => {
    let soma = 0;
    let peso = 2;
    for (let i = lista.length - 1; i >= 0; i -= 1) {
      soma += (lista[i] ?? 0) * peso;
      peso = peso === 9 ? 2 : peso + 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const primeiro = dv(valores);
  const segundo = dv([...valores, primeiro]);
  return `${base}${String(primeiro)}${String(segundo)}`;
}

/**
 * Empresa pelo fluxo real das operações: convite de fornecedora (quando o tipo
 * não é só compradora; ADR-0002 §9), pedido do requerente, conferência,
 * evidência e aprovação pelo administrador. Devolve o id da empresa, com o
 * requerente como org_admin ativo.
 */
export async function empresaAprovada(
  requerente: SupabaseClient,
  administrador: SupabaseClient,
  tipo: "supplier" | "buyer" | "both",
  variante: string,
): Promise<string> {
  if (tipo !== "buyer") {
    const { data } = await requerente.auth.getUser();
    const convite = await convidarFornecedora(dependencias(administrador), {
      email: data.user?.email ?? "",
    });
    if (!convite.ok)
      throw new Error(`convite ${variante}: ${convite.mensagem}`);
  }
  const pedido = await enviarPedidoDeAdesao(dependencias(requerente), {
    nomeDaEmpresa: `Pátio ${variante} ${SUFIXO}`,
    razaoSocial: `Pátio ${variante} ${SUFIXO} Ltda`,
    cnpj: cnpjDeTeste(variante),
    tipo,
  });
  if (!pedido.ok) throw new Error(`pedido ${variante}: ${pedido.mensagem}`);
  const pedidoId = pedido.dados.pedidoId;
  const conferencia = await registrarConferencia(dependencias(administrador), {
    pedidoId,
    itens: [],
  });
  if (!conferencia.ok) throw new Error(`conferência ${variante}`);
  const evidencia = await enviarEvidencia(dependencias(administrador), {
    pedidoId,
    tipoDoArquivo: "application/pdf",
    conteudo: pdfDeTeste(),
  });
  if (!evidencia.ok) throw new Error(`evidência ${variante}`);
  const decisao = await decidirPedido(dependencias(administrador), {
    pedidoId,
    decisao: "aprovar",
    cnpjConferidoEm: new Date(Date.now() - 60_000).toISOString(),
    fonteDaConferencia: "consulta de teste",
    evidenciaId: evidencia.dados.evidenciaId,
    dadosDeTeste: true,
  });
  if (!decisao.ok || decisao.dados.organizationId === null) {
    throw new Error(`aprovação ${variante}`);
  }
  return decisao.dados.organizationId;
}
