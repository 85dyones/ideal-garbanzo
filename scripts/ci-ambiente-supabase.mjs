/**
 * CI: lê o `supabase status -o json` do Supabase efêmero e exporta as
 * variáveis do projeto para os passos seguintes ($GITHUB_ENV), mascarando
 * as chaves no log. Aceita os nomes novos e os antigos das chaves.
 *
 * Uso: node scripts/ci-ambiente-supabase.mjs <arquivo-do-status.json>
 */
import { appendFileSync, readFileSync } from "node:fs";

const status = JSON.parse(readFileSync(process.argv[2] ?? "", "utf8"));

/** @param {...string} nomes */
function pegar(...nomes) {
  for (const nome of nomes) {
    const chave = Object.keys(status).find((c) => c.toUpperCase() === nome);
    if (chave && status[chave]) return String(status[chave]);
  }
  return undefined;
}

const variaveis = {
  NEXT_PUBLIC_SUPABASE_URL: pegar("API_URL"),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: pegar("PUBLISHABLE_KEY", "ANON_KEY"),
  SUPABASE_SECRET_KEY: pegar("SECRET_KEY", "SERVICE_ROLE_KEY"),
  SUPABASE_DB_URL: pegar("DB_URL"),
};

const faltando = Object.entries(variaveis)
  .filter(([, valor]) => !valor)
  .map(([nome]) => nome);
if (faltando.length > 0) {
  console.error(
    `Faltam no status do Supabase: ${faltando.join(", ")}. Chaves disponíveis: ${Object.keys(status).join(", ")}`,
  );
  process.exit(1);
}

const destino = process.env.GITHUB_ENV;
if (!destino) {
  console.error("GITHUB_ENV não definido: este script é só para o CI.");
  process.exit(1);
}
for (const [nome, valor] of Object.entries(variaveis)) {
  if (nome !== "NEXT_PUBLIC_SUPABASE_URL") console.log(`::add-mask::${valor}`);
  appendFileSync(destino, `${nome}=${valor}\n`);
}
console.log(`Exportadas: ${Object.keys(variaveis).join(", ")}`);
