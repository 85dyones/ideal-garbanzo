/**
 * Cliente do Supabase no navegador, só para o envio direto de arquivo ao
 * Storage (I3.11). Usa a chave publicável; o envio vale pelo token da URL
 * assinada que o servidor gerou depois de conferir a permissão.
 */
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let cliente: SupabaseClient | undefined;

export function clienteDoNavegador(): SupabaseClient {
  cliente ??= createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
  ) as SupabaseClient;
  return cliente;
}
