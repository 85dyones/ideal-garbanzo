/**
 * IP de quem faz a requisição: o primeiro item de `x-forwarded-for`, que o
 * proxy da hospedagem (Vercel) preenche com o endereço do cliente. Serve ao
 * limite de tentativas das ações de autenticação, que o T2 liga depois.
 * Sem o cabeçalho, `null`.
 */
const TAMANHO_MAXIMO = 64;

export function ipDoVisitante(cabecalhos: Headers): string | null {
  const primeiro = cabecalhos.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (primeiro === undefined || primeiro === "") return null;
  return primeiro.length > TAMANHO_MAXIMO ? null : primeiro;
}
