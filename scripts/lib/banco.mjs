/**
 * Conexão com o banco para reset e testes: confere o destino, usa TLS
 * verificado pela CA do Supabase quando o banco é remoto e garante uma
 * execução por vez com advisory lock.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { RAIZ, carregarAmbiente, exigirVariaveis } from "./ambiente.mjs";
import {
  carregarConfiguracao,
  lerDestino,
  verificarDestinoPermitido,
} from "./destino.mjs";

const CAMINHO_DA_CA = path.join(RAIZ, "supabase", "certs", "prod-ca-2021.crt");
/** Chave do advisory lock compartilhada por reset e testes. */
const CHAVE_DA_TRAVA = 7_310_027;

/** @returns {Promise<{ cliente: pg.Client, descricao: string }>} */
export async function conectar() {
  carregarAmbiente();
  const SUPABASE_DB_URL =
    exigirVariaveis(["SUPABASE_DB_URL"]).SUPABASE_DB_URL ?? "";
  const destino = lerDestino(SUPABASE_DB_URL);
  const permitido = verificarDestinoPermitido(
    destino,
    carregarConfiguracao(),
    process.env.SUPABASE_PROJECT_REF,
  );
  const cliente = new pg.Client({
    connectionString: SUPABASE_DB_URL,
    ssl: permitido.local
      ? false
      : { ca: readFileSync(CAMINHO_DA_CA, "utf8"), rejectUnauthorized: true },
    connectionTimeoutMillis: 15_000,
  });
  await cliente.connect();
  return { cliente, descricao: permitido.descricao };
}

/** Executa `tarefa` com a trava; espera até `esperaMs` se outra execução estiver em curso. */
export async function comTrava(cliente, tarefa, esperaMs = 60_000) {
  const limite = Date.now() + esperaMs;
  for (;;) {
    const { rows } = await cliente.query(
      "select pg_try_advisory_lock($1) as obtida",
      [CHAVE_DA_TRAVA],
    );
    if (rows[0].obtida) break;
    if (Date.now() > limite) {
      throw new Error(
        "Outra execução de reset ou de testes de banco está em andamento; tente de novo depois.",
      );
    }
    await new Promise((resolver) => setTimeout(resolver, 2_000));
  }
  try {
    return await tarefa();
  } finally {
    await cliente.query("select pg_advisory_unlock($1)", [CHAVE_DA_TRAVA]);
  }
}

/** Mensagem de erro sem URL de conexão nem senha. */
export function mensagemSegura(erro) {
  const texto = erro instanceof Error ? erro.message : String(erro);
  return texto.replace(/postgres(ql)?:\/\/\S+/g, "<url>");
}
