/**
 * Clientes do Supabase no servidor (I1.5; ADR-0002 §2.12; docs/ambiente.md).
 *
 * Só código de servidor importa este módulo: a chave secreta nunca vai para o
 * navegador. As operações não importam daqui; recebem as dependências prontas
 * (`src/lib/operacao/dependencias.ts`), o que as deixa testáveis fora do Next.
 */
import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Dependencias } from "@/lib/operacao/dependencias";
import { novoRequestId } from "@/modules/audit/server/rastreio";

function exigir(nome: string): string {
  const valor = process.env[nome];
  if (valor === undefined || valor === "") {
    throw new Error(
      `Variável de ambiente ausente: ${nome} (docs/ambiente.md).`,
    );
  }
  return valor;
}

/** Cliente com a sessão do usuário, lida e renovada nos cookies da requisição. */
export async function criarClienteDaSessao(): Promise<SupabaseClient> {
  const loja = await cookies();
  return createServerClient(
    exigir("NEXT_PUBLIC_SUPABASE_URL"),
    exigir("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    {
      cookies: {
        getAll() {
          return loja.getAll();
        },
        setAll(paraGravar) {
          try {
            for (const { name, value, options } of paraGravar) {
              loja.set(name, value, options);
            }
          } catch {
            // Em Server Component o Next não deixa gravar cookie; a renovação
            // da sessão fica com o proxy (I1.6).
          }
        },
      },
    },
  );
}

/** Cliente com a chave secreta; sem sessão persistida. */
export function criarClienteAdministrativo(): SupabaseClient {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- sem tipos gerados do banco, o createClient infere `any` no nome do schema
  return createClient(
    exigir("NEXT_PUBLIC_SUPABASE_URL"),
    exigir("SUPABASE_SECRET_KEY"),
    {
      db: { schema: "public" },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

/** Dependências das operações para a requisição atual. */
export async function criarDependencias(): Promise<Dependencias> {
  const sessao = await criarClienteDaSessao();
  let administrativo: SupabaseClient | undefined;
  return {
    sessao,
    administrativo: () => (administrativo ??= criarClienteAdministrativo()),
    requestId: novoRequestId(),
  };
}
